import { createSupabaseClient } from "../utils/supabase.js";
import { GeminiService } from "./gemini-service.js";
import { getConfig } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { AgentMemoryEntry, PerformanceInsight } from "../types/index.js";

interface MemorySearchResult extends AgentMemoryEntry {
  similarity: number;
  text_rank: number;
  combined_score: number;
}

interface StoreMemoryInput {
  category: AgentMemoryEntry["category"];
  content: Record<string, unknown>;
  contentText: string;
  relevanceTags?: string[];
  platform?: string;
  confidence?: number;
  sourceId?: string;
  expiresAt?: string;
}

/**
 * Hybrid memory system using Supabase pg_vector for semantic similarity
 * and full-text search for keyword matching.
 *
 * Stores and retrieves:
 * - Feedback instances (user edits, approvals, rejections)
 * - Post performance outcomes
 * - User preferences (learned from patterns)
 * - Content patterns (what works)
 * - Editing style guide (auto-generated)
 */
export class AgentMemoryService {
  private supabase = createSupabaseClient();
  private gemini: GeminiService;

  constructor(gemini: GeminiService) {
    this.gemini = gemini;
  }

  /**
   * Store a memory entry with vector embedding for semantic search.
   */
  async store(input: StoreMemoryInput): Promise<string> {
    let embedding: number[] | undefined;

    if (this.gemini.isAvailable) {
      try {
        embedding = await this.gemini.generateEmbedding(input.contentText);
      } catch (err) {
        logger.warn(`Failed to generate embedding for memory: ${err}`);
      }
    }

    const { data, error } = await this.supabase
      .from("agent_memory")
      .insert({
        category: input.category,
        content: input.content,
        content_text: input.contentText,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
        relevance_tags: input.relevanceTags || [],
        platform: input.platform,
        confidence: input.confidence ?? 1.0,
        source_id: input.sourceId,
        expires_at: input.expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to store memory: ${error.message}`);
    }

    logger.info(`Stored ${input.category} memory: ${data.id}`);
    return data.id;
  }

  /**
   * Search memory using hybrid vector + keyword approach.
   * Uses the database function search_agent_memory for efficient merging.
   */
  async search(
    query: string,
    options: {
      category?: AgentMemoryEntry["category"];
      platform?: string;
      limit?: number;
      vectorWeight?: number;
    } = {},
  ): Promise<MemorySearchResult[]> {
    const config = getConfig();
    const limit = options.limit || config.MEMORY_DEFAULT_LIMIT;
    const vectorWeight = options.vectorWeight ?? config.MEMORY_VECTOR_WEIGHT;

    // If Gemini is available, do hybrid search with embeddings
    if (this.gemini.isAvailable) {
      try {
        const queryEmbedding = await this.gemini.generateEmbedding(query);

        const { data, error } = await this.supabase.rpc("search_agent_memory", {
          query_embedding: `[${queryEmbedding.join(",")}]`,
          query_text: query,
          match_count: limit,
          vector_weight: vectorWeight,
          category_filter: options.category || null,
          platform_filter: options.platform || null,
        });

        if (error) {
          logger.warn(`Hybrid search failed, falling back to text search: ${error.message}`);
        } else if (data) {
          return data as MemorySearchResult[];
        }
      } catch (err) {
        logger.warn(`Embedding generation failed, falling back to text search: ${err}`);
      }
    }

    // Fallback: text-only search
    return this.textSearch(query, options);
  }

  /**
   * Text-only search fallback when embeddings aren't available.
   */
  private async textSearch(
    query: string,
    options: {
      category?: string;
      platform?: string;
      limit?: number;
    } = {},
  ): Promise<MemorySearchResult[]> {
    let queryBuilder = this.supabase
      .from("agent_memory")
      .select("*")
      .textSearch("content_text", query, { type: "websearch" })
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("created_at", { ascending: false })
      .limit(options.limit || 10);

    if (options.category) {
      queryBuilder = queryBuilder.eq("category", options.category);
    }
    if (options.platform) {
      queryBuilder = queryBuilder.or(`platform.is.null,platform.eq.${options.platform}`);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      logger.warn(`Text search failed: ${error.message}`);
      return [];
    }

    return (data || []).map((entry) => ({
      ...entry,
      similarity: 0,
      text_rank: 1,
      combined_score: 1,
    })) as MemorySearchResult[];
  }

  /**
   * Get recent memories by category.
   */
  async getRecent(
    category: AgentMemoryEntry["category"],
    limit: number = 5,
    platform?: string,
  ): Promise<AgentMemoryEntry[]> {
    let queryBuilder = this.supabase
      .from("agent_memory")
      .select("*")
      .eq("category", category)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (platform) {
      queryBuilder = queryBuilder.or(`platform.is.null,platform.eq.${platform}`);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      logger.warn(`Failed to get recent memories: ${error.message}`);
      return [];
    }

    return (data || []) as AgentMemoryEntry[];
  }

  /**
   * Store a feedback memory from user edits/approvals/rejections.
   */
  async recordFeedback(
    action: "edit" | "approve" | "reject" | "critique",
    details: {
      contentId: string;
      contentType: string;
      originalText?: string;
      editedText?: string;
      platform?: string;
      feedbackText?: string;
    },
  ): Promise<string> {
    const contentText = [
      `User ${action}ed a ${details.contentType} post.`,
      details.feedbackText ? `Feedback: ${details.feedbackText}` : "",
      details.originalText && details.editedText
        ? `Changed from: "${details.originalText.substring(0, 200)}" to: "${details.editedText.substring(0, 200)}"`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    return this.store({
      category: "feedback",
      content: {
        action,
        ...details,
      },
      contentText,
      relevanceTags: [action, details.contentType],
      platform: details.platform,
      sourceId: details.contentId,
    });
  }

  /**
   * Store a performance outcome linked to a content decision.
   */
  async recordPerformance(
    postId: string,
    metrics: {
      contentType: string;
      templateUsed?: string;
      platform: string;
      likes: number;
      retweets: number;
      comments: number;
      impressions: number;
      engagementRate: number;
      dayOfWeek: number;
      hourOfDay: number;
    },
  ): Promise<string> {
    const contentText = [
      `${metrics.contentType} post on ${metrics.platform}`,
      metrics.templateUsed ? `using ${metrics.templateUsed} template` : "",
      `posted on day ${metrics.dayOfWeek} at hour ${metrics.hourOfDay}`,
      `got ${metrics.likes} likes, ${metrics.retweets} retweets, ${metrics.comments} comments`,
      `${metrics.impressions} impressions, ${(metrics.engagementRate * 100).toFixed(1)}% engagement rate`,
    ].join(". ");

    return this.store({
      category: "performance",
      content: metrics,
      contentText,
      relevanceTags: [
        metrics.contentType,
        metrics.platform,
        metrics.templateUsed || "no-template",
      ],
      platform: metrics.platform,
      sourceId: postId,
    });
  }

  /**
   * Store a derived performance insight from Gemini analysis.
   */
  async storeInsight(insight: Omit<PerformanceInsight, "id">): Promise<string> {
    const { data, error } = await this.supabase
      .from("performance_insights")
      .insert({
        insight_text: insight.insight_text,
        insight_type: insight.insight_type,
        confidence: insight.confidence,
        applicable_to: insight.applicable_to,
        supporting_data: insight.supporting_data,
        is_active: insight.is_active,
        generated_at: insight.generated_at,
        expires_at: insight.expires_at,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to store insight: ${error.message}`);
    }

    // Also store in agent_memory for semantic search
    await this.store({
      category: "pattern",
      content: { insight_id: data.id, ...insight },
      contentText: insight.insight_text,
      relevanceTags: [
        insight.insight_type,
        insight.applicable_to.platform || "all",
        insight.applicable_to.content_type || "all",
      ].filter(Boolean),
      platform: insight.applicable_to.platform,
      confidence: insight.confidence,
    });

    return data.id;
  }

  /**
   * Get active performance insights, optionally filtered.
   */
  async getActiveInsights(filters?: {
    platform?: string;
    contentType?: string;
    insightType?: string;
    limit?: number;
  }): Promise<PerformanceInsight[]> {
    let queryBuilder = this.supabase
      .from("performance_insights")
      .select("*")
      .eq("is_active", true)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("confidence", { ascending: false })
      .limit(filters?.limit || 10);

    if (filters?.insightType) {
      queryBuilder = queryBuilder.eq("insight_type", filters.insightType);
    }

    const { data, error } = await queryBuilder;
    if (error) {
      logger.warn(`Failed to get insights: ${error.message}`);
      return [];
    }

    // Filter by applicable_to in memory (JSONB filtering is complex in PostgREST)
    let results = (data || []) as PerformanceInsight[];

    if (filters?.platform) {
      results = results.filter(
        (i) => !i.applicable_to.platform || i.applicable_to.platform === filters.platform,
      );
    }
    if (filters?.contentType) {
      results = results.filter(
        (i) => !i.applicable_to.content_type || i.applicable_to.content_type === filters.contentType,
      );
    }

    return results;
  }

  /**
   * Get the current style guide (most recent style_guide memory).
   */
  async getStyleGuide(): Promise<string | null> {
    const memories = await this.getRecent("style_guide", 1);
    if (memories.length === 0) return null;
    return memories[0].content_text;
  }

  /**
   * Clean up expired memories.
   */
  async cleanExpired(): Promise<number> {
    const { data, error } = await this.supabase
      .from("agent_memory")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .not("expires_at", "is", null)
      .select("id");

    if (error) {
      logger.warn(`Failed to clean expired memories: ${error.message}`);
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info(`Cleaned ${count} expired memories`);
    }
    return count;
  }
}

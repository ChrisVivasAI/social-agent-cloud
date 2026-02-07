import { createSupabaseClient } from "../utils/supabase.js";
import { GeminiService } from "./gemini-service.js";
import { getConfig } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type {
  AgentMemoryEntry,
  PerformanceInsight,
  EpisodeType,
  VoiceProfile,
} from "../types/index.js";

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
  episodeType?: EpisodeType;
  emotionalSalience?: number;
  sourceContent?: Record<string, unknown>;
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

    const insertRow: Record<string, unknown> = {
      category: input.category,
      content: input.content,
      content_text: input.contentText,
      embedding: embedding ? `[${embedding.join(",")}]` : null,
      relevance_tags: input.relevanceTags || [],
      platform: input.platform,
      confidence: input.confidence ?? 1.0,
      source_id: input.sourceId,
      expires_at: input.expiresAt,
    };

    if (input.episodeType) insertRow.episode_type = input.episodeType;
    if (input.emotionalSalience !== undefined) insertRow.emotional_salience = input.emotionalSalience;
    if (input.sourceContent) insertRow.source_content = input.sourceContent;

    const { data, error } = await this.supabase
      .from("agent_memory")
      .insert(insertRow)
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

    // Map action to episode type
    const episodeType: EpisodeType =
      action === "edit" ? "edit" :
      action === "approve" ? "approve" :
      action === "critique" ? "video_feedback" : "reject";

    // Calculate emotional salience: edits are higher signal than approvals
    const emotionalSalience =
      action === "edit" ? 0.8 :
      action === "critique" ? 0.9 :
      action === "reject" ? 0.7 : 0.4;

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
      episodeType,
      emotionalSalience,
      sourceContent: details.originalText && details.editedText
        ? { original: details.originalText, edited: details.editedText }
        : undefined,
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

  // ─── Voice Profile & Procedural Memory Methods ───

  /**
   * Record a raw episodic event with full context.
   */
  async recordEpisode(
    episodeType: EpisodeType,
    details: {
      contentText: string;
      content: Record<string, unknown>;
      platform?: string;
      sourceId?: string;
      emotionalSalience?: number;
      sourceContent?: Record<string, unknown>;
      relevanceTags?: string[];
    },
  ): Promise<string> {
    return this.store({
      category: "feedback",
      content: details.content,
      contentText: details.contentText,
      relevanceTags: [...(details.relevanceTags || []), episodeType],
      platform: details.platform,
      sourceId: details.sourceId,
      episodeType,
      emotionalSalience: details.emotionalSalience ?? 0.5,
      sourceContent: details.sourceContent,
    });
  }

  /**
   * Get the current voice profile (most recent style_guide with structured JSON).
   */
  async getVoiceProfile(): Promise<VoiceProfile | null> {
    const { data, error } = await this.supabase
      .from("agent_memory")
      .select("*")
      .eq("category", "style_guide")
      .containedBy("relevance_tags", ["voice_profile"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      // Fallback: try any style_guide entry with voice_profile tag
      const { data: fallback } = await this.supabase
        .from("agent_memory")
        .select("*")
        .eq("category", "style_guide")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!fallback || fallback.length === 0) return null;
      const content = fallback[0].content as Record<string, unknown>;
      return (content.voice_profile as VoiceProfile) || null;
    }

    const content = data[0].content as Record<string, unknown>;
    return (content.voice_profile as VoiceProfile) || null;
  }

  /**
   * Write or update the voice profile.
   */
  async storeVoiceProfile(profile: VoiceProfile): Promise<string> {
    const contentText = [
      `Voice profile (confidence: ${(profile.confidence * 100).toFixed(0)}%).`,
      `Tone: ${profile.general.tone}. Formality: ${profile.general.formality_level}.`,
      `Never do: ${profile.never_do.slice(0, 3).join(", ")}.`,
      `Always do: ${profile.always_do.slice(0, 3).join(", ")}.`,
    ].join(" ");

    return this.store({
      category: "style_guide",
      content: { voice_profile: profile },
      contentText,
      relevanceTags: ["voice_profile"],
      confidence: profile.confidence,
    });
  }

  /**
   * Store a procedural rule derived from repeated patterns.
   */
  async storeProcedural(rule: {
    ruleText: string;
    platform?: string;
    contentType?: string;
    confidence: number;
    supportingEpisodeCount: number;
  }): Promise<string> {
    return this.store({
      category: "pattern",
      content: {
        type: "procedural_rule",
        rule: rule.ruleText,
        content_type: rule.contentType,
        supporting_episodes: rule.supportingEpisodeCount,
      },
      contentText: rule.ruleText,
      relevanceTags: [
        "procedural_rule",
        rule.platform || "all",
        rule.contentType || "all",
      ].filter(Boolean),
      platform: rule.platform,
      confidence: rule.confidence,
    });
  }

  /**
   * Get active procedural rules for a given context.
   */
  async getProceduralRules(context?: {
    platform?: string;
    contentType?: string;
  }): Promise<AgentMemoryEntry[]> {
    let queryBuilder = this.supabase
      .from("agent_memory")
      .select("*")
      .eq("category", "pattern")
      .contains("relevance_tags", ["procedural_rule"])
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("confidence", { ascending: false })
      .limit(20);

    if (context?.platform) {
      queryBuilder = queryBuilder.or(
        `platform.is.null,platform.eq.${context.platform}`,
      );
    }

    const { data, error } = await queryBuilder;

    if (error) {
      logger.warn(`Failed to get procedural rules: ${error.message}`);
      return [];
    }

    let results = (data || []) as AgentMemoryEntry[];

    // Filter by content type tag if specified
    if (context?.contentType) {
      results = results.filter(
        (r) =>
          r.relevance_tags.includes("all") ||
          r.relevance_tags.includes(context.contentType!),
      );
    }

    return results;
  }

  /**
   * Get recent episodes by type for consolidation.
   */
  async getRecentEpisodes(
    episodeType?: EpisodeType,
    daysSince: number = 7,
  ): Promise<AgentMemoryEntry[]> {
    const since = new Date(
      Date.now() - daysSince * 24 * 60 * 60 * 1000,
    ).toISOString();

    let queryBuilder = this.supabase
      .from("agent_memory")
      .select("*")
      .eq("category", "feedback")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);

    if (episodeType) {
      queryBuilder = queryBuilder.eq("episode_type", episodeType);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      logger.warn(`Failed to get recent episodes: ${error.message}`);
      return [];
    }

    return (data || []) as AgentMemoryEntry[];
  }

  /**
   * Compress old episodes — truncate content_text but keep metadata.
   * Episodes older than `daysOld` with low emotional salience get compressed.
   */
  async compressOldEpisodes(daysOld: number = 30): Promise<number> {
    const cutoff = new Date(
      Date.now() - daysOld * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Find uncompressed old episodes with low salience
    const { data: oldEpisodes, error: fetchError } = await this.supabase
      .from("agent_memory")
      .select("id, content_text, episode_type, emotional_salience")
      .eq("category", "feedback")
      .lt("created_at", cutoff)
      .or("compressed.is.null,compressed.eq.false")
      .lt("emotional_salience", 0.7)
      .limit(50);

    if (fetchError || !oldEpisodes || oldEpisodes.length === 0) {
      return 0;
    }

    let compressed = 0;
    for (const episode of oldEpisodes) {
      const truncatedText = (episode.content_text as string).substring(0, 100) + "...";
      const { error: updateError } = await this.supabase
        .from("agent_memory")
        .update({
          content_text: truncatedText,
          compressed: true,
          source_content: null, // drop full diff to save space
        })
        .eq("id", episode.id);

      if (!updateError) compressed++;
    }

    if (compressed > 0) {
      logger.info(`Compressed ${compressed} old episodes`);
    }
    return compressed;
  }
}

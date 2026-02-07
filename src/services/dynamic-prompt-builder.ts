import { AgentMemoryService } from "./agent-memory.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import type {
  PerformanceInsight,
  AgentMemoryEntry,
  PostHistoryRecord,
  VoiceProfile,
} from "../types/index.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Replaces static prompts with dynamically constructed ones that include:
 * - Performance context (top posts, engagement stats)
 * - Audience insights (platform-specific preferences)
 * - User preferences (learned from feedback)
 * - Current state (queue, schedule gaps)
 * - Relevant memory (auto-queried based on task)
 * - Skill instructions (loaded from skills/*.md)
 */
export class DynamicPromptBuilder {
  private memory: AgentMemoryService;
  private supabase = createSupabaseClient();
  private skillsCache = new Map<string, string>();

  constructor(memory: AgentMemoryService) {
    this.memory = memory;
  }

  /**
   * Build a fully augmented prompt for content generation.
   */
  async buildContentGenerationPrompt(
    basePrompt: string,
    options: {
      contentType?: string;
      platform?: string;
      topic?: string;
      url?: string;
    } = {},
  ): Promise<string> {
    const sections: string[] = [basePrompt];

    // 1. Load skill instructions
    const skill = this.loadSkill("generate-content");
    if (skill) {
      sections.push(`\n<skill_instructions>\n${skill}\n</skill_instructions>`);
    }

    // 2. Get performance insights
    const insights = await this.memory.getActiveInsights({
      platform: options.platform,
      contentType: options.contentType,
      limit: 5,
    });

    if (insights.length > 0) {
      sections.push(this.formatInsightsSection(insights));
    }

    // 3. Get relevant memories
    const queryText = [
      options.contentType && `${options.contentType} content`,
      options.platform && `${options.platform} platform`,
      options.topic,
      "engagement performance preferences",
    ]
      .filter(Boolean)
      .join(" ");

    const memories = await this.memory.search(queryText, {
      platform: options.platform,
      limit: 5,
    });

    if (memories.length > 0) {
      sections.push(this.formatMemoriesSection(memories));
    }

    // 4. Get recent top-performing posts for reference
    const topPosts = await this.getTopRecentPosts(options.platform, 3);
    if (topPosts.length > 0) {
      sections.push(this.formatTopPostsSection(topPosts));
    }

    // 4b. RAG: retrieve semantically similar high-performing posted content
    const ragExamples = await this.retrieveRAGExamples(options);
    if (ragExamples.length > 0) {
      sections.push(this.formatRAGExamplesSection(ragExamples));
    }

    // 5. Inject voice profile (structured) — replaces raw style guide
    const voiceProfile = await this.memory.getVoiceProfile();
    if (voiceProfile) {
      sections.push(this.buildVoiceProfileSection(voiceProfile, options.platform));
    } else {
      // Fallback to raw style guide if no voice profile exists yet
      const styleGuide = await this.memory.getStyleGuide();
      if (styleGuide) {
        sections.push(`\n<style_guide>\n${styleGuide}\n</style_guide>`);
      }
    }

    // 6. Inject procedural rules as explicit instructions
    const rules = await this.memory.getProceduralRules({
      platform: options.platform,
      contentType: options.contentType,
    });
    if (rules.length > 0) {
      sections.push(this.formatProceduralRulesSection(rules));
    }

    // 7. User preferences from feedback patterns
    const preferences = await this.memory.getRecent("preference", 3, options.platform);
    if (preferences.length > 0) {
      sections.push(this.formatPreferencesSection(preferences));
    }

    return sections.join("\n");
  }

  /**
   * Build a prompt for template selection with performance data.
   */
  async buildTemplateSelectionPrompt(
    basePrompt: string,
    _report: string,
  ): Promise<string> {
    const sections: string[] = [basePrompt];

    const skill = this.loadSkill("select-template");
    if (skill) {
      sections.push(`\n<skill_instructions>\n${skill}\n</skill_instructions>`);
    }

    // Get template performance insights
    const templateInsights = await this.memory.getActiveInsights({
      insightType: "template_performance",
      limit: 5,
    });

    if (templateInsights.length > 0) {
      sections.push(
        "\n<template_performance>\nHistorical template performance data:\n" +
          templateInsights
            .map((i) => `- ${i.insight_text} (confidence: ${(i.confidence * 100).toFixed(0)}%)`)
            .join("\n") +
          "\n</template_performance>",
      );
    }

    // Get current week's content mix
    const contentMix = await this.getCurrentContentMix();
    sections.push(
      `\n<current_content_mix>\nPosts this week by type: ${JSON.stringify(contentMix)}\nAim for variety — avoid repeating the same template/type consecutively.\n</current_content_mix>`,
    );

    return sections.join("\n");
  }

  /**
   * Build a prompt for scheduling decisions.
   */
  async buildSchedulingPrompt(basePrompt: string): Promise<string> {
    const sections: string[] = [basePrompt];

    const skill = this.loadSkill("schedule-content");
    if (skill) {
      sections.push(`\n<skill_instructions>\n${skill}\n</skill_instructions>`);
    }

    const timingInsights = await this.memory.getActiveInsights({
      insightType: "timing_optimization",
      limit: 5,
    });

    if (timingInsights.length > 0) {
      sections.push(
        "\n<timing_insights>\n" +
          timingInsights.map((i) => `- ${i.insight_text}`).join("\n") +
          "\n</timing_insights>",
      );
    }

    return sections.join("\n");
  }

  /**
   * Build a prompt for content discovery evaluation.
   */
  async buildDiscoveryPrompt(basePrompt: string): Promise<string> {
    const sections: string[] = [basePrompt];

    const skill = this.loadSkill("discover-content");
    if (skill) {
      sections.push(`\n<skill_instructions>\n${skill}\n</skill_instructions>`);
    }

    // Get topic performance insights
    const topicInsights = await this.memory.getActiveInsights({
      insightType: "topic_performance",
      limit: 5,
    });

    if (topicInsights.length > 0) {
      sections.push(
        "\n<topic_performance>\nTopics your audience responds to:\n" +
          topicInsights.map((i) => `- ${i.insight_text}`).join("\n") +
          "\n</topic_performance>",
      );
    }

    return sections.join("\n");
  }

  /**
   * Build a prompt for metrics analysis.
   */
  async buildAnalysisPrompt(
    metricsData: Record<string, unknown>[],
  ): Promise<string> {
    const skill = this.loadSkill("analyze-performance");
    const prompt = skill || "Analyze the following post performance metrics and extract actionable insights.";

    // Get existing insights for context (avoid repeating known patterns)
    const existingInsights = await this.memory.getActiveInsights({ limit: 10 });

    const sections: string[] = [prompt];

    if (existingInsights.length > 0) {
      sections.push(
        "\n<existing_insights>\nWe already know these patterns (don't repeat them unless with new evidence):\n" +
          existingInsights.map((i) => `- ${i.insight_text}`).join("\n") +
          "\n</existing_insights>",
      );
    }

    sections.push(
      `\n<metrics_data>\n${JSON.stringify(metricsData, null, 2)}\n</metrics_data>`,
    );

    return sections.join("\n");
  }

  /**
   * Build a prompt for video footage analysis.
   */
  async buildFootageAnalysisPrompt(): Promise<string> {
    const skill = this.loadSkill("analyze-footage");
    return skill || "Analyze this video footage and identify key moments, scenes, and emotional tone.";
  }

  /**
   * Build a prompt for video editing.
   */
  async buildVideoEditPrompt(
    goal: string,
    footageAnalysis: Record<string, unknown>,
  ): Promise<string> {
    const sections: string[] = [];

    const skill = this.loadSkill("create-edit");
    if (skill) {
      sections.push(skill);
    }

    // Belt-and-suspenders: always inject the canonical EDL schema inline
    // so the correct structure is present even if the skill file is stale
    sections.push(`
<edl_json_schema>
The EDL you output MUST conform to this exact JSON structure. Use these field names EXACTLY.

{
  "version": 1,
  "tracks": {
    "video": [
      {
        "id": "clip-1",
        "type": "video_clip",
        "source_asset_id": "<UUID from footage analysis>",
        "start_ms": 0,
        "duration_ms": 5000,
        "in_point_ms": 10000,
        "out_point_ms": 15000,
        "properties": { "speed": 1 },
        "narrative_role": "hook",
        "reasoning": "Why this clip was chosen"
      }
    ],
    "audio": [
      {
        "id": "vo-1",
        "type": "audio",
        "start_ms": 0,
        "duration_ms": 15000,
        "properties": {
          "volume": 1,
          "text": "Full voiceover narration script here"
        },
        "narrative_role": "buildup",
        "reasoning": "Narration for the edit"
      }
    ],
    "overlays": [
      {
        "id": "title-1",
        "type": "text_overlay",
        "start_ms": 0,
        "duration_ms": 3000,
        "properties": { "text": "Title", "font_size": 48, "position": { "x": 0.5, "y": 0.2 } },
        "narrative_role": "hook",
        "reasoning": "Title card"
      }
    ]
  },
  "total_duration_ms": 15000,
  "output_format": { "width": 1080, "height": 1920, "fps": 30, "codec": "h264" },
  "narrative_structure": [{ "role": "hook", "start_ms": 0, "end_ms": 3000 }],
  "metadata": {}
}

CRITICAL RULES:
- source_asset_id MUST be a UUID copied exactly from the footage analysis
- type for video clips MUST be "video_clip"
- narrative_role values: "hook", "buildup", "climax", "resolution" (NEVER "setup")
- All timestamps in MILLISECONDS
- Voiceover: add to tracks.audio with type "audio", properties.text set to the script, and NO source_url / NO source_asset_id — TTS is generated automatically
- DO NOT use: sequence_number, source, source_path, in_point, out_point, duration (without _ms), phase
</edl_json_schema>`);

    // Get editing style preferences (all recent, not just 1)
    const editingStyle = await this.memory.getRecent("editing_style", 5);
    if (editingStyle.length > 0) {
      sections.push(
        "\n<editing_style>\nLearned video editing preferences:\n" +
          editingStyle.map((s) => `- ${s.content_text}`).join("\n") +
          "\n</editing_style>",
      );
    }

    // Get video procedural rules
    const videoRules = await this.memory.getProceduralRules({
      contentType: "video_edit",
    });
    if (videoRules.length > 0) {
      sections.push(this.formatProceduralRulesSection(videoRules));
    }

    // Get audience preferences for video content
    const videoInsights = await this.memory.getActiveInsights({
      contentType: "video_edit",
      limit: 3,
    });

    if (videoInsights.length > 0) {
      sections.push(
        "\n<video_performance>\n" +
          videoInsights.map((i) => `- ${i.insight_text}`).join("\n") +
          "\n</video_performance>",
      );
    }

    sections.push(
      `\n<creative_direction>\nThis is the user's primary creative request — build the entire edit to serve this vision.\n\n${goal}\n</creative_direction>`,
      `\n<footage_analysis>\n${JSON.stringify(footageAnalysis, null, 2)}\n</footage_analysis>`,
    );

    return sections.join("\n");
  }

  /**
   * Build a prompt for weekly video idea generation.
   */
  async buildIdeaPitchPrompt(): Promise<string> {
    const sections: string[] = [];

    const skill = this.loadSkill("pitch-idea");
    if (skill) {
      sections.push(skill);
    }

    // Recent top-performing video content
    const topPosts = await this.getTopRecentPosts(undefined, 5);
    const videoPosts = topPosts.filter(
      (p) => p.content_type === "remotion" || p.content_type === "video" || p.content_type === "video_edit",
    );

    if (videoPosts.length > 0) {
      sections.push(
        "\n<recent_top_videos>\n" +
          videoPosts
            .map((p) => `- ${p.post_text.substring(0, 100)} (${p.likes} likes, ${p.platform})`)
            .join("\n") +
          "\n</recent_top_videos>",
      );
    }

    // Audience preferences
    const audienceInsights = await this.memory.getActiveInsights({
      insightType: "audience_preference",
      limit: 5,
    });

    if (audienceInsights.length > 0) {
      sections.push(
        "\n<audience_preferences>\n" +
          audienceInsights.map((i) => `- ${i.insight_text}`).join("\n") +
          "\n</audience_preferences>",
      );
    }

    return sections.join("\n");
  }

  // ─── RAG Helpers ───

  /**
   * Retrieve semantically similar posted content from agent memory,
   * cross-referenced with post_history for engagement metrics.
   * Returns the top examples filtered by platform.
   */
  private async retrieveRAGExamples(
    options: {
      contentType?: string;
      platform?: string;
      topic?: string;
    } = {},
  ): Promise<
    Array<{
      postText: string;
      platform: string;
      contentType: string;
      likes: number;
      impressions: number;
      engagementRate: number;
    }>
  > {
    try {
      const queryText = [
        options.topic,
        options.contentType && `${options.contentType} content`,
        options.platform && `${options.platform} post`,
      ]
        .filter(Boolean)
        .join(" ");

      if (!queryText) return [];

      // Semantic search for similar posted content
      const candidates = await this.memory.search(queryText, {
        category: "posted_content",
        platform: options.platform,
        limit: 10,
      });

      if (candidates.length === 0) return [];

      // Get queue item IDs from the memory entries to look up metrics
      const queueItemIds = candidates
        .map((c) => (c.content as Record<string, unknown>).queue_item_id as string)
        .filter(Boolean);

      if (queueItemIds.length === 0) {
        // No queue item references — return post texts without metrics
        return candidates.slice(0, 5).map((c) => ({
          postText: c.content_text.substring(0, 300),
          platform: c.platform || options.platform || "unknown",
          contentType: (c.content as Record<string, unknown>).content_type as string || "unknown",
          likes: 0,
          impressions: 0,
          engagementRate: 0,
        }));
      }

      // Cross-reference with post_history for engagement metrics
      const { data: historyRows } = await this.supabase
        .from("post_history")
        .select("content_queue_id, platform, likes, impressions, engagement_rate")
        .in("content_queue_id", queueItemIds)
        .eq("metrics_pulled_24h", true);

      const metricsMap = new Map<string, { likes: number; impressions: number; engagementRate: number }>();
      for (const row of historyRows || []) {
        const key = `${row.content_queue_id}:${row.platform}`;
        metricsMap.set(key, {
          likes: row.likes || 0,
          impressions: row.impressions || 0,
          engagementRate: row.engagement_rate || 0,
        });
      }

      // Merge and sort by engagement
      const results = candidates.map((c) => {
        const content = c.content as Record<string, unknown>;
        const queueId = content.queue_item_id as string;
        const plat = c.platform || options.platform || "unknown";
        const metrics = metricsMap.get(`${queueId}:${plat}`) || {
          likes: 0,
          impressions: 0,
          engagementRate: 0,
        };
        return {
          postText: c.content_text.substring(0, 300),
          platform: plat,
          contentType: (content.content_type as string) || "unknown",
          ...metrics,
        };
      });

      // Sort by likes descending, take top 5
      results.sort((a, b) => b.likes - a.likes);
      return results.slice(0, 5);
    } catch (err) {
      logger.warn(`RAG retrieval failed (non-critical): ${err}`);
      return [];
    }
  }

  private formatRAGExamplesSection(
    examples: Array<{
      postText: string;
      platform: string;
      contentType: string;
      likes: number;
      impressions: number;
      engagementRate: number;
    }>,
  ): string {
    const lines = examples.map((ex) => {
      const metrics =
        ex.likes > 0
          ? ` — ${ex.likes} likes, ${ex.impressions} impressions, ${(ex.engagementRate * 100).toFixed(1)}% engagement`
          : " — (metrics pending)";
      return `- [${ex.platform}/${ex.contentType}] "${ex.postText}"${metrics}`;
    });

    return (
      "\n<rag_examples>\nHere are examples of your best-performing posts on similar topics (use as inspiration, do not copy):\n" +
      lines.join("\n") +
      "\n</rag_examples>"
    );
  }

  // ─── Private Helpers ───

  /**
   * Format a voice profile into natural-language prompt instructions.
   */
  private buildVoiceProfileSection(
    profile: VoiceProfile,
    platform?: string,
  ): string {
    const lines: string[] = [
      "\n<voice_profile>",
      `Overall tone: ${profile.general.tone}`,
      `Formality: ${profile.general.formality_level}`,
      `Humor: ${profile.general.humor_style}`,
      `Sentence length: ${profile.general.sentence_length_preference}`,
      `Vocabulary: ${profile.general.vocabulary_level}`,
    ];

    // Platform-specific section
    if (platform === "twitter" || !platform) {
      lines.push(
        "",
        "Twitter style:",
        `- Max length: ${profile.twitter.max_length} chars`,
        `- Opening style: ${profile.twitter.opening_style}`,
        `- Emoji usage: ${profile.twitter.emoji_usage}`,
        `- Hashtag usage: ${profile.twitter.hashtag_usage}`,
        `- Thread preference: ${profile.twitter.thread_preference}`,
      );
    }

    if (platform === "linkedin" || !platform) {
      lines.push(
        "",
        "LinkedIn style:",
        `- Typical length: ${profile.linkedin.typical_length}`,
        `- Structure: ${profile.linkedin.structure}`,
        `- Tone: ${profile.linkedin.professional_vs_casual}`,
        `- CTA style: ${profile.linkedin.cta_style}`,
      );
    }

    // Topic framings
    const framings = Object.entries(profile.topics.preferred_framings);
    if (framings.length > 0) {
      lines.push("", "Topic framings:");
      for (const [topic, framing] of framings) {
        lines.push(`- ${topic}: ${framing}`);
      }
    }

    // Hard rules
    if (profile.never_do.length > 0) {
      lines.push("", "NEVER do:");
      for (const rule of profile.never_do) {
        lines.push(`- ${rule}`);
      }
    }
    if (profile.always_do.length > 0) {
      lines.push("", "ALWAYS do:");
      for (const rule of profile.always_do) {
        lines.push(`- ${rule}`);
      }
    }

    lines.push(
      "",
      `Profile confidence: ${(profile.confidence * 100).toFixed(0)}% (based on ${profile.episode_count} interactions)`,
      "</voice_profile>",
    );

    return lines.join("\n");
  }

  /**
   * Format procedural rules as explicit instructions.
   */
  private formatProceduralRulesSection(rules: AgentMemoryEntry[]): string {
    return (
      "\n<rules>\nLearned rules from user feedback (follow these strictly):\n" +
      rules.map((r) => `- ${r.content_text}`).join("\n") +
      "\n</rules>"
    );
  }

  private formatInsightsSection(insights: PerformanceInsight[]): string {
    return (
      "\n<performance_context>\nWhat we know about content performance:\n" +
      insights
        .map(
          (i) =>
            `- ${i.insight_text} (confidence: ${(i.confidence * 100).toFixed(0)}%, type: ${i.insight_type})`,
        )
        .join("\n") +
      "\nUse these insights to inform your decisions.\n</performance_context>"
    );
  }

  private formatMemoriesSection(memories: AgentMemoryEntry[]): string {
    return (
      "\n<relevant_context>\nRelevant context from past experience:\n" +
      memories
        .map((m) => `- [${m.category}] ${m.content_text.substring(0, 200)}`)
        .join("\n") +
      "\n</relevant_context>"
    );
  }

  private formatTopPostsSection(posts: PostHistoryRecord[]): string {
    return (
      "\n<top_recent_posts>\nYour top-performing recent posts (use as style reference):\n" +
      posts
        .map(
          (p) =>
            `- [${p.platform}] "${p.post_text.substring(0, 150)}" — ${p.likes} likes, ${p.impressions} impressions`,
        )
        .join("\n") +
      "\n</top_recent_posts>"
    );
  }

  private formatPreferencesSection(preferences: AgentMemoryEntry[]): string {
    return (
      "\n<user_preferences>\nLearned user preferences:\n" +
      preferences.map((p) => `- ${p.content_text.substring(0, 200)}`).join("\n") +
      "\n</user_preferences>"
    );
  }

  private async getTopRecentPosts(
    platform?: string,
    limit: number = 3,
  ): Promise<(PostHistoryRecord & { content_type?: string })[]> {
    try {
      let queryBuilder = this.supabase
        .from("post_history")
        .select("*")
        .eq("metrics_pulled_24h", true)
        .order("likes", { ascending: false })
        .limit(limit);

      if (platform) {
        queryBuilder = queryBuilder.eq("platform", platform);
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      queryBuilder = queryBuilder.gte("posted_at", thirtyDaysAgo);

      const { data } = await queryBuilder;
      return (data || []) as (PostHistoryRecord & { content_type?: string })[];
    } catch {
      return [];
    }
  }

  private async getCurrentContentMix(): Promise<Record<string, number>> {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const { data } = await this.supabase
        .from("post_history")
        .select("content_type")
        .gte("posted_at", monday.toISOString());

      const mix: Record<string, number> = {};
      for (const row of data || []) {
        const ct = (row as { content_type?: string }).content_type || "unknown";
        mix[ct] = (mix[ct] || 0) + 1;
      }
      return mix;
    } catch {
      return {};
    }
  }

  /**
   * Load a skill markdown file from the skills/ directory.
   */
  loadSkill(skillName: string): string | null {
    if (this.skillsCache.has(skillName)) {
      return this.skillsCache.get(skillName)!;
    }

    try {
      // Resolve from project root
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const projectRoot = join(currentDir, "..", "..");
      const skillPath = join(projectRoot, "skills", `${skillName}.md`);

      if (!existsSync(skillPath)) {
        return null;
      }

      const content = readFileSync(skillPath, "utf-8");
      this.skillsCache.set(skillName, content);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Clear the skills cache (useful when skills are updated).
   */
  clearSkillsCache(): void {
    this.skillsCache.clear();
  }
}

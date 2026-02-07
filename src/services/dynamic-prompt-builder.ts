import { AgentMemoryService } from "./agent-memory.js";
import { createSupabaseClient } from "../utils/supabase.js";
import type {
  PerformanceInsight,
  AgentMemoryEntry,
  PostHistoryRecord,
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

    // 5. Get style guide
    const styleGuide = await this.memory.getStyleGuide();
    if (styleGuide) {
      sections.push(`\n<style_guide>\n${styleGuide}\n</style_guide>`);
    }

    // 6. User preferences from feedback patterns
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

    // Get editing style preferences
    const editingStyle = await this.memory.getRecent("editing_style", 1);
    if (editingStyle.length > 0) {
      sections.push(
        `\n<editing_style>\n${editingStyle[0].content_text}\n</editing_style>`,
      );
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
      `\n<editing_goal>\n${goal}\n</editing_goal>`,
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

  // ─── Private Helpers ───

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

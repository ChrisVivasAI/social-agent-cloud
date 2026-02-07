import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { GeminiService } from "./gemini-service.js";
import { AgentMemoryService } from "./agent-memory.js";
import { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";
import { ContentQueueService } from "./content-queue.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import type { ContentQueueItem, PostHistoryRecord, PerformanceInsight } from "../types/index.js";

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastPostDate: string | null;
  totalPostsThisWeek: number;
  totalPostsThisMonth: number;
}

interface MorningBriefing {
  greeting: string;
  streakUpdate: string;
  todaysPlan: string;
  insightNugget: string;
  motivationalClose: string;
}

interface MilestoneEvent {
  type: "streak" | "total_posts" | "engagement" | "first_video" | "consistency" | "growth";
  title: string;
  description: string;
  value: number;
}

/**
 * Proactive Agent Personality System
 *
 * Makes the agent feel alive — not a tool that waits to be told what to do,
 * but a creative partner that shows up with ideas, encouragement, and insights.
 *
 * Features:
 * - Morning briefing with personality
 * - Posting streak tracking & gamification
 * - Trend surfing alerts
 * - Milestone celebrations
 * - Smart nudges based on user patterns
 * - Weekly retrospective with evolving voice
 */
export class ProactiveAgentService {
  private supabase = createSupabaseClient();

  constructor(
    private gemini: GeminiService,
    private memory: AgentMemoryService,
    private promptBuilder: DynamicPromptBuilder,
    private contentQueue: ContentQueueService,
    private webClient: WebClient,
    private channelId: string,
  ) {}

  // ─── Morning Briefing ───────────────────────────────────────────

  /**
   * Daily morning briefing — the agent's way of saying "good morning"
   * with context about the day ahead, streaks, and a motivational nudge.
   * Runs daily at 8:30 AM.
   */
  async sendMorningBriefing(): Promise<void> {
    try {
      const [streak, queueSummary, insights, recentPosts, personality] = await Promise.all([
        this.getStreakData(),
        this.contentQueue.getQueueSummary(),
        this.memory.getActiveInsights({ limit: 3 }),
        this.getRecentPosts(7),
        this.getPersonalityContext(),
      ]);

      const todayItems = await this.getTodayScheduledItems();
      const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

      const briefing = await this.generateBriefing({
        streak,
        queueSummary,
        insights,
        recentPosts,
        todayItems,
        dayOfWeek,
        personality,
      });

      const blocks = this.buildMorningBriefingBlocks(briefing, streak);

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: briefing.greeting,
        blocks,
      });

      logger.info("Sent morning briefing");
    } catch (error) {
      logger.error(`Failed to send morning briefing: ${error}`);
    }
  }

  private async generateBriefing(context: {
    streak: StreakData;
    queueSummary: { pending: number; awaiting_approval: number; ready: number; posted_today: number; generating?: number; paused?: number };
    insights: PerformanceInsight[];
    recentPosts: PostHistoryRecord[];
    todayItems: ContentQueueItem[];
    dayOfWeek: string;
    personality: string;
  }): Promise<MorningBriefing> {
    const skill = this.promptBuilder.loadSkill("proactive-partner");

    const prompt = `${skill || ""}

You are the social media agent's proactive personality. Generate a morning briefing.

${context.personality}

<context>
Day: ${context.dayOfWeek}
Posting streak: ${context.streak.currentStreak} days (longest ever: ${context.streak.longestStreak})
Last post: ${context.streak.lastPostDate || "never"}
Posts this week: ${context.streak.totalPostsThisWeek}
Posts this month: ${context.streak.totalPostsThisMonth}

Queue status:
- Pending generation: ${context.queueSummary.pending}
- Awaiting approval: ${context.queueSummary.awaiting_approval}
- Ready to post: ${context.queueSummary.ready}
- Posted today: ${context.queueSummary.posted_today}

Scheduled for today: ${context.todayItems.length} items
${context.todayItems.map((i) => `  - ${i.type} for ${i.platform} at ${i.scheduled_for}`).join("\n")}

Recent performance insights:
${context.insights.map((i) => `- ${i.insight_text}`).join("\n") || "None yet — still learning!"}

Recent posts (last 7 days):
${context.recentPosts.slice(0, 5).map((p) => `- [${p.platform}] ${p.likes} likes, ${p.impressions} impressions`).join("\n") || "No posts in the last 7 days"}
</context>

Respond in JSON with these fields:
- greeting: A short, personality-driven greeting (1 sentence, reference the day or something current)
- streakUpdate: Fun streak update (1-2 sentences, use fire/lightning emojis if streak is going, or encouraging if broken)
- todaysPlan: What's on the agenda today (1-2 sentences, reference actual queue/schedule data)
- insightNugget: One interesting insight or learning from recent performance (1 sentence)
- motivationalClose: A punchy motivational closing line (1 sentence)

Be concise. Be fun. Be a partner, not a robot. No corporate talk.`;

    try {
      const result = await this.gemini.generateJSON<MorningBriefing>(
        prompt,
        "Generate the morning briefing.",
        { model: "flash", temperature: 1.2 },
      );
      return result;
    } catch (error) {
      logger.warn(`Gemini briefing generation failed, using fallback: ${error}`);
      return {
        greeting: `Good morning! Happy ${context.dayOfWeek}.`,
        streakUpdate: context.streak.currentStreak > 0
          ? `You're on a ${context.streak.currentStreak}-day posting streak!`
          : "Let's get that posting streak started today!",
        todaysPlan: context.todayItems.length > 0
          ? `${context.todayItems.length} post${context.todayItems.length > 1 ? "s" : ""} scheduled for today.`
          : "Nothing scheduled yet — want to queue something up?",
        insightNugget: "Still gathering data — every post teaches me something new about your audience.",
        motivationalClose: "Let's make today count.",
      };
    }
  }

  private buildMorningBriefingBlocks(
    briefing: MorningBriefing,
    streak: StreakData,
  ): KnownBlock[] {
    const streakEmoji = streak.currentStreak >= 7 ? ":fire:" :
                        streak.currentStreak >= 3 ? ":zap:" :
                        streak.currentStreak >= 1 ? ":seedling:" : ":new:";

    return [
      {
        type: "header",
        text: { type: "plain_text", text: `${streakEmoji} Morning Briefing`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: briefing.greeting },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Streak:* ${briefing.streakUpdate}` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: ":chart_with_upwards_trend: Stats", emoji: true },
          action_id: "proactive_view_stats",
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Today:* ${briefing.todaysPlan}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Insight:* ${briefing.insightNugget}` },
      },
      { type: "divider" },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `_${briefing.motivationalClose}_` },
          { type: "mrkdwn", text: `| Streak: *${streak.currentStreak}d* | This week: *${streak.totalPostsThisWeek}* | This month: *${streak.totalPostsThisMonth}*` },
        ],
      },
    ];
  }

  // ─── Smart Nudges ───────────────────────────────────────────────

  /**
   * Smart nudge — sent mid-afternoon if the user hasn't posted today
   * and there are items in the queue that need attention.
   * Learns the user's patterns to avoid being annoying.
   */
  async sendSmartNudge(): Promise<void> {
    try {
      const streak = await this.getStreakData();
      const today = new Date().toISOString().slice(0, 10);

      // Check if user already posted today
      const { data: todayPosts } = await this.supabase
        .from("post_history")
        .select("id")
        .gte("posted_at", `${today}T00:00:00Z`)
        .limit(1);

      if (todayPosts && todayPosts.length > 0) {
        logger.info("User already posted today — skipping nudge");
        return;
      }

      // Check for items needing attention
      const awaitingApproval = await this.contentQueue.getAwaitingApprovalItems();
      const { data: readyItems } = await this.supabase
        .from("content_queue")
        .select("*")
        .eq("status", "ready");

      if (awaitingApproval.length === 0 && (!readyItems || readyItems.length === 0)) {
        // Nothing actionable — send a softer nudge about creating content
        await this.sendCreativeNudge(streak);
        return;
      }

      const personality = await this.getPersonalityContext();

      const prompt = `${personality}

You're nudging the user in the afternoon. Be brief and helpful, not nagging.

Context:
- ${awaitingApproval.length} posts waiting for approval
- ${readyItems?.length || 0} posts ready to go
- Current streak: ${streak.currentStreak} days
- Streak at risk: ${streak.currentStreak > 0 ? "YES — will break if no post today!" : "no active streak"}

Write a SHORT Slack message (2-3 sentences max).
- If streak is at risk, mention it urgently but playfully
- Reference the specific items needing attention
- Include a clear call to action
- No corporate talk, be natural`;

    const nudgeText = await this.gemini.generateText(
      prompt,
      "Generate a smart nudge message.",
      { model: "flash", temperature: 1.0 },
    );

      const blocks: KnownBlock[] = [
        {
          type: "section",
          text: { type: "mrkdwn", text: nudgeText.trim() },
        },
      ];

      if (awaitingApproval.length > 0) {
        blocks.push({
          type: "actions",
          elements: awaitingApproval.slice(0, 3).map((item) => ({
            type: "button",
            text: { type: "plain_text", text: `Review: ${item.type}`, emoji: true },
            action_id: `proactive_review_${item.id}`,
            value: item.id,
          })),
        });
      }

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: nudgeText.trim(),
        blocks,
      });

      logger.info("Sent smart nudge");
    } catch (error) {
      logger.error(`Failed to send smart nudge: ${error}`);
    }
  }

  private async sendCreativeNudge(streak: StreakData): Promise<void> {
    // Only send if no active streak (otherwise user might just be taking a break)
    if (streak.currentStreak > 2) return;

    const personality = await this.getPersonalityContext();
    const memories = await this.memory.search("content ideas trending topics", { limit: 3 });

    const prompt = `${personality}

The user has nothing in the queue and hasn't posted today. Suggest they create something.

Context:
- No posts queued or awaiting approval
- Streak: ${streak.currentStreak} days

${memories.length > 0 ? `Recent interesting topics from memory:\n${memories.map((m) => `- ${m.content_text.substring(0, 100)}`).join("\n")}` : ""}

Write a SHORT creative nudge (2 sentences max). Suggest a content idea or remind them about a trending topic. Be inspiring, not nagging.`;

    try {
      const text = await this.gemini.generateText(
        prompt,
        "Generate a creative nudge.",
        { model: "flash", temperature: 1.2 },
      );

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: text.trim(),
      });

      logger.info("Sent creative nudge");
    } catch (error) {
      logger.warn(`Creative nudge failed: ${error}`);
    }
  }

  // ─── Milestone Celebrations ─────────────────────────────────────

  /**
   * Check for and celebrate milestones.
   * Runs every 30 minutes to catch achievements shortly after they happen.
   */
  async checkMilestones(): Promise<void> {
    try {
      const milestones = await this.detectMilestones();

      for (const milestone of milestones) {
        // Check if we already celebrated this
        const alreadyCelebrated = await this.hasCelebratedMilestone(milestone);
        if (alreadyCelebrated) continue;

        await this.celebrateMilestone(milestone);
        await this.recordMilestoneCelebration(milestone);
      }
    } catch (error) {
      logger.error(`Failed to check milestones: ${error}`);
    }
  }

  private async detectMilestones(): Promise<MilestoneEvent[]> {
    const milestones: MilestoneEvent[] = [];
    const streak = await this.getStreakData();

    // Streak milestones
    const streakThresholds = [3, 7, 14, 30, 60, 100];
    for (const threshold of streakThresholds) {
      if (streak.currentStreak === threshold) {
        milestones.push({
          type: "streak",
          title: `${threshold}-Day Streak!`,
          description: `You've posted ${threshold} days in a row!`,
          value: threshold,
        });
      }
    }

    // Total posts milestones
    const { count: totalPosts } = await this.supabase
      .from("post_history")
      .select("*", { count: "exact", head: true });

    const totalThresholds = [10, 25, 50, 100, 250, 500, 1000];
    for (const threshold of totalThresholds) {
      if (totalPosts === threshold) {
        milestones.push({
          type: "total_posts",
          title: `${threshold} Posts Published!`,
          description: `You've officially published ${threshold} posts across all platforms!`,
          value: threshold,
        });
      }
    }

    // Engagement milestones (check if any recent post crossed a likes threshold)
    const { data: recentHighPerformers } = await this.supabase
      .from("post_history")
      .select("*")
      .gte("posted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("likes", { ascending: false })
      .limit(1);

    if (recentHighPerformers && recentHighPerformers.length > 0) {
      const top = recentHighPerformers[0] as PostHistoryRecord;
      const engagementThresholds = [10, 25, 50, 100, 500];
      for (const threshold of engagementThresholds) {
        if (top.likes >= threshold && top.likes < threshold * 2) {
          milestones.push({
            type: "engagement",
            title: `${threshold}+ Likes on a Post!`,
            description: `Your recent ${top.platform} post just hit ${top.likes} likes!`,
            value: top.likes,
          });
          break;
        }
      }
    }

    // First video edit milestone
    const { count: videoEdits } = await this.supabase
      .from("content_queue")
      .select("*", { count: "exact", head: true })
      .eq("type", "video_edit")
      .eq("status", "posted");

    if (videoEdits === 1) {
      milestones.push({
        type: "first_video",
        title: "First AI Video Published!",
        description: "You just posted your first AI-edited video. The future is here.",
        value: 1,
      });
    }

    return milestones;
  }

  private async celebrateMilestone(milestone: MilestoneEvent): Promise<void> {
    const personality = await this.getPersonalityContext();

    const prompt = `${personality}

Celebrate this milestone! Be genuinely excited. Keep it SHORT (2-3 sentences max).

Milestone: ${milestone.title}
Details: ${milestone.description}
Value: ${milestone.value}

Write a celebration message with appropriate emojis. Make it feel like a real achievement.`;

    let celebrationText: string;
    try {
      celebrationText = await this.gemini.generateText(
        prompt,
        "Generate a milestone celebration.",
        { model: "flash", temperature: 1.3 },
      );
    } catch {
      celebrationText = `${milestone.title} ${milestone.description}`;
    }

    const emoji = milestone.type === "streak" ? ":fire:" :
                  milestone.type === "engagement" ? ":tada:" :
                  milestone.type === "total_posts" ? ":trophy:" :
                  milestone.type === "first_video" ? ":movie_camera:" : ":star:";

    const blocks: KnownBlock[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} Milestone Unlocked!`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: celebrationText.trim() },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `_${milestone.title} | ${milestone.description}_` },
        ],
      },
    ];

    await this.webClient.chat.postMessage({
      channel: this.channelId,
      text: `${emoji} ${milestone.title}`,
      blocks,
    });

    // Store in memory for future reference
    await this.memory.store({
      category: "pattern",
      content: { milestone_type: milestone.type, value: milestone.value, celebrated_at: new Date().toISOString() },
      contentText: `Celebrated milestone: ${milestone.title}. ${milestone.description}`,
      relevanceTags: ["milestone", milestone.type],
      confidence: 1.0,
    });

    logger.info(`Celebrated milestone: ${milestone.title}`);
  }

  private async hasCelebratedMilestone(milestone: MilestoneEvent): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const memories = await this.memory.search(
      `milestone ${milestone.type} ${milestone.value}`,
      { category: "pattern", limit: 1 },
    );

    return memories.some((m) => {
      const celebratedAt = (m.content as Record<string, unknown>).celebrated_at as string;
      return celebratedAt?.startsWith(today);
    });
  }

  private async recordMilestoneCelebration(milestone: MilestoneEvent): Promise<void> {
    // Record in a dedicated tracking table (or just memory for now)
    logger.info(`Recorded milestone celebration: ${milestone.type}=${milestone.value}`);
  }

  // ─── Trend Surfing Alerts ───────────────────────────────────────

  /**
   * Check for trending topics that align with the user's content niche.
   * Uses memory to understand what topics the user cares about.
   */
  async checkTrendAlerts(): Promise<void> {
    try {
      // Get user's content patterns from memory
      const topicPatterns = await this.memory.search(
        "topics themes audience engagement popular content",
        { limit: 5 },
      );

      const recentPosts = await this.getRecentPosts(14);
      const personality = await this.getPersonalityContext();

      const prompt = `${personality}

Analyze the user's recent content themes and suggest 1-2 timely content ideas they should jump on TODAY.

<recent_posts>
${recentPosts.slice(0, 5).map((p) => `- [${p.platform}] ${p.post_text.substring(0, 150)}`).join("\n") || "No recent posts"}
</recent_posts>

<content_patterns>
${topicPatterns.map((m) => `- ${m.content_text.substring(0, 150)}`).join("\n") || "Still learning user patterns"}
</content_patterns>

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

Think about:
- What's happening in tech/AI right now that aligns with their themes?
- Any seasonal/calendar opportunities?
- Emerging conversations their audience would care about?

Respond in JSON:
{
  "hasTrend": true/false,
  "alertText": "The trend alert message (2-3 sentences max, with a concrete content suggestion)",
  "suggestedTopic": "Brief topic summary"
}

Only set hasTrend=true if there's genuinely something worth posting about TODAY. Don't force it.`;

      const result = await this.gemini.generateJSON<{
        hasTrend: boolean;
        alertText: string;
        suggestedTopic: string;
      }>(prompt, "Check for trending topics.", { model: "flash", temperature: 1.0 });

      if (!result.hasTrend) {
        logger.info("No trend alerts to send");
        return;
      }

      const blocks: KnownBlock[] = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `:surfing_woman: *Trend Alert*\n${result.alertText}` },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: ":rocket: Create Post", emoji: true },
              style: "primary",
              action_id: "proactive_create_from_trend",
              value: result.suggestedTopic,
            },
            {
              type: "button",
              text: { type: "plain_text", text: ":x: Not Now", emoji: true },
              action_id: "proactive_dismiss_trend",
            },
          ],
        },
      ];

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: `:surfing_woman: Trend Alert: ${result.suggestedTopic}`,
        blocks,
      });

      logger.info(`Sent trend alert: ${result.suggestedTopic}`);
    } catch (error) {
      logger.error(`Failed to check trend alerts: ${error}`);
    }
  }

  // ─── Weekly Retrospective ───────────────────────────────────────

  /**
   * Weekly retro — Friday afternoon wrap-up of the week.
   * What worked, what didn't, what to try next week.
   */
  async sendWeeklyRetro(): Promise<void> {
    try {
      const weekPosts = await this.getRecentPosts(7);
      const insights = await this.memory.getActiveInsights({ limit: 10 });
      const streak = await this.getStreakData();
      const personality = await this.getPersonalityContext();

      // Aggregate week stats
      const weekStats = {
        totalPosts: weekPosts.length,
        totalLikes: weekPosts.reduce((sum, p) => sum + p.likes, 0),
        totalImpressions: weekPosts.reduce((sum, p) => sum + p.impressions, 0),
        avgEngagement: weekPosts.length > 0
          ? weekPosts.reduce((sum, p) => sum + p.engagement_rate, 0) / weekPosts.length
          : 0,
        topPost: weekPosts.sort((a, b) => b.likes - a.likes)[0] || null,
        platformBreakdown: this.getPlatformBreakdown(weekPosts),
      };

      const prompt = `${personality}

Generate a weekly retrospective for the social media agent. This is Friday's wrap-up.

<week_data>
Total posts: ${weekStats.totalPosts}
Total likes: ${weekStats.totalLikes}
Total impressions: ${weekStats.totalImpressions}
Avg engagement rate: ${(weekStats.avgEngagement * 100).toFixed(1)}%
Current streak: ${streak.currentStreak} days
Longest streak: ${streak.longestStreak} days

Platform breakdown:
${Object.entries(weekStats.platformBreakdown).map(([p, count]) => `  ${p}: ${count} posts`).join("\n")}

${weekStats.topPost ? `Top post: [${weekStats.topPost.platform}] ${weekStats.topPost.likes} likes — "${weekStats.topPost.post_text.substring(0, 100)}"` : "No posts this week"}

Active insights:
${insights.slice(0, 5).map((i) => `- ${i.insight_text}`).join("\n") || "Still building up data"}
</week_data>

Respond in JSON:
{
  "headline": "One-line week summary (fun, personality-driven)",
  "wins": ["List 1-3 wins from this week"],
  "learnings": ["List 1-2 things we learned"],
  "nextWeekSuggestion": "One concrete suggestion for next week (1 sentence)",
  "weekGrade": "A letter grade for the week (A+ to F) with a brief justification"
}

Be honest but encouraging. If it was a slow week, acknowledge it and motivate.`;

      const retro = await this.gemini.generateJSON<{
        headline: string;
        wins: string[];
        learnings: string[];
        nextWeekSuggestion: string;
        weekGrade: string;
      }>(prompt, "Generate weekly retro.", { model: "pro", temperature: 1.0 });

      const blocks: KnownBlock[] = [
        {
          type: "header",
          text: { type: "plain_text", text: ":chart_with_upwards_trend: Weekly Retro", emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*${retro.headline}*` },
        },
        { type: "divider" },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Posts:* ${weekStats.totalPosts}` },
            { type: "mrkdwn", text: `*Likes:* ${weekStats.totalLikes}` },
            { type: "mrkdwn", text: `*Impressions:* ${weekStats.totalImpressions.toLocaleString()}` },
            { type: "mrkdwn", text: `*Grade:* ${retro.weekGrade}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:trophy: *Wins*\n${retro.wins.map((w) => `- ${w}`).join("\n")}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:bulb: *Learnings*\n${retro.learnings.map((l) => `- ${l}`).join("\n")}`,
          },
        },
        { type: "divider" },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `:dart: *Next week:* ${retro.nextWeekSuggestion}` },
            { type: "mrkdwn", text: `| Streak: *${streak.currentStreak}d* | Longest: *${streak.longestStreak}d*` },
          ],
        },
      ];

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: `Weekly Retro: ${retro.headline}`,
        blocks,
      });

      // Store the retro in memory so the agent can reference it next week
      await this.memory.store({
        category: "performance",
        content: {
          type: "weekly_retro",
          week_of: new Date().toISOString().slice(0, 10),
          stats: weekStats,
          grade: retro.weekGrade,
          wins: retro.wins,
          learnings: retro.learnings,
        },
        contentText: `Weekly retro: ${retro.headline}. Grade: ${retro.weekGrade}. Wins: ${retro.wins.join("; ")}. Learnings: ${retro.learnings.join("; ")}`,
        relevanceTags: ["weekly_retro", "performance"],
        confidence: 1.0,
      });

      logger.info("Sent weekly retro");
    } catch (error) {
      logger.error(`Failed to send weekly retro: ${error}`);
    }
  }

  // ─── Post-Publish Celebration ───────────────────────────────────

  /**
   * Called after a successful post — sends a quick celebration and updates streak.
   */
  async onPostPublished(item: ContentQueueItem): Promise<void> {
    try {
      const streak = await this.getStreakData();
      const personality = await this.getPersonalityContext();

      // Only send celebration message for special moments (not every post)
      const isSpecial = streak.currentStreak >= 5 ||
                        streak.totalPostsThisWeek === 1 || // first post of the week
                        item.type === "video_edit"; // video posts are special

      if (!isSpecial) {
        logger.info("Post published — no special celebration needed");
        return;
      }

      const prompt = `${personality}

A post was just published! Send a quick 1-sentence celebration.

Context:
- Post type: ${item.type}
- Platform: ${item.platform}
- Streak: ${streak.currentStreak} days
- First post of the week: ${streak.totalPostsThisWeek === 1}
- Is a video: ${item.type === "video_edit" || item.type === "video" || item.type === "remotion"}

Keep it to ONE punchy sentence. Make it feel like a high-five from a friend.`;

      const text = await this.gemini.generateText(
        prompt,
        "Generate post celebration.",
        { model: "flash", temperature: 1.3 },
      );

      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: text.trim(),
        thread_ts: item.slack_review_ts || undefined,
      });
    } catch (error) {
      logger.warn(`Post celebration failed (non-critical): ${error}`);
    }
  }

  // ─── Personality Engine ─────────────────────────────────────────

  /**
   * Build personality context from accumulated memory and interactions.
   * The personality evolves as the agent learns the user's style.
   */
  private async getPersonalityContext(): Promise<string> {
    const styleGuide = await this.memory.getStyleGuide();
    const preferences = await this.memory.getRecent("preference", 3);
    const feedback = await this.memory.getRecent("feedback", 5);

    const sections: string[] = [
      "<personality>",
      "You are an encouraging, witty social media partner. Think creative director meets hype person.",
      "- Casual tone, no corporate jargon",
      "- Use emojis naturally but don't overdo it",
      "- Be honest — if performance is down, acknowledge it constructively",
      "- Reference specific data, not vague encouragement",
      "- Your vibe: supportive friend who also happens to know a lot about social media",
    ];

    if (styleGuide) {
      sections.push(`\nLearned voice style:\n${styleGuide.substring(0, 300)}`);
    }

    if (preferences.length > 0) {
      sections.push(`\nUser preferences:\n${preferences.map((p) => `- ${p.content_text.substring(0, 100)}`).join("\n")}`);
    }

    if (feedback.length > 0) {
      const edits = feedback.filter((f) => (f.content as Record<string, unknown>).action === "edit");
      if (edits.length > 0) {
        sections.push(`\nRecent edit patterns (adjust your style accordingly):\n${edits.slice(0, 3).map((f) => `- ${f.content_text.substring(0, 100)}`).join("\n")}`);
      }
    }

    sections.push("</personality>");
    return sections.join("\n");
  }

  // ─── Data Helpers ───────────────────────────────────────────────

  async getStreakData(): Promise<StreakData> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: recentPosts } = await this.supabase
      .from("post_history")
      .select("posted_at")
      .gte("posted_at", thirtyDaysAgo.toISOString())
      .order("posted_at", { ascending: false });

    if (!recentPosts || recentPosts.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastPostDate: null,
        totalPostsThisWeek: 0,
        totalPostsThisMonth: 0,
      };
    }

    // Calculate streak from unique posting dates
    const postDates = new Set(
      recentPosts.map((p) => new Date((p as { posted_at: string }).posted_at).toISOString().slice(0, 10)),
    );
    const sortedDates = [...postDates].sort().reverse();

    let currentStreak = 0;
    let today = now.toISOString().slice(0, 10);
    let checkDate = today;

    // If they posted today, start counting from today
    // If not, start counting from yesterday (streak might still be alive)
    if (!postDates.has(today)) {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (postDates.has(yesterday)) {
        checkDate = yesterday;
      } else {
        // Streak is broken
        currentStreak = 0;
        checkDate = "";
      }
    }

    if (checkDate) {
      let d = new Date(checkDate);
      while (postDates.has(d.toISOString().slice(0, 10))) {
        currentStreak++;
        d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
      }
    }

    // Calculate longest streak (simple approach — scan all 30 days)
    let longestStreak = currentStreak;
    let tempStreak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (postDates.has(d)) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    // This week (Monday-based)
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().slice(0, 10);

    const totalPostsThisWeek = sortedDates.filter((d) => d >= mondayStr).length;

    // This month
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const totalPostsThisMonth = sortedDates.filter((d) => d >= monthStart).length;

    return {
      currentStreak,
      longestStreak,
      lastPostDate: sortedDates[0] || null,
      totalPostsThisWeek,
      totalPostsThisMonth,
    };
  }

  private async getRecentPosts(days: number): Promise<PostHistoryRecord[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase
      .from("post_history")
      .select("*")
      .gte("posted_at", since)
      .order("posted_at", { ascending: false });

    return (data || []) as PostHistoryRecord[];
  }

  private async getTodayScheduledItems(): Promise<ContentQueueItem[]> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const { data } = await this.supabase
      .from("content_queue")
      .select("*")
      .gte("scheduled_for", startOfDay.toISOString())
      .lte("scheduled_for", endOfDay.toISOString())
      .in("status", ["ready", "awaiting_approval", "posting"]);

    return (data || []) as ContentQueueItem[];
  }

  private getPlatformBreakdown(posts: PostHistoryRecord[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const post of posts) {
      breakdown[post.platform] = (breakdown[post.platform] || 0) + 1;
    }
    return breakdown;
  }
}

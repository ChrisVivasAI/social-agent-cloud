import { TwitterApi } from "twitter-api-v2";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "../utils/model.js";
import { logger } from "../utils/logger.js";
import { activityBus } from "./activity-bus.js";

export interface Mention {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorName: string;
  inReplyToTweetId?: string;
  conversationId?: string;
  createdAt: string;
}

export interface DraftedEngagement {
  mention: Mention;
  draftReply: string;
  sentiment: "positive" | "neutral" | "negative" | "question";
}

export class EngagementMonitorService {
  private twitterUserId: string | null = null;
  private twitterClient: TwitterApi;

  constructor(
    twitterClient: TwitterApi,
    private supabase: SupabaseClient,
  ) {
    this.twitterClient = twitterClient;
  }

  /**
   * Get or resolve the authenticated user's Twitter ID.
   */
  private async getUserId(): Promise<string> {
    if (this.twitterUserId) return this.twitterUserId;

    // Check env first
    const envId = process.env.TWITTER_USER_ID;
    if (envId) {
      this.twitterUserId = envId;
      return envId;
    }

    // Resolve from API
    const me = await this.twitterClient.v2.me();
    this.twitterUserId = me.data.id;
    return this.twitterUserId;
  }

  /**
   * Poll Twitter for recent mentions of the authenticated user.
   * Uses a stored sinceId to avoid reprocessing old mentions.
   */
  async checkMentions(): Promise<Mention[]> {
    const userId = await this.getUserId();
    const sinceId = await this.getLastProcessedId("mention");

    const options: Record<string, unknown> = {
      "tweet.fields": ["created_at", "conversation_id", "in_reply_to_user_id"],
      "user.fields": ["username", "name"],
      expansions: ["author_id"],
      max_results: 20,
    };
    if (sinceId) {
      options.since_id = sinceId;
    }

    const timeline = await this.twitterClient.v2.userMentionTimeline(
      userId,
      options,
    );

    const mentions: Mention[] = [];
    const users = new Map<string, { username: string; name: string }>();

    // Build user lookup from includes
    if (timeline.includes?.users) {
      for (const user of timeline.includes.users) {
        users.set(user.id, { username: user.username, name: user.name });
      }
    }

    if (timeline.data?.data) {
      for (const tweet of timeline.data.data) {
        // Skip our own tweets
        if (tweet.author_id === userId) continue;

        const author = users.get(tweet.author_id || "") || {
          username: "unknown",
          name: "Unknown",
        };

        mentions.push({
          id: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id || "",
          authorUsername: author.username,
          authorName: author.name,
          inReplyToTweetId: (tweet as unknown as Record<string, unknown>)
            .in_reply_to_user_id
            ? tweet.id
            : undefined,
          conversationId: tweet.conversation_id,
          createdAt:
            tweet.created_at || new Date().toISOString(),
        });
      }
    }

    // Update the stored sinceId to the newest tweet
    if (mentions.length > 0) {
      const newestId = mentions.reduce(
        (max, m) => (BigInt(m.id) > BigInt(max) ? m.id : max),
        mentions[0].id,
      );
      await this.setLastProcessedId("mention", newestId);
    }

    return mentions;
  }

  /**
   * Check for replies to the agent's recent tweets.
   */
  async checkReplies(): Promise<Mention[]> {
    const userId = await this.getUserId();

    // Get our recent tweet IDs from post_history
    const { data: recentPosts } = await this.supabase
      .from("post_history")
      .select("external_post_id")
      .eq("platform", "twitter")
      .order("posted_at", { ascending: false })
      .limit(10);

    if (!recentPosts || recentPosts.length === 0) return [];

    const replies: Mention[] = [];

    for (const post of recentPosts) {
      if (!post.external_post_id) continue;

      try {
        // Search for replies to this specific tweet
        const searchResult = await this.twitterClient.v2.search(
          `conversation_id:${post.external_post_id} is:reply`,
          {
            "tweet.fields": ["created_at", "conversation_id", "author_id"],
            "user.fields": ["username", "name"],
            expansions: ["author_id"],
            max_results: 10,
          },
        );

        const users = new Map<string, { username: string; name: string }>();
        if (searchResult.includes?.users) {
          for (const user of searchResult.includes.users) {
            users.set(user.id, { username: user.username, name: user.name });
          }
        }

        if (searchResult.data?.data) {
          for (const tweet of searchResult.data.data) {
            // Skip our own replies
            if (tweet.author_id === userId) continue;

            // Check if already processed
            const isProcessed = await this.isAlreadyProcessed(tweet.id);
            if (isProcessed) continue;

            const author = users.get(tweet.author_id || "") || {
              username: "unknown",
              name: "Unknown",
            };

            replies.push({
              id: tweet.id,
              text: tweet.text,
              authorId: tweet.author_id || "",
              authorUsername: author.username,
              authorName: author.name,
              inReplyToTweetId: post.external_post_id,
              conversationId: tweet.conversation_id,
              createdAt:
                tweet.created_at || new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        // Rate limits or individual tweet errors shouldn't stop the whole check
        logger.warn(
          `Error checking replies for tweet ${post.external_post_id}: ${error}`,
        );
      }
    }

    return replies;
  }

  /**
   * Use Claude to draft a contextual response to a mention.
   */
  async draftReply(mention: Mention): Promise<DraftedEngagement> {
    const systemPrompt = `You are a social media engagement assistant. Your job is to draft thoughtful, on-brand replies to Twitter mentions and replies.

Guidelines:
- Keep replies concise (under 280 characters)
- Be friendly, helpful, and authentic
- If someone asks a question, provide a helpful answer
- If someone shares praise, acknowledge it warmly
- If someone shares criticism, be professional and empathetic
- Never be defensive or argumentative
- Match the energy/tone of the original message
- Include a call-to-action when appropriate (e.g. link to content, invite to DM)

Also classify the sentiment of the incoming message as one of: positive, neutral, negative, question`;

    const userPrompt = `Incoming mention from @${mention.authorUsername} (${mention.authorName}):

"${mention.text}"

${mention.inReplyToTweetId ? `This is a reply to one of our tweets (conversation_id: ${mention.conversationId})` : "This is a direct mention of our account."}

Draft a reply and classify the sentiment. Respond in this exact format:
SENTIMENT: <positive|neutral|negative|question>
REPLY: <your drafted reply>`;

    const response = await generateText(systemPrompt, userPrompt, {
      maxTokens: 512,
      temperature: 0.7,
    });

    // Parse the response
    const sentimentMatch = response.match(
      /SENTIMENT:\s*(positive|neutral|negative|question)/i,
    );
    const replyMatch = response.match(/REPLY:\s*([\s\S]+)/i);

    const sentiment = (sentimentMatch?.[1]?.toLowerCase() || "neutral") as
      | "positive"
      | "neutral"
      | "negative"
      | "question";
    const draftReply = replyMatch?.[1]?.trim() || "Thanks for reaching out!";

    return {
      mention,
      draftReply,
      sentiment,
    };
  }

  /**
   * Main orchestration: check mentions + replies, draft responses, surface to Slack.
   * Returns the drafted engagements for the caller (scheduler) to send to Slack.
   */
  async processNewEngagements(): Promise<DraftedEngagement[]> {
    const allMentions: Mention[] = [];

    // 1. Check mentions
    try {
      const mentions = await this.checkMentions();
      allMentions.push(...mentions);
      if (mentions.length > 0) {
        logger.info(`Found ${mentions.length} new mentions`);
      }
    } catch (error) {
      logger.error(`Error checking mentions: ${error}`);
    }

    // 2. Check replies to our tweets
    try {
      const replies = await this.checkReplies();
      allMentions.push(...replies);
      if (replies.length > 0) {
        logger.info(`Found ${replies.length} new replies`);
      }
    } catch (error) {
      logger.error(`Error checking replies: ${error}`);
    }

    if (allMentions.length === 0) return [];

    // 3. Deduplicate against already-processed mentions
    const newMentions: Mention[] = [];
    for (const mention of allMentions) {
      const processed = await this.isAlreadyProcessed(mention.id);
      if (!processed) {
        newMentions.push(mention);
      }
    }

    if (newMentions.length === 0) return [];

    // 4. Draft replies for each mention
    const engagements: DraftedEngagement[] = [];
    for (const mention of newMentions) {
      try {
        const engagement = await this.draftReply(mention);
        engagements.push(engagement);

        // Mark as processed with the draft reply
        await this.markProcessed(mention, engagement.draftReply);
      } catch (error) {
        logger.error(
          `Error drafting reply for mention ${mention.id}: ${error}`,
        );
      }
    }

    logger.info(
      `Processed ${engagements.length} new engagements (${newMentions.length} mentions)`,
    );

    if (engagements.length > 0) {
      activityBus.emitActivity("mentions_found", `Found ${engagements.length} new mentions/replies`, { count: engagements.length });
    }

    return engagements;
  }

  /**
   * Post an approved reply to Twitter.
   */
  async postReply(
    mentionId: string,
    replyText: string,
  ): Promise<string | null> {
    try {
      const result = await this.twitterClient.v2.tweet(replyText, {
        reply: { in_reply_to_tweet_id: mentionId },
      });
      const tweetId = result.data.id;

      // Update the processed_mentions record
      await this.supabase
        .from("processed_mentions")
        .update({
          replied: true,
          reply_tweet_id: tweetId,
          replied_at: new Date().toISOString(),
        })
        .eq("mention_id", mentionId);

      logger.info(`Posted reply to mention ${mentionId}: ${tweetId}`);
      return tweetId;
    } catch (error) {
      logger.error(`Error posting reply to mention ${mentionId}: ${error}`);
      return null;
    }
  }

  // ─── Deduplication helpers ───

  private async getLastProcessedId(
    type: string,
  ): Promise<string | null> {
    const { data } = await this.supabase
      .from("engagement_cursors")
      .select("cursor_value")
      .eq("cursor_type", type)
      .single();

    return data?.cursor_value || null;
  }

  private async setLastProcessedId(
    type: string,
    value: string,
  ): Promise<void> {
    await this.supabase.from("engagement_cursors").upsert(
      {
        cursor_type: type,
        cursor_value: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cursor_type" },
    );
  }

  private async isAlreadyProcessed(mentionId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("processed_mentions")
      .select("id")
      .eq("mention_id", mentionId)
      .maybeSingle();

    return !!data;
  }

  private async markProcessed(mention: Mention, draftReply?: string): Promise<void> {
    await this.supabase.from("processed_mentions").insert({
      mention_id: mention.id,
      author_id: mention.authorId,
      author_username: mention.authorUsername,
      text: mention.text,
      draft_reply: draftReply || null,
      sentiment: null,
      replied: false,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Get the stored draft reply for a mention (used by Slack action handlers).
   */
  async getDraftReply(mentionId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("processed_mentions")
      .select("draft_reply")
      .eq("mention_id", mentionId)
      .maybeSingle();

    return data?.draft_reply || null;
  }
}

import Parser from "rss-parser";
import { createSupabaseClient } from "../utils/supabase.js";
import { generateText } from "../utils/model.js";
import { logger } from "../utils/logger.js";
import type { DiscoveredContent } from "../types/index.js";
import type { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";

const RSS_FEEDS = [
  {
    name: "Hacker News AI",
    url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+machine+learning",
  },
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
  {
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  },
  {
    name: "Ars Technica AI",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
  },
  {
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
  },
  {
    name: "Anthropic Blog",
    url: "https://www.anthropic.com/rss.xml",
  },
];

const RELEVANCE_PROMPT = `You are a content relevance scorer for an AI-focused social media account.
Score the following article on a scale from 0.0 to 1.0 based on how relevant and interesting it would be to share with a developer audience interested in:
- AI applications and novel use cases
- UI/UX for AI products
- New AI/LLM research
- AI agents and agentic systems
- Multi-modal AI
- Generative UI

Respond with ONLY a JSON object: {"score": 0.X, "summary": "one-sentence summary"}

Article title: {{TITLE}}
Article snippet: {{SNIPPET}}`;

export class ContentDiscoveryService {
  private parser = new Parser();
  private supabase = createSupabaseClient();
  private promptBuilder: DynamicPromptBuilder | null = null;

  constructor(promptBuilder?: DynamicPromptBuilder) {
    this.promptBuilder = promptBuilder || null;
  }

  /**
   * Poll all RSS feeds, deduplicate, score relevance, and return high-quality discoveries.
   */
  async discoverContent(): Promise<DiscoveredContent[]> {
    const allItems: Array<{
      source: string;
      url: string;
      title: string;
      snippet: string;
    }> = [];

    for (const feed of RSS_FEEDS) {
      try {
        const parsed = await this.parser.parseURL(feed.url);
        for (const item of (parsed.items || []).slice(0, 10)) {
          const url = item.link;
          if (!url) continue;
          allItems.push({
            source: feed.name,
            url,
            title: item.title || "",
            snippet: (item.contentSnippet || item.content || "").substring(
              0,
              500,
            ),
          });
        }
      } catch (error) {
        logger.warn(`Failed to fetch feed ${feed.name}: ${error}`);
      }
    }

    if (allItems.length === 0) return [];

    // Deduplicate against existing discovered_content
    const urls = allItems.map((i) => i.url);
    const { data: existing } = await this.supabase
      .from("discovered_content")
      .select("url")
      .in("url", urls);
    const existingUrls = new Set((existing || []).map((e) => e.url));
    const newItems = allItems.filter((i) => !existingUrls.has(i.url));

    if (newItems.length === 0) return [];
    logger.info(`Found ${newItems.length} new items from RSS feeds`);

    // Dynamic threshold based on queue state
    const { data: queueCount } = await this.supabase
      .from("content_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "generating", "generated", "awaiting_approval", "ready"]);
    const currentQueueSize = (queueCount as unknown as number) || 0;
    // Lower threshold when queue is empty, raise when full
    const dynamicThreshold = currentQueueSize <= 2 ? 0.5 : currentQueueSize >= 6 ? 0.85 : 0.7;

    // Score relevance via Claude (batch — max 10 per cycle)
    const toScore = newItems.slice(0, 10);
    const scored: DiscoveredContent[] = [];

    for (const item of toScore) {
      try {
        let prompt = RELEVANCE_PROMPT.replace("{{TITLE}}", item.title).replace(
          "{{SNIPPET}}",
          item.snippet,
        );

        // Augment with topic performance insights if available
        if (this.promptBuilder) {
          prompt = await this.promptBuilder.buildDiscoveryPrompt(prompt);
        }

        const response = await generateText(
          prompt,
          `Score this article for relevance.`,
          { maxTokens: 256 },
        );

        let score = 0.5;
        let summary = item.title;
        try {
          const parsed = JSON.parse(response);
          score = parsed.score || 0.5;
          summary = parsed.summary || item.title;
        } catch {
          // Try to extract score from response
          const match = response.match(/(\d\.\d)/);
          if (match) score = parseFloat(match[1]);
        }

        const { data, error } = await this.supabase
          .from("discovered_content")
          .insert({
            source_feed: item.source,
            url: item.url,
            title: item.title,
            summary,
            relevance_score: score,
            status: "new",
          })
          .select()
          .single();

        if (error) {
          logger.warn(`Failed to insert discovery: ${error.message}`);
          continue;
        }

        if (score >= dynamicThreshold) {
          scored.push(data as DiscoveredContent);
        }
      } catch (error) {
        logger.warn(`Failed to score item ${item.url}: ${error}`);
      }
    }

    logger.info(
      `Scored ${toScore.length} items, ${scored.length} above threshold`,
    );
    return scored;
  }

  async getNewDiscoveries(limit: number = 10): Promise<DiscoveredContent[]> {
    const { data } = await this.supabase
      .from("discovered_content")
      .select("*")
      .eq("status", "new")
      .gte("relevance_score", 0.7)
      .order("relevance_score", { ascending: false })
      .limit(limit);

    return (data || []) as DiscoveredContent[];
  }

  async markQueued(id: string, queueId: string): Promise<void> {
    await this.supabase
      .from("discovered_content")
      .update({
        status: "queued",
        content_queue_id: queueId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  async markDismissed(id: string): Promise<void> {
    await this.supabase
      .from("discovered_content")
      .update({
        status: "dismissed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
}

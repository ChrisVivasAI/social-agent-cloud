import FirecrawlApp from "@mendable/firecrawl-js";
import { getConfig } from "../config/env.js";
import { generateText } from "../utils/model.js";
import { getPageText } from "../utils/page.js";
import { logger } from "../utils/logger.js";

let firecrawlClient: FirecrawlApp | null = null;

function getFirecrawl(): FirecrawlApp {
  if (!firecrawlClient) {
    firecrawlClient = new FirecrawlApp({
      apiKey: getConfig().FIRECRAWL_API_KEY,
    });
  }
  return firecrawlClient;
}

export interface ScrapedContent {
  content: string;
  title?: string;
  images: string[];
  url: string;
}

export class ScraperService {
  /**
   * Scrape a URL using FireCrawl with cheerio fallback
   */
  async scrapeUrl(url: string): Promise<ScrapedContent> {
    // Try FireCrawl first
    try {
      const firecrawl = getFirecrawl();
      const result = await firecrawl.scrapeUrl(url, {
        formats: ["markdown"],
      });

      if (result.success && result.markdown) {
        logger.info(`Scraped ${url} via FireCrawl`);
        return {
          content: result.markdown,
          title: result.metadata?.title,
          images: this.extractImagesFromMarkdown(result.markdown),
          url,
        };
      }
    } catch (error) {
      logger.warn(`FireCrawl failed for ${url}, falling back to cheerio`, {
        error,
      });
    }

    // Fallback to cheerio-based scraping
    const text = await getPageText(url);
    if (!text) {
      throw new Error(`Failed to scrape content from ${url}`);
    }

    return {
      content: text,
      images: [],
      url,
    };
  }

  /**
   * Check if content is relevant using Claude
   */
  async checkRelevance(content: string): Promise<boolean> {
    const prompt = `You are a marketing employee. Determine if this webpage content is relevant to any of the following topics:
- AI applications and novel uses of AI
- UI/UX for AI applications
- New AI/LLM research
- AI agents and agent implementations
- Multi-modal AI
- Generative UI

Content to evaluate:
${content.substring(0, 3000)}

Respond with a JSON object: { "reasoning": "your reasoning", "relevant": true/false }`;

    try {
      const response = await generateText(
        "You are a content relevance evaluator. Respond only with valid JSON.",
        prompt,
        { maxTokens: 512, temperature: 0.1 },
      );

      const parsed = JSON.parse(
        response.replace(/```json\n?/g, "").replace(/```\n?/g, ""),
      );
      return parsed.relevant === true;
    } catch {
      // Default to relevant if check fails
      return true;
    }
  }

  private extractImagesFromMarkdown(markdown: string): string[] {
    const urls: string[] = [];
    const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const htmlRegex = /<img[^>]+src=["']([^"'>]+)["']/g;

    let match;
    while ((match = mdRegex.exec(markdown)) !== null) urls.push(match[2]);
    while ((match = htmlRegex.exec(markdown)) !== null) urls.push(match[1]);

    // Filter out SVGs, ICOs, and tiny tracking pixels
    return urls.filter(
      (url) =>
        !url.endsWith(".svg") &&
        !url.endsWith(".ico") &&
        !url.includes("pixel") &&
        !url.includes("tracking"),
    );
  }
}

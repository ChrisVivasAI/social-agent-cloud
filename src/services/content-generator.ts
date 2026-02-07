import { generateText } from "../utils/model.js";
import { activityBus } from "./activity-bus.js";
import {
  parsePost,
  parseTwitterPost,
  parseLinkedinPost,
  parseReport,
  parseVideoScript,
  parseTemplateSelection,
  parseQuoteCard,
  parseProductShowcase,
  parseThreadParts,
  truncateToLimit,
} from "../utils/text.js";
import {
  GENERATE_REPORT_PROMPT,
  GENERATE_TOPIC_REPORT_PROMPT,
  GENERATE_POST_PROMPT,
  MEDIA_CAPTION_PROMPT,
  REMOTION_CAPTION_PROMPT,
  GENERATE_VIDEO_SCRIPT_PROMPT,
  TEMPLATE_SELECTION_PROMPT,
  GENERATE_QUOTE_CARD_PROMPT,
  GENERATE_PRODUCT_SHOWCASE_SCRIPT_PROMPT,
  TEXT_POST_PROMPT,
  THREAD_GENERATION_PROMPT,
} from "../prompts/index.js";
import { ScraperService } from "./scraper.js";
import { ContentQueueService } from "./content-queue.js";
import { RemotionService } from "./remotion-service.js";
import { FalService } from "./fal-service.js";
import { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";
import { AgentMemoryService } from "./agent-memory.js";
import { GeminiService } from "./gemini-service.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import type {
  ContentQueueItem,
  GeneratedContent,
  VideoScript,
  TechNewsVideoProps,
  QuoteCardProps,
  ProductShowcaseProps,
  AudiogramProps,
  RemotionCompositionId,
  ContentCritiqueResult,
  QualityGateResult,
  TimedCaption,
} from "../types/index.js";

export class ContentGeneratorService {
  private scraper = new ScraperService();
  private queue: ContentQueueService;
  private remotionService: RemotionService;
  private falService: FalService;
  private promptBuilder: DynamicPromptBuilder | null = null;
  private gemini: GeminiService | null = null;

  constructor(
    queue: ContentQueueService,
    remotionService: RemotionService,
    falService: FalService,
    promptBuilder?: DynamicPromptBuilder,
    _memory?: AgentMemoryService,
    gemini?: GeminiService,
  ) {
    this.queue = queue;
    this.remotionService = remotionService;
    this.falService = falService;
    this.promptBuilder = promptBuilder || null;
    this.gemini = gemini || null;
  }

  /**
   * Analyze a generated image for quality using Gemini 3 Flash vision.
   * Returns a score (1-10) and issues found. Uses media_resolution_high for detail.
   */
  async analyzeImageQuality(
    imageBuffer: Buffer,
    intendedContent: string,
  ): Promise<{ score: number; issues: string[]; passesGate: boolean }> {
    if (!this.gemini?.isAvailable) {
      return { score: 8, issues: [], passesGate: true }; // skip gate if no Gemini
    }

    try {
      const result = await this.gemini.analyzeVision(
        `You are a social media image quality analyst. Analyze this AI-generated image that is
intended for a social media post about: "${intendedContent}"

Evaluate:
1. Visual quality — is it sharp, well-composed, aesthetically pleasing?
2. Text readability — if there's text in the image, is it legible and spelled correctly?
3. Brand safety — any inappropriate content, distorted faces, or artifacts?
4. Relevance — does the image match the intended content?
5. Platform suitability — would this look good as a social media post image?

Return JSON:
{
  "score": <1-10>,
  "issues": ["<list of specific issues found>"],
  "text_found": "<any text found in the image>",
  "recommendation": "pass" | "regenerate"
}`,
        [{
          type: "image",
          data: imageBuffer,
          mimeType: "image/png",
          mediaResolution: "media_resolution_high",
        }],
        { model: "flash", jsonMode: true, maxTokens: 1024, thinkingLevel: "low" },
      );

      const parsed = JSON.parse(result) as {
        score: number;
        issues: string[];
        recommendation: string;
      };

      const passesGate = parsed.score >= 5 && parsed.recommendation !== "regenerate";
      logger.info(
        `Image quality gate: score=${parsed.score}, issues=${parsed.issues.length}, pass=${passesGate}`,
      );

      return {
        score: parsed.score,
        issues: parsed.issues || [],
        passesGate,
      };
    } catch (err) {
      logger.warn(`Image quality gate failed, allowing through: ${err}`);
      return { score: 7, issues: [], passesGate: true };
    }
  }

  /**
   * Generate a post from a link: scrape -> report -> post (with platform-specific versions)
   */
  async generateLinkPost(url: string, creativeDirection?: string | null): Promise<GeneratedContent> {
    // Step 1: Scrape the content
    const scraped = await this.scraper.scrapeUrl(url);

    // Step 2: Check relevance
    const isRelevant = await this.scraper.checkRelevance(scraped.content);
    if (!isRelevant) {
      logger.warn(`Content at ${url} was deemed not relevant`);
    }

    const directionBlock = creativeDirection
      ? `\n\n<user_direction>\nThe user has requested the following creative direction for this post:\n${creativeDirection}\n</user_direction>`
      : "";

    // Step 3: Generate marketing report (with dynamic prompt augmentation)
    const reportPrompt = this.promptBuilder
      ? await this.promptBuilder.buildContentGenerationPrompt(GENERATE_REPORT_PROMPT, {
          contentType: "link",
          topic: scraped.content.substring(0, 200),
          url,
        })
      : GENERATE_REPORT_PROMPT;

    const reportResponse = await generateText(
      reportPrompt,
      `Here is the content I'd like a marketing report on:\n\n${scraped.content.substring(0, 8000)}${directionBlock}`,
      { maxTokens: 4096 },
    );
    const report = parseReport(reportResponse);

    // Step 4: Generate platform-specific posts (with dynamic prompt augmentation)
    const postPrompt = this.promptBuilder
      ? await this.promptBuilder.buildContentGenerationPrompt(GENERATE_POST_PROMPT, {
          contentType: "link",
          url,
        })
      : GENERATE_POST_PROMPT;

    const postResponse = await generateText(
      postPrompt,
      `Here is the report on the content I'd like promoted:\n<report>\n${report}\n</report>\n\nAnd here is the link to the content:\n<link>\n${url}\n</link>${directionBlock}`,
      { maxTokens: 2048 },
    );
    const postTwitter = parseTwitterPost(postResponse);
    const postLinkedin = parseLinkedinPost(postResponse);
    // Fallback generic post for backwards compatibility
    const post = parsePost(postResponse);

    // Pick the best image from scraped content
    const imageUrl =
      scraped.images.length > 0 ? scraped.images[0] : undefined;

    return { report, post, postTwitter, postLinkedin, imageUrl };
  }

  /**
   * Generate platform-specific captions for user-provided media
   */
  async generateMediaCaption(
    mediaType: "image" | "video",
    context: string,
  ): Promise<{ twitter: string; linkedin: string }> {
    const response = await generateText(
      MEDIA_CAPTION_PROMPT,
      `I'm posting a ${mediaType} to social media. Here's the context:\n\n${context}`,
      { maxTokens: 512 },
    );
    return {
      twitter: truncateToLimit(parseTwitterPost(response), 280),
      linkedin: parseLinkedinPost(response),
    };
  }

  /**
   * Generate platform-specific captions for a Remotion-generated video
   */
  async generateRemotionCaption(
    template: string,
    props: Record<string, unknown>,
  ): Promise<{ twitter: string; linkedin: string }> {
    const response = await generateText(
      REMOTION_CAPTION_PROMPT,
      `Video template: ${template}\nVideo content/props: ${JSON.stringify(props, null, 2)}`,
      { maxTokens: 512 },
    );
    return {
      twitter: truncateToLimit(parseTwitterPost(response), 280),
      linkedin: parseLinkedinPost(response),
    };
  }

  /**
   * Generate platform-specific posts from plain text input
   */
  async generateTextPost(
    sourceText: string,
  ): Promise<{ twitter: string; linkedin: string }> {
    const response = await generateText(
      TEXT_POST_PROMPT,
      `Here's what I want to post:\n\n${sourceText}`,
      { maxTokens: 512 },
    );
    return {
      twitter: truncateToLimit(parseTwitterPost(response), 280),
      linkedin: parseLinkedinPost(response),
    };
  }

  /**
   * Generate a Twitter thread (3-5 tweets) from content
   */
  async generateThread(
    content: string,
    creativeDirection?: string | null,
  ): Promise<string[]> {
    const directionBlock = creativeDirection
      ? `\n\nCreative direction: ${creativeDirection}`
      : "";
    const response = await generateText(
      THREAD_GENERATION_PROMPT,
      `Here is the content to turn into a thread:\n\n${content.substring(0, 4000)}${directionBlock}`,
      { maxTokens: 2048 },
    );
    const parts = parseThreadParts(response);
    if (parts.length === 0) {
      logger.warn("Failed to parse thread parts, falling back to single tweet");
      return [truncateToLimit(content, 280)];
    }
    // Ensure each part is <= 280 chars
    return parts.map((p) => truncateToLimit(p, 280));
  }

  /**
   * Generate a marketing report from a topic (no URL to scrape)
   */
  async generateTopicReport(
    topic: string,
    creativeDirection?: string | null,
  ): Promise<string> {
    const directionBlock = creativeDirection
      ? `\n\nCreative direction from the user: ${creativeDirection}`
      : "";

    const response = await generateText(
      GENERATE_TOPIC_REPORT_PROMPT,
      `Topic: ${topic}${directionBlock}`,
      { maxTokens: 4096 },
    );
    return parseReport(response);
  }

  /**
   * Convert word-level timestamps (ms) to frame-based TimedCaptions at given FPS.
   */
  private convertToTimedCaptions(
    words: Array<{ word: string; start: number; end: number }>,
    fps: number = 30,
  ): TimedCaption[] {
    return words.map((w) => ({
      word: w.word,
      startFrame: Math.round((w.start / 1000) * fps),
      endFrame: Math.round((w.end / 1000) * fps),
    }));
  }

  /**
   * Shared helper: run TTS + AI image generation in parallel, upload to Supabase.
   * Returns voiceover URL, TTS duration, timed captions, and a map of scene index → image URL.
   */
  private async generateTTSAndImages(
    narrationText: string,
    scenes: Array<{ imagePrompt?: string }>,
  ): Promise<{
    voiceoverUrl?: string;
    ttsDurationMs?: number;
    sceneImageUrls: Map<number, string>;
    captions: TimedCaption[];
  }> {
    let voiceoverUrl: string | undefined;
    let ttsDurationMs: number | undefined;
    const sceneImageUrls: Map<number, string> = new Map();
    let captions: TimedCaption[] = [];

    if (!this.falService.isAvailable) {
      return { voiceoverUrl, ttsDurationMs, sceneImageUrls, captions };
    }

    const supabase = createSupabaseClient();

    const ttsTask = narrationText
      ? this.falService.generateSpeech(narrationText)
      : Promise.resolve(null);

    const imageScenes = scenes
      .map((s, i) => ({ scene: s, index: i }))
      .filter((item) => item.scene.imagePrompt);

    const imageTasks = imageScenes.map((item) =>
      this.falService.generateImage(item.scene.imagePrompt!).then(async (buffer) => {
        // Quality gate: analyze generated image before uploading
        const quality = await this.analyzeImageQuality(buffer, item.scene.imagePrompt!);
        let finalBuffer = buffer;

        if (!quality.passesGate) {
          logger.warn(
            `Image quality gate failed for scene ${item.index} (score=${quality.score}, issues=${quality.issues.join(", ")}). Regenerating...`,
          );
          // Retry once with enhanced prompt
          const retryPrompt = `${item.scene.imagePrompt!}. IMPORTANT: ${quality.issues.join(". ")}. Ensure high quality, no text artifacts, clean composition.`;
          finalBuffer = await this.falService.generateImage(retryPrompt);
        }

        const imgPath = `videos/images/${Date.now()}-${item.index}.png`;
        const { error } = await supabase.storage
          .from("videos")
          .upload(imgPath, finalBuffer, { contentType: "image/png" });
        if (error) {
          logger.warn(`Failed to upload scene ${item.index} image: ${error.message}`);
          return { index: item.index, url: null };
        }
        const { data: { publicUrl } } = supabase.storage
          .from("videos")
          .getPublicUrl(imgPath);
        return { index: item.index, url: publicUrl };
      }),
    );

    logger.info(
      `Launching parallel fal.ai tasks: TTS=${!!narrationText}, images=${imageTasks.length}`,
    );

    const [ttsResult, ...imageResults] = await Promise.allSettled([
      ttsTask,
      ...imageTasks,
    ]);

    if (ttsResult.status === "fulfilled" && ttsResult.value) {
      const { buffer, durationMs } = ttsResult.value;
      ttsDurationMs = durationMs;
      const ttsPath = `videos/tts/${Date.now()}.mp3`;
      const { error } = await supabase.storage
        .from("videos")
        .upload(ttsPath, buffer, { contentType: "audio/mpeg" });
      if (error) {
        logger.warn(`Failed to upload TTS audio: ${error.message}`);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from("videos")
          .getPublicUrl(ttsPath);
        voiceoverUrl = publicUrl;
        logger.info(`TTS audio uploaded: ${voiceoverUrl}`);
      }

      // Transcribe audio for auto-captions
      const wordTimestamps = await this.falService.transcribeAudio(buffer);
      if (wordTimestamps.length > 0) {
        captions = this.convertToTimedCaptions(wordTimestamps, 30);
        logger.info(`Auto-captions generated: ${captions.length} words`);
      }
    } else if (ttsResult.status === "rejected") {
      logger.warn(`TTS generation failed (continuing without voiceover): ${ttsResult.reason}`);
    }

    for (const result of imageResults) {
      if (result.status === "fulfilled" && result.value.url) {
        sceneImageUrls.set(result.value.index, result.value.url);
        logger.info(`Scene ${result.value.index} image uploaded: ${result.value.url}`);
      } else if (result.status === "rejected") {
        logger.warn(`Image generation failed for a scene: ${result.reason}`);
      }
    }

    return { voiceoverUrl, ttsDurationMs, sceneImageUrls, captions };
  }

  /**
   * Generate a video from a topic string (no URL). Generates a report from the topic,
   * selects a template, produces TTS/images, and returns props ready for render.
   */
  async generateVideoFromTopic(
    topic: string,
    creativeDirection?: string | null,
    overrideTemplate?: string | null,
  ): Promise<{
    templateId: RemotionCompositionId;
    props: Record<string, unknown>;
    voiceoverUrl?: string;
    twitterCaption: string;
    linkedinCaption: string;
    report: string;
  }> {
    // Step 1: Generate report from topic
    const report = await this.generateTopicReport(topic, creativeDirection);

    // Step 2: Select template
    let templateId: RemotionCompositionId;
    if (overrideTemplate && ["TechNewsVideo", "QuoteCard", "ProductShowcase", "AudiogramVideo"].includes(overrideTemplate)) {
      templateId = overrideTemplate as RemotionCompositionId;
      logger.info(`Topic video: using overridden template: ${templateId}`);
    } else {
      templateId = await this.selectTemplate(report);
      logger.info(`Topic video: auto-selected template: ${templateId}`);
    }

    // Step 3: Generate props (same branching as generateVideoScript but with no URL)
    let props: Record<string, unknown>;
    let voiceoverUrl: string | undefined;

    if (templateId === "QuoteCard") {
      const quoteProps = await this.generateQuoteCardProps(report);
      props = quoteProps as unknown as Record<string, unknown>;
    } else if (templateId === "ProductShowcase") {
      // For topic-based, generate a product showcase script without a real URL
      const scriptResponse = await generateText(
        GENERATE_PRODUCT_SHOWCASE_SCRIPT_PROMPT,
        `Here is the marketing report:\n<report>\n${report}\n</report>\n\nSource URL: (topic-based, no URL)`,
        { maxTokens: 2048 },
      );
      const scriptData = parseProductShowcase(scriptResponse);
      if (!scriptData) throw new Error("Failed to parse ProductShowcase script");

      const narrationText = (scriptData.narrationText as string) || "";
      const scenes = (scriptData.scenes as Array<{
        type: string; text: string; subtext?: string;
        durationSeconds: number; imagePrompt?: string; featureIndex?: number;
      }>) || [];

      const media = await this.generateTTSAndImages(narrationText, scenes);
      voiceoverUrl = media.voiceoverUrl;

      if (media.ttsDurationMs) {
        const targetSec = media.ttsDurationMs / 1000 + 1.0;
        const currentSec = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
        if (Math.abs(targetSec - currentSec) > 0.5) {
          const scale = targetSec / currentSec;
          for (const scene of scenes) {
            scene.durationSeconds = Math.max(1, scene.durationSeconds * scale);
          }
        }
      }

      const FPS = 30;
      const heroIdx = scenes.findIndex((s) => s.type === "hero");
      const heroImageUrl = heroIdx >= 0 ? media.sceneImageUrls.get(heroIdx) : undefined;

      const showcaseProps: ProductShowcaseProps = {
        productName: (scriptData.productName as string) || "Product",
        tagline: (scriptData.tagline as string) || "",
        features: (scriptData.features as Array<{ title: string; description: string }>) || [],
        ctaText: (scriptData.ctaText as string) || "Learn more",
        ctaUrl: (scriptData.ctaUrl as string) || undefined,
        scenes: scenes.map((s, i) => ({
          type: s.type, text: s.text, subtext: s.subtext,
          durationInFrames: Math.round(s.durationSeconds * FPS),
          imageUrl: media.sceneImageUrls.get(i),
          featureIndex: s.featureIndex,
        })),
        voiceoverUrl,
        heroImageUrl,
        accentColor: (scriptData.accentColor as string) || "#d97757",
        backgroundColor: (scriptData.backgroundColor as string) || "#141413",
        brandName: "Tech News",
      };
      props = showcaseProps as unknown as Record<string, unknown>;
      if (media.captions.length > 0) {
        (props as Record<string, unknown>).captions = media.captions;
      }
    } else if (templateId === "AudiogramVideo") {
      const scriptResponse = await generateText(
        GENERATE_VIDEO_SCRIPT_PROMPT,
        `Here is the marketing report to create a video script from:\n<report>\n${report}\n</report>\n\nSource URL: (topic-based, no URL)`,
        { maxTokens: 2048 },
      );
      const scriptData = parseVideoScript(scriptResponse);
      const narrationText = (scriptData?.narrationText as string) || report.substring(0, 500);

      const result = await this.generateAudiogramProps(report, narrationText, "");
      props = result.props as unknown as Record<string, unknown>;
      voiceoverUrl = result.voiceoverUrl;
    } else {
      // TechNewsVideo (default)
      const scriptResponse = await generateText(
        GENERATE_VIDEO_SCRIPT_PROMPT,
        `Here is the marketing report to create a video script from:\n<report>\n${report}\n</report>\n\nSource URL: (topic-based, no URL)`,
        { maxTokens: 2048 },
      );
      const scriptData = parseVideoScript(scriptResponse);
      if (!scriptData) throw new Error("Failed to parse video script from Claude response");

      const script: VideoScript = {
        headline: (scriptData.headline as string) || "Tech News",
        keyPoints: (scriptData.keyPoints as string[]) || [],
        sourceUrl: "",
        sourceName: "Topic Report",
        narrationText: (scriptData.narrationText as string) || "",
        scenes: (scriptData.scenes as VideoScript["scenes"]) || [],
        accentColor: (scriptData.accentColor as string) || "#e94560",
        backgroundColor: (scriptData.backgroundColor as string) || "#1a1a2e",
      };

      const media = await this.generateTTSAndImages(
        script.narrationText,
        script.scenes,
      );
      voiceoverUrl = media.voiceoverUrl;

      if (media.ttsDurationMs) {
        const targetSec = media.ttsDurationMs / 1000 + 1.0;
        const currentSec = script.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
        if (Math.abs(targetSec - currentSec) > 0.5) {
          const scale = targetSec / currentSec;
          for (const scene of script.scenes) {
            scene.durationSeconds = Math.max(1, scene.durationSeconds * scale);
          }
        }
      }

      const FPS = 30;
      const heroIdx = script.scenes.findIndex((s) => s.type === "hero_image");
      const heroImageUrl = heroIdx >= 0 ? media.sceneImageUrls.get(heroIdx) : undefined;

      const techProps: TechNewsVideoProps = {
        headline: script.headline,
        keyPoints: script.keyPoints,
        sourceUrl: script.sourceUrl,
        sourceName: script.sourceName,
        scenes: script.scenes.map((s, i) => ({
          type: s.type, text: s.text, subtext: s.subtext,
          durationInFrames: Math.round(s.durationSeconds * FPS),
          imageUrl: media.sceneImageUrls.get(i),
        })),
        voiceoverUrl,
        heroImageUrl,
        accentColor: script.accentColor || "#e94560",
        backgroundColor: script.backgroundColor || "#1a1a2e",
        brandName: "Tech News",
      };
      props = techProps as unknown as Record<string, unknown>;
      if (media.captions.length > 0) {
        (props as Record<string, unknown>).captions = media.captions;
      }
    }

    // Step 4: Generate captions
    const captionResponse = await generateText(
      REMOTION_CAPTION_PROMPT,
      `Video template: ${templateId}\nVideo content/props: ${JSON.stringify(props, null, 2).substring(0, 2000)}`,
      { maxTokens: 512 },
    );

    return {
      templateId,
      props,
      voiceoverUrl,
      twitterCaption: truncateToLimit(parseTwitterPost(captionResponse), 280),
      linkedinCaption: parseLinkedinPost(captionResponse),
      report,
    };
  }

  /**
   * Select the best template for given content via Claude
   */
  private async selectTemplate(report: string): Promise<RemotionCompositionId> {
    const templatePrompt = this.promptBuilder
      ? await this.promptBuilder.buildTemplateSelectionPrompt(TEMPLATE_SELECTION_PROMPT, report)
      : TEMPLATE_SELECTION_PROMPT;

    const response = await generateText(
      templatePrompt,
      `Here is the marketing report:\n<report>\n${report}\n</report>`,
      { maxTokens: 256 },
    );
    const selection = parseTemplateSelection(response);
    const valid: RemotionCompositionId[] = ["TechNewsVideo", "QuoteCard", "ProductShowcase", "AudiogramVideo", "StoryVideo", "ShortFormVideo"];
    if (selection && valid.includes(selection as RemotionCompositionId)) {
      return selection as RemotionCompositionId;
    }
    logger.warn(`Invalid template selection "${selection}", falling back to TechNewsVideo`);
    return "TechNewsVideo";
  }

  /**
   * Generate QuoteCard props from a report — fast path, no TTS/images
   */
  private async generateQuoteCardProps(
    report: string,
  ): Promise<QuoteCardProps> {
    const response = await generateText(
      GENERATE_QUOTE_CARD_PROMPT,
      `Here is the marketing report:\n<report>\n${report}\n</report>`,
      { maxTokens: 512 },
    );
    const data = parseQuoteCard(response);
    if (!data) {
      throw new Error("Failed to parse QuoteCard props from Claude response");
    }
    return {
      quoteText: (data.quoteText as string) || "Quote",
      attribution: (data.attribution as string) || "Unknown",
      subtitle: data.subtitle as string | undefined,
      accentColor: (data.accentColor as string) || "#d97757",
      backgroundColor: (data.backgroundColor as string) || "#141413",
      brandName: "Tech News",
    };
  }

  /**
   * Generate ProductShowcase props from a report — TTS + images in parallel
   */
  private async generateProductShowcaseProps(
    report: string,
    url: string,
  ): Promise<{
    props: ProductShowcaseProps;
    voiceoverUrl?: string;
    captions: TimedCaption[];
  }> {
    // Generate script
    const scriptResponse = await generateText(
      GENERATE_PRODUCT_SHOWCASE_SCRIPT_PROMPT,
      `Here is the marketing report:\n<report>\n${report}\n</report>\n\nSource URL: ${url}`,
      { maxTokens: 2048 },
    );
    const scriptData = parseProductShowcase(scriptResponse);
    if (!scriptData) {
      throw new Error("Failed to parse ProductShowcase script from Claude response");
    }

    const narrationText = (scriptData.narrationText as string) || "";
    const scenes = (scriptData.scenes as Array<{
      type: string;
      text: string;
      subtext?: string;
      durationSeconds: number;
      imagePrompt?: string;
      featureIndex?: number;
    }>) || [];

    // TTS + AI images in parallel
    let voiceoverUrl: string | undefined;
    let ttsDurationMs: number | undefined;
    const sceneImageUrls: Map<number, string> = new Map();
    let productCaptions: TimedCaption[] = [];

    if (this.falService.isAvailable) {
      const supabase = createSupabaseClient();

      const ttsTask = narrationText
        ? this.falService.generateSpeech(narrationText)
        : Promise.resolve(null);

      const imageScenes = scenes
        .map((s, i) => ({ scene: s, index: i }))
        .filter((item) => item.scene.imagePrompt);

      const imageTasks = imageScenes.map((item) =>
        this.falService.generateImage(item.scene.imagePrompt!).then(async (buffer) => {
          // Quality gate: analyze generated image before uploading
          const quality = await this.analyzeImageQuality(buffer, item.scene.imagePrompt!);
          let finalBuffer = buffer;

          if (!quality.passesGate) {
            logger.warn(
              `ProductShowcase image quality gate failed for scene ${item.index} (score=${quality.score}). Regenerating...`,
            );
            const retryPrompt = `${item.scene.imagePrompt!}. IMPORTANT: ${quality.issues.join(". ")}. Ensure high quality, clean composition.`;
            finalBuffer = await this.falService.generateImage(retryPrompt);
          }

          const imgPath = `videos/images/${Date.now()}-${item.index}.png`;
          const { error } = await supabase.storage
            .from("videos")
            .upload(imgPath, finalBuffer, { contentType: "image/png" });
          if (error) {
            logger.warn(`Failed to upload scene ${item.index} image: ${error.message}`);
            return { index: item.index, url: null };
          }
          const { data: { publicUrl } } = supabase.storage
            .from("videos")
            .getPublicUrl(imgPath);
          return { index: item.index, url: publicUrl };
        }),
      );

      logger.info(
        `ProductShowcase: Launching parallel fal.ai tasks: TTS=${!!narrationText}, images=${imageTasks.length}`,
      );

      const [ttsResult, ...imageResults] = await Promise.allSettled([
        ttsTask,
        ...imageTasks,
      ]);

      if (ttsResult.status === "fulfilled" && ttsResult.value) {
        const { buffer, durationMs } = ttsResult.value;
        ttsDurationMs = durationMs;
        const ttsPath = `videos/tts/${Date.now()}.mp3`;
        const { error } = await supabase.storage
          .from("videos")
          .upload(ttsPath, buffer, { contentType: "audio/mpeg" });
        if (error) {
          logger.warn(`Failed to upload TTS audio: ${error.message}`);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from("videos")
            .getPublicUrl(ttsPath);
          voiceoverUrl = publicUrl;
          logger.info(`ProductShowcase TTS uploaded: ${voiceoverUrl}`);
        }

        // Transcribe audio for auto-captions
        const wordTimestamps = await this.falService.transcribeAudio(buffer);
        if (wordTimestamps.length > 0) {
          productCaptions = this.convertToTimedCaptions(wordTimestamps, 30);
          logger.info(`ProductShowcase auto-captions: ${productCaptions.length} words`);
        }
      } else if (ttsResult.status === "rejected") {
        logger.warn(`ProductShowcase TTS failed: ${ttsResult.reason}`);
      }

      for (const result of imageResults) {
        if (result.status === "fulfilled" && result.value.url) {
          sceneImageUrls.set(result.value.index, result.value.url);
        }
      }
    }

    // Scale durations to match TTS
    if (ttsDurationMs) {
      const targetSec = ttsDurationMs / 1000 + 1.0;
      const currentSec = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      const diff = Math.abs(targetSec - currentSec);
      if (diff > 0.5) {
        const scale = targetSec / currentSec;
        for (const scene of scenes) {
          scene.durationSeconds = Math.max(1, scene.durationSeconds * scale);
        }
      }
    }

    const FPS = 30;
    const heroSceneIdx = scenes.findIndex((s) => s.type === "hero");
    const heroImageUrl = heroSceneIdx >= 0 ? sceneImageUrls.get(heroSceneIdx) : undefined;

    const props: ProductShowcaseProps = {
      productName: (scriptData.productName as string) || "Product",
      tagline: (scriptData.tagline as string) || "",
      features: (scriptData.features as Array<{ title: string; description: string }>) || [],
      ctaText: (scriptData.ctaText as string) || "Learn more",
      ctaUrl: (scriptData.ctaUrl as string) || url,
      scenes: scenes.map((s, i) => ({
        type: s.type,
        text: s.text,
        subtext: s.subtext,
        durationInFrames: Math.round(s.durationSeconds * FPS),
        imageUrl: sceneImageUrls.get(i),
        featureIndex: s.featureIndex,
      })),
      voiceoverUrl,
      heroImageUrl,
      accentColor: (scriptData.accentColor as string) || "#d97757",
      backgroundColor: (scriptData.backgroundColor as string) || "#141413",
      brandName: "Tech News",
    };

    return { props, voiceoverUrl, captions: productCaptions };
  }

  /**
   * Generate AudiogramVideo props from a report — TTS only, no images
   */
  private async generateAudiogramProps(
    report: string,
    narrationText: string,
    _url: string,
  ): Promise<{
    props: AudiogramProps;
    voiceoverUrl?: string;
  }> {
    let voiceoverUrl: string | undefined;
    let durationInFrames = 300; // default ~10 seconds
    const FPS = 30;

    if (this.falService.isAvailable && narrationText) {
      const supabase = createSupabaseClient();
      try {
        const { buffer, durationMs } = await this.falService.generateSpeech(narrationText);
        const ttsPath = `videos/tts/${Date.now()}.mp3`;
        const { error } = await supabase.storage
          .from("videos")
          .upload(ttsPath, buffer, { contentType: "audio/mpeg" });
        if (error) {
          logger.warn(`Audiogram TTS upload failed: ${error.message}`);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from("videos")
            .getPublicUrl(ttsPath);
          voiceoverUrl = publicUrl;
          durationInFrames = Math.round((durationMs / 1000 + 1.0) * FPS);
          logger.info(`Audiogram TTS uploaded: ${voiceoverUrl}, duration: ${durationInFrames} frames`);
        }
      } catch (err) {
        logger.warn(`Audiogram TTS generation failed: ${err}`);
      }
    }

    const props: AudiogramProps = {
      title: report.substring(0, 100).split("\n")[0] || "Audio Brief",
      captionText: narrationText,
      voiceoverUrl: voiceoverUrl || "",
      durationInFrames,
      accentColor: "#d97757",
      backgroundColor: "#141413",
      brandName: "Tech News",
    };

    return { props, voiceoverUrl };
  }

  /**
   * Generate a video script from a URL with automatic template selection.
   * Supports TechNewsVideo, QuoteCard, ProductShowcase, and AudiogramVideo.
   */
  async generateVideoScript(
    url: string,
    overrideTemplate?: string | null,
  ): Promise<{
    templateId: RemotionCompositionId;
    props: Record<string, unknown>;
    voiceoverUrl?: string;
    twitterCaption: string;
    linkedinCaption: string;
    report: string;
  }> {
    // Step 1: Scrape and generate report
    const scraped = await this.scraper.scrapeUrl(url);
    const reportResponse = await generateText(
      GENERATE_REPORT_PROMPT,
      `Here is the content I'd like a marketing report on:\n\n${scraped.content.substring(0, 8000)}`,
      { maxTokens: 4096 },
    );
    const report = parseReport(reportResponse);

    // Step 2: Select template (or use override)
    let templateId: RemotionCompositionId;
    if (overrideTemplate && ["TechNewsVideo", "QuoteCard", "ProductShowcase", "AudiogramVideo"].includes(overrideTemplate)) {
      templateId = overrideTemplate as RemotionCompositionId;
      logger.info(`Using overridden template: ${templateId}`);
    } else {
      templateId = await this.selectTemplate(report);
      logger.info(`Auto-selected template: ${templateId}`);
    }

    // Step 3: Branch based on template
    let props: Record<string, unknown>;
    let voiceoverUrl: string | undefined;

    if (templateId === "QuoteCard") {
      // Fast path: no TTS, no images
      const quoteProps = await this.generateQuoteCardProps(report);
      props = quoteProps as unknown as Record<string, unknown>;
    } else if (templateId === "ProductShowcase") {
      const result = await this.generateProductShowcaseProps(report, url);
      props = result.props as unknown as Record<string, unknown>;
      voiceoverUrl = result.voiceoverUrl;
      if (result.captions.length > 0) {
        (props as Record<string, unknown>).captions = result.captions;
      }
    } else if (templateId === "AudiogramVideo") {
      // Generate a narration from the report for audiogram
      const scriptResponse = await generateText(
        GENERATE_VIDEO_SCRIPT_PROMPT,
        `Here is the marketing report to create a video script from:\n<report>\n${report}\n</report>\n\nSource URL: ${url}`,
        { maxTokens: 2048 },
      );
      const scriptData = parseVideoScript(scriptResponse);
      const narrationText = (scriptData?.narrationText as string) || report.substring(0, 500);

      const result = await this.generateAudiogramProps(report, narrationText, url);
      props = result.props as unknown as Record<string, unknown>;
      voiceoverUrl = result.voiceoverUrl;
    } else {
      // TechNewsVideo — existing flow
      const scriptResponse = await generateText(
        GENERATE_VIDEO_SCRIPT_PROMPT,
        `Here is the marketing report to create a video script from:\n<report>\n${report}\n</report>\n\nSource URL: ${url}`,
        { maxTokens: 2048 },
      );
      const scriptData = parseVideoScript(scriptResponse);
      if (!scriptData) {
        throw new Error("Failed to parse video script from Claude response");
      }

      const script: VideoScript = {
        headline: (scriptData.headline as string) || "Tech News",
        keyPoints: (scriptData.keyPoints as string[]) || [],
        sourceUrl: (scriptData.sourceUrl as string) || url,
        sourceName: (scriptData.sourceName as string) || new URL(url).hostname,
        narrationText: (scriptData.narrationText as string) || "",
        scenes: (scriptData.scenes as VideoScript["scenes"]) || [],
        accentColor: (scriptData.accentColor as string) || "#e94560",
        backgroundColor: (scriptData.backgroundColor as string) || "#1a1a2e",
      };

      // TTS + AI image generation in parallel (shared helper)
      const media = await this.generateTTSAndImages(
        script.narrationText,
        script.scenes,
      );
      voiceoverUrl = media.voiceoverUrl;

      // Scale scene durations to match TTS audio length
      if (media.ttsDurationMs) {
        const targetDurationSec = media.ttsDurationMs / 1000 + 1.0;
        const currentTotalSec = script.scenes.reduce(
          (sum, s) => sum + s.durationSeconds,
          0,
        );
        const diff = Math.abs(targetDurationSec - currentTotalSec);
        if (diff > 0.5) {
          const scale = targetDurationSec / currentTotalSec;
          logger.info(
            `Scaling scene durations: ${currentTotalSec.toFixed(1)}s -> ${targetDurationSec.toFixed(1)}s (x${scale.toFixed(2)})`,
          );
          for (const scene of script.scenes) {
            scene.durationSeconds = Math.max(1, scene.durationSeconds * scale);
          }
        }
      }

      const FPS = 30;
      const heroImageSceneIdx = script.scenes.findIndex((s) => s.type === "hero_image");
      const generatedHeroImageUrl = heroImageSceneIdx >= 0
        ? media.sceneImageUrls.get(heroImageSceneIdx)
        : undefined;

      const techProps: TechNewsVideoProps = {
        headline: script.headline,
        keyPoints: script.keyPoints,
        sourceUrl: script.sourceUrl,
        sourceName: script.sourceName,
        scenes: script.scenes.map((s, i) => ({
          type: s.type,
          text: s.text,
          subtext: s.subtext,
          durationInFrames: Math.round(s.durationSeconds * FPS),
          imageUrl: media.sceneImageUrls.get(i),
        })),
        voiceoverUrl,
        heroImageUrl: generatedHeroImageUrl,
        accentColor: script.accentColor || "#e94560",
        backgroundColor: script.backgroundColor || "#1a1a2e",
        brandName: "Tech News",
      };

      props = techProps as unknown as Record<string, unknown>;
      if (media.captions.length > 0) {
        (props as Record<string, unknown>).captions = media.captions;
      }
    }

    // Step 4: Generate platform-specific captions
    const captionResponse = await generateText(
      REMOTION_CAPTION_PROMPT,
      `Video template: ${templateId}\nVideo content/props: ${JSON.stringify(props, null, 2).substring(0, 2000)}`,
      { maxTokens: 512 },
    );

    return {
      templateId,
      props,
      voiceoverUrl,
      twitterCaption: truncateToLimit(parseTwitterPost(captionResponse), 280),
      linkedinCaption: parseLinkedinPost(captionResponse),
      report,
    };
  }

  /**
   * Self-critique: score generated content against quality gates.
   * Returns structured pass/fail per gate plus overall verdict.
   */
  async critiqueContent(
    draft: string,
    platform: "twitter" | "linkedin",
    contentType: string,
  ): Promise<ContentCritiqueResult> {
    const platformLimits =
      platform === "twitter"
        ? "Max 280 chars, punchy hook, max 2 hashtags"
        : "~1300 char sweet spot, professional but approachable, line breaks for readability, 3-5 hashtags";

    const response = await generateText(
      `You are a social media quality reviewer. Evaluate the following draft post against these quality gates.
Return ONLY valid JSON matching this schema — no markdown, no code fences:
{
  "gates": [
    { "gate": "relevance", "pass": boolean, "feedback": "..." },
    { "gate": "tone", "pass": boolean, "feedback": "..." },
    { "gate": "length", "pass": boolean, "feedback": "..." },
    { "gate": "originality", "pass": boolean, "feedback": "..." },
    { "gate": "cta", "pass": boolean, "feedback": "..." },
    { "gate": "proofread", "pass": boolean, "feedback": "..." }
  ],
  "critiqueText": "Overall assessment in 1-2 sentences"
}

Gate definitions:
- relevance: Does the post align with a tech-focused audience? Is the content on-topic?
- tone: Does it sound authentic and engaging, not robotic or generic?
- length: Is it within platform limits? Platform: ${platform}. Constraints: ${platformLimits}
- originality: Does it offer a fresh angle rather than a generic take?
- cta: Does it have a clear purpose — engage, inform, or convert?
- proofread: Grammar, spelling, formatting correct?`,
      `Content type: ${contentType}\nPlatform: ${platform}\n\nDraft post:\n${draft}`,
      { maxTokens: 1024, temperature: 0.3 },
    );

    try {
      const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned) as {
        gates: QualityGateResult[];
        critiqueText: string;
      };
      const overallPass = parsed.gates.every((g) => g.pass);
      return {
        overallPass,
        gates: parsed.gates,
        critiqueText: parsed.critiqueText,
      };
    } catch {
      logger.warn("Failed to parse critique response, treating as pass");
      return {
        overallPass: true,
        gates: [],
        critiqueText: "Critique parsing failed — skipping gate",
      };
    }
  }

  /**
   * Refine a draft based on critique feedback.
   * Returns the improved version.
   */
  async refineContent(
    draft: string,
    platform: "twitter" | "linkedin",
    critique: ContentCritiqueResult,
  ): Promise<string> {
    const failedGates = critique.gates
      .filter((g) => !g.pass)
      .map((g) => `- ${g.gate}: ${g.feedback}`)
      .join("\n");

    const platformLimits =
      platform === "twitter"
        ? "Max 280 characters. Lead with a hook. No more than 2 hashtags."
        : "~1300 char sweet spot. Professional but not stiff. Use line breaks for readability. 3-5 hashtags at the end.";

    const response = await generateText(
      `You are a social media content editor. Revise the draft below to address the critique feedback.
Keep the same overall message but fix the issues identified.
Platform: ${platform}. Constraints: ${platformLimits}
Return ONLY the revised post text — no commentary, no quotes, no labels.`,
      `Original draft:\n${draft}\n\nCritique:\n${critique.critiqueText}\n\nFailed quality gates:\n${failedGates}`,
      { maxTokens: 1024, temperature: 0.7 },
    );

    return response.trim();
  }

  /**
   * Run the critique-and-refine loop on a post draft.
   * Critiques the draft; if any gate fails, refines once and returns the improved version.
   */
  private async critiqueAndRefine(
    draft: string,
    platform: "twitter" | "linkedin",
    contentType: string,
  ): Promise<string> {
    const critique = await this.critiqueContent(draft, platform, contentType);

    if (critique.overallPass) {
      logger.info(`Critique passed for ${platform} (all gates ok)`);
      return draft;
    }

    const failedNames = critique.gates
      .filter((g) => !g.pass)
      .map((g) => g.gate)
      .join(", ");
    logger.info(`Critique failed gates for ${platform}: ${failedNames}. Refining...`);

    const refined = await this.refineContent(draft, platform, critique);
    logger.info(`Refinement complete for ${platform} (${refined.length} chars)`);
    return refined;
  }

  /**
   * Process a single queue item end-to-end
   */
  async processQueueItem(item: ContentQueueItem): Promise<void> {
    logger.info(`Processing queue item ${item.id} (type: ${item.type})`);
    activityBus.emitActivity("generation_started", `Generating content for ${item.type} item ${item.id}`, { itemId: item.id, type: item.type });

    try {
      await this.queue.updateItem(item.id, { status: "generating" });

      switch (item.type) {
        case "link": {
          if (!item.content_url) {
            throw new Error("Link item missing content_url");
          }
          const result = await this.generateLinkPost(item.content_url, item.source_text);

          // Self-critique loop: evaluate and refine if needed
          const [refinedTwitter, refinedLinkedin] = await Promise.all([
            this.critiqueAndRefine(result.postTwitter, "twitter", "link"),
            this.critiqueAndRefine(result.postLinkedin, "linkedin", "link"),
          ]);
          result.postTwitter = truncateToLimit(refinedTwitter, 280);
          result.postLinkedin = refinedLinkedin;

          // Check if thread generation is needed
          const updates: Record<string, unknown> = {
            report: result.report,
            generated_post: result.post,
            generated_post_twitter: result.postTwitter,
            generated_post_linkedin: result.postLinkedin,
            image_url: result.imageUrl || null,
            status: "generated",
          };

          if (
            item.is_thread ||
            (result.postTwitter && result.postTwitter.length > 280)
          ) {
            const threadParts = await this.generateThread(
              result.report,
              item.source_text,
            );
            updates.is_thread = true;
            updates.thread_parts = threadParts.map((text) => ({ text }));
            // Use the first part as the Twitter preview
            updates.generated_post_twitter = threadParts[0];
          }

          await this.queue.updateItem(item.id, updates);
          break;
        }

        case "image":
        case "video": {
          const captions = await this.generateMediaCaption(
            item.type,
            item.source_text || `A ${item.type} to share with our audience`,
          );

          // Self-critique loop
          const [refinedMediaTw, refinedMediaLi] = await Promise.all([
            this.critiqueAndRefine(captions.twitter, "twitter", item.type),
            this.critiqueAndRefine(captions.linkedin, "linkedin", item.type),
          ]);

          await this.queue.updateItem(item.id, {
            generated_post: truncateToLimit(refinedMediaTw, 280),
            generated_post_twitter: truncateToLimit(refinedMediaTw, 280),
            generated_post_linkedin: refinedMediaLi,
            status: "generated",
          });
          break;
        }

        case "remotion": {
          if (item.content_url) {
            // URL-based: full video pipeline with scraping + auto template
            const videoResult = await this.generateVideoScript(
              item.content_url,
              item.remotion_template,
            );

            // Pass through logoUrl/heroImageUrl from pre-set remotion_props
            const existingProps = item.remotion_props || {};
            if (existingProps.logoUrl) {
              (videoResult.props as Record<string, unknown>).logoUrl = existingProps.logoUrl;
            }
            if (existingProps.heroImageUrl) {
              (videoResult.props as Record<string, unknown>).heroImageUrl = existingProps.heroImageUrl;
            }

            // Self-critique loop on video captions
            const [refinedVidTw, refinedVidLi] = await Promise.all([
              this.critiqueAndRefine(videoResult.twitterCaption, "twitter", "remotion"),
              this.critiqueAndRefine(videoResult.linkedinCaption, "linkedin", "remotion"),
            ]);
            videoResult.twitterCaption = truncateToLimit(refinedVidTw, 280);
            videoResult.linkedinCaption = refinedVidLi;

            const jobId = await this.remotionService.startRender(
              videoResult.templateId,
              videoResult.props,
            );

            await this.queue.updateItem(item.id, {
              report:
                `Video script generated (${videoResult.templateId}): ${videoResult.report.substring(0, 100)}`,
              generated_post: videoResult.twitterCaption,
              generated_post_twitter: videoResult.twitterCaption,
              generated_post_linkedin: videoResult.linkedinCaption,
              remotion_template: videoResult.templateId,
              remotion_props: {
                ...videoResult.props,
                _renderJobId: jobId,
              } as unknown as Record<string, unknown>,
              status: "rendering",
            });
          } else if (item.source_text && !item.remotion_props) {
            // Topic-based: generate video from topic text (no URL)
            logger.info(`Remotion topic-based pipeline for item ${item.id}: "${item.source_text.substring(0, 80)}"`);
            const videoResult = await this.generateVideoFromTopic(
              item.source_text,
              item.source_text, // creative direction is the full text
              item.remotion_template,
            );

            // Self-critique loop on topic video captions
            const [refinedTopicTw, refinedTopicLi] = await Promise.all([
              this.critiqueAndRefine(videoResult.twitterCaption, "twitter", "remotion"),
              this.critiqueAndRefine(videoResult.linkedinCaption, "linkedin", "remotion"),
            ]);
            videoResult.twitterCaption = truncateToLimit(refinedTopicTw, 280);
            videoResult.linkedinCaption = refinedTopicLi;

            const jobId = await this.remotionService.startRender(
              videoResult.templateId,
              videoResult.props,
            );

            await this.queue.updateItem(item.id, {
              report:
                `Topic video generated (${videoResult.templateId}): ${videoResult.report.substring(0, 100)}`,
              generated_post: videoResult.twitterCaption,
              generated_post_twitter: videoResult.twitterCaption,
              generated_post_linkedin: videoResult.linkedinCaption,
              remotion_template: videoResult.templateId,
              remotion_props: {
                ...videoResult.props,
                _renderJobId: jobId,
              } as unknown as Record<string, unknown>,
              status: "rendering",
            });
          } else {
            // Legacy: pre-set remotion_props, just generate captions
            const captions = await this.generateRemotionCaption(
              item.remotion_template || "default",
              item.remotion_props || {},
            );

            // Self-critique loop on legacy captions
            const [refinedLegTw, refinedLegLi] = await Promise.all([
              this.critiqueAndRefine(captions.twitter, "twitter", "remotion"),
              this.critiqueAndRefine(captions.linkedin, "linkedin", "remotion"),
            ]);

            await this.queue.updateItem(item.id, {
              generated_post: truncateToLimit(refinedLegTw, 280),
              generated_post_twitter: truncateToLimit(refinedLegTw, 280),
              generated_post_linkedin: refinedLegLi,
              status: "rendering",
            });
          }
          break;
        }

        case "text": {
          if (!item.source_text) {
            throw new Error("Text item missing source_text");
          }
          const textResult = await this.generateTextPost(item.source_text);

          // Self-critique loop
          const [refinedTextTw, refinedTextLi] = await Promise.all([
            this.critiqueAndRefine(textResult.twitter, "twitter", "text"),
            this.critiqueAndRefine(textResult.linkedin, "linkedin", "text"),
          ]);

          await this.queue.updateItem(item.id, {
            generated_post: truncateToLimit(refinedTextTw, 280),
            generated_post_twitter: truncateToLimit(refinedTextTw, 280),
            generated_post_linkedin: refinedTextLi,
            status: "generated",
          });
          break;
        }

        case "video_edit": {
          // Video edit items: generate captions for the edited video.
          // The video rendering itself is handled by VideoEditorAgent (kicked off by slack-listener).
          // By the time this runs, the item may already have a media_url from the rendered project.
          logger.info(`Video edit item ${item.id} — generating captions`);
          const videoEditContext = item.source_text || "Edited video content";
          const videoEditCaptions = await this.generateTextPost(
            `Write social media captions for this video: ${videoEditContext}. ` +
            `The video is an edited compilation. Write engaging captions that match the creative direction.`,
          );

          // Self-critique loop
          const [refinedEditTw, refinedEditLi] = await Promise.all([
            this.critiqueAndRefine(videoEditCaptions.twitter, "twitter", "video_edit"),
            this.critiqueAndRefine(videoEditCaptions.linkedin, "linkedin", "video_edit"),
          ]);

          await this.queue.updateItem(item.id, {
            generated_post: truncateToLimit(refinedEditTw, 280),
            generated_post_twitter: truncateToLimit(refinedEditTw, 280),
            generated_post_linkedin: refinedEditLi,
            status: "generated",
          });
          break;
        }

        default:
          throw new Error(`Unknown content type: ${item.type}`);
      }

      logger.info(`Successfully processed item ${item.id}`);
      activityBus.emitActivity("generation_completed", `Content generated for ${item.type} item ${item.id}`, { itemId: item.id, type: item.type });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      await this.queue.markFailed(item.id, message);
      logger.error(`Failed to process item ${item.id}: ${message}`);
    }
  }
}

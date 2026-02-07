import { generateText } from "../utils/model.js";
import { parseIntake } from "../utils/text.js";
import { INTAKE_PROMPT } from "../prompts/index.js";
import { extractUrlsFromSlackText } from "../utils/urls.js";
import { GeminiService } from "./gemini-service.js";
import { logger } from "../utils/logger.js";
import type { IntakeResult, ContentType } from "../types/index.js";

export class IntakeService {
  private gemini: GeminiService | null;

  constructor(gemini?: GeminiService) {
    this.gemini = gemini || null;
  }

  async analyzeMessage(
    text: string,
    hasFiles: boolean,
    fileTypes: string[],
    imageBuffers?: Buffer[],
  ): Promise<IntakeResult> {
    try {
      // If images are attached and Gemini is available, analyze them visually
      let imageContext = "";
      if (imageBuffers?.length && this.gemini?.isAvailable) {
        imageContext = await this.analyzeImages(imageBuffers);
      }

      const prompt = INTAKE_PROMPT.replace(
        "{{TODAY_DATE}}",
        new Date().toISOString().split("T")[0],
      );

      const fileContext = hasFiles
        ? `\n\nAttached files: ${fileTypes.join(", ")}`
        : "";

      const visionContext = imageContext
        ? `\n\nImage analysis (from Gemini Vision):\n${imageContext}`
        : "";

      const response = await generateText(
        prompt,
        `Slack message: "${text}"${fileContext}${visionContext}`,
        { maxTokens: 512, temperature: 0.1 },
      );

      const parsed = parseIntake(response);
      if (!parsed) {
        logger.warn("Failed to parse intake response, using fallback");
        return this.fallbackClassification(text, hasFiles, fileTypes);
      }

      return {
        contentType: this.validateContentType(
          parsed.contentType as string,
          text,
          hasFiles,
          fileTypes,
        ),
        url: (parsed.url as string) || null,
        scheduling: {
          intent: this.validateSchedulingIntent(
            (parsed.scheduling as Record<string, unknown>)?.intent as string,
          ),
          date:
            ((parsed.scheduling as Record<string, unknown>)
              ?.date as string) || null,
        },
        platform: this.validatePlatform(parsed.platform as string),
        creativeDirection: (parsed.creativeDirection as string) || null,
        priority: this.validatePriority(parsed.priority as number),
        summary: (parsed.summary as string) || "Message queued for posting",
        imageAnalysis: imageContext || undefined,
      };
    } catch (error) {
      logger.error(`IntakeService.analyzeMessage failed: ${error}`);
      return this.fallbackClassification(text, hasFiles, fileTypes);
    }
  }

  /**
   * Analyze uploaded images using Gemini 3 Flash vision.
   * Returns a text description of the image content for better classification and caption generation.
   */
  private async analyzeImages(imageBuffers: Buffer[]): Promise<string> {
    if (!this.gemini?.isAvailable) return "";

    try {
      const inputs = imageBuffers.slice(0, 5).map((buf) => ({
        type: "image" as const,
        data: buf,
        mimeType: "image/png",
        mediaResolution: "media_resolution_medium" as const,
      }));

      const result = await this.gemini.analyzeVision(
        `Analyze these images that a user wants to post on social media.
For each image, describe:
1. What the image shows (subject, setting, action)
2. Any text, logos, or branding visible
3. The mood/tone of the image
4. What type of social media post this would work best for
5. Suggested caption themes

Be concise — this will be used to help classify and generate captions for the post.`,
        inputs,
        { model: "flash", maxTokens: 1024, thinkingLevel: "low" },
      );

      logger.info(`Vision analysis complete for ${imageBuffers.length} image(s)`);
      return result;
    } catch (err) {
      logger.warn(`Image vision analysis failed: ${err}`);
      return "";
    }
  }

  private fallbackClassification(
    text: string,
    hasFiles: boolean,
    fileTypes: string[],
  ): IntakeResult {
    const urls = extractUrlsFromSlackText(text);
    const hasUrl = urls.length > 0;
    const lower = text.toLowerCase();
    const wantsVideo =
      lower.includes("remotion") ||
      lower.includes("generate a video") ||
      lower.includes("make a video") ||
      lower.includes("create a video");
    const wantsVideoEdit =
      lower.includes("edit this") ||
      lower.includes("trim this") ||
      lower.includes("cut the") ||
      lower.includes("add music") ||
      lower.includes("edit the video");

    let contentType: ContentType = "text";
    if (wantsVideoEdit && hasFiles) {
      contentType = "video_edit";
    } else if (wantsVideo) {
      contentType = "remotion";
    } else if (hasUrl) {
      contentType = "link";
    } else if (hasFiles) {
      const hasVideo = fileTypes.some((t) => t.startsWith("video/"));
      const hasImage = fileTypes.some((t) => t.startsWith("image/"));
      if (hasVideo) contentType = "video";
      else if (hasImage) contentType = "image";
    }

    return {
      contentType,
      url: hasUrl ? urls[0] : null,
      scheduling: { intent: "next_available", date: null },
      platform: "both",
      creativeDirection: null,
      priority: 1,
      summary: `${contentType} queued for posting`,
    };
  }

  private validateContentType(
    value: string,
    text: string,
    hasFiles: boolean,
    fileTypes: string[],
  ): ContentType {
    const valid: ContentType[] = ["link", "image", "video", "remotion", "text", "video_edit"];
    if (valid.includes(value as ContentType)) return value as ContentType;

    // Fall back to detection
    const urls = extractUrlsFromSlackText(text);
    if (urls.length > 0) return "link";
    if (hasFiles) {
      if (fileTypes.some((t) => t.startsWith("video/"))) return "video";
      if (fileTypes.some((t) => t.startsWith("image/"))) return "image";
    }
    return "text";
  }

  private validateSchedulingIntent(
    value: string,
  ): IntakeResult["scheduling"]["intent"] {
    const valid = [
      "next_available",
      "asap",
      "specific_date",
      "this_week",
    ] as const;
    if (valid.includes(value as (typeof valid)[number]))
      return value as IntakeResult["scheduling"]["intent"];
    return "next_available";
  }

  private validatePlatform(value: string): IntakeResult["platform"] {
    const valid = ["both", "twitter", "linkedin"] as const;
    if (valid.includes(value as (typeof valid)[number]))
      return value as IntakeResult["platform"];
    return "both";
  }

  private validatePriority(value: number): number {
    if (value >= 1 && value <= 3) return value;
    return 1;
  }
}

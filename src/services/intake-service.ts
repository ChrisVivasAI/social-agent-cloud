import { generateText } from "../utils/model.js";
import { parseIntake } from "../utils/text.js";
import { INTAKE_PROMPT } from "../prompts/index.js";
import { extractUrlsFromSlackText } from "../utils/urls.js";
import { logger } from "../utils/logger.js";
import type { IntakeResult, ContentType } from "../types/index.js";

export class IntakeService {
  async analyzeMessage(
    text: string,
    hasFiles: boolean,
    fileTypes: string[],
  ): Promise<IntakeResult> {
    try {
      const prompt = INTAKE_PROMPT.replace(
        "{{TODAY_DATE}}",
        new Date().toISOString().split("T")[0],
      );

      const fileContext = hasFiles
        ? `\n\nAttached files: ${fileTypes.join(", ")}`
        : "";

      const response = await generateText(
        prompt,
        `Slack message: "${text}"${fileContext}`,
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
      };
    } catch (error) {
      logger.error(`IntakeService.analyzeMessage failed: ${error}`);
      return this.fallbackClassification(text, hasFiles, fileTypes);
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

    let contentType: ContentType = "text";
    if (wantsVideo) {
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
    const valid: ContentType[] = ["link", "image", "video", "remotion", "text"];
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

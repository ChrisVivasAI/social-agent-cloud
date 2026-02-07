import { TwitterClient } from "../clients/twitter.js";
import { LinkedInClient } from "../clients/linkedin.js";
import { imageUrlToBuffer } from "../utils/media.js";
import { truncateToLimit } from "../utils/text.js";
import { getConfig } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { createSupabaseClient } from "../utils/supabase.js";
import type { ContentQueueItem, PostResult, MediaPayload } from "../types/index.js";

export class PostingService {
  private twitterClient: TwitterClient;
  private linkedInClient: LinkedInClient;

  constructor() {
    this.twitterClient = TwitterClient.fromEnv();
    this.linkedInClient = LinkedInClient.fromEnv();
  }

  /**
   * Post to all configured platforms
   */
  async postToAll(item: ContentQueueItem): Promise<PostResult> {
    const config = getConfig();
    const result: PostResult = { success: false, errors: [] };

    if (config.DRY_RUN) {
      logger.info(`[DRY RUN] Would post: ${item.generated_post?.substring(0, 100)}...`);
      result.success = true;
      result.twitterPostId = "dry-run-tweet-id";
      result.linkedinPostId = "dry-run-linkedin-id";
      return result;
    }

    // Prepare media if available
    let media: MediaPayload | undefined;
    const mediaUrl = item.remotion_video_url || item.media_url || item.image_url;
    if (mediaUrl) {
      try {
        media = await this.prepareMedia(mediaUrl, item);
      } catch (error) {
        logger.warn(`Failed to prepare media: ${error}`);
      }
    }

    const platform = item.platform || "both";

    // Use platform-specific posts, falling back to generated_post with truncation
    const fallbackPost = item.generated_post || "";
    const twitterText =
      item.generated_post_twitter || truncateToLimit(fallbackPost, 280);
    const linkedinText = item.generated_post_linkedin || fallbackPost;

    // Post to Twitter
    if (platform === "twitter" || platform === "both") {
      try {
        if (item.is_thread && item.thread_parts && item.thread_parts.length > 0) {
          // Post as a thread
          const firstTweetId = await this.postThread(item.thread_parts, media);
          result.twitterPostId = firstTweetId;
          logger.info(`Posted thread to Twitter: ${firstTweetId}`);
        } else {
          const tweetResult = await this.postToTwitter(twitterText, media);
          result.twitterPostId = tweetResult;
          logger.info(`Posted to Twitter: ${tweetResult}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Twitter: ${msg}`);
        logger.error(`Failed to post to Twitter: ${msg}`);
      }
    }

    // Post to LinkedIn
    if (platform === "linkedin" || platform === "both") {
      try {
        const linkedinResult = await this.postToLinkedIn(linkedinText, media);
        result.linkedinPostId = linkedinResult;
        logger.info(`Posted to LinkedIn: ${linkedinResult}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`LinkedIn: ${msg}`);
        logger.error(`Failed to post to LinkedIn: ${msg}`);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  private async postToTwitter(
    text: string,
    media?: MediaPayload,
  ): Promise<string> {
    const result = await this.twitterClient.uploadTweet({
      text,
      media: media
        ? {
            buffer: media.buffer,
            type: "IMAGE",
            mimeType: media.mimeType,
            isVideo: media.isVideo,
          }
        : undefined,
    });
    return result.data.id;
  }

  private async postToLinkedIn(
    text: string,
    media?: MediaPayload,
  ): Promise<string> {
    if (media && media.isVideo) {
      const result = await this.linkedInClient.createVideoPost({
        text,
        media: {
          buffer: media.buffer,
          type: "IMAGE",
          mimeType: media.mimeType,
        },
      });
      return result.id || "posted";
    }

    if (media && !media.isVideo) {
      const result = await this.linkedInClient.createImagePost({
        text,
        media: {
          buffer: media.buffer,
          type: "IMAGE",
          mimeType: media.mimeType,
        },
      });
      return result.id || "posted";
    }

    const result = await this.linkedInClient.createPost({ text });
    return result.id || "posted";
  }

  private async postThread(
    threadParts: Array<{ text: string; media_url?: string }>,
    media?: MediaPayload,
  ): Promise<string> {
    // Post first tweet with media
    const firstResult = await this.twitterClient.uploadTweet({
      text: threadParts[0].text,
      media: media
        ? {
            buffer: media.buffer,
            type: "IMAGE",
            mimeType: media.mimeType,
            isVideo: media.isVideo,
          }
        : undefined,
    });
    let previousTweetId = firstResult.data.id;

    // Chain replies for remaining parts
    for (let i = 1; i < threadParts.length; i++) {
      const replyResult = await this.twitterClient.replyToTweet(
        previousTweetId,
        threadParts[i].text,
      );
      previousTweetId = replyResult.data.id;
    }

    return firstResult.data.id;
  }

  private async prepareMedia(
    mediaUrl: string,
    item: ContentQueueItem,
  ): Promise<MediaPayload> {
    // If it's a Supabase storage URL, download via SDK
    if (mediaUrl.includes("supabase") && mediaUrl.includes("/storage/")) {
      const supabase = createSupabaseClient();
      const pathMatch = mediaUrl.match(/\/storage\/v1\/object\/public\/(.+)/);
      if (pathMatch) {
        const [bucket, ...pathParts] = pathMatch[1].split("/");
        const filePath = pathParts.join("/");
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(filePath);
        if (error) throw error;
        const buffer = Buffer.from(await data.arrayBuffer());

        // Validate the downloaded content is actual media, not an HTML error page
        const head = buffer.subarray(0, 50).toString("utf-8").trim().toLowerCase();
        if (head.startsWith("<!doctype") || head.startsWith("<html")) {
          throw new Error(
            `Media file is HTML, not valid media (${buffer.length} bytes). The stored file may be corrupt.`,
          );
        }

        const isVideo = item.type === "video" || item.type === "remotion";
        return {
          buffer,
          mimeType: item.media_mime_type || (isVideo ? "video/mp4" : "image/jpeg"),
          isVideo,
        };
      }
    }

    // Regular URL download
    const { buffer, contentType } = await imageUrlToBuffer(mediaUrl);

    const head = buffer.subarray(0, 50).toString("utf-8").trim().toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) {
      throw new Error(
        `Media file is HTML, not valid media (${buffer.length} bytes). The URL may be returning an error page.`,
      );
    }

    return {
      buffer,
      mimeType: contentType,
      isVideo: contentType.startsWith("video/"),
    };
  }

}

import type { WebClient } from "@slack/web-api";
import {
  buildWeeklyDigest,
  buildPrePostNotification,
  buildPostedCard,
} from "../utils/slack-blocks.js";
import { logger } from "../utils/logger.js";
import type { ContentQueueItem, PostResult } from "../types/index.js";

export class SlackNotificationService {
  constructor(
    private webClient: WebClient,
    private channelId: string,
  ) {}

  async sendWeeklyDigest(items: ContentQueueItem[]): Promise<void> {
    try {
      const blocks = buildWeeklyDigest(items);
      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: `Weekly digest: ${items.length} posts scheduled this week`,
        blocks,
      });
      logger.info(`Sent weekly digest with ${items.length} items`);
    } catch (error) {
      logger.error(`Failed to send weekly digest: ${error}`);
    }
  }

  async sendPrePostNotification(item: ContentQueueItem): Promise<void> {
    try {
      const blocks = buildPrePostNotification(item);
      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: `Posting soon: ${item.type} scheduled for ${item.scheduled_for}`,
        blocks,
      });
      logger.info(`Sent pre-post notification for item ${item.id}`);
    } catch (error) {
      logger.error(
        `Failed to send pre-post notification for ${item.id}: ${error}`,
      );
    }
  }

  async sendPostConfirmation(
    item: ContentQueueItem,
    result: PostResult,
  ): Promise<void> {
    try {
      const twitterUrl = result.twitterPostId
        ? `https://twitter.com/i/status/${result.twitterPostId}`
        : undefined;

      const blocks = buildPostedCard(item, twitterUrl, result.linkedinPostId);
      await this.webClient.chat.postMessage({
        channel: this.channelId,
        text: result.success
          ? `Post published successfully!`
          : `Post completed with errors`,
        blocks,
      });
      logger.info(`Sent post confirmation for item ${item.id}`);
    } catch (error) {
      logger.error(
        `Failed to send post confirmation for ${item.id}: ${error}`,
      );
    }
  }
}

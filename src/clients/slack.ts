import { WebClient, ConversationsHistoryResponse } from "@slack/web-api";
import { subHours } from "date-fns";

// Slack does not export their message type so we must extract it from another type they expose.
export type SlackMessage = NonNullable<
  NonNullable<ConversationsHistoryResponse["messages"]>[number]
>;
export type SlackMessageAttachment = NonNullable<
  NonNullable<SlackMessage["attachments"]>[number]
>;
export type SlackMessageFile = NonNullable<
  NonNullable<SlackMessage["files"]>[number]
>;

export interface SimpleSlackMessage {
  id: string;
  timestamp: string;
  username?: string;
  user?: string;
  text: string;
  type: string;
  attachments?: SlackMessageAttachment[];
  files?: SlackMessageFile[];
}

export interface SlackClientArgs {
  /**
   * An OAuth token for the Slack API.
   * If not provided, the token will be read from the SLACK_BOT_OAUTH_TOKEN environment variable.
   */
  token?: string;
  /**
   * The channel ID to fetch messages from.
   * Optional, if not provided a channel name must be provided.
   */
  channelId?: string;
  /**
   * The channel name to fetch messages from.
   * Optional, if not provided a channel ID must be provided.
   */
  channelName?: string;
}

/**
 * Wrapper around the Slack SDK for fetching messages from a channel.
 * Required scopes:
 * - 'groups:read' - used to get channel IDs from names
 * - 'channels:history' - used to fetch messages from a channel
 * - 'channels:read' - used to fetch message contents from a channel.
 */
export class SlackClient {
  private client: WebClient;

  private channelId: string;

  private channelName: string;

  constructor(args: SlackClientArgs) {
    if (!args.channelId && !args.channelName) {
      throw new Error("Either channelId or channelName must be provided");
    }

    const slackToken = process.env.SLACK_BOT_OAUTH_TOKEN || args.token;
    this.client = new WebClient(slackToken);
    this.channelId = args.channelId || "";
    this.channelName = args.channelName || "";
  }

  private convertSlackMessageToSimpleMessage(
    messages: SlackMessage[],
  ): SimpleSlackMessage[] {
    const messagesWithContent = messages.filter((m) => {
      if (
        m.type !== "message" ||
        (!m.username && !m.text) ||
        !m.text ||
        !m.ts
      ) {
        return false;
      }
      return true;
    });

    return messagesWithContent.map((m) => ({
      id: m.client_msg_id,
      timestamp: m.ts,
      username: m.username,
      user: m.user,
      text: m.text,
      type: m.type,
      attachments: m.attachments,
      files: m.files,
    })) as SimpleSlackMessage[];
  }

  async fetchLast24HoursMessages({
    maxMessages,
    maxDaysHistory,
  }: {
    maxMessages?: number;
    maxDaysHistory?: number;
  }): Promise<SimpleSlackMessage[]> {
    if (!this.channelId) {
      this.channelId = await this.getChannelId(this.channelName);
    }

    try {
      const getHours = maxDaysHistory !== undefined ? maxDaysHistory * 24 : 24;
      const oldest = Math.floor(subHours(new Date(), getHours).getTime() / 1000).toString();
      const messages: SlackMessage[] = [];
      let cursor: string | undefined;

      do {
        // Adjust limit based on maxMessages
        const limit =
          maxMessages && maxMessages - messages.length < 100
            ? maxMessages - messages.length
            : 100;

        const result = await this.client.conversations.history({
          channel: this.channelId,
          oldest: oldest,
          limit: limit,
          cursor: cursor,
        });

        if (result.messages && Array.isArray(result.messages)) {
          messages.push(...result.messages);
        }

        cursor = (result.response_metadata?.next_cursor as string) || undefined;

        // Break the loop if we've reached maxMessages
        if (maxMessages && messages.length >= maxMessages) {
          break;
        }
      } while (cursor);

      // Trim any excess messages if we went over maxMessages
      return this.convertSlackMessageToSimpleMessage(
        maxMessages ? messages.slice(0, maxMessages) : messages,
      );
    } catch (error) {
      console.error("Error fetching Slack messages:", error);
      throw error;
    }
  }

  // Helper method to get channel ID from channel name
  async getChannelId(name?: string): Promise<string> {
    const channelName = name || this.channelName;
    if (!channelName) {
      throw new Error(
        "Channel name not provided in method arguments, or found in client instance.",
      );
    }

    try {
      let cursor: string | undefined;

      do {
        const result = await this.client.conversations.list({
          exclude_archived: true,
          types: "public_channel,private_channel",
          limit: 100,
          cursor,
        });

        const channel = result.channels?.find((c) => c.name === channelName);
        if (channel?.id) {
          return channel.id;
        }

        cursor = (result.response_metadata?.next_cursor as string) || undefined;
      } while (cursor);

      throw new Error(`Channel ${channelName} not found`);
    } catch (error) {
      console.error("Error getting channel ID:", error);
      throw error;
    }
  }

  async sendMessage(message: string): Promise<void> {
    await this.client.chat.postMessage({
      channel: this.channelId,
      text: message,
    });
  }
}

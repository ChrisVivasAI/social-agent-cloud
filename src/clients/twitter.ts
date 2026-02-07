import { TwitterApi } from "twitter-api-v2";
import type { EngagementMetrics } from "../types/index.js";

interface TwitterPostOptions {
  text: string;
  media?: {
    url?: string;
    buffer?: Buffer;
    type: "IMAGE";
    mimeType?: string;
    isVideo?: boolean;
  };
}

export class TwitterClient {
  private client: TwitterApi;

  constructor(config: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }) {
    this.client = new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessSecret,
    });
  }

  static fromEnv(): TwitterClient {
    if (!process.env.TWITTER_API_KEY) throw new Error("Missing TWITTER_API_KEY");
    if (!process.env.TWITTER_API_KEY_SECRET) throw new Error("Missing TWITTER_API_KEY_SECRET");
    if (!process.env.TWITTER_USER_TOKEN) throw new Error("Missing TWITTER_USER_TOKEN");
    if (!process.env.TWITTER_USER_TOKEN_SECRET) throw new Error("Missing TWITTER_USER_TOKEN_SECRET");

    return new TwitterClient({
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_USER_TOKEN,
      accessSecret: process.env.TWITTER_USER_TOKEN_SECRET,
    });
  }

  async testAuthentication(): Promise<boolean> {
    try {
      const user = await this.client.v2.me();
      return !!user;
    } catch (error) {
      return false;
    }
  }

  async uploadMedia(mediaBuffer: Buffer, isVideo: boolean = false): Promise<string> {
    try {
      const mediaId = await this.client.v1.uploadMedia(mediaBuffer, {
        mimeType: isVideo ? "video/mp4" : "image/jpeg",
      });
      return mediaId;
    } catch (error) {
      console.error("Error uploading media:", error);
      throw error;
    }
  }

  async getTweetMetrics(tweetId: string): Promise<EngagementMetrics> {
    try {
      const result = await this.client.v2.singleTweet(tweetId, {
        "tweet.fields": ["public_metrics"],
      });
      const metrics = result.data.public_metrics;
      const likes = metrics?.like_count || 0;
      const retweets = metrics?.retweet_count || 0;
      const comments = metrics?.reply_count || 0;
      const impressions = metrics?.impression_count || 0;
      const engagementRate =
        impressions > 0 ? (likes + retweets + comments) / impressions : 0;
      return { likes, retweets, comments, impressions, engagementRate };
    } catch (error) {
      console.error("Error fetching tweet metrics:", error);
      throw error;
    }
  }

  async replyToTweet(
    inReplyToTweetId: string,
    text: string,
    media?: { buffer: Buffer; isVideo?: boolean },
  ): Promise<any> {
    try {
      const tweetOptions: Record<string, unknown> = {
        reply: { in_reply_to_tweet_id: inReplyToTweetId },
      };

      if (media?.buffer) {
        const mediaId = await this.uploadMedia(
          media.buffer,
          media.isVideo || false,
        );
        tweetOptions.media = { media_ids: [mediaId] };
      }

      const result = await this.client.v2.tweet(text, tweetOptions);
      console.log("Reply tweet created:", result.data.id);
      return result;
    } catch (error) {
      console.error("Error replying to tweet:", error);
      throw error;
    }
  }

  async uploadTweet(request: TwitterPostOptions): Promise<any> {
    console.log("Creating Twitter post with options:", request);

    try {
      if (request.media?.buffer) {
        // First upload the media
        const mediaId = await this.uploadMedia(request.media.buffer, request.media.isVideo);
        
        // Then create tweet with media
        const result = await this.client.v2.tweet(request.text, {
          media: { media_ids: [mediaId] },
        });
        
        console.log("\n✅ Media tweet created successfully!");
        console.log("Tweet ID:", result.data.id);
        return result;
      } else {
        // Text-only tweet
        const result = await this.client.v2.tweet(request.text);
        console.log("\n✅ Text tweet created successfully!");
        console.log("Tweet ID:", result.data.id);
        return result;
      }
    } catch (error) {
      console.error("Error creating tweet:", error);
      throw error;
    }
  }
} 
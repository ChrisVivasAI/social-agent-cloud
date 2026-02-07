import type { EngagementMetrics } from "../types/index.js";

interface LinkedInPostOptions {
  text: string;
  media?: {
    url?: string;
    buffer?: Buffer;
    type: "IMAGE";
    mimeType?: string;
  };
}

export class LinkedInClient {
  private accessToken: string;
  private baseURL = "https://api.linkedin.com/v2";

  constructor(config: { accessToken: string }) {
    this.accessToken = config.accessToken;
  }

  static fromEnv(): LinkedInClient {
    if (!process.env.LINKEDIN_ACCESS_TOKEN) {
      throw new Error("Missing LINKEDIN_ACCESS_TOKEN");
    }

    return new LinkedInClient({
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    });
  }

  async testAuthentication(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/userinfo`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getPostMetrics(postUrn: string): Promise<EngagementMetrics> {
    try {
      const encodedUrn = encodeURIComponent(postUrn);
      const response = await fetch(
        `${this.baseURL}/socialActions/${encodedUrn}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get LinkedIn metrics: ${response.statusText}`);
      }

      const data = await response.json();
      const likes = data.likesSummary?.totalLikes || 0;
      const comments = data.commentsSummary?.totalFirstLevelComments || 0;
      // LinkedIn basic API doesn't provide impressions
      return {
        likes,
        retweets: 0,
        comments,
        impressions: 0,
        engagementRate: 0,
      };
    } catch (error) {
      console.error("Error fetching LinkedIn metrics:", error);
      throw error;
    }
  }

  async createPost(options: LinkedInPostOptions): Promise<any> {
    console.log("Creating LinkedIn post with options:", options);

    const authorId = await this.getAuthorId();
    const postData = {
      author: `urn:li:person:${authorId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: options.text,
          },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const response = await fetch(`${this.baseURL}/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create LinkedIn post: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    console.log("LinkedIn post created:", result);
    return result;
  }

  async createImagePost(options: LinkedInPostOptions): Promise<any> {
    if (!options.media?.buffer) {
      throw new Error("Image buffer is required for image posts");
    }

    console.log("Creating LinkedIn image post...");
    const imageBuffer = options.media.buffer;
    const authorId = await this.getAuthorId();

    try {
      // 1. Register the image upload
      console.log("1. Registering image upload...");
      const registerResponse = await fetch(
        `${this.baseURL}/assets?action=registerUpload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: `urn:li:person:${authorId}`,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          }),
        }
      );

      if (!registerResponse.ok) {
        const error = await registerResponse.json();
        throw new Error(
          `Failed to register image upload: ${JSON.stringify(error)}`
        );
      }

      const {
        value: { uploadMechanism, asset },
      } = await registerResponse.json();

      // 2. Upload the image
      console.log("2. Uploading image...");
      const uploadUrl = uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: imageBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload image: ${uploadResponse.statusText}`);
      }

      // 3. Create the post with the image
      console.log("3. Creating post with image...");
      const postData = {
        author: `urn:li:person:${authorId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: options.text,
            },
            shareMediaCategory: "IMAGE",
            media: [
              {
                status: "READY",
                description: {
                  text: "Image",
                },
                media: asset,
                title: {
                  text: "Image",
                },
              },
            ],
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      const postResponse = await fetch(`${this.baseURL}/ugcPosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postData),
      });

      if (!postResponse.ok) {
        const error = await postResponse.json();
        throw new Error(
          `Failed to create LinkedIn post: ${JSON.stringify(error)}`
        );
      }

      const result = await postResponse.json();
      console.log("\n✅ Image post created successfully!");
      console.log("Post ID:", result.id);
      return result;
    } catch (error) {
      console.error("Error creating image post:", error);
      throw error;
    }
  }

  async createVideoPost(options: LinkedInPostOptions): Promise<any> {
    if (!options.media?.buffer) {
      throw new Error("Video buffer is required for video posts");
    }

    console.log("Creating LinkedIn video post...");
    const videoBuffer = options.media.buffer;
    const authorId = await this.getAuthorId();

    try {
      // 1. Register the video upload
      console.log("1. Registering video upload...");
      const registerResponse = await fetch(
        `${this.baseURL}/assets?action=registerUpload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
              owner: `urn:li:person:${authorId}`,
              serviceRelationships: [
                {
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent",
                },
              ],
            },
          }),
        }
      );

      if (!registerResponse.ok) {
        const error = await registerResponse.json();
        throw new Error(
          `Failed to register video upload: ${JSON.stringify(error)}`
        );
      }

      const {
        value: { uploadMechanism, asset },
      } = await registerResponse.json();

      // 2. Upload the video
      console.log("2. Uploading video...");
      const uploadUrl = uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: videoBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload video: ${uploadResponse.statusText}`);
      }

      // 3. Create the post with the video
      console.log("3. Creating post with video...");
      const postData = {
        author: `urn:li:person:${authorId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: options.text,
            },
            shareMediaCategory: "VIDEO",
            media: [
              {
                status: "READY",
                description: {
                  text: "Video",
                },
                media: asset,
                title: {
                  text: "Video",
                },
              },
            ],
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      const postResponse = await fetch(`${this.baseURL}/ugcPosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postData),
      });

      if (!postResponse.ok) {
        const error = await postResponse.json();
        throw new Error(
          `Failed to create LinkedIn video post: ${JSON.stringify(error)}`
        );
      }

      const result = await postResponse.json();
      console.log("\n✅ Video post created successfully!");
      console.log("Post ID:", result.id);
      return result;
    } catch (error) {
      console.error("Error creating video post:", error);
      throw error;
    }
  }

  private async getAuthorId(): Promise<string> {
    const response = await fetch(`${this.baseURL}/userinfo`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get author ID");
    }

    const data = await response.json();
    return data.sub;
  }
}
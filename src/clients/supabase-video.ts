import { createClient } from "@supabase/supabase-js";

interface VideoMetadata {
  title: string;
  description?: string;
  uploadedAt: string;
  lastUsedAt?: string;
  duration?: number;
}

export class SupabaseVideoClient {
  private client;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Missing Supabase credentials.\n" +
        `SUPABASE_URL: ${!!process.env.SUPABASE_URL}\n` +
        `SUPABASE_SERVICE_ROLE_KEY: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}\n`
      );
    }

    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Get a list of available videos from the videos bucket, ordered by upload date
   */
  async listVideos(): Promise<{ name: string; metadata: VideoMetadata }[]> {
    const { data, error } = await this.client.storage
      .from("videos")
      .list("", {
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) {
      throw new Error(`Failed to list videos: ${error.message}`);
    }

    // Filter out empty folder placeholder and non-video files
    const videoFiles = data.filter(file => 
      file.name !== '.emptyFolderPlaceholder' && 
      file.name.match(/\.(mp4|mov|avi|wmv)$/i)
    );

    if (videoFiles.length === 0) {
      throw new Error("No video files found in the bucket");
    }

    return videoFiles.map(file => ({
      name: file.name,
      metadata: file.metadata as VideoMetadata || {
        title: file.name,
        uploadedAt: file.created_at,
      }
    }));
  }

  /**
   * Get a video that hasn't been used yet or was used longest time ago
   */
  async getNextVideo(): Promise<{
    videoUrl: string;
    metadata: VideoMetadata;
    name: string;
  }> {
    const videos = await this.listVideos();
    
    // Sort by lastUsedAt (null/undefined first, then by date ascending)
    const sortedVideos = videos.sort((a, b) => {
      if (!a.metadata.lastUsedAt) return -1;
      if (!b.metadata.lastUsedAt) return 1;
      return new Date(a.metadata.lastUsedAt).getTime() - new Date(b.metadata.lastUsedAt).getTime();
    });

    if (sortedVideos.length === 0) {
      throw new Error("No videos found in the bucket");
    }

    const nextVideo = sortedVideos[0];

    // Extract title from filename if metadata doesn't have it
    if (!nextVideo.metadata.title) {
      const filename = nextVideo.name;
      // Remove file extension and decode URL-encoded characters
      const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""))
        // Replace underscores and hyphens with spaces
        .replace(/[_-]/g, " ")
        // Capitalize first letter of each word
        .replace(/\b\w/g, l => l.toUpperCase());
      
      nextVideo.metadata.title = title;
    }

    // Get the public URL for the video
    const { data: { publicUrl } } = this.client.storage
      .from("videos")
      .getPublicUrl(nextVideo.name);

    return {
      videoUrl: publicUrl,
      metadata: nextVideo.metadata,
      name: nextVideo.name
    };
  }

  /**
   * Mark a video as used by updating its lastUsedAt timestamp
   */
  async markVideoAsUsed(videoName: string): Promise<void> {
    const { data: existingFile } = await this.client.storage
      .from("videos")
      .list("", {
        search: videoName
      });

    if (!existingFile || existingFile.length === 0) {
      throw new Error(`Video ${videoName} not found`);
    }

    const currentMetadata = existingFile[0].metadata as VideoMetadata;
    const updatedMetadata: VideoMetadata = {
      ...currentMetadata,
      lastUsedAt: new Date().toISOString()
    };

    // Update the file's metadata by uploading an empty file with new metadata
    const { error } = await this.client.storage
      .from("videos")
      .upload(videoName, new Uint8Array(0), {
        metadata: updatedMetadata,
        upsert: true
      });

    if (error) {
      throw new Error(`Failed to update video metadata: ${error.message}`);
    }
  }
} 
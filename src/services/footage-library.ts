import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import { GeminiService } from "./gemini-service.js";
import { FFmpegService } from "./ffmpeg-service.js";
import type { FootageAsset } from "../types/index.js";

// ---------------------------------------------------------------------------
// Gemini analysis response shapes
// ---------------------------------------------------------------------------

interface FlashFrameAnalysis {
  timestamp_ms: number;
  description: string;
  is_interesting: boolean;
  interest_reasons: string[];
  visual_quality: number; // 1-10
}

interface FlashScanResult {
  frames: FlashFrameAnalysis[];
  overall_summary: string;
  interesting_segments: Array<{
    start_ms: number;
    end_ms: number;
    reason: string;
  }>;
}

interface ProAnalysisResult {
  scene_boundaries: Array<{
    start_ms: number;
    end_ms: number;
    description: string;
    tags: string[];
  }>;
  key_moments: Array<{
    timestamp_ms: number;
    description: string;
    importance: number;
  }>;
  tags: string[];
  emotional_tone: string;
  quality_score: number;
  best_moments_for_editing: Array<{
    timestamp_ms: number;
    reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// FootageLibraryService
// ---------------------------------------------------------------------------

export class FootageLibraryService {
  private gemini: GeminiService;
  private ffmpeg: FFmpegService;

  constructor(gemini: GeminiService, ffmpeg: FFmpegService) {
    this.gemini = gemini;
    this.ffmpeg = ffmpeg;
  }

  // -------------------------------------------------------------------------
  // Ingest from URL
  // -------------------------------------------------------------------------

  async ingestFromUrl(
    url: string,
    source: "slack_upload" | "url_ingest",
    uploadedBy?: string,
  ): Promise<FootageAsset> {
    logger.info(`Ingesting footage from URL: ${url}`);

    // Download to temp
    const tempPath = await this.ffmpeg.downloadToTemp(url);

    try {
      // Probe for metadata
      const probe = await this.ffmpeg.probe(tempPath);

      // Determine filename from URL
      const urlObj = new URL(url);
      const originalFilename = path.basename(urlObj.pathname) || "unknown";
      const ext = path.extname(originalFilename) || ".mp4";

      // Upload to Supabase storage
      const storagePath = `footage/${Date.now()}-${randomUUID()}${ext}`;
      const fileBuffer = await fs.readFile(tempPath);

      const supabase = createSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from("footage")
        .upload(storagePath, fileBuffer, {
          contentType: this.mimeTypeFromExt(ext),
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("footage")
        .getPublicUrl(storagePath);

      // Insert record in DB
      const now = new Date().toISOString();
      const asset: Omit<FootageAsset, "id"> = {
        storage_url: publicUrl,
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: this.mimeTypeFromExt(ext),
        file_size_bytes: probe.file_size_bytes,
        duration_ms: probe.duration_ms,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        codec: probe.codec,
        has_audio: probe.has_audio,
        audio_codec: probe.audio_codec,
        analysis_status: "pending",
        scene_boundaries: [],
        key_moments: [],
        tags: [],
        source,
        uploaded_by: uploadedBy,
        created_at: now,
        updated_at: now,
      };

      const { data, error: insertError } = await supabase
        .from("footage_assets")
        .insert(asset)
        .select()
        .single();

      if (insertError) {
        throw new Error(`DB insert failed: ${insertError.message}`);
      }

      logger.info(`Footage ingested: ${data.id} (${originalFilename})`);
      return data as FootageAsset;
    } finally {
      await this.ffmpeg.cleanup([tempPath]);
    }
  }

  // -------------------------------------------------------------------------
  // Ingest from Buffer
  // -------------------------------------------------------------------------

  async ingestFromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    source: "slack_upload" | "url_ingest",
    uploadedBy?: string,
  ): Promise<FootageAsset> {
    logger.info(`Ingesting footage from buffer: ${filename} (${buffer.length} bytes)`);

    // Write buffer to temp file
    const ext = path.extname(filename) || ".mp4";
    const tempPath = this.ffmpeg.getTempPath(ext);
    await fs.writeFile(tempPath, buffer);

    try {
      // Probe for metadata
      const probe = await this.ffmpeg.probe(tempPath);

      // Upload to Supabase storage
      const storagePath = `footage/${Date.now()}-${randomUUID()}${ext}`;

      const supabase = createSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from("footage")
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("footage")
        .getPublicUrl(storagePath);

      // Insert record in DB
      const now = new Date().toISOString();
      const asset: Omit<FootageAsset, "id"> = {
        storage_url: publicUrl,
        storage_path: storagePath,
        original_filename: filename,
        mime_type: mimeType,
        file_size_bytes: probe.file_size_bytes,
        duration_ms: probe.duration_ms,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        codec: probe.codec,
        has_audio: probe.has_audio,
        audio_codec: probe.audio_codec,
        analysis_status: "pending",
        scene_boundaries: [],
        key_moments: [],
        tags: [],
        source,
        uploaded_by: uploadedBy,
        created_at: now,
        updated_at: now,
      };

      const { data, error: insertError } = await supabase
        .from("footage_assets")
        .insert(asset)
        .select()
        .single();

      if (insertError) {
        throw new Error(`DB insert failed: ${insertError.message}`);
      }

      logger.info(`Footage ingested from buffer: ${data.id} (${filename})`);
      return data as FootageAsset;
    } finally {
      await this.ffmpeg.cleanup([tempPath]);
    }
  }

  // -------------------------------------------------------------------------
  // Analyze Footage (Progressive: Flash scan -> Pro deep dive)
  // -------------------------------------------------------------------------

  async analyzeFootage(assetId: string): Promise<FootageAsset> {
    const supabase = createSupabaseClient();

    // Fetch the asset
    const asset = await this.getAsset(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    logger.info(`Starting progressive analysis for asset ${assetId}`);

    // Update status to scanning
    await supabase
      .from("footage_assets")
      .update({ analysis_status: "scanning", updated_at: new Date().toISOString() })
      .eq("id", assetId);

    // Download asset to temp for frame extraction
    const tempPath = await this.downloadAsset(asset);
    const framePaths: string[] = [];
    let frameDir: string | null = null;

    try {
      // ---------------------------------------------------------------
      // Phase 1: Flash scan — extract keyframes, quick Gemini Flash scan
      // ---------------------------------------------------------------
      logger.info(`Phase 1: Flash scan for asset ${assetId}`);

      // Extract keyframes at 2-second intervals
      const extractedFrames = await this.ffmpeg.extractFrames(tempPath, 2);
      framePaths.push(...extractedFrames);
      if (extractedFrames.length > 0) {
        frameDir = path.dirname(extractedFrames[0]);
      }

      // Build vision inputs from frames
      const visionInputs = await Promise.all(
        extractedFrames.map(async (framePath, index) => {
          const frameBuffer = await fs.readFile(framePath);
          return {
            type: "image" as const,
            data: frameBuffer,
            mimeType: "image/png",
            timestampMs: index * 2000,
          };
        }),
      );

      const flashPrompt = `You are analyzing keyframes extracted from a video at 2-second intervals.
For each frame, provide:
1. A description of what is happening in the frame
2. Whether the frame looks interesting (action, strong emotion, high visual quality, important moment)
3. Reasons why it's interesting (if applicable)
4. A visual quality rating from 1-10

Also identify contiguous segments of interesting frames.

The frames are numbered sequentially, each representing a 2-second interval starting at 0ms.

Return your analysis as JSON with this structure:
{
  "frames": [
    {
      "timestamp_ms": <number>,
      "description": "<string>",
      "is_interesting": <boolean>,
      "interest_reasons": ["<string>"],
      "visual_quality": <number>
    }
  ],
  "overall_summary": "<string>",
  "interesting_segments": [
    {
      "start_ms": <number>,
      "end_ms": <number>,
      "reason": "<string>"
    }
  ]
}`;

      // Send frames to Gemini 3 Flash for quick scan (low resolution = ~70 tokens/frame)
      const flashInputs = visionInputs.map((v) => ({
        type: v.type,
        data: v.data,
        mimeType: v.mimeType,
        mediaResolution: "media_resolution_low" as const,
      }));

      const flashRawResult = await this.gemini.analyzeVision(
        flashPrompt,
        flashInputs,
        { model: "flash", jsonMode: true, maxTokens: 8192, thinkingLevel: "low" },
      );

      let flashResult: FlashScanResult;
      try {
        flashResult = JSON.parse(flashRawResult);
      } catch {
        const jsonMatch = flashRawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          flashResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`Failed to parse Flash scan response: ${flashRawResult.substring(0, 200)}`);
        }
      }

      logger.info(
        `Flash scan complete: ${flashResult.frames?.length || 0} frames analyzed, ` +
        `${flashResult.interesting_segments?.length || 0} interesting segments found`,
      );

      // ---------------------------------------------------------------
      // Phase 2: Pro deep dive — analyze interesting segments in detail
      // ---------------------------------------------------------------
      logger.info(`Phase 2: Pro deep dive for asset ${assetId}`);

      // Collect frames from interesting segments for the Pro model
      const interestingFrameInputs = visionInputs.filter((v) => {
        return flashResult.interesting_segments?.some(
          (seg) => v.timestampMs >= seg.start_ms && v.timestampMs <= seg.end_ms,
        );
      });

      // If no interesting segments found, use all frames for Pro analysis
      const proFrameInputs = interestingFrameInputs.length > 0
        ? interestingFrameInputs
        : visionInputs;

      // Limit to a reasonable number of frames for Pro (max ~20)
      const limitedProInputs = proFrameInputs.slice(0, 20);

      const proPrompt = `You are a professional video editor analyzing footage in detail.
You've received keyframes from a video. A quick scan already identified these observations:
${flashResult.overall_summary}

Interesting segments found: ${JSON.stringify(flashResult.interesting_segments || [])}

Now perform a deep analysis. You have code execution available — use it to zoom into
regions of frames that contain small text, logos, UI elements, or fine details that need
closer inspection. Crop and re-examine any areas where details are too small to read
at the current resolution.

Your analysis should cover:
1. Identify precise scene boundaries with descriptions and content tags
2. Tag the overall emotional tone of the footage
3. Identify content themes and create searchable tags
4. Rate the overall quality (1-10) considering composition, lighting, stability, and content value
5. Identify the best key moments for editing — moments with high visual impact, emotional resonance, or narrative importance
6. For each key moment, rate its importance from 1-10
7. Read any on-screen text, logos, watermarks, or UI elements visible in the frames (zoom in if needed)
8. Assess composition quality — rule of thirds, leading lines, visual balance

Return your analysis as JSON:
{
  "scene_boundaries": [
    {
      "start_ms": <number>,
      "end_ms": <number>,
      "description": "<what happens in this scene>",
      "tags": ["<content tags>"]
    }
  ],
  "key_moments": [
    {
      "timestamp_ms": <number>,
      "description": "<why this moment matters>",
      "importance": <1-10>
    }
  ],
  "tags": ["<searchable content tags for the whole video>"],
  "emotional_tone": "<primary emotional tone>",
  "quality_score": <1-10>,
  "on_screen_text": ["<any text, logos, or watermarks found in frames>"],
  "composition_notes": "<notes on visual composition quality>",
  "best_moments_for_editing": [
    {
      "timestamp_ms": <number>,
      "reason": "<why this is good for editing>"
    }
  ]
}`;

      const proInputs = limitedProInputs.map((v) => ({
        type: v.type,
        data: v.data,
        mimeType: v.mimeType,
        mediaResolution: "media_resolution_high" as const,
      }));

      const proRawResult = await this.gemini.analyzeVision(
        proPrompt,
        proInputs,
        {
          model: "pro",
          jsonMode: true,
          maxTokens: 8192,
          thinkingLevel: "high",
          agenticVision: true, // enables auto-zoom/crop via code execution
        },
      );

      let proResult: ProAnalysisResult;
      try {
        proResult = JSON.parse(proRawResult);
      } catch {
        const jsonMatch = proRawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          proResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`Failed to parse Pro analysis response: ${proRawResult.substring(0, 200)}`);
        }
      }

      logger.info(
        `Pro analysis complete: ${proResult.scene_boundaries?.length || 0} scenes, ` +
        `${proResult.key_moments?.length || 0} key moments, ` +
        `quality=${proResult.quality_score}`,
      );

      // ---------------------------------------------------------------
      // Update asset with analysis results
      // ---------------------------------------------------------------
      const { data: updated, error: updateError } = await supabase
        .from("footage_assets")
        .update({
          analysis_status: "analyzed",
          flash_analysis: flashResult as unknown as Record<string, unknown>,
          pro_analysis: proResult as unknown as Record<string, unknown>,
          scene_boundaries: proResult.scene_boundaries || [],
          key_moments: proResult.key_moments || [],
          tags: proResult.tags || [],
          emotional_tone: proResult.emotional_tone,
          quality_score: proResult.quality_score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update asset with analysis: ${updateError.message}`);
      }

      logger.info(`Analysis complete for asset ${assetId}`);
      return updated as FootageAsset;
    } catch (err) {
      // Mark as failed on error
      logger.error(`Analysis failed for asset ${assetId}`, err);
      await supabase
        .from("footage_assets")
        .update({
          analysis_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId);

      throw err;
    } finally {
      // Clean up temp files
      const cleanupPaths = [tempPath, ...framePaths];
      await this.ffmpeg.cleanup(cleanupPaths);
      // Clean up the frame directory if it was created
      if (frameDir) {
        try {
          await fs.rmdir(frameDir);
        } catch {
          // Directory may not be empty or already removed
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Simple queries
  // -------------------------------------------------------------------------

  async getAsset(id: string): Promise<FootageAsset | null> {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("footage_assets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // not found
      throw new Error(`Failed to fetch asset ${id}: ${error.message}`);
    }

    return data as FootageAsset;
  }

  async getAssetsByIds(ids: string[]): Promise<FootageAsset[]> {
    if (ids.length === 0) return [];

    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("footage_assets")
      .select("*")
      .in("id", ids);

    if (error) {
      throw new Error(`Failed to fetch assets: ${error.message}`);
    }

    return (data || []) as FootageAsset[];
  }

  async getRecentAssets(limit: number): Promise<FootageAsset[]> {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("footage_assets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch recent assets: ${error.message}`);
    }

    return (data || []) as FootageAsset[];
  }

  // -------------------------------------------------------------------------
  // Download asset to temp
  // -------------------------------------------------------------------------

  async downloadAsset(asset: FootageAsset): Promise<string> {
    const supabase = createSupabaseClient();

    logger.info(`Downloading asset ${asset.id} from storage: ${asset.storage_path}`);

    const { data, error } = await supabase.storage
      .from("footage")
      .download(asset.storage_path);

    if (error) {
      throw new Error(`Failed to download asset ${asset.id}: ${error.message}`);
    }

    const ext = path.extname(asset.storage_path) || ".mp4";
    const tempPath = this.ffmpeg.getTempPath(ext);

    const arrayBuffer = await data.arrayBuffer();
    await fs.writeFile(tempPath, Buffer.from(arrayBuffer));

    logger.info(`Asset ${asset.id} downloaded to ${tempPath}`);
    return tempPath;
  }

  // -------------------------------------------------------------------------
  // Delete asset
  // -------------------------------------------------------------------------

  async deleteAsset(id: string): Promise<void> {
    const supabase = createSupabaseClient();

    // Fetch asset to get storage path
    const asset = await this.getAsset(id);
    if (!asset) {
      throw new Error(`Asset not found: ${id}`);
    }

    logger.info(`Deleting asset ${id} (${asset.storage_path})`);

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("footage")
      .remove([asset.storage_path]);

    if (storageError) {
      logger.warn(`Failed to delete storage file for asset ${id}: ${storageError.message}`);
    }

    // Delete from DB
    const { error: dbError } = await supabase
      .from("footage_assets")
      .delete()
      .eq("id", id);

    if (dbError) {
      throw new Error(`Failed to delete asset record ${id}: ${dbError.message}`);
    }

    logger.info(`Asset ${id} deleted`);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private mimeTypeFromExt(ext: string): string {
    const map: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".wmv": "video/x-ms-wmv",
      ".flv": "video/x-flv",
      ".m4v": "video/x-m4v",
    };
    return map[ext.toLowerCase()] || "video/mp4";
  }
}

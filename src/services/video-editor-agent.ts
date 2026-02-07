import fs from "fs/promises";
import { randomUUID } from "crypto";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import { GeminiService } from "./gemini-service.js";
import { FFmpegService } from "./ffmpeg-service.js";
import { FootageLibraryService } from "./footage-library.js";
import { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";
import { AgentMemoryService } from "./agent-memory.js";
import { FalService } from "./fal-service.js";
import { RemotionService } from "./remotion-service.js";
import type {
  VideoProject,
  FootageAsset,
  EDL,
  VideoIdea,
} from "../types/index.js";

/**
 * AI video editing orchestrator.
 *
 * Manages the full lifecycle of a video project:
 * 1. Create a project with a creative goal
 * 2. Add footage assets
 * 3. Analyze footage via Gemini Vision
 * 4. Generate an EDL (Edit Decision List) via Gemini Pro
 * 5. Execute the EDL with FFmpeg (cut, concat, overlay, audio)
 * 6. Upload the result and put it in review
 * 7. Accept feedback, regenerate EDL segments, and re-render
 *
 * Also handles idea generation and approval workflows.
 */
export class VideoEditorAgent {
  private supabase = createSupabaseClient();
  private gemini: GeminiService;
  private ffmpeg: FFmpegService;
  private footageLibrary: FootageLibraryService;
  private promptBuilder: DynamicPromptBuilder;
  private memory: AgentMemoryService;
  private falService: FalService;
  // Kept for future Remotion composition rendering integration
  public readonly remotionService: RemotionService;

  constructor(
    gemini: GeminiService,
    ffmpeg: FFmpegService,
    footageLibrary: FootageLibraryService,
    promptBuilder: DynamicPromptBuilder,
    memory: AgentMemoryService,
    falService: FalService,
    remotionService: RemotionService,
  ) {
    this.gemini = gemini;
    this.ffmpeg = ffmpeg;
    this.footageLibrary = footageLibrary;
    this.promptBuilder = promptBuilder;
    this.memory = memory;
    this.falService = falService;
    this.remotionService = remotionService;
  }

  // ---------------------------------------------------------------------------
  // Project CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new video project.
   */
  async createProject(
    title: string,
    goal: string,
    createdBy?: string,
  ): Promise<VideoProject> {
    const { data, error } = await this.supabase
      .from("video_projects")
      .insert({
        title,
        goal,
        status: "draft" as const,
        feedback_history: [],
        footage_asset_ids: [],
        created_by: createdBy,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create video project: ${error.message}`);
    }

    logger.info(`Created video project "${title}" (${data.id})`);
    return data as VideoProject;
  }

  /**
   * Add footage assets to a project.
   */
  async addFootage(
    projectId: string,
    assetIds: string[],
  ): Promise<VideoProject> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const mergedIds = [...new Set([...project.footage_asset_ids, ...assetIds])];

    const { data, error } = await this.supabase
      .from("video_projects")
      .update({
        footage_asset_ids: mergedIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to add footage to project: ${error.message}`);
    }

    logger.info(
      `Added ${assetIds.length} assets to project ${projectId} (total: ${mergedIds.length})`,
    );
    return data as VideoProject;
  }

  /**
   * Fetch a single project by ID.
   */
  async getProject(id: string): Promise<VideoProject | null> {
    const { data, error } = await this.supabase
      .from("video_projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // not found
      throw new Error(`Failed to fetch project: ${error.message}`);
    }

    return data as VideoProject;
  }

  /**
   * List projects filtered by status.
   */
  async getProjectsByStatus(status: string): Promise<VideoProject[]> {
    const { data, error } = await this.supabase
      .from("video_projects")
      .select("*")
      .eq("status", status)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list projects by status: ${error.message}`);
    }

    return (data || []) as VideoProject[];
  }

  // ---------------------------------------------------------------------------
  // Full processing pipeline
  // ---------------------------------------------------------------------------

  /**
   * Run the full orchestration pipeline for a video project:
   * analyze footage -> generate EDL -> render -> upload -> review.
   */
  async processProject(
    projectId: string,
    progressCallback?: (msg: string) => Promise<void>,
  ): Promise<VideoProject> {
    const tempFiles: string[] = [];

    try {
      // ── Step A: Analyze footage ──────────────────────────────────────
      await this.updateStatus(projectId, "analyzing");
      await progressCallback?.("Analyzing footage assets...");

      const project = await this.getProject(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      if (project.footage_asset_ids.length === 0) {
        throw new Error("No footage assets attached to project");
      }

      const footageAssets = await this.loadFootageAssets(
        project.footage_asset_ids,
      );

      // Analyze any assets that haven't been analyzed yet
      const analysisPromises = footageAssets
        .filter((a) => a.analysis_status !== "analyzed")
        .map((asset) =>
          this.footageLibrary.analyzeFootage(asset.id).catch((err: unknown) => {
            logger.warn(
              `Failed to analyze asset ${asset.id}: ${err}`,
            );
            return null;
          }),
        );

      if (analysisPromises.length > 0) {
        await progressCallback?.(
          `Analyzing ${analysisPromises.length} unanalyzed asset(s)...`,
        );
        await Promise.all(analysisPromises);
      }

      // Reload assets to get fresh analysis data
      const analyzedAssets = await this.loadFootageAssets(
        project.footage_asset_ids,
      );

      const footageAnalysis = analyzedAssets.map((a) => ({
        id: a.id,
        duration_ms: a.duration_ms,
        width: a.width,
        height: a.height,
        fps: a.fps,
        has_audio: a.has_audio,
        scene_boundaries: a.scene_boundaries,
        key_moments: a.key_moments,
        tags: a.tags,
        emotional_tone: a.emotional_tone,
        quality_score: a.quality_score,
        flash_analysis: a.flash_analysis,
        pro_analysis: a.pro_analysis,
      }));

      // ── Step B: Generate EDL ─────────────────────────────────────────
      await this.updateStatus(projectId, "editing");
      await progressCallback?.("Generating edit decision list (EDL)...");

      const editPrompt = await this.promptBuilder.buildVideoEditPrompt(
        project.goal || "Create an engaging short-form video",
        { assets: footageAnalysis },
      );

      const edl = await this.gemini.generateJSON<EDL>(
        editPrompt,
        `Create a detailed EDL for this video project. Goal: ${project.goal || "Create an engaging video"}. ` +
          `Available footage: ${analyzedAssets.length} asset(s). ` +
          `Output a valid EDL JSON with version, tracks (video, audio, overlays), ` +
          `total_duration_ms, output_format, narrative_structure, and metadata.`,
        { model: "pro", maxTokens: 8192, temperature: 0.6 },
      );

      // Save EDL to history
      await this.saveEDLVersion(projectId, edl, 1, undefined, "Initial EDL generation");

      // Update project with current EDL
      await this.supabase
        .from("video_projects")
        .update({ current_edl: edl, updated_at: new Date().toISOString() })
        .eq("id", projectId);

      // ── Step C: Render ───────────────────────────────────────────────
      await this.updateStatus(projectId, "rendering");
      await progressCallback?.("Rendering video...");

      // Generate missing assets in parallel (b-roll images, TTS audio)
      await this.generateMissingAssets(edl, progressCallback);

      // Execute the EDL
      const outputPath = await this.executeEDL(edl, analyzedAssets);
      tempFiles.push(outputPath);

      // Upload final video to Supabase storage
      await progressCallback?.("Uploading final video...");
      const outputUrl = await this.uploadToStorage(
        outputPath,
        `video-projects/${projectId}/output-v1.mp4`,
      );

      // Probe for final duration
      let outputDurationMs: number | undefined;
      try {
        const probeResult = await this.ffmpeg.probe(outputPath);
        outputDurationMs = probeResult.duration_ms;
      } catch {
        outputDurationMs = edl.total_duration_ms;
      }

      // ── Step D: Review ───────────────────────────────────────────────
      await this.supabase
        .from("video_projects")
        .update({
          status: "review",
          output_url: outputUrl,
          output_duration_ms: outputDurationMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      await progressCallback?.("Video is ready for review.");

      const finalProject = await this.getProject(projectId);
      if (!finalProject) throw new Error("Project lost after rendering");
      return finalProject;
    } catch (err) {
      logger.error(`processProject failed for ${projectId}`, err);
      await this.updateStatus(projectId, "draft").catch(() => {});
      throw err;
    } finally {
      // Clean up temp files
      await this.ffmpeg.cleanup(tempFiles);
    }
  }

  // ---------------------------------------------------------------------------
  // EDL Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute an EDL: cut source clips, add overlays, concat, add audio.
   * Returns the path to the final rendered output file.
   */
  async executeEDL(
    edl: EDL,
    footageAssets: FootageAsset[],
  ): Promise<string> {
    const tempFiles: string[] = [];

    try {
      // Step 1: Download all required source footage to temp
      const downloadedPaths = new Map<string, string>();
      for (const asset of footageAssets) {
        if (!downloadedPaths.has(asset.id)) {
          const localPath = await this.ffmpeg.downloadToTemp(asset.storage_url);
          downloadedPaths.set(asset.id, localPath);
          tempFiles.push(localPath);
        }
      }

      // Step 2: Process video track items (cut source clips)
      const videoCutPaths: string[] = [];

      for (const item of edl.tracks.video) {
        if (item.type === "video_clip" && item.source_asset_id) {
          const sourcePath = downloadedPaths.get(item.source_asset_id);
          if (!sourcePath) {
            logger.warn(
              `Source asset ${item.source_asset_id} not found, skipping clip ${item.id}`,
            );
            continue;
          }

          const inPoint = item.in_point_ms ?? 0;
          const duration = item.out_point_ms
            ? item.out_point_ms - inPoint
            : item.duration_ms;

          let clipPath = await this.ffmpeg.cut(sourcePath, inPoint, duration);
          tempFiles.push(clipPath);

          // Apply speed adjustment if specified
          if (item.properties.speed && item.properties.speed !== 1) {
            const speedPath = await this.ffmpeg.adjustSpeed(
              clipPath,
              item.properties.speed,
            );
            tempFiles.push(speedPath);
            clipPath = speedPath;
          }

          videoCutPaths.push(clipPath);
        } else if (item.type === "video_clip" && item.source_url) {
          // Generated asset (e.g., b-roll image converted to video)
          const localPath = await this.ffmpeg.downloadToTemp(item.source_url);
          tempFiles.push(localPath);
          videoCutPaths.push(localPath);
        }
      }

      if (videoCutPaths.length === 0) {
        throw new Error("EDL produced no video clips to concatenate");
      }

      // Step 3: Concatenate all video clips
      let outputPath = await this.ffmpeg.concat(videoCutPaths);
      tempFiles.push(outputPath);

      // Step 4: Apply text overlays
      for (const overlay of edl.tracks.overlays) {
        if (overlay.type === "text_overlay" && overlay.properties.text) {
          const overlayedPath = await this.ffmpeg.addTextOverlay(
            outputPath,
            overlay.properties.text,
            {
              fontSize: overlay.properties.font_size || 48,
              color: "white",
              position: overlay.properties.position?.y
                ? overlay.properties.position.y < 0.33
                  ? "top"
                  : overlay.properties.position.y > 0.66
                    ? "bottom"
                    : "center"
                : "bottom",
              backgroundColor: "black@0.6",
            },
          );
          tempFiles.push(overlayedPath);
          outputPath = overlayedPath;
        }
      }

      // Step 5: Add audio track(s)
      for (const audioItem of edl.tracks.audio) {
        if (audioItem.source_url) {
          const audioPath = await this.ffmpeg.downloadToTemp(
            audioItem.source_url,
          );
          tempFiles.push(audioPath);

          // Adjust volume if specified
          let processedAudio = audioPath;
          if (
            audioItem.properties.volume !== undefined &&
            audioItem.properties.volume !== 1
          ) {
            processedAudio = await this.ffmpeg.adjustVolume(
              audioPath,
              audioItem.properties.volume,
            );
            tempFiles.push(processedAudio);
          }

          const withAudio = await this.ffmpeg.addAudioTrack(
            outputPath,
            processedAudio,
          );
          tempFiles.push(withAudio);
          outputPath = withAudio;
        }
      }

      // Move the final file to a stable temp path so it survives cleanup
      const finalPath = this.ffmpeg.getTempPath(".mp4");
      await fs.copyFile(outputPath, finalPath);

      return finalPath;
    } catch (err) {
      // Clean up intermediate files on error
      await this.ffmpeg.cleanup(tempFiles);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Feedback loop
  // ---------------------------------------------------------------------------

  /**
   * Apply user feedback to the current EDL and re-render.
   */
  async applyFeedback(
    projectId: string,
    feedback: string,
  ): Promise<VideoProject> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.current_edl) {
      throw new Error("Project has no EDL to apply feedback to");
    }

    const currentEDL = project.current_edl;
    const newVersion = currentEDL.version + 1;

    // Build feedback application prompt
    const feedbackPrompt =
      `You are a professional video editor. The user has provided feedback on the current edit.\n\n` +
      `<current_edl>\n${JSON.stringify(currentEDL, null, 2)}\n</current_edl>\n\n` +
      `<feedback>\n${feedback}\n</feedback>\n\n` +
      `Modify the EDL to address the feedback. Keep changes minimal and targeted. ` +
      `Increment the version to ${newVersion}. Output the full modified EDL as JSON.`;

    const modifiedEDL = await this.gemini.generateJSON<EDL>(
      feedbackPrompt,
      `Apply this feedback to the EDL: "${feedback}"`,
      { model: "pro", maxTokens: 8192, temperature: 0.5 },
    );

    // Ensure version is correct
    modifiedEDL.version = newVersion;

    // Save new EDL version
    await this.saveEDLVersion(
      projectId,
      modifiedEDL,
      newVersion,
      feedback,
      `Feedback applied: ${feedback.substring(0, 100)}`,
    );

    // Record feedback in project history
    const updatedHistory = [
      ...(project.feedback_history || []),
      {
        timestamp: new Date().toISOString(),
        feedback,
        applied: true,
      },
    ];

    // Re-render with modified EDL
    const footageAssets = await this.loadFootageAssets(
      project.footage_asset_ids,
    );
    const outputPath = await this.executeEDL(modifiedEDL, footageAssets);

    try {
      const outputUrl = await this.uploadToStorage(
        outputPath,
        `video-projects/${projectId}/output-v${newVersion}.mp4`,
      );

      let outputDurationMs: number | undefined;
      try {
        const probeResult = await this.ffmpeg.probe(outputPath);
        outputDurationMs = probeResult.duration_ms;
      } catch {
        outputDurationMs = modifiedEDL.total_duration_ms;
      }

      await this.supabase
        .from("video_projects")
        .update({
          current_edl: modifiedEDL,
          output_url: outputUrl,
          output_duration_ms: outputDurationMs,
          feedback_history: updatedHistory,
          status: "review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      // Record feedback as episodic memory for voice learning
      await this.memory.recordEpisode("video_feedback", {
        contentText: `Video editing feedback: ${feedback}`,
        content: {
          project_id: projectId,
          project_title: project.title,
          feedback,
          edl_version: newVersion,
          action: "critique",
        },
        sourceId: projectId,
        emotionalSalience: 0.8,
        relevanceTags: ["video_editing", "feedback", "critique"],
      });

      const finalProject = await this.getProject(projectId);
      if (!finalProject) throw new Error("Project lost after feedback");
      return finalProject;
    } finally {
      await this.ffmpeg.cleanup([outputPath]);
    }
  }

  // ---------------------------------------------------------------------------
  // Idea generation & approval
  // ---------------------------------------------------------------------------

  /**
   * Generate weekly video ideas using Gemini Pro.
   */
  async generateWeeklyIdeas(
    slackChannelId?: string,
  ): Promise<VideoIdea[]> {
    const ideaPrompt = await this.promptBuilder.buildIdeaPitchPrompt();

    const ideas = await this.gemini.generateJSON<
      Array<{
        concept: string;
        rationale: string;
        target_platform: string;
        estimated_duration_sec: number;
        style_notes: string;
        reference_urls: string[];
      }>
    >(
      ideaPrompt,
      "Generate 3 creative video ideas for this week. Each should have a clear concept, " +
        "rationale for why it will perform well, target platform, estimated duration, " +
        "style notes, and any reference URLs. Output as a JSON array.",
      { model: "pro", maxTokens: 4096, temperature: 0.8 },
    );

    const weekOf = this.getWeekOfDate();
    const insertedIdeas: VideoIdea[] = [];

    for (const idea of ideas) {
      const { data, error } = await this.supabase
        .from("video_ideas")
        .insert({
          concept: idea.concept,
          rationale: idea.rationale,
          target_platform: idea.target_platform,
          estimated_duration_sec: idea.estimated_duration_sec,
          style_notes: idea.style_notes,
          reference_urls: idea.reference_urls || [],
          status: "pitched" as const,
          feedback_history: [],
          week_of: weekOf,
          slack_channel_id: slackChannelId,
        })
        .select("*")
        .single();

      if (error) {
        logger.error(`Failed to insert video idea: ${error.message}`);
        continue;
      }

      insertedIdeas.push(data as VideoIdea);
    }

    logger.info(
      `Generated ${insertedIdeas.length} video ideas for week of ${weekOf}`,
    );
    return insertedIdeas;
  }

  /**
   * Approve a pitched idea and create a corresponding video project.
   */
  async approveIdea(ideaId: string): Promise<VideoProject> {
    // Update idea status
    const { data: idea, error: ideaError } = await this.supabase
      .from("video_ideas")
      .update({
        status: "in_production" as const,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ideaId)
      .select("*")
      .single();

    if (ideaError) {
      throw new Error(`Failed to approve idea: ${ideaError.message}`);
    }

    const ideaData = idea as VideoIdea;

    // Create a video project linked to this idea
    const { data: project, error: projectError } = await this.supabase
      .from("video_projects")
      .insert({
        title: ideaData.concept.substring(0, 100),
        goal: ideaData.concept,
        status: "draft" as const,
        feedback_history: [],
        footage_asset_ids: [],
        idea_id: ideaId,
        slack_channel_id: ideaData.slack_channel_id,
      })
      .select("*")
      .single();

    if (projectError) {
      throw new Error(
        `Failed to create project for idea: ${projectError.message}`,
      );
    }

    // Link the project back to the idea
    await this.supabase
      .from("video_ideas")
      .update({ project_id: project.id })
      .eq("id", ideaId);

    // Record idea approval as episodic memory
    this.memory.recordEpisode("approve", {
      contentText: `Approved video idea: ${ideaData.concept.substring(0, 200)}`,
      content: {
        idea_id: ideaId,
        project_id: project.id,
        concept: ideaData.concept,
        target_platform: ideaData.target_platform,
        action: "approve_idea",
      },
      sourceId: ideaId,
      emotionalSalience: 0.5,
      relevanceTags: ["video_idea", "approve"],
    }).catch((err) => logger.warn(`Failed to record idea approval: ${err}`));

    logger.info(
      `Approved idea ${ideaId}, created project ${project.id}`,
    );
    return project as VideoProject;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async updateStatus(
    projectId: string,
    status: VideoProject["status"],
  ): Promise<void> {
    const { error } = await this.supabase
      .from("video_projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (error) {
      logger.error(
        `Failed to update project ${projectId} status to ${status}: ${error.message}`,
      );
    }
  }

  private async loadFootageAssets(ids: string[]): Promise<FootageAsset[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.supabase
      .from("footage_assets")
      .select("*")
      .in("id", ids);

    if (error) {
      throw new Error(`Failed to load footage assets: ${error.message}`);
    }

    return (data || []) as FootageAsset[];
  }

  private async saveEDLVersion(
    projectId: string,
    edl: EDL,
    version: number,
    feedbackApplied?: string,
    reasoning?: string,
  ): Promise<void> {
    const { error } = await this.supabase.from("edl_history").insert({
      project_id: projectId,
      version,
      edl,
      feedback_applied: feedbackApplied,
      reasoning,
    });

    if (error) {
      logger.error(`Failed to save EDL version ${version}: ${error.message}`);
    }
  }

  /**
   * Generate any assets referenced in the EDL that don't exist yet
   * (e.g., b-roll images via fal.ai, TTS audio).
   */
  private async generateMissingAssets(
    edl: EDL,
    progressCallback?: (msg: string) => Promise<void>,
  ): Promise<void> {
    const generationTasks: Array<Promise<void>> = [];

    // Check for b-roll / generated image needs in video track
    for (const item of edl.tracks.video) {
      if (
        item.type === "image_overlay" &&
        !item.source_url &&
        !item.source_asset_id &&
        item.reasoning
      ) {
        const reasoningText = item.reasoning!;
        generationTasks.push(
          (async () => {
            try {
              await progressCallback?.(`Generating b-roll image: ${reasoningText.substring(0, 50)}...`);
              const imageBuffer = await this.falService.generateImage(
                reasoningText,
              );
              // Upload to storage and update the item's source_url
              const storagePath = `generated/broll-${randomUUID()}.png`;
              const url = await this.uploadBufferToStorage(
                imageBuffer,
                storagePath,
                "image/png",
              );
              item.source_url = url;
            } catch (err) {
              logger.warn(`Failed to generate b-roll for item ${item.id}: ${err}`);
            }
          })(),
        );
      }
    }

    // Check for TTS audio needs
    for (const item of edl.tracks.audio) {
      if (
        item.type === "audio" &&
        !item.source_url &&
        !item.source_asset_id &&
        item.properties.text
      ) {
        generationTasks.push(
          (async () => {
            try {
              await progressCallback?.("Generating voiceover...");
              const { buffer, durationMs } =
                await this.falService.generateSpeech(item.properties.text!);
              const storagePath = `generated/tts-${randomUUID()}.mp3`;
              const url = await this.uploadBufferToStorage(
                buffer,
                storagePath,
                "audio/mpeg",
              );
              item.source_url = url;
              item.duration_ms = durationMs;
            } catch (err) {
              logger.warn(`Failed to generate TTS for item ${item.id}: ${err}`);
            }
          })(),
        );
      }
    }

    if (generationTasks.length > 0) {
      await progressCallback?.(
        `Generating ${generationTasks.length} asset(s) in parallel...`,
      );
      await Promise.all(generationTasks);
    }
  }

  private async uploadToStorage(
    filePath: string,
    storagePath: string,
  ): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);

    const { error } = await this.supabase.storage
      .from("videos")
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload video to storage: ${error.message}`);
    }

    const {
      data: { publicUrl },
    } = this.supabase.storage.from("videos").getPublicUrl(storagePath);

    logger.info(`Uploaded video to ${publicUrl}`);
    return publicUrl;
  }

  private async uploadBufferToStorage(
    buffer: Buffer,
    storagePath: string,
    contentType: string,
  ): Promise<string> {
    const { error } = await this.supabase.storage
      .from("videos")
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) {
      throw new Error(
        `Failed to upload generated asset to storage: ${error.message}`,
      );
    }

    const {
      data: { publicUrl },
    } = this.supabase.storage.from("videos").getPublicUrl(storagePath);

    return publicUrl;
  }

  private getWeekOfDate(): string {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    return monday.toISOString().split("T")[0];
  }
}

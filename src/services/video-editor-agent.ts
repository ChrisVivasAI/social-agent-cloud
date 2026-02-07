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
  VideoSeries,
  FootageAsset,
  EDL,
  VideoIdea,
  ProjectType,
  CreativeBrief,
} from "../types/index.js";

/**
 * AI video editing orchestrator — production content creation tool.
 *
 * Supports multiple project types: social clips, commercials, short films,
 * series episodes, music videos, and documentaries.
 *
 * Manages the full lifecycle of a video project:
 * 1. Create a project with a creative brief (audience, mood, style, models)
 * 2. Add footage assets or generate them via AI (Kling video, Flux images)
 * 3. Analyze footage via Gemini Vision
 * 4. Generate an EDL (Edit Decision List) via Gemini Pro
 * 5. Execute the EDL with FFmpeg + AI-generated assets
 * 6. Upload the result and put it in review
 * 7. Accept feedback, regenerate EDL segments, and re-render
 *
 * Also handles series/episode management, idea generation, and approval workflows.
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
   * Create a new video project with optional project type and creative brief.
   */
  async createProject(
    title: string,
    goal: string,
    createdBy?: string,
    options?: {
      projectType?: ProjectType;
      creativeBrief?: CreativeBrief;
      seriesId?: string;
      episodeNumber?: number;
    },
  ): Promise<VideoProject> {
    const { data, error } = await this.supabase
      .from("video_projects")
      .insert({
        title,
        goal,
        project_type: options?.projectType || "social_clip",
        creative_brief: options?.creativeBrief || null,
        series_id: options?.seriesId || null,
        episode_number: options?.episodeNumber || null,
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

    logger.info(`Created ${options?.projectType || "social_clip"} project "${title}" (${data.id})`);
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

      const hasFootage = project.footage_asset_ids.length > 0;
      let analyzedAssets: FootageAsset[] = [];
      let footageAnalysis: Array<Record<string, unknown>> = [];

      if (hasFootage) {
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
        analyzedAssets = await this.loadFootageAssets(
          project.footage_asset_ids,
        );

        footageAnalysis = analyzedAssets.map((a) => ({
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
      } else {
        await progressCallback?.("No footage assets — project will use AI-generated content.");
      }

      // ── Step B: Generate EDL ─────────────────────────────────────────
      await this.updateStatus(projectId, "editing");
      await progressCallback?.("Generating edit decision list (EDL)...");

      const editPrompt = await this.promptBuilder.buildVideoEditPrompt(
        project.goal || "Create an engaging short-form video",
        { assets: footageAnalysis },
      );

      const assetIdList = analyzedAssets.length > 0
        ? analyzedAssets.map((a) => a.id).join(", ")
        : "(none — use AI-generated content for all visuals)";
      const exampleAssetId = analyzedAssets[0]?.id || "ASSET_UUID";

      // Build creative context from project type and brief
      const briefContext = this.buildBriefContext(project);

      const rawEdl = await this.gemini.generateJSON<EDL>(
        editPrompt,
        `CREATIVE GOAL: ${project.goal || "Create an engaging video"}\n\n` +
          `PROJECT TYPE: ${project.project_type || "social_clip"}\n\n` +
          `${briefContext}` +
          `AVAILABLE FOOTAGE ASSET IDs (use these EXACTLY as source_asset_id values):\n${assetIdList}\n\n` +
          `EXAMPLE of ONE correct video clip entry:\n` +
          `{\n` +
          `  "id": "clip-1",\n` +
          `  "type": "video_clip",\n` +
          `  "source_asset_id": "${exampleAssetId}",\n` +
          `  "start_ms": 0,\n` +
          `  "duration_ms": 3000,\n` +
          `  "in_point_ms": 5000,\n` +
          `  "out_point_ms": 8000,\n` +
          `  "properties": { "speed": 1 },\n` +
          `  "narrative_role": "hook",\n` +
          `  "reasoning": "Strong opening moment"\n` +
          `}\n\n` +
          `AI-GENERATED VIDEO: For shots that don't exist in the footage library (hero shots, b-roll, transitions, opening/closing sequences), use type "ai_generated_video" with a "generation" object:\n` +
          `{\n` +
          `  "id": "ai-clip-1",\n` +
          `  "type": "ai_generated_video",\n` +
          `  "start_ms": 0,\n` +
          `  "duration_ms": 5000,\n` +
          `  "generation": { "prompt": "Cinematic aerial shot of a city skyline at sunset", "duration_seconds": 5 },\n` +
          `  "properties": { "speed": 1 },\n` +
          `  "narrative_role": "hook",\n` +
          `  "reasoning": "AI-generated hero shot for opening"\n` +
          `}\n\n` +
          `AI-GENERATED IMAGES: For scene backgrounds, product shots, thumbnails, or title cards, use type "image_overlay" with a "generation" object:\n` +
          `{\n` +
          `  "id": "img-1",\n` +
          `  "type": "image_overlay",\n` +
          `  "start_ms": 0,\n` +
          `  "duration_ms": 3000,\n` +
          `  "generation": { "prompt": "Professional product shot of a smartphone on a minimalist desk" },\n` +
          `  "properties": {},\n` +
          `  "reasoning": "Product hero image for commercial"\n` +
          `}\n\n` +
          `VOICEOVER: Add an audio item to tracks.audio with type "audio", properties.text containing the narration script, and NO source_url / NO source_asset_id.\n\n` +
          `All timestamps in MILLISECONDS. Output the complete EDL JSON object.`,
        { model: "pro", maxTokens: 8192, temperature: 0.6 },
      );

      // Ensure tracks structure is valid (Gemini may omit empty arrays)
      const edl: EDL = {
        ...rawEdl,
        tracks: {
          video: rawEdl.tracks?.video ?? [],
          audio: rawEdl.tracks?.audio ?? [],
          overlays: rawEdl.tracks?.overlays ?? [],
        },
        narrative_structure: rawEdl.narrative_structure ?? [],
        metadata: rawEdl.metadata ?? {},
      };

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

      // Build a list of available asset IDs for fuzzy matching
      const assetIds = Array.from(downloadedPaths.keys());
      logger.info(`EDL has ${edl.tracks.video.length} video track items, ${assetIds.length} available assets: ${assetIds.join(", ")}`);

      for (const item of edl.tracks.video) {
        const assetId = item.source_asset_id;
        if (item.type === "video_clip" && assetId) {
          let sourcePath = downloadedPaths.get(assetId);

          // Gemini may generate slightly wrong IDs — try partial match
          if (!sourcePath) {
            const partialMatch = assetIds.find(
              (id) => id.startsWith(assetId.substring(0, 8)) || assetId.startsWith(id.substring(0, 8)),
            );
            if (partialMatch) {
              logger.info(`Fuzzy matched asset ${assetId} -> ${partialMatch}`);
              sourcePath = downloadedPaths.get(partialMatch);
            }
          }

          if (!sourcePath) {
            logger.warn(
              `Source asset ${assetId} not found (type: ${item.type}), skipping clip ${item.id}`,
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
        } else if (item.type === "ai_generated_video" && item.source_url) {
          // AI-generated video clip (already generated in generateMissingAssets)
          const localPath = await this.ffmpeg.downloadToTemp(item.source_url);
          tempFiles.push(localPath);

          let clipPath = localPath;
          if (item.properties.speed && item.properties.speed !== 1) {
            const speedPath = await this.ffmpeg.adjustSpeed(clipPath, item.properties.speed);
            tempFiles.push(speedPath);
            clipPath = speedPath;
          }

          videoCutPaths.push(clipPath);
        } else if ((item.type === "video_clip" || item.type === "image_overlay") && item.source_url) {
          // Generated asset (e.g., b-roll image converted to video, or pre-generated)
          const localPath = await this.ffmpeg.downloadToTemp(item.source_url);
          tempFiles.push(localPath);
          videoCutPaths.push(localPath);
        } else {
          logger.warn(`Skipping EDL video item ${item.id} (type: ${item.type}, has asset_id: ${!!item.source_asset_id}, has source_url: ${!!item.source_url})`);
        }
      }

      // Fallback: if EDL produced no usable clips, concatenate all source assets in order
      if (videoCutPaths.length === 0 && footageAssets.length > 0) {
        logger.warn(`EDL produced no matching clips — falling back to concatenating all ${footageAssets.length} source assets`);
        for (const asset of footageAssets) {
          const path = downloadedPaths.get(asset.id);
          if (path) videoCutPaths.push(path);
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

    const rawModifiedEDL = await this.gemini.generateJSON<EDL>(
      feedbackPrompt,
      `Apply this feedback to the EDL: "${feedback}"`,
      { model: "pro", maxTokens: 8192, temperature: 0.5 },
    );

    // Ensure tracks structure is valid
    const modifiedEDL: EDL = {
      ...rawModifiedEDL,
      tracks: {
        video: rawModifiedEDL.tracks?.video ?? [],
        audio: rawModifiedEDL.tracks?.audio ?? [],
        overlays: rawModifiedEDL.tracks?.overlays ?? [],
      },
      narrative_structure: rawModifiedEDL.narrative_structure ?? [],
      metadata: rawModifiedEDL.metadata ?? {},
    };

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
        project_type: "social_clip" as const,
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
  // Series & Episode Management
  // ---------------------------------------------------------------------------

  /**
   * Create a new video series that groups multiple episodes.
   */
  async createSeries(
    title: string,
    concept: string,
    projectType: ProjectType,
    options?: {
      styleGuide?: CreativeBrief;
      continuity?: VideoSeries["continuity"];
      createdBy?: string;
    },
  ): Promise<VideoSeries> {
    const { data, error } = await this.supabase
      .from("video_series")
      .insert({
        title,
        concept,
        project_type: projectType,
        style_guide: options?.styleGuide || null,
        continuity: options?.continuity || {},
        episode_plan: [],
        created_by: options?.createdBy,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create video series: ${error.message}`);
    }

    logger.info(`Created video series "${title}" (${data.id})`);
    return data as VideoSeries;
  }

  /**
   * Get a series by ID.
   */
  async getSeries(id: string): Promise<VideoSeries | null> {
    const { data, error } = await this.supabase
      .from("video_series")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch series: ${error.message}`);
    }

    return data as VideoSeries;
  }

  /**
   * Generate an episode plan for a series using Gemini Pro.
   * Creates planned episodes with synopses based on the series concept.
   */
  async generateEpisodePlan(
    seriesId: string,
    episodeCount: number,
  ): Promise<VideoSeries> {
    const series = await this.getSeries(seriesId);
    if (!series) throw new Error(`Series ${seriesId} not found`);

    const planPrompt =
      `You are a creative producer planning a ${series.project_type} series.\n\n` +
      `Series title: "${series.title}"\n` +
      `Concept: ${series.concept}\n` +
      `Continuity: ${JSON.stringify(series.continuity)}\n` +
      (series.style_guide ? `Style guide: ${JSON.stringify(series.style_guide)}\n` : "") +
      `\nGenerate a plan for ${episodeCount} episodes. Each episode should advance the overall narrative arc ` +
      `while being self-contained enough to work on its own.\n\n` +
      `Return a JSON array of episodes.`;

    const episodes = await this.gemini.generateJSON<
      Array<{
        episode_number: number;
        title: string;
        synopsis: string;
      }>
    >(
      planPrompt,
      `Generate ${episodeCount} episode plans for the series "${series.title}".`,
      { model: "pro", maxTokens: 4096, temperature: 0.7 },
    );

    const episodePlan = episodes.map((ep) => ({
      episode_number: ep.episode_number,
      title: ep.title,
      synopsis: ep.synopsis,
      status: "planned" as const,
    }));

    const { data, error } = await this.supabase
      .from("video_series")
      .update({
        episode_plan: episodePlan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", seriesId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update series episode plan: ${error.message}`);
    }

    logger.info(`Generated ${episodePlan.length} episode plans for series ${seriesId}`);
    return data as VideoSeries;
  }

  /**
   * Create a project for a specific episode in a series.
   * Inherits style guide and continuity from the series.
   */
  async createEpisodeProject(
    seriesId: string,
    episodeNumber: number,
    createdBy?: string,
  ): Promise<VideoProject> {
    const series = await this.getSeries(seriesId);
    if (!series) throw new Error(`Series ${seriesId} not found`);

    const episode = series.episode_plan?.find(
      (ep) => ep.episode_number === episodeNumber,
    );
    if (!episode) {
      throw new Error(`Episode ${episodeNumber} not found in series plan`);
    }

    const project = await this.createProject(
      `${series.title} - Ep ${episodeNumber}: ${episode.title}`,
      `${episode.synopsis}\n\nSeries context: ${series.concept}\nContinuity: ${JSON.stringify(series.continuity)}`,
      createdBy,
      {
        projectType: series.project_type,
        creativeBrief: series.style_guide || undefined,
        seriesId,
        episodeNumber,
      },
    );

    // Update the episode plan to reference this project
    const updatedPlan = (series.episode_plan || []).map((ep) =>
      ep.episode_number === episodeNumber
        ? { ...ep, project_id: project.id, status: "in_production" as const }
        : ep,
    );

    await this.supabase
      .from("video_series")
      .update({
        episode_plan: updatedPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", seriesId);

    logger.info(`Created episode project for ${series.title} Ep ${episodeNumber}: ${project.id}`);
    return project;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build creative context string from a project's type and brief for EDL prompts.
   */
  private buildBriefContext(project: VideoProject): string {
    const parts: string[] = [];

    const brief = project.creative_brief;
    if (!brief) return "";

    if (brief.target_audience) {
      parts.push(`TARGET AUDIENCE: ${brief.target_audience}`);
    }
    if (brief.mood) {
      parts.push(`MOOD/TONE: ${brief.mood}`);
    }
    if (brief.style_references?.length) {
      parts.push(`STYLE REFERENCES: ${brief.style_references.join(", ")}`);
    }
    if (brief.duration_target_ms) {
      parts.push(`TARGET DURATION: ${Math.round(brief.duration_target_ms / 1000)}s`);
    }
    if (brief.aspect_ratio) {
      parts.push(`ASPECT RATIO: ${brief.aspect_ratio}`);
    }
    if (brief.brand_guidelines) {
      const bg = brief.brand_guidelines;
      if (bg.tone_of_voice) parts.push(`BRAND TONE: ${bg.tone_of_voice}`);
      if (bg.colors?.length) parts.push(`BRAND COLORS: ${bg.colors.join(", ")}`);
    }
    if (brief.model_preferences?.video_model) {
      parts.push(`PREFERRED VIDEO MODEL: ${brief.model_preferences.video_model}`);
    }

    return parts.length > 0
      ? `CREATIVE BRIEF:\n${parts.join("\n")}\n\n`
      : "";
  }

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
   * Generate any assets referenced in the EDL that don't exist yet:
   * AI-generated video clips (Kling v3), b-roll images, enhanced images, TTS audio.
   */
  private async generateMissingAssets(
    edl: EDL,
    progressCallback?: (msg: string) => Promise<void>,
  ): Promise<void> {
    const generationTasks: Array<Promise<void>> = [];

    for (const item of edl.tracks.video) {
      // AI-generated video clips (hero shots, b-roll, transitions, opening/closing)
      if (
        item.type === "ai_generated_video" &&
        !item.source_url &&
        item.generation?.prompt
      ) {
        const gen = item.generation;
        // generateVideo() is added by fal-service upgrade — check at runtime
        const fal = this.falService as unknown as Record<string, unknown>;
        if (typeof fal.generateVideo === "function") {
          generationTasks.push(
            (async () => {
              try {
                await progressCallback?.(`Generating AI video: ${gen.prompt.substring(0, 50)}...`);
                const generateVideo = fal.generateVideo as (
                  prompt: string,
                  opts?: Record<string, unknown>,
                ) => Promise<{ url: string; durationMs?: number }>;
                const videoResult = await generateVideo.call(this.falService,
                  gen.prompt,
                  {
                    duration: gen.duration_seconds ? `${gen.duration_seconds}` : "5",
                    aspectRatio: gen.aspect_ratio,
                    imageUrl: gen.reference_image_url,
                  },
                );
                const storagePath = `generated/ai-video-${randomUUID()}.mp4`;
                const response = await fetch(videoResult.url);
                if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
                const buffer = Buffer.from(await response.arrayBuffer());
                const url = await this.uploadBufferToStorage(buffer, storagePath, "video/mp4");
                item.source_url = url;
                if (videoResult.durationMs) {
                  item.duration_ms = videoResult.durationMs;
                }
                logger.info(`AI video generated for ${item.id}: ${url}`);
              } catch (err) {
                logger.warn(`Failed to generate AI video for item ${item.id}: ${err}`);
              }
            })(),
          );
        } else {
          logger.warn(`AI video generation not available (generateVideo not found on FalService), skipping ${item.id}`);
        }
      }

      // AI-generated images (scene backgrounds, product shots, thumbnails, title cards)
      if (
        item.type === "image_overlay" &&
        !item.source_url &&
        !item.source_asset_id
      ) {
        const prompt = item.generation?.prompt || item.reasoning;
        if (prompt) {
          generationTasks.push(
            (async () => {
              try {
                await progressCallback?.(`Generating image: ${prompt.substring(0, 50)}...`);
                let imageBuffer: Buffer;
                const fal = this.falService as unknown as Record<string, unknown>;
                if (item.generation?.reference_image_url && typeof fal.editImage === "function") {
                  // Use image editing to composite subject into generated background
                  const editImage = fal.editImage as (
                    imageUrl: string,
                    prompt: string,
                  ) => Promise<Buffer>;
                  imageBuffer = await editImage.call(
                    this.falService,
                    item.generation.reference_image_url,
                    prompt,
                  );
                } else {
                  imageBuffer = await this.falService.generateImage(prompt);
                }
                const storagePath = `generated/img-${randomUUID()}.png`;
                const url = await this.uploadBufferToStorage(imageBuffer, storagePath, "image/png");
                item.source_url = url;
                logger.info(`Image generated for ${item.id}: ${url}`);
              } catch (err) {
                logger.warn(`Failed to generate image for item ${item.id}: ${err}`);
              }
            })(),
          );
        }
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

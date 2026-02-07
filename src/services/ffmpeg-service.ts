import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { getConfig } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { ProbeResult } from "../types/index.js";

const execFile = promisify(execFileCb);

export interface TextOverlayOptions {
  fontSize: number;
  color: string;
  position: "top" | "center" | "bottom";
  fontFile?: string;
  backgroundColor?: string;
}

export class FFmpegService {
  private ffmpegPath: string;
  private ffprobePath: string;
  private tempDir: string;

  constructor() {
    const config = getConfig();
    this.ffmpegPath = config.FFMPEG_PATH;
    this.ffprobePath = config.FFPROBE_PATH;
    this.tempDir = config.VIDEO_TEMP_DIR;
    this.ensureTempDir();
    logger.info(`FFmpegService initialized (tempDir: ${this.tempDir})`);
  }

  // ---------------------------------------------------------------------------
  // Temp directory management
  // ---------------------------------------------------------------------------

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (err) {
      logger.error("Failed to create temp directory", { dir: this.tempDir, err });
    }
  }

  getTempPath(ext = ".mp4"): string {
    const filename = `${randomUUID()}${ext.startsWith(".") ? ext : `.${ext}`}`;
    return path.join(this.tempDir, filename);
  }

  async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await fs.unlink(p);
        logger.debug(`Cleaned up temp file: ${p}`);
      } catch {
        // file may already be gone — ignore
      }
    }
  }

  async cleanupAll(): Promise<void> {
    try {
      const entries = await fs.readdir(this.tempDir);
      await Promise.all(
        entries.map((entry) =>
          fs.unlink(path.join(this.tempDir, entry)).catch(() => {}),
        ),
      );
      logger.info(`Cleaned up all files in ${this.tempDir} (${entries.length} files)`);
    } catch (err) {
      logger.error("Failed to clean up temp directory", err);
    }
  }

  async downloadToTemp(url: string): Promise<string> {
    const ext = path.extname(new URL(url).pathname) || ".mp4";
    const dest = this.getTempPath(ext);

    logger.info(`Downloading ${url} to ${dest}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
    }

    const body = response.body;
    if (!body) {
      throw new Error(`Download failed: empty body for ${url}`);
    }

    const writeStream = createWriteStream(dest);
    await pipeline(Readable.fromWeb(body as any), writeStream);

    const stat = await fs.stat(dest);
    logger.info(`Downloaded ${stat.size} bytes to ${dest}`);
    return dest;
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  async probe(inputPath: string): Promise<ProbeResult> {
    logger.debug(`Probing: ${inputPath}`);

    const { stdout } = await execFile(this.ffprobePath, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ]);

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find(
      (s: Record<string, unknown>) => s.codec_type === "video",
    );
    const audioStream = data.streams?.find(
      (s: Record<string, unknown>) => s.codec_type === "audio",
    );
    const format = data.format;

    if (!videoStream) {
      throw new Error(`No video stream found in ${inputPath}`);
    }

    // Parse FPS from r_frame_rate (e.g. "30/1" or "30000/1001")
    let fps = 30;
    if (videoStream.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split("/");
      fps = parts.length === 2
        ? parseFloat(parts[0]) / parseFloat(parts[1])
        : parseFloat(parts[0]);
    }

    const result: ProbeResult = {
      duration_ms: Math.round(parseFloat(format?.duration || videoStream.duration || "0") * 1000),
      width: parseInt(videoStream.width, 10),
      height: parseInt(videoStream.height, 10),
      fps: Math.round(fps * 100) / 100,
      codec: videoStream.codec_name || "unknown",
      has_audio: !!audioStream,
      audio_codec: audioStream?.codec_name,
      file_size_bytes: parseInt(format?.size || "0", 10),
    };

    logger.debug("Probe result", result);
    return result;
  }

  async cut(
    inputPath: string,
    startMs: number,
    durationMs: number,
    outputPath?: string,
  ): Promise<string> {
    const out = outputPath ?? this.getTempPath();
    const startSec = (startMs / 1000).toFixed(3);
    const durationSec = (durationMs / 1000).toFixed(3);

    logger.info(`Cutting ${inputPath}: start=${startSec}s duration=${durationSec}s`);

    await execFile(this.ffmpegPath, [
      "-y",
      "-ss", startSec,
      "-i", inputPath,
      "-t", durationSec,
      "-c", "copy",
      "-avoid_negative_ts", "make_start_zero",
      out,
    ]);

    logger.info(`Cut complete: ${out}`);
    return out;
  }

  async concat(inputPaths: string[], outputPath?: string): Promise<string> {
    if (inputPaths.length === 0) {
      throw new Error("concat requires at least one input");
    }
    if (inputPaths.length === 1) {
      // Nothing to concat — just copy
      const out = outputPath ?? this.getTempPath();
      await fs.copyFile(inputPaths[0], out);
      return out;
    }

    const out = outputPath ?? this.getTempPath();
    const listFile = this.getTempPath(".txt");

    try {
      // Build the concat demuxer file list
      const listContent = inputPaths
        .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await fs.writeFile(listFile, listContent, "utf-8");

      logger.info(`Concatenating ${inputPaths.length} files`);

      await execFile(this.ffmpegPath, [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        "-c", "copy",
        out,
      ]);

      logger.info(`Concat complete: ${out}`);
      return out;
    } finally {
      await this.cleanup([listFile]);
    }
  }

  async extractFrames(
    inputPath: string,
    intervalSec: number,
    outputDir?: string,
  ): Promise<string[]> {
    const dir = outputDir ?? path.join(this.tempDir, randomUUID());
    await fs.mkdir(dir, { recursive: true });

    const pattern = path.join(dir, "frame_%04d.png");

    logger.info(`Extracting frames from ${inputPath} every ${intervalSec}s`);

    await execFile(this.ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-vf", `fps=1/${intervalSec}`,
      "-vsync", "vfr",
      pattern,
    ]);

    const entries = await fs.readdir(dir);
    const frames = entries
      .filter((f) => f.startsWith("frame_") && f.endsWith(".png"))
      .sort()
      .map((f) => path.join(dir, f));

    logger.info(`Extracted ${frames.length} frames`);
    return frames;
  }

  async extractAudio(inputPath: string, outputPath?: string): Promise<string> {
    const out = outputPath ?? this.getTempPath(".mp3");

    logger.info(`Extracting audio from ${inputPath}`);

    await execFile(this.ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "2",
      out,
    ]);

    logger.info(`Audio extracted: ${out}`);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Audio operations
  // ---------------------------------------------------------------------------

  async addAudioTrack(
    videoPath: string,
    audioPath: string,
    outputPath?: string,
  ): Promise<string> {
    const out = outputPath ?? this.getTempPath();

    logger.info(`Adding audio track to ${videoPath}`);

    await execFile(this.ffmpegPath, [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      out,
    ]);

    logger.info(`Audio added: ${out}`);
    return out;
  }

  async adjustVolume(
    inputPath: string,
    volume: number,
    outputPath?: string,
  ): Promise<string> {
    if (volume < 0.0 || volume > 2.0) {
      throw new Error(`Volume must be between 0.0 and 2.0, got ${volume}`);
    }

    const out = outputPath ?? this.getTempPath();

    logger.info(`Adjusting volume to ${volume}x for ${inputPath}`);

    await execFile(this.ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-af", `volume=${volume}`,
      "-c:v", "copy",
      out,
    ]);

    logger.info(`Volume adjusted: ${out}`);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Visual operations
  // ---------------------------------------------------------------------------

  async addTextOverlay(
    inputPath: string,
    text: string,
    options: TextOverlayOptions,
    outputPath?: string,
  ): Promise<string> {
    const out = outputPath ?? this.getTempPath();

    // Escape special characters for ffmpeg drawtext
    const escapedText = text
      .replace(/\\/g, "\\\\\\\\")
      .replace(/'/g, "\u2019")
      .replace(/:/g, "\\:")
      .replace(/%/g, "%%");

    // Build y-position expression
    let yExpr: string;
    switch (options.position) {
      case "top":
        yExpr = "h*0.1";
        break;
      case "center":
        yExpr = "(h-text_h)/2";
        break;
      case "bottom":
        yExpr = "h*0.85-text_h";
        break;
    }

    let drawTextFilter =
      `drawtext=text='${escapedText}'` +
      `:fontsize=${options.fontSize}` +
      `:fontcolor=${options.color}` +
      `:x=(w-text_w)/2` +
      `:y=${yExpr}`;

    if (options.fontFile) {
      drawTextFilter += `:fontfile='${options.fontFile}'`;
    }

    if (options.backgroundColor) {
      drawTextFilter += `:box=1:boxcolor=${options.backgroundColor}:boxborderw=10`;
    }

    logger.info(`Adding text overlay to ${inputPath}: "${text.substring(0, 40)}..."`);

    await execFile(this.ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-vf", drawTextFilter,
      "-c:a", "copy",
      out,
    ]);

    logger.info(`Text overlay added: ${out}`);
    return out;
  }

  async adjustSpeed(
    inputPath: string,
    speed: number,
    outputPath?: string,
  ): Promise<string> {
    if (speed < 0.5 || speed > 4.0) {
      throw new Error(`Speed must be between 0.5 and 4.0, got ${speed}`);
    }

    const out = outputPath ?? this.getTempPath();
    const videoFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`;

    logger.info(`Adjusting speed to ${speed}x for ${inputPath}`);

    // atempo only supports 0.5-2.0, so chain multiple filters if needed
    const atempoFilters: string[] = [];
    let remaining = speed;
    while (remaining > 2.0) {
      atempoFilters.push("atempo=2.0");
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      atempoFilters.push("atempo=0.5");
      remaining /= 0.5;
    }
    atempoFilters.push(`atempo=${remaining.toFixed(4)}`);

    // Check if input has audio
    let hasAudio = false;
    try {
      const probeResult = await this.probe(inputPath);
      hasAudio = probeResult.has_audio;
    } catch {
      // If probe fails, try without audio filter
    }

    const args = [
      "-y",
      "-i", inputPath,
      "-vf", videoFilter,
    ];

    if (hasAudio) {
      args.push("-af", atempoFilters.join(","));
    } else {
      args.push("-an");
    }

    args.push(out);

    await execFile(this.ffmpegPath, args);

    logger.info(`Speed adjusted: ${out}`);
    return out;
  }

  async crossfadeTransition(
    inputA: string,
    inputB: string,
    durationMs: number,
    outputPath?: string,
  ): Promise<string> {
    const out = outputPath ?? this.getTempPath();
    const durationSec = (durationMs / 1000).toFixed(3);

    // Need durations to calculate offset
    const probeA = await this.probe(inputA);
    const offsetSec = ((probeA.duration_ms - durationMs) / 1000).toFixed(3);

    logger.info(
      `Crossfade transition: ${durationSec}s between clips (offset: ${offsetSec}s)`,
    );

    await execFile(this.ffmpegPath, [
      "-y",
      "-i", inputA,
      "-i", inputB,
      "-filter_complex",
      `[0:v][1:v]xfade=transition=fade:duration=${durationSec}:offset=${offsetSec}[v];` +
      `[0:a][1:a]acrossfade=d=${durationSec}[a]`,
      "-map", "[v]",
      "-map", "[a]",
      out,
    ]);

    logger.info(`Crossfade complete: ${out}`);
    return out;
  }
}

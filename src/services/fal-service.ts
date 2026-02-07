import { fal } from "@fal-ai/client";
import { logger } from "../utils/logger.js";
import type {
  FalVideoOptions,
  FalVideoResult,
  FalImageOptions,
  FalImageEditOptions,
  FalEnhanceOptions,
  FalEnhanceResult,
  FalImageModel,
} from "../types/index.js";

// ============================================================
// Model Registry — swap models by changing these values
// ============================================================

export const FAL_MODELS = {
  // Video generation (Kling v3)
  videoStandard: "fal-ai/kling-video/v3/standard/text-to-video",
  videoPro: "fal-ai/kling-video/v3/pro/text-to-video",
  imageToVideoStandard: "fal-ai/kling-video/v3/standard/image-to-video",
  imageToVideoPro: "fal-ai/kling-video/v3/pro/image-to-video",

  // Image generation
  imageDefault: "fal-ai/nano-banana-pro",
  imageFallback: "fal-ai/flux-2-flex",

  // Image editing (natural language, no mask required)
  imageEdit: "fal-ai/gemini-3-pro-image-preview/edit",

  // Image enhancement / upscaling
  upscale: "fal-ai/topaz/upscale/image",

  // Audio
  tts: "fal-ai/minimax/speech-2.8-hd",
  whisper: "fal-ai/whisper",
} as const;

/** Mapping from FalImageModel to fal.ai endpoint */
const IMAGE_MODEL_ENDPOINTS: Record<FalImageModel, string> = {
  "nano-banana-pro": FAL_MODELS.imageDefault,
  "flux-2-flex": FAL_MODELS.imageFallback,
};

export class FalService {
  private _isAvailable: boolean;

  constructor() {
    const falKey = process.env.FAL_KEY;
    this._isAvailable = !!falKey;

    if (falKey) {
      fal.config({ credentials: falKey });
      logger.info("fal.ai service initialized");
    } else {
      logger.warn("FAL_KEY not set — fal.ai TTS and image generation disabled");
    }
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  private ensureAvailable(): void {
    if (!this._isAvailable) {
      throw new Error("fal.ai not configured (missing FAL_KEY)");
    }
  }

  // ---------------------------------------------------------------------------
  // TTS & Transcription
  // ---------------------------------------------------------------------------

  /**
   * Generate speech from text using MiniMax Speech-2.8 HD via fal.ai
   * Returns audio buffer and duration.
   */
  async generateSpeech(
    text: string,
  ): Promise<{ buffer: Buffer; durationMs: number }> {
    this.ensureAvailable();

    const voiceId = process.env.FAL_TTS_VOICE_ID || "Casual_Guy";

    logger.info(`Generating TTS via fal.ai MiniMax (${text.length} chars, voice: ${voiceId})`);

    const result = await fal.subscribe(FAL_MODELS.tts, {
      input: {
        prompt: text,
        voice_setting: {
          voice_id: voiceId,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        output_format: "url",
      },
    });

    const data = result.data as {
      audio: { url: string; content_type: string; duration?: number };
    };

    if (!data?.audio?.url) {
      throw new Error("fal.ai TTS returned no audio URL");
    }

    const response = await fetch(data.audio.url);
    if (!response.ok) {
      throw new Error(`Failed to download TTS audio: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Duration in ms — estimate from audio size if not provided (MP3 ~128kbps)
    const durationMs = data.audio.duration
      ? data.audio.duration * 1000
      : Math.round((buffer.length / (128 * 1000 / 8)) * 1000);

    logger.info(`TTS generated: ${buffer.length} bytes, ~${Math.round(durationMs / 1000)}s`);
    return { buffer, durationMs };
  }

  /**
   * Transcribe audio and return word-level timestamps using fal.ai Whisper.
   * Returns an array of { word, start, end } where start/end are in milliseconds.
   */
  async transcribeAudio(
    audioBuffer: Buffer,
  ): Promise<Array<{ word: string; start: number; end: number }>> {
    this.ensureAvailable();

    logger.info(`Transcribing audio via fal.ai Whisper (${audioBuffer.length} bytes)`);

    try {
      const base64Audio = audioBuffer.toString("base64");
      const audioDataUrl = `data:audio/mpeg;base64,${base64Audio}`;

      const result = await fal.subscribe(FAL_MODELS.whisper, {
        input: {
          audio_url: audioDataUrl,
          task: "transcribe",
          chunk_level: "word",
        },
      });

      const data = result.data as {
        chunks?: Array<{
          text: string;
          timestamp: [number, number];
        }>;
      };

      if (!data?.chunks || data.chunks.length === 0) {
        logger.warn("Whisper returned no word-level chunks");
        return [];
      }

      const words = data.chunks.map((chunk) => ({
        word: chunk.text.trim(),
        start: Math.round(chunk.timestamp[0] * 1000),
        end: Math.round(chunk.timestamp[1] * 1000),
      })).filter((w) => w.word.length > 0);

      logger.info(`Whisper transcription: ${words.length} words detected`);
      return words;
    } catch (err) {
      logger.warn(`Audio transcription failed (continuing without captions): ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Image Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate an image.
   * Default: Nano Banana Pro (Gemini 3 Pro Image — photorealistic, text rendering).
   * Fallback: Flux 2 Flex (fast, general purpose).
   */
  async generateImage(
    prompt: string,
    options?: FalImageOptions,
  ): Promise<Buffer> {
    this.ensureAvailable();

    const model = options?.model ?? "nano-banana-pro";
    const endpoint = IMAGE_MODEL_ENDPOINTS[model];

    logger.info(`Generating image via fal.ai ${model}`);

    let input: Record<string, unknown>;

    if (model === "nano-banana-pro") {
      input = {
        prompt,
        aspect_ratio: options?.aspectRatio ?? "1:1",
        resolution: options?.resolution ?? "1K",
        output_format: options?.outputFormat ?? "png",
        safety_tolerance: 4,
      };
    } else {
      // flux-2-flex fallback
      input = {
        prompt,
        image_size: {
          width: options?.width ?? 1080,
          height: options?.height ?? 1080,
        },
      };
    }

    const result = await fal.subscribe(endpoint, { input });

    const data = result.data as {
      images: Array<{ url: string }>;
    };

    if (!data?.images?.[0]?.url) {
      throw new Error(`fal.ai ${model} returned no image URL`);
    }

    const response = await fetch(data.images[0].url);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ---------------------------------------------------------------------------
  // Video Generation (Kling v3)
  // ---------------------------------------------------------------------------

  /**
   * Generate a video from a text prompt using Kling v3.
   * Supports standard and pro modes, 3-15 second duration, native audio.
   */
  async generateVideo(
    prompt: string,
    options?: FalVideoOptions,
  ): Promise<FalVideoResult> {
    this.ensureAvailable();

    const mode = options?.mode ?? "standard";
    const endpoint = mode === "pro"
      ? FAL_MODELS.videoPro
      : FAL_MODELS.videoStandard;
    const duration = options?.duration ?? 5;
    const aspectRatio = options?.aspectRatio ?? "16:9";
    const generateAudio = options?.generateAudio ?? true;

    logger.info(
      `Generating video via Kling v3 ${mode} (${duration}s, ${aspectRatio}, audio=${generateAudio})`,
    );

    const input: Record<string, unknown> = {
      prompt,
      duration: String(duration),
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
      cfg_scale: options?.cfgScale ?? 0.5,
    };
    if (options?.negativePrompt) {
      input.negative_prompt = options.negativePrompt;
    }

    const result = await fal.subscribe(endpoint, { input });

    const data = result.data as {
      video: { url: string; content_type: string; file_size?: number };
    };

    if (!data?.video?.url) {
      throw new Error(`Kling v3 ${mode} returned no video URL`);
    }

    logger.info(`Video generated: ${data.video.url} (${data.video.file_size ?? "?"} bytes)`);

    return {
      videoUrl: data.video.url,
      contentType: data.video.content_type || "video/mp4",
      fileSize: data.video.file_size,
    };
  }

  /**
   * Generate a video from a source image + motion prompt using Kling v3.
   * The source image becomes the first frame; the prompt describes desired motion.
   */
  async imageToVideo(
    imageUrl: string,
    prompt: string,
    options?: FalVideoOptions,
  ): Promise<FalVideoResult> {
    this.ensureAvailable();

    const mode = options?.mode ?? "standard";
    const endpoint = mode === "pro"
      ? FAL_MODELS.imageToVideoPro
      : FAL_MODELS.imageToVideoStandard;
    const duration = options?.duration ?? 5;
    const aspectRatio = options?.aspectRatio ?? "16:9";
    const generateAudio = options?.generateAudio ?? true;

    logger.info(
      `Generating image-to-video via Kling v3 ${mode} (${duration}s, ${aspectRatio})`,
    );

    const input: Record<string, unknown> = {
      prompt,
      start_image_url: imageUrl,
      duration: String(duration),
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
      cfg_scale: options?.cfgScale ?? 0.5,
    };
    if (options?.negativePrompt) {
      input.negative_prompt = options.negativePrompt;
    }

    const result = await fal.subscribe(endpoint, { input });

    const data = result.data as {
      video: { url: string; content_type: string; file_size?: number };
    };

    if (!data?.video?.url) {
      throw new Error(`Kling v3 image-to-video ${mode} returned no video URL`);
    }

    logger.info(`Image-to-video generated: ${data.video.url}`);

    return {
      videoUrl: data.video.url,
      contentType: data.video.content_type || "video/mp4",
      fileSize: data.video.file_size,
    };
  }

  // ---------------------------------------------------------------------------
  // Image Editing (Gemini 3 Pro — natural language, no mask required)
  // ---------------------------------------------------------------------------

  /**
   * Edit an image using Gemini 3 Pro Image Edit.
   * Uses natural language instructions — no mask required.
   * Great for: background replacement, object removal, style changes, cleanup.
   */
  async editImage(
    imageUrl: string,
    prompt: string,
    options?: FalImageEditOptions,
  ): Promise<Buffer> {
    this.ensureAvailable();

    logger.info(`Editing image via Gemini 3 Pro Image Edit`);

    const endpoint: string = FAL_MODELS.imageEdit;
    const input: Record<string, unknown> = {
      prompt,
      image_urls: [imageUrl],
      resolution: options?.resolution ?? "1K",
      output_format: options?.outputFormat ?? "png",
      safety_tolerance: 4,
    };
    if (options?.seed !== undefined) input.seed = options.seed;
    if (options?.numImages !== undefined) input.num_images = options.numImages;

    const result = await fal.subscribe(endpoint, { input });

    const data = result.data as {
      images: Array<{ url: string; width?: number; height?: number }>;
    };

    if (!data?.images?.[0]?.url) {
      throw new Error("Gemini 3 Pro Image Edit returned no image URL");
    }

    const response = await fetch(data.images[0].url);
    if (!response.ok) {
      throw new Error(`Failed to download edited image: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    logger.info(
      `Image edited: ${data.images[0].width ?? "?"}x${data.images[0].height ?? "?"}`,
    );

    return Buffer.from(arrayBuffer);
  }

  // ---------------------------------------------------------------------------
  // Image Enhancement / Upscaling (Topaz)
  // ---------------------------------------------------------------------------

  /**
   * Upscale/enhance an image using Topaz Image Upscaler.
   * Multiple model variants for different content types:
   * - "Standard V2" (default) — general-purpose
   * - "Low Resolution V2" — heavily compressed/low-res sources
   * - "CGI" — rendered/CG content
   * - "High Fidelity V2" — preserves fine detail
   * - "Text Refine" — text-heavy images
   * - "Recovery" / "Recovery V2" — severely degraded images
   * - "Redefine" — creative reinterpretation
   */
  async enhanceImage(
    imageUrl: string,
    options?: FalEnhanceOptions,
  ): Promise<FalEnhanceResult> {
    this.ensureAvailable();

    const model = options?.model ?? "Standard V2";
    const upscaleFactor = options?.upscaleFactor ?? 2;
    const faceEnhancement = options?.faceEnhancement ?? true;

    logger.info(
      `Enhancing image via Topaz "${model}" (${upscaleFactor}x, face=${faceEnhancement})`,
    );

    const endpoint: string = FAL_MODELS.upscale;
    const result = await fal.subscribe(endpoint, {
      input: {
        image_url: imageUrl,
        model,
        upscale_factor: upscaleFactor,
        output_format: options?.outputFormat ?? "png",
        face_enhancement: faceEnhancement,
        face_enhancement_strength: options?.faceEnhancementStrength ?? 0.8,
      },
    });

    const data = result.data as {
      image: { url: string; content_type?: string; file_size?: number };
    };

    if (!data?.image?.url) {
      throw new Error(`Topaz "${model}" returned no image URL`);
    }

    logger.info(`Image enhanced via Topaz "${model}"`);

    return {
      imageUrl: data.image.url,
      contentType: data.image.content_type,
      fileSize: data.image.file_size,
    };
  }
}

import { fal } from "@fal-ai/client";
import { logger } from "../utils/logger.js";

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

  /**
   * Generate speech from text using MiniMax Speech-2.8 HD via fal.ai
   * Returns audio buffer and duration.
   */
  async generateSpeech(
    text: string,
  ): Promise<{ buffer: Buffer; durationMs: number }> {
    if (!this._isAvailable) {
      throw new Error("fal.ai not configured (missing FAL_KEY)");
    }

    const voiceId = process.env.FAL_TTS_VOICE_ID || "Casual_Guy";

    logger.info(`Generating TTS via fal.ai MiniMax (${text.length} chars, voice: ${voiceId})`);

    const result = await fal.subscribe("fal-ai/minimax/speech-2.8-hd", {
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

    // Download the audio file
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
   * Generate an image using Flux 2 Flex via fal.ai
   */
  async generateImage(prompt: string): Promise<Buffer> {
    if (!this._isAvailable) {
      throw new Error("fal.ai not configured (missing FAL_KEY)");
    }

    logger.info(`Generating image via fal.ai Flux 2 Flex`);

    const result = await fal.subscribe("fal-ai/flux-2-flex", {
      input: {
        prompt,
        image_size: { width: 1080, height: 1080 },
      },
    });

    const data = result.data as {
      images: Array<{ url: string }>;
    };

    if (!data?.images?.[0]?.url) {
      throw new Error("fal.ai image generation returned no image URL");
    }

    const response = await fetch(data.images[0].url);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

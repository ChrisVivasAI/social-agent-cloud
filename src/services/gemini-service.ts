import { getConfig } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { GeminiModel, GeminiGenerateOptions, GeminiVisionInput } from "../types/index.js";

/**
 * Dual-model Gemini service via Vertex AI REST API.
 * - Pro: Complex reasoning, script writing, footage analysis, performance analysis
 * - Flash: Fast operations, classification, captions, metadata, quick analysis
 */
export class GeminiService {
  private projectId: string;
  private location: string;
  private proModel: string;
  private flashModel: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    const config = getConfig();
    this.projectId = config.GOOGLE_CLOUD_PROJECT || "";
    this.location = config.GOOGLE_CLOUD_LOCATION;
    this.proModel = config.GEMINI_PRO_MODEL;
    this.flashModel = config.GEMINI_FLASH_MODEL;
  }

  get isAvailable(): boolean {
    return !!this.projectId;
  }

  private getModelId(model: GeminiModel): string {
    return model === "pro" ? this.proModel : this.flashModel;
  }

  /** Build the Vertex AI base URL — global endpoint has no region prefix. */
  private getBaseUrl(): string {
    if (this.location === "global") {
      return `https://aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/global`;
    }
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}`;
  }

  /**
   * Get an access token via Application Default Credentials.
   * Uses the metadata server in GCP, or gcloud CLI locally.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // Try GCP metadata server first (works in Cloud Run, GCE, etc.)
      const metadataResponse = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" } },
      );
      if (metadataResponse.ok) {
        const data = await metadataResponse.json() as { access_token: string; expires_in: number };
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        return this.accessToken;
      }
    } catch {
      // Not on GCP, try gcloud CLI
    }

    try {
      const { execSync } = await import("child_process");
      const token = execSync("gcloud auth print-access-token", {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
      this.accessToken = token;
      this.tokenExpiry = Date.now() + 55 * 60 * 1000; // ~55 min
      return this.accessToken;
    } catch (err) {
      throw new Error(
        `Failed to get GCP access token. Ensure gcloud CLI is configured or running on GCP. Error: ${err}`,
      );
    }
  }

  /**
   * Generate text using Gemini Pro or Flash.
   */
  async generateText(
    prompt: string,
    userMessage: string,
    options: GeminiGenerateOptions = {},
  ): Promise<string> {
    const model = options.model || "flash";
    const modelId = this.getModelId(model);
    const token = await this.getAccessToken();

    const url = `${this.getBaseUrl()}/publishers/google/models/${modelId}:generateContent`;

    const requestBody: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${prompt}\n\n${userMessage}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 1.0,
        ...(options.jsonMode && { responseMimeType: "application/json" }),
        ...(options.thinkingLevel && {
          thinkingConfig: { thinkingLevel: options.thinkingLevel.toUpperCase() },
        }),
      },
    };

    if (options.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini ${model} API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    // Gemini 2.5 Pro is a thinking model — skip thought parts and find the actual text
    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p) => !p.thought && p.text);
    const text = textPart?.text || "";

    if (data.usageMetadata) {
      logger.info(
        `Gemini ${model}: ${data.usageMetadata.promptTokenCount} input, ${data.usageMetadata.candidatesTokenCount} output tokens`,
      );
    }

    return text;
  }

  /**
   * Generate structured JSON output.
   */
  async generateJSON<T = Record<string, unknown>>(
    prompt: string,
    userMessage: string,
    options: Omit<GeminiGenerateOptions, "jsonMode"> = {},
  ): Promise<T> {
    const text = await this.generateText(prompt, userMessage, {
      ...options,
      jsonMode: true,
    });

    try {
      return JSON.parse(text) as T;
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error(`Failed to parse Gemini JSON response: ${text.substring(0, 200)}`);
    }
  }

  /**
   * Analyze images or video frames using Gemini vision capabilities.
   *
   * Gemini 3 features:
   * - `agenticVision`: enables code_execution tool so the model can auto-zoom/crop
   *   into image regions using Python (Pillow/OpenCV) in a Think-Act-Observe loop.
   * - `thinkingLevel`: controls reasoning depth ("high" for complex analysis,
   *   "minimal" for fast tasks like bounding box detection).
   * - `mediaResolution` (per-input): controls token cost per image/frame.
   */
  async analyzeVision(
    prompt: string,
    inputs: GeminiVisionInput[],
    options: GeminiGenerateOptions = {},
  ): Promise<string> {
    const model = options.model || "flash";
    const modelId = this.getModelId(model);
    const token = await this.getAccessToken();

    const url = `${this.getBaseUrl()}/publishers/google/models/${modelId}:generateContent`;

    const parts: Array<Record<string, unknown>> = [{ text: prompt }];

    for (const input of inputs) {
      if (typeof input.data === "string") {
        // GCS URI
        const part: Record<string, unknown> = {
          fileData: {
            mimeType: input.mimeType,
            fileUri: input.data,
          },
        };
        if (input.mediaResolution) {
          part.mediaResolution = { level: input.mediaResolution };
        }
        parts.push(part);
      } else {
        // Inline base64
        const part: Record<string, unknown> = {
          inlineData: {
            mimeType: input.mimeType,
            data: input.data.toString("base64"),
          },
        };
        if (input.mediaResolution) {
          part.mediaResolution = { level: input.mediaResolution };
        }
        parts.push(part);
      }
    }

    const requestBody: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 8192,
        temperature: options.temperature ?? 1.0, // Google recommends 1.0 for Gemini 3
        ...(options.jsonMode && { responseMimeType: "application/json" }),
        ...(options.thinkingLevel && {
          thinkingConfig: { thinkingLevel: options.thinkingLevel.toUpperCase() },
        }),
      },
    };

    // Enable Agentic Vision — model can write+execute Python to zoom/crop images
    if (options.agenticVision) {
      requestBody.tools = [{ codeExecution: {} }];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini vision API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean; executableCode?: unknown }> };
      }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    // Skip thought parts and code execution parts — extract only text output
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const textParts = responseParts.filter((p) => !p.thought && !p.executableCode && p.text);
    const text = textParts.map((p) => p.text).join("\n");

    if (data.usageMetadata) {
      logger.info(
        `Gemini vision ${model}: ${data.usageMetadata.promptTokenCount} input, ${data.usageMetadata.candidatesTokenCount} output tokens`,
      );
    }

    return text;
  }

  /**
   * Generate embeddings for memory storage/search.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const config = getConfig();
    const token = await this.getAccessToken();
    const embeddingModel = config.MEMORY_EMBEDDING_MODEL;

    const url = `${this.getBaseUrl()}/publishers/google/models/${embeddingModel}:predict`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ content: text }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini embedding API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      predictions?: Array<{ embeddings?: { values?: number[] } }>;
    };

    const values = data.predictions?.[0]?.embeddings?.values;
    if (!values) {
      throw new Error("No embedding values in response");
    }

    return values;
  }
}

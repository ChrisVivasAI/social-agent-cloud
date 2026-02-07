import { getConfig } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { RenderStatus, RemotionTemplate } from "../types/index.js";

export class RemotionService {
  private get rendererUrl(): string {
    return getConfig().REMOTION_RENDERER_URL;
  }

  async listTemplates(): Promise<RemotionTemplate[]> {
    try {
      const response = await fetch(`${this.rendererUrl}/compositions`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      logger.error(`Failed to list Remotion templates: ${error}`);
      return [];
    }
  }

  async startRender(
    compositionId: string,
    props: Record<string, unknown>,
  ): Promise<string> {
    const response = await fetch(`${this.rendererUrl}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compositionId, props }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to start render: ${error}`);
    }

    const { jobId } = await response.json();
    logger.info(`Started Remotion render job: ${jobId}`);
    return jobId;
  }

  async getRenderStatus(jobId: string): Promise<RenderStatus> {
    const response = await fetch(`${this.rendererUrl}/render/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to get render status: HTTP ${response.status}`);
    }
    return await response.json();
  }

  async waitForRender(
    jobId: string,
    timeoutMs: number = 300_000,
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getRenderStatus(jobId);

      if (status.status === "completed" && status.outputUrl) {
        logger.info(`Render job ${jobId} completed: ${status.outputUrl}`);
        return status.outputUrl;
      }

      if (status.status === "failed") {
        throw new Error(`Render failed: ${status.error || "Unknown error"}`);
      }

      // Poll every 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error(`Render timed out after ${timeoutMs}ms`);
  }
}

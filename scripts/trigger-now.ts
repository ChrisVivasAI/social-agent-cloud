/**
 * Manually trigger pipeline processing for pending queue items.
 * Run: npx tsx scripts/trigger-now.ts
 */
import "dotenv/config";
import { validateEnv } from "../src/config/env.js";
import { ContentQueueService } from "../src/services/content-queue.js";
import { ContentGeneratorService } from "../src/services/content-generator.js";
import { RemotionService } from "../src/services/remotion-service.js";
import { FalService } from "../src/services/fal-service.js";
import { createSupabaseClient } from "../src/utils/supabase.js";
import { logger } from "../src/utils/logger.js";

async function main() {
  validateEnv();

  const contentQueue = new ContentQueueService();
  const remotionService = new RemotionService();
  const falService = new FalService();
  const contentGenerator = new ContentGeneratorService(
    contentQueue,
    remotionService,
    falService,
  );

  // Get pending items
  const items = await contentQueue.getPendingItems();
  if (items.length === 0) {
    logger.info("No pending items found");
    return;
  }

  logger.info(`Found ${items.length} pending item(s), processing...`);

  for (const item of items) {
    try {
      await contentGenerator.processQueueItem(item);
      logger.info(`Done processing item ${item.id}`);
    } catch (error) {
      logger.error(`Failed to process item ${item.id}: ${error}`);
    }
  }

  // Now poll for render completion
  logger.info("Waiting for render to complete...");
  const supabase = createSupabaseClient();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000)); // 10s intervals

    const { data: rendering } = await supabase
      .from("content_queue")
      .select("*")
      .eq("status", "rendering")
      .not("remotion_props", "is", null);

    if (!rendering || rendering.length === 0) {
      logger.info("No more rendering items — all done or failed");
      break;
    }

    for (const item of rendering) {
      const jobId = (item.remotion_props as Record<string, unknown>)
        ?._renderJobId as string;
      if (!jobId) continue;
      const status = await remotionService.getRenderStatus(jobId);
      logger.info(`Render ${jobId}: ${status.status} (${status.progress}%)`);
      if (status.status === "completed" && status.outputUrl) {
        await contentQueue.updateItem(item.id, {
          remotion_video_url: status.outputUrl,
          media_url: status.outputUrl,
          media_mime_type: "video/mp4",
          status: "ready",
        });
        logger.info(`Item ${item.id} is now ready! Video: ${status.outputUrl}`);
      } else if (status.status === "failed") {
        await contentQueue.updateItem(item.id, {
          status: "failed",
          error_message: status.error || "Render failed",
        });
        logger.error(`Render failed for ${item.id}: ${status.error}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

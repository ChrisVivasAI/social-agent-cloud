/**
 * Queue an OpenClaw video for generation.
 * Run: npx tsx scripts/queue-openclaw-video.ts
 */
import "dotenv/config";
import { validateEnv } from "../src/config/env.js";
import { ContentQueueService } from "../src/services/content-queue.js";
import { logger } from "../src/utils/logger.js";

async function main() {
  validateEnv();

  const queue = new ContentQueueService();

  const item = await queue.addItem({
    type: "remotion",
    platform: "both",
    content_url:
      "https://dev.to/mechcloud_academy/unleashing-openclaw-the-ultimate-guide-to-local-ai-agents-for-developers-in-2026-3k0h",
    source_text:
      "OpenClaw: The open-source AI agent that went viral. Cover the hype, what's good (local-first, open source, 145k GitHub stars, Docker sandboxing, multi-platform), and what's bad (security concerns, prompt injection risks, full system access dangers). Balanced take.",
    priority: 1,
  });

  logger.info(`Queued OpenClaw video item: ${item.id}`);
  logger.info(`Status: ${item.status}`);
  logger.info(`Scheduled for: ${item.scheduled_for}`);
  logger.info("\nNow run: npx tsx scripts/trigger-now.ts");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

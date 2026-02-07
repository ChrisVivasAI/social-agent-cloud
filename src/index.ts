import "dotenv/config";
import http from "node:http";
import { validateEnv } from "./config/env.js";
import { SchedulerService } from "./services/scheduler.js";
import { SlackListenerService } from "./services/slack-listener.js";
import { SlackHandlerService } from "./services/slack-handlers.js";
import { SlackNotificationService } from "./services/slack-notification.js";
import { ContentQueueService } from "./services/content-queue.js";
import { ContentGeneratorService } from "./services/content-generator.js";
import { PostingService } from "./services/posting-service.js";
import { RemotionService } from "./services/remotion-service.js";
import { FalService } from "./services/fal-service.js";
import { IntakeService } from "./services/intake-service.js";
import { logger } from "./utils/logger.js";

// Keep the process alive on unhandled errors — log them but don't crash
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});
process.on("uncaughtException", (error) => {
  logger.error(`Uncaught exception: ${error.message}\n${error.stack}`);
});

async function main() {
  // 1. Validate all environment variables
  const config = validateEnv();
  logger.info("Environment validated successfully");

  // 2. Initialize core services
  const contentQueue = new ContentQueueService();
  const remotionService = new RemotionService();
  const falService = new FalService();
  const contentGenerator = new ContentGeneratorService(
    contentQueue,
    remotionService,
    falService,
  );
  const postingService = new PostingService();

  // 3. Initialize Slack services if configured
  let slackListener: SlackListenerService | null = null;
  let slackNotification: SlackNotificationService | null = null;
  let slackHandlers: SlackHandlerService | null = null;

  const slackReady =
    config.SLACK_BOT_OAUTH_TOKEN &&
    config.SLACK_SIGNING_SECRET &&
    config.SLACK_SIGNING_SECRET !== "REPLACE_WITH_SIGNING_SECRET";

  if (slackReady) {
    // Create handler service (needs WebClient set later)
    slackHandlers = new SlackHandlerService(contentQueue);
    const intakeService = new IntakeService();

    // Create listener (this creates the Bolt app + exposes WebClient)
    slackListener = new SlackListenerService(contentQueue, slackHandlers, intakeService);

    // Wire up WebClient from the Bolt app to handler and notification services
    const webClient = slackListener.getWebClient();
    slackHandlers.setWebClient(webClient);

    if (config.SLACK_CHANNEL_ID) {
      slackNotification = new SlackNotificationService(
        webClient,
        config.SLACK_CHANNEL_ID,
      );
    }

    await slackListener.start();
  } else {
    logger.warn(
      "Slack not configured (missing SLACK_SIGNING_SECRET) - Slack listener disabled",
    );
    // Standalone health server so Docker healthcheck passes even without Slack
    const healthPort = config.SLACK_EVENTS_PORT || 3002;
    const healthServer = http.createServer((_req, res) => {
      if (_req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    healthServer.listen(healthPort, () => {
      logger.info(`Health endpoint listening on port ${healthPort} (no Slack)`);
    });
  }

  // 4. Start the scheduler (cron jobs)
  const scheduler = new SchedulerService(
    contentQueue,
    contentGenerator,
    postingService,
    remotionService,
    slackNotification,
    slackHandlers,
  );
  scheduler.start();

  logger.info(
    `Social Media Agent started (timezone: ${config.POST_TIMEZONE}, dry_run: ${config.DRY_RUN})`,
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    scheduler.stop();
    if (slackListener) await slackListener.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});

import "dotenv/config";
import express from "express";
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
import { GeminiService } from "./services/gemini-service.js";
import { AgentMemoryService } from "./services/agent-memory.js";
import { DynamicPromptBuilder } from "./services/dynamic-prompt-builder.js";
import { FFmpegService } from "./services/ffmpeg-service.js";
import { FootageLibraryService } from "./services/footage-library.js";
import { VideoEditorAgent } from "./services/video-editor-agent.js";
import { ProactiveAgentService } from "./services/proactive-agent.js";
import { EngagementMonitorService } from "./services/engagement-monitor.js";
import { createApiRouter } from "./services/api-router.js";
import { TwitterClient } from "./clients/twitter.js";
import { createSupabaseClient } from "./utils/supabase.js";
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

  // 2. Initialize intelligence layer
  const gemini = new GeminiService();
  const memory = gemini.isAvailable ? new AgentMemoryService(gemini) : null;
  const promptBuilder = memory ? new DynamicPromptBuilder(memory) : null;

  if (gemini.isAvailable) {
    logger.info("Intelligence layer enabled (Gemini + Memory + Dynamic Prompts)");
  } else {
    logger.info("Intelligence layer disabled (GOOGLE_CLOUD_PROJECT not set)");
  }

  // 3. Initialize core services
  const contentQueue = new ContentQueueService();
  const remotionService = new RemotionService();
  const falService = new FalService();
  const contentGenerator = new ContentGeneratorService(
    contentQueue,
    remotionService,
    falService,
    promptBuilder || undefined,
    memory || undefined,
    gemini.isAvailable ? gemini : undefined,
  );
  const postingService = new PostingService(memory || undefined);

  // 4. Initialize video editor (if Gemini is available)
  let videoEditor: VideoEditorAgent | null = null;
  const ffmpegService = new FFmpegService();
  const footageLibrary = new FootageLibraryService(gemini, ffmpegService);

  if (gemini.isAvailable && memory && promptBuilder) {
    videoEditor = new VideoEditorAgent(
      gemini,
      ffmpegService,
      footageLibrary,
      promptBuilder,
      memory,
      falService,
      remotionService,
    );
    logger.info("Video editor agent enabled");
  }

  // 5. Initialize Slack services if configured
  let slackListener: SlackListenerService | null = null;
  let slackNotification: SlackNotificationService | null = null;
  let slackHandlers: SlackHandlerService | null = null;

  const slackReady =
    config.SLACK_BOT_OAUTH_TOKEN &&
    config.SLACK_SIGNING_SECRET &&
    config.SLACK_SIGNING_SECRET !== "REPLACE_WITH_SIGNING_SECRET";

  if (slackReady) {
    // Create handler service (needs WebClient set later)
    slackHandlers = new SlackHandlerService(contentQueue, memory || undefined);
    const intakeService = new IntakeService(gemini.isAvailable ? gemini : undefined);

    // Create listener (this creates the Bolt app + exposes WebClient)
    slackListener = new SlackListenerService(
      contentQueue,
      slackHandlers,
      intakeService,
      videoEditor || undefined,
      footageLibrary,
    );

    // Wire up WebClient from the Bolt app to handler and notification services
    const webClient = slackListener.getWebClient();
    slackHandlers.setWebClient(webClient);

    if (config.SLACK_CHANNEL_ID) {
      slackNotification = new SlackNotificationService(
        webClient,
        config.SLACK_CHANNEL_ID,
      );
    }

    // Mount REST API router on the Slack Bolt Express app
    const expressApp = slackListener.getExpressApp();
    expressApp.use(express.json());
    const apiRouter = createApiRouter({
      contentQueue,
      slackHandlers,
      videoEditor,
      engagementMonitor: null, // wired later below
      contentGenerator,
    });
    expressApp.use("/api", apiRouter);
    logger.info("REST API router mounted on Slack Express app");

    await slackListener.start();
  } else {
    logger.warn(
      "Slack not configured (missing SLACK_SIGNING_SECRET) - Slack listener disabled",
    );
    // Standalone Express app with health endpoint + API router
    const healthPort = config.SLACK_EVENTS_PORT || 3002;
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });

    const apiRouter = createApiRouter({
      contentQueue,
      slackHandlers: null,
      videoEditor,
      engagementMonitor: null, // wired later below
      contentGenerator,
    });
    app.use("/api", apiRouter);

    app.listen(healthPort, () => {
      logger.info(`Health + API endpoint listening on port ${healthPort} (no Slack)`);
    });
  }

  // 6. Initialize proactive agent (if Slack + Gemini available)
  let proactiveAgent: ProactiveAgentService | null = null;
  if (gemini.isAvailable && memory && promptBuilder && slackListener && config.SLACK_CHANNEL_ID) {
    const webClient = slackListener.getWebClient();
    proactiveAgent = new ProactiveAgentService(
      gemini,
      memory,
      promptBuilder,
      contentQueue,
      webClient,
      config.SLACK_CHANNEL_ID,
    );
    logger.info("Proactive agent personality enabled");
  }

  // 6b. Initialize engagement monitor (if Twitter is configured)
  let engagementMonitor: EngagementMonitorService | null = null;
  try {
    const twitterClient = TwitterClient.fromEnv();
    const supabase = createSupabaseClient();
    engagementMonitor = new EngagementMonitorService(
      twitterClient.getApi(),
      supabase,
    );

    // Wire engagement monitor into the Slack listener for action handlers
    if (slackListener) {
      slackListener.setEngagementMonitor(engagementMonitor);
    }

    logger.info("Engagement monitor enabled");
  } catch (error) {
    logger.warn(`Engagement monitor disabled: ${error}`);
  }

  // 7. Start the scheduler (cron jobs)
  const scheduler = new SchedulerService(
    contentQueue,
    contentGenerator,
    postingService,
    remotionService,
    slackNotification,
    slackHandlers,
    gemini.isAvailable ? gemini : undefined,
    memory || undefined,
    promptBuilder || undefined,
    videoEditor || undefined,
    proactiveAgent || undefined,
    engagementMonitor || undefined,
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

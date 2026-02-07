interface EnvConfig {
  // Claude API
  ANTHROPIC_API_KEY: string;

  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Twitter
  TWITTER_API_KEY: string;
  TWITTER_API_KEY_SECRET: string;
  TWITTER_USER_TOKEN: string;
  TWITTER_USER_TOKEN_SECRET: string;
  TWITTER_USER_ID?: string;

  // LinkedIn
  LINKEDIN_ACCESS_TOKEN: string;
  LINKEDIN_USER_ID?: string;
  LINKEDIN_ORGANIZATION_ID?: string;
  POST_TO_LINKEDIN_ORGANIZATION: boolean;

  // Slack (optional - app runs without Slack listener if not configured)
  SLACK_BOT_OAUTH_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  SLACK_CHANNEL_ID?: string;
  SLACK_EVENTS_PORT: number;

  // FireCrawl
  FIRECRAWL_API_KEY: string;

  // Remotion
  REMOTION_RENDERER_URL: string;

  // fal.ai (optional)
  FAL_KEY?: string;
  FAL_TTS_VOICE_ID?: string;

  // Scheduling
  POST_TIMEZONE: string;

  // Auto-approval
  AUTO_APPROVE_ENABLED: boolean;
  AUTO_APPROVE_TYPES: string[]; // content types that skip approval

  // Debug
  DRY_RUN: boolean;
  LOG_LEVEL: string;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

let _config: EnvConfig | null = null;

export function validateEnv(): EnvConfig {
  if (_config) return _config;

  _config = {
    ANTHROPIC_API_KEY: getRequiredEnv("ANTHROPIC_API_KEY"),
    SUPABASE_URL: getRequiredEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    TWITTER_API_KEY: getRequiredEnv("TWITTER_API_KEY"),
    TWITTER_API_KEY_SECRET: getRequiredEnv("TWITTER_API_KEY_SECRET"),
    TWITTER_USER_TOKEN: getRequiredEnv("TWITTER_USER_TOKEN"),
    TWITTER_USER_TOKEN_SECRET: getRequiredEnv("TWITTER_USER_TOKEN_SECRET"),
    TWITTER_USER_ID: process.env.TWITTER_USER_ID,
    LINKEDIN_ACCESS_TOKEN: getRequiredEnv("LINKEDIN_ACCESS_TOKEN"),
    LINKEDIN_USER_ID: process.env.LINKEDIN_USER_ID,
    LINKEDIN_ORGANIZATION_ID: process.env.LINKEDIN_ORGANIZATION_ID,
    POST_TO_LINKEDIN_ORGANIZATION:
      process.env.POST_TO_LINKEDIN_ORGANIZATION === "true",
    SLACK_BOT_OAUTH_TOKEN: process.env.SLACK_BOT_OAUTH_TOKEN || undefined,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || undefined,
    SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID || undefined,
    SLACK_EVENTS_PORT: parseInt(
      getOptionalEnv("SLACK_EVENTS_PORT", "3002"),
      10,
    ),
    FIRECRAWL_API_KEY: getRequiredEnv("FIRECRAWL_API_KEY"),
    REMOTION_RENDERER_URL: getOptionalEnv(
      "REMOTION_RENDERER_URL",
      "http://remotion:3010",
    ),
    FAL_KEY: process.env.FAL_KEY || undefined,
    FAL_TTS_VOICE_ID: process.env.FAL_TTS_VOICE_ID || undefined,
    POST_TIMEZONE: getOptionalEnv("POST_TIMEZONE", "America/New_York"),
    AUTO_APPROVE_ENABLED: process.env.AUTO_APPROVE_ENABLED === "true",
    AUTO_APPROVE_TYPES: (process.env.AUTO_APPROVE_TYPES || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    DRY_RUN: process.env.DRY_RUN === "true",
    LOG_LEVEL: getOptionalEnv("LOG_LEVEL", "info"),
  };

  return _config;
}

export function getConfig(): EnvConfig {
  if (!_config) {
    return validateEnv();
  }
  return _config;
}

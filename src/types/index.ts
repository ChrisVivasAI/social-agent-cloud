export type ContentType = "link" | "image" | "video" | "remotion" | "text";
export type Platform = "twitter" | "linkedin" | "both";
export type ContentStatus =
  | "pending"
  | "generating"
  | "generated"
  | "rendering"
  | "awaiting_approval"
  | "ready"
  | "posting"
  | "posted"
  | "failed"
  | "skipped"
  | "paused";

export interface ContentQueueItem {
  id: string;
  type: ContentType;
  platform: Platform;
  content_url: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  source_text: string | null;
  report: string | null;
  generated_post: string | null;
  generated_post_twitter: string | null;
  generated_post_linkedin: string | null;
  image_url: string | null;
  remotion_template: string | null;
  remotion_props: Record<string, unknown> | null;
  remotion_video_url: string | null;
  scheduled_for: string | null;
  priority: number;
  status: ContentStatus;
  error_message: string | null;
  retry_count: number;
  twitter_post_id: string | null;
  linkedin_post_id: string | null;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  slack_user_id: string | null;
  slack_review_ts: string | null;
  slack_review_channel_id: string | null;
  is_thread: boolean;
  thread_parts: Array<{ text: string; media_url?: string }> | null;
  is_evergreen: boolean;
  last_reposted_at: string | null;
  repost_count: number;
  created_at: string;
  updated_at: string;
  posted_at: string | null;
}

export interface NewContentQueueItem {
  type: ContentType;
  platform?: Platform;
  content_url?: string;
  media_url?: string;
  media_mime_type?: string;
  image_url?: string;
  source_text?: string;
  generated_post_twitter?: string;
  generated_post_linkedin?: string;
  remotion_template?: string;
  remotion_props?: Record<string, unknown>;
  scheduled_for?: string;
  priority?: number;
  is_thread?: boolean;
  thread_parts?: Array<{ text: string; media_url?: string }>;
  is_evergreen?: boolean;
  slack_channel_id?: string;
  slack_message_ts?: string;
  slack_user_id?: string;
}

export interface PostResult {
  success: boolean;
  twitterPostId?: string;
  linkedinPostId?: string;
  errors: string[];
}

export interface GeneratedContent {
  report: string;
  post: string;
  postTwitter: string;
  postLinkedin: string;
  imageUrl?: string;
}

export interface MediaPayload {
  buffer: Buffer;
  mimeType: string;
  isVideo?: boolean;
}

export interface QueueSummary {
  pending: number;
  generating: number;
  awaiting_approval: number;
  ready: number;
  paused: number;
  posted_today: number;
  failed: number;
  upcoming: Array<{
    id: string;
    type: ContentType;
    scheduled_for: string | null;
    status: ContentStatus;
  }>;
}

export interface RenderStatus {
  status: "pending" | "rendering" | "completed" | "failed";
  progress?: number;
  outputUrl?: string;
  error?: string;
}

export interface RemotionTemplate {
  id: string;
  name: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  schema?: Record<string, unknown>;
}

export interface VideoScriptScene {
  type: "intro" | "headline" | "key_point" | "source" | "outro" | "hero_image";
  text: string;
  subtext?: string;
  durationSeconds: number;
  imagePrompt?: string;
}

export interface VideoScript {
  headline: string;
  keyPoints: string[];
  sourceUrl: string;
  sourceName: string;
  narrationText: string;
  scenes: VideoScriptScene[];
  accentColor?: string;
  backgroundColor?: string;
}

export interface TechNewsVideoProps {
  headline: string;
  keyPoints: string[];
  sourceUrl: string;
  sourceName: string;
  scenes: Array<{
    type: string;
    text: string;
    subtext?: string;
    durationInFrames: number;
    imageUrl?: string;
  }>;
  voiceoverUrl?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  accentColor: string;
  backgroundColor: string;
  brandName: string;
}

export interface QuoteCardProps {
  quoteText: string;
  attribution: string;
  subtitle?: string;
  accentColor: string;
  backgroundColor: string;
  brandName?: string;
}

export interface ProductShowcaseProps {
  productName: string;
  tagline: string;
  features: Array<{ title: string; description: string }>;
  ctaText: string;
  ctaUrl?: string;
  scenes: Array<{
    type: string;
    text: string;
    subtext?: string;
    durationInFrames: number;
    imageUrl?: string;
    featureIndex?: number;
  }>;
  voiceoverUrl?: string;
  heroImageUrl?: string;
  accentColor: string;
  backgroundColor: string;
  brandName?: string;
}

export interface AudiogramProps {
  title: string;
  captionText: string;
  voiceoverUrl: string;
  durationInFrames: number;
  accentColor: string;
  backgroundColor: string;
  brandName?: string;
  waveformSeed?: number;
}

export interface IntakeResult {
  contentType: ContentType;
  url: string | null;
  scheduling: {
    intent: "next_available" | "asap" | "specific_date" | "this_week";
    date: string | null;
  };
  platform: "both" | "twitter" | "linkedin";
  creativeDirection: string | null;
  priority: number;
  summary: string;
}

export interface EngagementMetrics {
  likes: number;
  retweets: number;
  comments: number;
  impressions: number;
  engagementRate: number;
}

export interface PostHistoryRecord {
  id: string;
  content_queue_id: string;
  platform: string;
  post_text: string;
  media_url: string | null;
  external_post_id: string;
  posted_at: string;
  day_of_week: number;
  hour_of_day: number;
  likes: number;
  retweets: number;
  comments: number;
  impressions: number;
  engagement_rate: number;
  metrics_pulled_24h: boolean;
  metrics_pulled_72h: boolean;
  metrics_pulled_at: string | null;
}

export interface DiscoveredContent {
  id: string;
  source_feed: string;
  url: string;
  title: string | null;
  summary: string | null;
  relevance_score: number | null;
  status: "new" | "queued" | "dismissed";
  content_queue_id: string | null;
  discovered_at: string;
  created_at: string;
  updated_at: string;
}

export type RemotionCompositionId =
  | "TechNewsVideo"
  | "QuoteCard"
  | "ProductShowcase"
  | "AudiogramVideo";

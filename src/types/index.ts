export type ContentType = "link" | "image" | "video" | "remotion" | "text" | "video_edit";
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
  video_project_id?: string;
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
  /** Gemini 3 Flash vision analysis of attached images (if available) */
  imageAnalysis?: string;
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

export interface TimedCaption {
  word: string;
  startFrame: number;
  endFrame: number;
}

export type RemotionCompositionId =
  | "TechNewsVideo"
  | "QuoteCard"
  | "ProductShowcase"
  | "AudiogramVideo"
  | "StoryVideo"
  | "ShortFormVideo";

// ============================================================
// Intelligence Layer Types
// ============================================================

export type GeminiModel = "pro" | "flash";

export type EpisodeType =
  | "edit"
  | "approve"
  | "reject"
  | "skip"
  | "performance"
  | "video_feedback"
  | "creative_direction";

export interface AgentMemoryEntry {
  id: string;
  category: "feedback" | "performance" | "preference" | "pattern" | "style_guide" | "editing_style" | "posted_content";
  content: Record<string, unknown>;
  content_text: string;
  embedding?: number[];
  relevance_tags: string[];
  platform?: string;
  confidence: number;
  source_id?: string;
  expires_at?: string;
  episode_type?: EpisodeType;
  emotional_salience?: number;
  compressed?: boolean;
  source_content?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VoiceProfile {
  general: {
    tone: string;
    formality_level: string;
    humor_style: string;
    sentence_length_preference: string;
    vocabulary_level: string;
  };
  twitter: {
    max_length: number;
    opening_style: string;
    emoji_usage: string;
    hashtag_usage: string;
    thread_preference: string;
  };
  linkedin: {
    typical_length: string;
    structure: string;
    professional_vs_casual: string;
    cta_style: string;
  };
  topics: {
    preferred_framings: Record<string, string>;
  };
  never_do: string[];
  always_do: string[];
  updated_at: string;
  episode_count: number;
  confidence: number;
}

export interface PerformanceInsight {
  id: string;
  insight_text: string;
  insight_type:
    | "engagement_pattern"
    | "content_type_performance"
    | "timing_optimization"
    | "audience_preference"
    | "template_performance"
    | "topic_performance";
  confidence: number;
  applicable_to: {
    platform?: string;
    content_type?: string;
    template?: string;
    topic_tags?: string[];
  };
  supporting_data: Record<string, unknown>;
  is_active: boolean;
  generated_at: string;
  expires_at?: string;
}

export interface DynamicPromptContext {
  task: string;
  performanceInsights: PerformanceInsight[];
  relevantMemories: AgentMemoryEntry[];
  recentPosts: PostHistoryRecord[];
  queueState: QueueSummary;
  skillInstructions?: string;
  userPreferences: Record<string, unknown>;
  currentContentMix: Record<string, number>;
}

// ============================================================
// Video Editor Types
// ============================================================

export type ProjectType =
  | "social_clip"       // existing: short social media content
  | "commercial"        // 30-60s ad/promo with product focus
  | "short_film"        // 1-5 min narrative with story arc
  | "series_episode"    // part of a multi-episode series
  | "music_video"       // visual accompaniment to audio
  | "documentary";      // informational long-form

export type VideoProjectStatus =
  | "draft"
  | "analyzing"
  | "editing"
  | "rendering"
  | "review"
  | "approved"
  | "posted"
  | "archived";

export interface CreativeBrief {
  target_audience?: string;
  mood?: string;
  style_references?: string[];
  model_preferences?: {
    video_model?: string;      // e.g. "kling-video/v2.1/master"
    image_model?: string;      // e.g. "fal-ai/flux-2-flex"
    tts_voice_id?: string;
  };
  duration_target_ms?: number;
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:5";
  brand_guidelines?: {
    colors?: string[];
    fonts?: string[];
    logo_url?: string;
    watermark_url?: string;
    tone_of_voice?: string;
  };
}

export interface VideoProject {
  id: string;
  title: string;
  goal?: string;
  project_type: ProjectType;
  creative_brief?: CreativeBrief;
  series_id?: string;
  episode_number?: number;
  status: VideoProjectStatus;
  current_edl?: EDL;
  output_url?: string;
  output_duration_ms?: number;
  feedback_history: Array<{
    timestamp: string;
    feedback: string;
    applied: boolean;
  }>;
  footage_asset_ids: string[];
  idea_id?: string;
  content_queue_id?: string;
  slack_thread_ts?: string;
  slack_channel_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface VideoSeries {
  id: string;
  title: string;
  concept: string;
  project_type: ProjectType;
  style_guide?: CreativeBrief;
  continuity: {
    characters?: Array<{ name: string; description: string; visual_ref?: string }>;
    recurring_elements?: string[];
    narrative_arc?: string;
    tone?: string;
  };
  episode_plan?: Array<{
    episode_number: number;
    title: string;
    synopsis: string;
    project_id?: string;
    status: "planned" | "in_production" | "completed";
  }>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FootageAsset {
  id: string;
  storage_url: string;
  storage_path: string;
  original_filename?: string;
  mime_type: string;
  file_size_bytes?: number;
  // Technical metadata
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  has_audio: boolean;
  audio_codec?: string;
  // AI analysis
  analysis_status: "pending" | "scanning" | "analyzed" | "failed";
  flash_analysis?: Record<string, unknown>;
  pro_analysis?: Record<string, unknown>;
  scene_boundaries: Array<{
    start_ms: number;
    end_ms: number;
    description: string;
    tags: string[];
  }>;
  key_moments: Array<{
    timestamp_ms: number;
    description: string;
    importance: number;
  }>;
  tags: string[];
  emotional_tone?: string;
  quality_score?: number;
  source: "slack_upload" | "url_ingest" | "generated";
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EDLTrackItem {
  id: string;
  type: "video_clip" | "ai_generated_video" | "audio" | "text_overlay" | "image_overlay" | "transition";
  source_asset_id?: string; // FK to footage_assets
  source_url?: string; // for generated/downloaded assets
  start_ms: number; // timeline position
  duration_ms: number;
  // Source clip properties
  in_point_ms?: number; // where to start in source
  out_point_ms?: number; // where to end in source
  // AI generation config (for ai_generated_video / image_overlay)
  generation?: {
    prompt: string;
    model?: string;               // fal.ai model override
    reference_image_url?: string;  // for image-to-video or editing
    negative_prompt?: string;
    aspect_ratio?: string;
    duration_seconds?: number;
  };
  // Properties
  properties: {
    speed?: number;
    opacity?: number;
    volume?: number;
    color_grade?: string;
    text?: string;
    font_size?: number;
    position?: { x: number; y: number };
    transition_type?: "crossfade" | "wipe" | "cut";
    transition_duration_ms?: number;
    fade_in_ms?: number;
    fade_out_ms?: number;
  };
  // Narrative structure
  narrative_role?: "hook" | "buildup" | "climax" | "resolution";
  reasoning?: string; // why the agent chose this
}

export interface EDL {
  version: number;
  tracks: {
    video: EDLTrackItem[];
    audio: EDLTrackItem[];
    overlays: EDLTrackItem[];
  };
  total_duration_ms: number;
  output_format: {
    width: number;
    height: number;
    fps: number;
    codec: string;
  };
  narrative_structure: Array<{
    role: "hook" | "buildup" | "climax" | "resolution";
    start_ms: number;
    end_ms: number;
  }>;
  metadata: Record<string, unknown>;
}

export interface EDLHistoryEntry {
  id: string;
  project_id: string;
  version: number;
  edl: EDL;
  feedback_applied?: string;
  reasoning?: string;
  created_at: string;
}

export type VideoIdeaStatus = "pitched" | "approved" | "rejected" | "in_production" | "completed";

export interface VideoIdea {
  id: string;
  concept: string;
  rationale?: string;
  target_platform: string;
  estimated_duration_sec?: number;
  style_notes?: string;
  reference_urls: string[];
  status: VideoIdeaStatus;
  feedback_history: Array<{
    timestamp: string;
    feedback: string;
    refined_concept?: string;
  }>;
  project_id?: string;
  slack_message_ts?: string;
  slack_channel_id?: string;
  week_of?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Gemini Service Types
// ============================================================

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
export type MediaResolution = "media_resolution_low" | "media_resolution_medium" | "media_resolution_high" | "media_resolution_ultra_high";

export interface GeminiGenerateOptions {
  model?: GeminiModel;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  systemInstruction?: string;
  /** Gemini 3 thinking depth — "high" (default) for complex reasoning, "minimal" for fast tasks */
  thinkingLevel?: ThinkingLevel;
  /** Enable code_execution tool for Agentic Vision — model auto-zooms/crops images */
  agenticVision?: boolean;
}

export interface GeminiVisionInput {
  type: "image" | "video";
  data: Buffer | string; // Buffer for inline, string for GCS URI
  mimeType: string;
  /** Per-input media resolution — controls token cost per image/frame */
  mediaResolution?: MediaResolution;
}

export interface ProbeResult {
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  has_audio: boolean;
  audio_codec?: string;
  file_size_bytes: number;
}

// ============================================================
// fal.ai Model Types
// ============================================================

export type FalVideoMode = "standard" | "pro";
export type FalAspectRatio = "16:9" | "9:16" | "1:1";
export type FalImageModel = "nano-banana-pro" | "flux-2-flex";
export type FalImageResolution = "1K" | "2K" | "4K";
export type FalTopazModel =
  | "Low Resolution V2"
  | "Standard V2"
  | "CGI"
  | "High Fidelity V2"
  | "Text Refine"
  | "Recovery"
  | "Redefine"
  | "Recovery V2";

export interface FalVideoOptions {
  duration?: number;
  aspectRatio?: FalAspectRatio;
  mode?: FalVideoMode;
  generateAudio?: boolean;
  negativePrompt?: string;
  cfgScale?: number;
}

export interface FalVideoResult {
  videoUrl: string;
  contentType: string;
  fileSize?: number;
}

export interface FalImageOptions {
  model?: FalImageModel;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: FalImageResolution;
  outputFormat?: "jpeg" | "png" | "webp";
}

export interface FalImageEditOptions {
  resolution?: FalImageResolution;
  outputFormat?: "jpeg" | "png" | "webp";
  seed?: number;
  numImages?: number;
}

export interface FalEnhanceOptions {
  model?: FalTopazModel;
  upscaleFactor?: number;
  outputFormat?: "jpeg" | "png";
  faceEnhancement?: boolean;
  faceEnhancementStrength?: number;
}

export interface FalEnhanceResult {
  imageUrl: string;
  contentType?: string;
  fileSize?: number;
}

// ============================================================
// Content Critique / Self-Evaluation Types
// ============================================================

export interface QualityGateResult {
  gate: "relevance" | "tone" | "length" | "originality" | "cta" | "proofread";
  pass: boolean;
  feedback: string;
}

export interface ContentCritiqueResult {
  overallPass: boolean;
  gates: QualityGateResult[];
  critiqueText: string;
}

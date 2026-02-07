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

export type ProjectType =
  | "social_clip"
  | "commercial"
  | "short_film"
  | "series_episode"
  | "music_video"
  | "documentary";

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
    video_model?: string;
    image_model?: string;
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
  current_edl?: Record<string, unknown>;
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
  created_by?: string;
  created_at: string;
  updated_at: string;
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
  week_of?: string;
  created_at: string;
  updated_at: string;
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

export interface EngagementMetrics {
  likes: number;
  retweets: number;
  comments: number;
  impressions: number;
  engagementRate: number;
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
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  has_audio: boolean;
  audio_codec?: string;
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
  source_asset_id?: string;
  source_url?: string;
  start_ms: number;
  duration_ms: number;
  in_point_ms?: number;
  out_point_ms?: number;
  properties: {
    speed?: number;
    opacity?: number;
    volume?: number;
    text?: string;
    font_size?: number;
  };
  narrative_role?: "hook" | "buildup" | "climax" | "resolution";
  reasoning?: string;
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

-- Social Media Agent: Database Migration
-- Run this in the Supabase SQL Editor for project cmuohezhukzzhrstbhbp

-- 1. Content Queue table
CREATE TABLE IF NOT EXISTS content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content classification
  type TEXT NOT NULL CHECK (type IN ('link', 'image', 'video', 'remotion')),
  platform TEXT NOT NULL DEFAULT 'both' CHECK (platform IN ('twitter', 'linkedin', 'both')),

  -- Source content
  content_url TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  source_text TEXT,

  -- Generated content
  report TEXT,
  generated_post TEXT,
  image_url TEXT,

  -- Remotion specific
  remotion_template TEXT,
  remotion_props JSONB,
  remotion_video_url TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  priority INTEGER DEFAULT 2,

  -- State tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'generating', 'generated', 'rendering',
    'ready', 'posting', 'posted', 'failed'
  )),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Post results
  twitter_post_id TEXT,
  linkedin_post_id TEXT,

  -- Slack metadata
  slack_channel_id TEXT,
  slack_message_ts TEXT,
  slack_user_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_content_queue_status_scheduled
  ON content_queue (status, scheduled_for)
  WHERE status IN ('ready', 'generated');

CREATE INDEX idx_content_queue_pending
  ON content_queue (status, created_at)
  WHERE status = 'pending';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_content_queue_updated_at
  BEFORE UPDATE ON content_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Post History table (analytics)
CREATE TABLE IF NOT EXISTS post_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID REFERENCES content_queue(id),
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin')),
  post_text TEXT NOT NULL,
  media_url TEXT,
  external_post_id TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  day_of_week INTEGER,
  hour_of_day INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_history_posted_at ON post_history (posted_at);

-- 3. Create storage buckets for images and videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policies (allow service role full access)
CREATE POLICY "Service role full access to images" ON storage.objects
  FOR ALL USING (bucket_id = 'images')
  WITH CHECK (bucket_id = 'images');

CREATE POLICY "Service role full access to videos" ON storage.objects
  FOR ALL USING (bucket_id = 'videos')
  WITH CHECK (bucket_id = 'videos');

-- 5. Public read access for storage
CREATE POLICY "Public read access to images" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

CREATE POLICY "Public read access to videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

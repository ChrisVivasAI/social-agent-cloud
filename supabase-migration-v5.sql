-- Migration V5: Engagement metrics, thread support, evergreen reposting, content discovery
-- Run against Supabase project: cmuohezhukzzhrstbhbp

-- ═══════════════════════════════════════════════════════
-- 1. Engagement metrics on post_history
-- ═══════════════════════════════════════════════════════
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS retweets INTEGER DEFAULT 0;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS engagement_rate DECIMAL(5,4) DEFAULT 0;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS metrics_pulled_24h BOOLEAN DEFAULT FALSE;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS metrics_pulled_72h BOOLEAN DEFAULT FALSE;
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS metrics_pulled_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════
-- 2. Thread support on content_queue
-- ═══════════════════════════════════════════════════════
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS is_thread BOOLEAN DEFAULT FALSE;
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS thread_parts JSONB;

-- ═══════════════════════════════════════════════════════
-- 3. Evergreen support on content_queue
-- ═══════════════════════════════════════════════════════
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS is_evergreen BOOLEAN DEFAULT FALSE;
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS last_reposted_at TIMESTAMPTZ;
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS repost_count INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════
-- 4. Content discovery table
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS discovered_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_feed TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  summary TEXT,
  relevance_score DECIMAL(3,2),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','queued','dismissed')),
  content_queue_id UUID REFERENCES content_queue(id),
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 5. Indexes
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_discovered_content_status
  ON discovered_content(status) WHERE status = 'new';

CREATE INDEX IF NOT EXISTS idx_discovered_content_url
  ON discovered_content(url);

CREATE INDEX IF NOT EXISTS idx_post_history_metrics_pending
  ON post_history(posted_at)
  WHERE metrics_pulled_24h = FALSE OR metrics_pulled_72h = FALSE;

CREATE INDEX IF NOT EXISTS idx_content_queue_evergreen
  ON content_queue(is_evergreen, posted_at)
  WHERE is_evergreen = TRUE AND status = 'posted';

-- Migration V6: Intelligence Layer + AI Video Editor
-- Adds: agent_memory, performance_insights, video_projects, footage_assets, edl_history, video_ideas
-- Modifies: content_queue, post_history

-- ============================================================
-- 1. Enable pg_vector extension for semantic search
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. Agent Memory — hybrid vector + keyword search
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'feedback', 'performance', 'preference', 'pattern', 'style_guide', 'editing_style'
  )),
  content JSONB NOT NULL,
  content_text TEXT NOT NULL, -- full-text searchable version
  embedding VECTOR(768), -- Gemini embedding dimension
  relevance_tags TEXT[] DEFAULT '{}',
  platform TEXT, -- twitter, linkedin, or null for both
  confidence REAL DEFAULT 1.0,
  source_id TEXT, -- FK to originating post/feedback
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (IVFFlat for good balance of speed/accuracy)
CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding
  ON agent_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_agent_memory_text
  ON agent_memory USING gin (to_tsvector('english', content_text));

-- Category + tag filtering
CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON agent_memory (category);
CREATE INDEX IF NOT EXISTS idx_agent_memory_tags ON agent_memory USING gin (relevance_tags);
CREATE INDEX IF NOT EXISTS idx_agent_memory_expires ON agent_memory (expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================
-- 3. Performance Insights — derived from metrics analysis
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_text TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'engagement_pattern', 'content_type_performance', 'timing_optimization',
    'audience_preference', 'template_performance', 'topic_performance'
  )),
  confidence REAL NOT NULL DEFAULT 0.5,
  applicable_to JSONB DEFAULT '{}', -- { platform, content_type, template, topic_tags }
  supporting_data JSONB DEFAULT '{}', -- raw metrics backing the insight
  is_active BOOLEAN DEFAULT TRUE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_insights_type ON performance_insights (insight_type);
CREATE INDEX IF NOT EXISTS idx_performance_insights_active ON performance_insights (is_active) WHERE is_active = TRUE;

-- ============================================================
-- 4. Video Projects — container for video editing sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  goal TEXT, -- what the user wants to achieve
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'analyzing', 'editing', 'rendering', 'review', 'approved', 'posted', 'archived'
  )),
  current_edl JSONB, -- the active EDL (Edit Decision List)
  output_url TEXT, -- final rendered video URL
  output_duration_ms INTEGER,
  feedback_history JSONB DEFAULT '[]', -- array of { timestamp, feedback, applied }
  footage_asset_ids UUID[] DEFAULT '{}',
  idea_id UUID, -- FK to video_ideas if this came from weekly cycle
  content_queue_id UUID, -- FK to content_queue when queued for posting
  slack_thread_ts TEXT, -- Slack thread for this project's review
  slack_channel_id TEXT,
  created_by TEXT, -- Slack user ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects (status);

-- ============================================================
-- 5. Footage Assets — ingested footage files
-- ============================================================
CREATE TABLE IF NOT EXISTS footage_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_url TEXT NOT NULL, -- Supabase storage URL
  storage_path TEXT NOT NULL, -- bucket path for download
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  -- Technical metadata from ffprobe
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  fps REAL,
  codec TEXT,
  has_audio BOOLEAN DEFAULT FALSE,
  audio_codec TEXT,
  -- AI analysis
  analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN (
    'pending', 'scanning', 'analyzed', 'failed'
  )),
  flash_analysis JSONB, -- quick keyframe scan results
  pro_analysis JSONB, -- deep segment analysis results
  scene_boundaries JSONB DEFAULT '[]', -- array of { start_ms, end_ms, description, tags }
  key_moments JSONB DEFAULT '[]', -- array of { timestamp_ms, description, importance }
  tags TEXT[] DEFAULT '{}',
  emotional_tone TEXT,
  quality_score REAL,
  -- Provenance
  source TEXT CHECK (source IN ('slack_upload', 'url_ingest', 'generated')),
  uploaded_by TEXT, -- Slack user ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_footage_assets_analysis ON footage_assets (analysis_status);
CREATE INDEX IF NOT EXISTS idx_footage_assets_tags ON footage_assets USING gin (tags);

-- ============================================================
-- 6. EDL History — version control for edit decisions
-- ============================================================
CREATE TABLE IF NOT EXISTS edl_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  edl JSONB NOT NULL, -- full EDL snapshot
  feedback_applied TEXT, -- what feedback triggered this version
  reasoning TEXT, -- why changes were made
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_edl_history_project ON edl_history (project_id);

-- ============================================================
-- 7. Video Ideas — weekly creative cycle
-- ============================================================
CREATE TABLE IF NOT EXISTS video_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept TEXT NOT NULL, -- the pitch
  rationale TEXT, -- why this would work (from Gemini)
  target_platform TEXT DEFAULT 'both',
  estimated_duration_sec INTEGER,
  style_notes TEXT,
  reference_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pitched' CHECK (status IN (
    'pitched', 'approved', 'rejected', 'in_production', 'completed'
  )),
  feedback_history JSONB DEFAULT '[]', -- user critiques and refinements
  project_id UUID, -- FK to video_projects once production starts
  slack_message_ts TEXT,
  slack_channel_id TEXT,
  week_of DATE, -- the Monday of the week this was pitched
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_ideas_status ON video_ideas (status);
CREATE INDEX IF NOT EXISTS idx_video_ideas_week ON video_ideas (week_of);

-- ============================================================
-- 8. Modify content_queue — add video_edit type + project FK
-- ============================================================
-- Note: Can't alter CHECK constraint on type column directly in all PG versions.
-- Drop and recreate if it exists, otherwise this is safe for new deployments.
DO $$
BEGIN
  -- Add video_project_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_queue' AND column_name = 'video_project_id'
  ) THEN
    ALTER TABLE content_queue ADD COLUMN video_project_id UUID REFERENCES video_projects(id);
  END IF;
END $$;

-- ============================================================
-- 9. Modify post_history — add correlation fields
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_history' AND column_name = 'content_type'
  ) THEN
    ALTER TABLE post_history ADD COLUMN content_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_history' AND column_name = 'template_used'
  ) THEN
    ALTER TABLE post_history ADD COLUMN template_used TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_history' AND column_name = 'generation_params'
  ) THEN
    ALTER TABLE post_history ADD COLUMN generation_params JSONB;
  END IF;
END $$;

-- ============================================================
-- 10. Helper function: hybrid memory search
-- ============================================================
CREATE OR REPLACE FUNCTION search_agent_memory(
  query_embedding VECTOR(768),
  query_text TEXT,
  match_count INTEGER DEFAULT 10,
  vector_weight REAL DEFAULT 0.6,
  category_filter TEXT DEFAULT NULL,
  platform_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  content JSONB,
  content_text TEXT,
  relevance_tags TEXT[],
  similarity REAL,
  text_rank REAL,
  combined_score REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      am.id,
      1 - (am.embedding <=> query_embedding) AS vec_score
    FROM agent_memory am
    WHERE (category_filter IS NULL OR am.category = category_filter)
      AND (platform_filter IS NULL OR am.platform IS NULL OR am.platform = platform_filter)
      AND (am.expires_at IS NULL OR am.expires_at > NOW())
      AND am.embedding IS NOT NULL
    ORDER BY am.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  text_results AS (
    SELECT
      am.id,
      ts_rank(to_tsvector('english', am.content_text), plainto_tsquery('english', query_text)) AS txt_score
    FROM agent_memory am
    WHERE (category_filter IS NULL OR am.category = category_filter)
      AND (platform_filter IS NULL OR am.platform IS NULL OR am.platform = platform_filter)
      AND (am.expires_at IS NULL OR am.expires_at > NOW())
      AND to_tsvector('english', am.content_text) @@ plainto_tsquery('english', query_text)
    LIMIT match_count * 2
  ),
  merged AS (
    SELECT
      COALESCE(vr.id, tr.id) AS merged_id,
      COALESCE(vr.vec_score, 0) AS vec_score,
      COALESCE(tr.txt_score, 0) AS txt_score,
      (COALESCE(vr.vec_score, 0) * vector_weight +
       COALESCE(tr.txt_score, 0) * (1.0 - vector_weight)) AS combined
    FROM vector_results vr
    FULL OUTER JOIN text_results tr ON vr.id = tr.id
  )
  SELECT
    am.id,
    am.category,
    am.content,
    am.content_text,
    am.relevance_tags,
    m.vec_score::REAL AS similarity,
    m.txt_score::REAL AS text_rank,
    m.combined::REAL AS combined_score,
    am.created_at
  FROM merged m
  JOIN agent_memory am ON am.id = m.merged_id
  ORDER BY m.combined DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 11. Updated_at triggers for new tables
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'agent_memory', 'video_projects', 'footage_assets', 'video_ideas'
  ])
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN
      -- trigger already exists, skip
      NULL;
    END;
  END LOOP;
END $$;

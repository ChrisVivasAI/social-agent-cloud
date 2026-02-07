-- Migration v7: Three-Layer Memory + Voice Learning System
-- Adds episodic memory columns to agent_memory for voice learning pipeline.

-- ─── New columns on agent_memory ───

-- Episode type: classifies raw episodic events
ALTER TABLE agent_memory
  ADD COLUMN IF NOT EXISTS episode_type TEXT;

-- Emotional salience: how significant this memory is (protects from compression)
ALTER TABLE agent_memory
  ADD COLUMN IF NOT EXISTS emotional_salience REAL DEFAULT 0.5;

-- Compressed: whether this episode's content_text has been truncated
ALTER TABLE agent_memory
  ADD COLUMN IF NOT EXISTS compressed BOOLEAN DEFAULT false;

-- Source content: stores original vs edited text for edit episodes
ALTER TABLE agent_memory
  ADD COLUMN IF NOT EXISTS source_content JSONB;

-- ─── Indexes for consolidation queries ───

-- Index for fetching recent episodes by type (used by nightly consolidation)
CREATE INDEX IF NOT EXISTS idx_agent_memory_episode_type
  ON agent_memory (episode_type)
  WHERE episode_type IS NOT NULL;

-- Index for compression queries (uncompressed old episodes)
CREATE INDEX IF NOT EXISTS idx_agent_memory_compression
  ON agent_memory (created_at, compressed)
  WHERE category = 'feedback' AND (compressed IS NULL OR compressed = false);

-- Index for procedural rule lookups
CREATE INDEX IF NOT EXISTS idx_agent_memory_procedural_rules
  ON agent_memory USING GIN (relevance_tags)
  WHERE category = 'pattern';

-- ─── Validate ───

-- Check constraints on episode_type
ALTER TABLE agent_memory
  ADD CONSTRAINT chk_episode_type
  CHECK (episode_type IS NULL OR episode_type IN (
    'edit', 'approve', 'reject', 'skip',
    'performance', 'video_feedback', 'creative_direction'
  ));

-- Check constraints on emotional_salience
ALTER TABLE agent_memory
  ADD CONSTRAINT chk_emotional_salience
  CHECK (emotional_salience >= 0.0 AND emotional_salience <= 1.0);

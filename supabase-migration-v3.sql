-- Migration V3: Slack-first approval workflow
-- Run manually against Supabase project cmuohezhukzzhrstbhbp

BEGIN;

-- 1. Drop existing status check constraint
ALTER TABLE content_queue DROP CONSTRAINT IF EXISTS content_queue_status_check;

-- 2. Add new CHECK constraint with expanded statuses
ALTER TABLE content_queue ADD CONSTRAINT content_queue_status_check
  CHECK (status IN (
    'pending',
    'generating',
    'generated',
    'rendering',
    'awaiting_approval',
    'ready',
    'posting',
    'posted',
    'failed',
    'skipped',
    'paused'
  ));

-- 3. Add columns for tracking Slack review cards
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS slack_review_ts TEXT;
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS slack_review_channel_id TEXT;

-- 4. Index for quickly finding items awaiting approval
CREATE INDEX IF NOT EXISTS idx_content_queue_awaiting_approval
  ON content_queue (status, scheduled_for)
  WHERE status = 'awaiting_approval';

COMMIT;

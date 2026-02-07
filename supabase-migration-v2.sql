-- Social Media Agent v2.1: Platform-Specific Posts Migration
-- Run this in the Supabase SQL Editor for project cmuohezhukzzhrstbhbp

-- Add platform-specific generated post columns
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS generated_post_twitter TEXT,
  ADD COLUMN IF NOT EXISTS generated_post_linkedin TEXT;

-- Backfill existing rows: copy generated_post into both columns (truncate for twitter)
UPDATE content_queue
SET
  generated_post_twitter = LEFT(generated_post, 280),
  generated_post_linkedin = generated_post
WHERE generated_post IS NOT NULL
  AND generated_post_twitter IS NULL;

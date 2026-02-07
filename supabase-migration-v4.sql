-- Migration v4: Add "text" content type
-- Run this in Supabase SQL Editor

ALTER TABLE content_queue DROP CONSTRAINT IF EXISTS content_queue_type_check;
ALTER TABLE content_queue ADD CONSTRAINT content_queue_type_check
  CHECK (type IN ('link', 'image', 'video', 'remotion', 'text'));

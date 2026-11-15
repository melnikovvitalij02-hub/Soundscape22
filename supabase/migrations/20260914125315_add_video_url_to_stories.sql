-- Add video_url column to stories table for video stories
ALTER TABLE stories ADD COLUMN IF NOT EXISTS video_url text;
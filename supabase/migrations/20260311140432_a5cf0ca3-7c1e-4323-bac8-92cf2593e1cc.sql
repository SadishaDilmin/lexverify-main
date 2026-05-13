-- 1. Add 'video' to the ingestion_file_type enum
ALTER TYPE public.ingestion_file_type ADD VALUE IF NOT EXISTS 'video';

-- 2. Add media-specific columns to knowledge_base_content
ALTER TABLE public.knowledge_base_content
  ADD COLUMN IF NOT EXISTS visual_summary TEXT,
  ADD COLUMN IF NOT EXISTS media_duration_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS transcription_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS judge_notes TEXT;

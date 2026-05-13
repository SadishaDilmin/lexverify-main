
-- Add source_type, confidence_level, is_excluded to benchmark_cases
ALTER TABLE public.benchmark_cases
  ADD COLUMN source_type text NOT NULL DEFAULT 'real',
  ADD COLUMN confidence_level text NOT NULL DEFAULT 'standard',
  ADD COLUMN is_excluded boolean NOT NULL DEFAULT false;

-- Backfill synthetic cases
UPDATE public.benchmark_cases SET source_type = 'synthetic' WHERE notes LIKE '[SYNTHETIC]%';

-- Add scoring columns to benchmark_comparisons
ALTER TABLE public.benchmark_comparisons
  ADD COLUMN recall_score numeric,
  ADD COLUMN precision_score numeric,
  ADD COLUMN extraction_accuracy numeric,
  ADD COLUMN reasoning_quality numeric,
  ADD COLUMN evidence_grounding numeric,
  ADD COLUMN prompt_version text;

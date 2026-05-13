
-- Enum for oversight status
CREATE TYPE public.oversight_status AS ENUM ('pending_review', 'human_verified', 'overridden');

-- Add oversight columns to benchmark_cases
ALTER TABLE public.benchmark_cases
  ADD COLUMN IF NOT EXISTS oversight_status public.oversight_status DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS oversight_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS oversight_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS oversight_reason TEXT DEFAULT NULL;


-- Create lock type enum
CREATE TYPE public.benchmark_lock_type AS ENUM ('evaluation_worker', 'manual_regression', 'batch_evaluation');

-- Create benchmark_system_locks table
CREATE TABLE public.benchmark_system_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_type public.benchmark_lock_type NOT NULL UNIQUE,
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamp with time zone,
  expires_at timestamp with time zone,
  locked_by text
);

-- Enable RLS
ALTER TABLE public.benchmark_system_locks ENABLE ROW LEVEL SECURITY;

-- Service role full access (used by edge functions)
CREATE POLICY "Service role full access on benchmark_system_locks"
  ON public.benchmark_system_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin read
CREATE POLICY "Admins can read benchmark_system_locks"
  ON public.benchmark_system_locks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed the lock rows
INSERT INTO public.benchmark_system_locks (lock_type, is_locked) VALUES
  ('evaluation_worker', false),
  ('manual_regression', false),
  ('batch_evaluation', false);


-- Batch evaluation queue tables
CREATE TABLE public.benchmark_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_cases int NOT NULL DEFAULT 0,
  completed_cases int NOT NULL DEFAULT 0,
  failed_cases int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  include_analysis boolean NOT NULL DEFAULT false,
  agent_filter text DEFAULT 'all',
  source_filter text DEFAULT 'all',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.benchmark_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.benchmark_batches(id) ON DELETE CASCADE,
  benchmark_case_id uuid NOT NULL REFERENCES public.benchmark_cases(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX idx_job_items_status ON public.benchmark_job_items(status) WHERE status = 'pending';
CREATE INDEX idx_job_items_batch ON public.benchmark_job_items(batch_id);

ALTER TABLE public.benchmark_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_job_items ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins manage batches" ON public.benchmark_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage job items" ON public.benchmark_job_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for batch tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.benchmark_batches;

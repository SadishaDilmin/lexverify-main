
-- Create human verdict enum
CREATE TYPE public.judge_calibration_verdict AS ENUM ('agree', 'disagree');

-- Create benchmark_judge_calibration table
CREATE TABLE public.benchmark_judge_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES public.benchmark_comparisons(id) ON DELETE CASCADE,
  human_verdict judge_calibration_verdict NOT NULL,
  human_notes TEXT,
  corrected_precision_score DOUBLE PRECISION,
  corrected_recall_score DOUBLE PRECISION,
  audited_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add is_audited flag to benchmark_comparisons
ALTER TABLE public.benchmark_comparisons ADD COLUMN is_audited BOOLEAN NOT NULL DEFAULT false;

-- Enable RLS
ALTER TABLE public.benchmark_judge_calibration ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can read/write calibration records
CREATE POLICY "Admins can manage judge calibrations"
  ON public.benchmark_judge_calibration
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

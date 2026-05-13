
-- ============================================================
-- Phase 3: Prompt Management Schema
-- ============================================================

-- 1. prompt_patches - AI-generated improvement suggestions linked to comparisons
CREATE TABLE public.prompt_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  comparison_id uuid REFERENCES public.benchmark_comparisons(id) ON DELETE SET NULL,
  benchmark_case_id uuid REFERENCES public.benchmark_cases(id) ON DELETE SET NULL,
  title text NOT NULL,
  patch_instruction text NOT NULL DEFAULT '',
  failure_example text NOT NULL DEFAULT '',
  change_reason text NOT NULL DEFAULT '',
  predicted_impact text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  prompt_version_id uuid REFERENCES public.prompt_versions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_patches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage prompt patches"
  ON public.prompt_patches FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Add regression_results to prompt_versions for test results
ALTER TABLE public.prompt_versions
  ADD COLUMN IF NOT EXISTS regression_results jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS patch_ids uuid[] DEFAULT '{}'::uuid[];

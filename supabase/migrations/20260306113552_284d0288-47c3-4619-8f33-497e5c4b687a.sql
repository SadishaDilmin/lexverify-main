
-- Regression test runs table
CREATE TABLE public.regression_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL,
  prompt_patch_id uuid REFERENCES public.prompt_patches(id) ON DELETE SET NULL,
  prior_prompt_version text,
  proposed_prompt_version text,
  status text NOT NULL DEFAULT 'pending',
  benchmark_case_ids uuid[] NOT NULL DEFAULT '{}',
  source_types_included text[] NOT NULL DEFAULT '{}',
  total_cases integer NOT NULL DEFAULT 0,
  completed_cases integer NOT NULL DEFAULT 0,
  prior_avg_recall numeric,
  prior_avg_precision numeric,
  proposed_avg_recall numeric,
  proposed_avg_precision numeric,
  prior_avg_extraction numeric,
  proposed_avg_extraction numeric,
  prior_avg_reasoning numeric,
  proposed_avg_reasoning numeric,
  prior_avg_grounding numeric,
  proposed_avg_grounding numeric,
  summary jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.regression_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage regression test runs"
  ON public.regression_test_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Regression test results (per-case results within a run)
CREATE TABLE public.regression_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.regression_test_runs(id) ON DELETE CASCADE,
  benchmark_case_id uuid NOT NULL REFERENCES public.benchmark_cases(id) ON DELETE CASCADE,
  prior_comparison_id uuid REFERENCES public.benchmark_comparisons(id) ON DELETE SET NULL,
  proposed_comparison_id uuid REFERENCES public.benchmark_comparisons(id) ON DELETE SET NULL,
  prior_recall numeric,
  prior_precision numeric,
  proposed_recall numeric,
  proposed_precision numeric,
  recall_delta numeric,
  precision_delta numeric,
  regression_detected boolean NOT NULL DEFAULT false,
  improvement_detected boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regression_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage regression test results"
  ON public.regression_test_results FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

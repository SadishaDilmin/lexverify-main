
-- Judge reviews for individual comparison items
CREATE TABLE public.benchmark_judge_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id uuid NOT NULL REFERENCES public.benchmark_comparisons(id) ON DELETE CASCADE,
  comparison_item_id uuid NOT NULL REFERENCES public.benchmark_comparison_items(id) ON DELETE CASCADE,
  judge_model text NOT NULL DEFAULT 'openai/gpt-5',
  judge_verdict text NOT NULL DEFAULT 'pending',
  ai_was_correct boolean,
  ground_truth_stronger boolean,
  partially_acceptable boolean,
  evidence_grounded boolean,
  judge_reasoning text NOT NULL DEFAULT '',
  confidence_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_judge_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage judge reviews"
  ON public.benchmark_judge_reviews FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Persistent failure patterns detected by analysis
CREATE TABLE public.benchmark_failure_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL,
  failure_type text NOT NULL,
  issue_category text NOT NULL DEFAULT '',
  document_type text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  occurrence_count integer NOT NULL DEFAULT 0,
  severity_profile jsonb NOT NULL DEFAULT '{}',
  example_case_ids uuid[] NOT NULL DEFAULT '{}',
  prompt_versions_affected text[] NOT NULL DEFAULT '{}',
  source_types text[] NOT NULL DEFAULT '{}',
  improvement_recommendation text,
  linked_prompt_patch_id uuid REFERENCES public.prompt_patches(id),
  status text NOT NULL DEFAULT 'detected',
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_failure_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage failure patterns"
  ON public.benchmark_failure_patterns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Add judge_status to benchmark_comparisons
ALTER TABLE public.benchmark_comparisons
  ADD COLUMN judge_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN judge_summary jsonb;

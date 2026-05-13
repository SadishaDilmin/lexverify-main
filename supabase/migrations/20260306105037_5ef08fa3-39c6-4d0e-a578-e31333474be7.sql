
-- ============================================================
-- Phase 2: Comparison Engine Schema
-- ============================================================

-- 1. benchmark_comparisons - top-level comparison run
CREATE TABLE public.benchmark_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_case_id uuid NOT NULL REFERENCES public.benchmark_cases(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  ai_run_id text,
  summary_stats jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.benchmark_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage benchmark comparisons"
  ON public.benchmark_comparisons FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. benchmark_comparison_items - individual findings/differences
CREATE TABLE public.benchmark_comparison_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id uuid NOT NULL REFERENCES public.benchmark_comparisons(id) ON DELETE CASCADE,
  difference_type text NOT NULL DEFAULT 'match',
  issue_type text NOT NULL DEFAULT '',
  document_source text NOT NULL DEFAULT '',
  evidence_text text NOT NULL DEFAULT '',
  human_finding text NOT NULL DEFAULT '',
  ai_finding text NOT NULL DEFAULT '',
  human_severity text,
  ai_severity text,
  human_action text,
  ai_action text,
  evidence_citation text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_comparison_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage benchmark comparison items"
  ON public.benchmark_comparison_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.sow_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  case_reference TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  pathway TEXT NOT NULL DEFAULT 'armalytix',
  data_sources_used TEXT[] DEFAULT '{}',
  is_validation_mode BOOLEAN DEFAULT true,
  funding_overview JSONB DEFAULT '{}',
  supported_items JSONB DEFAULT '[]',
  unresolved_items JSONB DEFAULT '[]',
  draft_enquiries JSONB DEFAULT '[]',
  governance_output JSONB DEFAULT '{}',
  sign_off_support JSONB DEFAULT '{}',
  full_pipeline_result JSONB DEFAULT '{}',
  benchmark_expected_issues JSONB DEFAULT '[]',
  benchmark_expected_enquiries JSONB DEFAULT '[]',
  benchmark_expected_blockers JSONB DEFAULT '[]',
  benchmark_adequately_supported JSONB DEFAULT '[]',
  benchmark_notes TEXT DEFAULT '',
  comparison_result JSONB DEFAULT '{}',
  feedback_items JSONB DEFAULT '[]',
  overall_useful BOOLEAN,
  status TEXT DEFAULT 'pending'
);

ALTER TABLE public.sow_validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage validation runs" ON public.sow_validation_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Audit history of OFSI sanctions screening runs.
CREATE TABLE public.ofsi_screening_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  screened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  screened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  threshold NUMERIC(3,2) NOT NULL,
  parties_screened INT NOT NULL DEFAULT 0,
  ofsi_entries_checked INT NOT NULL DEFAULT 0,
  overall_status TEXT NOT NULL CHECK (overall_status IN ('clear','review_recommended','potential_match','strong_match')),
  tier_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ofsi_screening_runs_case_screened_at
  ON public.ofsi_screening_runs (case_id, screened_at DESC);

ALTER TABLE public.ofsi_screening_runs ENABLE ROW LEVEL SECURITY;

-- View: case owner (conveyancer) or admin.
CREATE POLICY "Owners and admins can view OFSI runs"
ON public.ofsi_screening_runs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = ofsi_screening_runs.case_id
      AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

-- Insert: same predicate. Edge function uses the service role and bypasses RLS,
-- but we still scope user-context inserts.
CREATE POLICY "Owners and admins can record OFSI runs"
ON public.ofsi_screening_runs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = ofsi_screening_runs.case_id
      AND (c.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

-- No UPDATE or DELETE policies — runs are immutable audit history.
-- Removal is only via cascade when the parent case is deleted.
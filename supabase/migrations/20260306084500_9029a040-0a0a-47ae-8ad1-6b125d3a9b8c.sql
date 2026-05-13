
CREATE TABLE public.evidence_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_report_id uuid NOT NULL REFERENCES public.ai_reports(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  section_heading text NOT NULL DEFAULT '',
  item_label text NOT NULL DEFAULT '',
  item_text text NOT NULL DEFAULT '',
  document_name text NOT NULL DEFAULT '',
  document_path text NOT NULL DEFAULT '',
  page_number integer,
  source_snippet text NOT NULL DEFAULT '',
  anchor_text text,
  relationship_type text NOT NULL DEFAULT 'direct_extraction',
  is_primary boolean NOT NULL DEFAULT true,
  confidence_score numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_references ENABLE ROW LEVEL SECURITY;

-- Users can view evidence for their own cases
CREATE POLICY "Users can view evidence for their cases"
  ON public.evidence_references FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.cases
    WHERE cases.id = evidence_references.case_id
      AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- Users can insert evidence for their own cases
CREATE POLICY "Users can insert evidence for their cases"
  ON public.evidence_references FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cases
    WHERE cases.id = evidence_references.case_id
      AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- Deny delete (audit trail)
CREATE POLICY "Deny delete on evidence_references"
  ON public.evidence_references FOR DELETE
  USING (false);

-- Deny update (immutable once written)
CREATE POLICY "Deny update on evidence_references"
  ON public.evidence_references FOR UPDATE
  USING (false);

-- Index for fast lookups
CREATE INDEX idx_evidence_references_report ON public.evidence_references(ai_report_id);
CREATE INDEX idx_evidence_references_case ON public.evidence_references(case_id);

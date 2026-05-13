
-- ============================================================
-- PROVENANCE, VERIFICATION & EXTRACTION-MAPPING LAYER
-- ============================================================

-- A. Expand sow_evidence_items with provenance fields
ALTER TABLE public.sow_evidence_items
  ADD COLUMN IF NOT EXISTS provenance_detail text,
  ADD COLUMN IF NOT EXISTS extracted_from_section text,
  ADD COLUMN IF NOT EXISTS extracted_from_page text,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS reviewer_locked boolean DEFAULT false;

-- B. Expand sow_risk_flags with contradiction detail
ALTER TABLE public.sow_risk_flags
  ADD COLUMN IF NOT EXISTS contradiction_type text,
  ADD COLUMN IF NOT EXISTS contradiction_summary text,
  ADD COLUMN IF NOT EXISTS affected_ref_table text,
  ADD COLUMN IF NOT EXISTS affected_ref_id uuid,
  ADD COLUMN IF NOT EXISTS affected_field text;

-- C. Add inline provenance columns to sow_connected_accounts
ALTER TABLE public.sow_connected_accounts
  ADD COLUMN IF NOT EXISTS provenance_detail text,
  ADD COLUMN IF NOT EXISTS extracted_from_section text,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS contradiction_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_evidence_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewer_locked boolean DEFAULT false;

-- Add inline provenance columns to sow_manual_balances
ALTER TABLE public.sow_manual_balances
  ADD COLUMN IF NOT EXISTS provenance_detail text,
  ADD COLUMN IF NOT EXISTS extracted_from_section text,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS contradiction_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_evidence_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewer_locked boolean DEFAULT false;

-- Add inline provenance columns to sow_fund_sources (has verification_status & source_origin already)
ALTER TABLE public.sow_fund_sources
  ADD COLUMN IF NOT EXISTS provenance_detail text,
  ADD COLUMN IF NOT EXISTS extracted_from_section text,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS contradiction_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_evidence_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewer_locked boolean DEFAULT false;

-- Add inline provenance columns to sow_income_verification
ALTER TABLE public.sow_income_verification
  ADD COLUMN IF NOT EXISTS provenance_detail text,
  ADD COLUMN IF NOT EXISTS extracted_from_section text,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS contradiction_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_evidence_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewer_locked boolean DEFAULT false;

-- Add inline provenance columns to sow_transactions
ALTER TABLE public.sow_transactions
  ADD COLUMN IF NOT EXISTS provenance_detail text,
  ADD COLUMN IF NOT EXISTS extracted_from_section text,
  ADD COLUMN IF NOT EXISTS extraction_method text DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS contradiction_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_evidence_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewer_locked boolean DEFAULT false;

-- D. Create sow_field_provenance table
CREATE TABLE IF NOT EXISTS public.sow_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  armalytix_report_id uuid REFERENCES public.armalytix_reports(id) ON DELETE SET NULL,
  ref_table text NOT NULL,
  ref_id uuid NOT NULL,
  field_name text NOT NULL,
  field_value text,
  source_origin text DEFAULT 'client_declaration',
  provenance_detail text,
  extracted_from_section text,
  extracted_from_page text,
  extraction_method text DEFAULT 'exact',
  confidence_score numeric,
  confidence_label text DEFAULT 'medium',
  verification_status text DEFAULT 'unverified',
  contradiction_flag boolean DEFAULT false,
  missing_evidence_flag boolean DEFAULT false,
  reviewer_locked boolean DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for sow_field_provenance
ALTER TABLE public.sow_field_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own case field provenance"
  ON public.sow_field_provenance FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cases
    WHERE cases.id = sow_field_provenance.case_id
      AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can insert own case field provenance"
  ON public.sow_field_provenance FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cases
    WHERE cases.id = sow_field_provenance.case_id
      AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can update own case field provenance"
  ON public.sow_field_provenance FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cases
    WHERE cases.id = sow_field_provenance.case_id
      AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can delete own case field provenance"
  ON public.sow_field_provenance FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cases
    WHERE cases.id = sow_field_provenance.case_id
      AND (cases.conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- Trigger for updated_at
CREATE TRIGGER update_sow_field_provenance_updated_at
  BEFORE UPDATE ON public.sow_field_provenance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for sow_field_provenance
CREATE INDEX IF NOT EXISTS idx_sow_field_provenance_case ON public.sow_field_provenance(case_id);
CREATE INDEX IF NOT EXISTS idx_sow_field_provenance_ref ON public.sow_field_provenance(ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_sow_field_provenance_field ON public.sow_field_provenance(ref_table, ref_id, field_name);

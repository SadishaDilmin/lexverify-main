
-- Table to store regulatory audit findings
CREATE TABLE IF NOT EXISTS public.regulatory_audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  bucket text NOT NULL,
  file_name text NOT NULL,
  case_id text,
  case_reference text,
  match_type text NOT NULL DEFAULT 'contractual_control',
  agreement_type text,
  detected_date text,
  similarity_score double precision,
  snippet text,
  hmlr_filed boolean DEFAULT false,
  disclosure_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.regulatory_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage regulatory audit findings"
  ON public.regulatory_audit_findings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on regulatory_audit_findings"
  ON public.regulatory_audit_findings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

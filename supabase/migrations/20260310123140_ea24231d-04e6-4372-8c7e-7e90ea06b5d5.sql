
-- Add proposed_healed_text column to documents for Phase 3 verification
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS proposed_healed_text TEXT;

-- Add confidence_suppression table to track recalibrated doc types
CREATE TABLE public.confidence_suppressions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type TEXT NOT NULL,
  ocr_engine TEXT NOT NULL DEFAULT 'default',
  suppression_factor NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  reason TEXT NOT NULL,
  correction_signal_ids UUID[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_type, ocr_engine)
);

ALTER TABLE public.confidence_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on confidence_suppressions"
  ON public.confidence_suppressions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read confidence_suppressions"
  ON public.confidence_suppressions FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_confidence_suppressions_updated_at
  BEFORE UPDATE ON public.confidence_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

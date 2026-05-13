
-- Enum for extraction failure types
CREATE TYPE public.extraction_failure_type AS ENUM ('low_confidence', 'engine_mismatch', 'layout_break');

-- 1. Document Correction Signals
CREATE TABLE public.document_correction_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  document_type TEXT NOT NULL,
  page_number INT,
  ocr_engine TEXT NOT NULL DEFAULT 'default',
  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  bounding_box JSONB,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Extraction Failure Logs
CREATE TABLE public.extraction_failure_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  failure_type extraction_failure_type NOT NULL,
  raw_payload JSONB,
  detected_issue TEXT NOT NULL DEFAULT '',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Clause Pattern Memory
CREATE TABLE public.clause_pattern_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clause_type TEXT NOT NULL,
  pattern_hash TEXT NOT NULL,
  standard_wording_sample TEXT NOT NULL DEFAULT '',
  occurrence_count INT NOT NULL DEFAULT 1,
  document_type TEXT,
  last_seen_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clause_type, pattern_hash)
);

-- RLS
ALTER TABLE public.document_correction_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_failure_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clause_pattern_memory ENABLE ROW LEVEL SECURITY;

-- Admins full access on all three tables
CREATE POLICY "Admins full access on correction_signals"
  ON public.document_correction_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Case owner can insert corrections"
  ON public.document_correction_signals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.cases WHERE id = case_id AND conveyancer_id = auth.uid())
  );

CREATE POLICY "Case owner can read own corrections"
  ON public.document_correction_signals FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins full access on failure_logs"
  ON public.extraction_failure_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Case owner can read own failure logs"
  ON public.extraction_failure_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases WHERE id = case_id AND conveyancer_id = auth.uid()));

CREATE POLICY "Admins full access on clause_pattern_memory"
  ON public.clause_pattern_memory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can read clause patterns"
  ON public.clause_pattern_memory FOR SELECT TO authenticated
  USING (true);

-- Indexes
CREATE INDEX idx_correction_signals_document ON public.document_correction_signals(document_id);
CREATE INDEX idx_correction_signals_case ON public.document_correction_signals(case_id);
CREATE INDEX idx_failure_logs_document ON public.extraction_failure_logs(document_id);
CREATE INDEX idx_failure_logs_unresolved ON public.extraction_failure_logs(is_resolved) WHERE is_resolved = false;
CREATE INDEX idx_clause_pattern_type ON public.clause_pattern_memory(clause_type);

-- Auto-update updated_at on clause_pattern_memory
CREATE TRIGGER update_clause_pattern_updated_at
  BEFORE UPDATE ON public.clause_pattern_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

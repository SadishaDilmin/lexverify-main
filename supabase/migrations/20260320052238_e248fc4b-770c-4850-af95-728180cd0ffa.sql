
CREATE TABLE public.document_classification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_folder TEXT NOT NULL,
  suggested_folder TEXT,
  classification_category TEXT,
  classification_confidence TEXT,
  classification_description TEXT,
  user_action TEXT DEFAULT 'pending',
  final_folder TEXT NOT NULL,
  was_auto_moved BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acted_at TIMESTAMPTZ,
  user_id UUID
);

ALTER TABLE public.document_classification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own classification logs"
  ON public.document_classification_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own classification logs"
  ON public.document_classification_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update own classification logs"
  ON public.document_classification_log
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_classification_log_case_id ON public.document_classification_log(case_id);
CREATE INDEX idx_classification_log_created ON public.document_classification_log(created_at DESC);

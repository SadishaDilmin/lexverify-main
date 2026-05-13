
-- ExchangeGuard™ reviews table
CREATE TABLE public.exchange_guard_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_id UUID REFERENCES public.cases(id),
  case_reference TEXT NOT NULL,
  full_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_position TEXT NOT NULL DEFAULT '',
  property_address TEXT NOT NULL,
  purchase_price NUMERIC,
  lender TEXT,
  tenure TEXT NOT NULL DEFAULT 'Freehold',
  transaction_type TEXT NOT NULL DEFAULT 'Freehold',
  status TEXT NOT NULL DEFAULT 'metadata',
  transaction_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_guard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own exchange guard reviews"
  ON public.exchange_guard_reviews FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own exchange guard reviews"
  ON public.exchange_guard_reviews FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update own exchange guard reviews"
  ON public.exchange_guard_reviews FOR UPDATE
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous select on exchange_guard_reviews"
  ON public.exchange_guard_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Deny delete on exchange_guard_reviews"
  ON public.exchange_guard_reviews FOR DELETE
  USING (false);

-- ExchangeGuard™ documents table
CREATE TABLE public.exchange_guard_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.exchange_guard_reviews(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL,
  doc_group TEXT NOT NULL DEFAULT 'bulk',
  detected_type TEXT,
  confidence_pct INTEGER,
  manual_override_type TEXT,
  issues TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_guard_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert docs for own exchange guard reviews"
  ON public.exchange_guard_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.exchange_guard_reviews
    WHERE id = exchange_guard_documents.review_id
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can view docs for own exchange guard reviews"
  ON public.exchange_guard_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.exchange_guard_reviews
    WHERE id = exchange_guard_documents.review_id
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can delete docs for own exchange guard reviews"
  ON public.exchange_guard_documents FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.exchange_guard_reviews
    WHERE id = exchange_guard_documents.review_id
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can update docs for own exchange guard reviews"
  ON public.exchange_guard_documents FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.exchange_guard_reviews
    WHERE id = exchange_guard_documents.review_id
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

-- ExchangeGuard™ results table
CREATE TABLE public.exchange_guard_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.exchange_guard_reviews(id) ON DELETE CASCADE,
  ai_run_id TEXT NOT NULL,
  document_register JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_documents JSONB DEFAULT '[]'::jsonb,
  risk_summary JSONB DEFAULT '{}'::jsonb,
  fraud_flags JSONB DEFAULT '[]'::jsonb,
  further_enquiries TEXT,
  internal_report TEXT,
  exchange_decision_support TEXT,
  risk_rating TEXT DEFAULT 'green',
  risk_score INTEGER DEFAULT 0,
  escalation_flag BOOLEAN DEFAULT false,
  confidence_rating TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_guard_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can insert exchange guard results"
  ON public.exchange_guard_results FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.exchange_guard_reviews
    WHERE id = exchange_guard_results.review_id
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Users can view results for own exchange guard reviews"
  ON public.exchange_guard_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.exchange_guard_reviews
    WHERE id = exchange_guard_results.review_id
    AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "Deny delete on exchange_guard_results"
  ON public.exchange_guard_results FOR DELETE
  USING (false);

CREATE POLICY "Deny update on exchange_guard_results"
  ON public.exchange_guard_results FOR UPDATE
  USING (false);

-- Storage bucket for exchange guard documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('exchange-guard-documents', 'exchange-guard-documents', false);

-- Storage RLS policies
CREATE POLICY "Users can upload exchange guard docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exchange-guard-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can read own exchange guard docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exchange-guard-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own exchange guard docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exchange-guard-documents' AND auth.uid() IS NOT NULL);

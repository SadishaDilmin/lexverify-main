
-- Draft reviews table
CREATE TABLE public.draft_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_reference text NOT NULL,
  full_name text NOT NULL,
  user_position text NOT NULL,
  user_email text NOT NULL,
  property_address text NOT NULL,
  tenure text NOT NULL DEFAULT 'Unknown',
  lender_involved boolean NOT NULL DEFAULT false,
  transaction_notes text DEFAULT '',
  status text NOT NULL DEFAULT 'metadata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.draft_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own draft reviews" ON public.draft_reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own draft reviews" ON public.draft_reviews
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update own draft reviews" ON public.draft_reviews
  FOR UPDATE USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny anonymous select on draft_reviews" ON public.draft_reviews
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_draft_reviews_updated_at
  BEFORE UPDATE ON public.draft_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Draft review documents table
CREATE TABLE public.draft_review_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.draft_reviews(id) ON DELETE CASCADE,
  doc_group text NOT NULL DEFAULT 'core',
  doc_slot text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  auto_title text,
  doc_category text,
  detected_date text,
  issuer text,
  address_match text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.draft_review_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_review_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert docs for own draft reviews" ON public.draft_review_documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.draft_reviews WHERE id = review_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can view docs for own draft reviews" ON public.draft_review_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.draft_reviews WHERE id = review_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can update docs for own draft reviews" ON public.draft_review_documents
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.draft_reviews WHERE id = review_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Users can delete docs for own draft reviews" ON public.draft_review_documents
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.draft_reviews WHERE id = review_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

-- Draft review results table
CREATE TABLE public.draft_review_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.draft_reviews(id) ON DELETE CASCADE,
  ai_run_id text NOT NULL,
  document_inventory jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_report text,
  draft_enquiries text,
  flags_summary jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.draft_review_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_review_results FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view results for own draft reviews" ON public.draft_review_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.draft_reviews WHERE id = review_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "System can insert draft review results" ON public.draft_review_results
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.draft_reviews WHERE id = review_id AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
  );

CREATE POLICY "Deny delete on draft_review_results" ON public.draft_review_results
  FOR DELETE USING (false);

CREATE POLICY "Deny update on draft_review_results" ON public.draft_review_results
  FOR UPDATE USING (false);

-- Storage bucket for draft review documents
INSERT INTO storage.buckets (id, name, public) VALUES ('draft-review-documents', 'draft-review-documents', false);

-- Storage RLS policies
CREATE POLICY "Users can upload draft review docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'draft-review-documents' AND
    EXISTS (
      SELECT 1 FROM public.draft_reviews
      WHERE id = (split_part(name, '/', 1))::uuid
      AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can view draft review docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'draft-review-documents' AND
    EXISTS (
      SELECT 1 FROM public.draft_reviews
      WHERE id = (split_part(name, '/', 1))::uuid
      AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can delete draft review docs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'draft-review-documents' AND
    EXISTS (
      SELECT 1 FROM public.draft_reviews
      WHERE id = (split_part(name, '/', 1))::uuid
      AND (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

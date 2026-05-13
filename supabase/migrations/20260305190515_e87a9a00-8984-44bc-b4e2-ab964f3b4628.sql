
CREATE TABLE public.doc_classification_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash text NOT NULL,
  classifier text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(file_hash, classifier)
);

ALTER TABLE public.doc_classification_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all access to doc_classification_cache"
  ON public.doc_classification_cache
  FOR ALL
  USING (false)
  WITH CHECK (false);

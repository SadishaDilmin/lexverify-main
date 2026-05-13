
CREATE TABLE public.doc_processing_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  text_content text,
  is_multimodal boolean NOT NULL DEFAULT false,
  mime_type text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket, file_path, file_size)
);

-- No RLS needed — only edge functions (service role) access this table
ALTER TABLE public.doc_processing_cache ENABLE ROW LEVEL SECURITY;

-- Deny all access to anon/authenticated users
CREATE POLICY "Deny all access to doc_processing_cache"
  ON public.doc_processing_cache
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS fetch_error text;
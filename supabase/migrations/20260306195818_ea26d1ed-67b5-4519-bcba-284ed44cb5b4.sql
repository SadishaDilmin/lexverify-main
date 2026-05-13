ALTER TABLE public.benchmark_documents
  ADD COLUMN extraction_method text,
  ADD COLUMN extracted_chars integer,
  ADD COLUMN extraction_error text,
  ADD COLUMN last_extracted_at timestamptz;
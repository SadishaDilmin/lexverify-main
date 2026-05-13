
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add content_embedding column to knowledge_base_content
ALTER TABLE public.knowledge_base_content 
ADD COLUMN IF NOT EXISTS content_embedding vector(768);

-- Add chunk_index for chunked documents
ALTER TABLE public.knowledge_base_content 
ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0;

-- Add parent_id for linking chunks to parent record
ALTER TABLE public.knowledge_base_content 
ADD COLUMN IF NOT EXISTS parent_file_path text;

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_kbc_embedding_hnsw 
ON public.knowledge_base_content 
USING hnsw (content_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create the semantic search function
CREATE OR REPLACE FUNCTION public.search_knowledge_base_semantic(
  query_embedding vector(768),
  match_count integer DEFAULT 5,
  match_threshold double precision DEFAULT 0.5,
  filter_bucket text DEFAULT NULL,
  filter_case_id text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  file_path text,
  file_name text,
  bucket text,
  raw_text text,
  file_type text,
  chunk_index integer,
  similarity double precision,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbc.id,
    kbc.file_path,
    kbc.file_name,
    kbc.bucket,
    kbc.raw_text,
    kbc.file_type::text,
    kbc.chunk_index,
    (1 - (kbc.content_embedding <=> query_embedding))::double precision AS sim,
    kbc.metadata
  FROM public.knowledge_base_content kbc
  WHERE kbc.status = 'completed'
    AND kbc.content_embedding IS NOT NULL
    AND (1 - (kbc.content_embedding <=> query_embedding)) > match_threshold
    AND (filter_bucket IS NULL OR kbc.bucket = filter_bucket)
    AND (filter_case_id IS NULL OR kbc.file_path LIKE filter_case_id || '/%')
  ORDER BY kbc.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

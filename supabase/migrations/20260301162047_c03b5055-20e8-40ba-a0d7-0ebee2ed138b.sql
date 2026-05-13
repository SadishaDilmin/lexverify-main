-- Add generated tsvector column for full-text search on knowledge_chunks
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_tsv
  ON public.knowledge_chunks USING GIN (content_tsv);

-- Keyword-based search function (full-text search fallback)
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks_keyword(
  search_query text,
  match_agent_id text DEFAULT 'source-of-wealth',
  match_count integer DEFAULT 5,
  match_knowledge_base_ids text[] DEFAULT NULL,
  match_tenure_type text DEFAULT NULL
)
RETURNS TABLE(
  chunk_id uuid,
  chunk_document_id uuid,
  chunk_content text,
  document_title text,
  document_category text,
  similarity double precision,
  knowledge_base_id text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kd.title,
    kd.category,
    ts_rank_cd(kc.content_tsv, websearch_to_tsquery('english', search_query))::FLOAT AS rank_score,
    kd.knowledge_base_id
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'approved'
    AND kc.content_tsv @@ websearch_to_tsquery('english', search_query)
    AND (
      CASE
        WHEN match_knowledge_base_ids IS NOT NULL AND array_length(match_knowledge_base_ids, 1) > 0
        THEN kd.knowledge_base_id = ANY(match_knowledge_base_ids)
        ELSE kd.agent_id = match_agent_id
      END
    )
    AND (
      match_tenure_type IS NULL
      OR kd.tenure_types = '{}'
      OR match_tenure_type = ANY(kd.tenure_types)
    )
  ORDER BY rank_score DESC
  LIMIT match_count;
END;
$$;
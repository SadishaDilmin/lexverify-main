
-- 1. Rename knowledge_base_id → knowledge_base_ids and convert to text[]
ALTER TABLE public.knowledge_documents
  ADD COLUMN knowledge_base_ids text[] NOT NULL DEFAULT '{}';

UPDATE public.knowledge_documents
  SET knowledge_base_ids = CASE
    WHEN knowledge_base_id IS NOT NULL AND knowledge_base_id <> '' THEN ARRAY[knowledge_base_id]
    ELSE '{}'
  END;

ALTER TABLE public.knowledge_documents
  DROP CONSTRAINT IF EXISTS knowledge_documents_knowledge_base_id_fkey;

ALTER TABLE public.knowledge_documents
  DROP COLUMN knowledge_base_id;

-- 2. Update the vector search function to use ANY() on the array column
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding_text text,
  match_agent_id text DEFAULT 'source-of-wealth',
  match_threshold double precision DEFAULT 0.7,
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
    (1 - (kc.embedding <=> query_embedding_text::vector(256)))::FLOAT,
    kd.knowledge_base_ids[1]  -- return first KB for backward compat
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'approved'
    AND (
      CASE
        WHEN match_knowledge_base_ids IS NOT NULL AND array_length(match_knowledge_base_ids, 1) > 0
        THEN kd.knowledge_base_ids && match_knowledge_base_ids  -- array overlap operator
        ELSE kd.agent_id = match_agent_id
      END
    )
    AND (
      match_tenure_type IS NULL
      OR kd.tenure_types = '{}'
      OR match_tenure_type = ANY(kd.tenure_types)
    )
    AND (1 - (kc.embedding <=> query_embedding_text::vector(256)))::FLOAT > match_threshold
  ORDER BY kc.embedding <=> query_embedding_text::vector(256)
  LIMIT match_count;
END;
$$;

-- 3. Update the keyword search function similarly
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
DECLARE
  ts_and tsquery;
  ts_or tsquery;
  words text[];
  w text;
  ts_part tsquery;
BEGIN
  ts_and := plainto_tsquery('english', search_query);

  words := regexp_split_to_array(lower(trim(search_query)), '\s+');
  ts_or := NULL;
  FOREACH w IN ARRAY words LOOP
    IF length(w) >= 3 THEN
      ts_part := to_tsquery('simple', w || ':*');
      IF ts_or IS NULL THEN
        ts_or := ts_part;
      ELSE
        ts_or := ts_or || ts_part;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kd.title,
    kd.category,
    (CASE
      WHEN kc.content_tsv @@ ts_and THEN 2.0 * ts_rank_cd(kc.content_tsv, ts_and)
      ELSE ts_rank_cd(kc.content_tsv, ts_or)
    END)::FLOAT AS rank_score,
    kd.knowledge_base_ids[1]
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'approved'
    AND (kc.content_tsv @@ ts_and OR (ts_or IS NOT NULL AND kc.content_tsv @@ ts_or))
    AND (
      CASE
        WHEN match_knowledge_base_ids IS NOT NULL AND array_length(match_knowledge_base_ids, 1) > 0
        THEN kd.knowledge_base_ids && match_knowledge_base_ids
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

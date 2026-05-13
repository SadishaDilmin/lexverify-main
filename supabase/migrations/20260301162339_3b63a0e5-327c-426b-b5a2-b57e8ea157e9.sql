-- Replace keyword search function with more lenient matching:
-- 1. Use plainto_tsquery (AND of individual words) instead of websearch_to_tsquery
-- 2. Add an OR-based fallback using individual terms for maximum recall
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
  -- Build AND query (all terms must match)
  ts_and := plainto_tsquery('english', search_query);

  -- Build OR query (any term can match) for broader recall
  words := regexp_split_to_array(lower(trim(search_query)), '\s+');
  ts_or := NULL;
  FOREACH w IN ARRAY words LOOP
    IF length(w) >= 3 THEN  -- skip very short words
      ts_part := to_tsquery('simple', w || ':*');  -- prefix match with simple config
      IF ts_or IS NULL THEN
        ts_or := ts_part;
      ELSE
        ts_or := ts_or || ts_part;  -- OR combination
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
    -- Score: AND matches get a 2x boost over OR-only matches
    (CASE
      WHEN kc.content_tsv @@ ts_and THEN 2.0 * ts_rank_cd(kc.content_tsv, ts_and)
      ELSE ts_rank_cd(kc.content_tsv, ts_or)
    END)::FLOAT AS rank_score,
    kd.knowledge_base_id
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'approved'
    AND (kc.content_tsv @@ ts_and OR (ts_or IS NOT NULL AND kc.content_tsv @@ ts_or))
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
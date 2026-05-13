
-- ============================================================================
-- SoW retrieval hardening: archive companion docs + per-document cap on RPC
-- ============================================================================

-- 1. Archive externally-authored "AI Retrieval Companion" documents so they
--    stop competing with original firm/regulatory documents in retrieval.
--    Status filter (status='approved') already exists on the keyword RPC.
UPDATE public.knowledge_documents
SET status = 'archived',
    updated_at = now()
WHERE title ILIKE '%AI Retrieval Companion%'
  AND status = 'approved';

-- 2. Add per_document_cap parameter to the keyword search RPC. NULL preserves
--    backward compatibility (no cap) for any other caller. resolve-sow-context
--    will pass 2.
--    The cap is enforced by ranking candidates over an enlarged candidate pool
--    (match_count * 4) using ts_rank, then walking the ranked set with
--    row_number() partitioned by document_id and keeping only those with
--    rn <= per_document_cap, finally taking the top match_count.
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks_keyword(
  search_query text,
  match_agent_id text DEFAULT 'source-of-wealth'::text,
  match_count integer DEFAULT 5,
  match_knowledge_base_ids text[] DEFAULT NULL::text[],
  match_tenure_type text DEFAULT NULL::text,
  per_document_cap integer DEFAULT NULL
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
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  ts_and tsquery;
  ts_or tsquery;
  words text[];
  w text;
  ts_part tsquery;
  candidate_pool integer;
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

  -- When a per-document cap is requested, over-fetch so we have enough
  -- diverse candidates to fill match_count after the cap is applied.
  IF per_document_cap IS NOT NULL THEN
    candidate_pool := GREATEST(match_count * 4, 32);
  ELSE
    candidate_pool := match_count;
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      kc.id AS chunk_id,
      kc.document_id AS chunk_document_id,
      kc.content AS chunk_content,
      kd.title AS document_title,
      kd.category AS document_category,
      (CASE
        WHEN kc.content_tsv @@ ts_and THEN 2.0 * ts_rank_cd(kc.content_tsv, ts_and)
        ELSE ts_rank_cd(kc.content_tsv, ts_or)
      END)::FLOAT AS similarity,
      kd.knowledge_base_ids[1] AS knowledge_base_id
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
    ORDER BY similarity DESC
    LIMIT candidate_pool
  ),
  capped AS (
    SELECT
      r.*,
      ROW_NUMBER() OVER (PARTITION BY r.chunk_document_id ORDER BY r.similarity DESC) AS doc_rn
    FROM ranked r
  )
  SELECT
    c.chunk_id,
    c.chunk_document_id,
    c.chunk_content,
    c.document_title,
    c.document_category,
    c.similarity,
    c.knowledge_base_id
  FROM capped c
  WHERE per_document_cap IS NULL OR c.doc_rn <= per_document_cap
  ORDER BY c.similarity DESC
  LIMIT match_count;
END;
$function$;

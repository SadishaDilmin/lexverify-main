-- Fix `type "vector" does not exist` error when search_knowledge_chunks is
-- called by the service-role client (e.g. from the sow-flow-probe diagnostic).
--
-- Root cause: the function ran with `search_path = public` but the pgvector
-- `vector` type lives in the `extensions` schema. Authenticated app calls
-- happened to inherit `extensions` on the session search_path; service-role
-- calls do not, so the unqualified `::vector(256)` cast failed to resolve.
--
-- Fix: broaden the function-level search_path to include `extensions` and
-- fully-qualify the cast as belt-and-braces. Function body is otherwise
-- unchanged: same signature, same return shape, same filter logic.

CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding_text text,
  match_agent_id text DEFAULT 'source-of-wealth'::text,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5,
  match_knowledge_base_ids text[] DEFAULT NULL::text[],
  match_tenure_type text DEFAULT NULL::text
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
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kd.title,
    kd.category,
    (1 - (kc.embedding <=> query_embedding_text::extensions.vector(256)))::FLOAT,
    kd.knowledge_base_ids[1]  -- return first KB for backward compat
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'approved'
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
    AND (1 - (kc.embedding <=> query_embedding_text::extensions.vector(256)))::FLOAT > match_threshold
  ORDER BY kc.embedding <=> query_embedding_text::extensions.vector(256)
  LIMIT match_count;
END;
$function$;

-- Align the keyword-search sibling function for consistency. It does not
-- currently cast to vector, but matching the search_path prevents the same
-- class of bug if it ever does, and keeps the two siblings aligned.
ALTER FUNCTION public.search_knowledge_chunks_keyword(
  text, text, integer, text[], text
) SET search_path = public, extensions;
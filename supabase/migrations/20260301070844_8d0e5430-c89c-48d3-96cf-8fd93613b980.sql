-- Clear all existing embeddings (they're 768-dim, incompatible with new 128-dim)
UPDATE public.knowledge_chunks SET embedding = NULL;

-- Alter the embedding column from vector(768) to vector(128)
ALTER TABLE public.knowledge_chunks 
  ALTER COLUMN embedding TYPE vector(128);

-- Recreate the search function to use vector(128)
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding_text text,
  match_agent_id text DEFAULT 'source-of-wealth',
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5
)
RETURNS TABLE(
  chunk_id uuid,
  chunk_document_id uuid,
  chunk_content text,
  document_title text,
  document_category text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    kc.id,
    kc.document_id,
    kc.content,
    kd.title,
    kd.category,
    (1 - (kc.embedding <=> query_embedding_text::vector(128)))::FLOAT
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.agent_id = match_agent_id
    AND kd.status = 'approved'
    AND (1 - (kc.embedding <=> query_embedding_text::vector(128)))::FLOAT > match_threshold
  ORDER BY kc.embedding <=> query_embedding_text::vector(128)
  LIMIT match_count;
END;
$function$;

-- Reset chunk_count on all documents since embeddings were cleared
UPDATE public.knowledge_documents SET chunk_count = 0;
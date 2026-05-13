-- Drop the old 4-parameter overload to resolve PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.search_knowledge_chunks(text, text, double precision, integer);
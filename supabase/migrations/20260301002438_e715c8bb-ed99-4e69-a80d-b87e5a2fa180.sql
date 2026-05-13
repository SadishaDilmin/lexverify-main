
-- Knowledge documents table
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'regulatory',
  agent_id TEXT NOT NULL DEFAULT 'source-of-wealth',
  status TEXT NOT NULL DEFAULT 'pending',
  file_name TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  uploaded_by UUID NOT NULL,
  suggested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Knowledge chunks table with vector embeddings
CREATE TABLE public.knowledge_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding vector(768),
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX knowledge_chunks_document_id_idx ON public.knowledge_chunks(document_id);
CREATE INDEX knowledge_documents_agent_id_idx ON public.knowledge_documents(agent_id);
CREATE INDEX knowledge_documents_status_idx ON public.knowledge_documents(status);

-- RLS on both tables
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- knowledge_documents policies
CREATE POLICY "Admins can manage all knowledge documents"
  ON public.knowledge_documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view approved documents"
  ON public.knowledge_documents FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'approved');

CREATE POLICY "Authenticated users can suggest documents"
  ON public.knowledge_documents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND uploaded_by = auth.uid() AND status = 'pending');

-- knowledge_chunks policies
CREATE POLICY "Admins can manage all chunks"
  ON public.knowledge_chunks FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view chunks of approved docs"
  ON public.knowledge_chunks FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.knowledge_documents 
    WHERE id = knowledge_chunks.document_id AND status = 'approved'
  ));

-- Updated_at trigger
CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vector similarity search function (accepts TEXT to avoid type resolution issues)
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding_text TEXT,
  match_agent_id TEXT DEFAULT 'source-of-wealth',
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  chunk_document_id UUID,
  chunk_content TEXT,
  document_title TEXT,
  document_category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kc.id,
    kc.document_id,
    kc.content,
    kd.title,
    kd.category,
    (1 - (kc.embedding <=> query_embedding_text::vector(768)))::FLOAT
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.agent_id = match_agent_id
    AND kd.status = 'approved'
    AND (1 - (kc.embedding <=> query_embedding_text::vector(768)))::FLOAT > match_threshold
  ORDER BY kc.embedding <=> query_embedding_text::vector(768)
  LIMIT match_count;
END;
$$;

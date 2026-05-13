
-- 1. Knowledge bases reference table
CREATE TABLE IF NOT EXISTS public.knowledge_bases (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agent_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.knowledge_bases (id, label, description, agent_ids) VALUES
  ('source-of-wealth', 'Source of Wealth', 'AML/KYC source of wealth and funding guidance', ARRAY['source-of-wealth']),
  ('search-review', 'Search Review', 'Property search analysis guidance', ARRAY['search-review']),
  ('document-review', 'Document Review', 'Draft document review guidance', ARRAY['title-checker']),
  ('exchange-guard', 'ExchangeGuard', 'Exchange and completion transaction guidance', ARRAY[]::TEXT[]),
  ('lender-compliance', 'Lender Compliance', 'Lender-specific requirements and mortgage conditions', ARRAY['search-review', 'title-checker']),
  ('environmental-risk', 'Environmental Risk', 'Environmental search analysis, contamination, flood risk', ARRAY['search-review']),
  ('leasehold-management', 'Leasehold & Management', 'Leasehold-specific guidance', ARRAY['title-checker', 'search-review']),
  ('new-build', 'New Build', 'New build specific guidance', ARRAY['title-checker', 'search-review']),
  ('freehold', 'Freehold', 'Freehold-specific guidance', ARRAY['title-checker', 'search-review']),
  ('commonhold', 'Commonhold', 'Commonhold-specific guidance', ARRAY['title-checker', 'search-review']),
  ('fraud-risk', 'Fraud & Risk Indicators', 'Fraud detection patterns and risk indicators', ARRAY['title-checker', 'source-of-wealth']),
  ('regulatory-aml', 'Regulatory & AML', 'SRA, CLC, LSAG regulatory guidance and AML requirements', ARRAY['source-of-wealth', 'regulatory-compliance'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view knowledge bases"
  ON public.knowledge_bases FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage knowledge bases"
  ON public.knowledge_bases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Add metadata columns to knowledge_documents
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS knowledge_base_id TEXT REFERENCES public.knowledge_bases(id),
  ADD COLUMN IF NOT EXISTS tenure_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS transaction_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS risk_categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lender_relevance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jurisdiction TEXT NOT NULL DEFAULT 'england_wales',
  ADD COLUMN IF NOT EXISTS doc_type_tag TEXT NOT NULL DEFAULT 'general';

UPDATE public.knowledge_documents
  SET knowledge_base_id = 'source-of-wealth'
  WHERE agent_id = 'source-of-wealth' AND knowledge_base_id IS NULL;

-- 3. Create retrieval_logs table
CREATE TABLE IF NOT EXISTS public.retrieval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent_id TEXT NOT NULL,
  user_id UUID,
  case_id UUID,
  query_text TEXT NOT NULL DEFAULT '',
  knowledge_bases_queried TEXT[] NOT NULL DEFAULT '{}',
  documents_retrieved JSONB NOT NULL DEFAULT '[]',
  retrieval_tier INTEGER NOT NULL DEFAULT 1,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  total_chunks_scanned INTEGER NOT NULL DEFAULT 0,
  top_similarity DOUBLE PRECISION,
  latency_ms INTEGER,
  metadata JSONB
);

ALTER TABLE public.retrieval_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retrieval logs"
  ON public.retrieval_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert retrieval logs"
  ON public.retrieval_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Deny update on retrieval_logs"
  ON public.retrieval_logs FOR UPDATE
  USING (false);

CREATE POLICY "Deny delete on retrieval_logs"
  ON public.retrieval_logs FOR DELETE
  USING (false);

-- 4. Indexes for metadata-filtered vector search
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_kb_status
  ON public.knowledge_documents (knowledge_base_id, status);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_agent_kb
  ON public.knowledge_documents (agent_id, knowledge_base_id, status);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenure
  ON public.knowledge_documents USING GIN (tenure_types);

-- 5. Updated RPC with metadata filtering
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding_text TEXT,
  match_agent_id TEXT DEFAULT 'source-of-wealth',
  match_threshold DOUBLE PRECISION DEFAULT 0.7,
  match_count INTEGER DEFAULT 5,
  match_knowledge_base_ids TEXT[] DEFAULT NULL,
  match_tenure_type TEXT DEFAULT NULL
)
RETURNS TABLE(
  chunk_id UUID,
  chunk_document_id UUID,
  chunk_content TEXT,
  document_title TEXT,
  document_category TEXT,
  similarity DOUBLE PRECISION,
  knowledge_base_id TEXT
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
    (1 - (kc.embedding <=> query_embedding_text::vector(256)))::FLOAT,
    kd.knowledge_base_id
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'approved'
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
    AND (1 - (kc.embedding <=> query_embedding_text::vector(256)))::FLOAT > match_threshold
  ORDER BY kc.embedding <=> query_embedding_text::vector(256)
  LIMIT match_count;
END;
$function$;

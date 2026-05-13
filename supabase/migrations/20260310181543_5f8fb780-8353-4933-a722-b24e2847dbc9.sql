
-- Create file_type enum
CREATE TYPE public.ingestion_file_type AS ENUM ('pdf', 'docx', 'doc', 'txt', 'audio', 'image', 'other');

-- Create ingestion status enum
CREATE TYPE public.ingestion_status AS ENUM ('pending', 'processing', 'completed', 'error');

-- Create knowledge_base_content table
CREATE TABLE public.knowledge_base_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'case-documents',
  file_name TEXT NOT NULL DEFAULT '',
  raw_text TEXT,
  file_type public.ingestion_file_type NOT NULL DEFAULT 'other',
  status public.ingestion_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  char_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (bucket, file_path)
);

-- Enable RLS
ALTER TABLE public.knowledge_base_content ENABLE ROW LEVEL SECURITY;

-- Admin-only read policy
CREATE POLICY "Admins can read all ingestion content"
  ON public.knowledge_base_content
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin-only insert/update
CREATE POLICY "Admins can manage ingestion content"
  ON public.knowledge_base_content
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage (for edge functions)
CREATE POLICY "Service role full access to ingestion content"
  ON public.knowledge_base_content
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER update_knowledge_base_content_updated_at
  BEFORE UPDATE ON public.knowledge_base_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for status lookups
CREATE INDEX idx_kbc_status ON public.knowledge_base_content (status);
CREATE INDEX idx_kbc_bucket_path ON public.knowledge_base_content (bucket, file_path);

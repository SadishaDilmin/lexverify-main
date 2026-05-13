CREATE TABLE public.claude_pack_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  generated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_count INTEGER NOT NULL,
  total_bytes BIGINT NOT NULL,
  manifest JSONB NOT NULL
);

ALTER TABLE public.claude_pack_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pack generations"
  ON public.claude_pack_generations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pack generations"
  ON public.claude_pack_generations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND generated_by = auth.uid()
  );

CREATE INDEX idx_claude_pack_generations_generated_at
  ON public.claude_pack_generations (generated_at DESC);
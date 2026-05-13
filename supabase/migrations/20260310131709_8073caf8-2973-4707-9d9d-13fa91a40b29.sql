
-- Create prompt_defaults table for DB-backed base prompts
CREATE TABLE public.prompt_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text UNIQUE NOT NULL,
  base_prompt_text text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prompt_defaults ENABLE ROW LEVEL SECURITY;

-- Admin-only read
CREATE POLICY "Admins can manage prompt_defaults"
  ON public.prompt_defaults
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role needs access from edge functions
CREATE POLICY "Service role full access on prompt_defaults"
  ON public.prompt_defaults
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update trigger
CREATE TRIGGER update_prompt_defaults_updated_at
  BEFORE UPDATE ON public.prompt_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

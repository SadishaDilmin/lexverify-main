
-- H7 Fix: System logs table for telemetry
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  user_agent TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow authenticated users to insert (fire-and-forget from client)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert logs"
  ON public.system_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read logs"
  ON public.system_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- H8 Fix: DB-level sanitization trigger for profiles.position
CREATE OR REPLACE FUNCTION public.sanitize_profile_position()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  -- Strip HTML tags at database level as defense-in-depth
  NEW.position := regexp_replace(NEW.position, '<[^>]*>', '', 'g');
  -- Enforce max length
  NEW.position := left(NEW.position, 200);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sanitize_profile_position
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_profile_position();

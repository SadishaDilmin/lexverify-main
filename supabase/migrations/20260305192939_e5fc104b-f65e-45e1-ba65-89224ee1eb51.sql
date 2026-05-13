CREATE TABLE public.profile_intelligence_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  person_name text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);
ALTER TABLE public.profile_intelligence_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to profile_intelligence_cache" ON public.profile_intelligence_cache FOR ALL USING (false) WITH CHECK (false);

-- Cache table for lender handbook scrapes
CREATE TABLE public.lender_handbook_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_key text NOT NULL UNIQUE,
  lender_name text NOT NULL,
  handbook_markdown text NOT NULL DEFAULT '',
  handbook_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  char_count integer NOT NULL DEFAULT 0,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days')
);

-- Index for fast lookup
CREATE INDEX idx_lender_handbook_cache_key ON public.lender_handbook_cache (lender_key);

-- RLS: only service role should access this (edge functions use service role key)
ALTER TABLE public.lender_handbook_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (for transparency panel)
CREATE POLICY "Authenticated users can view handbook cache"
  ON public.lender_handbook_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No insert/update/delete from client — only service role (edge functions)

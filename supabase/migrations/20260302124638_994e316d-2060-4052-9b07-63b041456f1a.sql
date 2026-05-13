
CREATE TABLE public.glossary_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('search', 'click', 'pageview')),
  term_slug text,
  search_query text,
  results_count integer,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glossary_analytics_event ON public.glossary_analytics(event_type);
CREATE INDEX idx_glossary_analytics_term ON public.glossary_analytics(term_slug);
CREATE INDEX idx_glossary_analytics_created ON public.glossary_analytics(created_at);
CREATE INDEX idx_glossary_analytics_session ON public.glossary_analytics(session_id);

ALTER TABLE public.glossary_analytics ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events (public page, no auth required)
CREATE POLICY "Anyone can insert glossary analytics"
  ON public.glossary_analytics FOR INSERT
  WITH CHECK (true);

-- Only admins can read analytics
CREATE POLICY "Admins can view glossary analytics"
  ON public.glossary_analytics FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No updates or deletes
CREATE POLICY "Deny update on glossary_analytics"
  ON public.glossary_analytics FOR UPDATE
  USING (false);

CREATE POLICY "Deny delete on glossary_analytics"
  ON public.glossary_analytics FOR DELETE
  USING (false);

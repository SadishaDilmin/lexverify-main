DROP POLICY "Anyone can insert glossary analytics" ON public.glossary_analytics;

CREATE POLICY "Anyone can insert glossary analytics with validation"
ON public.glossary_analytics FOR INSERT
WITH CHECK (
  event_type <> '' AND
  session_id <> '' AND
  length(event_type) <= 50 AND
  length(session_id) <= 100 AND
  length(COALESCE(term_slug, '')) <= 200 AND
  length(COALESCE(search_query, '')) <= 500
);
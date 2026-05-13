
CREATE TABLE public.fatf_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  black_list text[] NOT NULL DEFAULT '{}',
  grey_list text[] NOT NULL DEFAULT '{}',
  publication_date text NOT NULL,
  source_url text NOT NULL DEFAULT 'https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html',
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  refresh_source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fatf_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.fatf_lists
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role all" ON public.fatf_lists
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed with current Feb 2026 list so the system works immediately
INSERT INTO public.fatf_lists (black_list, grey_list, publication_date, refresh_source)
VALUES (
  ARRAY['North Korea', 'Iran', 'Myanmar'],
  ARRAY['Algeria', 'Angola', 'Bolivia', 'Bulgaria', 'Cameroon', 'Côte d''Ivoire', 'Democratic Republic of Congo', 'Haiti', 'Kenya', 'Kuwait', 'Lao People''s Democratic Republic', 'Lebanon', 'Monaco', 'Namibia', 'Nepal', 'Papua New Guinea', 'South Sudan', 'Syria', 'Venezuela', 'Vietnam', 'British Virgin Islands', 'Yemen'],
  '13 February 2026',
  'seed'
);

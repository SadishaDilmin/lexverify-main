ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS section_compliance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_reports_section_compliance
  ON public.ai_reports USING gin (section_compliance);
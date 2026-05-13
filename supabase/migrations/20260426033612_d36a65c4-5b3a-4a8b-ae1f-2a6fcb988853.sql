ALTER TABLE public.enquiry_items
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_finding_id uuid,
  ADD COLUMN IF NOT EXISTS source_resolution_id uuid;

UPDATE public.enquiry_items
SET source = 'draft_email'
WHERE source IS NULL;

ALTER TABLE public.enquiry_items
  ADD CONSTRAINT enquiry_items_source_check
  CHECK (source IS NULL OR source = ANY (ARRAY['draft_email','promoted_finding','reply_ingest','manual']));

CREATE INDEX IF NOT EXISTS idx_enquiry_items_finding
  ON public.enquiry_items (case_id, agent_type, source_finding_id)
  WHERE source_finding_id IS NOT NULL;
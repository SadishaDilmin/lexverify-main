-- Add reply-to-enquiry mapping columns to enquiry_reply_documents
ALTER TABLE public.enquiry_reply_documents
  ADD COLUMN IF NOT EXISTS ai_proposed_enquiry_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS ai_confidence jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_enquiry_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS auto_note text,
  ADD COLUMN IF NOT EXISTS affected_sections text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS mapping_source text;

-- Constrain mapping_source values
ALTER TABLE public.enquiry_reply_documents
  DROP CONSTRAINT IF EXISTS enquiry_reply_documents_mapping_source_check;

ALTER TABLE public.enquiry_reply_documents
  ADD CONSTRAINT enquiry_reply_documents_mapping_source_check
  CHECK (mapping_source IS NULL OR mapping_source IN ('ai_auto_accepted', 'ai_user_corrected', 'user_added', 'general_reply', 'prescan_failed'));

-- Helpful index for case-level lookups by round
CREATE INDEX IF NOT EXISTS idx_enquiry_reply_documents_case_round
  ON public.enquiry_reply_documents (case_id, agent_type, round_number);
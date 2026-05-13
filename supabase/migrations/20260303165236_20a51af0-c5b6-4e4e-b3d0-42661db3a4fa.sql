
-- Add risk scoring and hallucination safeguard columns to draft_review_results
ALTER TABLE public.draft_review_results
  ADD COLUMN IF NOT EXISTS risk_score_summary jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hallucination_statement text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overall_risk_rating text DEFAULT NULL;

-- Add user declaration tracking to draft_reviews
ALTER TABLE public.draft_reviews
  ADD COLUMN IF NOT EXISTS user_declaration_accepted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS user_declaration_accepted_by text DEFAULT NULL;

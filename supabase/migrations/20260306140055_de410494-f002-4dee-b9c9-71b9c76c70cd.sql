ALTER TABLE public.agent_feedback
ADD COLUMN review_status text DEFAULT NULL,
ADD COLUMN review_reason text DEFAULT NULL,
ADD COLUMN reviewed_at timestamptz DEFAULT NULL,
ADD COLUMN reviewed_by uuid DEFAULT NULL;
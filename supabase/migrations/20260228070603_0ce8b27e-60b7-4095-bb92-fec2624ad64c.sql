
-- Feedback records table
CREATE TABLE public.agent_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id),
  case_reference text NOT NULL,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  user_email text NOT NULL,
  user_position text NOT NULL DEFAULT '',
  agent_version text NOT NULL DEFAULT 'LexSentinel v1.0',
  mode text NOT NULL CHECK (mode IN ('query', 'omission')),
  feedback_type text CHECK (feedback_type IN ('omission', 'overreach', 'hallucination', 'drafting_quality', 'workflow_improvement')),
  user_message text NOT NULL,
  agent_response text,
  evidence_references text,
  agent_assessment text CHECK (agent_assessment IN ('valid', 'partially_valid', 'not_supported')),
  severity text CHECK (severity IN ('critical', 'major', 'minor')),
  proposed_correction text,
  is_enhancement_candidate boolean NOT NULL DEFAULT false,
  enhancement_summary text,
  enhancement_id uuid,
  logged_as_feedback boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert feedback for their cases
CREATE POLICY "Users can insert feedback for their cases"
ON public.agent_feedback FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM cases
    WHERE cases.id = agent_feedback.case_id
    AND (cases.fee_earner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

-- Users can view feedback for their cases
CREATE POLICY "Users can view their own feedback"
ON public.agent_feedback FOR SELECT
USING (
  user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)
);

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
ON public.agent_feedback FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- No update or delete
CREATE POLICY "Deny update on agent_feedback"
ON public.agent_feedback FOR UPDATE
USING (false);

CREATE POLICY "Deny delete on agent_feedback"
ON public.agent_feedback FOR DELETE
USING (false);

-- Enhancement backlog table
CREATE TABLE public.enhancement_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('prompt', 'knowledge_base', 'ui', 'workflow', 'risk_scoring', 'document_intake', 'lender_handbook')),
  problem_statement text NOT NULL,
  feedback_ids uuid[] NOT NULL DEFAULT '{}',
  proposed_change text NOT NULL,
  acceptance_criteria text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
  risk_rationale text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enhancement_backlog ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view enhancements
CREATE POLICY "Authenticated users can view enhancements"
ON public.enhancement_backlog FOR SELECT
USING (auth.uid() IS NOT NULL);

-- System/admins can insert enhancements
CREATE POLICY "Users can insert enhancements"
ON public.enhancement_backlog FOR INSERT
WITH CHECK (created_by = auth.uid());

-- Admins can update enhancements
CREATE POLICY "Admins can update enhancements"
ON public.enhancement_backlog FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- No delete
CREATE POLICY "Deny delete on enhancement_backlog"
ON public.enhancement_backlog FOR DELETE
USING (false);

-- Admin settings for feedback module
CREATE TABLE public.feedback_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_mode_a boolean NOT NULL DEFAULT false,
  require_evidence_mode_b boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.feedback_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view settings"
ON public.feedback_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update settings"
ON public.feedback_settings FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert settings"
ON public.feedback_settings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.feedback_settings (log_mode_a, require_evidence_mode_b) VALUES (false, true);

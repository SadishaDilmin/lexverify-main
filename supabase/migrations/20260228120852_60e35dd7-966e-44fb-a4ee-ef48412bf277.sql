
-- Support escalations table for chatbot email escalations
CREATE TABLE public.support_escalations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID
);

ALTER TABLE public.support_escalations ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can create escalations
CREATE POLICY "Anyone can create support escalations"
  ON public.support_escalations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND length(summary) <= 5000
    AND status = 'pending'
  );

-- Allow anonymous escalations too
CREATE POLICY "Anonymous can create support escalations"
  ON public.support_escalations FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND length(summary) <= 5000
    AND status = 'pending'
  );

-- Users can view their own escalations
CREATE POLICY "Users can view own escalations"
  ON public.support_escalations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can view and update all
CREATE POLICY "Admins can view all escalations"
  ON public.support_escalations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update escalations"
  ON public.support_escalations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- No deletes
CREATE POLICY "Deny delete on support_escalations"
  ON public.support_escalations FOR DELETE TO authenticated
  USING (false);

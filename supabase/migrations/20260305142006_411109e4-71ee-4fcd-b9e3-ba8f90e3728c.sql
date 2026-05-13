
-- Drop the blanket deny-update policy
DROP POLICY "Deny update on agent_feedback" ON public.agent_feedback;

-- Allow admins to update agent_feedback records
CREATE POLICY "Admins can update agent_feedback"
ON public.agent_feedback
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

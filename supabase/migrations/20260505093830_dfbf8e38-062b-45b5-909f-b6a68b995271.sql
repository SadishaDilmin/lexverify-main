
-- Fix 1: review_audit_trail — restrict SELECT to admins only (contains reviewer PII across all cases)
DROP POLICY IF EXISTS "Authenticated users can view review audit trail" ON public.review_audit_trail;

CREATE POLICY "Admins can view review audit trail"
ON public.review_audit_trail
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: validation_traces — restrict service-role policy to service_role only (was {public})
DROP POLICY IF EXISTS "Service role manages validation traces" ON public.validation_traces;

CREATE POLICY "Service role manages validation traces"
ON public.validation_traces
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

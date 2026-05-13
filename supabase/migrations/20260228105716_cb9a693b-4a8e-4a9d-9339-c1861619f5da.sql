
-- Add authentication baseline to public submission tables.
-- These already have admin-only SELECT policies; this adds unauthenticated denial.
CREATE POLICY "Require authentication for select" ON public.access_requests
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.agent_interest
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

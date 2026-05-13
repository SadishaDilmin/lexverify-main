
-- Deny anonymous (unauthenticated) SELECT on sensitive tables
-- These are defence-in-depth policies complementing existing restrictive RLS

CREATE POLICY "Deny anonymous select on profiles"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Deny anonymous select on cases"
ON public.cases FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Deny anonymous select on access_requests"
ON public.access_requests FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Deny anonymous select on free_trial_requests"
ON public.free_trial_requests FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Deny anonymous select on agent_interest"
ON public.agent_interest FOR SELECT
USING (auth.uid() IS NOT NULL);

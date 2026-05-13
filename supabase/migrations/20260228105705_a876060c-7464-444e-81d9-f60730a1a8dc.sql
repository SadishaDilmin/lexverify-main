
-- Re-add PERMISSIVE authentication baseline policies on all tables.
-- These ensure unauthenticated users cannot access any data,
-- while the existing ownership/admin policies further restrict to correct rows.

CREATE POLICY "Require authentication for select" ON public.profiles
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.cases
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.audit_log
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.user_roles
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.ai_reports
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.documents
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.qa_results
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.risk_scores
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.agent_feedback
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.enhancement_backlog
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Require authentication for select" ON public.feedback_settings
  AS PERMISSIVE FOR SELECT USING (auth.uid() IS NOT NULL);

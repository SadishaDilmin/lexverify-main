-- Add explicit auth-required SELECT policies on all tables (defence-in-depth)
-- These are RESTRICTIVE so they stack with existing policies

CREATE POLICY "Require auth for select" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.cases FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.audit_log FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.ai_reports FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.qa_results FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.risk_scores FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require auth for select" ON public.user_roles FOR SELECT USING (auth.uid() IS NOT NULL);
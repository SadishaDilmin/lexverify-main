-- Explicitly deny UPDATE and DELETE on audit_log
CREATE POLICY "Deny update on audit_log" ON public.audit_log FOR UPDATE USING (false);
CREATE POLICY "Deny delete on audit_log" ON public.audit_log FOR DELETE USING (false);

-- Explicitly deny UPDATE and DELETE on qa_results
CREATE POLICY "Deny update on qa_results" ON public.qa_results FOR UPDATE USING (false);
CREATE POLICY "Deny delete on qa_results" ON public.qa_results FOR DELETE USING (false);

-- Explicitly deny UPDATE and DELETE on risk_scores
CREATE POLICY "Deny update on risk_scores" ON public.risk_scores FOR UPDATE USING (false);
CREATE POLICY "Deny delete on risk_scores" ON public.risk_scores FOR DELETE USING (false);

-- Explicitly deny UPDATE and DELETE on ai_reports
CREATE POLICY "Deny update on ai_reports" ON public.ai_reports FOR UPDATE USING (false);
CREATE POLICY "Deny delete on ai_reports" ON public.ai_reports FOR DELETE USING (false);
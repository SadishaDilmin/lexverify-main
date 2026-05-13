
DROP POLICY "Service role full access on prompt_defaults" ON public.prompt_defaults;
DROP POLICY "Service role full access on regulatory_audit_findings" ON public.regulatory_audit_findings;
DROP POLICY "Authenticated users can insert logs" ON public.system_logs;
CREATE POLICY "Authenticated users can insert own logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL)

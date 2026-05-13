
-- Add audit columns to ai_reports (idempotent)
ALTER TABLE public.ai_reports 
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS modified_by UUID,
  ADD COLUMN IF NOT EXISTS modification_count INTEGER DEFAULT 0;

-- Create trigger function to log modifications to audit_log and track on the row
CREATE OR REPLACE FUNCTION public.log_ai_report_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_case_ref TEXT;
BEGIN
  NEW.modified_at = now();
  NEW.modified_by = auth.uid();
  NEW.modification_count = COALESCE(OLD.modification_count, 0) + 1;

  SELECT case_reference INTO v_case_ref FROM public.cases WHERE id = NEW.case_id;

  INSERT INTO public.audit_log (case_reference, user_id, user_name, user_email, user_position, event_type, metadata)
  SELECT 
    v_case_ref,
    auth.uid(),
    p.full_name,
    p.email,
    p.position,
    'ai_report_modified',
    jsonb_build_object(
      'ai_report_id', NEW.id,
      'ai_run_id', NEW.ai_run_id,
      'version', NEW.version,
      'modification_count', NEW.modification_count,
      'fields_modified', (
        SELECT jsonb_agg(field) FROM (
          SELECT 'internal_report' AS field WHERE OLD.internal_report IS DISTINCT FROM NEW.internal_report
          UNION ALL
          SELECT 'client_report' WHERE OLD.client_report IS DISTINCT FROM NEW.client_report
          UNION ALL
          SELECT 'draft_email' WHERE OLD.draft_email IS DISTINCT FROM NEW.draft_email
        ) changed
      )
    )
  FROM public.profiles p WHERE p.user_id = auth.uid();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS ai_report_modification_audit ON public.ai_reports;
CREATE TRIGGER ai_report_modification_audit
  BEFORE UPDATE ON public.ai_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ai_report_modification();

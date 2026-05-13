-- Add coverage_report sidecar to ai_reports so the deterministic draft-email
-- coverage gate (judge rule #22 enforcement) can persist its findings.
ALTER TABLE public.ai_reports
  ADD COLUMN IF NOT EXISTS coverage_report jsonb;

COMMENT ON COLUMN public.ai_reports.coverage_report IS
  'Deterministic draft-email coverage report. Lists material issues from the internal report, which were covered by the draft email, and which were not. When the gate trips, finalisation_status is set to ''coverage_gap''.';

-- Note: finalisation_status is a free-text column with no CHECK constraint,
-- so the new value ''coverage_gap'' requires no schema change. The two
-- consumers that read this column (EnquiryTrackerPanel, EditableReportTab)
-- treat unknown values as non-ready, which is the safe default.
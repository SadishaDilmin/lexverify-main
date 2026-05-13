
-- Add SRA digital signature columns to benchmark_cases
ALTER TABLE public.benchmark_cases 
  ADD COLUMN IF NOT EXISTS sra_solicitor_name text,
  ADD COLUMN IF NOT EXISTS sra_id_number text;

-- Add SRA digital signature columns to regulatory_audit_findings
ALTER TABLE public.regulatory_audit_findings 
  ADD COLUMN IF NOT EXISTS sra_solicitor_name text,
  ADD COLUMN IF NOT EXISTS sra_id_number text,
  ADD COLUMN IF NOT EXISTS filed_at timestamptz;

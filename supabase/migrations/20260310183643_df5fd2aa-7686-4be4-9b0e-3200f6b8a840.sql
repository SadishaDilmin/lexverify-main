
ALTER TABLE public.regulatory_audit_findings
ADD CONSTRAINT uq_regulatory_audit_file UNIQUE (file_path, bucket);

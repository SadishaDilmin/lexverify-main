-- Findings are identified by deterministic content hashes (e.g. SHA-256), not UUIDs.
-- Resolutions are stored inside ai_reports JSON and use crypto.randomUUID() but for
-- consistency we relax to text so future ID schemes don't break inserts.

ALTER TABLE public.enquiry_items
  ALTER COLUMN source_finding_id TYPE text USING source_finding_id::text,
  ALTER COLUMN source_resolution_id TYPE text USING source_resolution_id::text;

-- Index was created on (case_id, agent_type, source_finding_id) — recreate it
-- so it picks up the new column type cleanly.
DROP INDEX IF EXISTS public.idx_enquiry_items_finding;
CREATE INDEX idx_enquiry_items_finding
  ON public.enquiry_items (case_id, agent_type, source_finding_id)
  WHERE source_finding_id IS NOT NULL;
-- Cleanup: strip internal ai-merge HTML comment markers and backfill evidence_required
-- Source of these defects:
--   1. sow-finding-resolution wrote draftedText (containing <!-- ai-merge: ... --> headers)
--      straight into enquiry_items.original_enquiry_text and evidence_required.
--   2. The draft-email parser left ai-merge marker lines in the body when seeding.
--   3. Several seeding paths allowed evidence_required to remain NULL.
-- Both source paths have been hardened in this same change. This migration cleans
-- existing rows so all open cases stop showing leaked codes / missing blocks.

-- 1) Strip every <!-- ai-merge: ... --> comment from text columns we display.
UPDATE public.enquiry_items
SET
  original_enquiry_text = regexp_replace(original_enquiry_text, '<!--\s*ai-merge:[^>]*-->', '', 'gi'),
  evidence_required     = regexp_replace(evidence_required,     '<!--\s*ai-merge:[^>]*-->', '', 'gi'),
  issue_summary         = regexp_replace(issue_summary,         '<!--\s*ai-merge:[^>]*-->', '', 'gi'),
  date_last_updated     = now()
WHERE
     original_enquiry_text ~* 'ai-merge'
  OR evidence_required     ~* 'ai-merge'
  OR issue_summary         ~* 'ai-merge';

-- 2) Tidy whitespace left by the marker removal so the UI doesn't show empty
--    leading/trailing newlines.
UPDATE public.enquiry_items
SET
  original_enquiry_text = btrim(regexp_replace(original_enquiry_text, '\n{3,}', E'\n\n', 'g')),
  evidence_required     = NULLIF(btrim(regexp_replace(coalesce(evidence_required,''), '\n{3,}', E'\n\n', 'g')), ''),
  issue_summary         = btrim(issue_summary),
  date_last_updated     = now()
WHERE
     original_enquiry_text ~ '\n{3,}|^\s|\s$'
  OR (evidence_required IS NOT NULL AND (evidence_required ~ '\n{3,}|^\s|\s$'))
  OR issue_summary ~ '^\s|\s$';

-- 3) Backfill evidence_required when it is NULL or empty so the tracker UI
--    consistently renders the "Evidence Required" block for every enquiry.
--    Use issue_summary as the proportionate, human-readable fallback.
UPDATE public.enquiry_items
SET
  evidence_required = issue_summary,
  date_last_updated = now()
WHERE coalesce(btrim(evidence_required), '') = ''
  AND coalesce(btrim(issue_summary), '') <> '';

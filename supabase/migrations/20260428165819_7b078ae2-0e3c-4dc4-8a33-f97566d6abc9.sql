-- Quarantine contaminated AI-drafted resolutions on case cdb9cabe-126c-46e9-bb92-58f2b8ef3aab.
-- These resolutions contained transaction details ("NKEM STEWART", specific amounts, dates)
-- that were never present in this case's evidence (sow_transactions, armalytix_reports,
-- extracted_entities). The values were hallucinated by the model; the cite-or-quarantine
-- validator now rejects this class of output, but historical rows must be cleaned manually.

-- 1. Mark each affected resolution with a quarantine record so the audit trail is preserved.
UPDATE public.ai_reports
SET section_compliance = jsonb_set(
  section_compliance,
  '{resolutions}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN r->>'id' IN (
          'bdb58bf6-7049-4d36-bc51-6e6be2626e1c',
          '4c4bd56b-d28b-480c-b2d8-0d2f95939a1a',
          '522f3a16-0d61-4900-8308-770db6f6952f'
        )
        THEN jsonb_set(
          r,
          '{ai_output}',
          jsonb_build_object(
            'added_enquiry', '',
            'report_amendment', '',
            'decision_log_entry', 'Quarantined post-hoc: this AI draft contained client and transaction details that did not match this case''s evidence and have been removed for confidentiality.',
            'quarantine', jsonb_build_object(
              'status', 'ungrounded_output_post_hoc',
              'reason', 'Names, dates and amounts in the original draft were not present in this case''s evidence corpus.',
              'quarantined_at', now(),
              'quarantined_by', 'system_cleanup_2026_04_28',
              'original_ai_output', r->'ai_output'
            )
          )
        )
        ELSE r
      END
    )
    FROM jsonb_array_elements(section_compliance->'resolutions') r
  )
)
WHERE id = 'fd9c00fe-9cdd-4f21-abbf-0f242a5db36b';

-- 2. Scrub the merged ungrounded block from draft_email by removing the
--    ai-merge marker block that introduced the fabricated NKEM credits.
UPDATE public.ai_reports
SET draft_email = regexp_replace(
  draft_email,
  '<!--\s*ai-merge:\s*enquiry-for=c22382df6850c0f756e454cef872ba2f3c90d30626641315e9c9870201725ffa[\s\S]*?(?=<!--\s*ai-merge:|$)',
  E'<!-- ai-merge: enquiry-for=c22382df6850c0f756e454cef872ba2f3c90d30626641315e9c9870201725ffa quarantined=true -->\n[QUARANTINED — this enquiry block was removed because it contained client and transaction details that did not match this case''s evidence. Please request fresh AI assistance after additional bank statement evidence has been ingested.]\n\n',
  'g'
)
WHERE id = 'fd9c00fe-9cdd-4f21-abbf-0f242a5db36b'
  AND draft_email IS NOT NULL
  AND draft_email LIKE '%NKEM%';

-- 3. Same scrub for internal_report and client_report on the same row, in case
--    the addendum was also written there.
UPDATE public.ai_reports
SET internal_report = regexp_replace(
  internal_report,
  '<!--\s*ai-merge:\s*finding=c22382df6850c0f756e454cef872ba2f3c90d30626641315e9c9870201725ffa[\s\S]*?(?=<!--\s*ai-merge:|$)',
  E'<!-- ai-merge: finding=c22382df6850c0f756e454cef872ba2f3c90d30626641315e9c9870201725ffa quarantined=true -->\n[QUARANTINED — addendum removed (ungrounded against case evidence).]\n\n',
  'g'
)
WHERE id = 'fd9c00fe-9cdd-4f21-abbf-0f242a5db36b'
  AND internal_report IS NOT NULL
  AND internal_report LIKE '%NKEM%';

UPDATE public.ai_reports
SET client_report = regexp_replace(
  client_report,
  '<!--\s*ai-merge:\s*finding=c22382df6850c0f756e454cef872ba2f3c90d30626641315e9c9870201725ffa[\s\S]*?(?=<!--\s*ai-merge:|$)',
  E'<!-- ai-merge: finding=c22382df6850c0f756e454cef872ba2f3c90d30626641315e9c9870201725ffa quarantined=true -->\n[QUARANTINED — addendum removed (ungrounded against case evidence).]\n\n',
  'g'
)
WHERE id = 'fd9c00fe-9cdd-4f21-abbf-0f242a5db36b'
  AND client_report IS NOT NULL
  AND client_report LIKE '%NKEM%';

-- 4. Withdraw any enquiry_items the merged ungrounded draft created.
UPDATE public.enquiry_items
SET status = 'not_applicable',
    date_last_updated = now(),
    issue_summary = '[QUARANTINED] ' || coalesce(issue_summary, '')
WHERE case_id = 'cdb9cabe-126c-46e9-bb92-58f2b8ef3aab'
  AND agent_type = 'sow'
  AND source_resolution_id IN (
    'bdb58bf6-7049-4d36-bc51-6e6be2626e1c',
    '4c4bd56b-d28b-480c-b2d8-0d2f95939a1a',
    '522f3a16-0d61-4900-8308-770db6f6952f'
  )
  AND status NOT IN ('not_applicable', 'closed');

-- 5. Audit-log the cleanup.
INSERT INTO public.audit_log (case_reference, user_id, user_name, user_email, user_position, event_type, metadata)
SELECT
  c.case_reference,
  NULL::uuid,
  'system',
  'system@lexverify',
  'automated cleanup',
  'ungrounded_output_quarantined',
  jsonb_build_object(
    'ai_report_id', 'fd9c00fe-9cdd-4f21-abbf-0f242a5db36b',
    'case_id', 'cdb9cabe-126c-46e9-bb92-58f2b8ef3aab',
    'resolutions_quarantined', jsonb_build_array(
      'bdb58bf6-7049-4d36-bc51-6e6be2626e1c',
      '4c4bd56b-d28b-480c-b2d8-0d2f95939a1a',
      '522f3a16-0d61-4900-8308-770db6f6952f'
    ),
    'reason', 'AI draft contained names/amounts/dates not present in case evidence; data isolation safeguard applied.'
  )
FROM public.cases c
WHERE c.id = 'cdb9cabe-126c-46e9-bb92-58f2b8ef3aab';
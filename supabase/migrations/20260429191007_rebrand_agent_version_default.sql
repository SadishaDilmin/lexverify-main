-- Rebrand: update agent_version default from 'LexSentinel v1.0' to 'Olimey AI v1.1'.
-- Existing rows are unchanged (this is an append-only audit table — no UPDATE).
-- New feedback rows will carry the Olimey AI version string going forward.
ALTER TABLE public.agent_feedback
  ALTER COLUMN agent_version SET DEFAULT 'Olimey AI v1.1';

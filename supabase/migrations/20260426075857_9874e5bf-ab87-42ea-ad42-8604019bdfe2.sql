-- PHASE 3: hoowla_last_sync_at supports the SDLT divergence audit log so MLRO
-- can see when the CMS value was last refreshed at the moment of divergence.
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS hoowla_last_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cases.hoowla_last_sync_at IS
  'Timestamp of last successful Hoowla CMS sync for this case. Set by sync-hoowla edge function. NULL means the case has never been synced from CMS (or pre-dates the field). Used by PHASE 3 SDLT divergence audit log.';
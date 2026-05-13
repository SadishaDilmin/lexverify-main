ALTER TABLE public.exchange_guard_results
ADD COLUMN IF NOT EXISTS transaction_kill_probability integer,
ADD COLUMN IF NOT EXISTS exchange_readiness text,
ADD COLUMN IF NOT EXISTS cross_document_inconsistencies jsonb;
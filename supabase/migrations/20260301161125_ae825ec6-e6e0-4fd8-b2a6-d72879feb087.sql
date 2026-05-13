-- Add financial fields to cases (for cross-agent prefill)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS stamp_duty numeric,
  ADD COLUMN IF NOT EXISTS legal_fees numeric;

-- Parties linked to a case (purchasers / sellers / giftors)
CREATE TABLE IF NOT EXISTS public.case_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  role text NOT NULL,
  full_name text NOT NULL,
  email text,
  pep_status text NOT NULL DEFAULT 'unknown',
  relationship_to_purchaser text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Role + PEP status constraints (immutable-safe)
DO $$ BEGIN
  ALTER TABLE public.case_parties
    ADD CONSTRAINT case_parties_role_check
    CHECK (role IN ('purchaser','seller','giftor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.case_parties
    ADD CONSTRAINT case_parties_pep_status_check
    CHECK (pep_status IN ('unknown','not_pep','pep','pep_family','pep_associate'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_case_parties_case_id ON public.case_parties(case_id);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_case_parties_updated_at ON public.case_parties;
CREATE TRIGGER update_case_parties_updated_at
BEFORE UPDATE ON public.case_parties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.case_parties ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view parties for their cases" ON public.case_parties;
CREATE POLICY "Users can view parties for their cases"
ON public.case_parties
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = case_parties.case_id
      AND (c.conveyancer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Users can insert parties for their cases" ON public.case_parties;
CREATE POLICY "Users can insert parties for their cases"
ON public.case_parties
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = case_parties.case_id
      AND (c.conveyancer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Users can update parties for their cases" ON public.case_parties;
CREATE POLICY "Users can update parties for their cases"
ON public.case_parties
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = case_parties.case_id
      AND (c.conveyancer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = case_parties.case_id
      AND (c.conveyancer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Users can delete parties for their cases" ON public.case_parties;
CREATE POLICY "Users can delete parties for their cases"
ON public.case_parties
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = case_parties.case_id
      AND (c.conveyancer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

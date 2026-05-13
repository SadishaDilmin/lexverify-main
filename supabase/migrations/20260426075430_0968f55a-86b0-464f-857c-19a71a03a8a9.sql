-- Adds conveyancer-entered SDLT and surcharge flag fields to cases.
-- All four fields are nullable: case can be created without them.
-- The existing cases.stamp_duty column is preserved (now Hoowla-only after PHASE 2/3).

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS sdlt_form_value NUMERIC,
  ADD COLUMN IF NOT EXISTS sdlt_form_additional_property_surcharge BOOLEAN,
  ADD COLUMN IF NOT EXISTS sdlt_form_non_uk_resident_surcharge BOOLEAN,
  ADD COLUMN IF NOT EXISTS sdlt_form_first_time_buyer_relief BOOLEAN;

COMMENT ON COLUMN public.cases.sdlt_form_value IS
  'Conveyancer-entered SDLT total (GBP). Authoritative source per precedence rule when populated. NULL means use cases.stamp_duty (Hoowla) or treat as missing evidence.';
COMMENT ON COLUMN public.cases.sdlt_form_additional_property_surcharge IS
  'Conveyancer-declared additional-property surcharge flag. AML signal: drives undisclosed-property check.';
COMMENT ON COLUMN public.cases.sdlt_form_non_uk_resident_surcharge IS
  'Conveyancer-declared non-UK-resident surcharge flag. AML signal: drives jurisdictional risk check.';
COMMENT ON COLUMN public.cases.sdlt_form_first_time_buyer_relief IS
  'Conveyancer-declared first-time-buyer relief flag. Used for AML risk profiling only.';
-- Fix incorrect agent_type on synthetic benchmark cases that have title-related scenarios
-- Cases with title/leasehold scenarios should be draft-review, not source-of-wealth
UPDATE public.benchmark_cases 
SET agent_type = 'draft-review', updated_at = now()
WHERE source_type = 'synthetic' 
  AND agent_type = 'source-of-wealth'
  AND (
    notes ILIKE '%doubling_ground_rent%'
    OR notes ILIKE '%title_plan_discrepancy%'
    OR notes ILIKE '%missing_landlord%'
    OR notes ILIKE '%unregistered_land%'
    OR notes ILIKE '%landlord_consent%'
    OR notes ILIKE '%restrictive_covenant%'
    OR notes ILIKE '%cladding%'
    OR notes ILIKE '%bsa_compliance%'
    OR notes ILIKE '%lease%'
    OR case_type = 'leasehold_purchase'
  );
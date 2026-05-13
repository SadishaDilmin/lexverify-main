
ALTER TABLE public.free_trial_requests
  ADD COLUMN referral_source text NOT NULL DEFAULT '',
  ADD COLUMN firm_size text NOT NULL DEFAULT '',
  ADD COLUMN current_tools text NOT NULL DEFAULT '',
  ADD COLUMN phone text NOT NULL DEFAULT '';

-- Update the insert policy to include validation for new fields
DROP POLICY IF EXISTS "Anyone can submit free trial request" ON public.free_trial_requests;

CREATE POLICY "Anyone can submit free trial request"
ON public.free_trial_requests FOR INSERT
WITH CHECK (
  full_name <> '' AND
  email <> '' AND
  length(full_name) <= 200 AND
  length(email) <= 255 AND
  length(COALESCE(firm_name, '')) <= 200 AND
  length(COALESCE(position, '')) <= 200 AND
  length(COALESCE(monthly_cases, '')) <= 100 AND
  length(COALESCE(referral_source, '')) <= 200 AND
  length(COALESCE(firm_size, '')) <= 100 AND
  length(COALESCE(current_tools, '')) <= 500 AND
  length(COALESCE(phone, '')) <= 50 AND
  status = 'pending'
);

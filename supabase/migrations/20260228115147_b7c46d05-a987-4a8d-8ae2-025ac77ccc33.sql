
CREATE TABLE public.free_trial_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  firm_name text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  monthly_cases text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

ALTER TABLE public.free_trial_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a free trial request (with validation)
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
  status = 'pending'
);

-- Admins can view all requests
CREATE POLICY "Admins can view free trial requests"
ON public.free_trial_requests FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update requests
CREATE POLICY "Admins can update free trial requests"
ON public.free_trial_requests FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

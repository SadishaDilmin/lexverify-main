
-- Access requests table for self-service registration
CREATE TABLE public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  position text NOT NULL,
  team text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage access requests
CREATE POLICY "Admins can view access requests"
  ON public.access_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update access requests"
  ON public.access_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can submit an access request (no auth required)
CREATE POLICY "Anyone can submit access requests"
  ON public.access_requests FOR INSERT
  WITH CHECK (true);

-- Allow admins to update profiles (for activation/deactivation)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

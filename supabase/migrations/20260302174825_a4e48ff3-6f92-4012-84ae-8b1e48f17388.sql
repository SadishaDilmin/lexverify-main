
-- Table for users to request CMS integration for their firm
CREATE TABLE public.cms_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  user_name text NOT NULL,
  firm_name text NOT NULL,
  provider text NOT NULL DEFAULT 'hoowla',
  message text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_access_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
CREATE POLICY "Users can submit CMS access requests"
  ON public.cms_access_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can view their own requests
CREATE POLICY "Users can view own CMS access requests"
  ON public.cms_access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all
CREATE POLICY "Admins can view all CMS access requests"
  ON public.cms_access_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update (review)
CREATE POLICY "Admins can update CMS access requests"
  ON public.cms_access_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

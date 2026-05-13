
-- Table of approved email domains (e.g. jones-partners.co.uk)
CREATE TABLE public.approved_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  firm_name text NOT NULL DEFAULT '',
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approved_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage approved domains"
  ON public.approved_domains FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view approved domains"
  ON public.approved_domains FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Update handle_new_user to set active=false when domain is not in approved_domains
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_is_approved boolean;
BEGIN
  -- Extract domain from email
  v_domain := lower(split_part(NEW.email, '@', 2));

  -- Check if domain is in approved list
  SELECT EXISTS (
    SELECT 1 FROM public.approved_domains WHERE domain = v_domain
  ) INTO v_is_approved;

  INSERT INTO public.profiles (user_id, full_name, email, position, firm_name, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'position', ''),
    COALESCE(NEW.raw_user_meta_data->>'firm_name', ''),
    v_is_approved
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

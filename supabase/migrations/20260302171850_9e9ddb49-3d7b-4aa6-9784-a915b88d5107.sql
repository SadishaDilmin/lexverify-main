
-- CMS integrations table: stores API credentials per firm (admin-managed)
CREATE TABLE public.cms_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'hoowla',
  firm_name text NOT NULL DEFAULT '',
  api_base_url text NOT NULL DEFAULT '',
  api_key_encrypted text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, firm_name)
);

ALTER TABLE public.cms_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_integrations FORCE ROW LEVEL SECURITY;

-- Only admins can manage CMS integrations
CREATE POLICY "Admins can view CMS integrations"
  ON public.cms_integrations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert CMS integrations"
  ON public.cms_integrations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update CMS integrations"
  ON public.cms_integrations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete CMS integrations"
  ON public.cms_integrations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can check if their firm has an active integration (without seeing API keys)
CREATE POLICY "Users can check own firm integration"
  ON public.cms_integrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.firm_name = cms_integrations.firm_name
    )
    AND is_active = true
  );

-- Trigger for updated_at
CREATE TRIGGER cms_integrations_updated_at
  BEFORE UPDATE ON public.cms_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

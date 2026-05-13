
CREATE TABLE public.firm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.firm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage firm_settings"
  ON public.firm_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.firm_settings (setting_key, setting_value)
VALUES ('sra_number', '');

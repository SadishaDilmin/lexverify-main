
CREATE TABLE public.auto_deploy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  min_recall_improvement numeric NOT NULL DEFAULT 0.05,
  min_precision_improvement numeric NOT NULL DEFAULT 0.05,
  require_zero_regressions boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.auto_deploy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto_deploy_settings"
  ON public.auto_deploy_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.auto_deploy_settings (agent_type) VALUES
  ('source-of-wealth'), ('draft-review'), ('exchange-guard');


CREATE TABLE public.fraud_alert_acknowledgements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  result_id UUID NOT NULL,
  user_id UUID NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT DEFAULT '',
  UNIQUE (result_id, user_id)
);

ALTER TABLE public.fraud_alert_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own acknowledgements"
  ON public.fraud_alert_acknowledgements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own acknowledgements"
  ON public.fraud_alert_acknowledgements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own acknowledgements"
  ON public.fraud_alert_acknowledgements FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all acknowledgements"
  ON public.fraud_alert_acknowledgements FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Deny anonymous select"
  ON public.fraud_alert_acknowledgements FOR SELECT
  USING (auth.uid() IS NOT NULL);


CREATE TABLE public.agent_interest (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  firm_name TEXT NOT NULL DEFAULT '',
  agent_type TEXT NOT NULL,
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new'
);

ALTER TABLE public.agent_interest ENABLE ROW LEVEL SECURITY;

-- Anyone can submit interest (public form)
CREATE POLICY "Anyone can submit agent interest"
  ON public.agent_interest
  FOR INSERT
  WITH CHECK (true);

-- Admins can view all submissions
CREATE POLICY "Admins can view agent interest"
  ON public.agent_interest
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update status
CREATE POLICY "Admins can update agent interest"
  ON public.agent_interest
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

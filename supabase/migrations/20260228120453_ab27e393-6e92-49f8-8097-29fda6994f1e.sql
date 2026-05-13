-- Credit balance per user
CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  is_free_trial boolean NOT NULL DEFAULT true,
  trial_credits_granted integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON public.user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all credits"
  ON public.user_credits FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update credits"
  ON public.user_credits FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert credits"
  ON public.user_credits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Transaction ledger
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  transaction_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  case_id uuid REFERENCES public.cases(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON public.credit_transactions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Deny update on credit_transactions"
  ON public.credit_transactions FOR UPDATE
  USING (false);

CREATE POLICY "Deny delete on credit_transactions"
  ON public.credit_transactions FOR DELETE
  USING (false);

-- Auto-provision 100 trial credits for new users
CREATE OR REPLACE FUNCTION public.provision_trial_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance, is_free_trial, trial_credits_granted)
  VALUES (NEW.id, 100, true, 100);
  
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
  VALUES (NEW.id, 100, 100, 'trial_grant', 'Welcome! 100 free trial credits');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_trial_credits();
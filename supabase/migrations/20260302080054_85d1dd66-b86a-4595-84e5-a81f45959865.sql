
-- Referrals table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_full_name text NOT NULL,
  referee_email text NOT NULL,
  referee_firm_name text NOT NULL DEFAULT '',
  referee_phone text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  credits_granted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  credited_at timestamptz
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals FORCE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own referrals"
  ON public.referrals FOR SELECT
  USING (referrer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own referrals"
  ON public.referrals FOR INSERT
  WITH CHECK (
    referrer_id = auth.uid()
    AND referee_full_name <> ''
    AND referee_email <> ''
    AND length(referee_full_name) <= 200
    AND length(referee_email) <= 255
    AND length(COALESCE(referee_firm_name, '')) <= 200
    AND length(COALESCE(referee_phone, '')) <= 50
    AND status = 'pending'
  );

CREATE POLICY "Deny update on referrals"
  ON public.referrals FOR UPDATE
  USING (false);

CREATE POLICY "Deny delete on referrals"
  ON public.referrals FOR DELETE
  USING (false);

-- Function to grant referral credits when a new user signs up
CREATE OR REPLACE FUNCTION public.process_referral_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_referrer_balance INT;
  v_referee_balance INT;
BEGIN
  -- Find a pending referral matching this new user's email
  SELECT * INTO v_referral
  FROM public.referrals
  WHERE referee_email = NEW.email
    AND status = 'pending'
    AND credits_granted = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_referral IS NULL THEN
    RETURN NEW;
  END IF;

  -- Grant 25 credits to referrer
  UPDATE public.user_credits
  SET balance = balance + 25, updated_at = now()
  WHERE user_id = v_referral.referrer_id
  RETURNING balance INTO v_referrer_balance;

  IF v_referrer_balance IS NOT NULL THEN
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (v_referral.referrer_id, 25, v_referrer_balance, 'referral_bonus', 'Referral bonus: ' || NEW.email || ' joined');
  END IF;

  -- Grant 25 credits to referee (new user)
  UPDATE public.user_credits
  SET balance = balance + 25, updated_at = now()
  WHERE user_id = NEW.user_id
  RETURNING balance INTO v_referee_balance;

  IF v_referee_balance IS NOT NULL THEN
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (NEW.user_id, 25, v_referee_balance, 'referral_bonus', 'Welcome bonus: referred by a friend');
  END IF;

  -- Mark referral as credited
  UPDATE public.referrals
  SET status = 'registered', credits_granted = true, credited_at = now()
  WHERE id = v_referral.id;

  RETURN NEW;
END;
$$;

-- Trigger on profiles table (fires after handle_new_user + provision_trial_credits)
CREATE TRIGGER on_profile_created_process_referral
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.process_referral_on_signup();

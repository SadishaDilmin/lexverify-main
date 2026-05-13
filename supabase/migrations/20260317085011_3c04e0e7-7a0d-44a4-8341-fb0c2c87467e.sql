
CREATE OR REPLACE FUNCTION public.deduct_credits_atomic(p_user_id uuid, p_amount integer, p_description text, p_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Security guard: only allow deducting own credits
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Permission denied: can only deduct your own credits';
  END IF;

  -- Lock the row to prevent concurrent deductions
  SELECT balance INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No credit record found');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits', 'balance', v_current_balance);
  END IF;

  v_new_balance := v_current_balance - p_amount;

  UPDATE public.user_credits
  SET balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description, case_id)
  VALUES (p_user_id, -p_amount, v_new_balance, 'usage', p_description, p_case_id);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

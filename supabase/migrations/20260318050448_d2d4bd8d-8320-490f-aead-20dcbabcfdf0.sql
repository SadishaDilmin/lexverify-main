-- Pre-create the vault secret so the function never needs INSERT permission
SELECT vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cms_encryption_key');

-- Rebuild the encrypt function to only READ from vault (no fallback INSERT)
CREATE OR REPLACE FUNCTION public.cms_encrypt_api_key(p_raw_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_passphrase text;
BEGIN
  SELECT decrypted_secret INTO v_passphrase
  FROM vault.decrypted_secrets
  WHERE name = 'cms_encryption_key'
  LIMIT 1;

  IF v_passphrase IS NULL THEN
    RAISE EXCEPTION 'cms_encryption_key not found in vault. Please contact support.';
  END IF;

  RETURN encode(pgp_sym_encrypt(p_raw_key, v_passphrase), 'base64');
END;
$function$;

-- Also fix decrypt
CREATE OR REPLACE FUNCTION public.cms_decrypt_api_key(p_encrypted text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_passphrase text;
BEGIN
  SELECT decrypted_secret INTO v_passphrase
  FROM vault.decrypted_secrets
  WHERE name = 'cms_encryption_key'
  LIMIT 1;

  IF v_passphrase IS NULL THEN
    RAISE EXCEPTION 'cms_encryption_key not found in vault';
  END IF;

  RETURN pgp_sym_decrypt(decode(p_encrypted, 'base64'), v_passphrase);
END;
$function$;
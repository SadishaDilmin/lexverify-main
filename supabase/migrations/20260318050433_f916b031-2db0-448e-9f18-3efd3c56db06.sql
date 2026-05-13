CREATE OR REPLACE FUNCTION public.cms_encrypt_api_key(p_raw_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pgsodium'
AS $function$
DECLARE
  v_passphrase text;
BEGIN
  SELECT decrypted_secret INTO v_passphrase
  FROM vault.decrypted_secrets
  WHERE name = 'cms_encryption_key'
  LIMIT 1;

  IF v_passphrase IS NULL THEN
    v_passphrase := encode(gen_random_bytes(32), 'hex');
    INSERT INTO vault.secrets (name, secret)
    VALUES ('cms_encryption_key', v_passphrase);
  END IF;

  RETURN encode(pgp_sym_encrypt(p_raw_key, v_passphrase), 'base64');
END;
$function$;
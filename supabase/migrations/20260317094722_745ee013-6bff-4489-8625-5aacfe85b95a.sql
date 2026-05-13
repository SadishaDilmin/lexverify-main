
-- Enable pgcrypto if not already
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Revoke SELECT on the api_key_encrypted column from authenticated and anon roles
-- so client-side queries never return the raw key
REVOKE SELECT (api_key_encrypted) ON public.cms_integrations FROM authenticated;
REVOKE SELECT (api_key_encrypted) ON public.cms_integrations FROM anon;

-- Create a function to encrypt/store the API key (uses a DB-level symmetric key)
CREATE OR REPLACE FUNCTION public.cms_encrypt_api_key(p_raw_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_passphrase text;
BEGIN
  SELECT decrypted_secret INTO v_passphrase
  FROM vault.decrypted_secrets
  WHERE name = 'cms_encryption_key'
  LIMIT 1;

  IF v_passphrase IS NULL THEN
    -- Fallback: generate and store a passphrase in vault
    v_passphrase := encode(gen_random_bytes(32), 'hex');
    INSERT INTO vault.secrets (name, secret)
    VALUES ('cms_encryption_key', v_passphrase);
  END IF;

  RETURN encode(pgp_sym_encrypt(p_raw_key, v_passphrase), 'base64');
END;
$$;

-- Create a function to decrypt the API key (for edge functions using service role)
CREATE OR REPLACE FUNCTION public.cms_decrypt_api_key(p_encrypted text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_passphrase text;
BEGIN
  SELECT decrypted_secret INTO v_passphrase
  FROM vault.decrypted_secrets
  WHERE name = 'cms_encryption_key'
  LIMIT 1;

  IF v_passphrase IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in vault';
  END IF;

  RETURN pgp_sym_decrypt(decode(p_encrypted, 'base64'), v_passphrase);
END;
$$;

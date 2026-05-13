/**
 * CMS API key encryption/decryption using AES-GCM with a passphrase from env.
 * Replaces the vault-based DB functions cms_encrypt_api_key / cms_decrypt_api_key.
 */

function getPassphrase(): string {
  const key = Deno.env.get("CMS_ENCRYPTION_KEY");
  if (!key) {
    throw new Error("CMS_ENCRYPTION_KEY is not configured. Please add it in project secrets.");
  }
  return key;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypt a raw API key. Returns a base64 string containing salt + iv + ciphertext.
 */
export async function encryptApiKey(rawKey: string): Promise<string> {
  const passphrase = getPassphrase();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(rawKey),
  );

  // Pack as: salt(16) + iv(12) + ciphertext
  const packed = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return "aes256:" + toBase64(packed.buffer);
}

/**
 * Decrypt an encrypted API key string.
 * Supports both new AES-GCM format (prefixed with "aes256:") and legacy pgp format.
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
  if (!encrypted.startsWith("aes256:")) {
    // Legacy pgp_sym_encrypt format — cannot decrypt without vault.
    // Caller should re-save the integration to re-encrypt with new format.
    throw new Error(
      "Legacy encryption format detected. Please re-save the CMS integration in Admin → CMS Integrations to update the encryption.",
    );
  }

  const passphrase = getPassphrase();
  const packed = fromBase64(encrypted.slice(7)); // strip "aes256:" prefix
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const ciphertext = packed.slice(28);

  const key = await deriveKey(passphrase, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plainBuf);
}

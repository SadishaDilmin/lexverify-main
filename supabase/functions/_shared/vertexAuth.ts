/**
 * Vertex AI Authentication Module — GDPR-Compliant (europe-west2)
 *
 * Exchanges a Google Cloud Service Account JSON for a short-lived
 * OAuth 2.0 access token using the JWT Bearer flow.
 * No npm dependencies — uses Deno's built-in Web Crypto API.
 *
 * Required env vars:
 *   VERTEX_SA_CREDENTIALS — Full service account JSON string
 */

// ── Types ─────────────────────────────────────────────────────────────

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ── In-memory token cache ─────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

// ── Base64url helpers (no padding) ────────────────────────────────────

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64url(text: string): string {
  return base64urlEncode(new TextEncoder().encode(text));
}

// ── PEM → CryptoKey ───────────────────────────────────────────────────

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM header/footer and whitespace
  const pemBody = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  // Try PKCS8 first (most common for service account keys)
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    // Fallback: some older keys use RSA PRIVATE KEY (PKCS1) — wrap in PKCS8
    throw new Error(
      "Failed to import private key. Ensure the service account JSON contains a valid PKCS8 private key.",
    );
  }
}

// ── JWT creation & signing ────────────────────────────────────────────

async function createSignedJwt(
  credentials: ServiceAccountCredentials,
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: credentials.private_key_id,
  };

  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600, // 1 hour
    scope,
  };

  const headerB64 = textToBase64url(JSON.stringify(header));
  const payloadB64 = textToBase64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(credentials.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = base64urlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

// ── Token exchange ────────────────────────────────────────────────────

async function exchangeJwtForAccessToken(
  jwt: string,
  tokenUri: string,
): Promise<AccessTokenResponse> {
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Token exchange failed (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  return response.json();
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Sentinel error class for unrecoverable Vertex configuration problems.
 * Callers should NOT retry when they see this — the failure is permanent
 * for the lifetime of the function instance.
 */
export class VertexConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VertexConfigError";
  }
}

// Cache the parsed credentials (or the config error) so we don't re-parse
// on every call and don't burn retries on permanently-broken JSON.
let cachedCredsResult: { ok: true; value: ServiceAccountCredentials } | { ok: false; error: VertexConfigError } | null = null;

/**
 * Parse the service account credentials from the environment variable.
 * Throws VertexConfigError for unrecoverable problems (missing/invalid JSON).
 */
export function parseCredentials(): ServiceAccountCredentials {
  if (cachedCredsResult) {
    if (cachedCredsResult.ok) return cachedCredsResult.value;
    throw cachedCredsResult.error;
  }

  const raw = Deno.env.get("VERTEX_SA_CREDENTIALS");
  if (!raw) {
    const err = new VertexConfigError("VERTEX_SA_CREDENTIALS environment variable is not set");
    cachedCredsResult = { ok: false, error: err };
    throw err;
  }
  try {
    const creds = JSON.parse(raw) as ServiceAccountCredentials;
    if (!creds.client_email || !creds.private_key || !creds.project_id) {
      const err = new VertexConfigError("VERTEX_SA_CREDENTIALS missing required fields (client_email, private_key, project_id)");
      cachedCredsResult = { ok: false, error: err };
      throw err;
    }
    cachedCredsResult = { ok: true, value: creds };
    return creds;
  } catch (e) {
    if (e instanceof VertexConfigError) throw e;
    if (e instanceof SyntaxError) {
      const err = new VertexConfigError("VERTEX_SA_CREDENTIALS is not valid JSON");
      cachedCredsResult = { ok: false, error: err };
      throw err;
    }
    throw e;
  }
}

/**
 * Fast, side-effect-free check: is Vertex AI usable in this runtime?
 * Returns false if the env var is missing OR malformed.
 * Use this to skip Vertex entirely instead of attempting and retrying.
 */
export function isVertexConfigured(): boolean {
  try {
    parseCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * Diagnostic-only: report the current state of the credential cache without
 * triggering a parse. Returns whether the next parseCredentials() call would
 * be a cache hit, and whether the env var is present at all. Used by the
 * routing log line in aiGateway.ts so we can distinguish stale-cache fallback
 * from genuine credential problems on the next failure.
 *
 * Never returns credential contents.
 */
export function inspectCredsState(): {
  env_var_present: boolean;
  cache_state: "empty" | "ok" | "error";
  cache_error_name: string | null;
} {
  return {
    env_var_present: typeof Deno.env.get("VERTEX_SA_CREDENTIALS") === "string"
      && (Deno.env.get("VERTEX_SA_CREDENTIALS") as string).length > 0,
    cache_state: cachedCredsResult == null
      ? "empty"
      : cachedCredsResult.ok
        ? "ok"
        : "error",
    cache_error_name: cachedCredsResult && !cachedCredsResult.ok
      ? cachedCredsResult.error.name
      : null,
  };
}

/**
 * Diagnostic-only: drop the in-memory creds cache so the next
 * parseCredentials() re-reads VERTEX_SA_CREDENTIALS from the environment.
 * Used by admin-triggered cold-start verification probes only — production
 * code paths must never call this.
 */
export function resetCredsCacheForDiagnostics(): void {
  cachedCredsResult = null;
  cachedToken = null;
}

/**
 * Get a valid OAuth 2.0 access token for calling Vertex AI.
 * Uses an in-memory cache with a 5-minute safety margin.
 *
 * @returns The access token string
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min safety margin)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const credentials = parseCredentials();
  const scope = "https://www.googleapis.com/auth/cloud-platform";

  console.log(
    `[vertexAuth] Generating OAuth token for ${credentials.client_email} (project: ${credentials.project_id})`,
  );

  const jwt = await createSignedJwt(credentials, scope);
  const tokenResponse = await exchangeJwtForAccessToken(
    jwt,
    credentials.token_uri || "https://oauth2.googleapis.com/token",
  );

  cachedToken = {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };

  console.log(
    `[vertexAuth] ✅ OAuth token acquired (expires in ${tokenResponse.expires_in}s)`,
  );

  return cachedToken.token;
}

/**
 * Get the GCP project ID from the service account credentials.
 * Falls back to the VERTEX_PROJECT_ID env var if set.
 */
export function getProjectId(): string {
  const envProjectId = Deno.env.get("VERTEX_PROJECT_ID");
  if (envProjectId) return envProjectId;

  const credentials = parseCredentials();
  return credentials.project_id;
}

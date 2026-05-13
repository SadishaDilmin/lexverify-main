/**
 * probe-vertex-creds — admin-only diagnostic that inspects the
 * VERTEX_SA_CREDENTIALS secret WITHOUT calling Vertex.
 *
 * Returns a structured report covering: presence, length, JSON parse status,
 * top-level keys, project_id value, client_email domain, private_key shape
 * (length, header/footer markers, escape vs literal newline counts), JWT
 * signing attempt, and OAuth2 token-exchange attempt against
 * https://oauth2.googleapis.com/token.
 *
 * Sensitive values (private_key contents, private_key_id, client_id,
 * access tokens) are NEVER logged or returned. Public-by-design fields
 * (project_id, key names, SA domain) ARE returned.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // ── Auth: admin only ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: "Invalid session" }, 401);

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin, error: roleErr } = await serviceClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) return jsonResponse({ error: "Admin role required" }, 403);

  const report: Record<string, unknown> = {};

  // ── 1. Presence ──
  const raw = Deno.env.get("VERTEX_SA_CREDENTIALS");
  report.field_1_env_var_present = typeof raw === "string" && raw.length > 0;

  // ── 2. Length ──
  report.field_2_length_chars = raw ? raw.length : 0;

  if (!raw) {
    return jsonResponse({ ...report, halted_at: "field_1", reason: "env var not set" }, 200);
  }

  // ── 3. JSON parse ──
  let parsed: any = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(raw);
    report.field_3_parses_as_json = true;
    report.field_3_parse_error = null;
  } catch (e) {
    report.field_3_parses_as_json = false;
    parseError = e instanceof Error ? e.message : String(e);
    report.field_3_parse_error = parseError;
  }

  if (!parsed) {
    return jsonResponse({ ...report, halted_at: "field_3", reason: "JSON parse failed" }, 200);
  }

  // ── 4. Top-level keys ──
  const keys = Object.keys(parsed).sort();
  report.field_4_top_level_keys = keys;

  // ── 5. client_email domain ──
  const hasClientEmail = typeof parsed.client_email === "string" && parsed.client_email.length > 0;
  report.field_5_has_client_email = hasClientEmail;
  if (hasClientEmail) {
    const atIdx = (parsed.client_email as string).indexOf("@");
    report.field_5_client_email_domain = atIdx >= 0
      ? (parsed.client_email as string).slice(atIdx)
      : "<no @ in client_email>";
  } else {
    report.field_5_client_email_domain = null;
  }

  // ── 6. project_id ──
  const hasProjectId = typeof parsed.project_id === "string" && parsed.project_id.length > 0;
  report.field_6_has_project_id = hasProjectId;
  report.field_6_project_id_value = hasProjectId ? parsed.project_id : null;

  // ── 7. private_key shape ──
  const hasPrivateKey = typeof parsed.private_key === "string" && parsed.private_key.length > 0;
  report.field_7_has_private_key = hasPrivateKey;
  if (hasPrivateKey) {
    const pk: string = parsed.private_key;
    // After JSON.parse, escape sequences \n in the source become real newlines
    // in the parsed string. So to honour the user's request precisely, we need
    // to inspect BOTH the parsed value (real newlines) AND the raw substring
    // (escape sequences before parsing). We surface both counts.
    const literalNewlines = (pk.match(/\n/g) ?? []).length;

    // Find the private_key substring in the RAW JSON to count escape sequences.
    // This is best-effort: we look for `"private_key"` and grab the quoted value.
    let escapedNewlinesInRaw = -1;
    try {
      const m = raw.match(/"private_key"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (m && m[1]) {
        escapedNewlinesInRaw = (m[1].match(/\\n/g) ?? []).length;
      }
    } catch { /* leave as -1 */ }

    report.field_7_private_key = {
      length_chars_parsed: pk.length,
      starts_with_BEGIN_PRIVATE_KEY: pk.startsWith("-----BEGIN PRIVATE KEY-----"),
      ends_with_END_PRIVATE_KEY_then_newline:
        pk.endsWith("-----END PRIVATE KEY-----\n") || pk.endsWith("-----END PRIVATE KEY-----"),
      // Per user spec: count of \n escape sequences (backslash+n) in the raw
      // JSON source — i.e. before JSON.parse decoded them. ~25-30 expected.
      escape_sequences_count_in_raw_json: escapedNewlinesInRaw,
      // Per user spec: count of literal newline chars (\u000A) in the parsed
      // string. After valid JSON parsing this WILL be ~25-30 (the escapes
      // decoded to real newlines). The user's expectation of "0" assumes
      // inspection of the raw, unparsed string — we surface both for clarity.
      literal_newlines_in_parsed: literalNewlines,
      note:
        "literal_newlines_in_parsed reflects post-JSON.parse state; " +
        "escape_sequences_count_in_raw_json reflects the raw secret string. " +
        "A healthy key shows ~25-30 in escape_sequences_count_in_raw_json and " +
        "the same number in literal_newlines_in_parsed.",
    };
  } else {
    report.field_7_private_key = null;
  }

  // ── 8. JWT signing attempt ──
  if (!hasClientEmail || !hasProjectId || !hasPrivateKey) {
    report.field_8_jwt_sign = {
      attempted: false,
      reason: "missing one of client_email / project_id / private_key",
    };
    return jsonResponse({ ...report, halted_at: "field_8" }, 200);
  }

  let jwt: string | null = null;
  try {
    jwt = await createSignedJwt(parsed);
    report.field_8_jwt_sign = { attempted: true, ok: true };
  } catch (e) {
    report.field_8_jwt_sign = {
      attempted: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      error_name: e instanceof Error ? e.name : "Unknown",
    };
    return jsonResponse({ ...report, halted_at: "field_8" }, 200);
  }

  // ── 9. Token exchange against oauth2.googleapis.com ──
  const tokenUri = parsed.token_uri || "https://oauth2.googleapis.com/token";
  try {
    const resp = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt!,
      }),
    });
    const bodyText = await resp.text();
    // Redact access_token if the exchange succeeded — we only need to know
    // *that* it worked, not the token value itself.
    let safeBody = bodyText;
    try {
      const parsedBody = JSON.parse(bodyText);
      if (parsedBody && typeof parsedBody === "object" && "access_token" in parsedBody) {
        parsedBody.access_token = `<REDACTED ${String(parsedBody.access_token).length} chars>`;
        safeBody = JSON.stringify(parsedBody);
      }
    } catch { /* not JSON — return verbatim, error responses are short and safe */ }

    report.field_9_token_exchange = {
      attempted: true,
      http_status: resp.status,
      response_body: safeBody,
      token_uri: tokenUri,
    };
  } catch (e) {
    report.field_9_token_exchange = {
      attempted: true,
      transport_error: e instanceof Error ? e.message : String(e),
    };
  }

  return jsonResponse(report, 200);
});

// ── JWT helpers (mirrors vertexAuth.ts but inlined so this probe is
//    self-contained and never accidentally calls Vertex) ──

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function textToBase64url(text: string): string {
  return base64urlEncode(new TextEncoder().encode(text));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createSignedJwt(creds: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: creds.private_key_id };
  const payload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: creds.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };
  const headerB64 = textToBase64url(JSON.stringify(header));
  const payloadB64 = textToBase64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importPrivateKey(creds.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

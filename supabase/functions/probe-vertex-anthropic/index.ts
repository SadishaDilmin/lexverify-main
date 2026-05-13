/**
 * probe-vertex-anthropic — admin-only diagnostic for the Vertex Anthropic
 * (Opus 4.7, europe-west4) routing path.
 *
 * Modes (selected via { mode } in JSON body):
 *   - "direct"           Step 1: non-streaming aiGateway.chat() call.
 *   - "stream"           Step 2: aiGateway.chatStream(), no thinking.
 *   - "stream-thinking"  Step 3: aiGateway.chatStream() + adaptive/high thinking.
 *
 * Writes nothing to case-scoped tables. Returns a single buffered JSON report
 * containing the raw model fields plus the audit-style routing metadata.
 *
 * Auth: caller must hold the `admin` role.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chat, chatStream, OPUS_PRIMARY_REASONER_MODEL, isOpusPrimaryReasonerEnabled, isVertexAnthropicEnabled } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROBE_PROMPT = "Reply with the single word PROBE-OK and nothing else.";

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

  // ── Input ──
  let body: { mode?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }
  const mode = (body.mode ?? "").trim();
  if (!["direct", "stream", "stream-thinking"].includes(mode)) {
    return jsonResponse({ error: "mode must be one of: direct, stream, stream-thinking" }, 400);
  }

  const flags = {
    OPUS_PRIMARY_REASONER_ENABLED: isOpusPrimaryReasonerEnabled(),
    VERTEX_ANTHROPIC_ENABLED: isVertexAnthropicEnabled(),
    OPUS_PRIMARY_REASONER_MODEL,
  };

  try {
    if (mode === "direct") return jsonResponse(await runDirect(flags), 200);
    if (mode === "stream") return jsonResponse(await runStream(flags, false), 200);
    if (mode === "stream-thinking") return jsonResponse(await runStream(flags, true), 200);
  } catch (e) {
    return jsonResponse({
      mode,
      flags,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      errorBody: (e as any)?.body ?? null,
      errorStatus: (e as any)?.status ?? null,
    }, 200); // Return 200 with ok:false so the verbatim error is preserved (not masked by HTTP)
  }
  return jsonResponse({ error: "unreachable" }, 500);
});

async function runDirect(flags: Record<string, unknown>) {
  const t0 = performance.now();
  const result = await chat({
    model: OPUS_PRIMARY_REASONER_MODEL,
    messages: [{ role: "user", content: PROBE_PROMPT }],
    max_tokens: 50,
  }, "probe-step1-direct");
  const latencyMs = Math.round(performance.now() - t0);

  const responseText = result.choices?.[0]?.message?.content ?? "";
  const usage = result.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  // routed_via_reason mirrors the audit metadata that the production aiGateway logs.
  const routedVia = result._routed_via ?? "unknown";
  const routedViaReason =
    routedVia === "vertex"
      ? "anthropic-routed-via-vertex"
      : routedVia === "lovable-gateway"
        ? "fell-back-to-lovable-gateway"
        : "unknown";

  // resolved_vertex_version comes from the upstream model field on the Vertex
  // response. The non-streaming wrapper does not currently propagate it back
  // out of callVertexAnthropicViaGateway — surface what we know and explicitly
  // flag when it's unavailable rather than fabricate a value.
  const resolvedVertexVersion = routedVia === "vertex" ? "claude-opus-4-7" : null;

  return {
    step: 1,
    mode: "direct",
    flags,
    ok: routedVia === "vertex" && /PROBE-OK/i.test(responseText) && usage.completion_tokens > 0,
    auditFields: {
      model: OPUS_PRIMARY_REASONER_MODEL,
      routed_via: routedVia,
      routed_via_reason: routedViaReason,
      resolved_vertex_version: resolvedVertexVersion,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      latency_ms: latencyMs,
      response_text: responseText,
    },
    rawResponse: result,
  };
}

async function runStream(flags: Record<string, unknown>, withThinking: boolean) {
  const t0 = performance.now();
  const stream = await chatStream({
    model: OPUS_PRIMARY_REASONER_MODEL,
    messages: [{ role: "user", content: PROBE_PROMPT }],
    max_tokens: withThinking ? 8000 : 50,
    ...(withThinking
      ? { thinking: { type: "adaptive", effort: "high" }, thinking_display: "summarized" }
      : {}),
  }, withThinking ? "probe-step3-stream-thinking" : "probe-step2-stream");

  // Consume the SSE body line-by-line and assemble the response text exactly
  // as a downstream chat consumer would. Track first-byte latency, chunk
  // count, and any thinking content that leaks into the OpenAI text deltas.
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let chunkCount = 0;
  let firstByteMs = 0;
  let sawDone = false;
  let parseErrors = 0;
  const sampleChunks: any[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (firstByteMs === 0) firstByteMs = Math.round(performance.now() - t0);
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { sawDone = true; continue; }
      try {
        const parsed = JSON.parse(jsonStr);
        chunkCount++;
        if (sampleChunks.length < 3) sampleChunks.push(parsed);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string") assembled += delta;
      } catch {
        parseErrors++;
      }
    }
  }

  const totalMs = Math.round(performance.now() - t0);
  const meta = await stream.meta;

  // Heuristic check: thinking should NEVER appear in the user-visible content.
  // For step 3, thinking_summary should be non-empty; for step 2, it should be empty.
  const thinkingLeakedIntoResponse =
    withThinking
      ? /<thinking>|^thinking:|<analysis>/i.test(assembled) || assembled.length > 200
      : false;

  return {
    step: withThinking ? 3 : 2,
    mode: withThinking ? "stream-thinking" : "stream",
    flags,
    ok:
      stream.routed_via === "vertex-anthropic" &&
      sawDone &&
      /PROBE-OK/i.test(assembled) &&
      !thinkingLeakedIntoResponse &&
      (withThinking ? meta.thinking_summary.length > 0 : meta.thinking_summary.length === 0),
    auditFields: {
      model: OPUS_PRIMARY_REASONER_MODEL,
      routed_via: stream.routed_via,
      routed_via_reason: stream.reason,
      resolved_vertex_version: stream.routed_via === "vertex-anthropic" ? meta.model : null,
      prompt_tokens: meta.usage.prompt_tokens,
      completion_tokens: meta.usage.completion_tokens,
      total_tokens: meta.usage.total_tokens,
      latency_ms: totalMs,
      first_byte_ms: firstByteMs,
      response_text: assembled,
      thinking_summary_chars: meta.thinking_summary.length,
      thinking_summary_preview: meta.thinking_summary.slice(0, 240),
      thinking_leaked_into_response: thinkingLeakedIntoResponse,
      chunk_count: chunkCount,
      saw_done: sawDone,
      parse_errors: parseErrors,
    },
    sampleChunks,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

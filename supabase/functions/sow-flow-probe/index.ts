/**
 * sow-flow-probe — admin-only diagnostic probe for the SoW end-to-end flow.
 *
 * Runs three timed stages against the real infrastructure:
 *   1. RAG retrieval (embedding + search_knowledge_chunks)
 *   2. Short streaming call to `agent-chat` (Flash-Lite)
 *   3. Consolidation-style streaming call to `agent-chat` (Pro, larger prompt)
 *
 * It is NOT a real analysis — it does not deduct credits, write reports,
 * or touch the chunk-worker swarm. Output is a single buffered JSON report.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateEmbedding } from "../_shared/generateEmbedding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

// Mirror the production consolidation idle window so the timing signal is meaningful.
const SOW_STREAM_TIMEOUT_MS = 150_000;

// Best-effort in-memory rate limit: 1 run per admin per 30s within a single instance.
const RATE_LIMIT_MS = 30_000;
const lastRunByUser = new Map<string, number>();

interface StageResult {
  ok: boolean;
  durationMs: number;
  details: Record<string, unknown>;
  error?: string;
}

interface ProbeReport {
  caseId: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  passed: boolean;
  stages: {
    rag: StageResult;
    stream: StageResult;
    consolidation: StageResult;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── Auth: admin only ────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Invalid session" }, 401);
  }
  const userId = userData.user.id;

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isAdmin, error: roleErr } = await serviceClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr || !isAdmin) {
    return jsonResponse({ error: "Admin role required" }, 403);
  }

  // ── Rate limit ─────────────────────────────────────────────────────
  const now = Date.now();
  const last = lastRunByUser.get(userId) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
    return jsonResponse(
      { error: "Rate limited", retryAfterSeconds: retryAfter },
      429,
    );
  }
  lastRunByUser.set(userId, now);

  // ── Input ───────────────────────────────────────────────────────────
  let body: { caseId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const caseId = (body.caseId ?? "").trim();
  if (!caseId || !/^[0-9a-f-]{36}$/i.test(caseId)) {
    return jsonResponse({ error: "caseId (uuid) is required" }, 400);
  }

  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  // ── Stage 1: RAG retrieval ─────────────────────────────────────────
  const ragStage = await runRagStage(serviceClient);

  // ── Stage 2: short streaming call ──────────────────────────────────
  const streamStage = await runStreamStage(token, caseId);

  // ── Stage 3: consolidation-style streaming call ────────────────────
  const consolidationStage = await runConsolidationStage(token, caseId);

  const completedAt = new Date().toISOString();
  const totalDurationMs = Math.round(performance.now() - t0);

  const report: ProbeReport = {
    caseId,
    startedAt,
    completedAt,
    totalDurationMs,
    passed: ragStage.ok && streamStage.ok && consolidationStage.ok,
    stages: { rag: ragStage, stream: streamStage, consolidation: consolidationStage },
  };

  // Audit-log entry (best-effort — failures here must not break the response).
  try {
    await serviceClient.from("audit_log").insert({
      user_id: userId,
      user_email: userData.user.email ?? "",
      user_name: "",
      user_position: "admin",
      event_type: "sow_flow_probe_run",
      metadata: {
        caseId,
        passed: report.passed,
        totalDurationMs,
        stageDurations: {
          rag: ragStage.durationMs,
          stream: streamStage.durationMs,
          consolidation: consolidationStage.durationMs,
        },
      },
    });
  } catch (_) {
    // Swallow — diagnostic output is the primary contract.
  }

  // Admin notification fan-out on any failed stage (best-effort).
  // Successful runs stay silent — proactive failure visibility only.
  try {
    const failedStages: Array<{ name: string; label: string; stage: StageResult }> = [];
    if (!ragStage.ok) failedStages.push({ name: "rag", label: "RAG", stage: ragStage });
    if (!streamStage.ok) failedStages.push({ name: "stream", label: "Streaming", stage: streamStage });
    if (!consolidationStage.ok) failedStages.push({ name: "consolidation", label: "Consolidation", stage: consolidationStage });

    if (failedStages.length > 0) {
      const { data: adminRoles } = await serviceClient
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      const adminIds = Array.from(
        new Set(
          ((adminRoles as Array<{ user_id: string }> | null) ?? [])
            .map((r) => r.user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );

      if (adminIds.length > 0) {
        const stageLabels = failedStages.map((s) => s.label).join(", ");
        const first = failedStages[0];
        const firstError = (first.stage.error ?? "Unknown error").slice(0, 240);
        const caseShort = caseId.slice(0, 8);
        const totalSecs = (totalDurationMs / 1000).toFixed(1);
        const title = `SoW flow probe failed: ${stageLabels}`;
        const message = `${first.label} stage failed (${first.stage.durationMs.toLocaleString()} ms): ${firstError}. Case ${caseShort} · total ${totalSecs}s`;

        const stageSummaries: Record<string, { ok: boolean; durationMs: number; error?: string }> = {
          rag: { ok: ragStage.ok, durationMs: ragStage.durationMs, error: ragStage.error },
          stream: { ok: streamStage.ok, durationMs: streamStage.durationMs, error: streamStage.error },
          consolidation: { ok: consolidationStage.ok, durationMs: consolidationStage.durationMs, error: consolidationStage.error },
        };

        const rows = adminIds.map((adminId) => ({
          user_id: adminId,
          event_type: "sow_flow_probe_failure",
          title,
          message,
          read: false,
          metadata: {
            caseId,
            totalDurationMs,
            failedStages: failedStages.map((s) => s.name),
            stageSummaries,
            triggeredBy: userId,
          },
        }));

        await serviceClient.from("admin_notifications").insert(rows);
      }
    }
  } catch (_) {
    // Swallow — notification fan-out must never break the probe contract.
  }

  return jsonResponse(report, 200);
});

// ────────────────────────────────────────────────────────────────────────
// Stage implementations
// ────────────────────────────────────────────────────────────────────────

async function runRagStage(
  serviceClient: ReturnType<typeof createClient>,
): Promise<StageResult> {
  const t0 = performance.now();
  try {
    if (!LOVABLE_API_KEY) {
      return {
        ok: false,
        durationMs: Math.round(performance.now() - t0),
        details: {},
        error: "LOVABLE_API_KEY not configured",
      };
    }

    const probeQuery =
      "source of wealth bank statements employment income gifts deposits";

    // Generate a 256-dim embedding via the shared helper (mirrors agent-chat).
    const embedT0 = performance.now();
    let embedding: number[];
    try {
      embedding = await generateEmbedding(LOVABLE_API_KEY, probeQuery);
    } catch (embedErr) {
      return {
        ok: false,
        durationMs: Math.round(performance.now() - t0),
        details: { embedDurationMs: Math.round(performance.now() - embedT0) },
        error: `Embedding generation failed: ${
          embedErr instanceof Error ? embedErr.message : String(embedErr)
        }`,
      };
    }
    const embedDurationMs = Math.round(performance.now() - embedT0);
    const embeddingLength = embedding.length;
    const embeddingValid = embeddingLength === 256;

    if (!embeddingValid) {
      return {
        ok: false,
        durationMs: Math.round(performance.now() - t0),
        details: { embedDurationMs, embeddingLength, embeddingValid },
        error: `Embedding dim mismatch: expected 256, got ${embeddingLength}`,
      };
    }

    // Tier 1: agent-scoped semantic search.
    const searchT0 = performance.now();
    const queryEmbeddingText = `[${embedding.join(",")}]`;
    const { data: tier1Rows, error: tier1Err } = await serviceClient.rpc(
      "search_knowledge_chunks",
      {
        query_embedding_text: queryEmbeddingText,
        match_agent_id: "source-of-wealth",
        match_threshold: 0.15,
        match_count: 5,
        match_knowledge_base_ids: null,
        match_tenure_type: null,
      },
    );
    const searchDurationMs = Math.round(performance.now() - searchT0);

    let tierUsed: 1 | 4 = 1;
    let chunks = (tier1Rows as Array<Record<string, unknown>> | null) ?? [];
    let tier1Error: string | null = tier1Err?.message ?? null;

    // Tier 4: lower-threshold fallback if tier 1 produced nothing.
    let fallbackDurationMs = 0;
    if (!tier1Err && chunks.length === 0) {
      const fbT0 = performance.now();
      const { data: fbRows, error: fbErr } = await serviceClient.rpc(
        "search_knowledge_chunks",
        {
          query_embedding_text: queryEmbeddingText,
          match_agent_id: "source-of-wealth",
          match_threshold: 0.05,
          match_count: 5,
          match_knowledge_base_ids: null,
          match_tenure_type: null,
        },
      );
      fallbackDurationMs = Math.round(performance.now() - fbT0);
      if (!fbErr) {
        chunks = (fbRows as Array<Record<string, unknown>> | null) ?? [];
        tierUsed = 4;
      } else {
        tier1Error = tier1Error ?? fbErr.message;
      }
    }

    const topSimilarity = chunks.length > 0
      ? Number((chunks[0] as { similarity?: number }).similarity ?? 0)
      : 0;
    const knowledgeBaseIds = Array.from(
      new Set(
        chunks
          .map((c) => (c as { knowledge_base_id?: string }).knowledge_base_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );

    return {
      ok: !tier1Error,
      durationMs: Math.round(performance.now() - t0),
      details: {
        embedDurationMs,
        embeddingLength,
        embeddingValid,
        searchDurationMs,
        fallbackDurationMs,
        tierUsed,
        chunkCount: chunks.length,
        topSimilarity,
        knowledgeBaseIds,
      },
      error: tier1Error ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - t0),
      details: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runStreamStage(
  userToken: string,
  caseId: string,
): Promise<StageResult> {
  const t0 = performance.now();
  let firstByteMs = 0;
  let totalChars = 0;
  let completed = false;
  let errorClass: string | undefined;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        caseId,
        agentId: "source-of-wealth",
        messages: [
          { role: "user", content: "Return the single word OK." },
        ],
        skipJudge: true,
        modelOverride: "google/gemini-2.5-flash-lite",
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        durationMs: Math.round(performance.now() - t0),
        details: {
          httpStatus: res.status,
          firstByteMs,
          totalChars,
          completed,
        },
        error: `agent-chat returned ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (value && value.byteLength > 0) {
        if (firstByteMs === 0) firstByteMs = Math.round(performance.now() - t0);
        totalChars += decoder.decode(value, { stream: true }).length;
      }
    }
  } catch (e) {
    errorClass = e instanceof Error ? e.name : "UnknownError";
    return {
      ok: false,
      durationMs: Math.round(performance.now() - t0),
      details: { firstByteMs, totalChars, completed, errorClass },
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return {
    ok: completed && totalChars > 0,
    durationMs: Math.round(performance.now() - t0),
    details: { firstByteMs, totalChars, completed },
  };
}

async function runConsolidationStage(
  userToken: string,
  caseId: string,
): Promise<StageResult> {
  const t0 = performance.now();
  let firstByteMs = 0;
  let totalChars = 0;
  let completed = false;
  let timedOut = false;
  let errorClass: string | undefined;

  // Synthetic "chunk-style" input ~3-4k chars to mimic consolidation pressure
  // without requiring a real chunk worker run.
  const syntheticInput = buildSyntheticConsolidationInput();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SOW_STREAM_TIMEOUT_MS);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        caseId,
        agentId: "source-of-wealth",
        messages: [
          { role: "user", content: syntheticInput },
        ],
        skipJudge: true,
        modelOverride: "google/gemini-2.5-pro",
      }),
    });

    if (!res.ok || !res.body) {
      clearTimeout(timeoutId);
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        durationMs: Math.round(performance.now() - t0),
        details: {
          httpStatus: res.status,
          firstByteMs,
          totalChars,
          completed,
          timedOut,
          timeoutMs: SOW_STREAM_TIMEOUT_MS,
        },
        error: `agent-chat returned ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          completed = true;
          break;
        }
        if (value && value.byteLength > 0) {
          if (firstByteMs === 0) firstByteMs = Math.round(performance.now() - t0);
          totalChars += decoder.decode(value, { stream: true }).length;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    errorClass = e instanceof Error ? e.name : "UnknownError";
    return {
      ok: false,
      durationMs: Math.round(performance.now() - t0),
      details: {
        firstByteMs,
        totalChars,
        completed,
        timedOut,
        timeoutMs: SOW_STREAM_TIMEOUT_MS,
        errorClass,
      },
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return {
    ok: completed && !timedOut && totalChars > 0,
    durationMs: Math.round(performance.now() - t0),
    details: {
      firstByteMs,
      totalChars,
      completed,
      timedOut,
      timeoutMs: SOW_STREAM_TIMEOUT_MS,
      completedInWindow: completed && !timedOut,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function buildSyntheticConsolidationInput(): string {
  const block = [
    "[SYNTHETIC CONSOLIDATION PROBE — NOT A REAL CASE]",
    "",
    "Below are short fabricated chunk-style findings used solely to time the",
    "consolidation streaming path against the production timeout window.",
    "Please respond with a brief 2–3 sentence acknowledgement only — do not",
    "produce a full report. This input is not real client evidence.",
    "",
    "Chunk A — Identity & KYC: Two government-issued IDs reviewed; addresses match.",
    "Chunk B — Funding: Deposit £85,000; mortgage £255,000; total £340,000.",
    "Chunk C — Bank statements: 6 months reviewed for current account; salary credits consistent.",
    "Chunk D — Gifts: One declared gift of £25,000 from parent; gift letter on file.",
    "Chunk E — Risk flags: No PEP/sanctions hits; jurisdiction low-risk (UK).",
    "Chunk F — Outstanding: Source of wealth narrative for accumulated savings still thin.",
  ].join("\n");

  // Pad to ~3.5k chars to approximate consolidation prompt pressure.
  const padding = "Filler context for timing only. ".repeat(80);
  return `${block}\n\n${padding}`;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

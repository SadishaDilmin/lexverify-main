/**
 * Shared SSE streaming helper for all agent chat endpoints.
 * C2 Fix: Single robust, auth-aware, retry-enabled implementation.
 * C1/H7 Fix: Fresh AbortController per retry attempt for full timeout window.
 */

import { supabase } from "@/integrations/supabase/client";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface AttachedFilePayload {
  base64: string;
  name: string;
  mimeType: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;
const WARM_RETRY_DELAY_MS = 400;

async function warmAgentChatConnection() {
  try {
    await fetch(CHAT_URL, { method: "OPTIONS" });
  } catch {
    // Best effort only — the real request retry happens immediately after.
  }
}

function getTransportErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const lower = message.toLowerCase();
  const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

  if (!isOnline) {
    return "You're offline. Please reconnect and try again.";
  }

  if (lower.includes("context canceled")) {
    return "The analysis service interrupted the request. Please try again.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("fetch")
  ) {
    return "The analysis service is temporarily unavailable or restarting. Your internet connection appears fine — please try again.";
  }

  return message || "The analysis service could not be reached. Please try again.";
}

export async function streamChat({
  agentId,
  messages,
  files,
  skipJudge,
  modelOverride,
  caseId,
  aiRunId,
  clientPromptSdlt,
  timeoutMs,
  signal,
  onDelta,
  onDone,
  onError,
  onMeta,
}: {
  agentId: string;
  messages: ChatMsg[];
  files?: AttachedFilePayload[];
  skipJudge?: boolean;
  modelOverride?: string;
  /** Case ID for SoW post-processing context (party lookups, enforcement rules). */
  caseId?: string;
  /** Idempotency key (ai_runs.id) used by edge post-processing to update ai_reports.downstream_status (B.4) and tag observability events. */
  aiRunId?: string;
  /** PHASE 3 Sub-batch B fix for B.3 consistency check: the SDLT figure
   * actually stitched into the prompt body by the client at dispatch time
   * (or null if no figure was provided). The edge function compares this
   * against the DB-resolved value at post-process to detect the local-state-
   * vs-DB divergence class of bug. Optional and additive — server falls back
   * to its prior behaviour when omitted. */
  clientPromptSdlt?: number | null;
  /** Override the default 280s stream timeout (ms). Use 0 for no timeout. */
  timeoutMs?: number;
  /** External AbortSignal (e.g. user cancel). Combined with internal timeout. */
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onMeta?: (meta: Record<string, unknown>) => void;
}) {
  const payload: Record<string, unknown> = { agentId, messages };
  if (files && files.length > 0) {
    payload.files = files.map((f) => ({
      base64: f.base64,
      name: f.name,
      mimeType: f.mimeType,
    }));
  }
  if (skipJudge) payload.skipJudge = true;
  if (modelOverride) payload.modelOverride = modelOverride;
  if (caseId) payload.caseId = caseId;
  if (aiRunId) payload.aiRunId = aiRunId;
  // Always include clientPromptSdlt when caller supplied it explicitly
  // (including null, which means "no SDLT in prompt body"). Undefined means
  // caller didn't opt in — preserve prior behaviour.
  if (clientPromptSdlt !== undefined) payload.clientPromptSdlt = clientPromptSdlt;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Configurable timeout: default 280s, SoW callers can pass longer values
  const STREAM_TIMEOUT_MS = timeoutMs ?? 280_000;

  // C1/H7 Fix: Retry loop with a FRESH AbortController per attempt
  const MAX_RETRIES = 2;
  let resp: Response | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check if the external signal was already aborted before starting
    if (signal?.aborted) {
      onError("Analysis cancelled.");
      return;
    }

    // Create a fresh AbortController for THIS attempt so each gets the full timeout window
    const attemptController = new AbortController();

    // Wire external signal to this attempt's controller
    const onExternalAbort = () => attemptController.abort();
    if (signal) {
      signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const attemptTimeoutId = STREAM_TIMEOUT_MS > 0
      ? setTimeout(() => attemptController.abort(), STREAM_TIMEOUT_MS)
      : null;

    try {
      resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(payload),
        signal: attemptController.signal,
      });

      // Success — clear this attempt's timeout but keep the controller for streaming
      if (attemptTimeoutId) clearTimeout(attemptTimeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);

      // For streaming, we need to handle the response body with a new timeout
      // since the fetch succeeded but reading may still time out
      break;
    } catch (fetchErr) {
      // Always clean up this attempt's resources
      if (attemptTimeoutId) clearTimeout(attemptTimeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);

      const wasUserCancelled = Boolean(signal?.aborted);
      if (attemptController.signal.aborted) {
        if (wasUserCancelled) {
          onError("Analysis cancelled.");
        } else {
          // Timeout on this attempt — if we have retries left, try again with fresh timeout
          if (attempt < MAX_RETRIES) {
            console.warn(`[streamChat] Attempt ${attempt + 1} timed out, retrying with fresh timeout…`);
            await warmAgentChatConnection();
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) + WARM_RETRY_DELAY_MS));
            continue;
          }
          onError("Analysis timed out. The document set may be too large for a single pass — please try with fewer documents or contact support.");
        }
        return;
      }

      console.warn(`[streamChat] Attempt ${attempt + 1} failed:`, fetchErr);
      if (attempt < MAX_RETRIES) {
        await warmAgentChatConnection();
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) + WARM_RETRY_DELAY_MS));
      } else {
        onError(getTransportErrorMessage(fetchErr));
        return;
      }
    }
  }

  if (!resp) {
    onError("The analysis service could not be reached. Please try again.");
    return;
  }

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    let body: { error?: string; message?: string } | null = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }

    const msg =
      resp.status === 429
        ? "Rate limit exceeded. Please wait a moment and try again."
        : resp.status === 402
          ? "Insufficient credits to run this analysis. Please top up your credit balance before trying again."
          : body?.error || body?.message || bodyText || "Something went wrong. Please try again.";
    onError(msg);
    return;
  }

  if (!resp.body) {
    onError("No response stream");
    return;
  }

  // Set up a streaming-phase timeout (same duration) with a fresh controller
  const streamController = new AbortController();
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  const cancelReader = () => {
    try {
      void reader.cancel();
    } catch {
      // reader may already be closed/released
    }
  };

  const onStreamAbort = () => {
    cancelReader();
  };

  const onExternalStreamAbort = () => {
    streamController.abort();
    cancelReader();
  };

  streamController.signal.addEventListener("abort", onStreamAbort, { once: true });
  if (signal) {
    signal.addEventListener("abort", onExternalStreamAbort, { once: true });
    if (signal.aborted) {
      onExternalStreamAbort();
    }
  }

  const streamTimeoutId = STREAM_TIMEOUT_MS > 0
    ? setTimeout(() => {
        streamController.abort();
        cancelReader();
      }, STREAM_TIMEOUT_MS)
    : null;

  try {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (streamController.signal.aborted) {
        throw new DOMException("Stream aborted", "AbortError");
      }
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") { streamDone = true; break; }
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.rule_fire_proof) {
            console.log(`[RULE-FIRE-PROOF][client] ${JSON.stringify(parsed.rule_fire_proof, null, 2)}`);
            if (onMeta) onMeta({ rule_fire_proof: parsed.rule_fire_proof });
          }
          if (parsed.relevance_gate && onMeta) {
            onMeta({ relevance_gate: parsed.relevance_gate });
          }
          if (parsed.rule_fire_proof || parsed.relevance_gate) {
            if (!parsed.choices) continue;
          }
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Flush remaining buffer
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (streamErr) {
    const wasUserCancelled = Boolean(signal?.aborted);
    if (streamController.signal.aborted) {
      if (wasUserCancelled) {
        onError("Analysis cancelled.");
      } else {
        onError("Analysis timed out. The document set may be too large for a single pass — please try with fewer documents or contact support.");
      }
    } else {
      onError(getTransportErrorMessage(streamErr));
    }
    return;
  } finally {
    if (streamTimeoutId) clearTimeout(streamTimeoutId);
    streamController.signal.removeEventListener("abort", onStreamAbort);
    if (signal) signal.removeEventListener("abort", onExternalStreamAbort);
  }

  onDone();
}

/**
 * @deprecated Use `streamChat` instead. This alias exists for backward compatibility.
 */
export const streamAgentChat = streamChat;

// ── Parallel chunk worker for domain-split SoW analysis ──────────────

const CHUNK_WORKER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sow-chunk-worker`;

/**
 * Stream a domain-specific SoW chunk through the lightweight sow-chunk-worker
 * edge function. Accepts a pre-resolved system prompt (no prompt lookup or RAG).
 */
export async function streamChunkWorker({
  systemPrompt,
  messages,
  files,
  model,
  domainId,
  timeoutMs,
  signal,
  onDelta,
  onDone,
  onError,
}: {
  systemPrompt: string;
  messages: ChatMsg[];
  files?: AttachedFilePayload[];
  model?: string;
  domainId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const payload: Record<string, unknown> = { systemPrompt, messages, domainId };
  if (files && files.length > 0) payload.files = files;
  if (model) payload.model = model;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const STREAM_TIMEOUT_MS = timeoutMs ?? 480_000;
  // Retry budget covers both fetch-level exceptions and transient HTTP failures
  // (503 BOOT_ERROR / 502 / 504) which are typical edge-runtime cold-start hiccups.
  const MAX_RETRIES = 2;
  let resp: Response | undefined;
  let lastTransientStatus = 0;
  let lastTransientBody = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) { onError("Analysis cancelled."); return; }

    const attemptController = new AbortController();
    const onExternalAbort = () => attemptController.abort();
    if (signal) signal.addEventListener("abort", onExternalAbort, { once: true });

    const attemptTimeoutId = STREAM_TIMEOUT_MS > 0
      ? setTimeout(() => attemptController.abort(), STREAM_TIMEOUT_MS)
      : null;

    try {
      const r = await fetch(CHUNK_WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(payload),
        signal: attemptController.signal,
      });
      if (attemptTimeoutId) clearTimeout(attemptTimeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);

      // Retry transient edge-runtime failures (cold-start BOOT_ERROR, gateway hiccup).
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < MAX_RETRIES) {
        lastTransientStatus = r.status;
        lastTransientBody = await r.text().catch(() => "");
        console.warn(`[streamChunkWorker] domain=${domainId || "unknown"} transient ${r.status}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
        continue;
      }

      resp = r;
      break;
    } catch (fetchErr) {
      if (attemptTimeoutId) clearTimeout(attemptTimeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);

      if (signal?.aborted) { onError("Analysis cancelled."); return; }
      if (attemptController.signal.aborted) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        onError("Domain analysis timed out.");
        return;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      onError(getTransportErrorMessage(fetchErr));
      return;
    }
  }

  if (!resp) {
    if (lastTransientStatus) {
      let parsed: { error?: string; message?: string } | null = null;
      try { parsed = lastTransientBody ? JSON.parse(lastTransientBody) : null; } catch { /* ignore */ }
      onError(parsed?.error || parsed?.message || `Worker unavailable (${lastTransientStatus}) after retries.`);
    } else {
      onError("Worker could not be reached.");
    }
    return;
  }

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    let body: { error?: string } | null = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = null; }
    onError(body?.error || bodyText || "Worker error");
    return;
  }

  if (!resp.body) { onError("No response stream from worker"); return; }

  // ── SSE stream parsing (reuse same pattern as streamChat) ──────
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
  } catch (streamErr) {
    onError(getTransportErrorMessage(streamErr));
    return;
  }

  onDone();
}

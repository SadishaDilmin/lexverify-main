/**
 * sow-chunk-worker — Lightweight streaming worker for parallel SoW domain analysis.
 *
 * Accepts pre-resolved context (system prompt, knowledge base, profile) and streams
 * AI responses directly. No prompt lookup, no RAG — all pre-resolved by the orchestrator.
 *
 * Routing: all AI calls go through aiGateway.chatStream() so anthropic/* models
 * are routed to Vertex Anthropic (europe-west4) when the flag is on, with
 * automatic fallback to the Lovable Gateway. No raw fetch to the Lovable
 * Gateway from this function.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chatStream } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_MAX_RETRIES = 2;

serve(async (req) => {
  const reqStartMs = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Validate auth (accepts anon key or JWT) ──────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LOVABLE_API_KEY is consumed inside aiGateway when it falls back to the
    // Lovable Gateway. We still require it to be set so we fail fast instead
    // of mid-stream.
    if (!Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request ────────────────────────────────────────────
    const body = await req.json();
    const { systemPrompt, messages, files, model, domainId } = body;

    if (!systemPrompt || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "systemPrompt and messages array are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Process attached files (native multimodal) ────────────────
    const NATIVE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const inlineFileParts: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];

    if (Array.isArray(files) && files.length > 0) {
      for (const f of files.slice(0, 10)) {
        if (!f.base64 || !f.name) continue;
        const mime = f.mimeType || "application/octet-stream";
        if (NATIVE_MIME_TYPES.includes(mime) || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)) {
          inlineFileParts.push({ type: "text", text: `[Document: ${f.name}]` });
          inlineFileParts.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${f.base64}` },
          });
        }
      }
    }

    // ── Build gateway messages ────────────────────────────────────
    const sanitizedMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role,
      content: typeof msg.content === "string"
        ? msg.content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim()
        : msg.content,
    }));

    // Attach inline files to last user message
    if (inlineFileParts.length > 0) {
      const lastIdx = sanitizedMessages.length - 1;
      if (lastIdx >= 0 && sanitizedMessages[lastIdx].role === "user") {
        sanitizedMessages[lastIdx] = {
          ...sanitizedMessages[lastIdx],
          content: [
            { type: "text", text: sanitizedMessages[lastIdx].content },
            ...inlineFileParts,
          ] as any,
        };
      }
    }

    // Feature-flagged primary reasoner swap. When OPUS_PRIMARY_REASONER_ENABLED
    // is OFF, default model and request body are byte-for-byte identical to
    // the prior implementation (google/gemini-2.5-pro, no max_tokens, no
    // thinking).
    const opusFlagOn = (Deno.env.get("OPUS_PRIMARY_REASONER_ENABLED") ?? "true").toLowerCase() !== "false"
      && (Deno.env.get("OPUS_PRIMARY_REASONER_ENABLED") ?? "true") !== "0";
    const defaultModel = opusFlagOn ? "anthropic/claude-opus-4.7" : "google/gemini-2.5-pro";
    const selectedModel = model || defaultModel;

    console.log(
      `[sow-chunk-worker] domain=${domainId || "unknown"} | model=${selectedModel} | opus_flag=${opusFlagOn} | ` +
      `messages=${messages.length} | files=${inlineFileParts.length / 2} | ` +
      `systemPrompt=${systemPrompt.length} chars`
    );

    // ── Build gateway request ─────────────────────────────────────
    const buildReq = (msgs: typeof sanitizedMessages): Record<string, unknown> => {
      const req: Record<string, unknown> = {
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...msgs,
        ],
        stream: true,
      };
      if (opusFlagOn && selectedModel.startsWith("anthropic/")) {
        // Opus per-domain outputs run longer than Gemini equivalents; raise
        // max_tokens to match consolidation-call sizing in agent-chat.
        req.max_tokens = 8000;
        req.thinking = { type: "adaptive", effort: "high" };
        req.thinking_display = "summarized";
      }
      return req;
    };

    // ── Call via aiGateway.chatStream with transient-retry wrapper ──
    let streamBody: ReadableStream<Uint8Array> | null = null;
    let routedVia = "unknown";
    let routeReason = "";
    let metaPromise: Promise<{ thinking_summary: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; model: string }> | null = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt <= GATEWAY_MAX_RETRIES; attempt++) {
      try {
        const sr = await chatStream(buildReq(sanitizedMessages) as any, `sow-chunk-worker:${domainId || "unknown"}`);
        streamBody = sr.body;
        routedVia = sr.routed_via;
        routeReason = sr.reason;
        metaPromise = sr.meta;
        console.log(`[sow-chunk-worker] routed_via=${sr.routed_via} | reason=${sr.reason} | model=${selectedModel}`);
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        const status = typeof err?.status === "number" ? err.status : 0;
        const errBody = typeof err?.body === "string" ? err.body : "";

        // Multimodal MIME 400 fallback — strip images and retry once
        if (status === 400 && errBody.includes("MIME") && inlineFileParts.length > 0) {
          console.warn("[sow-chunk-worker] MIME 400, retrying text-only");
          const textOnlyMessages = sanitizedMessages.map((msg: any) => ({
            ...msg,
            content: typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")
                : msg.content,
          }));
          // Replace sanitizedMessages so subsequent retries use text-only
          sanitizedMessages.splice(0, sanitizedMessages.length, ...textOnlyMessages);
          inlineFileParts.length = 0;
          continue; // retry without delay
        }

        if ((status === 502 || status === 503) && attempt < GATEWAY_MAX_RETRIES) {
          const retryDelay = 2000 * (attempt + 1);
          console.warn(`[sow-chunk-worker] chatStream returned ${status}, retrying in ${retryDelay}ms (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }

        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "Usage limit reached" }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error(`[sow-chunk-worker] chatStream fatal error status=${status}:`, err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: "AI service temporarily unavailable" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!streamBody) {
      console.error("[sow-chunk-worker] No stream body after retry loop, lastErr:", lastErr);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Surface meta (thinking summary + usage) when the upstream stream ends.
    if (metaPromise) {
      metaPromise.then((m) => {
        if (m.thinking_summary && m.thinking_summary.length > 0) {
          console.log(`[sow-chunk-worker][thinking-audit] domain=${domainId || "unknown"} | model=${selectedModel} | thinking_chars=${m.thinking_summary.length} | routed_via=${routedVia}`);
        }
        if (m.usage && (m.usage.prompt_tokens || m.usage.completion_tokens)) {
          console.log(`[TOKEN_USAGE] sow-chunk-worker-meta | domain=${domainId || "unknown"} | model=${selectedModel} | prompt_tokens=${m.usage.prompt_tokens} | completion_tokens=${m.usage.completion_tokens} | total_tokens=${m.usage.total_tokens} | routed_via=${routedVia}`);
        }
      }).catch(() => { /* meta failures non-fatal */ });
    }

    // ── Direct SSE passthrough ────────────────────────────────────
    const passthroughBody = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const reader = streamBody!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let totalChars = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIdx: number;
            while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIdx);
              buffer = buffer.slice(newlineIdx + 1);
              if (line.trim() === "") {
                controller.enqueue(encoder.encode("\n"));
                continue;
              }
              if (line.startsWith("data: ") && line.slice(6).trim() !== "[DONE]") {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) totalChars += content.length;
                } catch { /* ignore */ }
              }
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
          if (buffer.trim()) {
            controller.enqueue(encoder.encode(buffer));
          }
          const elapsedMs = Date.now() - reqStartMs;
          console.log(`[sow-chunk-worker] Done | domain=${domainId || "unknown"} | chars=${totalChars} | elapsed=${elapsedMs}ms (${(elapsedMs / 1000).toFixed(1)}s) | routed_via=${routedVia}`);
        } catch (e) {
          console.error("[sow-chunk-worker] Stream error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(passthroughBody, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("[sow-chunk-worker] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

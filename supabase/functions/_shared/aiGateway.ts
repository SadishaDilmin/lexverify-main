/**
 * Hybrid AI Gateway — Model-Aware Routing with Parallel Processing
 *
 * Routes AI calls based on payload characteristics:
 * - Google models, no streaming, no tools → Vertex AI (europe-west4, EU)
 * - Everything else → Lovable Gateway
 * - Automatic fallback: Vertex failures retry via Lovable Gateway
 *
 * Usage:
 *   import { chat, parallelChat } from "../_shared/aiGateway.ts";
 *   const result = await chat({ model: "google/gemini-2.5-flash", messages: [...] });
 *   const results = await parallelChat([req1, req2, req3], { maxConcurrency: 3 });
 */

import { generateContent, extractTextFromResponse, type VertexRequest, type VertexContent, type VertexPart } from "./vertexClient.ts";
import { isVertexConfigured, inspectCredsState } from "./vertexAuth.ts";
import {
  callVertexAnthropic,
  streamVertexAnthropic,
  VERTEX_ANTHROPIC_MODEL_ID,
  type AnthropicMessage,
  type AnthropicContent,
  type VertexAnthropicRequest,
} from "./vertexAnthropicClient.ts";

// ── Feature flags ─────────────────────────────────────────────────────

/**
 * Master switch for Vertex Anthropic routing.
 * Default: true. Set to "false" to force anthropic/* models through the
 * Lovable Gateway (rollback path).
 */
export function isVertexAnthropicEnabled(): boolean {
  const v = Deno.env.get("VERTEX_ANTHROPIC_ENABLED");
  if (v == null) return true;
  return v.toLowerCase() !== "false" && v !== "0";
}

/**
 * Feature flag for the Opus 4.7 primary reasoner swap on SoW workloads.
 * Default: true. Set to "false" to preserve the prior byte-for-byte model
 * choices (openai/gpt-5 in agent-chat SoW, google/gemini-2.5-pro in
 * sow-chunk-worker, current consolidation models untouched).
 */
export function isOpusPrimaryReasonerEnabled(): boolean {
  const v = Deno.env.get("OPUS_PRIMARY_REASONER_ENABLED");
  if (v == null) return true;
  return v.toLowerCase() !== "false" && v !== "0";
}

/** Stable identifier for the primary reasoner model. */
export const OPUS_PRIMARY_REASONER_MODEL = "anthropic/claude-opus-4.7";

// ── Types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: string;
  content: any; // string or array of content parts (multimodal)
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: any;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

export interface ChatResponse {
  choices?: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  _routed_via?: "vertex" | "lovable-gateway";
}

// ── Model Mapping ─────────────────────────────────────────────────────

const GATEWAY_TO_VERTEX: Record<string, string> = {
  "google/gemini-2.5-pro": "gemini-2.5-pro-preview-06-05",
  "google/gemini-2.5-flash": "gemini-2.5-flash-preview-05-20",
  "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite-preview-06-17",
  "google/gemini-3-flash-preview": "gemini-3-flash-preview",
  "google/gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
};

// ── Routing Logic ─────────────────────────────────────────────────────

type AnthropicRouteDecision =
  | { route: "vertex-anthropic" }
  | { route: "lovable-gateway"; reason: string };

/**
 * Emit one structured JSON log line capturing the anthropic routing decision
 * and the credential-cache state at decision time. Designed to be the single
 * source of truth for "why did this anthropic call fall back to Lovable".
 *
 * Never logs credential contents.
 */
function logAnthropicRoutingDecision(
  logContext: string,
  routing_decision: "vertex" | "lovable-gateway",
  decision_reason: string,
  vertex_configured: boolean,
): void {
  const credsBefore = inspectCredsState();
  // creds_cache_hit reflects what the *current* parseCredentials() call would
  // see: if cache_state is "empty" before we touch it, the next parse is a
  // miss; otherwise it's a hit. We capture this BEFORE isVertexConfigured()
  // ran in the caller — which means by the time this log fires, the cache
  // may have just been populated. To keep the signal honest, we record both:
  // the snapshot we have, and a note that we observe post-decision state.
  console.log(
    JSON.stringify({
      log: "ai-gateway-anthropic-routing-decision",
      context: logContext,
      routing_decision,
      decision_reason,
      vertex_configured,
      creds_cache_hit: credsBefore.cache_state !== "empty",
      creds_cache_state: credsBefore.cache_state,
      creds_cache_error_name: credsBefore.cache_error_name,
      creds_parse_succeeded: credsBefore.cache_state === "ok",
      env_var_present: credsBefore.env_var_present,
    }),
  );
}

/** Decide whether an anthropic/* model should go through Vertex Anthropic. */
function decideAnthropicRoute(req: ChatRequest, logContext = "aiGateway"): AnthropicRouteDecision {
  if (!req.model.startsWith("anthropic/")) {
    return { route: "lovable-gateway", reason: "not-anthropic-model" };
  }
  if (!isVertexAnthropicEnabled()) {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "vertex-anthropic-disabled", false);
    return { route: "lovable-gateway", reason: "vertex-anthropic-disabled" };
  }
  if (req.tools && req.tools.length > 0) {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "tools-not-supported-on-vertex-anthropic", false);
    return { route: "lovable-gateway", reason: "tools-not-supported-on-vertex-anthropic" };
  }
  let vertexConfigured = false;
  try {
    vertexConfigured = isVertexConfigured();
    if (!vertexConfigured) {
      logAnthropicRoutingDecision(logContext, "lovable-gateway", "vertex-credentials-missing", false);
      return { route: "lovable-gateway", reason: "vertex-credentials-missing" };
    }
  } catch {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "vertex-credentials-malformed", false);
    return { route: "lovable-gateway", reason: "vertex-credentials-malformed" };
  }
  // Streaming Anthropic on Vertex is supported via streamRawPredict, but the
  // current public chat() entry-point is non-streaming. Streaming consumers
  // call streamVertexAnthropic directly. If a caller passes stream:true here,
  // fall back to the gateway to preserve byte-for-byte SSE shape.
  if (req.stream) {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "stream-not-handled-by-non-streaming-chat", vertexConfigured);
    return { route: "lovable-gateway", reason: "stream-not-handled-by-non-streaming-chat" };
  }
  logAnthropicRoutingDecision(logContext, "vertex", "anthropic-routed-via-vertex", vertexConfigured);
  return { route: "vertex-anthropic" };
}

/**
 * Streaming variant of decideAnthropicRoute. Same gates, but does not reject
 * on stream:true (since the streaming entry point is the only legitimate
 * place to ask for streaming).
 */
function anthropicStreamRouteReason(req: ChatRequest, logContext = "aiGateway"):
  | "vertex-anthropic"
  | "vertex-anthropic-disabled"
  | "tools-not-supported-on-vertex-anthropic"
  | "vertex-credentials-missing"
  | "vertex-credentials-malformed" {
  if (!isVertexAnthropicEnabled()) {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "vertex-anthropic-disabled", false);
    return "vertex-anthropic-disabled";
  }
  if (req.tools && req.tools.length > 0) {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "tools-not-supported-on-vertex-anthropic", false);
    return "tools-not-supported-on-vertex-anthropic";
  }
  let vertexConfigured = false;
  try {
    vertexConfigured = isVertexConfigured();
    if (!vertexConfigured) {
      logAnthropicRoutingDecision(logContext, "lovable-gateway", "vertex-credentials-missing", false);
      return "vertex-credentials-missing";
    }
  } catch {
    logAnthropicRoutingDecision(logContext, "lovable-gateway", "vertex-credentials-malformed", false);
    return "vertex-credentials-malformed";
  }
  logAnthropicRoutingDecision(logContext, "vertex", "anthropic-routed-via-vertex", vertexConfigured);
  return "vertex-anthropic";
}

function shouldRouteToVertex(req: ChatRequest): boolean {
  // Stream → Lovable Gateway
  if (req.stream) return false;

  // Tools → Lovable Gateway (Vertex tool calling format differs)
  if (req.tools && req.tools.length > 0) return false;

  // Non-Google model → Lovable Gateway
  if (!req.model.startsWith("google/")) return false;

  // Model not mapped → Lovable Gateway
  if (!GATEWAY_TO_VERTEX[req.model]) return false;

  // Check Vertex credentials are present AND parseable as valid JSON.
  // If malformed, fall back to the Lovable Gateway instead of attempting
  // Vertex calls that would fail and waste retry budget.
  try {
    if (!isVertexConfigured()) return false;
  } catch {
    return false;
  }

  return true;
}

// ── OpenAI → Vertex Format Conversion ─────────────────────────────────

function convertMessageToVertex(msg: ChatMessage): { role: "user" | "model"; parts: VertexPart[] } | null {
  const role = msg.role === "assistant" || msg.role === "model" ? "model" : "user";

  // Skip system messages (handled separately)
  if (msg.role === "system") return null;

  const parts: VertexPart[] = [];

  if (typeof msg.content === "string") {
    parts.push({ text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === "text" && part.text) {
        parts.push({ text: part.text });
      } else if (part.type === "image_url" && part.image_url?.url) {
        const url = part.image_url.url;
        // Convert data URI to Vertex inlineData
        const dataUriMatch = url.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUriMatch) {
          parts.push({
            inlineData: {
              mimeType: dataUriMatch[1],
              data: dataUriMatch[2],
            },
          });
        } else {
          // External URL — pass as text reference
          parts.push({ text: `[Image: ${url}]` });
        }
      }
    }
  }

  if (parts.length === 0) return null;
  return { role, parts };
}

function convertToVertexRequest(req: ChatRequest): VertexRequest {
  const vertexReq: VertexRequest = { contents: [] };

  // Extract system message
  const systemMsg = req.messages.find((m) => m.role === "system");
  if (systemMsg && typeof systemMsg.content === "string") {
    vertexReq.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  // Convert remaining messages
  for (const msg of req.messages) {
    const converted = convertMessageToVertex(msg);
    if (converted) {
      vertexReq.contents.push(converted as VertexContent);
    }
  }

  // Generation config
  const genConfig: any = {};
  if (req.temperature !== undefined) genConfig.temperature = req.temperature;
  if (req.max_tokens !== undefined) genConfig.maxOutputTokens = req.max_tokens;
  if (Object.keys(genConfig).length > 0) {
    vertexReq.generationConfig = genConfig;
  }

  return vertexReq;
}

function convertVertexToOpenAI(vertexText: string, model: string): ChatResponse {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: vertexText,
        },
        finish_reason: "stop",
        index: 0,
      },
    ],
    model,
    _routed_via: "vertex",
  };
}

// ── Lovable Gateway Call ──────────────────────────────────────────────

async function callLovableGateway(req: ChatRequest, logContext: string): Promise<ChatResponse> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Lovable Gateway error: ${response.status} — ${errText.slice(0, 300)}`);
    (err as any).status = response.status;
    throw err;
  }

  const result = await response.json();
  result._routed_via = "lovable-gateway";
  return result;
}

// ── Vertex AI Call ────────────────────────────────────────────────────

async function callVertexAI(req: ChatRequest, logContext: string): Promise<ChatResponse> {
  const vertexModel = GATEWAY_TO_VERTEX[req.model];
  if (!vertexModel) throw new Error(`No Vertex mapping for model: ${req.model}`);

  const vertexReq = convertToVertexRequest(req);
  const result = await generateContent(vertexModel, vertexReq, logContext);

  if (!result) {
    throw new Error("Vertex AI returned null response");
  }

  const text = extractTextFromResponse(result);
  const response = convertVertexToOpenAI(text, req.model);

  // Map usage metadata
  if (result.usageMetadata) {
    response.usage = {
      prompt_tokens: result.usageMetadata.promptTokenCount,
      completion_tokens: result.usageMetadata.candidatesTokenCount,
      total_tokens: result.usageMetadata.totalTokenCount,
    };
  }

  return response;
}

// ── OpenAI → Anthropic Format Conversion (Vertex Anthropic) ───────────

function convertMessageToAnthropic(msg: ChatMessage): AnthropicMessage | null {
  if (msg.role === "system") return null;
  const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";

  if (typeof msg.content === "string") {
    return { role, content: msg.content };
  }

  if (Array.isArray(msg.content)) {
    const parts: AnthropicContent[] = [];
    for (const part of msg.content) {
      if (part.type === "text" && typeof part.text === "string") {
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image_url" && part.image_url?.url) {
        const m = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          parts.push({
            type: "image",
            source: { type: "base64", media_type: m[1], data: m[2] },
          });
        } else {
          parts.push({ type: "text", text: `[Image: ${part.image_url.url}]` });
        }
      }
    }
    if (parts.length === 0) return null;
    return { role, content: parts };
  }

  return null;
}

/**
 * Build a Vertex Anthropic request from a Chat Gateway request.
 *
 * - System messages are hoisted into the top-level `system` field.
 * - Gemini-only generation params are stripped.
 * - max_tokens defaults to 4096 if the caller does not supply one (Anthropic
 *   requires this field; gateway callers may have omitted it).
 * - The caller's `thinking` block (if any) is passed through.
 */
function convertToVertexAnthropicRequest(req: ChatRequest): VertexAnthropicRequest {
  const systemMsg = req.messages.find((m) => m.role === "system");
  let systemText: string | undefined;
  if (systemMsg && typeof systemMsg.content === "string") {
    systemText = systemMsg.content;
  } else if (systemMsg && Array.isArray(systemMsg.content)) {
    systemText = systemMsg.content
      .filter((p: any) => p.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("\n");
  }

  const messages: AnthropicMessage[] = [];
  for (const m of req.messages) {
    const converted = convertMessageToAnthropic(m);
    if (converted) messages.push(converted);
  }

  const payload: VertexAnthropicRequest = {
    anthropic_version: "vertex-2023-10-16",
    messages,
    max_tokens: typeof req.max_tokens === "number" ? req.max_tokens : 4096,
  };
  if (systemText) payload.system = systemText;
  if (typeof req.temperature === "number") payload.temperature = req.temperature;
  if (typeof req.top_p === "number") payload.top_p = req.top_p;
  if (req.thinking && typeof req.thinking === "object") {
    payload.thinking = req.thinking;
  }
  return payload;
}

async function callVertexAnthropicViaGateway(
  req: ChatRequest,
  logContext: string,
): Promise<ChatResponse> {
  const payload = convertToVertexAnthropicRequest(req);
  const result = await callVertexAnthropic(payload, logContext);

  // Concatenate all "text" content blocks. "thinking" blocks are kept out of
  // user-visible content per the routing contract.
  let text = "";
  let thinkingChars = 0;
  for (const block of result.content || []) {
    if (block.type === "text" && typeof block.text === "string") {
      text += block.text;
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      thinkingChars += block.thinking.length;
    }
  }
  if (thinkingChars > 0) {
    console.log(
      `[${logContext}] anthropic-thinking-summary chars=${thinkingChars} (excluded from content)`,
    );
  }

  return {
    choices: [
      {
        message: { role: "assistant", content: text },
        finish_reason: result.stop_reason || "stop",
        index: 0,
      },
    ],
    model: req.model,
    usage: {
      prompt_tokens: result.usage?.input_tokens ?? 0,
      completion_tokens: result.usage?.output_tokens ?? 0,
      total_tokens: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    },
    _routed_via: "vertex",
  };
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Send a chat completion request with automatic routing.
 *
 * Routing decision tree:
 *   1. anthropic/* models → Vertex Anthropic (europe-west4)
 *      unless flag-disabled, tools requested, streaming, or creds missing.
 *   2. Google models (non-streaming, no tools) → Vertex AI (EU)
 *   3. Everything else → Lovable Gateway
 * Vertex failures automatically fall back to Lovable Gateway.
 */
export async function chat(req: ChatRequest, logContext = "aiGateway"): Promise<ChatResponse> {
  // Anthropic routing
  if (req.model.startsWith("anthropic/")) {
    const decision = decideAnthropicRoute(req, logContext);
    if (decision.route === "vertex-anthropic") {
      try {
        console.log(`[aiGateway] ${logContext} → Vertex Anthropic (${req.model})`);
        const result = await callVertexAnthropicViaGateway(req, logContext);
        console.log(`[aiGateway] ${logContext} ✅ Vertex Anthropic success`);
        return result;
      } catch (err) {
        console.warn(
          `[aiGateway] ${logContext} Vertex Anthropic failed, falling back to Lovable Gateway:`,
          err instanceof Error ? err.message : err,
        );
        // Fall through to Lovable Gateway
      }
    } else {
      console.log(
        `[aiGateway] ${logContext} → Lovable Gateway (${req.model}) | reason=${decision.reason}`,
      );
    }
    return callLovableGateway(req, logContext);
  }

  const useVertex = shouldRouteToVertex(req);

  if (useVertex) {
    try {
      console.log(`[aiGateway] ${logContext} → Vertex AI (${req.model})`);
      const result = await callVertexAI(req, logContext);
      console.log(`[aiGateway] ${logContext} ✅ Vertex AI success`);
      return result;
    } catch (err) {
      console.warn(
        `[aiGateway] ${logContext} Vertex AI failed, falling back to Lovable Gateway:`,
        err instanceof Error ? err.message : err,
      );
      // Fall through to Lovable Gateway
    }
  }

  console.log(`[aiGateway] ${logContext} → Lovable Gateway (${req.model})`);
  return callLovableGateway(req, logContext);
}

/**
 * Run multiple independent chat requests in parallel with concurrency control.
 *
 * @param requests - Array of chat requests to execute
 * @param opts - Options: maxConcurrency (default 4), logContext prefix
 * @returns Array of responses in the same order as requests
 */
export async function parallelChat(
  requests: ChatRequest[],
  opts?: { maxConcurrency?: number; logContext?: string },
): Promise<ChatResponse[]> {
  const maxConcurrency = opts?.maxConcurrency ?? 4;
  const logPrefix = opts?.logContext ?? "parallelChat";

  if (requests.length === 0) return [];

  // If within concurrency limit, run all at once
  if (requests.length <= maxConcurrency) {
    return Promise.all(
      requests.map((req, i) => chat(req, `${logPrefix}[${i}]`)),
    );
  }

  // Otherwise, use a concurrency pool
  const results: ChatResponse[] = new Array(requests.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < requests.length) {
      const idx = nextIdx++;
      try {
        results[idx] = await chat(requests[idx], `${logPrefix}[${idx}]`);
      } catch (err) {
        console.error(`[aiGateway] ${logPrefix}[${idx}] failed:`, err);
        // Return an empty response on failure
        results[idx] = {
          choices: [{ message: { role: "assistant", content: "" }, finish_reason: "error", index: 0 }],
          _routed_via: "lovable-gateway",
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrency, requests.length) }, () => worker()),
  );

  return results;
}

/**
 * Extract text content from a ChatResponse.
 * Convenience helper for the common case.
 */
export function extractContent(response: ChatResponse): string {
  return response.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Extract tool call arguments from a ChatResponse.
 * Returns parsed JSON or null.
 */
export function extractToolArgs(response: ChatResponse): any | null {
  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return null;
  try {
    return typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  } catch {
    return null;
  }
}

// ── Streaming Public API ──────────────────────────────────────────────

export interface ChatStreamResult {
  /**
   * SSE stream in OpenAI chat.completion.chunk format.
   * Each emitted chunk is a `data: {...}\n\n` line. Consumers can pipe this
   * directly into existing SSE parsers (e.g. collectStreamedResponse in
   * agent-chat) without translation.
   */
  body: ReadableStream<Uint8Array>;
  /** Which backend produced the stream. */
  routed_via: "vertex-anthropic" | "lovable-gateway";
  /** Reason for routing decision (always set, useful for audit logs). */
  reason: string;
  /**
   * Resolves when the upstream stream ends. Carries metadata captured during
   * streaming. For Anthropic-routed streams, `thinking_summary` is populated
   * with the full out-of-band thinking content (which was NEVER emitted as
   * user-visible deltas). For Lovable Gateway streams, it is empty.
   */
  meta: Promise<{
    thinking_summary: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model: string;
  }>;
}

/**
 * Send a streaming chat completion request with automatic routing.
 *
 * Routing decision tree (mirrors `chat()` but for streams):
 *   1. anthropic/* + flag-on + creds OK → Vertex Anthropic streamRawPredict
 *      (europe-west4). SSE is translated from Anthropic events → OpenAI
 *      chat.completion.chunk format. "thinking" content blocks are buffered
 *      out-of-band and surfaced via the meta promise; only "text" blocks
 *      become OpenAI delta chunks.
 *   2. Otherwise → Lovable Gateway (no translation needed).
 * Vertex failure → automatic fallback to Lovable Gateway.
 */
export async function chatStream(
  req: ChatRequest,
  logContext = "aiGateway",
): Promise<ChatStreamResult> {
  // Ensure stream:true so downstream callers can't accidentally request
  // non-streaming via this entry point.
  const streamReq: ChatRequest = { ...req, stream: true };

  // Anthropic routing — same gates as decideAnthropicRoute, minus the
  // stream:true rejection (which only applies to the non-streaming chat()
  // entry point). Decision is logged so audit consumers see the reason.
  if (streamReq.model.startsWith("anthropic/")) {
    const reason = anthropicStreamRouteReason(streamReq, logContext);
    if (reason === "vertex-anthropic") {
      try {
        console.log(`[aiGateway] ${logContext} → Vertex Anthropic stream (${streamReq.model})`);
        const payload = convertToVertexAnthropicRequest(streamReq);
        const { body, meta: rawMeta } = await streamVertexAnthropic(payload, logContext);
        const meta = rawMeta.then((m) => ({
          thinking_summary: m.thinking_summary,
          usage: {
            prompt_tokens: m.usage.input_tokens,
            completion_tokens: m.usage.output_tokens,
            total_tokens: m.usage.input_tokens + m.usage.output_tokens,
          },
          model: m.model,
        }));
        return {
          body,
          routed_via: "vertex-anthropic",
          reason: "anthropic-routed-via-vertex",
          meta,
        };
      } catch (err) {
        console.warn(
          `[aiGateway] ${logContext} Vertex Anthropic stream failed, falling back to Lovable Gateway:`,
          err instanceof Error ? err.message : err,
        );
        return callLovableGatewayStream(streamReq, logContext, "vertex-anthropic-error-fallback");
      }
    }
    console.log(`[aiGateway] ${logContext} → Lovable Gateway stream (${streamReq.model}) | reason=${reason}`);
    return callLovableGatewayStream(streamReq, logContext, reason);
  }

  // Non-anthropic models go straight to Lovable Gateway. (Vertex Gemini does
  // not currently support streaming through this gateway path; the existing
  // chat() method handles non-streaming Vertex Gemini routing.)
  console.log(`[aiGateway] ${logContext} → Lovable Gateway stream (${streamReq.model})`);
  return callLovableGatewayStream(streamReq, logContext, "non-anthropic-stream");
}

async function callLovableGatewayStream(
  req: ChatRequest,
  logContext: string,
  reason: string,
): Promise<ChatStreamResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    const err = new Error(
      `Lovable Gateway stream error: ${response.status} — ${errText.slice(0, 400)}`,
    );
    (err as any).status = response.status;
    (err as any).body = errText;
    throw err;
  }

  // For Lovable Gateway streams there is no out-of-band thinking content to
  // capture. Token usage is included in the final SSE chunk by the upstream
  // gateway and will be parsed by callers' existing collectStreamedResponse.
  const meta = Promise.resolve({
    thinking_summary: "",
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: req.model,
  });

  return {
    body: response.body,
    routed_via: "lovable-gateway",
    reason,
    meta,
  };
}

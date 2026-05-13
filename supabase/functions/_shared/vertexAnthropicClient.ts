/**
 * Vertex Anthropic Client — claude-opus-4.7 via Vertex AI (europe-west4, EU residency)
 *
 * Calls Anthropic Messages API through Vertex's :rawPredict / :streamRawPredict
 * endpoints, preserving EU data residency.
 *
 * Endpoint:
 *   POST https://europe-west4-aiplatform.googleapis.com/v1/projects/{PROJECT}/
 *        locations/europe-west4/publishers/anthropic/models/{MODEL}:rawPredict
 *
 * Request body uses the Anthropic Messages API format with:
 *   anthropic_version: "vertex-2023-10-16"
 *
 * Streaming SSE rules (CRITICAL):
 *   - "thinking" content_block events are buffered into a thinking_summary
 *     and surfaced in the final return value's `thinking_summary` field.
 *   - Only "text" content_block events are emitted as OpenAI chat.completion.chunk
 *     deltas to the SSE consumer.
 *   - Client SSE parsers MUST NEVER see thinking content as response text.
 */

import { getAccessToken, getProjectId, VertexConfigError } from "./vertexAuth.ts";

// ── Constants ─────────────────────────────────────────────────────────

const VERTEX_REGION = "europe-west4";
// Vertex Anthropic publisher model id. Vertex's resolved version may differ;
// it's surfaced via the response model field and logged for provenance.
export const VERTEX_ANTHROPIC_MODEL_ID = "claude-opus-4-7";
const ANTHROPIC_VERTEX_VERSION = "vertex-2023-10-16";

// ── Types ─────────────────────────────────────────────────────────────

export interface AnthropicTextContent {
  type: "text";
  text: string;
}

export interface AnthropicImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export type AnthropicContent = AnthropicTextContent | AnthropicImageContent;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContent[];
}

export interface AnthropicThinkingConfig {
  type: "enabled" | "adaptive";
  budget_tokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface VertexAnthropicRequest {
  anthropic_version: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  thinking?: AnthropicThinkingConfig;
  stream?: boolean;
}

export interface VertexAnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text" | "thinking";
    text?: string;
    thinking?: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// ── Endpoint helper ───────────────────────────────────────────────────

function buildEndpoint(model: string, streaming: boolean): string {
  const project = getProjectId();
  const verb = streaming ? "streamRawPredict" : "rawPredict";
  return `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${VERTEX_REGION}/publishers/anthropic/models/${model}:${verb}`;
}

// ── Non-streaming call ────────────────────────────────────────────────

export async function callVertexAnthropic(
  payload: VertexAnthropicRequest,
  logContext = "vertexAnthropic",
): Promise<VertexAnthropicResponse> {
  const token = await getAccessToken();
  const endpoint = buildEndpoint(VERTEX_ANTHROPIC_MODEL_ID, false);

  // Ensure required fields
  const body: VertexAnthropicRequest = {
    ...payload,
    anthropic_version: ANTHROPIC_VERTEX_VERSION,
    stream: false,
  };

  const start = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    const elapsed = Date.now() - start;
    console.error(
      `[${logContext}] Vertex Anthropic ${response.status} after ${elapsed}ms: ${errText.slice(0, 600)}`,
    );
    const err = new Error(
      `Vertex Anthropic error ${response.status}: ${errText.slice(0, 600)}`,
    );
    (err as any).status = response.status;
    (err as any).body = errText;
    throw err;
  }

  const result = (await response.json()) as VertexAnthropicResponse;
  const elapsed = Date.now() - start;
  console.log(
    `[${logContext}] Vertex Anthropic ✅ ${elapsed}ms | model=${result.model} | ` +
      `input_tokens=${result.usage?.input_tokens} | output_tokens=${result.usage?.output_tokens}`,
  );
  return result;
}

// ── Streaming SSE translation ─────────────────────────────────────────

/**
 * Stream from Vertex Anthropic and translate Anthropic SSE events to
 * OpenAI chat.completion.chunk SSE format.
 *
 * Returns a ReadableStream of OpenAI-format SSE bytes plus a promise that
 * resolves to the captured thinking_summary and usage when the stream ends.
 *
 * CRITICAL: thinking content_blocks are NEVER emitted as text deltas.
 * They are buffered into thinking_summary and returned via the meta promise.
 */
export interface VertexAnthropicStreamResult {
  /** SSE stream in OpenAI chat.completion.chunk format. */
  body: ReadableStream<Uint8Array>;
  /** Resolves when the upstream stream ends, with captured metadata. */
  meta: Promise<{
    thinking_summary: string;
    usage: { input_tokens: number; output_tokens: number };
    stop_reason: string | null;
    model: string;
  }>;
}

export async function streamVertexAnthropic(
  payload: VertexAnthropicRequest,
  logContext = "vertexAnthropic",
): Promise<VertexAnthropicStreamResult> {
  const token = await getAccessToken();
  const endpoint = buildEndpoint(VERTEX_ANTHROPIC_MODEL_ID, true);

  const body: VertexAnthropicRequest = {
    ...payload,
    anthropic_version: ANTHROPIC_VERTEX_VERSION,
    stream: true,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    console.error(
      `[${logContext}] Vertex Anthropic stream ${response.status}: ${errText.slice(0, 600)}`,
    );
    const err = new Error(
      `Vertex Anthropic stream error ${response.status}: ${errText.slice(0, 600)}`,
    );
    (err as any).status = response.status;
    (err as any).body = errText;
    throw err;
  }

  let resolveMeta!: (v: {
    thinking_summary: string;
    usage: { input_tokens: number; output_tokens: number };
    stop_reason: string | null;
    model: string;
  }) => void;
  const meta = new Promise<{
    thinking_summary: string;
    usage: { input_tokens: number; output_tokens: number };
    stop_reason: string | null;
    model: string;
  }>((resolve) => {
    resolveMeta = resolve;
  });

  const upstream = response.body;
  const chunkId = `chatcmpl-vertex-anthropic-${crypto.randomUUID()}`;
  const createdSec = Math.floor(Date.now() / 1000);

  const translated = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      // Per-block state. Anthropic streams content blocks indexed by integer.
      const blockTypes = new Map<number, "text" | "thinking" | "other">();
      let thinkingSummary = "";
      let usage = { input_tokens: 0, output_tokens: 0 };
      let stopReason: string | null = null;
      let modelName = VERTEX_ANTHROPIC_MODEL_ID;
      let firstTextEmitted = false;

      const emitDelta = (text: string) => {
        if (!text) return;
        const chunk = {
          id: chunkId,
          object: "chat.completion.chunk",
          created: createdSec,
          model: modelName,
          choices: [
            {
              index: 0,
              delta: firstTextEmitted
                ? { content: text }
                : { role: "assistant", content: text },
              finish_reason: null,
            },
          ],
        };
        firstTextEmitted = true;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      const emitFinish = () => {
        const finishChunk = {
          id: chunkId,
          object: "chat.completion.chunk",
          created: createdSec,
          model: modelName,
          choices: [{ index: 0, delta: {}, finish_reason: stopReason || "stop" }],
          usage: {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: usage.input_tokens + usage.output_tokens,
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      };

      const handleEvent = (eventName: string, dataStr: string) => {
        if (!dataStr) return;
        let data: any;
        try {
          data = JSON.parse(dataStr);
        } catch {
          return;
        }

        switch (eventName) {
          case "message_start": {
            if (data.message?.model) modelName = data.message.model;
            if (data.message?.usage) {
              usage.input_tokens = data.message.usage.input_tokens ?? usage.input_tokens;
              usage.output_tokens = data.message.usage.output_tokens ?? usage.output_tokens;
            }
            break;
          }
          case "content_block_start": {
            const idx = data.index;
            const blockType = data.content_block?.type;
            if (blockType === "text") {
              blockTypes.set(idx, "text");
              const initial = data.content_block?.text;
              if (typeof initial === "string" && initial.length > 0) {
                emitDelta(initial);
              }
            } else if (blockType === "thinking") {
              blockTypes.set(idx, "thinking");
              const initial = data.content_block?.thinking;
              if (typeof initial === "string" && initial.length > 0) {
                thinkingSummary += initial;
              }
            } else {
              blockTypes.set(idx, "other");
            }
            break;
          }
          case "content_block_delta": {
            const idx = data.index;
            const blockType = blockTypes.get(idx) ?? "other";
            const deltaType = data.delta?.type;
            if (blockType === "text" && deltaType === "text_delta") {
              const t = data.delta?.text;
              if (typeof t === "string") emitDelta(t);
            } else if (
              blockType === "thinking" &&
              (deltaType === "thinking_delta" || deltaType === "summary_delta")
            ) {
              const t = data.delta?.thinking ?? data.delta?.text;
              if (typeof t === "string") thinkingSummary += t;
            }
            // other delta types (signature_delta, input_json_delta, etc.) are ignored
            break;
          }
          case "content_block_stop": {
            // No-op: state already captured.
            break;
          }
          case "message_delta": {
            if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
            if (data.usage?.output_tokens != null) {
              usage.output_tokens = data.usage.output_tokens;
            }
            if (data.usage?.input_tokens != null) {
              usage.input_tokens = data.usage.input_tokens;
            }
            break;
          }
          case "message_stop": {
            // Final flush handled after loop.
            break;
          }
          case "ping":
          case "error":
          default:
            break;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Anthropic SSE events are separated by blank lines (\n\n) and have
          // "event: <name>\ndata: <json>" lines.
          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);

            let eventName = "message";
            let dataStr = "";
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                // Multi-line data is rare here; concatenate just in case.
                dataStr += line.slice(5).trim();
              }
            }
            handleEvent(eventName, dataStr);
          }
        }
        // Flush any tail (rare).
        if (buffer.trim().length > 0) {
          let eventName = "message";
          let dataStr = "";
          for (const line of buffer.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (dataStr) handleEvent(eventName, dataStr);
        }

        emitFinish();
        if (thinkingSummary) {
          console.log(
            `[${logContext}] Vertex Anthropic thinking_summary captured | chars=${thinkingSummary.length}`,
          );
        }
        console.log(
          `[${logContext}] Vertex Anthropic stream ✅ | model=${modelName} | ` +
            `input_tokens=${usage.input_tokens} | output_tokens=${usage.output_tokens} | ` +
            `stop_reason=${stopReason}`,
        );
        resolveMeta({
          thinking_summary: thinkingSummary,
          usage,
          stop_reason: stopReason,
          model: modelName,
        });
      } catch (e) {
        console.error(`[${logContext}] Vertex Anthropic stream error:`, e);
        try {
          emitFinish();
        } catch {
          /* ignore */
        }
        resolveMeta({
          thinking_summary: thinkingSummary,
          usage,
          stop_reason: stopReason,
          model: modelName,
        });
      } finally {
        controller.close();
      }
    },
  });

  return { body: translated, meta };
}

export { VertexConfigError };

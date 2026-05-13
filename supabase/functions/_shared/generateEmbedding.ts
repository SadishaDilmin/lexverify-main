/**
 * Shared embedding generation utility.
 *
 * Strategy:
 *  1. Try the Lovable AI gateway's OpenAI-compatible /v1/embeddings endpoint.
 *  2. If unsupported (404/400), fall back to a hardened chat-completion approach
 *     with temperature=0 and tool-calling for structured output.
 *
 * Both paths produce a normalised, EMBED_DIM-dimensional float vector.
 */

const EMBED_DIM = 256;
const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";
const MAX_RETRIES = 3;

// ── Primary: real embeddings endpoint ────────────────────────────────
async function tryDedicatedEmbedding(
  apiKey: string,
  text: string,
): Promise<number[] | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text.slice(0, 8000),
        dimensions: EMBED_DIM,
      }),
    });

    // If the gateway doesn't support embeddings, it returns 404 or 400
    if (res.status === 404 || res.status === 400 || res.status === 405) {
      console.log("[embedding] Dedicated endpoint not available, will use chat fallback");
      return null;
    }

    if (!res.ok) {
      const t = await res.text();
      console.warn(`[embedding] Dedicated endpoint error ${res.status}: ${t}`);
      return null;
    }

    const json = await res.json();

    // Log token usage if present
    if (json.usage) {
      console.log(
        `[TOKEN_USAGE] embedding | model=text-embedding-3-small | total_tokens=${json.usage.total_tokens}`,
      );
    }

    const vec: number[] = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) return null;

    return normalise(vec);
  } catch (err) {
    console.warn("[embedding] Dedicated endpoint failed:", err);
    return null;
  }
}

// ── Fallback: chat-completion with tool-calling ─────────────────────
async function chatFallbackEmbedding(
  apiKey: string,
  text: string,
  attempt = 0,
): Promise<number[]> {
  const truncated = text.slice(0, 2000);

  try {
    const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0, // deterministic output
        messages: [
          {
            role: "system",
            content: `You are an embedding generator. Given text, produce a ${EMBED_DIM}-dimensional numerical vector that captures semantic meaning. Output ONLY a JSON array of ${EMBED_DIM} floating point numbers between -1 and 1.`,
          },
          {
            role: "user",
            content: `Generate a ${EMBED_DIM}-dimensional embedding vector for this text. Output ONLY the JSON array:\n\n${truncated}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "store_embedding",
              description: "Store the embedding vector",
              parameters: {
                type: "object",
                properties: {
                  embedding: {
                    type: "array",
                    items: { type: "number" },
                    description: `${EMBED_DIM}-dimensional embedding vector`,
                  },
                },
                required: ["embedding"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "store_embedding" } },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Chat embedding failed (${res.status}): ${t}`);
    }

    const result = await res.json();

    if (result.usage) {
      console.log(
        `[TOKEN_USAGE] embedding-chat-fallback | model=gemini-2.5-flash-lite | prompt_tokens=${result.usage.prompt_tokens} | completion_tokens=${result.usage.completion_tokens} | total_tokens=${result.usage.total_tokens}`,
      );
    }

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No embedding returned from model");

    const parsed = JSON.parse(toolCall.function.arguments);
    let embedding: number[] = parsed.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) throw new Error("Invalid embedding format");

    // Sanitize non-finite values
    embedding = embedding.map((v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    });

    return normalise(embedding);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(`[embed-retry] Attempt ${attempt + 1}/${MAX_RETRIES} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return chatFallbackEmbedding(apiKey, text, attempt + 1);
    }
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
function normalise(vec: number[]): number[] {
  // Sanitize
  let embedding = vec.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });

  // Pad / truncate
  if (embedding.length < EMBED_DIM) {
    embedding = [...embedding, ...Array(EMBED_DIM - embedding.length).fill(0)];
  } else if (embedding.length > EMBED_DIM) {
    embedding = embedding.slice(0, EMBED_DIM);
  }

  // L2-normalise
  const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  if (mag === 0) throw new Error("Zero-magnitude embedding produced");
  return embedding.map((v) => v / mag);
}

// Cache to avoid re-embedding identical queries within a single invocation
const _cache = new Map<string, number[]>();

/**
 * Generate a EMBED_DIM-dimensional embedding for the given text.
 * Uses dedicated embeddings endpoint when available, otherwise
 * falls back to a deterministic chat-completion approach.
 */
export async function generateEmbedding(apiKey: string, text: string): Promise<number[]> {
  const cacheKey = text.slice(0, 200);
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  // Try dedicated endpoint first
  const dedicated = await tryDedicatedEmbedding(apiKey, text);
  if (dedicated) {
    _cache.set(cacheKey, dedicated);
    return dedicated;
  }

  // Fall back to chat-based
  const fallback = await chatFallbackEmbedding(apiKey, text);
  _cache.set(cacheKey, fallback);
  return fallback;
}

export { EMBED_DIM };

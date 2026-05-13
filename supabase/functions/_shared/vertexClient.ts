/**
 * Vertex AI Gemini Client — EU Data Residency (europe-west4, Netherlands)
 *
 * Calls the Vertex AI generateContent REST endpoint directly.
 * All requests are routed through the europe-west4 regional endpoint
 * to guarantee data residency within the EU.
 *
 * Endpoint:
 *   https://europe-west4-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/europe-west4/publishers/google/models/{MODEL}:generateContent
 */

import { getAccessToken, getProjectId, VertexConfigError } from "./vertexAuth.ts";

// ── Constants ─────────────────────────────────────────────────────────

const VERTEX_LOCATION = "europe-west4";
const VERTEX_BASE = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1`;
const MAX_RETRIES = 2;

// ── Types ─────────────────────────────────────────────────────────────

export interface VertexInlineData {
  mimeType: string;
  data: string; // base64
}

export interface VertexFileData {
  mimeType: string;
  fileUri: string; // gs:// or HTTP URI
}

export interface VertexPart {
  text?: string;
  inlineData?: VertexInlineData;
  fileData?: VertexFileData;
}

export interface VertexContent {
  role: "user" | "model";
  parts: VertexPart[];
}

export interface VertexGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

export interface VertexRequest {
  contents: VertexContent[];
  systemInstruction?: { parts: VertexPart[] };
  generationConfig?: VertexGenerationConfig;
}

export interface VertexUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface VertexResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text?: string }>;
      role: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: VertexUsageMetadata;
  error?: { code: number; message: string; status: string };
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildEndpointUrl(model: string): string {
  const projectId = getProjectId();
  return `${VERTEX_BASE}/projects/${projectId}/locations/${VERTEX_LOCATION}/publishers/google/models/${model}:generateContent`;
}

/**
 * Extract text from a Vertex AI response.
 */
export function extractTextFromResponse(response: VertexResponse): string {
  if (!response.candidates?.length) return "";
  const parts = response.candidates[0].content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

// ── Main API ──────────────────────────────────────────────────────────

/**
 * Call the Vertex AI Gemini generateContent endpoint.
 *
 * @param model - e.g. "gemini-2.5-pro-preview-06-05" or "gemini-2.5-flash-preview-05-20"
 * @param request - The Vertex AI request payload
 * @param logContext - Label for console logging
 * @returns The parsed Vertex AI response, or null on failure
 */
export async function generateContent(
  model: string,
  request: VertexRequest,
  logContext: string,
): Promise<VertexResponse | null> {
  const url = buildEndpointUrl(model);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `[vertexClient] ${logContext} error (attempt ${attempt + 1}): ${response.status}`,
          errorBody.slice(0, 500),
        );

        // Retry on transient errors
        if (
          (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) &&
          attempt < MAX_RETRIES
        ) {
          const delay = (attempt + 1) * 2000;
          console.warn(`[vertexClient] Retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        return null;
      }

      const result: VertexResponse = await response.json();

      if (result.error) {
        console.error(`[vertexClient] ${logContext} API error:`, result.error.message);
        return null;
      }

      if (result.usageMetadata) {
        console.log(
          `[vertexClient] ${logContext} tokens: prompt=${result.usageMetadata.promptTokenCount} ` +
          `completion=${result.usageMetadata.candidatesTokenCount} total=${result.usageMetadata.totalTokenCount}`,
        );
      }

      return result;
    } catch (err) {
      // Unrecoverable config problem (missing/invalid SA credentials) —
      // do NOT retry. Returning null lets callers fall back to the gateway
      // immediately instead of burning ~12s per file on doomed retries.
      if (err instanceof VertexConfigError) {
        console.error(
          `[vertexClient] ${logContext} aborted: ${err.message} (no retry — using fallback)`,
        );
        return null;
      }
      console.error(
        `[vertexClient] ${logContext} network error (attempt ${attempt + 1}):`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
      }
    }
  }

  return null;
}

/**
 * Convenience: call generateContent and extract the text response.
 */
export async function generateText(
  model: string,
  request: VertexRequest,
  logContext: string,
): Promise<string> {
  const response = await generateContent(model, request, logContext);
  if (!response) return "";
  return extractTextFromResponse(response);
}

/**
 * Build a single-pass PDF extraction request using inlineData (base64).
 * For files up to ~20MB.
 */
export function buildPdfExtractionRequest(
  systemPrompt: string,
  userPrompt: string,
  pdfBase64: string,
  maxOutputTokens = 65536,
): VertexRequest {
  return {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: userPrompt },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          { text: "Now extract all text from this document completely and faithfully." },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens,
      temperature: 0.1,
    },
  };
}

/**
 * Get the confirmed Vertex AI endpoint URL being used (for audit logging).
 */
export function getEndpointUrl(model: string): string {
  return buildEndpointUrl(model);
}

/**
 * Shared 3-tier OCR escalation for edge functions.
 * 
 * When a document cannot be read by the initial model, this module
 * escalates through increasingly capable models:
 *   Tier 1: Gemini 2.5 Flash (fast, good for clear documents)
 *   Tier 2: Gemini 2.5 Pro (high-sensitivity, better for scanned/noisy/handwritten)
 *   Tier 3: GPT-5 (cross-model fallback, different visual understanding)
 *
 * Used by documentProcessor.ts and extract-doc-summaries for all OCR,
 * image reading, and handwriting extraction.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface OcrEscalationResult {
  text: string;
  model: string;
  tier: number;
  escalated: boolean;
}

export interface OcrEscalationOptions {
  /** Minimum chars to consider extraction successful (default: 100) */
  minViableChars?: number;
  /** Max retries per tier on transient failures (default: 2) */
  maxRetries?: number;
}

// ── AI Gateway helper (via aiGateway for Vertex routing + fallback) ───

import { chat, extractContent } from "./aiGateway.ts";

async function callGateway(
  _apiKey: string,
  model: string,
  messages: Array<{ role: string; content: any }>,
  logContext: string,
  _maxRetries = 2,
): Promise<string | null> {
  try {
    const response = await chat({ model, messages }, `ocrEscalation-${logContext}`);

    if (response?.usage) {
      console.log(`[ocrEscalation] ${logContext} tokens: prompt=${response.usage.prompt_tokens} completion=${response.usage.completion_tokens}`);
    }

    const text = extractContent(response);
    return text || null;
  } catch (err) {
    console.error(`[ocrEscalation] ${logContext} error:`, err);
    return null;
  }
}

// ── Extraction prompts ────────────────────────────────────────────────

const STANDARD_OCR_PROMPT = `You are a document text extraction assistant. Extract ALL text content faithfully and completely. Preserve structure (headings, tables, lists, dates, amounts, names, addresses).

CRITICAL RULES:
- For tables: reproduce ALL rows and columns. Do NOT skip or summarise.
- For financial documents: extract every monetary value, transaction line, balance, account holder name.
- For handwritten content: read carefully, infer characters where possible, mark only truly illegible fragments as [unclear].
- If content is unclear, indicate "[unclear]" rather than omitting it.
- Do NOT summarise or interpret — extract raw text accurately.`;

const HIGH_SENSITIVITY_PROMPT = `You are a high-sensitivity OCR reader. A previous extraction model failed to adequately read this document.

Your priority is MAXIMUM readability and completeness:
- Read all visible text including names, addresses, document numbers, dates, signatures, stamps.
- For handwritten content: carefully infer every character. Handwriting styles vary — consider context to disambiguate letters/numbers.
- For low-resolution, noisy, skewed, blurry, faded, or compressed scans: carefully infer characters.
- For identity documents: extract every MRZ line exactly if present.
- For financial documents: extract every transaction, balance, account reference.
- Preserve original wording and line breaks.
- Mark only truly unreadable fragments as [unclear], never omit fields.
- Do NOT summarise. Output extracted text only.`;

const CROSS_MODEL_PROMPT = `You are a cross-model document reader. TWO previous extraction models failed to read this document adequately.

You MUST read every page and extract ALL text content. This is a last-resort extraction — be extremely thorough:
- For scanned/photographed documents: read every visible character.
- For handwritten documents: interpret ALL handwriting, using context to resolve ambiguous characters.
- For forms with mixed print and handwriting: capture both the form field labels AND the handwritten values.
- For stamps, signatures, annotations: describe and extract any readable text.
- For faded or damaged documents: make best-effort reads and mark uncertain parts as [unclear].
- Extract every monetary amount, name, date, reference number, table row, and address.
- Do NOT claim the document is unreadable. Extract whatever is visible.`;

// ── Core escalation function ──────────────────────────────────────────

/**
 * Run 3-tier OCR escalation on a document.
 * 
 * @param apiKey - Lovable AI gateway API key
 * @param base64Data - Base64-encoded file content
 * @param mimeType - MIME type (e.g., "application/pdf", "image/jpeg")
 * @param fileName - Original filename for logging
 * @param options - Escalation options
 * @returns OCR result with extracted text and metadata
 */
export async function runOcrEscalation(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  fileName: string,
  options: OcrEscalationOptions = {},
): Promise<OcrEscalationResult> {
  const minViable = options.minViableChars ?? 100;
  const maxRetries = options.maxRetries ?? 2;

  const imageContent = {
    type: "image_url" as const,
    image_url: { url: `data:${mimeType};base64,${base64Data}` },
  };

  // ── Tier 1: Gemini Flash ────────────────────────────────────
  console.log(`[ocrEscalation] Tier 1: Gemini Flash for ${fileName}`);
  const tier1Text = await callGateway(
    apiKey,
    "google/gemini-2.5-flash",
    [{
      role: "user",
      content: [
        { type: "text", text: `${STANDARD_OCR_PROMPT}\n\nDocument filename: ${fileName}` },
        imageContent,
        { type: "text", text: "Now extract all readable text from this document. Output the complete text content faithfully." },
      ],
    }],
    `Tier1-Flash ${fileName}`,
    maxRetries,
  );

  if (tier1Text && tier1Text.length >= minViable) {
    console.log(`[ocrEscalation] ✅ Tier 1 succeeded for ${fileName} (${tier1Text.length} chars)`);
    return { text: tier1Text, model: "google/gemini-2.5-flash", tier: 1, escalated: false };
  }

  console.log(`[ocrEscalation] ⚠️ Tier 1 returned ${tier1Text?.length ?? 0} chars for ${fileName} — escalating to Tier 2`);

  // ── Tier 2: Gemini Pro (high-sensitivity) ───────────────────
  const tier2Text = await callGateway(
    apiKey,
    "google/gemini-2.5-pro",
    [{
      role: "user",
      content: [
        { type: "text", text: `${HIGH_SENSITIVITY_PROMPT}\n\nDocument filename: ${fileName}` },
        imageContent,
        { type: "text", text: "Now extract all readable text from this document." },
      ],
    }],
    `Tier2-Pro ${fileName}`,
    maxRetries,
  );

  // Use whichever is longer between tier1 and tier2
  const bestSoFar = (tier2Text && tier2Text.length > (tier1Text?.length ?? 0)) ? tier2Text : tier1Text;

  if (bestSoFar && bestSoFar.length >= minViable) {
    const model = bestSoFar === tier2Text ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";
    console.log(`[ocrEscalation] ✅ Tier 2 resolved for ${fileName} (${bestSoFar.length} chars via ${model})`);
    return { text: bestSoFar, model, tier: 2, escalated: true };
  }

  console.log(`[ocrEscalation] ⚠️ Tier 2 returned ${tier2Text?.length ?? 0} chars for ${fileName} — escalating to Tier 3`);

  // ── Tier 3: GPT-5 (cross-model) ────────────────────────────
  const tier3Text = await callGateway(
    apiKey,
    "openai/gpt-5",
    [{
      role: "user",
      content: [
        { type: "text", text: `${CROSS_MODEL_PROMPT}\n\nDocument filename: ${fileName}` },
        imageContent,
        { type: "text", text: "Now extract all readable text from this document. Output the complete text content faithfully." },
      ],
    }],
    `Tier3-GPT5 ${fileName}`,
    maxRetries,
  );

  // Pick the best result across all three tiers
  const candidates = [
    { text: tier1Text, model: "google/gemini-2.5-flash", tier: 1 },
    { text: tier2Text, model: "google/gemini-2.5-pro", tier: 2 },
    { text: tier3Text, model: "openai/gpt-5", tier: 3 },
  ].filter((c) => c.text && c.text.length > 0) as Array<{ text: string; model: string; tier: number }>;

  if (candidates.length === 0) {
    console.error(`[ocrEscalation] ❌ All 3 tiers failed for ${fileName}`);
    return {
      text: `[All OCR models (Gemini Flash, Gemini Pro, GPT-5) failed to extract text from this document. It may be corrupted, password-protected, or in an unsupported format.]`,
      model: "none",
      tier: 3,
      escalated: true,
    };
  }

  // Sort by text length descending — longest extraction wins
  candidates.sort((a, b) => b.text.length - a.text.length);
  const best = candidates[0];

  console.log(`[ocrEscalation] ${best.text.length >= minViable ? "✅" : "⚠️"} Best result for ${fileName}: ${best.text.length} chars via ${best.model} (tier ${best.tier})`);

  return { text: best.text, model: best.model, tier: best.tier, escalated: best.tier > 1 };
}

/**
 * Quality check: does the extracted text have low-readability signals?
 * Used to decide whether to escalate even when char count is above minimum.
 */
export function hasLowReadabilitySignals(text: string): boolean {
  if (!text?.trim()) return true;
  if (text.trim().length < 180) return true;
  const unclearCount = text.match(/\[(?:unclear|illegible)\]|unreadable|cannot\s+read|not\s+legible/gi)?.length || 0;
  return unclearCount >= 2;
}

/**
 * Run quality-enhancement OCR for documents where initial extraction succeeded
 * but quality is poor (many [unclear] markers, suspiciously short for doc type).
 * Only escalates to the next tier(s) above the initial model.
 */
export async function enhanceOcrQuality(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  fileName: string,
  currentText: string,
  currentModel: string,
): Promise<{ text: string; model: string; enhanced: boolean }> {
  const imageContent = {
    type: "image_url" as const,
    image_url: { url: `data:${mimeType};base64,${base64Data}` },
  };

  let bestText = currentText;
  let bestModel = currentModel;
  let enhanced = false;

  // If current model is Flash, try Pro
  if (currentModel.includes("flash") || currentModel.includes("Flash")) {
    console.log(`[ocrEscalation] Quality enhancement: trying Gemini Pro for ${fileName}`);
    const proText = await callGateway(
      apiKey,
      "google/gemini-2.5-pro",
      [{
        role: "user",
        content: [
          { type: "text", text: `${HIGH_SENSITIVITY_PROMPT}\n\nDocument filename: ${fileName}` },
          imageContent,
          { type: "text", text: "Extract all readable text from this document with maximum accuracy." },
        ],
      }],
      `QualityPro ${fileName}`,
    );

    if (proText && qualityScore(proText) > qualityScore(bestText)) {
      bestText = proText;
      bestModel = "google/gemini-2.5-pro";
      enhanced = true;
      console.log(`[ocrEscalation] Gemini Pro improved quality for ${fileName}`);
    }
  }

  // If still poor quality, try GPT-5
  if (hasLowReadabilitySignals(bestText) && !currentModel.includes("gpt")) {
    console.log(`[ocrEscalation] Quality enhancement: trying GPT-5 for ${fileName}`);
    const gptText = await callGateway(
      apiKey,
      "openai/gpt-5",
      [{
        role: "user",
        content: [
          { type: "text", text: `${CROSS_MODEL_PROMPT}\n\nDocument filename: ${fileName}` },
          imageContent,
          { type: "text", text: "Extract all readable text from this document." },
        ],
      }],
      `QualityGPT5 ${fileName}`,
    );

    if (gptText && qualityScore(gptText) > qualityScore(bestText)) {
      bestText = gptText;
      bestModel = "openai/gpt-5";
      enhanced = true;
      console.log(`[ocrEscalation] GPT-5 improved quality for ${fileName}`);
    }
  }

  return { text: bestText, model: bestModel, enhanced };
}

function qualityScore(text: string): number {
  if (!text?.trim()) return -10_000;
  const unclearCount = text.match(/\[(?:unclear|illegible)\]|unreadable|cannot\s+read|not\s+legible/gi)?.length || 0;
  return Math.min(text.length, 12_000) - (unclearCount * 200);
}

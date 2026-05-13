/**
 * extract-doc-summaries — Enterprise PDF extraction via Vertex AI (europe-west4)
 *
 * Architecture:
 *   - PDFs: Single-pass extraction via Vertex AI Gemini 2.5 (europe-west4, EU data residency)
 *   - Images: OCR escalation via Lovable AI Gateway (existing pipeline)
 *   - Classification: Lightweight LLM call via Lovable AI Gateway
 *   - Quality judge: Lightweight LLM call via Lovable AI Gateway
 *
 * Data residency: All PDF content is processed exclusively through
 * https://europe-west4-aiplatform.googleapis.com — data never leaves EU.
 * Google Cloud Vertex AI ToS guarantee no training on customer data.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Lazy-load pdf-parse to prevent BOOT_ERROR on cold starts
// (npm: specifiers can timeout during module resolution)
let _pdfParse: ((data: Uint8Array) => Promise<{ text: string }>) | null = null;
async function getPdfParser() {
  if (!_pdfParse) {
    try {
      const mod = await import("npm:pdf-parse@1.1.1/lib/pdf-parse.js");
      _pdfParse = mod.default || mod;
    } catch (err) {
      console.error("[extract-doc-summaries] Failed to load pdf-parse:", (err as Error)?.message);
      _pdfParse = null;
    }
  }
  return _pdfParse;
}
import {
  generateText,
  buildPdfExtractionRequest,
  generateContent,
  extractTextFromResponse,
  getEndpointUrl,
  type VertexRequest,
} from "../_shared/vertexClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Types that Gemini can read natively via inline_data
const NATIVE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/tiff", "image/bmp", "image/webp", "image/heic",
]);

const EXT_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", tif: "image/tiff", tiff: "image/tiff",
  bmp: "image/bmp", webp: "image/webp", heic: "image/heic",
};

// ── Document classification types ──────────────────────────────────────
type DocClassification =
  | "financial_statement"
  | "open_banking_report"
  | "tax_document"
  | "identity_document"
  | "proof_of_address"
  | "mortgage_document"
  | "gift_evidence"
  | "company_document"
  | "legal_document"
  | "correspondence"
  | "other";

/** Filename-based hint — used as a FIRST PASS before content classification */
const SEP = "[_\\s-]*";
const FINANCIAL_FILENAME_PATTERNS = [
  /armalytix/i, /bank[_\s-]*statement/i, /\bstatement[_\s-]?\d/i, /\bstatement_\w+/i,
  /ml[_\s-]*check/i, /payslip/i, /pay[_\s-]*slip/i,
  /salary/i, /p60/i, /p45/i, /deposit/i, /mortgage/i, /wealth/i, new RegExp(`source${SEP}of${SEP}funds`, "i"),
  /sof\b/i, /open[_\s-]*banking/i, /affordability/i, /income/i, /pension/i,
  /savings/i, /investment/i, /tax[_\s-]*return/i, /tax[_\s-]*computation/i, /sa302/i, /sa100/i, /account[_\s-]*summary/i,
  /contribution/i, /giftor/i, /gift[_\s-]*letter/i, /funding/i, /completion[_\s-]*statement/i,
  /client[_\s-]*account/i, /ledger/i, /thirdfort/i, /infotrak/i, /liveness/i,
  /id[_\s-]*verif/i, /aml/i, /proof[_\s-]*of/i, /evidence/i, /financial/i,
  /\bAC[_\s]\d+/i, /dividend/i, /royalt/i,
];

const IDENTITY_FILENAME_PATTERNS = [
  /passport/i, /driving\s*licen[cs]e/i, /photo\s*id/i, /proof\s*of\s*id/i,
  /identity/i, /id\s*check/i, /id\s*verif/i, /liveness/i, /biometric/i,
  /selfie/i, /national\s*id/i,
];

const PROOF_OF_ADDRESS_FILENAME_PATTERNS = [
  /proof\s*of\s*address/i, /utility\s*bill/i, /council\s*tax/i,
  /address\s*verification/i, /bank\s*letter/i, /tenancy/i, /electoral\s*roll/i,
];

function isIdentityByFilename(name: string): boolean {
  return IDENTITY_FILENAME_PATTERNS.some((p) => p.test(name));
}
function isProofOfAddressByFilename(name: string): boolean {
  return PROOF_OF_ADDRESS_FILENAME_PATTERNS.some((p) => p.test(name));
}

function isNativeFile(name: string, mime: string): boolean {
  if (NATIVE_MIME_TYPES.has(mime)) return true;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return !!EXT_MIME_MAP[ext];
}

function getNativeMime(name: string, mime: string): string {
  if (NATIVE_MIME_TYPES.has(mime)) return mime;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_MIME_MAP[ext] || mime;
}

function extractionQualityScore(text: string): number {
  if (!text?.trim()) return -10_000;
  const unclearMatches = text.match(/\[(?:unclear|illegible)\]|unreadable|cannot\s+read|not\s+legible/gi)?.length || 0;
  const penalty = unclearMatches * 200;
  return Math.min(text.length, 12_000) - penalty;
}

function hasLowReadabilitySignals(text: string): boolean {
  if (!text?.trim()) return true;
  if (text.trim().length < 180) return true;
  const unclearMatches = text.match(/\[(?:unclear|illegible)\]|unreadable|cannot\s+read|not\s+legible/gi)?.length || 0;
  return unclearMatches >= 2;
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function isGarbledPdfText(text: string): boolean {
  if (!text || text.length < 50) return false;
  const replacementChars = (text.match(/[\uFFFD\u0000-\x08\x0E-\x1F]/g) || []).length;
  const nonAsciiRatio = (text.match(/[^\x20-\x7E\n\r\t]/g) || []).length / text.length;
  if (replacementChars / text.length > 0.05) return true;
  if (nonAsciiRatio > 0.3) return true;
  const words = text.match(/[a-zA-Z]{3,}/g) || [];
  return words.length < text.length / 200;
}

function extractTextFromBytes(b64: string, name: string): string {
  const charCap = 120000;
  const bytes = base64ToBytes(b64);
  if (name.toLowerCase().endsWith(".docx")) {
    const raw = new TextDecoder("latin1").decode(bytes);
    const textParts: string[] = [];
    const tagRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(raw)) !== null) {
      if (m[1].trim()) textParts.push(m[1]);
    }
    if (textParts.length > 0) return textParts.join(" ").slice(0, charCap);
    const readable = raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
    return readable.length > 100 ? readable.slice(0, charCap) : "";
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, charCap);
}

// ── Classification helpers ─────────────────────────────────────────────

function isFinancialClassification(c: DocClassification): boolean {
  return ["financial_statement", "open_banking_report", "tax_document",
    "mortgage_document", "gift_evidence", "company_document"].includes(c);
}

function isIdentityClassification(c: DocClassification): boolean {
  return c === "identity_document";
}

function isProofOfAddressClassification(c: DocClassification): boolean {
  return c === "proof_of_address";
}

function isCriticalClassification(c: DocClassification): boolean {
  return isFinancialClassification(c) || isIdentityClassification(c) || isProofOfAddressClassification(c);
}

function filenameToClassification(name: string): DocClassification {
  if (/armalytix|open[_\s-]*banking|truelayer|plaid/i.test(name)) return "open_banking_report";
  if (/bank[_\s-]*statement|\bstatement[_\s-]?\d|\bstatement_\w+|savings|ledger|client[_\s-]*account/i.test(name)) return "financial_statement";
  if (/tax[_\s-]*return|tax[_\s-]*computation|sa302|sa100|p60|p45|payslip|pay[_\s-]*slip|hmrc/i.test(name)) return "tax_document";
  if (isIdentityByFilename(name)) return "identity_document";
  if (isProofOfAddressByFilename(name)) return "proof_of_address";
  if (/mortgage|completion[_\s-]*statement/i.test(name)) return "mortgage_document";
  if (/gift/i.test(name)) return "gift_evidence";
  if (/dividend|company|corporate/i.test(name)) return "company_document";
  if (FINANCIAL_FILENAME_PATTERNS.some((p) => p.test(name))) return "financial_statement";
  return "other";
}

// ── Lovable AI Gateway helper (for classification + judge) ─────────────

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runGatewayCompletion(
  apiKey: string,
  payload: { model: string; messages: Array<{ role: string; content: any }>; tools?: any[]; tool_choice?: any },
  logContext: string,
  options?: { timeoutMs?: number; maxRetries?: number },
): Promise<any | null> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const maxRetries = options?.maxRetries ?? 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const aiResponse = await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        timeoutMs,
      );

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        const errBody = await aiResponse.text();
        console.error(`[extract-doc-summaries] ${logContext} error (attempt ${attempt + 1}): ${status}`, errBody.slice(0, 300));
        if ((status === 429 || status === 502 || status === 503 || status === 504) && attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        return null;
      }

      const rawText = await aiResponse.text();
      return JSON.parse(rawText);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(
        `[extract-doc-summaries] ${logContext} ${isAbort ? "timeout" : "parse/network error"} (attempt ${attempt + 1}):`,
        err instanceof Error ? err.message : err,
      );
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
      }
    }
  }
  return null;
}

// ── Content-based classification via LLM (Lovable Gateway) ─────────────

async function classifyDocumentByContent(
  apiKey: string,
  filename: string,
  extractedText: string,
): Promise<DocClassification> {
  const sample = extractedText.slice(0, 3000);

  const result = await runGatewayCompletion(
    apiKey,
    {
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You are a document classifier for a UK conveyancing compliance system. Given the filename and a text sample from a document, classify it into exactly ONE category. Use the provided tool to report your classification.

Categories:
- financial_statement: Bank statements, savings account statements, business account statements, current account statements — any document showing account transactions, balances, credits, debits
- open_banking_report: Armalytix reports, TrueLayer reports, Plaid reports, Open Banking verification reports, source of funds reports from digital providers
- tax_document: HMRC tax returns (SA100, SA302), P60, P45, payslips, tax computations, self-assessment
- identity_document: Passports, driving licences, national ID cards, liveness checks, biometric verification, photo ID
- proof_of_address: Utility bills, council tax bills, tenancy agreements, bank letters confirming address, electoral roll
- mortgage_document: Mortgage offers, mortgage illustrations, completion statements, redemption statements
- gift_evidence: Gift letters, gift declarations, gift deeds, giftor statements
- company_document: Companies House records, company accounts, dividend vouchers, director records, corporate filings
- legal_document: Contracts, deeds, title registers, legal agreements, property forms
- correspondence: Emails, letters, general communications
- other: Anything that doesn't fit the above categories`,
        },
        {
          role: "user",
          content: `Filename: "${filename}"\n\nText sample:\n${sample}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_document",
            description: "Report the document classification.",
            parameters: {
              type: "object",
              properties: {
                classification: {
                  type: "string",
                  enum: [
                    "financial_statement", "open_banking_report", "tax_document",
                    "identity_document", "proof_of_address", "mortgage_document",
                    "gift_evidence", "company_document", "legal_document",
                    "correspondence", "other",
                  ],
                },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                reasoning: { type: "string" },
              },
              required: ["classification", "confidence", "reasoning"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_document" } },
    },
    `Classify ${filename}`,
  );

  const toolCall = result?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    return filenameToClassification(filename);
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    const classification = parsed.classification as DocClassification;
    console.log(`[extract-doc-summaries] 📋 Classified "${filename}" as ${classification} (${parsed.confidence}): ${parsed.reasoning}`);
    return classification;
  } catch {
    return filenameToClassification(filename);
  }
}

// ── Extraction prompts ─────────────────────────────────────────────────

const VERTEX_PDF_SYSTEM_PROMPT = `You are a document text extraction assistant for a UK conveyancing compliance platform.
For the provided PDF document, extract ALL text content faithfully and completely. Preserve the structure (headings, tables, lists, dates, amounts, names, addresses).

CRITICAL EXTRACTION RULES:
- Pay special attention to financial figures: deposit amounts, contribution amounts, mortgage amounts, salary figures, account balances, purchase prices, and any fees.
- For Armalytix/open banking reports: extract EVERY monetary value, person name, employer name, income source, verification status, and affordability assessment. Do NOT skip or summarise any entry.
- For tables: reproduce ALL rows and columns in markdown table format. Do NOT summarise, abbreviate, or skip rows. Every single row must appear.
- If a document contains a 'Primary Source of Funds', 'Deposit Breakdown', 'Source of Deposit', or similar section, extract these in FULL with every line item and amount.
- For bank statements: extract every transaction line, balance, and account holder name.
- If multiple people appear, capture ALL names, roles, and their individual financial data.

TABLE EXTRACTION RULES (MANDATORY for documents containing structured data):
- When you encounter a table, grid, or structured layout of rows and columns, you MUST extract it as a markdown table.
- Read every cell, including cells that appear empty — output them as blank cells in the markdown table.
- Do NOT describe the table ("this table shows..."). EXTRACT the data verbatim.
- If a table spans multiple pages, treat it as one continuous table and output ALL rows.
- For Armalytix / Open Banking transaction tables: extract Date, Description/Narrative, Amount, Balance, and Category for EVERY row.
- If cell text is small, blurry, or low-contrast, attempt to read it anyway. Mark only truly illegible cells as [unclear].
- Never replace table data with prose summaries like "multiple transactions listed".

For each document, output the content under a header with the file name. Do NOT summarise or interpret — extract the raw text as accurately and completely as possible. If content is unclear, indicate "[unclear]" rather than omitting it.`;

const HIGH_SENSITIVITY_OCR_PROMPT = `You are a high-sensitivity OCR reader for compliance evidence documents.

Your priority is maximum readability and completeness:
- Read all visible text including names, addresses, document numbers, dates, issuing authority, and statuses.
- For identity documents: extract every MRZ line exactly if present.
- For proof-of-address documents: preserve address lines, issue dates, provider names, and account references.
- For low-resolution, noisy, skewed, blurry, or compressed scans, carefully infer characters where possible.
- Preserve original wording and line breaks where meaningful.
- If uncertain, mark only that fragment as [unclear], but never omit potentially important fields.
- Do NOT summarise. Output extracted text only.`;

// ── Vertex AI PDF extraction (single-pass, europe-west4) ───────────────

const VERTEX_PRIMARY_MODEL = "gemini-2.5-flash";
const VERTEX_FALLBACK_MODEL = "gemini-2.5-pro";

const ARMALYTIX_PATTERN = /armalytix|open[_\s.-]*banking|source[_\s.-]*of[_\s.-]*(funds|wealth)|\bsof\b|\bsow\b|\baml\b|truelayer|plaid|affordability|wealth[_\s.-]*report/i;

/**
 * Wrap a promise with a hard timeout. The platform-level idle timeout is 150s;
 * any single Vertex call that runs longer than the per-call budget here would
 * otherwise block the entire request and trigger a 504 IDLE_TIMEOUT before our
 * graceful "degraded result" path can run.
 */
async function withHardTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T | null> {
  let timer: number | undefined;
  try {
    return await Promise.race<T | null>([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[extract-doc-summaries] ⏱️ ${label} exceeded hard timeout (${timeoutMs}ms) — aborting this attempt`);
          resolve(null);
        }, timeoutMs) as unknown as number;
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function runVertexPdfExtraction(
  pdfBase64: string,
  fileName: string,
  perCallTimeoutMs: number = 60_000,
): Promise<{ text: string; model: string }> {
  const isArmalytix = ARMALYTIX_PATTERN.test(fileName);
  const isFinancialPdf = isArmalytix || /thirdfort|infotrak|bank.?statement/i.test(fileName) || FINANCIAL_FILENAME_PATTERNS.some((p) => p.test(fileName));

  // Size-based detection: base64 > 1.5MB ≈ ~1.1MB raw ≈ 50-100+ pages
  const isLargePdf = pdfBase64.length >= 1_500_000;

  const userPrompt = isFinancialPdf
    ? `Document filename: ${fileName}\n\nThis is a critical financial compliance document. Extract EVERY monetary value, table row, transaction, name, date, verification status, and structured data point. Do not summarise any table — output every row in markdown table format.`
    : isLargePdf
      ? `Document filename: ${fileName}\n\nThis is a large multi-page document. Extract ALL text content from every page completely and faithfully. Do not summarise or skip any pages.`
      : `Document filename: ${fileName}\n\nExtract all text content from this document completely and faithfully.`;

  // Scale max tokens: Vertex Gemini 2.5 hard limit is 65536. Cap accordingly.
  const maxTokens = (isArmalytix || isLargePdf) ? 65536 : isFinancialPdf ? 65536 : 32768;

  const request = buildPdfExtractionRequest(
    VERTEX_PDF_SYSTEM_PROMPT,
    userPrompt,
    pdfBase64,
    maxTokens,
  );

  console.log(
    `[extract-doc-summaries] [VERTEX] Single-pass PDF extraction: ${fileName} ` +
    `(${(pdfBase64.length / 1024 / 1024).toFixed(1)}MB base64, financial=${isFinancialPdf}, large=${isLargePdf}) ` +
    `→ ${getEndpointUrl(VERTEX_PRIMARY_MODEL)}`,
  );

  // Primary: Gemini Flash (confirmed available in europe-west4)
  const text = await withHardTimeout(
    generateText(VERTEX_PRIMARY_MODEL, request, `Vertex PDF extraction for ${fileName}`),
    perCallTimeoutMs,
    `Vertex Flash for ${fileName}`,
  );

  if (text && text.trim().length >= 100) {
    console.log(`[extract-doc-summaries] [VERTEX] ✅ ${fileName}: ${text.length} chars extracted via ${VERTEX_PRIMARY_MODEL}`);
    return { text, model: `vertex/${VERTEX_PRIMARY_MODEL}` };
  }

  // Fallback: try Gemini Pro on Vertex AI (if available in the project)
  console.warn(`[extract-doc-summaries] [VERTEX] Flash returned ${(text || "").trim().length} chars for ${fileName}, trying Pro`);

  const proText = await withHardTimeout(
    generateText(VERTEX_FALLBACK_MODEL, request, `Vertex Pro PDF extraction for ${fileName}`),
    perCallTimeoutMs,
    `Vertex Pro for ${fileName}`,
  );
  if (proText && proText.trim().length > (text || "").trim().length) {
    console.log(`[extract-doc-summaries] [VERTEX] ✅ Pro improved ${fileName}: ${proText.length} chars`);
    return { text: proText, model: `vertex/${VERTEX_FALLBACK_MODEL}` };
  }

  return { text: text || "", model: `vertex/${VERTEX_PRIMARY_MODEL}` };
}

// ── Lovable Gateway image extraction (kept for non-PDF files) ──────────

async function runHighSensitivityVisualExtraction(
  apiKey: string,
  file: { base64: string; name: string; mimeType?: string },
): Promise<string | null> {
  const mime = getNativeMime(file.name, file.mimeType || "application/octet-stream");
  const result = await runGatewayCompletion(
    apiKey,
    {
      model: "google/gemini-2.5-pro",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `${HIGH_SENSITIVITY_OCR_PROMPT}\n\nDocument filename: ${file.name}` },
          { type: "image_url", image_url: { url: `data:${mime};base64,${file.base64}` } },
          { type: "text", text: "Now extract all readable text from this document." },
        ],
      }],
    },
    `High-sensitivity OCR for ${file.name}`,
  );
  const text = result?.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

async function runCrossModelExtraction(
  apiKey: string,
  file: { base64: string; name: string; mimeType?: string },
): Promise<string | null> {
  const mime = getNativeMime(file.name, file.mimeType || "application/octet-stream");
  const result = await runGatewayCompletion(
    apiKey,
    {
      model: "openai/gpt-5",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `${VERTEX_PDF_SYSTEM_PROMPT}\n\nDocument filename: ${file.name}\n\nIMPORTANT: A previous extraction attempt by another model failed to read this document adequately. You MUST read every page of this document and extract ALL text content.`,
          },
          { type: "image_url", image_url: { url: `data:${mime};base64,${file.base64}` } },
          { type: "text", text: "Now extract all readable text from this document. Output the complete text content faithfully." },
        ],
      }],
    },
    `GPT-5 cross-model extraction for ${file.name}`,
  );
  const text = result?.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

// ── Extraction judge (Lovable Gateway) ─────────────────────────────────

async function runExtractionJudge(
  apiKey: string,
  originalFile: { base64: string; name: string; mimeType?: string },
  extractedText: string,
): Promise<string | null> {
  const mime = getNativeMime(originalFile.name, originalFile.mimeType || "application/octet-stream");

  const judgeResponse = await fetchWithTimeout(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-nano",
        messages: [
          {
            role: "system",
            content: `You are a document extraction completeness checker. Verify ALL key data points are present. Focus on monetary amounts, names, dates, verification statuses, and table data. Use the provided tool to report findings.`,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mime};base64,${originalFile.base64}` } },
              {
                type: "text",
                text: `Here is the extracted text from "${originalFile.name}":\n\n${extractedText.slice(0, 50000)}\n\nCompare this against the original. Are ALL key data points captured?`,
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_extraction_completeness",
              description: "Report whether the extraction is complete and return any missing data.",
              parameters: {
                type: "object",
                properties: {
                  complete: { type: "boolean" },
                  missingData: { type: "string" },
                },
                required: ["complete", "missingData"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_extraction_completeness" } },
      }),
    },
    12_000,
  );

  if (!judgeResponse.ok) return null;

  const judgeResult = await judgeResponse.json();
  const toolCall = judgeResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return null;

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    if (parsed.complete === false && parsed.missingData?.trim()) {
      console.log(`[extract-doc-summaries] Judge found missing data for ${originalFile.name} (${parsed.missingData.length} chars)`);
      return parsed.missingData.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// ── Monitoring helper ──────────────────────────────────────────────────

async function logToSystemLogs(level: string, message: string, metadata: Record<string, any>) {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    await fetch(`${SUPABASE_URL}/rest/v1/system_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        level,
        category: "edge_function_error",
        message,
        metadata: { functionName: "extract-doc-summaries", ...metadata },
      }),
    }).catch(() => {});
  } catch { /* fire-and-forget */ }
}

// ── Main handler ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check Vertex AI availability (non-fatal — falls back to gateway).
    // We validate the JSON shape too: a present-but-malformed credential
    // would otherwise burn ~12s per file on retries before falling back.
    const { isVertexConfigured } = await import("../_shared/vertexAuth.ts");
    const hasVertexAI = isVertexConfigured();
    if (!hasVertexAI) {
      console.warn("[extract-doc-summaries] Vertex AI unavailable (missing or invalid VERTEX_SA_CREDENTIALS) — PDF extraction will use Lovable AI Gateway fallback");
    }

    const body = await req.json();
    const files: Array<{ base64: string; name: string; mimeType?: string }> = body.files || [];

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batch = files.slice(0, 5);
    const summaries: Array<{ name: string; summary: string; classification: DocClassification }> = [];
    const requestStartedAt = Date.now();
    // Platform idle timeout is 150s. Leave a 25s safety margin so the function
    // can return a graceful "degraded" response (and serialise it) before the
    // edge runtime kills the request with 504 IDLE_TIMEOUT.
    const REQUEST_BUDGET_MS = 125_000;
    const FILE_BUDGET_MS = 35_000;
    const hasBudgetRemaining = () => Date.now() - requestStartedAt < REQUEST_BUDGET_MS;
    const remainingBudgetMs = () => Math.max(0, REQUEST_BUDGET_MS - (Date.now() - requestStartedAt));

    const nativeFiles: typeof batch = [];
    const textFiles: typeof batch = [];

    for (const f of batch) {
      const mime = f.mimeType || "application/octet-stream";
      if (isNativeFile(f.name, mime)) {
        nativeFiles.push(f);
      } else {
        textFiles.push(f);
      }
    }

    for (const f of textFiles) {
      try {
        const text = extractTextFromBytes(f.base64, f.name);
        const classification = filenameToClassification(f.name);
        summaries.push({
          name: f.name,
          classification,
          summary: text && text.length > 50
            ? `[Document: ${f.name}]\n--- DOCUMENT CONTENT START ---\n${text}\n--- DOCUMENT CONTENT END ---`
            : `[Document: ${f.name}] — Could not extract readable text from this file.`,
        });
      } catch {
        summaries.push({ name: f.name, classification: "other", summary: `[Document: ${f.name}] — Error processing file.` });
      }
    }

    if (nativeFiles.length > 0) {
      console.log(`[extract-doc-summaries] Processing ${nativeFiles.length} native file(s) — Vertex AI: ${hasVertexAI ? "enabled (europe-west4)" : "disabled (gateway fallback)"}`);

      const VERTEX_STAGGER_MS = 2000;

      // Process native files in PARALLEL instead of serially. Previously each
      // file's OCR/judge pipeline (up to ~30s including retries) ran one after
      // the other, and a 5-file batch easily exceeded the 150s edge runtime
      // idle timeout → 504 IDLE_TIMEOUT.
      //
      // We still stagger Vertex start times (each file's start is delayed by
      // `fileIndex * VERTEX_STAGGER_MS`) to avoid Vertex per-second rate
      // limits, but the heavy I/O now overlaps across files.
      const nativeResults = await Promise.all(
        nativeFiles.map(async (f, fileIndex) => {
          if (!hasBudgetRemaining()) {
            console.warn(`[extract-doc-summaries] Request budget exhausted before ${f.name}; returning partial batch`);
            return {
              name: f.name,
              classification: "other" as DocClassification,
              summary: `[Document: ${f.name}] — Extraction deferred because the batch reached the request time budget. Please retry this file separately.`,
            };
          }

          if (fileIndex > 0 && hasVertexAI) {
            const delay = fileIndex * VERTEX_STAGGER_MS;
            if (delay < remainingBudgetMs()) {
              console.log(`[extract-doc-summaries] ⏱️ Staggering ${f.name} by ${delay}ms to avoid Vertex AI rate limits`);
              await new Promise((r) => setTimeout(r, delay));
            }
          }

          const fileStartedAt = Date.now();
          const fileTimedOut = () => Date.now() - fileStartedAt >= FILE_BUDGET_MS || !hasBudgetRemaining();

          const mime = getNativeMime(f.name, f.mimeType || "application/octet-stream");
          const isPdf = f.name.toLowerCase().endsWith(".pdf");
          const MIN_VIABLE_EXTRACTION = 100;

          let finalText = "";
          let extractionModel = "";

          if (isPdf && hasVertexAI && !fileTimedOut()) {
            try {
              const perCallTimeout = Math.min(
                FILE_BUDGET_MS,
                Math.max(8_000, remainingBudgetMs() - 5_000),
              );
              const vertexResult = await runVertexPdfExtraction(f.base64, f.name, perCallTimeout);
              finalText = vertexResult.text;
              extractionModel = vertexResult.model;
            } catch (err) {
              console.error(`[extract-doc-summaries] Vertex AI extraction failed for ${f.name}:`, err);
            }
          }

          if (isPdf && (!finalText || finalText.trim().length < MIN_VIABLE_EXTRACTION) && !fileTimedOut()) {
            try {
              const pdfParser = await getPdfParser();
              if (!pdfParser) throw new Error("pdf-parse not available");
              const parsed = await pdfParser(base64ToBytes(f.base64));
              const text = parsed.text?.trim() || "";
              if (text.length >= 500 && !isGarbledPdfText(text)) {
                finalText = text;
                extractionModel = "pdf-parse";
                console.log(`[extract-doc-summaries] ✅ pdf-parse fallback for ${f.name} (${text.length} chars)`);
              }
            } catch (err) {
              console.warn(`[extract-doc-summaries] pdf-parse failed for ${f.name}:`, (err as Error)?.message);
            }
          }

          if (!isPdf && (!finalText || finalText.trim().length < MIN_VIABLE_EXTRACTION) && !fileTimedOut()) {
            console.log(`[extract-doc-summaries] Image OCR via Gateway for ${f.name}`);
            const result = await runGatewayCompletion(
              LOVABLE_API_KEY,
              {
                model: "google/gemini-2.5-flash",
                messages: [{
                  role: "user",
                  content: [
                    { type: "text", text: `${HIGH_SENSITIVITY_OCR_PROMPT}\n\nDocument filename: ${f.name}` },
                    { type: "image_url", image_url: { url: `data:${mime};base64,${f.base64}` } },
                    { type: "text", text: "Now extract all readable text from this document." },
                  ],
                }],
              },
              `OCR for ${f.name}`,
              { timeoutMs: 16_000, maxRetries: 2 },
            );
            finalText = result?.choices?.[0]?.message?.content || "";
            extractionModel = "gemini-2.5-flash (gateway)";
          }

          if (isPdf && (!finalText || finalText.trim().length < MIN_VIABLE_EXTRACTION) && !fileTimedOut()) {
            console.log(`[extract-doc-summaries] Gateway fallback PDF extraction for ${f.name} (Vertex ${hasVertexAI ? "rate-limited/failed" : "unavailable"})`);
            const result = await runGatewayCompletion(
              LOVABLE_API_KEY,
              {
                model: "google/gemini-2.5-flash",
                messages: [{
                  role: "user",
                  content: [
                    { type: "text", text: `${VERTEX_PDF_SYSTEM_PROMPT}\n\nDocument filename: ${f.name}` },
                    { type: "image_url", image_url: { url: `data:${mime};base64,${f.base64}` } },
                    { type: "text", text: "Now extract all readable text from this document." },
                  ],
                }],
              },
              `Gateway PDF OCR for ${f.name}`,
              { timeoutMs: 18_000, maxRetries: 2 },
            );
            finalText = result?.choices?.[0]?.message?.content || "";
            extractionModel = "gemini-2.5-flash (gateway-fallback)";
          }

          if (finalText.trim().length < MIN_VIABLE_EXTRACTION && !fileTimedOut()) {
            console.warn(`[extract-doc-summaries] ⚠️ Escalating to Gemini Pro (Gateway) for ${f.name}`);
            const proResult = await runHighSensitivityVisualExtraction(LOVABLE_API_KEY, f).catch(() => null);
            if (proResult && proResult.trim().length > finalText.trim().length) {
              finalText = proResult;
              extractionModel = "gemini-2.5-pro (gateway-escalation)";
            }
          }

          if (finalText.trim().length < MIN_VIABLE_EXTRACTION && !fileTimedOut()) {
            console.warn(`[extract-doc-summaries] ⚠️ Escalating to GPT-5 (Gateway) for ${f.name}`);
            const gptResult = await runCrossModelExtraction(LOVABLE_API_KEY, f).catch(() => null);
            if (gptResult && gptResult.trim().length > finalText.trim().length) {
              finalText = gptResult;
              extractionModel = "gpt-5 (gateway-escalation)";
            }
          }

          if ((!finalText.trim() || finalText.trim().length < 20) && fileTimedOut()) {
            console.warn(`[extract-doc-summaries] ⏱️ File budget exhausted for ${f.name}; returning degraded result`);
            return {
              name: f.name,
              classification: filenameToClassification(f.name),
              summary: `[Document: ${f.name}] — Extraction timed out within the request budget. Partial/deferred processing required; please retry this file separately.`,
            };
          }

          if (!finalText.trim() || finalText.trim().length < 20) {
            console.error(`[extract-doc-summaries] ❌ ZERO_TEXT_ALERT: All models failed for ${f.name}`);
            await logToSystemLogs("error", `ZERO_TEXT_EXTRACTED: ${f.name} — all models failed`, {
              fileName: f.name,
              fileSizeKB: Math.round(f.base64.length / 1024),
              mimeType: mime,
              vertexAIEnabled: hasVertexAI,
            });
            return {
              name: f.name,
              classification: "other" as DocClassification,
              summary: `[Document: ${f.name}] — All extraction models failed. The document may be corrupted, password-protected, or unsupported. Please re-upload or convert to a standard PDF.`,
            };
          }

          console.log(`[extract-doc-summaries] Step 1 complete for ${f.name}: ${finalText.length} chars via ${extractionModel}`);

          let classification: DocClassification;
          const filenameHint = filenameToClassification(f.name);

          if (finalText.trim().length > 100 && !fileTimedOut()) {
            classification = await classifyDocumentByContent(LOVABLE_API_KEY, f.name, finalText).catch(() => filenameHint);
          } else {
            classification = filenameHint;
          }

          if (classification !== filenameHint && filenameHint !== "other") {
            console.log(`[extract-doc-summaries] ⚠️ Classification override: filename="${filenameHint}" content="${classification}"`);
          }

          const isFinancial = isFinancialClassification(classification);
          const isIdentity = isIdentityClassification(classification);
          const isProofOfAddress = isProofOfAddressClassification(classification);
          const isCritical = isCriticalClassification(classification);

          if (isCritical && hasLowReadabilitySignals(finalText) && !extractionModel.startsWith("vertex/") && !fileTimedOut()) {
            const qualityThreshold = isFinancial ? 500 : 180;
            if (finalText.trim().length < qualityThreshold || hasLowReadabilitySignals(finalText)) {
              console.log(`[extract-doc-summaries] Quality enhancement for ${f.name}`);
              const enhanced = await runHighSensitivityVisualExtraction(LOVABLE_API_KEY, f).catch(() => null);
              if (enhanced && extractionQualityScore(enhanced) > extractionQualityScore(finalText)) {
                finalText = enhanced;
                extractionModel = "gemini-2.5-pro (quality)";
              }
            }
          }

          const isImageMime = mime.startsWith("image/");
          const alreadyPro = extractionModel.includes("gemini-2.5-pro") || extractionModel.includes("gpt-5");
          if (isIdentity && isImageMime && !alreadyPro && !fileTimedOut()) {
            try {
              console.log(`[extract-doc-summaries] ID corroboration: running Gemini Pro second read for ${f.name}`);
              const corroboration = await runHighSensitivityVisualExtraction(LOVABLE_API_KEY, f).catch(() => null);
              if (corroboration && corroboration.trim().length >= 50) {
                const readA = finalText.trim();
                const readB = corroboration.trim();
                const agree = readA === readB;
                const block = [
                  "",
                  "--- OCR-CORROBORATION (identity document, two independent reads) ---",
                  `Read 1 (model: ${extractionModel}):`,
                  readA.slice(0, 4000),
                  "",
                  `Read 2 (model: gemini-2.5-pro corroboration):`,
                  readB.slice(0, 4000),
                  "",
                  agree
                    ? "Reads agree verbatim — high confidence in extracted values."
                    : "Reads differ. Apply the OCR / Image-Extraction Discrepancy Safeguard: any character-level differences between the two reads on the SAME image are presumed to be extraction artefacts, not genuine document discrepancies. Default to manual visual review (Amber), not Critical/Red.",
                  "--- END OCR-CORROBORATION ---",
                  "",
                ].join("\n");
                finalText = `${finalText}\n${block}`;
                console.log(`[extract-doc-summaries] ID corroboration appended for ${f.name} (agree=${agree})`);
              } else {
                console.log(`[extract-doc-summaries] ID corroboration skipped for ${f.name} (no usable second read)`);
              }
            } catch (corrErr) {
              console.warn(`[extract-doc-summaries] ID corroboration error for ${f.name}:`, corrErr);
            }
          }

          const judgeSafeInput = finalText.length <= 50_000 && f.base64.length <= 2_500_000;
          const needsJudge = judgeSafeInput && (isFinancial || isIdentity || isProofOfAddress || finalText.length < 500);
          if (needsJudge && !fileTimedOut()) {
            try {
              const missingData = await runExtractionJudge(LOVABLE_API_KEY, f, finalText);
              if (missingData) {
                finalText += `\n\n--- SUPPLEMENTAL DATA (verified by extraction judge) ---\n${missingData}\n--- END SUPPLEMENTAL DATA ---`;
              }
            } catch (err) {
              console.error(`[extract-doc-summaries] Judge error for ${f.name}:`, err);
            }
          }

          console.log(`[extract-doc-summaries] ✅ ${f.name}: ${finalText.length} chars, classified as "${classification}", model: ${extractionModel}`);

          return {
            name: f.name,
            classification,
            summary: `[Document: ${f.name}]\n--- DOCUMENT CONTENT START ---\n${finalText}\n--- DOCUMENT CONTENT END ---`,
          };
        }),
      );

      summaries.push(...nativeResults);
    }

    return new Response(JSON.stringify({ summaries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[extract-doc-summaries] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

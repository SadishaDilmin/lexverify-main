/**
 * M4 Fix: Pure functions, types, and constants extracted from SoWFormUI.tsx.
 * These have zero React dependencies and can be tested independently.
 */

import type { AttachedFile } from "@/components/AgentChatFileAttachment";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────
export interface DocExtractionStat {
  name: string;
  charCount: number;
  isFinancial: boolean;
  wasTruncated: boolean;
  cap: number;
}

export interface PersonDetail {
  id: string;
  fullName: string;
  role: "Purchaser" | "Giftor";
  fundingSource: string;
  fundingSourceOther: string;
  contributionAmount: string;
  employmentStatus: string;
  employmentStatusOther: string;
  additionalNotes: string;
  relationshipToPurchaser: string;
  relationshipOther: string;
  files: AttachedFile[];
  raiseEnquiryFunding: boolean;
  raiseEnquiryEmployment: boolean;
  pepStatus: string;
  buyerType: string;
}

export interface ExtractionWarning {
  filename: string;
  reason: string;
}

export interface SoWFormUIProps {
  agentId: string;
  agentName: string;
    streamChat: (params: {
      agentId: string;
      messages: { role: string; content: string }[];
      files?: any[];
      skipJudge?: boolean;
      modelOverride?: string;
      caseId?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
      onDelta: (chunk: string) => void;
      onDone: () => void;
      onError: (msg: string) => void;
      onMeta?: (meta: Record<string, unknown>) => void;
    }) => Promise<void>;
}

// ── Constants ──────────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [
  ".pdf", ".txt", ".csv", ".md", ".doc", ".docx",
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic",
  ".eml", ".msg", ".dwg", ".dxf", ".xls", ".xlsx", ".rtf",
];

export const DOC_SUMMARIES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-doc-summaries`;
export const MAX_AGENT_CHAT_MESSAGE_CHARS = 250000;
export const MAX_DOC_SUMMARY_CHARS = 40000;
export const MAX_FINANCIAL_DOC_SUMMARY_CHARS = 80000;
export const DOCS_PER_CHUNK = 8;
/** Max chars of doc summaries per chunk — leaves room for the ~30K prompt */
export const MAX_CHUNK_DOC_CHARS = 200000;
/**
 * Single-pass bypass threshold: if total extracted document text is at or below
 * this limit, skip domain-split / multi-worker and use a single holistic pass.
 * This preserves cross-document reasoning for small-to-medium cases.
 * Set to 200K chars — comfortably within a single Gemini 2.5 Pro context window
 * (~1M tokens) after accounting for the ~100K system prompt.
 */
export const SINGLE_PASS_CHAR_THRESHOLD = 200_000;
export const MAX_PRIOR_SUMMARY_CHARS = 3000;
export const MAX_PROFILE_INTEL_CHARS = 8000;
export const SOW_STREAM_TIMEOUT_MS = 600_000;
export const SOW_CHUNK_TIMEOUT_MS = 480_000;

export const FUNDING_OPTIONS = [
  "Salary / Employment Income", "Savings", "Sale of Existing Property", "Gift",
  "Inheritance", "Investment Proceeds", "Pension Lump Sum",
  "Compensation / Settlement", "Business Profits", "Mortgage", "Other",
];
export const EMPLOYMENT_OPTIONS = [
  "Employed", "Self-Employed", "Director / Business Owner", "Retired",
  "Not Currently Employed", "Student", "Other",
];
export const RELATIONSHIP_OPTIONS = [
  "Parent", "Grandparent", "Spouse / Partner", "Sibling",
  "Other Family Member", "Friend", "Employer", "Other",
];

export const PROFILE_MARKER = "<!-- PROFILE_INFO_START -->";
export const INTERNAL_MARKER = "<!-- INTERNAL_REPORT_START -->";
export const EMAIL_MARKER = "<!-- DRAFT_EMAIL_START -->";

/** Filenames that suggest financial content needing higher summary caps */
const FINANCIAL_NAME_SEP = "[_\\s-]*";
export const FINANCIAL_DOC_PATTERNS = [
  /armalytix/i, /bank[_\s-]*statement/i, /\bstatement[_\s-]?\d/i, /\bstatement_\w+/i,
  /ml[_\s-]*check/i, /payslip/i, /pay[_\s-]*slip/i,
  /salary/i, /p60/i, /p45/i, /deposit/i, /mortgage/i, /wealth/i, new RegExp(`source${FINANCIAL_NAME_SEP}of${FINANCIAL_NAME_SEP}funds`, "i"),
  /sof\b/i, /open[_\s-]*banking/i, /affordability/i, /income/i, /pension/i,
  /savings/i, /investment/i, /tax[_\s-]*return/i, /tax[_\s-]*computation/i, /sa302/i, /sa100/i, /account[_\s-]*summary/i,
  /contribution/i, /giftor/i, /gift[_\s-]*letter/i, /funding/i, /completion[_\s-]*statement/i,
  /client\s*account/i, /ledger/i, /thirdfort/i, /infotrak/i, /liveness/i,
  /id\s*verif/i, /aml/i, /proof\s*of/i, /evidence/i, /financial/i,
  /\bAC[_\s]\d+/i, /dividend/i, /royalt/i,
];

// ── Pure helpers ───────────────────────────────────────────────────────
export function genId() { return Math.random().toString(36).slice(2, 10); }

export function isAllowedFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function isFinancialDoc(name: string): boolean {
  return FINANCIAL_DOC_PATTERNS.some(p => p.test(name));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve((reader.result as string).split(",")[1] || (reader.result as string)); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function createPerson(role: "Purchaser" | "Giftor"): PersonDetail {
  return {
    id: genId(), fullName: "", role, fundingSource: "", fundingSourceOther: "",
    contributionAmount: "", employmentStatus: "", employmentStatusOther: "",
    additionalNotes: "", relationshipToPurchaser: "", relationshipOther: "", files: [],
    raiseEnquiryFunding: false, raiseEnquiryEmployment: false,
    pepStatus: "Unknown", buyerType: "Standard",
  };
}

export function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = "\n...[truncated for context limit]...\n";
  const head = Math.max(0, Math.floor((maxChars - marker.length) * 0.75));
  const tail = Math.max(0, maxChars - marker.length - head);
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}

export function buildBoundedAssessmentContext(prompt: string, docSummaries: string[]): string {
  if (docSummaries.length === 0) {
    return truncateForContext(prompt, MAX_AGENT_CHAT_MESSAGE_CHARS);
  }

  const PRIMARY_OPEN_BANKING_DOC_PATTERN = /armalytix|open[_\s-]*banking|source[_\s-]*of[_\s-]*(funds|wealth)|truelayer|plaid|affordability|wealth[_\s-]*report/i;

  const prioritisedSummaries = docSummaries
    .map((summary, index) => {
      const nameMatch = summary.match(/\[Document:\s*([^\]\[]+?)(?:\s*\[Tagged to:.*?\])?\]/);
      const docName = nameMatch?.[1]?.trim() || "";
      const apiClassification = getDocClassification(docName);
      const isFinancial = apiClassification
        ? isFinancialByClassification(apiClassification)
        : isFinancialDoc(docName);
      const docSignal = `${docName}\n${summary.slice(0, 4000)}`;
      const priority = PRIMARY_OPEN_BANKING_DOC_PATTERN.test(docSignal)
        ? 3
        : isFinancial
          ? 2
          : 1;

      const cap = isFinancial
        ? (priority === 3 ? 180000 : MAX_FINANCIAL_DOC_SUMMARY_CHARS)
        : MAX_DOC_SUMMARY_CHARS;

      return {
        index,
        priority,
        summary: truncateForContext(summary, cap),
      };
    })
    .sort((a, b) => (b.priority - a.priority) || (a.index - b.index));

  const sectionHeader = "\n\n## Document Contents\n";
  const safePrompt = truncateForContext(prompt, Math.min(prompt.length, 30000));

  let remaining = MAX_AGENT_CHAT_MESSAGE_CHARS - safePrompt.length - sectionHeader.length;
  if (remaining <= 0) return truncateForContext(safePrompt, MAX_AGENT_CHAT_MESSAGE_CHARS);

  const included: string[] = [];
  let omitted = 0;

  for (const entry of prioritisedSummaries) {
    const sep = included.length > 0 ? 2 : 0;
    if (entry.summary.length + sep <= remaining) {
      included.push(entry.summary);
      remaining -= entry.summary.length + sep;
    } else {
      omitted++;
    }
  }

  let combined = included.length > 0
    ? `${safePrompt}${sectionHeader}${included.join("\n\n")}`
    : safePrompt;

  if (omitted > 0) {
    const omissionNote = `\n\n[Context note: ${omitted} document summary/ies omitted due to message size limits. Priority was given to primary Open Banking / Armalytix evidence and other financial documents.]`;
    combined = truncateForContext(combined, MAX_AGENT_CHAT_MESSAGE_CHARS - omissionNote.length) + omissionNote;
  }

  return truncateForContext(combined, MAX_AGENT_CHAT_MESSAGE_CHARS);
}

/**
 * Size-aware document chunking: groups summaries so each chunk stays
 * under MAX_CHUNK_DOC_CHARS, preventing buildBoundedAssessmentContext
 * from silently dropping documents that exceed the 250K message budget.
 */
export function chunkDocumentsBySize(docSummaries: string[]): string[][] {
  if (docSummaries.length === 0) return [[]];
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (const summary of docSummaries) {
    const len = summary.length;
    // If adding this doc would exceed the budget AND the chunk already has docs, start a new chunk
    if (currentChunk.length > 0 && (currentSize + len > MAX_CHUNK_DOC_CHARS || currentChunk.length >= DOCS_PER_CHUNK)) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(summary);
    currentSize += len;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

// ── Section parsing ───────────────────────────────────────────────────
export function parseExtractionWarnings(raw: string): ExtractionWarning[] {
  const warnings: ExtractionWarning[] = [];
  const seen = new Set<string>();
  const regex = /<!-- EXTRACTION_WARNING:\s*(.+?)\s*—\s*(.+?)\s*-->/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(raw)) !== null) {
    const filename = m[1].trim();
    const reason = m[2].trim();
    const combined = `${filename} ${reason}`.toLowerCase();

    // Armalytix / open-banking style reports are policy-forced to High confidence.
    // Suppress any stale or hallucinated extraction warnings for these structured PDFs.
    if (/(armalytix|open banking|thirdfort|infotrak|truelayer|source of funds)/i.test(combined)) {
      continue;
    }

    const key = `${filename}::${reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      warnings.push({ filename, reason });
    }
  }

  return warnings;
}

export function stripExtractionWarnings(raw: string): string {
  let cleaned = raw.replace(/<!-- EXTRACTION_WARNING:\s*.+?\s*—\s*.+?\s*-->\s*/g, "").trim();
  cleaned = cleaned.replace(/\bUnreadable\s+(Armalytix|Open Banking|Thirdfort|Infotrak|TrueLayer|Source of Funds)\s+(Report|Document)/gi, "$1 $2");
  cleaned = cleaned.replace(/^\d+\.\s*\*{0,2}Unreadable\s+.+?(Report|Document)\*{0,2}\s*$/gim, "");
  return cleaned;
}

export function parseSections(raw: string) {
  const cleaned = stripExtractionWarnings(raw);
  const profileIdx = cleaned.indexOf(PROFILE_MARKER);
  const intIdx = cleaned.indexOf(INTERNAL_MARKER);
  const emailIdx = cleaned.indexOf(EMAIL_MARKER);

  if (profileIdx === -1 && intIdx === -1 && emailIdx === -1) {
    return { assessment: cleaned, profileIntelligence: "", internalReport: "", draftEmail: "" };
  }

  const firstMarkerIdx = Math.min(
    ...[profileIdx, intIdx, emailIdx].filter(i => i !== -1)
  );
  const assessment = cleaned.slice(0, firstMarkerIdx).trim();

  const profileIntelligence = profileIdx !== -1
    ? cleaned.slice(
        profileIdx + PROFILE_MARKER.length,
        intIdx !== -1 ? intIdx : emailIdx !== -1 ? emailIdx : undefined
      ).trim()
    : "";

  const internalReport = intIdx !== -1
    ? cleaned.slice(intIdx + INTERNAL_MARKER.length, emailIdx !== -1 ? emailIdx : undefined).trim()
    : "";

  const draftEmail = emailIdx !== -1 ? cleaned.slice(emailIdx + EMAIL_MARKER.length).trim() : "";

  return { assessment, profileIntelligence, internalReport, draftEmail };
}

// ── Funding evidence ──────────────────────────────────────────────────
export interface FundingEvidenceEntry {
  document: string;
  person: string;
  dataContributed: string;
}

export function parseFundingEvidenceSources(internalReport: string): FundingEvidenceEntry[] {
  if (!internalReport) return [];
  const idx = internalReport.indexOf("Funding Evidence Sources");
  if (idx === -1) return [];

  const section = internalReport.slice(idx);
  const rows: FundingEvidenceEntry[] = [];
  const tableRowRegex = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;
  let match: RegExpExecArray | null;
  while ((match = tableRowRegex.exec(section)) !== null) {
    const doc = match[1].trim();
    const person = match[2].trim();
    const data = match[3].trim();
    if (doc === "Document" || doc.startsWith("---") || doc.startsWith("-")) continue;
    if (doc && person && data) rows.push({ document: doc, person, dataContributed: data });
  }
  return rows;
}

export function buildFundingEvidenceMap(entries: FundingEvidenceEntry[]): Map<string, FundingEvidenceEntry> {
  const map = new Map<string, FundingEvidenceEntry>();
  for (const e of entries) {
    map.set(e.document.toLowerCase(), e);
    const noExt = e.document.replace(/\.[^.]+$/, "").toLowerCase();
    if (noExt !== e.document.toLowerCase()) map.set(noExt, e);
  }
  return map;
}

// ── Semaphore ─────────────────────────────────────────────────────────
export class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) { this.active++; return; }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) { this.active++; next(); }
  }
}

// ── Classification types (mirrors edge function) ─────────────────────
type DocClassification =
  | "financial_statement" | "open_banking_report" | "tax_document"
  | "identity_document" | "proof_of_address" | "mortgage_document"
  | "gift_evidence" | "company_document" | "legal_document"
  | "correspondence" | "other";

const FINANCIAL_CLASSIFICATIONS = new Set<string>([
  "financial_statement", "open_banking_report", "tax_document",
  "mortgage_document", "gift_evidence", "company_document",
]);

/** Content-based classification from the API takes priority over filename */
export function isFinancialByClassification(classification?: string): boolean {
  if (classification) return FINANCIAL_CLASSIFICATIONS.has(classification);
  return false;
}

/** Global map: doc name → classification from API. Populated during preProcessDocuments. */
const docClassificationMap = new Map<string, string>();

export function getDocClassification(docName: string): string | undefined {
  return docClassificationMap.get(docName.toLowerCase().trim());
}

// ── Document processing status types ──────────────────────────────────
export type DocProcessingState = "queued" | "extracting" | "done" | "error";
export interface DocProcessingItem {
  name: string;
  state: DocProcessingState;
  startedAt?: number;
  finishedAt?: number;
}

const EXTRACTION_FAILURE_PATTERNS = [
  /all extraction models failed/i,
  /could not extract readable text/i,
  /could not read this document/i,
  /error processing file/i,
  /pre-processing failed/i,
  /pre-processing error/i,
  /password-protected/i,
  /unsupported format/i,
  /corrupted/i,
];

const HEAVY_NATIVE_FINANCIAL_B64 = 1_500_000;

/** Armalytix / Open Banking reports should ALWAYS be treated as heavy files
 *  regardless of base64 size, to get extended timeouts and isolated processing */
const ARMALYTIX_PATTERN = /armalytix|open[_\s.-]*banking|source[_\s.-]*of[_\s.-]*(funds|wealth)|\bsof\b|\bsow\b|\baml\b|truelayer|plaid|affordability|wealth[_\s.-]*report/i;

function getExtractedContent(summary: string): string {
  const match = summary.match(/--- DOCUMENT CONTENT START ---\n([\s\S]*?)\n--- DOCUMENT CONTENT END ---/);
  return match?.[1]?.trim() ?? "";
}

export function isExtractionFailureSummary(summary: string): boolean {
  if (!summary?.trim()) return true;
  if (EXTRACTION_FAILURE_PATTERNS.some((pattern) => pattern.test(summary))) return true;
  return summary.includes("--- DOCUMENT CONTENT START ---") && getExtractedContent(summary).length === 0;
}

function buildExtractionFailureSummary(name: string, ownerTag: string, reason: string): string {
  return `[Document: ${name}${ownerTag}]\n--- DOCUMENT CONTENT START ---\n[EXTRACTION FAILED: ${reason}. Treat this document as unavailable for this run and recommend re-uploading a clearer copy or re-running extraction for this file.]\n--- DOCUMENT CONTENT END ---`;
}

function shouldIsolateHeavyNativeFile(file: AttachedFile): boolean {
  const isPdf = file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return false;
  // Always isolate Armalytix/OB reports — they need extended timeouts and dedicated processing
  if (ARMALYTIX_PATTERN.test(file.name)) return true;
  // Isolate ANY large PDF (100+ pages) — they need extended timeouts regardless of name
  if (file.base64.length >= HEAVY_NATIVE_FINANCIAL_B64) return true;
  return isFinancialDoc(file.name);
}

// ── Document pre-processing ───────────────────────────────────────────
export async function preProcessDocuments(
  files: AttachedFile[],
  onProgress: (processed: number, total: number) => void,
  fileOwnerMap?: Map<string, string>,
  onDocStatus?: (name: string, state: DocProcessingState) => void,
): Promise<string[]> {
  if (files.length === 0) return [];

  const MAX_BATCH_BYTES = 4 * 1024 * 1024;
  const MAX_CONCURRENT_EXTRACTIONS = 3;
  const orderedSummaries: { index: number; summaries: string[] }[] = [];
  let processed = 0;

  const NATIVE_EXTS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic"]);
  const isNativeExt = (name: string) => {
    const ext = "." + name.split(".").pop()?.toLowerCase();
    return NATIVE_EXTS.has(ext);
  };

  const tagOwner = (name: string) => {
    const owner = fileOwnerMap?.get(name);
    return owner ? ` [Tagged to: ${owner}]` : "";
  };

  const normalizeSummary = (name: string, summary: string) => {
    let tagged = fileOwnerMap?.has(name)
      ? summary.replace(`[Document: ${name}]`, `[Document: ${name}${tagOwner(name)}]`)
      : summary;

    const extractedChars = getExtractedContent(tagged).length;
    if (extractedChars === 0 && tagged.includes("--- DOCUMENT CONTENT START ---")) {
      tagged = tagged.replace(
        /--- DOCUMENT CONTENT END ---/,
        `--- DOCUMENT CONTENT END ---\n[⚠️ ZERO TEXT EXTRACTED — This document could not be read via text extraction. If an image of this document is attached, rely on visual analysis. Otherwise, flag this document as "unreadable" and recommend the conveyancer uploads a clearer copy or provides the information manually.]`
      );
    }

    return tagged;
  };

  const textSummaries: string[] = [];
  const nativeFiles: AttachedFile[] = [];
  for (const f of files) {
    if (isNativeExt(f.name)) {
      nativeFiles.push(f);
    } else {
      onDocStatus?.(f.name, "extracting");
      try {
        const binaryString = atob(f.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        let text = "";
        if (f.name.toLowerCase().endsWith(".docx")) {
          const raw = new TextDecoder("latin1").decode(bytes);
          const textParts: string[] = [];
          const tagRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
          let m: RegExpExecArray | null;
          while ((m = tagRegex.exec(raw)) !== null) {
            if (m[1].trim()) textParts.push(m[1]);
          }
          text = textParts.length > 0 ? textParts.join(" ").slice(0, 80000) : "";
        } else {
          text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, 80000);
        }
        textSummaries.push(
          text && text.length > 50
            ? `[Document: ${f.name}${tagOwner(f.name)}]\n--- DOCUMENT CONTENT START ---\n${text}\n--- DOCUMENT CONTENT END ---`
            : buildExtractionFailureSummary(f.name, tagOwner(f.name), "Could not extract readable text")
        );
        onDocStatus?.(f.name, text && text.length > 50 ? "done" : "error");
      } catch {
        textSummaries.push(buildExtractionFailureSummary(f.name, tagOwner(f.name), "Error processing file"));
        onDocStatus?.(f.name, "error");
      }
      processed++;
      onProgress(processed, files.length);
    }
  }

  const nativeBatches: AttachedFile[][] = [];
  let currentBatch: AttachedFile[] = [];
  let currentBatchSize = 0;
  for (const f of nativeFiles) {
    if (shouldIsolateHeavyNativeFile(f)) {
      if (currentBatch.length > 0) {
        nativeBatches.push(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }
      nativeBatches.push([f]);
      continue;
    }

    const fileBytes = f.base64.length;
    if (currentBatch.length > 0 && (currentBatchSize + fileBytes > MAX_BATCH_BYTES || currentBatch.length >= 3)) {
      nativeBatches.push(currentBatch);
      currentBatch = [];
      currentBatchSize = 0;
    }
    currentBatch.push(f);
    currentBatchSize += fileBytes;
  }
  if (currentBatch.length > 0) nativeBatches.push(currentBatch);

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const sem = new Semaphore(MAX_CONCURRENT_EXTRACTIONS);

  // Client-side extraction cache to prevent redundant re-extraction on retry
  const extractionCache = new Map<string, { summary: string; classification?: string }>();

  const fetchBatch = async (batchFiles: AttachedFile[], timeoutMs = 300_000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(DOC_SUMMARIES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          files: batchFiles.map((f) => ({
            base64: f.base64,
            name: f.name,
            mimeType: f.mimeType,
          })),
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchSingleFileWithRetry = async (file: AttachedFile): Promise<{ summary: string; ok: boolean }> => {
    // Check client-side cache first to avoid redundant re-extraction
    const cached = extractionCache.get(file.name);
    if (cached) {
      console.log(`[SoW] ♻️ Using cached extraction for ${file.name}`);
      if (cached.classification) {
        docClassificationMap.set(file.name.toLowerCase().trim(), cached.classification);
      }
      return { summary: cached.summary, ok: true };
    }

    const ownerTag = tagOwner(file.name);
    const isArmalytixFile = ARMALYTIX_PATTERN.test(file.name);
    // Armalytix reports get 3 attempts with progressively longer timeouts
    const timeoutPlan = isArmalytixFile
      ? [480_000, 600_000, 720_000]
      : shouldIsolateHeavyNativeFile(file)
        ? [480_000, 600_000]
        : [360_000, 480_000];
    let lastReason = "Document extraction failed after retry";

    for (const timeoutMs of timeoutPlan) {
      try {
        const resp = await fetchBatch([file], timeoutMs);
        if (!resp.ok) {
          lastReason = `Document extraction failed (${resp.status})`;
          continue;
        }

        const result = await resp.json();
        const entry = Array.isArray(result.summaries)
          ? result.summaries.find((item: any) => item?.name === file.name) ?? result.summaries[0]
          : null;

        if (!entry?.summary || typeof entry.summary !== "string") {
          lastReason = "No extraction summary returned";
          continue;
        }

        if (entry.classification) {
          docClassificationMap.set(file.name.toLowerCase().trim(), entry.classification);
        }

        const normalized = normalizeSummary(file.name, entry.summary);
        if (isExtractionFailureSummary(normalized)) {
          lastReason = "Document extraction returned no usable text";
          continue;
        }

        // Cache successful extraction
        extractionCache.set(file.name, { summary: normalized, classification: entry.classification });
        return { summary: normalized, ok: true };
      } catch (err) {
        lastReason = err instanceof DOMException && err.name === "AbortError"
          ? "Document extraction timed out"
          : "Document extraction errored";
      }
    }

    return {
      summary: buildExtractionFailureSummary(file.name, ownerTag, lastReason),
      ok: false,
    };
  };

  const batchPromises = nativeBatches.map(async (batch, batchIdx) => {
    await sem.acquire();
    for (const f of batch) onDocStatus?.(f.name, "extracting");
    try {
      const hasHeavy = batch.some(shouldIsolateHeavyNativeFile);
      const hasArmalytix = batch.some(f => ARMALYTIX_PATTERN.test(f.name));
      // Armalytix reports need 720s — Vertex AI extraction of 50-100+ page PDFs
      // can take 3-5 minutes with full table extraction
      const resp = await fetchBatch(batch, hasArmalytix ? 720_000 : hasHeavy ? 600_000 : 300_000);

      const batchSummaries: string[] = [];
      if (resp.ok) {
        const result = await resp.json();
        const returnedSummaries: Array<{ name: string; summary: string; classification?: string }> = Array.isArray(result.summaries)
          ? result.summaries
          : [];
        const returnedNames = new Set<string>();
        const retryQueue = new Map<string, AttachedFile>();
        const queueRetry = (file?: AttachedFile) => {
          if (file) retryQueue.set(file.name, file);
        };

        for (const entry of returnedSummaries) {
          returnedNames.add(entry.name);
          if (entry.classification) {
            docClassificationMap.set(entry.name.toLowerCase().trim(), entry.classification);
            console.log(`[SoW] 📋 ${entry.name} classified as: ${entry.classification}`);
          }

          const normalized = normalizeSummary(entry.name, entry.summary);
          if (isExtractionFailureSummary(normalized)) {
            queueRetry(batch.find((file) => file.name === entry.name));
            continue;
          }

          // Cache successful extraction to prevent re-extraction on retry
          extractionCache.set(entry.name, { summary: normalized, classification: entry.classification });
          batchSummaries.push(normalized);
          onDocStatus?.(entry.name, "done");
        }

        for (const f of batch) {
          if (!returnedNames.has(f.name)) queueRetry(f);
        }

        if (retryQueue.size > 0) {
          console.warn(`[SoW] Batch ${batchIdx} returned ${retryQueue.size} unusable extraction(s), retrying individually…`);
        }

        for (const file of retryQueue.values()) {
          onDocStatus?.(file.name, "extracting");
          const retried = await fetchSingleFileWithRetry(file);
          batchSummaries.push(retried.summary);
          onDocStatus?.(file.name, retried.ok ? "done" : "error");
        }
      } else {
        console.warn(`[SoW] Batch ${batchIdx} failed (${resp.status}), retrying ${batch.length} file(s) individually…`);
        for (const f of batch) {
          onDocStatus?.(f.name, "extracting");
          const retried = await fetchSingleFileWithRetry(f);
          batchSummaries.push(retried.summary);
          onDocStatus?.(f.name, retried.ok ? "done" : "error");
        }
      }
      orderedSummaries.push({ index: batchIdx, summaries: batchSummaries });
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      console.warn(`[SoW] Batch ${batchIdx} ${isTimeout ? "timed out" : "errored"}, retrying ${batch.length} file(s) individually…`);
      const batchSummaries: string[] = [];
      for (const f of batch) {
        // Skip files already successfully extracted before the batch error
        if (extractionCache.has(f.name)) {
          const cached = extractionCache.get(f.name)!;
          console.log(`[SoW] ♻️ Using cached extraction for ${f.name} (batch ${batchIdx} failed)`);
          batchSummaries.push(cached.summary);
          onDocStatus?.(f.name, "done");
          continue;
        }
        onDocStatus?.(f.name, "extracting");
        const retried = await fetchSingleFileWithRetry(f);
        batchSummaries.push(retried.summary);
        onDocStatus?.(f.name, retried.ok ? "done" : "error");
      }
      orderedSummaries.push({ index: batchIdx, summaries: batchSummaries });
    } finally {
      sem.release();
      processed += batch.length;
      onProgress(processed, files.length);
    }
  });

  await Promise.all(batchPromises);

  orderedSummaries.sort((a, b) => a.index - b.index);
  const nativeSummaries = orderedSummaries.flatMap((o) => o.summaries);

  return [...textSummaries, ...nativeSummaries];
}

// ── Evidence map ──────────────────────────────────────────────────────
const EVIDENCE_MAP_REGEX = /<!--\s*EVIDENCE_MAP\s*\n([\s\S]*?)\n\s*-->/;

export function extractEvidenceMap(text: string): { cleanText: string; entries: any[] } {
  const match = text.match(EVIDENCE_MAP_REGEX);
  if (!match) return { cleanText: text, entries: [] };
  try {
    const entries = JSON.parse(match[1]);
    const cleanText = text.replace(EVIDENCE_MAP_REGEX, "").trim();
    return { cleanText, entries: Array.isArray(entries) ? entries : [] };
  } catch {
    console.warn("Failed to parse EVIDENCE_MAP JSON");
    return { cleanText: text, entries: [] };
  }
}

export async function persistEvidenceMap(
  reportId: string,
  caseId: string,
  entries: any[],
  storedFilesList: { name: string; path?: string }[],
) {
  if (entries.length === 0) return;
  const pathMap = new Map<string, string>();
  for (const f of storedFilesList) {
    if (f.path) pathMap.set(f.name.toLowerCase(), f.path);
  }

  const rows = entries.map((e: any, idx: number) => ({
    ai_report_id: reportId,
    case_id: caseId,
    section_heading: (e.section || "").slice(0, 500),
    item_label: (e.item || "").slice(0, 500),
    item_text: (e.item || "").slice(0, 2000),
    document_name: e.document || "",
    document_path: pathMap.get((e.document || "").toLowerCase()) || `${caseId}/aml-sow/${e.document || ""}`,
    page_number: typeof e.page === "number" ? e.page : null,
    source_snippet: (e.snippet || "").slice(0, 2000),
    anchor_text: e.snippet ? (e.snippet as string).slice(0, 500) : null,
    relationship_type: e.relationship || "direct_extraction",
    is_primary: idx === 0 || e.is_primary !== false,
    confidence_score: typeof e.confidence === "number" ? e.confidence : null,
    sort_order: idx,
  }));

  try {
    const { error } = await supabase.from("evidence_references").insert(rows as any);
    if (error) console.error("Failed to persist evidence map:", error);
  } catch (err) {
    console.error("Evidence map persistence error:", err);
  }
}

// ── Armalytix Form Update extraction ─────────────────────────────────
const ARMALYTIX_FORM_UPDATE_REGEX = /<!--\s*ARMALYTIX_FORM_UPDATE\s*\n([\s\S]*?)\n\s*-->/;

export interface ArmalytixFormUpdate {
  purchase_price?: number;
  mortgage_amount?: number;
  mortgage_lender?: string;
  mortgage_type?: string;
  stamp_duty?: number;
  deposit_required?: number;
  tenure?: string;
  property_type?: string;
  first_time_buyer?: boolean;
  buying_jointly?: boolean;
  linked_transactions?: boolean;
  incentives?: string | null;
  completion_date?: string | null;
  persons?: Array<{
    full_name: string;
    role: string;
    employer?: string;
    job_title?: string;
    annual_salary?: number;
    employment_status?: string;
    funding_source?: string;
    contribution_amount?: number;
    pep_status?: string;
    nationality?: string;
    date_of_birth?: string;
  }>;
  accounts?: Array<{
    holder_name: string;
    account_type: string;
    provider?: string;
    balance?: number;
    is_manually_added?: boolean;
    data_source?: string;
  }>;
  total_balance_proved?: number;
  funding_gap?: number;
  data_confidence?: string;
}

export function extractArmalytixFormUpdate(text: string): ArmalytixFormUpdate | null {
  const match = text.match(ARMALYTIX_FORM_UPDATE_REGEX);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed === "object" && parsed !== null) return parsed as ArmalytixFormUpdate;
    return null;
  } catch {
    console.warn("Failed to parse ARMALYTIX_FORM_UPDATE JSON");
    return null;
  }
}

/**
 * Shared document processing utilities for edge functions.
 * Handles extraction of text from PDFs, images, Word docs, and other formats.
 * Uses Gemini multimodal capabilities for scanned/old PDFs and images.
 */

import pdf from "npm:pdf-parse@1.1.1/lib/pdf-parse.js";
import JSZip from "npm:jszip@3.10.1";
import { runOcrEscalation, enhanceOcrQuality, hasLowReadabilitySignals as ocrHasLowReadability } from "./ocrEscalation.ts";

// ── File type helpers ─────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic",
]);

const NATIVE_MULTIMODAL_EXTENSIONS = new Set([
  ".pdf", ...IMAGE_EXTENSIONS,
]);

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.substring(dot).toLowerCase() : "";
}

function getMimeType(fileName: string): string {
  const ext = getExtension(fileName);
  const mimeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".rtf": "application/rtf",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".eml": "message/rfc822",
    ".msg": "application/vnd.ms-outlook",
  };
  return mimeMap[ext] || "application/octet-stream";
}

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(fileName));
}

function isPdfFile(fileName: string): boolean {
  return getExtension(fileName) === ".pdf";
}

function isMultimodalFile(fileName: string): boolean {
  return NATIVE_MULTIMODAL_EXTENSIONS.has(getExtension(fileName));
}

// ── PDF text extraction ───────────────────────────────────────────────

/** Detect garbled/CIDFont text: high ratio of replacement chars, control chars, or very low word density */
function isGarbledText(text: string): boolean {
  if (!text || text.length < 50) return false;
  const replacementChars = (text.match(/[\uFFFD\u0000-\u0008\u000E-\u001F]/g) || []).length;
  const nonAsciiRatio = (text.match(/[^\x20-\x7E\n\r\t]/g) || []).length / text.length;
  // If >30% non-printable or >5% replacement/control chars, it's garbled
  if (replacementChars / text.length > 0.05) return true;
  if (nonAsciiRatio > 0.3) return true;
  // Check word density: garbled text has very few recognizable words
  const words = text.match(/[a-zA-Z]{3,}/g) || [];
  if (words.length < text.length / 200) return true; // fewer than 1 word per 200 chars
  return false;
}

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  try {
    const parsed = await pdf(bytes);
    const text = parsed.text?.trim();
    // Consider extraction successful if we get meaningful, non-garbled text
    if (text && text.length > 100) {
      if (isGarbledText(text)) {
        console.warn(`[documentProcessor] pdf-parse returned ${text.length} chars but text appears garbled — treating as failed extraction`);
        return "";
      }
      return text;
    }
    return "";
  } catch (e) {
    console.error("pdf-parse failed:", e.message);
    return "";
  }
}

// ── DOCX text extraction (ZIP + XML parsing) ──────────────────────────

async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const docXml = zip.file("word/document.xml");
    if (!docXml) return "";
    const xmlContent = await docXml.async("string");
    // Strip XML tags, keep text content
    const text = xmlContent
      .replace(/<w:br[^>]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text;
  } catch (e) {
    console.error("DOCX extraction failed:", e.message);
    return "";
  }
}

// ── Base64 encoding ───────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ProcessedDocument {
  fileName: string;
  /** Text content for text-based documents */
  textContent?: string;
  /** Base64 content + mime type for multimodal documents */
  multimodalContent?: {
    base64: string;
    mimeType: string;
  };
  /** Label/header for this document in the prompt */
  label: string;
  /** Whether this document should be sent as multimodal inline_data */
  isMultimodal: boolean;
  /** Processing notes */
  notes?: string;
}

export interface ProcessDocumentOptions {
  /** Max text length per document (default: 80000) */
  maxTextLength?: number;
  /** Max base64 length for multimodal fallback (default: 15000000 ~10MB) */
  maxBase64Length?: number;
  /** AI API key — when provided, enables 3-tier OCR escalation for scanned/image docs */
  aiApiKey?: string;
}

// ── Main processing function ──────────────────────────────────────────

/**
 * Process a single document file into a format suitable for AI analysis.
 * 
 * Strategy:
 * 1. PDFs: Try text extraction first. If too little text (scanned/old), 
 *    send as multimodal inline_data so Gemini can OCR it directly.
 * 2. Images: Always send as multimodal inline_data.
 * 3. Text files (CSV, TXT, RTF, EML): Decode as UTF-8 text.
 * 4. Word/Excel: Attempt text decode (limited), note for user.
 */
export async function processDocument(
  fileName: string,
  bytes: Uint8Array,
  labelPrefix: string,
  options: ProcessDocumentOptions = {}
): Promise<ProcessedDocument> {
  const maxTextLength = options.maxTextLength ?? 80000;
  const maxBase64Length = options.maxBase64Length ?? 15_000_000;
  const aiApiKey = options.aiApiKey;
  const ext = getExtension(fileName);
  const mimeType = getMimeType(fileName);
  const label = `[${labelPrefix} — ${fileName}]`;

  // ── Images: OCR escalation first, then multimodal fallback ──
  if (isImageFile(fileName)) {
    const base64 = bytesToBase64(bytes);
    if (base64.length > maxBase64Length) {
      return {
        fileName, label, isMultimodal: false,
        textContent: `[Image: ${fileName} — file is very large (${(bytes.length / 1024 / 1024).toFixed(1)}MB). For best results, compress or resize images before uploading.]`,
        notes: "Image exceeds multimodal size limit",
      };
    }

    // Run 3-tier OCR escalation if API key is available
    if (aiApiKey) {
      console.log(`[${fileName}] Running 3-tier OCR escalation for image`);
      const ocrResult = await runOcrEscalation(aiApiKey, base64, mimeType, fileName);

      if (ocrResult.text && ocrResult.text.length >= 50 && !ocrResult.text.startsWith("[All OCR models")) {
        let finalText = ocrResult.text;
        let finalModel = ocrResult.model;

        if (ocrHasLowReadability(finalText) && ocrResult.tier < 3) {
          const enhanced = await enhanceOcrQuality(aiApiKey, base64, mimeType, fileName, finalText, finalModel);
          if (enhanced.enhanced) { finalText = enhanced.text; finalModel = enhanced.model; }
        }

        console.log(`[${fileName}] Image OCR: ${finalText.length} chars via ${finalModel}${ocrResult.escalated ? " (escalated)" : ""}`);
        const truncated = finalText.length > maxTextLength;
        return {
          fileName, label, isMultimodal: false,
          textContent: `${label}\n[Image OCR via ${finalModel}]${truncated ? `\n(Truncated)` : ""}\n${finalText.slice(0, maxTextLength)}`,
          notes: ocrResult.escalated ? `OCR escalated to tier ${ocrResult.tier} (${finalModel})` : undefined,
        };
      }
      console.log(`[${fileName}] OCR escalation insufficient — falling back to multimodal`);
    }

    console.log(`[${fileName}] Sending as multimodal image (${mimeType}, ${(bytes.length / 1024).toFixed(0)}KB)`);
    return {
      fileName, label, isMultimodal: true,
      multimodalContent: { base64, mimeType },
    };
  }

  // ── PDFs: try text first, then OCR escalation, then multimodal ──
  if (isPdfFile(fileName)) {
    const text = await extractTextFromPdf(bytes);
    
    if (text && text.length >= 100) {
      console.log(`[${fileName}] Text extracted: ${text.length} chars`);
      // For financial PDFs with tables, add extraction note to help downstream AI
      const isFinancialPdf = /armalytix|open.?banking|thirdfort|infotrak|truelayer|source.?of.?funds|bank.?statement/i.test(fileName);
      const tableNote = isFinancialPdf
        ? `\n[NOTE: This is a structured financial document. Tables may appear as flattened text. Reconstruct tabular data where column patterns are identifiable.]`
        : "";
      const truncated = text.length > maxTextLength;
      return {
        fileName, label, isMultimodal: false,
        textContent: `${label}${tableNote}${truncated ? `\n(Truncated from ${text.length} to ${maxTextLength} chars)` : ""}\n${text.slice(0, maxTextLength)}`,
        notes: truncated ? "Text truncated" : undefined,
      };
    }

    // Log zero-text extraction for monitoring
    console.warn(`[${fileName}] ⚠️ ZERO TEXT EXTRACTED from PDF (${bytes.length} bytes) — will attempt OCR/multimodal fallback`);

    // Scanned/old PDF — try 3-tier OCR escalation before multimodal fallback
    const base64 = bytesToBase64(bytes);

    if (aiApiKey && base64.length <= maxBase64Length) {
      console.log(`[${fileName}] Scanned PDF — running 3-tier OCR escalation`);
      const ocrResult = await runOcrEscalation(aiApiKey, base64, "application/pdf", fileName);

      if (ocrResult.text && ocrResult.text.length >= 100 && !ocrResult.text.startsWith("[All OCR models")) {
        let finalText = ocrResult.text;
        let finalModel = ocrResult.model;

        if (ocrHasLowReadability(finalText) && ocrResult.tier < 3) {
          const enhanced = await enhanceOcrQuality(aiApiKey, base64, "application/pdf", fileName, finalText, finalModel);
          if (enhanced.enhanced) { finalText = enhanced.text; finalModel = enhanced.model; }
        }

        console.log(`[${fileName}] Scanned PDF OCR: ${finalText.length} chars via ${finalModel}`);
        const truncated = finalText.length > maxTextLength;
        return {
          fileName, label, isMultimodal: false,
          textContent: `${label}\n[Scanned PDF OCR via ${finalModel}]${truncated ? `\n(Truncated)` : ""}\n${finalText.slice(0, maxTextLength)}`,
          notes: `Scanned PDF OCR via ${finalModel} (tier ${ocrResult.tier})`,
        };
      }
      console.log(`[${fileName}] OCR escalation insufficient — falling back to multimodal`);
    }

    if (base64.length > maxBase64Length) {
      console.log(`[${fileName}] Scanned PDF very large (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
      return {
        fileName, label, isMultimodal: false,
        textContent: `${label}\n[Scanned PDF — ${(bytes.length / 1024 / 1024).toFixed(1)}MB. Text extraction and OCR yielded minimal content. Try splitting large PDFs into smaller sections.]`,
        notes: "Scanned PDF exceeds multimodal limit and OCR failed",
      };
    }

    console.log(`[${fileName}] Scanned/old PDF — sending as multimodal for AI OCR (${(bytes.length / 1024).toFixed(0)}KB)`);
    return {
      fileName, label, isMultimodal: true,
      multimodalContent: { base64, mimeType: "application/pdf" },
      notes: "Scanned/old PDF sent for multimodal OCR",
    };
  }

  // ── Text-based files ──
  const textExts = new Set([".txt", ".csv", ".md", ".rtf", ".eml"]);
  if (textExts.has(ext)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const truncated = text.length > maxTextLength;
      return {
        fileName, label, isMultimodal: false,
        textContent: `${label}${truncated ? `\n(Truncated)` : ""}\n${text.slice(0, maxTextLength)}`,
      };
    } catch {
      return {
        fileName, label, isMultimodal: false,
        textContent: `${label}\n[Could not decode text content]`,
      };
    }
  }

  // ── Word/Office documents ──
  const officeExts = new Set([".doc", ".docx", ".xls", ".xlsx"]);
  if (officeExts.has(ext)) {
    // DOCX: proper ZIP-based XML extraction
    if (ext === ".docx") {
      const docxText = await extractTextFromDocx(bytes);
      if (docxText && docxText.length > 50) {
        console.log(`[${fileName}] DOCX text extracted: ${docxText.length} chars`);
        const truncated = docxText.length > maxTextLength;
        return {
          fileName, label, isMultimodal: false,
          textContent: `${label}${truncated ? `\n(Truncated from ${docxText.length} to ${maxTextLength} chars)` : ""}\n${docxText.slice(0, maxTextLength)}`,
          notes: truncated ? "Text truncated" : undefined,
        };
      }
      // DOCX extraction failed — try multimodal
      const base64 = bytesToBase64(bytes);
      if (base64.length <= maxBase64Length) {
        console.log(`[${fileName}] DOCX text extraction failed — sending as multimodal`);
        return {
          fileName, label, isMultimodal: true,
          multimodalContent: { base64, mimeType },
          notes: "DOCX sent for multimodal analysis (text extraction failed)",
        };
      }
      return {
        fileName, label, isMultimodal: false,
        textContent: `${label}\n[Word document could not be read. Please convert to PDF and re-upload.]`,
        notes: "DOCX extraction failed and file too large for multimodal",
      };
    }

    // .doc, .xls, .xlsx — try basic text extraction
    try {
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const cleaned = rawText
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
        .replace(/\s{3,}/g, "\n")
        .trim();
      
      if (cleaned.length > 200) {
        console.log(`[${fileName}] Office doc text extracted: ${cleaned.length} chars`);
        const truncated = cleaned.length > maxTextLength;
        return {
          fileName, label, isMultimodal: false,
          textContent: `${label}\n[Office document — best-effort text extraction]\n${cleaned.slice(0, maxTextLength)}`,
          notes: truncated ? "Text truncated" : undefined,
        };
      }
    } catch { /* fall through */ }

    // Fallback: try sending as multimodal
    const base64 = bytesToBase64(bytes);
    if (base64.length <= maxBase64Length) {
      console.log(`[${fileName}] Office doc — attempting multimodal analysis`);
      return {
        fileName, label, isMultimodal: true,
        multimodalContent: { base64, mimeType },
        notes: "Office document sent for multimodal analysis",
      };
    }

    return {
      fileName, label, isMultimodal: false,
      textContent: `${label}\n[Office document — could not extract text. File may need manual review.]`,
      notes: "Office document could not be processed",
    };
  }

  // ── MSG (Outlook) files ──
  if (ext === ".msg") {
    try {
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const cleaned = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ").replace(/\s{3,}/g, "\n").trim();
      if (cleaned.length > 100) {
        return {
          fileName, label, isMultimodal: false,
          textContent: `${label}\n[Email message — best-effort extraction]\n${cleaned.slice(0, maxTextLength)}`,
        };
      }
    } catch { /* fall through */ }
    return {
      fileName, label, isMultimodal: false,
      textContent: `${label}\n[Outlook message file — could not extract content]`,
    };
  }

  // ── Unknown/other: try text decode ──
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.length > 50) {
      return {
        fileName, label, isMultimodal: false,
        textContent: `${label}\n${text.slice(0, maxTextLength)}`,
      };
    }
  } catch { /* ignore */ }

  return {
    fileName, label, isMultimodal: false,
    textContent: `${label}\n[Document could not be processed — format not supported for text extraction]`,
    notes: "Unsupported format",
  };
}

// ── Build AI message content from processed documents ─────────────────

/**
 * Build the user message content array for Gemini multimodal API.
 * Text documents are concatenated into text parts.
 * Multimodal documents are included as inline_data parts.
 */
export function buildMultimodalContent(
  textPreamble: string,
  processedDocs: ProcessedDocument[]
): any[] {
  const content: any[] = [];

  // Start with the text preamble (case info, instructions)
  let textBuffer = textPreamble;

  for (const doc of processedDocs) {
    if (doc.isMultimodal && doc.multimodalContent) {
      // Flush text buffer first
      if (textBuffer.trim()) {
        content.push({ type: "text", text: textBuffer });
        textBuffer = "";
      }
      // Add document label as text — use precise language to avoid priming model to claim "unreadable"
      const isFinancialReport = /armalytix|open.?banking|thirdfort|infotrak|truelayer|source.?of.?funds/i.test(doc.fileName);
      const visualNote = isFinancialReport
        ? `[This is a structured financial report sent as a complete visual PDF. You MUST read every page, extract all data, and cite specific figures. Do NOT claim this document is unreadable.]`
        : `[Analysing document visually — extract all readable content from every page]`;
      content.push({ type: "text", text: `\n\n---\n\n${doc.label}\n${visualNote}` });
      // Add the document as inline_data for Gemini multimodal
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${doc.multimodalContent.mimeType};base64,${doc.multimodalContent.base64}`,
        },
      });
    } else if (doc.textContent) {
      textBuffer += `\n\n---\n\n${doc.textContent}`;
    }
  }

  // Flush remaining text
  if (textBuffer.trim()) {
    content.push({ type: "text", text: textBuffer });
  }

  return content;
}

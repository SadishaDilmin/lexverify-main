/**
 * Client-side text extraction from .docx files using JSZip.
 * A .docx file is a ZIP archive containing XML files.
 * The main body text lives in word/document.xml.
 */
import JSZip from "jszip";

/**
 * Extract plain text from a .docx File object.
 * Returns the extracted text, or throws if the file isn't a valid .docx.
 */
export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error(
      `"${file.name}" is not a valid .docx file. It may be an older .doc format or an encrypted document. Please re-save it as .docx (unencrypted) in Microsoft Word and try again.`
    );
  }

  const docXml = zip.file("word/document.xml");
  if (!docXml) {
    throw new Error(
      `"${file.name}" does not contain expected Word content. Please ensure it is a valid .docx file.`
    );
  }

  const xmlContent = await docXml.async("string");

  // Parse XML and extract text from <w:t> tags
  const textParts: string[] = [];
  let currentParagraph = "";
  let inParagraph = false;

  // Simple regex-based extraction (avoids needing a full XML parser)
  // Split by paragraph markers <w:p ...> and extract <w:t> content
  const paragraphs = xmlContent.split(/<w:p[\s>]/);

  for (const para of paragraphs) {
    // Extract all <w:t> text content within this paragraph
    const textMatches = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches && textMatches.length > 0) {
      const paraText = textMatches
        .map((match) => {
          const content = match.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, "");
          return content;
        })
        .join("");

      if (paraText.trim()) {
        textParts.push(paraText);
      }
    }
  }

  const extractedText = textParts.join("\n\n");

  if (!extractedText || extractedText.trim().length < 10) {
    throw new Error(
      `"${file.name}" appears to contain no readable text. The document may be image-only or password-protected.`
    );
  }

  return extractedText;
}

/**
 * Check if a file's bytes indicate it's an OLE2 compound document (.doc format)
 * rather than a ZIP-based .docx. OLE2 files start with magic bytes D0 CF 11 E0.
 */
export function isOLE2Format(arrayBuffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 4));
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/**
 * Best-effort extraction for legacy .doc (OLE2) files.
 * Old binary Word files don't have a stable XML structure, so we decode
 * likely text runs and keep readable fragments.
 */
export async function extractLegacyDocText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const decodeCandidates = ["windows-1252", "utf-8"] as const;
  let bestText = "";

  for (const encoding of decodeCandidates) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes);
      const cleaned = decoded
        .replace(/\u0000/g, " ")
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ");

      const runs = cleaned.match(/[\p{L}\p{N}][\p{L}\p{N}\p{P}\p{Zs}]{4,}/gu) || [];
      const readable = runs
        .filter((run) => /[\p{L}]/u.test(run))
        .map((run) => run.trim())
        .filter(Boolean)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (readable.length > bestText.length) {
        bestText = readable;
      }
    } catch {
      // try next decoder candidate
    }
  }

  if (!bestText || bestText.length < 80) {
    throw new Error(
      `"${file.name}" could not be reliably read as a legacy .doc file. Please open it in Word and Save As .docx.`
    );
  }

  return bestText;
}

/**
 * Detect if extracted text is mostly garbled binary data.
 * Returns true if the text appears to be unreadable garbage.
 * 
 * Checks:
 * 1. Ratio of non-ASCII/control characters
 * 2. Average word length (garbled text has very long "words")
 * 3. Ratio of recognisable English words vs total tokens
 */
export function isGarbledText(text: string): boolean {
  if (!text || text.length < 50) return true;

  // Check ratio of non-printable / unusual characters
  const nonPrintable = text.replace(/[\x20-\x7E\n\r\t\u00A0-\u024F]/g, "");
  const nonPrintableRatio = nonPrintable.length / text.length;
  if (nonPrintableRatio > 0.15) return true;

  // Check for very long "words" (binary data decoded as text produces long runs)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return true;
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgWordLen > 25) return true;

  // Check ratio of words that look like real English (3+ letter lowercase words)
  const realWordPattern = /^[a-zA-Z]{2,}$/;
  const realWords = words.filter(w => realWordPattern.test(w));
  const realWordRatio = realWords.length / words.length;
  if (realWordRatio < 0.15) return true;

  // Check for patterns common in binary garbage
  const binaryPatterns = /(\x00|ÐÏà|PK\x03\x04|EncryptedPackage|DataSpaces|StrongEncryptionDataSpace)/;
  if (binaryPatterns.test(text)) return true;

  return false;
}

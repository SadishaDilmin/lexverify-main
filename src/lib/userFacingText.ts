/**
 * userFacingText.ts
 *
 * Last-mile sanitisation for AI-authored strings that are rendered directly
 * to end users (enquiry tracker entries, draft emails, summaries). Strips
 * machine markers (EVIDENCE_MAP JSON, ai-merge HTML comments, extraction
 * warnings) and the literal markdown punctuation that occasionally leaks
 * through (`**bold**`, leading `* ` bullets, `#` headings, stray backticks).
 *
 * This is intentionally a display-layer safety net. It does NOT replace the
 * structured parsers used during ingestion (extractEvidenceMap, etc.); it
 * runs on the read path so partial/legacy data still presents cleanly.
 *
 * Pure functions, no side effects.
 */

// ── Marker / block strippers ─────────────────────────────────────────

/** EVIDENCE_MAP block, in either the START/END or single-comment forms. */
const EVIDENCE_MAP_BLOCK_RE =
  /<!--\s*EVIDENCE_MAP(?:_START)?[\s\S]*?(?:EVIDENCE_MAP_END\s*-->|-->)/gi;

/** Standalone EVIDENCE_MAP_END marker (in case START was already stripped). */
const EVIDENCE_MAP_END_RE = /<!--\s*EVIDENCE_MAP_END\s*-->/gi;

/** ai-merge:* and other narrow HTML comments emitted by the pipeline. */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/** Loose, unwrapped EVIDENCE_MAP JSON tail that occasionally escapes. */
const LOOSE_EVIDENCE_MAP_TAIL_RE =
  /EVIDENCE_MAP_START[\s\S]*?(?:EVIDENCE_MAP_END|$)/gi;

/** Extraction-warning lines that survived earlier passes. */
const EXTRACTION_WARNING_RE = /\[EXTRACTION_WARNING\][^\n]*\n?/gi;

// ── Markdown punctuation strippers ───────────────────────────────────

/** **bold** or __bold__ — keep inner text. */
const BOLD_RE = /(\*\*|__)(.+?)\1/g;

/** *italic* or _italic_ — keep inner text. Avoid eating bare `*` bullets. */
const ITALIC_RE = /(?<![\*_\w])([\*_])(?!\s)([^*_\n]+?)(?<!\s)\1(?![\*_\w])/g;

/** Inline `code` backticks around prose. */
const INLINE_CODE_RE = /`([^`\n]+?)`/g;

/** Leading markdown headings (`#`, `##`, `###`). */
const HEADING_RE = /^[ \t]*#{1,6}[ \t]+/gm;

/** Leading bullet markers `* ` or `- ` (NOT `1. ` numbering). */
const BULLET_RE = /^[ \t]*[\*\-][ \t]+/gm;

/** Backslash-escaped markdown punctuation. */
const ESCAPED_PUNCT_RE = /\\([\*_#`\\])/g;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Remove machine markers and literal markdown punctuation from a string
 * that is about to be rendered as plain prose.
 */
export function stripUserFacingNoise(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw);

  // Block-level markers first
  s = s.replace(EVIDENCE_MAP_BLOCK_RE, "");
  s = s.replace(EVIDENCE_MAP_END_RE, "");
  s = s.replace(LOOSE_EVIDENCE_MAP_TAIL_RE, "");
  s = s.replace(HTML_COMMENT_RE, "");
  s = s.replace(EXTRACTION_WARNING_RE, "");

  // Markdown punctuation
  s = s.replace(BOLD_RE, "$2");
  s = s.replace(ITALIC_RE, "$2");
  s = s.replace(INLINE_CODE_RE, "$1");
  s = s.replace(HEADING_RE, "");
  s = s.replace(BULLET_RE, "");
  s = s.replace(ESCAPED_PUNCT_RE, "$1");

  // Tidy whitespace
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();

  return s;
}

/**
 * Split cleaned text into paragraphs suitable for rendering as separate
 * `<p>` elements. Single newlines are treated as line breaks within the
 * same paragraph; blank lines start a new paragraph.
 */
export function toCleanProse(raw: string | null | undefined): {
  paragraphs: string[];
} {
  const cleaned = stripUserFacingNoise(raw);
  if (!cleaned) return { paragraphs: [] };
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((p) => p.length > 0);
  return { paragraphs };
}

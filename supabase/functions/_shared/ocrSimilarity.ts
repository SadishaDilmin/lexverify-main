/**
 * Shared OCR similarity / "near-clone" heuristic.
 *
 * Purpose: when two reads of the SAME image-sourced document field
 * (e.g. two OCR passes of one passport, or the system reading one passport
 * twice via different filenames) disagree by only one or two characters,
 * this is overwhelmingly an extraction artefact rather than a genuine
 * discrepancy. A forger has no rational motive to fabricate an ID that
 * differs from the original by a single digit; therefore near-identical
 * disagreements should default to "OCR error — manual visual review",
 * not "Critical / Red identity discrepancy".
 *
 * This module is intentionally pure / dependency-free so it can be
 * imported by any edge function (extract-doc-summaries, agent-chat,
 * sow-section-validator) without runtime side-effects.
 */

// ── Normalisation ─────────────────────────────────────────────────────

/**
 * Normalise an ID-style value for comparison:
 * uppercase, strip whitespace and common punctuation, collapse runs.
 * Two values that look identical to a human after normalisation should
 * also compare equal here.
 */
export function normaliseIdValue(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .toUpperCase()
    .replace(/[\s\-_/.,:;()\[\]{}'"]+/g, "")
    .trim();
}

// ── Edit distance (Levenshtein) ───────────────────────────────────────

/**
 * Classic Levenshtein distance. O(n*m) memory and time; fine for the short
 * strings we compare here (passport numbers, DOBs, names < ~64 chars).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = a.length;
  const n = b.length;

  // Single-row DP for memory efficiency
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ── Image-source detection ────────────────────────────────────────────

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|heic|heif|tiff?|bmp|gif)$/i;

/**
 * Heuristic: does this filename look like an image-sourced artefact whose
 * OCR is therefore prone to character-level errors?
 *
 * PDFs are NOT considered image-sourced by default (digital text PDFs are
 * highly reliable). Callers that know a PDF was scanned can pass
 * `assumeScanned: true` to override.
 */
export function isImageSourcedFilename(
  fileName: string | null | undefined,
  assumeScanned = false,
): boolean {
  if (!fileName) return assumeScanned;
  if (IMAGE_EXT_RE.test(fileName)) return true;
  return assumeScanned;
}

// ── Near-clone predicate ──────────────────────────────────────────────

export interface NearCloneInput {
  /** First read of the field (e.g. "P1234578"). */
  valueA: string;
  /** Second read of the field (e.g. "P1234578" with one swapped digit). */
  valueB: string;
  /** Filename for the source artefact for read A (used to detect image source). */
  sourceA?: string | null;
  /** Filename for the source artefact for read B. */
  sourceB?: string | null;
  /**
   * Override: treat the source as image/scanned even when the filename
   * is not an obvious image extension. Use when the caller knows the PDF
   * was a scan rather than a digitally generated document.
   */
  assumeScanned?: boolean;
  /**
   * Maximum edit distance to be considered a near-clone. Default 2.
   * The principle: a forger has no rational motive to fabricate an ID
   * that differs from the original by 1–2 characters.
   */
  maxEditDistance?: number;
}

export interface NearCloneResult {
  /** True when the two values are a near-identical clone — almost certainly an OCR artefact. */
  isNearClone: boolean;
  /** Edit distance on normalised values. */
  editDistance: number;
  /** Length difference on normalised values (absolute). */
  lengthDelta: number;
  /** Normalised forms used for the comparison. */
  normalisedA: string;
  normalisedB: string;
  /** Whether the source artefact looked image-derived (gating the rule). */
  imageSourced: boolean;
  /**
   * Human-readable rationale that callers can paste into the Decision Log.
   */
  rationale: string;
}

/**
 * Decide whether two reads of an ID-style field are a "near-clone" —
 * i.e. so close to each other that the disagreement is overwhelmingly
 * likely to be an OCR / image-extraction artefact rather than a real
 * discrepancy.
 *
 * Conditions (ALL must hold):
 *   1. Both values are non-empty after normalisation.
 *   2. The values are NOT identical (no point flagging an exact match).
 *   3. At least one source looks image-sourced (or assumeScanned is true).
 *   4. Length difference ≤ 1 on the normalised forms.
 *   5. Levenshtein distance ≤ maxEditDistance (default 2) on normalised forms.
 *
 * The fraud sanity check: a forger has no rational motive to fabricate
 * a near-clone of the genuine value. Therefore near-clone disagreements
 * are treated as extraction noise.
 */
export function isNearCloneOcrArtifact(input: NearCloneInput): NearCloneResult {
  const normalisedA = normaliseIdValue(input.valueA);
  const normalisedB = normaliseIdValue(input.valueB);
  const maxDist = input.maxEditDistance ?? 2;

  // Both non-empty
  if (!normalisedA || !normalisedB) {
    return {
      isNearClone: false,
      editDistance: -1,
      lengthDelta: -1,
      normalisedA,
      normalisedB,
      imageSourced: false,
      rationale: "One or both values are empty after normalisation; near-clone heuristic does not apply.",
    };
  }

  // Identical → not a "near-clone disagreement", just a match.
  if (normalisedA === normalisedB) {
    return {
      isNearClone: false,
      editDistance: 0,
      lengthDelta: 0,
      normalisedA,
      normalisedB,
      imageSourced: true,
      rationale: "Values are identical after normalisation; no disagreement to suppress.",
    };
  }

  const imageSourced =
    isImageSourcedFilename(input.sourceA, input.assumeScanned) ||
    isImageSourcedFilename(input.sourceB, input.assumeScanned);

  const lengthDelta = Math.abs(normalisedA.length - normalisedB.length);
  const editDistance = levenshtein(normalisedA, normalisedB);

  if (!imageSourced) {
    return {
      isNearClone: false,
      editDistance,
      lengthDelta,
      normalisedA,
      normalisedB,
      imageSourced: false,
      rationale:
        "Sources are not image-derived (or no filename was provided); the near-clone safeguard is not applied to declarations or digital text fields.",
    };
  }

  if (lengthDelta > 1) {
    return {
      isNearClone: false,
      editDistance,
      lengthDelta,
      normalisedA,
      normalisedB,
      imageSourced: true,
      rationale: `Length difference is ${lengthDelta} characters; values differ in shape, not just in characters. Treat as a real disagreement to be investigated.`,
    };
  }

  if (editDistance > maxDist) {
    return {
      isNearClone: false,
      editDistance,
      lengthDelta,
      normalisedA,
      normalisedB,
      imageSourced: true,
      rationale: `Edit distance is ${editDistance}, above the near-clone threshold of ${maxDist}. The disagreement is too material to be confidently attributed to OCR alone.`,
    };
  }

  return {
    isNearClone: true,
    editDistance,
    lengthDelta,
    normalisedA,
    normalisedB,
    imageSourced: true,
    rationale:
      `Two reads of an image-sourced field differ by only ${editDistance} character(s) (length delta ${lengthDelta}). ` +
      `A forger has no rational motive to fabricate an ID that differs from the original by 1–2 characters; ` +
      `near-identical disagreements on the same physical artefact are overwhelmingly OCR / image-extraction errors. ` +
      `Recommended classification: Amber — manual visual review, not Red / Critical.`,
  };
}

// ── Convenience: detect ID-mismatch language in report text ───────────

/**
 * Match phrases in a report that explicitly assert an ID number/field
 * mismatch sourced from image documents. Used by the validator to find
 * candidate findings to suppress.
 *
 * Returns an array of { phrase, context } hits — never throws.
 */
export interface IdMismatchHit {
  phrase: string;
  context: string;
}

const ID_MISMATCH_PATTERNS: RegExp[] = [
  // Original strict triggers
  /passport\s+number[s]?\s+(?:do\s+not|don['’]t|does\s+not)\s+match/i,
  /(?:passport|driving\s+licen[cs]e|id)\s+number[s]?\s+(?:differ|differs|mismatch|conflict)/i,
  /(?:two|both)\s+(?:passport|id|driving\s+licen[cs]e)\s+(?:scans?|images?|reads?|extractions?)\s+(?:show|reveal|indicate)\s+different/i,
  /identity\s+discrepancy\s+confirmed/i,
  /possible\s+(?:forgery|tampering)\s+(?:detected|identified)/i,

  // ── Broadened (caught real-world model phrasings that previously slipped through) ──
  // "Conflicting passports" / "Conflicting Passports:" headings
  /conflicting\s+passport[s]?/i,
  // "Two different passport numbers have been supplied/provided/given for him/her/them/this client"
  /(?:two|multiple)\s+different\s+passport\s+number[s]?/i,
  /different\s+passport\s+number[s]?\s+(?:have\s+been|were|are)\s+(?:supplied|provided|given|shown|recorded)/i,
  // "presence of different passport numbers for the same person"
  /presence\s+of\s+different\s+passport\s+number[s]?/i,
  // "Critical Identity Discrepancy" header (existing rule only matched "identity discrepancy confirmed")
  /critical\s+identity\s+discrepancy/i,
  // "Multiple, conflicting passport documents have been provided"
  /multiple,?\s+conflicting\s+passport\s+document[s]?/i,
  // "passport numbers supplied/provided for him/her/them/the same person"
  /passport\s+number[s]?\s+(?:supplied|provided|given|shown)\s+for\s+(?:him|her|them|the\s+same|this\s+(?:client|person|applicant|individual))/i,
  // "indicator of (potential) identity (document) fraud"
  /indicator\s+of\s+(?:potential\s+)?identity\s+(?:document\s+)?fraud/i,
  // "major red flag for identity (document) fraud"
  /major\s+red\s+flag\s+for\s+identity\s+(?:document\s+)?fraud/i,
];

export function detectIdMismatchLanguage(reportText: string): IdMismatchHit[] {
  if (!reportText) return [];
  const hits: IdMismatchHit[] = [];
  const seen = new Set<string>();
  for (const pattern of ID_MISMATCH_PATTERNS) {
    const m = reportText.match(pattern);
    if (m && typeof m.index === "number") {
      const phrase = m[0].slice(0, 160);
      // De-duplicate when multiple patterns hit the same surface phrase
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(0, m.index - 80);
      const end = Math.min(reportText.length, m.index + m[0].length + 80);
      hits.push({
        phrase,
        context: reportText.slice(start, end).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return hits;
}

// ── Candidate ID-value extraction (for value-level near-clone detection) ──

/**
 * Extract candidate ID-style tokens from a window of report text.
 *
 * Targets shapes commonly used for passport / driving-licence / NI numbers
 * surfaced in Olimey AI reports:
 *   - 1–2 uppercase letters followed by 6–9 digits  (e.g. "R0258841", "AB1234567")
 *   - 9 digits                                       (e.g. "123456789" — UK passport)
 *   - 2 letters + 6 digits + 1 letter                (NI numbers, e.g. "AB123456C")
 *
 * Tokens may be wrapped in markdown bold/code (`**X**`, `` `X` ``) — we strip
 * those before matching. We deduplicate on the normalised value.
 *
 * Returns up to `limit` candidates in document order. The function is pure;
 * it never throws.
 */
export interface IdValueCandidate {
  /** Original surface form as it appeared in the text. */
  raw: string;
  /** Normalised form used for comparison. */
  normalised: string;
  /** 0-based index in the input text where the match started. */
  index: number;
}

const ID_VALUE_PATTERNS: RegExp[] = [
  // 1–2 letters + 6–9 digits (covers passport-style "R0258841", "AB1234567")
  /\b([A-Z]{1,2}\d{6,9})\b/g,
  // NI number style: AB123456C
  /\b([A-Z]{2}\d{6}[A-Z])\b/g,
  // 9-digit run (UK passport bare digits) — matched last so prefixed forms win
  /\b(\d{9})\b/g,
];

export function extractCandidateIdValues(
  text: string,
  limit = 16,
): IdValueCandidate[] {
  if (!text) return [];
  // Strip markdown emphasis/code wrappers that often surround IDs in reports
  // (`**R0258841**`, `` `R0258841` ``) so the regex sees the bare token.
  const cleaned = text.replace(/[`*_]+/g, "");

  const out: IdValueCandidate[] = [];
  const seenNormalised = new Set<string>();

  for (const pattern of ID_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(cleaned)) !== null) {
      const raw = m[1];
      const normalised = normaliseIdValue(raw);
      if (!normalised) continue;
      // Skip pure-numeric short strings that are not 9 digits (already filtered by regex)
      if (seenNormalised.has(normalised)) continue;
      seenNormalised.add(normalised);
      out.push({ raw, normalised, index: m.index });
      if (out.length >= limit) return out;
    }
  }

  // Sort by document order so the validator can report "first" vs "second" reads naturally.
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Convenience: given a list of candidate values from extractCandidateIdValues,
 * find the FIRST pair that the near-clone heuristic confirms as an OCR
 * artefact (edit distance ≤ maxEditDistance, length delta ≤ 1, image-sourced
 * assumed). Returns null when no near-clone pair exists.
 *
 * `assumeScanned` is true by default here because the validator runs on the
 * report body where source filenames may not be available in scope; the
 * upstream caller has already determined that an ID-mismatch phrase was
 * present, which is sufficient justification to assume image-sourced fields.
 */
export interface NearCloneIdPair {
  valueA: string;
  valueB: string;
  editDistance: number;
  rationale: string;
}

export function findFirstNearCloneIdPair(
  candidates: IdValueCandidate[],
  opts: { maxEditDistance?: number; assumeScanned?: boolean } = {},
): NearCloneIdPair | null {
  const max = opts.maxEditDistance ?? 2;
  const assumeScanned = opts.assumeScanned ?? true;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.normalised === b.normalised) continue;
      const result = isNearCloneOcrArtifact({
        valueA: a.raw,
        valueB: b.raw,
        assumeScanned,
        maxEditDistance: max,
      });
      if (result.isNearClone) {
        return {
          valueA: a.raw,
          valueB: b.raw,
          editDistance: result.editDistance,
          rationale: result.rationale,
        };
      }
    }
  }
  return null;
}

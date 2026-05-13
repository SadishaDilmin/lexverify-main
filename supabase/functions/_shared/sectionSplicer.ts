/**
 * Section splicer — locate a named section in a markdown report by its heading
 * and replace the body with a rewritten version. Used by `sow-section-rerun`
 * to refresh only the affected sections of a Olimey AI report without
 * touching the rest.
 *
 * Safety:
 *  - If the heading cannot be located, returns null and the caller MUST NOT
 *    write the report back. This prevents accidental section deletion.
 *  - Preserves the original heading line verbatim — only the body between
 *    this heading and the next sibling-or-higher heading is replaced.
 *  - Operates on plain markdown; it does NOT parse semantic structure beyond
 *    headings.
 */

import { SECTION_HEADING_PATTERNS, SectionId } from "./enquirySectionMap.ts";

export interface SectionExtract {
  /** The full original heading line, e.g. "## Source of Wealth — Savings" */
  heading: string;
  /** The body text BELOW the heading and ABOVE the next heading (no heading itself). */
  body: string;
  /** 0-indexed start position of the heading in the source. */
  startIndex: number;
  /** 0-indexed end position (exclusive) of the section body in the source. */
  endIndex: number;
  /** Heading level (1–6). */
  level: number;
}

/**
 * Find a section by its registered SectionId and return the extracted heading + body.
 * Returns null if the section cannot be located unambiguously.
 */
export function extractSection(
  markdown: string,
  sectionId: SectionId,
): SectionExtract | null {
  const patterns = SECTION_HEADING_PATTERNS[sectionId];
  if (!patterns || patterns.length === 0) return null;

  // Try each pattern; first match wins.
  for (const pattern of patterns) {
    const match = pattern.exec(markdown);
    if (!match) continue;

    const headingLine = match[0];
    const startIndex = match.index;
    const headingLevel = (headingLine.match(/^(#{1,6})/)?.[1] || "#").length;

    // Find the end: the next heading at the same level or higher (fewer #s),
    // OR the end of the document.
    const afterHeadingPos = startIndex + headingLine.length;
    const remainder = markdown.slice(afterHeadingPos);

    // Build a regex that matches the next sibling-or-higher heading.
    const nextHeadingRegex = new RegExp(
      `^#{1,${headingLevel}}\\s+\\S`,
      "m",
    );
    const nextMatch = nextHeadingRegex.exec(remainder);
    const bodyEnd = nextMatch
      ? afterHeadingPos + nextMatch.index
      : markdown.length;

    const body = markdown.slice(afterHeadingPos, bodyEnd).replace(/^\n+/, "").replace(/\n+$/, "");

    return {
      heading: headingLine,
      body,
      startIndex,
      endIndex: bodyEnd,
      level: headingLevel,
    };
  }

  return null;
}

/**
 * Replace a section's body in-place. Returns the new markdown, or null if the
 * section could not be found (caller must abort the splice).
 *
 * The new body is written WITHOUT a leading heading — the original heading
 * is preserved verbatim. If the new body accidentally starts with a heading
 * line that duplicates the original, it will be stripped to avoid double
 * headings.
 */
export function replaceSection(
  markdown: string,
  sectionId: SectionId,
  newBody: string,
): string | null {
  const extract = extractSection(markdown, sectionId);
  if (!extract) return null;

  // Strip a duplicate leading heading if the AI included one.
  let cleanedBody = newBody.trim();
  const originalHeadingPattern = new RegExp(
    `^#{1,6}\\s+${escapeRegex(extract.heading.replace(/^#+\s*/, "").trim())}\\s*\\n+`,
    "i",
  );
  cleanedBody = cleanedBody.replace(originalHeadingPattern, "");

  const before = markdown.slice(0, extract.startIndex);
  const after = markdown.slice(extract.endIndex);

  // Preserve a single newline gap between heading and body; ensure trailing
  // separation before the next section.
  const rebuilt = `${extract.heading}\n\n${cleanedBody}\n\n`;

  return `${before}${rebuilt}${after.replace(/^\n+/, "")}`;
}

/**
 * Append a Decision Log entry to a markdown report. Locates the Decision Log
 * section heading and inserts the entry at the END of its body. If no Decision
 * Log section exists, appends one at the end of the document.
 */
export function appendDecisionLogEntry(markdown: string, entry: string): string {
  const extract = extractSection(markdown, "decision_log_only");
  const trimmedEntry = entry.trim();

  if (!extract) {
    // No Decision Log section — append a new one at the end.
    const sep = markdown.endsWith("\n") ? "" : "\n";
    return `${markdown}${sep}\n## Decision Log\n\n${trimmedEntry}\n`;
  }

  const before = markdown.slice(0, extract.startIndex);
  const after = markdown.slice(extract.endIndex);
  const newBody = `${extract.body.trim()}\n\n${trimmedEntry}`;

  return `${before}${extract.heading}\n\n${newBody}\n\n${after.replace(/^\n+/, "")}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses an Olimey AI `draft_email` markdown body into a structured list of
 * enquiry items suitable for seeding `enquiry_items` rows under Round 1.
 *
 * Input shape produced by the Olimey AI finalisation step typically looks like:
 *
 *   **For the attention of Mr. Stewart:**
 *
 *   **1. Identity Document**
 *   To complete our identity checks ...
 *
 *   **2. Source of Your Funds**
 *   We need to understand the source of the funds ...
 *   *   Could you please provide ...
 *   *   To support your explanation ...
 *
 * The parser is deterministic, dependency-free, and intentionally permissive:
 * any heading that starts with a number followed by a title becomes one
 * enquiry item. Sub-bullets are folded into `original_enquiry_text`.
 *
 * Categories are inferred from the heading title using the same vocabulary as
 * `enquirySectionMap.ts` so the existing reply-prescan and section-rerun
 * pipelines route correctly. If no category match is found we fall back to
 * "general" (which the section map treats as `decision_log_only`).
 *
 * The parser does NOT call the AI model. It is a pure text transform — safe
 * to run client-side or in an edge function, idempotent, and easy to unit test.
 */

export interface ParsedEnquiryItem {
  enquiry_number: string;
  category: string;
  issue_summary: string;
  original_enquiry_text: string;
  evidence_required: string;
  who_addressed?: string;
}

// Heading like "**1. Identity Document**" or "**1.2 Salary corroboration**"
const NUMBERED_HEADING = /^\*{0,2}(\d+(?:\.\d+)*)[.\)]?\s+([^\n*]+?)\*{0,2}\s*$/;
// Inline item like "1. **Identity Document:** Please provide ..."
const INLINE_NUMBERED_ITEM = /^(\d+(?:\.\d+)*)[.\)]\s+\*{0,2}([^:*\n]+?)(?::\*{0,2}|\*{0,2}:)\s+(.+?)\s*$/;
// "For the attention of Mr. Stewart:" or "For the attention of: Both"
const ATTENTION_HEADING = /^\*{0,2}for\s+the\s+attention\s+of[:\s]+([^\n*]+?)\*{0,2}\s*:?\s*$/i;
// Merged-in "Additional enquiry" blocks emitted by sow-finding-resolution.
// Matches: "### Additional enquiry — <section label>" (em-dash or hyphen).
const ADDITIONAL_ENQUIRY_HEADING = /^#{2,4}\s+Additional\s+enquiry\s*[—\-–]\s+(.+?)\s*$/i;
// Section divider used in the agent's drafts
const DIVIDER = /^-{3,}$/;
// HTML-comment markers emitted by sow-finding-resolution to locate AI-merged
// blocks. They are an INTERNAL plumbing detail and must never reach the
// client-facing tracker. Match both single-line and multi-line forms.
const AI_MERGE_COMMENT = /<!--\s*ai-merge:[\s\S]*?-->/gi;
// Single-line variant used when filtering the source line-by-line.
const AI_MERGE_LINE = /^\s*<!--\s*ai-merge:[\s\S]*?-->\s*$/i;

/** Remove every `<!-- ai-merge: ... -->` marker from a string and tidy
 *  the surrounding whitespace so callers get clean prose. Safe on null. */
export function stripAiMergeMarkers(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(AI_MERGE_COMMENT, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** Loose category inference — keep aligned with enquirySectionMap.ts vocabulary.
 *  The TITLE is weighted more than the body so a "Source of Your Funds" heading
 *  is not mis-classified as Income just because the bullets mention payslips. */
function inferCategory(title: string, body: string): string {
  const t = title.toLowerCase();
  const hay = `${title} ${body}`.toLowerCase();
  // Title-priority rules — only checked against the heading text.
  const titleRules: Array<[RegExp, string]> = [
    [/decision\s*log|completion\s*readiness|quality\s*review|judge\s*finding|supervisory\s*review|evidence\s*map/, "Decision Log"],
    [/source of (the )?(your )?funds|source of deposit|\bfunding\b|bank statements?/, "Source of Funds"],
    [/identity|passport|driving licence|driver'?s? licen[cs]e|id verification/, "Identity"],
    [/proof of address|address/, "Proof of Address"],
    [/mortgage|lender/, "Mortgage"],
    [/gift|donor/, "Gift"],
    [/inherit|probate/, "Inheritance"],
    [/property\s+(sale|disposal)|sale of (a |the )?property/, "Property Sale"],
    [/savings/, "Savings"],
    [/pension|investment|isa\b/, "Investments"],
    [/business|company|dividend|self[-\s]?employ/, "Business Income"],
    [/income|salary|employment|payslip/, "Income"],
    [/completion funds/, "Completion Funds"],
    [/pep|sanction|adverse media|open[-\s]?source/, "External Profile"],
    [/deposit/, "Source of Funds"],
  ];
  for (const [re, cat] of titleRules) {
    if (re.test(t)) return cat;
  }
  // Body fallback rules — only consulted when the title was unhelpful.
  const bodyRules: Array<[RegExp, string]> = [
    [/passport|driving licence|certified copy.*passport/, "Identity"],
    [/utility bill|council tax/, "Proof of Address"],
    [/payslip|sa302|tax return|p60/, "Income"],
    [/savings|accumulat/, "Savings"],
    [/pension/, "Investments"],
    [/inherit|probate/, "Inheritance"],
    [/gift|donor/, "Gift"],
    [/mortgage offer|loan to value|ltv/, "Mortgage"],
    [/source of (the )?(your )?funds|source of deposit|deposit|bank statements?|account from which you transferred/, "Source of Funds"],
    [/pep|sanction|adverse media/, "External Profile"],
  ];
  const rules = bodyRules;
  for (const [re, cat] of rules) {
    if (re.test(hay)) return cat;
  }
  return "General";
}

/** First non-trivial sentence of the body, capped at 240 chars, used as issue_summary. */
function summariseIssue(title: string, body: string): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (!trimmed) return title.trim();
  // Take the first sentence-ish chunk
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
  return firstSentence.length > 240 ? `${firstSentence.slice(0, 237)}…` : firstSentence;
}

/** Pull bullet lines that mention "provide"/"evidence"/"statement" into evidence_required. */
function extractEvidenceRequired(body: string): string {
  const bullets = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^[*\-•]\s+/.test(l))
    .map((l) => l.replace(/^[*\-•]\s+/, "").trim());

  const evidence = bullets.filter((b) =>
    /provide|evidence|statement|payslip|sa302|certified|copy|account|receipt|letter|declaration/i.test(b),
  );
  if (evidence.length > 0) return evidence.join("\n• ").replace(/^/, "• ");
  // No bullets — fall back to the whole body if it asks for evidence
  if (/please (provide|supply|send|forward)/i.test(body)) {
    return body.replace(/\s+/g, " ").trim();
  }
  return "";
}

/**
 * Main entry point. Returns parsed items in the order they appear in the email.
 * Returns an empty array if no numbered enquiries are found (caller decides how
 * to surface that — e.g. show "No enquiries detected, drop reply to start").
 */
export function parseDraftEmailEnquiries(draftEmail: string | null | undefined): ParsedEnquiryItem[] {
  if (!draftEmail || typeof draftEmail !== "string") return [];

  // Normalise CRLF and strip subject line + greeting noise so they don't get parsed as items.
  const lines = draftEmail.replace(/\r\n/g, "\n").split("\n");

  const items: ParsedEnquiryItem[] = [];
  let currentAttention: string | undefined;
  let currentNumber: string | null = null;
  let currentTitle: string | null = null;
  let currentBodyLines: string[] = [];

  const flush = () => {
    if (!currentNumber || !currentTitle) return;
    const rawBody = currentBodyLines.join("\n").trim();
    // Strip internal ai-merge HTML comments from EVERY field that may end
    // up in the tracker UI. They are plumbing markers, not client content.
    const body = stripAiMergeMarkers(rawBody);
    const cleanTitle = stripAiMergeMarkers(currentTitle).trim() || currentTitle.trim();
    const fullText = stripAiMergeMarkers(`**${currentNumber}. ${cleanTitle}**\n${body}`.trim());
    const category = inferCategory(cleanTitle, body);
    const issueSummary = summariseIssue(cleanTitle, body);
    // Evidence Required must always be populated so the tracker UI renders the
    // block consistently for every enquiry. Order of preference:
    //   1) Bulleted/explicit evidence pulled from the body.
    //   2) The body itself (it's almost always a "please provide …" ask).
    //   3) The issue summary as a final, human-readable fallback.
    const extracted = stripAiMergeMarkers(extractEvidenceRequired(body));
    const evidenceRequired =
      extracted ||
      (body ? body.replace(/\s+/g, " ").trim() : "") ||
      issueSummary;
    items.push({
      enquiry_number: currentNumber,
      category,
      issue_summary: issueSummary,
      original_enquiry_text: fullText,
      evidence_required: evidenceRequired,
      who_addressed: currentAttention,
    });
    currentNumber = null;
    currentTitle = null;
    currentBodyLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Drop ai-merge plumbing markers entirely — they must not appear in
    // headings, bodies, or evidence text under any circumstances.
    if (AI_MERGE_LINE.test(line)) {
      continue;
    }

    if (DIVIDER.test(line.trim())) {
      flush();
      continue;
    }

    const attentionMatch = line.trim().match(ATTENTION_HEADING);
    if (attentionMatch) {
      flush();
      currentAttention = attentionMatch[1]
        .replace(/[:*]+$/, "")
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }

    const inlineMatch = line.trim().match(INLINE_NUMBERED_ITEM);
    if (inlineMatch) {
      flush();
      currentNumber = inlineMatch[1];
      currentTitle = inlineMatch[2].trim();
      currentBodyLines = [inlineMatch[3].trim()];
      continue;
    }

    const headingMatch = line.trim().match(NUMBERED_HEADING);
    // Only treat as an enquiry heading if the title looks substantive
    // (>= 3 chars, not a sentence that just happens to start with a number).
    if (headingMatch && headingMatch[2].trim().length >= 3 && !line.trim().endsWith(".")) {
      flush();
      currentNumber = headingMatch[1];
      currentTitle = headingMatch[2].trim();
      continue;
    }

    // "### Additional enquiry — <section>" blocks emitted by the merge flow.
    // These are not numbered, so we synthesise the next integer following the
    // highest top-level number already seen (or already collected).
    const additionalMatch = line.trim().match(ADDITIONAL_ENQUIRY_HEADING);
    if (additionalMatch && additionalMatch[1].trim().length >= 3) {
      flush();
      // Skip internal QA / supervisory artefacts that must NOT be presented to
      // the client as enquiries. Decision Log, judge findings, completion
      // readiness checks, and quality reviews belong in Section 6 of the
      // internal report — not the Enquiries Tracker.
      const internalArtefactPattern =
        /\b(decision\s*log|decision[-\s]log\s*audit|judge(?:\s|$)|quality\s*review|completion\s*readiness|supervisory\s*review|mlro\s*review)\b/i;
      if (internalArtefactPattern.test(additionalMatch[1])) {
        continue;
      }
      const usedTopLevel = items
        .map((i) => parseInt((i.enquiry_number ?? "0").split(".")[0], 10))
        .filter((n) => Number.isFinite(n));
      const next = (usedTopLevel.length > 0 ? Math.max(...usedTopLevel) : 0) + 1;
      currentNumber = String(next);
      currentTitle = additionalMatch[1].trim();
      continue;
    }

    if (currentNumber) {
      currentBodyLines.push(line);
    }
  }
  flush();

  // Patterns that mark an item as internal commentary rather than a client
  // question. These leak in occasionally when the model emits self-critique
  // ("the report should have...") or completion-readiness notes inside the
  // draft email body.
  const metaCommentaryPattern =
    /^(no additional enquiry is needed|no enquiry (is )?required|the report (should|does not|fails to)|cease work|escalate to mlro)/i;
  // Strictly internal supervisory artefacts. NOTE: this list deliberately
  // EXCLUDES section labels that, while internal-sounding, do surface real
  // client-facing questions (e.g. "Material Inbound Credit Review",
  // "Material Credit Anti-Bundling", "Own-Account Transfer Verification",
  // "Evidence Format Rule"). Those are valid Section 6A-2 / 10A enquiry
  // headings and must reach the tracker. They were previously over-matched
  // here, which incorrectly suppressed real client enquiries.
  const internalTitlePattern =
    /\b(decision\s*log|completion\s*readiness|judge\s*finding|quality\s*review|supervisory\s*review|evidence\s*map)\b/i;

  const filtered = items.filter((i) => {
    // Drop spurious headings like "1. Important" with no real body.
    if (i.original_enquiry_text.length <= 30) return false;
    // Drop anything categorised as Decision Log — these are supervisory
    // artefacts, not client enquiries.
    if (i.category === "Decision Log") return false;
    // Drop titles that are obviously internal QA artefacts.
    if (internalTitlePattern.test(i.issue_summary) || internalTitlePattern.test(i.original_enquiry_text.slice(0, 200))) {
      return false;
    }
    // Drop bodies that open with self-critique or "no enquiry needed" notes.
    const bodyStart = i.original_enquiry_text
      .replace(/^\*{0,2}\d+(?:\.\d+)*[.\)]?\s*[^\n]*\n+/, "")
      .trimStart();
    if (metaCommentaryPattern.test(bodyStart) || metaCommentaryPattern.test(i.issue_summary)) {
      return false;
    }
    if (i.who_addressed && /^(both|information required from|for the attention of)/i.test(i.issue_summary)) {
      return false;
    }
    return true;
  });

  // ── Similarity-based de-duplication ──────────────────────────────────
  // Defence-in-depth on top of the agent-side "one topic per numbered enquiry"
  // prompt rule. If the agent slips and emits two near-identical numbered
  // items (e.g. **6. Material Inbound Credit Review** and **7. Material
  // Credit Anti-Bundling** about the SAME £1,000 credit), keep the first
  // and drop the rest. We compare on the issue text plus body, normalised
  // to lowercase token bags, and require a high overlap (Jaccard ≥ 0.75)
  // to avoid swallowing genuinely distinct enquiries.
  return collapseNearDuplicates(filtered);
}

/** Lowercased word tokens, with stop-words and short noise removed. */
const STOP_WORDS = new Set([
  "the","and","for","with","that","this","you","your","please","provide",
  "from","into","into","of","to","a","an","is","are","was","were","be","been",
  "on","in","at","by","or","as","it","we","our","us","their","they","them",
  "any","all","some","also","not","no","so","do","does","did","could","would",
  "should","can","may","might","specifically","corresponding","respectively",
]);
function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[^\p{L}\p{N}£$%.\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Collapse near-duplicate parsed enquiries. Keeps the first occurrence
 *  (which usually carries the more specific section heading) and drops
 *  later items whose body is highly similar. Returns the surviving items
 *  in original order. Pure, deterministic, exported for unit testing. */
export function collapseNearDuplicates(
  items: ParsedEnquiryItem[],
  similarityThreshold = 0.75,
): ParsedEnquiryItem[] {
  if (items.length < 2) return items;
  const kept: ParsedEnquiryItem[] = [];
  const keptTokens: Array<{ summary: Set<string>; body: Set<string> }> = [];
  for (const item of items) {
    const summary = tokenSet(item.issue_summary);
    const body = tokenSet(`${item.issue_summary}\n${item.original_enquiry_text}`);
    let isDup = false;
    for (let i = 0; i < kept.length; i++) {
      const k = keptTokens[i];
      // Treat as duplicate if EITHER the issue summary alone OR the full
      // body shows very high overlap. Issue-summary-only catches reworded
      // headings like "Material Inbound Credit Review" vs "Material Credit
      // Anti-Bundling" that share the same body. Body overlap catches
      // restated questions with different headings.
      const summarySim = jaccard(summary, k.summary);
      const bodySim = jaccard(body, k.body);
      if (summarySim >= similarityThreshold || bodySim >= similarityThreshold) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      kept.push(item);
      keptTokens.push({ summary, body });
    }
  }
  return kept;
}

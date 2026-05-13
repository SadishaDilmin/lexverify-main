/**
 * Deterministic draft-email coverage gate.
 *
 * Compares HIGH-risk material issues identified in the Olimey AI internal
 * report against the enquiries actually present in the draft email. Returns a
 * structured coverage report so the persistence layer can:
 *   - flip ai_reports.finalisation_status to "coverage_gap" when coverage is poor;
 *   - persist a sidecar (ai_reports.coverage_report) for the UI to render gaps;
 *   - insert a review_queue row so judge rule #22 is enforced deterministically.
 *
 * Pure module — no React, no Supabase. Easy to unit-test.
 *
 * Sources of material issues (deterministic markers in the internal report):
 *   1. LSAG Compliance Checklist rows where Status contains 🟥 / "Fail" or
 *      🟨 / "Partial".
 *   2. Funding Evidence Sources rows where Evidenced? contains "No" + 🟥.
 *   3. Primary Red Flags row(s) in the Internal Compliance Summary.
 *   4. "## Addendum —" / "<!-- ai-merge: finding=… -->" merged-finding blocks.
 *
 * Scoring: an issue is "covered" if any of its keyword tokens (party name,
 * amount in £, date, distinctive nouns) appears in the draft-email body. This
 * mirrors how a conveyancer scans for follow-up — it is intentionally generous
 * (one strong-token match is enough) so the gate fires only on genuine gaps.
 */

export type CoverageSeverity = "high" | "medium";

export interface MaterialIssue {
  id: string;
  source: "lsag" | "funding_evidence" | "red_flag" | "addendum";
  severity: CoverageSeverity;
  label: string;
  /** Original line of text from the internal report, for UI display. */
  evidenceLine: string;
  /** Lowercased tokens used for matching against the draft email. */
  tokens: string[];
}

export interface CoverageEntry {
  issue: MaterialIssue;
  matchedTokens: string[];
}

export interface CoverageReport {
  total: number;
  covered: number;
  uncovered: number;
  coverageRatio: number;
  highUncovered: number;
  /** True when finalisation_status should flip to "coverage_gap". */
  gateTripped: boolean;
  reason: string | null;
  coveredEntries: CoverageEntry[];
  uncoveredEntries: CoverageEntry[];
  /** Generated deterministic appendix block (caller decides whether to append). */
  appendixMarkdown: string;
  generatedAt: string;
}

const COVERAGE_RATIO_THRESHOLD = 0.7;

/* ------------------------------------------------------------------ */
/* Tokenisation                                                        */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "these", "those",
  "have", "has", "had", "are", "was", "were", "been", "being", "not", "but",
  "any", "all", "your", "you", "our", "we", "us", "in", "on", "of", "to", "is",
  "as", "at", "by", "an", "a", "no", "yes", "or", "if", "be", "do", "does", "did",
  "will", "would", "should", "could", "may", "might", "can", "client", "clients",
  "please", "kindly", "provide", "confirm", "details", "evidence", "source",
  "sources", "section", "report", "addendum", "enquiry", "enquiries", "finding",
  "findings", "review", "checklist", "compliance", "risk", "lsag", "aml",
  "material", "primary", "red", "flag", "flags", "fail", "partial", "pass",
]);

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u{1F7E5}\u{1F7E8}\u{1F7E9}\u{2705}\u274C]/gu, " ") // strip status emoji
    .replace(/[`*_~|<>\[\]()#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTokens(line: string): string[] {
  const norm = normalise(line);
  const tokens = new Set<string>();

  // Money amounts (e.g. £14,000.00) — keep numeric core for match flexibility.
  const moneyMatches = norm.match(/£\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? [];
  for (const m of moneyMatches) {
    const stripped = m.replace(/[£,\s]/g, "");
    if (stripped.length >= 3) tokens.add(stripped);
  }

  // Dates (e.g. 29 january 2026, 18-feb-2026, 18/02/2026).
  const dateMatches = norm.match(
    /\b\d{1,2}[\s\-\/](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/]?\d{0,4}\b|\b\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4}\b/g,
  ) ?? [];
  for (const d of dateMatches) {
    const compact = d.replace(/[\s\-\/]/g, "");
    if (compact.length >= 5) tokens.add(compact);
  }

  // Word tokens — strong nouns / proper names only.
  const wordMatches = norm.match(/\b[a-z][a-z'-]{3,}\b/g) ?? [];
  for (const w of wordMatches) {
    if (!STOPWORDS.has(w)) tokens.add(w);
  }

  return Array.from(tokens);
}

function buildEmailIndex(draftEmail: string): Set<string> {
  const norm = normalise(draftEmail);
  const idx = new Set<string>();

  for (const m of norm.match(/£\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? []) {
    idx.add(m.replace(/[£,\s]/g, ""));
  }
  for (const d of norm.match(
    /\b\d{1,2}[\s\-\/](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/]?\d{0,4}\b|\b\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4}\b/g,
  ) ?? []) {
    idx.add(d.replace(/[\s\-\/]/g, ""));
  }
  for (const w of norm.match(/\b[a-z][a-z'-]{3,}\b/g) ?? []) {
    idx.add(w);
  }
  return idx;
}

/* ------------------------------------------------------------------ */
/* Material-issue extractors                                            */
/* ------------------------------------------------------------------ */

function hashId(prefix: string, label: string): string {
  let h = 5381;
  for (let i = 0; i < label.length; i++) h = ((h << 5) + h + label.charCodeAt(i)) >>> 0;
  return `${prefix}-${h.toString(16)}`;
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && !/^\|\s*[:\-]+\s*\|/.test(trimmed);
}

function splitRow(row: string): string[] {
  return row.trim().slice(1, -1).split("|").map((c) => c.trim());
}

function extractFromLsagChecklist(internalReport: string): MaterialIssue[] {
  const issues: MaterialIssue[] = [];
  const lines = internalReport.split(/\r?\n/);
  let inLsag = false;

  for (const raw of lines) {
    if (/lsag\s+compliance\s+checklist/i.test(raw)) {
      inLsag = true;
      continue;
    }
    if (inLsag && /^#{2,3}\s/.test(raw) && !/lsag/i.test(raw)) break;
    if (!inLsag) continue;
    if (!isMarkdownTableRow(raw)) continue;

    const cols = splitRow(raw);
    if (cols.length < 4) continue;
    const status = cols[2] ?? "";
    const requirement = cols[1] ?? "";
    const notes = cols[3] ?? "";
    if (!/fail|partial|🟥|🟨/i.test(status)) continue;
    if (/^overall$/i.test(cols[0]?.replace(/\*/g, "").trim() ?? "")) continue;

    const severity: CoverageSeverity = /fail|🟥/i.test(status) ? "high" : "medium";
    const label = `LSAG ${cols[0]?.replace(/\*/g, "").trim()}: ${requirement.replace(/\*/g, "").trim()}`;
    const evidenceLine = `${label} — ${notes.replace(/\*/g, "").trim()}`;
    issues.push({
      id: hashId("lsag", label + notes),
      source: "lsag",
      severity,
      label,
      evidenceLine,
      tokens: extractTokens(`${requirement} ${notes}`),
    });
  }
  return issues;
}

function extractFromFundingEvidence(internalReport: string): MaterialIssue[] {
  const issues: MaterialIssue[] = [];
  const lines = internalReport.split(/\r?\n/);
  let inSection = false;

  for (const raw of lines) {
    if (/funding\s+evidence\s+sources/i.test(raw)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{2,3}\s/.test(raw) && !/funding/i.test(raw)) break;
    if (!inSection) continue;
    if (!isMarkdownTableRow(raw)) continue;

    const cols = splitRow(raw);
    if (cols.length < 5) continue;
    const evidenced = cols[3] ?? "";
    if (!/\bno\b/i.test(evidenced) || !/🟥/.test(evidenced)) continue;
    if (/^total\b/i.test(cols[0]?.replace(/\*/g, "").trim() ?? "")) continue;

    const party = cols[0]?.replace(/\*/g, "").trim() ?? "";
    const declared = cols[1]?.replace(/\*/g, "").trim() ?? "";
    const amount = cols[2]?.replace(/\*/g, "").trim() ?? "";
    const notes = cols[4]?.replace(/\*/g, "").trim() ?? "";

    const label = `Unevidenced funding: ${party} — ${declared} (${amount})`;
    const evidenceLine = `${label}. ${notes}`;
    issues.push({
      id: hashId("funding", label + notes),
      source: "funding_evidence",
      severity: "high",
      label,
      evidenceLine,
      tokens: extractTokens(`${party} ${declared} ${amount} ${notes}`),
    });
  }
  return issues;
}

function extractFromRedFlags(internalReport: string): MaterialIssue[] {
  const issues: MaterialIssue[] = [];
  const lines = internalReport.split(/\r?\n/);
  for (const raw of lines) {
    if (!isMarkdownTableRow(raw)) continue;
    const cols = splitRow(raw);
    if (cols.length < 2) continue;
    const label = cols[0]?.replace(/\*/g, "").trim() ?? "";
    if (!/primary\s+red\s+flags/i.test(label)) continue;

    // Detail cell may contain "1. Foo<br>2. Bar<br>3. Baz".
    const detailCell = cols[1] ?? "";
    const items = detailCell
      .split(/<br\s*\/?>(?:\s*\d+\.\s*)?|\n+|(?:^|\s)\d+\.\s+/)
      .map((s) => s.replace(/\*/g, "").trim())
      .filter((s) => s.length >= 8);
    for (const item of items) {
      issues.push({
        id: hashId("redflag", item),
        source: "red_flag",
        severity: "high",
        label: `Red flag: ${item.slice(0, 80)}`,
        evidenceLine: item,
        tokens: extractTokens(item),
      });
    }
  }
  return issues;
}

function extractFromAddenda(internalReport: string): MaterialIssue[] {
  const issues: MaterialIssue[] = [];
  // Match "## Addendum — <title>" headings and grab the next ~6 lines as context.
  const re = /(?:<!--\s*ai-merge:\s*finding=([0-9a-f]+)\s+section="([^"]+)"\s*-->\s*)?##\s+Addendum\s+[—-]\s+([^\n]+)\n([\s\S]*?)(?=\n##\s|\n<!--\s*ai-merge:|\n*$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(internalReport)) !== null) {
    const findingHash = match[1] ?? "";
    const title = (match[3] ?? "").trim();
    const body = (match[4] ?? "").trim();
    const evidenceLine = `${title} — ${body.slice(0, 240).replace(/\s+/g, " ")}`;
    issues.push({
      id: findingHash ? `addendum-${findingHash.slice(0, 12)}` : hashId("addendum", title),
      source: "addendum",
      severity: "high",
      label: `Merged finding: ${title}`,
      evidenceLine,
      tokens: extractTokens(`${title} ${body}`),
    });
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Dedupe                                                              */
/* ------------------------------------------------------------------ */

/**
 * Two issues are considered duplicates when their token sets overlap by
 * ≥ 70% on the smaller side. This collapses e.g. the LSAG row "Source of
 * funds identified — Origin of £14k unevidenced" and the funding-evidence row
 * "Nkem Stewart — Undeclared £14,000 — Transferred…" into one logical issue.
 */
function dedupeIssues(issues: MaterialIssue[]): MaterialIssue[] {
  const kept: MaterialIssue[] = [];
  for (const issue of issues) {
    const tokenSet = new Set(issue.tokens);
    const dup = kept.find((existing) => {
      const a = new Set(existing.tokens);
      const smaller = Math.min(a.size, tokenSet.size);
      if (smaller === 0) return false;
      let overlap = 0;
      for (const t of tokenSet) if (a.has(t)) overlap++;
      return overlap / smaller >= 0.7;
    });
    if (dup) {
      // Prefer the higher-severity / more specific entry (longer evidence line).
      if (
        (issue.severity === "high" && dup.severity !== "high") ||
        issue.evidenceLine.length > dup.evidenceLine.length
      ) {
        const i = kept.indexOf(dup);
        kept[i] = issue;
      }
      continue;
    }
    kept.push(issue);
  }
  return kept;
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export function extractMaterialIssues(internalReport: string): MaterialIssue[] {
  if (!internalReport || internalReport.length < 50) return [];
  return dedupeIssues([
    ...extractFromRedFlags(internalReport),
    ...extractFromLsagChecklist(internalReport),
    ...extractFromFundingEvidence(internalReport),
    ...extractFromAddenda(internalReport),
  ]);
}

function buildAppendix(uncoveredHigh: MaterialIssue[]): string {
  if (uncoveredHigh.length === 0) return "";
  const lines = ["", "---", "", "### Additional enquiries — coverage gap", ""];
  uncoveredHigh.forEach((issue, idx) => {
    lines.push(`${idx + 1}. **${issue.label}** — ${issue.evidenceLine}`);
  });
  lines.push("");
  return lines.join("\n");
}

export function evaluateDraftEmailCoverage(args: {
  internalReport: string;
  draftEmail: string;
  /** Minimum word-token matches required to consider an issue covered when no
   *  numeric (£amount or date) token is matched. Defaults to 3 — generous
   *  enough to avoid false negatives on shared proper-noun mentions, strict
   *  enough to require that the email actually discusses the issue. */
  minTokenMatches?: number;
}): CoverageReport {
  const minMatches = args.minTokenMatches ?? 3;
  const issues = extractMaterialIssues(args.internalReport);
  const emailIndex = buildEmailIndex(args.draftEmail || "");

  const covered: CoverageEntry[] = [];
  const uncovered: CoverageEntry[] = [];

  for (const issue of issues) {
    const matched: string[] = [];
    for (const token of issue.tokens) {
      if (emailIndex.has(token)) matched.push(token);
    }
    // A money / date token is a strong signal — one is enough.
    const hasNumericMatch = matched.some((t) => /^\d/.test(t));
    const isCovered = matched.length >= minMatches || hasNumericMatch;
    (isCovered ? covered : uncovered).push({ issue, matchedTokens: matched });
  }

  const total = issues.length;
  const coverageRatio = total === 0 ? 1 : covered.length / total;
  const highUncovered = uncovered.filter((e) => e.issue.severity === "high").length;

  let gateTripped = false;
  let reason: string | null = null;
  if (total === 0) {
    gateTripped = false;
  } else if (highUncovered > 0) {
    gateTripped = true;
    reason = `${highUncovered} HIGH-severity material issue${highUncovered === 1 ? "" : "s"} not addressed in the draft email.`;
  } else if (coverageRatio < COVERAGE_RATIO_THRESHOLD) {
    gateTripped = true;
    reason = `Draft email covers ${covered.length} of ${total} material issues (${Math.round(coverageRatio * 100)}%); threshold is ${Math.round(COVERAGE_RATIO_THRESHOLD * 100)}%.`;
  }

  return {
    total,
    covered: covered.length,
    uncovered: uncovered.length,
    coverageRatio,
    highUncovered,
    gateTripped,
    reason,
    coveredEntries: covered,
    uncoveredEntries: uncovered,
    appendixMarkdown: buildAppendix(uncovered.filter((e) => e.issue.severity === "high").map((e) => e.issue)),
    generatedAt: new Date().toISOString(),
  };
}

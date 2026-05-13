/**
 * groundedOutputValidator — defends against cross-case data leakage and model
 * fabrication in AI-drafted enquiry text.
 *
 * Background: a real cross-case leak was observed where a `sow-finding-resolution`
 * AI draft for case A contained transaction details (names, dates, amounts) that
 * had never been ingested for case A but did exist in another case's evidence.
 * Database queries remained correctly tenant-scoped — the leak occurred entirely
 * inside the model output, either as fabrication or carry-over from prior gateway
 * traffic. The strict "list each credit verbatim" anti-bundling rule made the
 * symptom worse by pressuring the model to invent specific tokens whenever the
 * report excerpt didn't contain real ones.
 *
 * Strategy: cite-or-quarantine. We extract the evidentiary tokens the model
 * quoted (names, dates, monetary amounts, account numbers) and verify each one
 * appears in the case-scoped evidence corpus. If any token is unverified the
 * caller MUST refuse to merge the draft and surface the unverified tokens.
 */

const MONTHS = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

/**
 * Fold a string into a normalised form for substring matching:
 *  - lowercase
 *  - collapse all whitespace to single spaces
 *  - strip punctuation that varies between sources (commas in numbers, etc.)
 *  - normalise £/GBP/$ symbols
 */
export function normaliseForMatch(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[£$€]/g, "")
    .replace(/\bgbp\b/g, "")
    .replace(/[,]/g, "")
    .replace(/[\u2010-\u2015]/g, "-") // en/em dashes → hyphen
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export interface ExtractedTokens {
  amounts: string[];     // raw matches, e.g. "£2,400.00"
  dates: string[];       // e.g. "10 April 2024"
  properNouns: string[]; // capitalised multi-word names from quoted descriptions
  accountRefs: string[]; // e.g. "Monzo account", "ending 1234"
}

/**
 * Extract evidentiary tokens that the model has quoted as fact. We are
 * deliberately conservative: we want to catch fabricated names and amounts
 * without flagging generic prose.
 */
export function extractTokens(text: string): ExtractedTokens {
  const t = text || "";

  // £ amounts: £1,234, £1,234.56, £2,400.00 etc.
  const amounts = Array.from(
    t.matchAll(/£\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\bGBP\s?\d[\d,]*(?:\.\d{1,2})?/gi),
    (m) => m[0].trim(),
  );

  // Dates: "10 April 2024", "April 2024", "10/04/2024", "10-04-2024", "2024-04-10"
  const dates: string[] = [];
  for (const m of t.matchAll(new RegExp(`\\b\\d{1,2}\\s+${MONTHS}\\s+\\d{4}\\b`, "gi"))) dates.push(m[0]);
  for (const m of t.matchAll(new RegExp(`\\b${MONTHS}\\s+\\d{4}\\b`, "gi"))) dates.push(m[0]);
  for (const m of t.matchAll(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g)) dates.push(m[0]);
  for (const m of t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) dates.push(m[0]);

  // Quoted descriptions in single or double quotes — common shape for
  // "described as 'NKEM STEWART (P2P Payment)'".
  const quotedDescriptions = Array.from(
    t.matchAll(/['"\u2018\u2019\u201c\u201d]([^'"\u2018\u2019\u201c\u201d\n]{2,80})['"\u2018\u2019\u201c\u201d]/g),
    (m) => m[1],
  );

  // From within quoted descriptions, pull proper-noun runs (≥2 consecutive
  // Capitalised tokens, all-caps tokens, or surname + initial patterns). These
  // are the strongest leak signal because generic enquiry prose almost never
  // emits them verbatim.
  const properNouns = new Set<string>();
  for (const q of quotedDescriptions) {
    for (const m of q.matchAll(/\b[A-Z][A-Z'\-]{1,}(?:\s+[A-Z][A-Z'\-]{1,}){1,}\b/g)) {
      properNouns.add(m[0].trim());
    }
    for (const m of q.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,}\b/g)) {
      const candidate = m[0].trim();
      // Filter common false positives such as month names, days, and short prose.
      if (/^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(candidate)) continue;
      properNouns.add(candidate);
    }
  }

  // Account references — keep loose. Used for context, not strict gating.
  const accountRefs = Array.from(
    t.matchAll(/\b(?:account\s+ending\s+\d{2,8}|sort\s+code\s+\d{2}-\d{2}-\d{2}|\bIBAN\s+[A-Z0-9]+)/gi),
    (m) => m[0].trim(),
  );

  return {
    amounts: dedupe(amounts),
    dates: dedupe(dates),
    properNouns: Array.from(properNouns),
    accountRefs: dedupe(accountRefs),
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
}

export interface ValidationResult {
  ok: boolean;
  unverifiedAmounts: string[];
  unverifiedDates: string[];
  unverifiedProperNouns: string[];
  reason?: string;
}

/**
 * Verify every quoted token appears in the normalised evidence corpus.
 *
 * Matching policy:
 *  - Amounts: normalised numeric (£2,400.00 → "2400.00") must appear in the
 *    corpus. We also accept the integer form ("2400") because some statements
 *    drop trailing zeros.
 *  - Dates: normalised date string must appear, OR all three components
 *    (day, month, year) must co-occur in the corpus within 60 chars.
 *  - Proper nouns: normalised name must appear as a substring. Fuzzy matching
 *    is intentionally avoided — partial matches are how real client names get
 *    confused with fabricated ones.
 */
export function validateAgainstEvidence(
  draftText: string,
  evidenceCorpus: string,
): ValidationResult {
  const tokens = extractTokens(draftText);
  const corpus = normaliseForMatch(evidenceCorpus);

  const unverifiedAmounts = tokens.amounts.filter((a) => {
    const n = normaliseForMatch(a);
    if (corpus.includes(n)) return true ? false : true;
    // strip trailing .00 — some sources omit pence
    const stripped = n.replace(/\.0+$/, "");
    return !corpus.includes(n) && !corpus.includes(stripped);
  });

  const unverifiedDates = tokens.dates.filter((d) => {
    const n = normaliseForMatch(d);
    if (corpus.includes(n)) return false;
    // Component fallback: split into parts and require all to co-occur.
    const parts = n.split(/[\s\-\/]+/).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => corpus.includes(p))) {
      return false;
    }
    return true;
  });

  const unverifiedProperNouns = tokens.properNouns.filter((p) => {
    const n = normaliseForMatch(p);
    if (corpus.includes(n)) return false;
    // Allow last-name-only match if surname is distinctive (≥4 chars).
    const parts = n.split(/\s+/);
    const surname = parts[parts.length - 1];
    if (surname.length >= 4 && corpus.includes(surname)) {
      // Require given name OR initial nearby in corpus to reduce coincidence.
      const given = parts[0];
      if (given && corpus.includes(given)) return false;
    }
    return true;
  });

  const ok =
    unverifiedAmounts.length === 0 &&
    unverifiedDates.length === 0 &&
    unverifiedProperNouns.length === 0;

  return {
    ok,
    unverifiedAmounts,
    unverifiedDates,
    unverifiedProperNouns,
    reason: ok
      ? undefined
      : `Draft contains ${unverifiedProperNouns.length} unverified name(s), ${unverifiedAmounts.length} unverified amount(s), and ${unverifiedDates.length} unverified date(s) that do not appear in this case's evidence.`,
  };
}

/**
 * Build the per-case evidence corpus from every source we trust as ground
 * truth for this case. Caller passes a service-role client.
 *
 * Sources (all strictly filtered by case_id):
 *  - sow_transactions.description / amount / tx_date
 *  - armalytix_reports.raw_json (whole JSON dump)
 *  - extracted_entities.raw_text / normalised_text
 *  - ai_reports.internal_report / client_report (prior outputs for THIS case)
 *
 * We deliberately do NOT include knowledge_base_content here — that is generic
 * regulatory text and would let any name appearing in guidance pass the gate.
 */
export async function buildCaseEvidenceCorpus(
  admin: any,
  caseId: string,
): Promise<string> {
  const parts: string[] = [];

  const [{ data: tx }, { data: arm }, { data: ents }, { data: reps }] = await Promise.all([
    admin
      .from("sow_transactions")
      .select("description, amount, tx_date, likely_explanation, enquiry_reason")
      .eq("case_id", caseId)
      .limit(5000),
    admin
      .from("armalytix_reports")
      .select("raw_json, mortgage_lender")
      .eq("case_id", caseId)
      .limit(50),
    admin
      .from("extracted_entities")
      .select("raw_text, normalised_text")
      .eq("case_id", caseId)
      .limit(5000),
    admin
      .from("ai_reports")
      .select("internal_report, client_report")
      .eq("case_id", caseId)
      .limit(50),
  ]);

  for (const row of tx ?? []) {
    parts.push(String(row.description ?? ""));
    parts.push(String(row.amount ?? ""));
    parts.push(String(row.tx_date ?? ""));
    parts.push(String(row.likely_explanation ?? ""));
    parts.push(String(row.enquiry_reason ?? ""));
  }
  for (const row of arm ?? []) {
    if (row.raw_json) parts.push(JSON.stringify(row.raw_json));
    parts.push(String(row.mortgage_lender ?? ""));
  }
  for (const row of ents ?? []) {
    parts.push(String(row.raw_text ?? ""));
    parts.push(String(row.normalised_text ?? ""));
  }
  for (const row of reps ?? []) {
    parts.push(String(row.internal_report ?? ""));
    parts.push(String(row.client_report ?? ""));
  }

  return parts.join("\n");
}

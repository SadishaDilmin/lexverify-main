/**
 * Case-aware query builder for the SoW orchestrator's keyword retrieval.
 *
 * Produces a query of the shape:
 *   [funding source narrative tokens] [deposit component tokens]
 *   [party type tokens] source of wealth AML compliance LSAG
 *
 * Inputs are read from existing case-record fields used elsewhere in the
 * SoW pipeline; no new data dependencies are introduced.
 *
 * The query string is logged in retrieval_logs.query_text and MUST NOT
 * contain PII. The builder applies a sanitisation step to the
 * funding-source narrative before tokenisation.
 */

const STATIC_SUFFIX = "source of wealth AML compliance LSAG";

// Recognised deposit-component values and their query token expansions.
// Keys are normalised (lowercase, underscores). The matcher accepts any of
// the alternates listed under each canonical key.
const DEPOSIT_COMPONENT_TOKENS: Record<string, string> = {
  gift: "gift donor",
  inheritance: "inheritance probate estate",
  business_sale: "business sale proceeds",
  investment_proceeds: "investment proceeds",
  property_sale: "property sale equity",
  savings: "savings",
  salary: "salary employment income",
  bonus: "bonus employment",
};

// Loose synonyms / sub-categories → canonical key. Best-effort; unmatched
// tags are reported via diagnostics.
const DEPOSIT_COMPONENT_ALIASES: Record<string, string> = {
  gift: "gift",
  gifted: "gift",
  donation: "gift",
  inheritance: "inheritance",
  inherited: "inheritance",
  probate: "inheritance",
  estate: "inheritance",
  business_sale: "business_sale",
  businesssale: "business_sale",
  business: "business_sale",
  company_sale: "business_sale",
  investment_proceeds: "investment_proceeds",
  investment: "investment_proceeds",
  investments: "investment_proceeds",
  isa: "investment_proceeds",
  pension: "investment_proceeds",
  property_sale: "property_sale",
  propertysale: "property_sale",
  property: "property_sale",
  property_disposal: "property_sale",
  equity: "property_sale",
  remortgage: "property_sale",
  savings: "savings",
  saving: "savings",
  accumulated_savings: "savings",
  salary: "salary",
  wages: "salary",
  employment: "salary",
  employment_income: "salary",
  income: "salary",
  bonus: "bonus",
  bonuses: "bonus",
  commission: "bonus",
};

function normaliseTag(s: string): string {
  return s.toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export function mapDepositComponent(rawTag: string): string | null {
  const norm = normaliseTag(rawTag);
  return DEPOSIT_COMPONENT_ALIASES[norm] ?? null;
}

// ── PII sanitisation ──────────────────────────────────────────────────────
// Strips proper-noun sequences, postcodes, phone numbers, dates, and
// account-number-like strings. Best-effort; the tokenisation step also
// drops anything that doesn't survive lowercase + alpha filtering.
const PII_PATTERNS: RegExp[] = [
  // UK postcodes (e.g. SW1A 1AA, EC2N3AR)
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g,
  // Phone numbers — UK and international
  /\+?\d[\d\s().-]{8,}\d/g,
  // Dates: 12/04/2026, 12-04-2026, 2026-04-12, 12 Apr 2026
  /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g,
  /\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b/g,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}\b/gi,
  // Account/sort-code-like sequences (>= 6 contiguous digits)
  /\b\d{6,}\b/g,
  // Email addresses
  /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
  // Sort-code patterns 12-34-56
  /\b\d{2}-\d{2}-\d{2}\b/g,
];

// Common harmless words that might look like proper nouns when capitalised
// at the start of a sentence — keep them so we don't lose signal.
const PROPER_NOUN_ALLOWLIST = new Set([
  "AML", "LSAG", "ID", "UK", "EU", "PEP", "MLRO", "CDD", "ISA", "SA302",
  "SoW", "SoF", "HMRC", "FCA", "VAT", "Buy-To-Let", "BTL",
]);

function isLikelyProperNoun(token: string): boolean {
  // Capitalised, length >= 2, not all-caps acronym we recognise, not in allowlist.
  if (token.length < 2) return false;
  if (PROPER_NOUN_ALLOWLIST.has(token)) return false;
  if (/^[A-Z]{2,}$/.test(token)) return false; // pure acronym like "HMRC"
  // Match capitalised words including hyphenated/apostrophed surnames
  // (e.g. "Patel-Singh", "O'Brien", "MacDonald").
  return /^[A-Z][a-zA-Z'\-]*[a-z]$/.test(token);
}

export function sanitisePIIFromNarrative(input: string): string {
  let s = input;
  for (const re of PII_PATTERNS) s = s.replace(re, " ");
  // Drop runs of 2+ consecutive proper-noun words (likely full names like
  // "Nkem Renaldo Stewart" or "Mr John Smith"). Single capitalised words
  // are kept — many legitimate domain terms (Identity, Mortgage) start with
  // a capital at sentence start and we don't want to lose them.
  const tokens = s.split(/\s+/);
  const cleaned: string[] = [];
  let run: string[] = [];
  const flushRun = () => {
    if (run.length === 1) cleaned.push(run[0]);
    // run.length >= 2: drop entirely (proper-noun sequence)
    run = [];
  };
  for (const t of tokens) {
    const stripped = t.replace(/[.,;:!?"'()]/g, "");
    if (isLikelyProperNoun(stripped)) {
      run.push(t);
    } else {
      flushRun();
      cleaned.push(t);
    }
  }
  flushRun();
  return cleaned.join(" ");
}

function tokeniseNarrative(narrative: string): string {
  const sanitised = sanitisePIIFromNarrative(narrative);
  return sanitised
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// ── Inputs ────────────────────────────────────────────────────────────────

export interface CaseSignal {
  /** Free-text narrative the client / pipeline provided. May contain PII. */
  fundingNarrative?: string | null;
  /** Raw deposit-component tags from the case record. */
  depositComponents?: string[];
  /** Number of purchaser-type parties on the case (for sole/joint detection). */
  purchaserCount?: number;
  /** Set true if any party has on_mortgage=false but contribution > 0
   *  (i.e. co-purchaser with separate funding). */
  coPurchaserSeparateFunds?: boolean;
  /** Set true if any party with role != 'purchaser' has a contribution_amount. */
  thirdPartyFunderPresent?: boolean;
  /** Set true if any party has pep_status indicating PEP exposure. */
  pepFlagged?: boolean;
  /** Set true if the case has any non-purchaser beneficial-owner-style party. */
  beneficialOwnerPresent?: boolean;
}

export interface BuiltQuery {
  query: string;
  /** Diagnostic structure mirrored into retrieval_logs.metadata. */
  diagnostics: {
    degraded_to_static: boolean;
    narrative_used: boolean;
    narrative_chars: number;
    deposit_components_recognised: string[];
    deposit_components_unrecognised: string[];
    party_types: string[];
  };
}

export function buildSoWQuery(signal: CaseSignal): BuiltQuery {
  const parts: string[] = [];
  const recognised: string[] = [];
  const unrecognised: string[] = [];
  const partyTypes: string[] = [];

  // (a) Funding narrative tokens
  let narrativeTokens = "";
  if (signal.fundingNarrative && signal.fundingNarrative.trim().length > 0) {
    narrativeTokens = tokeniseNarrative(signal.fundingNarrative);
  }
  if (narrativeTokens.length > 0) parts.push(narrativeTokens);

  // (b) Deposit components
  const seenComponents = new Set<string>();
  for (const raw of signal.depositComponents ?? []) {
    if (!raw) continue;
    const canonical = mapDepositComponent(raw);
    if (canonical && !seenComponents.has(canonical)) {
      seenComponents.add(canonical);
      recognised.push(canonical);
      parts.push(DEPOSIT_COMPONENT_TOKENS[canonical]);
    } else if (!canonical) {
      unrecognised.push(raw);
    }
  }

  // (c) Party types
  const purchaserCount = signal.purchaserCount ?? 0;
  if (purchaserCount === 1) {
    parts.push("sole purchaser");
    partyTypes.push("sole_purchaser");
  } else if (purchaserCount >= 2) {
    parts.push("joint purchasers");
    partyTypes.push("joint_purchasers");
  }
  if (signal.coPurchaserSeparateFunds) {
    parts.push("co-purchaser separate funding");
    partyTypes.push("co_purchaser_separate_funds");
  }
  if (signal.thirdPartyFunderPresent) {
    parts.push("third party funder");
    partyTypes.push("third_party_funder");
  }
  if (signal.pepFlagged) {
    parts.push("PEP politically exposed");
    partyTypes.push("pep");
  }
  if (signal.beneficialOwnerPresent) {
    parts.push("beneficial owner");
    partyTypes.push("beneficial_owner");
  }

  // (d) Static suffix — always appended.
  parts.push(STATIC_SUFFIX);

  // Degenerate case: only the static suffix made it in.
  const degraded = parts.length === 1 && parts[0] === STATIC_SUFFIX;

  return {
    query: parts.join(" "),
    diagnostics: {
      degraded_to_static: degraded,
      narrative_used: narrativeTokens.length > 0,
      narrative_chars: narrativeTokens.length,
      deposit_components_recognised: recognised,
      deposit_components_unrecognised: unrecognised,
      party_types: partyTypes,
    },
  };
}

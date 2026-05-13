/**
 * Deterministic mapping from enquiry_items.category → Olimey AI report section IDs.
 *
 * Used by `enquiry-reply-prescan`, `ingest-replies`, and `sow-section-rerun` to compute
 * which report sections (if any) need partial re-analysis when a reply is ingested.
 *
 * Categories not present in this map default to "decision_log_only" — meaning the
 * Decision Log will receive a new entry but no report section is rewritten.
 *
 * Section IDs are stable identifiers used by the section splicer to locate the
 * corresponding markdown heading in `internal_report` / `client_report`.
 */

export type SectionId =
  | "identity"
  | "source_of_wealth.savings"
  | "source_of_wealth.income"
  | "source_of_wealth.investments"
  | "source_of_wealth.property"
  | "source_of_wealth.inheritance"
  | "source_of_wealth.gift"
  | "source_of_wealth.business"
  | "source_of_funds.deposit"
  | "source_of_funds.mortgage"
  | "source_of_funds.completion"
  | "personal_profile"
  | "external_profile"
  | "lender_consideration"
  | "decision_log_only";

/**
 * Free-text category labels that the AI agent uses when raising enquiries.
 * Lower-cased and trimmed before lookup.
 */
const CATEGORY_TO_SECTION: Record<string, SectionId> = {
  // Identity
  "identity": "identity",
  "id verification": "identity",
  "passport": "identity",
  "driving licence": "identity",
  "proof of address": "identity",

  // Source of Wealth
  "savings": "source_of_wealth.savings",
  "savings accumulation": "source_of_wealth.savings",
  "source of wealth": "source_of_wealth.savings",
  "income": "source_of_wealth.income",
  "salary": "source_of_wealth.income",
  "employment": "source_of_wealth.income",
  "payslip": "source_of_wealth.income",
  "investments": "source_of_wealth.investments",
  "investment income": "source_of_wealth.investments",
  "isa": "source_of_wealth.investments",
  "pension": "source_of_wealth.investments",
  "property sale": "source_of_wealth.property",
  "property": "source_of_wealth.property",
  "inheritance": "source_of_wealth.inheritance",
  "gift": "source_of_wealth.gift",
  "donor": "source_of_wealth.gift",
  "business income": "source_of_wealth.business",
  "company": "source_of_wealth.business",
  "self employed": "source_of_wealth.business",

  // Source of Funds
  "deposit": "source_of_funds.deposit",
  "source of deposit": "source_of_funds.deposit",
  "source of funds": "source_of_funds.deposit",
  "mortgage": "source_of_funds.mortgage",
  "mortgage offer": "source_of_funds.mortgage",
  "lender": "source_of_funds.mortgage",
  "completion funds": "source_of_funds.completion",

  // Profile / context
  "personal profile": "personal_profile",
  "client profile": "personal_profile",
  "external profile": "external_profile",
  "open source": "external_profile",
  "pep": "external_profile",
  "sanctions": "external_profile",

  // Lender
  "lender consideration": "lender_consideration",
};

/**
 * Resolve an enquiry category string to a SectionId.
 * Returns "decision_log_only" if no mapping is found.
 */
export function categoryToSection(category: string | null | undefined): SectionId {
  if (!category) return "decision_log_only";
  const normalised = category.toLowerCase().trim();

  // Exact match first
  const direct = CATEGORY_TO_SECTION[normalised];
  if (direct) return direct;

  // Substring fallback — matches "Source of Wealth (Savings)" → savings, etc.
  for (const [key, section] of Object.entries(CATEGORY_TO_SECTION)) {
    if (normalised.includes(key)) return section;
  }

  return "decision_log_only";
}

/**
 * Compute the union of affected sections for a list of enquiry categories.
 * Excludes "decision_log_only" entries from the section list (they are tracked
 * separately by the Decision Log writer).
 */
export function affectedSectionsFor(
  categories: Array<string | null | undefined>,
): SectionId[] {
  const set = new Set<SectionId>();
  for (const c of categories) {
    const s = categoryToSection(c);
    if (s !== "decision_log_only") set.add(s);
  }
  return Array.from(set);
}

/**
 * Human-readable label for a SectionId — used in toasts, banners, and the Decision Log.
 */
export const SECTION_LABELS: Record<SectionId, string> = {
  "identity": "Identity Verification",
  "source_of_wealth.savings": "Source of Wealth — Savings",
  "source_of_wealth.income": "Source of Wealth — Income",
  "source_of_wealth.investments": "Source of Wealth — Investments",
  "source_of_wealth.property": "Source of Wealth — Property",
  "source_of_wealth.inheritance": "Source of Wealth — Inheritance",
  "source_of_wealth.gift": "Source of Wealth — Gift",
  "source_of_wealth.business": "Source of Wealth — Business",
  "source_of_funds.deposit": "Source of Funds — Deposit",
  "source_of_funds.mortgage": "Source of Funds — Mortgage",
  "source_of_funds.completion": "Source of Funds — Completion",
  "personal_profile": "Personal Profile",
  "external_profile": "External Profile",
  "lender_consideration": "Lender Consideration",
  "decision_log_only": "Decision Log",
};

/**
 * Heading patterns used to locate each section in the markdown report.
 * The splicer uses these as case-insensitive regex anchors. Multiple patterns
 * per section accommodate variations the agent has produced over time.
 */
export const SECTION_HEADING_PATTERNS: Record<SectionId, RegExp[]> = {
  "identity": [/^#{1,4}\s*.*identity\s+verification.*$/im, /^#{1,4}\s*identity.*$/im],
  "source_of_wealth.savings": [/^#{1,4}\s*.*savings.*$/im, /^#{1,4}\s*.*source\s+of\s+wealth.*savings.*$/im],
  "source_of_wealth.income": [/^#{1,4}\s*.*\bincome\b.*$/im, /^#{1,4}\s*.*employment.*$/im],
  "source_of_wealth.investments": [/^#{1,4}\s*.*investments?.*$/im, /^#{1,4}\s*.*pensions?.*$/im],
  "source_of_wealth.property": [/^#{1,4}\s*.*property\s+(sale|disposal).*$/im],
  "source_of_wealth.inheritance": [/^#{1,4}\s*.*inheritance.*$/im],
  "source_of_wealth.gift": [/^#{1,4}\s*.*\bgift\b.*$/im, /^#{1,4}\s*.*donor.*$/im],
  "source_of_wealth.business": [/^#{1,4}\s*.*business\s+income.*$/im, /^#{1,4}\s*.*self[-\s]?employ.*$/im],
  "source_of_funds.deposit": [/^#{1,4}\s*.*source\s+of\s+(funds|deposit).*$/im, /^#{1,4}\s*.*\bdeposit\b.*$/im],
  "source_of_funds.mortgage": [/^#{1,4}\s*.*mortgage.*$/im],
  "source_of_funds.completion": [/^#{1,4}\s*.*completion\s+funds.*$/im],
  "personal_profile": [/^#{1,4}\s*.*personal\s+profile.*$/im, /^#{1,4}\s*.*client\s+profile.*$/im],
  "external_profile": [/^#{1,4}\s*.*external\s+profile.*$/im, /^#{1,4}\s*.*open[-\s]?source.*$/im],
  "lender_consideration": [/^#{1,4}\s*.*lender\s+consideration.*$/im],
  "decision_log_only": [/^#{1,4}\s*.*decision\s+log.*$/im],
};

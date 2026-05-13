/**
 * LSAG checklist item matcher.
 *
 * The agent emits the 15 LSAG compliance items under inconsistent labels
 * (e.g. "Checklist Item 1 (ID Verified)", "Identity Verification Failure",
 * "LSAG 1 - Client Identity Verified"). This module gives both the rendered
 * checklist row and the persisted evidence_reference row a canonical item
 * number (1–15), so per-item drilldown can reliably attach evidence to tiles.
 *
 * Heuristic — see plan: a small synonym table plus explicit "Item N" tokens.
 * Unmatched evidence is returned under bucket 0 so callers can surface it.
 */

export interface LsagCanonicalItem {
  number: number;
  label: string;
  /** Lowercase keyword fragments that should map to this item. */
  synonyms: string[];
}

/**
 * Canonical 15-item LSAG list — mirrors LSAG_15_ITEMS in
 * supabase/functions/agent-chat. Kept as a small client-side constant so the
 * UI can render & match without an extra round-trip.
 */
export const LSAG_CANONICAL_ITEMS: LsagCanonicalItem[] = [
  {
    number: 1,
    label: "Client Identity Verified",
    synonyms: ["identity", "id verified", "id check", "passport", "driving licence", "driver license", "name match", "client identity"],
  },
  {
    number: 2,
    label: "Proof of Address Obtained",
    synonyms: ["proof of address", "address verification", "address verified", "poa", "utility bill", "address evidence"],
  },
  {
    number: 3,
    label: "Source of Funds (SoF) Identified",
    synonyms: ["source of funds", "sof identified", "sof check", "funds identified", "deposit source", "purchase funds"],
  },
  {
    number: 4,
    label: "Source of Wealth (SoW) Identified",
    synonyms: ["source of wealth", "sow identified", "sow check", "wealth origin", "genesis of wealth", "underlying wealth"],
  },
  {
    number: 5,
    label: "Bank Statement Coverage",
    synonyms: ["bank statement", "statement coverage", "statement continuity", "statement gap", "transaction history", "account coverage"],
  },
  {
    number: 6,
    label: "Cash Deposits Reviewed",
    synonyms: ["cash deposit", "cash transaction", "cash review", "cash funds", "physical cash"],
  },
  {
    number: 7,
    label: "Velocity of Funds Check",
    synonyms: ["velocity", "velocity of funds", "rapid movement", "transaction velocity", "fund movement", "layering"],
  },
  {
    number: 8,
    label: "PEP Screening",
    synonyms: ["pep", "politically exposed", "pep screening", "pep check", "politically-exposed"],
  },
  {
    number: 9,
    label: "Sanctions / OFSI Check",
    synonyms: ["sanction", "ofsi", "ofac", "sanctions screening", "consolidated list"],
  },
  {
    number: 10,
    label: "Adverse Media Check",
    synonyms: ["adverse media", "negative media", "media check", "open source check", "osint"],
  },
  {
    number: 11,
    label: "Risk Assessment Completed",
    synonyms: ["risk assessment", "risk rating", "risk profile", "risk classification", "client risk"],
  },
  {
    number: 12,
    label: "Gift / Third-Party Funds Verified",
    synonyms: ["gift", "third-party", "third party", "giftor", "donor", "third-party funds", "gifted deposit"],
  },
  {
    number: 13,
    label: "Mortgage / Lender Evidence",
    synonyms: ["mortgage", "lender", "mortgage offer", "mortgage evidence", "loan offer"],
  },
  {
    number: 14,
    label: "Proportionality / Affordability",
    synonyms: ["proportionality", "affordability", "proportionate", "ratio", "income to purchase", "salary multiple"],
  },
  {
    number: 15,
    label: "Decision & Sign-off Recorded",
    synonyms: ["decision", "sign-off", "sign off", "mlro", "approval recorded", "decision log", "final decision"],
  },
];

/**
 * Returns the canonical LSAG item number (1–15) for a free-form label, or 0
 * when no confident match is found.
 *
 * Strategy:
 *   1. Look for an explicit number token: "Item 3", "Checklist 3", "LSAG 3", "#3", "(3)".
 *   2. Otherwise score each canonical item by how many of its synonyms appear
 *      as substrings in the lowercased input. Highest score wins; ties broken
 *      by longest matched synonym (more specific match preferred).
 */
export function matchLsagItemNumber(rawLabel: string): { number: number; matchedOn: string } {
  if (!rawLabel) return { number: 0, matchedOn: "" };
  const lower = rawLabel.toLowerCase();

  // 1. Explicit number tokens.
  const explicit = lower.match(/(?:item|checklist|lsag|#|\()\s*([0-9]{1,2})\b/);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n >= 1 && n <= 15) {
      return { number: n, matchedOn: `explicit "${explicit[0].trim()}"` };
    }
  }

  // 2. Synonym scoring.
  let best: { number: number; score: number; matchedOn: string } = {
    number: 0,
    score: 0,
    matchedOn: "",
  };
  for (const item of LSAG_CANONICAL_ITEMS) {
    for (const syn of item.synonyms) {
      if (lower.includes(syn)) {
        // Score = synonym length (more specific = better).
        const score = syn.length;
        if (score > best.score) {
          best = { number: item.number, score, matchedOn: `keyword "${syn}"` };
        }
      }
    }
  }
  return { number: best.number, matchedOn: best.matchedOn };
}

export interface ItemMatchResult<T> {
  /** Canonical item number 1–15. */
  number: number;
  /** Human-readable explanation of why this row matched, e.g. 'keyword "identity"'. */
  matchedOn: string;
  row: T;
}

/**
 * Bucket evidence references (or any labelled rows) by canonical LSAG item
 * number. Items returning 0 are collected under the "unmapped" bucket so
 * callers can still surface them.
 */
export function bucketByLsagItem<T extends { item_label?: string | null }>(
  rows: T[],
): { matched: Map<number, ItemMatchResult<T>[]>; unmapped: ItemMatchResult<T>[] } {
  const matched = new Map<number, ItemMatchResult<T>[]>();
  const unmapped: ItemMatchResult<T>[] = [];
  for (const row of rows) {
    const { number, matchedOn } = matchLsagItemNumber(row.item_label || "");
    const result: ItemMatchResult<T> = { number, matchedOn, row };
    if (number === 0) {
      unmapped.push(result);
    } else {
      const existing = matched.get(number) || [];
      existing.push(result);
      matched.set(number, existing);
    }
  }
  return { matched, unmapped };
}

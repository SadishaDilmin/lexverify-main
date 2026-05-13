/**
 * Transaction ↔ Source Matching / Linking Engine — Layer 2 support
 *
 * Weighted scoring logic that links transactions and balances
 * to declared fund sources and parties. Never auto-confirms —
 * always marks linkages as inferred_pending_review unless
 * reviewer-confirmed.
 *
 * Pure functions — no DB calls.
 */

import type { ClassifiedTransaction, FundSourceRef, AccountRef, PartyRef } from './transactionClassifier';

// ── Types ────────────────────────────────────────────────────────

export type MatchType =
  | 'exact_amount'
  | 'approximate_amount'
  | 'partial'
  | 'date_proximity'
  | 'description_match'
  | 'account_relationship'
  | 'party_relationship'
  | 'category_alignment'
  | 'reviewer_confirmed'
  | 'unmatched';

export interface MatchBasis {
  criterion: MatchType;
  detail: string;
  weight: number;
}

export interface MatchCandidate {
  transactionId: string;
  fundSourceId: string;
  matchType: MatchType;
  confidence: number; // 0-1
  matchBasis: MatchBasis[];
  /** Never 'confirmed' unless reviewer explicitly set */
  status: 'inferred_pending_review' | 'low_confidence' | 'unmatched' | 'reviewer_confirmed';
}

export interface MatchResult {
  matched: MatchCandidate[];
  unmatched: string[]; // tx IDs with no adequate match
}

// ── Extended source type for matching ────────────────────────────

export interface MatchableFundSource extends FundSourceRef {
  declared_amount?: number | null;
  date_received?: string | null;
  donor_name?: string | null;
}

export interface MatchableBalance {
  id: string;
  case_id: string;
  amount?: number | null;
  attachment_name?: string | null;
  evidence_status?: string | null;
  counted_toward_proof?: boolean | null;
}

// ── Weights ──────────────────────────────────────────────────────

const W_EXACT_AMOUNT = 0.4;
const W_DATE_PROXIMITY = 0.2;
const W_DESCRIPTION = 0.2;
const W_ACCOUNT = 0.15;
const W_CATEGORY = 0.05;

const DATE_PROXIMITY_DAYS = 3;
const AMOUNT_TOLERANCE = 0.02; // 2%

// ── Helpers ──────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86_400_000;
}

function normalise(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ── Category alignment map ───────────────────────────────────────

const CATEGORY_SOURCE_MAP: Record<string, string[]> = {
  salary_credit: ['salary', 'employment', 'wages'],
  bonus_credit: ['salary', 'employment', 'bonus'],
  gift: ['gift'],
  cobuyer_contribution: ['co-buyer', 'co_buyer', 'joint'],
  government_bonus: ['government', 'lisa', 'help to buy'],
  investment_withdrawal: ['investment', 'savings', 'isa'],
  sale_proceeds: ['sale', 'property sale'],
  loan_receipt: ['loan', 'borrowing'],
  cash_deposit: ['cash', 'savings'],
  overseas_incoming: ['overseas', 'international', 'foreign'],
};

function categoryAligns(txCategory: string, sourceCategory: string | null | undefined): boolean {
  if (!sourceCategory) return false;
  const keywords = CATEGORY_SOURCE_MAP[txCategory];
  if (!keywords) return false;
  const sc = sourceCategory.toLowerCase();
  return keywords.some((kw) => sc.includes(kw));
}

// ── Find match candidates for one tx ─────────────────────────────

export function findMatchCandidates(
  tx: ClassifiedTransaction,
  fundSources: MatchableFundSource[],
  accounts: AccountRef[],
  parties: PartyRef[]
): MatchCandidate[] {
  if (tx.direction !== 'incoming') return [];

  const candidates: MatchCandidate[] = [];

  for (const fs of fundSources) {
    if (fs.case_id !== tx.case_id) continue;

    const basis: MatchBasis[] = [];
    let totalWeight = 0;

    // 1. Amount match
    if (fs.declared_amount && tx.amount) {
      const diff = Math.abs(fs.declared_amount - tx.amount);
      const tolerance = fs.declared_amount * AMOUNT_TOLERANCE;
      if (diff <= tolerance) {
        basis.push({ criterion: 'exact_amount', detail: `£${tx.amount} ≈ £${fs.declared_amount}`, weight: W_EXACT_AMOUNT });
        totalWeight += W_EXACT_AMOUNT;
      } else if (tx.amount < fs.declared_amount) {
        // Partial match — tx is part of the declared amount
        basis.push({ criterion: 'partial', detail: `£${tx.amount} of £${fs.declared_amount}`, weight: W_EXACT_AMOUNT * 0.5 });
        totalWeight += W_EXACT_AMOUNT * 0.5;
      }
    }

    // 2. Date proximity
    if (fs.date_received && tx.tx_date) {
      const gap = daysBetween(fs.date_received, tx.tx_date);
      if (gap <= DATE_PROXIMITY_DAYS) {
        basis.push({ criterion: 'date_proximity', detail: `${gap.toFixed(0)} days apart`, weight: W_DATE_PROXIMITY });
        totalWeight += W_DATE_PROXIMITY;
      }
    }

    // 3. Description match (employer / donor / party name)
    const desc = tx.description ?? '';
    const namesToCheck = [
      fs.employer_name,
      fs.donor_name,
      ...parties.filter((p) => p.case_id === tx.case_id).map((p) => p.full_name),
    ].filter(Boolean) as string[];

    for (const name of namesToCheck) {
      if (normalise(desc).includes(normalise(name)) && name.length >= 3) {
        basis.push({ criterion: 'description_match', detail: `"${name}" found in description`, weight: W_DESCRIPTION });
        totalWeight += W_DESCRIPTION;
        break;
      }
    }

    // 4. Account relationship
    if (tx.account_id && fs.linked_account_ids?.includes(tx.account_id)) {
      basis.push({ criterion: 'account_relationship', detail: `tx account in source linked accounts`, weight: W_ACCOUNT });
      totalWeight += W_ACCOUNT;
    }

    // 5. Category alignment
    if (categoryAligns(tx.classifiedCategory, fs.source_category)) {
      basis.push({ criterion: 'category_alignment', detail: `${tx.classifiedCategory} ↔ ${fs.source_category}`, weight: W_CATEGORY });
      totalWeight += W_CATEGORY;
    }

    if (basis.length > 0) {
      const confidence = Math.min(totalWeight, 1);
      const bestCriterion = basis.reduce((a, b) => (a.weight >= b.weight ? a : b)).criterion;
      candidates.push({
        transactionId: tx.id,
        fundSourceId: fs.id,
        matchType: bestCriterion,
        confidence,
        matchBasis: basis,
        status: confidence >= 0.7 ? 'inferred_pending_review' : confidence >= 0.4 ? 'low_confidence' : 'unmatched',
      });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// ── Match all transactions (greedy best-match) ───────────────────

export function matchAllTransactions(
  txs: ClassifiedTransaction[],
  fundSources: MatchableFundSource[],
  accounts: AccountRef[],
  parties: PartyRef[]
): MatchResult {
  const matched: MatchCandidate[] = [];
  const unmatched: string[] = [];

  // Already-linked transactions via DB
  const prelinked = txs.filter((tx) => tx.linked_fund_source_id);
  for (const tx of prelinked) {
    matched.push({
      transactionId: tx.id,
      fundSourceId: tx.linked_fund_source_id!,
      matchType: 'reviewer_confirmed',
      confidence: 1.0,
      matchBasis: [{ criterion: 'reviewer_confirmed', detail: 'Pre-linked in database', weight: 1.0 }],
      status: 'reviewer_confirmed',
    });
  }

  // Unlinked incoming transactions
  const unlinkdIncoming = txs.filter(
    (tx) => tx.direction === 'incoming' && !tx.linked_fund_source_id
  );

  for (const tx of unlinkdIncoming) {
    const candidates = findMatchCandidates(tx, fundSources, accounts, parties);
    if (candidates.length > 0 && candidates[0].confidence >= 0.4) {
      matched.push(candidates[0]);
    } else {
      unmatched.push(tx.id);
    }
  }

  // Outgoing transactions are not matched to fund sources
  const outgoing = txs.filter((tx) => tx.direction !== 'incoming' && !tx.linked_fund_source_id);
  for (const tx of outgoing) {
    unmatched.push(tx.id);
  }

  return { matched, unmatched };
}

// ── Balance-to-source matching ───────────────────────────────────

export function matchBalanceToSource(
  balance: MatchableBalance,
  fundSources: MatchableFundSource[]
): MatchCandidate | null {
  if (!balance.amount || balance.amount <= 0) return null;

  for (const fs of fundSources) {
    if (fs.case_id !== balance.case_id) continue;
    if (!fs.declared_amount) continue;

    const diff = Math.abs(fs.declared_amount - balance.amount);
    const tolerance = fs.declared_amount * 0.05;

    if (diff <= tolerance) {
      return {
        transactionId: balance.id, // reusing field for balance ID
        fundSourceId: fs.id,
        matchType: 'exact_amount',
        confidence: 0.6,
        matchBasis: [{ criterion: 'exact_amount', detail: `Balance £${balance.amount} ≈ source £${fs.declared_amount}`, weight: 0.6 }],
        status: 'low_confidence',
      };
    }
  }

  return null;
}

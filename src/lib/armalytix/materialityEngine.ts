/**
 * Materiality / Triage Engine — Layer 1b
 *
 * Applies configurable thresholds to classified transactions to
 * distinguish trivial noise from items that matter for AML / SoF review.
 *
 * Pure functions — no DB calls.
 */

import type { ClassifiedTransaction } from './transactionClassifier';

// ── Materiality flag types ───────────────────────────────────────

export const MATERIALITY_FLAGS = [
  'large_amount',
  'repeated_unexplained',
  'cash_activity',
  'third_party_credit',
  'income_inconsistency',
  'undeclared_incoming',
  'significant_external',
  'manual_balance_relied_upon',
  'shortfall_related',
  'proximity_to_completion',
  'gambling_material',
  'crypto_material',
  'overseas_material',
] as const;

export type MaterialityFlag = (typeof MATERIALITY_FLAGS)[number];

// ── Config ───────────────────────────────────────────────────────

export interface MaterialityConfig {
  largeIncomingThreshold: number;
  largeOutgoingThreshold: number;
  cashActivityThreshold: number;
  /** Fraction of amountToProve — transactions above this are significant */
  significantProportion: number;
  completionProximityDays: number;
  repeatedUnexplainedMinCount: number;
  gamblingMateriality: number;
  cryptoMateriality: number;
}

export const DEFAULT_MATERIALITY_CONFIG: MaterialityConfig = {
  largeIncomingThreshold: 1_000,
  largeOutgoingThreshold: 1_000,
  cashActivityThreshold: 500,
  significantProportion: 0.05,
  completionProximityDays: 90,
  repeatedUnexplainedMinCount: 3,
  gamblingMateriality: 500,
  cryptoMateriality: 500,
};

// ── Context ──────────────────────────────────────────────────────

export interface MaterialityContext {
  amountToProve: number;
  purchasePrice: number;
  completionDate?: string | null;
  totalDeclaredFunds: number;
  config?: Partial<MaterialityConfig>;
}

// ── Assessment output ────────────────────────────────────────────

export interface MaterialityAssessment {
  transactionId: string;
  flags: MaterialityFlag[];
  score: number; // 0-100
  isReviewRequired: boolean;
  classifiedTransaction: ClassifiedTransaction;
}

// ── Helpers ──────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / (86_400_000);
}

// ── Core assessment ──────────────────────────────────────────────

export function assessMateriality(
  tx: ClassifiedTransaction,
  ctx: MaterialityContext
): MaterialityAssessment {
  const cfg: MaterialityConfig = { ...DEFAULT_MATERIALITY_CONFIG, ...ctx.config };
  const flags: MaterialityFlag[] = [];
  let score = 0;
  const amount = tx.amount ?? 0;
  const isIncoming = tx.direction === 'incoming';

  // Large amount
  const threshold = isIncoming ? cfg.largeIncomingThreshold : cfg.largeOutgoingThreshold;
  if (amount >= threshold) {
    flags.push('large_amount');
    score += 15;
  }

  // Proportion of amount to prove
  if (ctx.amountToProve > 0 && amount / ctx.amountToProve >= cfg.significantProportion) {
    flags.push('significant_external');
    score += 20;
  }

  // Cash activity
  if (
    (tx.classifiedCategory === 'cash_deposit' || tx.classifiedCategory === 'cash_withdrawal') &&
    amount >= cfg.cashActivityThreshold
  ) {
    flags.push('cash_activity');
    score += 25;
  }

  // Third-party credit
  if (
    isIncoming &&
    (tx.classifiedCategory === 'third_party_transfer' || tx.classifiedCategory === 'cobuyer_contribution')
  ) {
    flags.push('third_party_credit');
    score += 15;
  }

  // Undeclared incoming
  if (
    isIncoming &&
    !tx.linked_fund_source_id &&
    tx.explanation_status !== 'mapped' &&
    tx.explanation_status !== 'not_relevant' &&
    amount >= cfg.largeIncomingThreshold
  ) {
    flags.push('undeclared_incoming');
    score += 20;
  }

  // Gambling
  if (tx.classifiedCategory === 'gambling' && amount >= cfg.gamblingMateriality) {
    flags.push('gambling_material');
    score += 20;
  }

  // Crypto
  if (tx.classifiedCategory === 'crypto' && amount >= cfg.cryptoMateriality) {
    flags.push('crypto_material');
    score += 20;
  }

  // Overseas
  if (
    (tx.classifiedCategory === 'overseas_incoming' || tx.is_overseas) &&
    amount >= cfg.largeIncomingThreshold
  ) {
    flags.push('overseas_material');
    score += 15;
  }

  // Proximity to completion
  if (ctx.completionDate && tx.tx_date) {
    const gap = daysBetween(tx.tx_date, ctx.completionDate);
    if (gap <= cfg.completionProximityDays) {
      flags.push('proximity_to_completion');
      score += 10;
    }
  }

  // Unknown/unexplained incoming gets a base bump
  if (isIncoming && tx.classifiedCategory === 'unknown_incoming' && amount >= cfg.largeIncomingThreshold) {
    score += 10;
  }

  score = Math.min(score, 100);

  return {
    transactionId: tx.id,
    flags,
    score,
    isReviewRequired: score >= 25,
    classifiedTransaction: tx,
  };
}

// ── Bulk assessment (returns sorted by score desc) ───────────────

export function assessBulkMateriality(
  txs: ClassifiedTransaction[],
  ctx: MaterialityContext
): MaterialityAssessment[] {
  return txs
    .map((tx) => assessMateriality(tx, ctx))
    .sort((a, b) => b.score - a.score);
}

// ── Repeated-unexplained aggregation ─────────────────────────────

export interface RepeatedPattern {
  category: string;
  count: number;
  totalAmount: number;
  transactionIds: string[];
  flag: MaterialityFlag;
}

/**
 * Detects repeated patterns of unexplained transactions that
 * individually may fall below thresholds but are material in aggregate.
 */
export function detectRepeatedPatterns(
  txs: ClassifiedTransaction[],
  cfg: MaterialityConfig = DEFAULT_MATERIALITY_CONFIG
): RepeatedPattern[] {
  const patterns: RepeatedPattern[] = [];
  const groups = new Map<string, ClassifiedTransaction[]>();

  for (const tx of txs) {
    if (tx.direction !== 'incoming') continue;
    if (tx.linked_fund_source_id) continue;
    if (tx.explanation_status === 'mapped' || tx.explanation_status === 'not_relevant') continue;

    const key = tx.classifiedCategory;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  for (const [category, items] of groups) {
    if (items.length >= cfg.repeatedUnexplainedMinCount) {
      const total = items.reduce((s, t) => s + (t.amount ?? 0), 0);
      patterns.push({
        category,
        count: items.length,
        totalAmount: total,
        transactionIds: items.map((t) => t.id),
        flag: 'repeated_unexplained',
      });
    }
  }

  return patterns;
}

/**
 * Quick filter: returns true if a transaction is below all noise
 * thresholds and can safely be excluded from detailed review.
 */
export function isTriviable(
  tx: ClassifiedTransaction,
  cfg: MaterialityConfig = DEFAULT_MATERIALITY_CONFIG
): boolean {
  const amount = tx.amount ?? 0;
  if (amount >= cfg.cashActivityThreshold) return false;
  if (tx.is_cash_or_cash_like) return false;
  if (tx.is_gambling_related) return false;
  if (tx.classifiedCategory === 'unknown_incoming' && amount >= 100) return false;
  if (tx.classifiedCategory === 'third_party_transfer') return false;
  if (tx.classifiedCategory === 'overseas_incoming') return false;
  return true;
}

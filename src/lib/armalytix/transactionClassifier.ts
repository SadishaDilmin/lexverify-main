/**
 * Transaction Intelligence Engine — Layer 1
 *
 * Classifies raw sow_transactions into structured categories using:
 * 1. Armalytix-supplied labels/markers (highest priority)
 * 2. Description pattern matching against keyword dictionaries
 * 3. Amount / direction heuristics (fallback)
 *
 * Pure functions — no DB calls. The caller provides data arrays.
 */

// ── Category unions ──────────────────────────────────────────────

export const INCOMING_CATEGORIES = [
  'salary_credit',
  'bonus_credit',
  'own_account_transfer',
  'third_party_transfer',
  'cobuyer_contribution',
  'gift',
  'government_bonus',
  'investment_withdrawal',
  'sale_proceeds',
  'loan_receipt',
  'cash_deposit',
  'refund',
  'recurring_non_salary',
  'large_one_off_incoming',
  'overseas_incoming',
  'unknown_incoming',
] as const;

export type IncomingCategory = (typeof INCOMING_CATEGORIES)[number];

export const OUTGOING_CATEGORIES = [
  'rent_mortgage',
  'own_account_transfer_out',
  'third_party_transfer_out',
  'gambling',
  'investment',
  'crypto',
  'loan_repayment',
  'card_settlement',
  'cash_withdrawal',
  'large_one_off_outgoing',
  'property_related',
  'solicitor_payment',
  'unusual_outgoing',
  'unknown_outgoing',
] as const;

export type OutgoingCategory = (typeof OUTGOING_CATEGORIES)[number];

export type TransactionCategory = IncomingCategory | OutgoingCategory;

// ── Classification method ────────────────────────────────────────

export type ClassificationMethod =
  | 'armalytix_label'
  | 'pattern_match'
  | 'amount_heuristic'
  | 'account_relationship'
  | 'ai_inferred';

// ── Lightweight input stubs ──────────────────────────────────────

export interface RawTransaction {
  id: string;
  case_id: string;
  direction?: string | null;
  tx_date?: string | null;
  amount?: number | null;
  description?: string | null;
  linked_fund_source_id?: string | null;
  explanation_status?: string | null;
  // Armalytix label fields (may come from raw_json or dedicated columns)
  armalytix_category?: string | null;
  is_repeating?: boolean | null;
  is_large?: boolean | null;
  is_cash_or_cash_like?: boolean | null;
  is_gambling_related?: boolean | null;
  is_investment_related?: boolean | null;
  is_overseas?: boolean | null;
  account_id?: string | null;
}

export interface AccountRef {
  id: string;
  account_holder_name?: string | null;
  account_currency?: string | null;
}

export interface PartyRef {
  id: string;
  case_id: string;
  role?: string | null;
  full_name?: string | null;
  employer_name?: string | null;
}

export interface FundSourceRef {
  id: string;
  case_id: string;
  source_category?: string | null;
  employer_name?: string | null;
  linked_account_ids?: string[] | null;
}

// ── Classified output ────────────────────────────────────────────

export interface ClassifiedTransaction extends RawTransaction {
  classifiedCategory: TransactionCategory;
  classificationConfidence: number; // 0-1
  classificationMethod: ClassificationMethod;
  /** Set later by materialityEngine */
  materialityFlags: string[];
}

// ── Keyword dictionaries ─────────────────────────────────────────

const KW_SALARY = ['SALARY', 'WAGES', 'PAY', 'PAYROLL', 'NET PAY', 'GROSS PAY', 'BACS'];
const KW_BONUS = ['BONUS', 'COMMISSION', 'INCENTIVE', 'ANNUAL BONUS'];
const KW_GAMBLING = [
  'BET365', 'PADDY', 'WILLIAM HILL', 'BETFAIR', 'SKYBET', 'CORAL',
  'LADBROKES', 'FANDUEL', 'STAKE', 'BETWAY', 'POKERSTARS', '888',
  'CASUMO', 'TOMBOLA', 'FLUTTER', 'GAMESYS', 'ENTAIN',
];
const KW_CRYPTO = ['COINBASE', 'BINANCE', 'KRAKEN', 'CRYPTO', 'BITCOIN', 'ETHEREUM', 'BLOCKCHAIN'];
const KW_INVESTMENT = ['HARGREAVES', 'VANGUARD', 'FIDELITY', 'TRADING 212', 'FREETRADE', 'AJ BELL', 'NUTMEG', 'MONEYBOX', 'DIVIDEND'];
const KW_LOAN = ['LOAN', 'LENDING', 'ZOPA', 'FUNDING CIRCLE', 'IWOCA'];
const KW_RENT = ['RENT', 'MORTGAGE', 'HOUSING', 'COUNCIL TAX', 'TENANCY'];
const KW_CARD = ['CARD PAYMENT', 'VISA', 'MASTERCARD', 'AMEX', 'CONTACTLESS'];
const KW_CASH = ['CASH', 'ATM', 'COUNTER', 'POST OFFICE CASH', 'CASHPOINT'];
const KW_PROPERTY = ['SOLICITOR', 'CONVEYANCER', 'STAMP DUTY', 'HMRC SDLT', 'LAND REGISTRY', 'ESTATE AGENT', 'DEVELOPER'];
const KW_GOVERNMENT = ['HMRC', 'LISA BONUS', 'HELP TO BUY', 'GOV.UK', 'DWP', 'TAX REFUND', 'GOVERNMENT'];
const KW_OVERSEAS = ['SWIFT', 'INTERNATIONAL', 'FX', 'FOREIGN', 'REMITTANCE', 'WISE', 'TRANSFERWISE', 'WESTERN UNION', 'MONEYGRAM', 'WORLDREMIT'];
const KW_REFUND = ['REFUND', 'REVERSAL', 'CHARGEBACK', 'RETURN'];
const KW_OWN_TRANSFER = ['TRANSFER', 'OWN ACCOUNT', 'INTERNAL', 'STANDING ORDER'];
const KW_GIFT = ['GIFT', 'GIFTED'];
const KW_SALE = ['SALE PROCEEDS', 'PROPERTY SALE', 'COMPLETION'];

function matchesAny(desc: string, keywords: string[]): boolean {
  const upper = desc.toUpperCase();
  return keywords.some((kw) => upper.includes(kw));
}

// ── Armalytix label → category mapping ───────────────────────────

function fromArmalytixLabel(tx: RawTransaction): { category: TransactionCategory; confidence: number } | null {
  const isIncoming = tx.direction === 'incoming';

  // Explicit Armalytix flags take highest priority
  if (tx.is_gambling_related) {
    return { category: isIncoming ? 'unknown_incoming' : 'gambling', confidence: 0.95 };
  }
  if (tx.is_investment_related) {
    return { category: isIncoming ? 'investment_withdrawal' : 'investment', confidence: 0.9 };
  }
  if (tx.is_cash_or_cash_like) {
    return { category: isIncoming ? 'cash_deposit' : 'cash_withdrawal', confidence: 0.9 };
  }

  // Armalytix category string
  const cat = tx.armalytix_category?.toLowerCase().trim();
  if (!cat) return null;

  if (isIncoming) {
    if (cat.includes('salary') || cat.includes('wages')) return { category: 'salary_credit', confidence: 0.95 };
    if (cat.includes('bonus')) return { category: 'bonus_credit', confidence: 0.9 };
    if (cat.includes('gift')) return { category: 'gift', confidence: 0.85 };
    if (cat.includes('government') || cat.includes('hmrc') || cat.includes('lisa')) return { category: 'government_bonus', confidence: 0.9 };
    if (cat.includes('sale') || cat.includes('property')) return { category: 'sale_proceeds', confidence: 0.85 };
    if (cat.includes('loan')) return { category: 'loan_receipt', confidence: 0.85 };
    if (cat.includes('refund')) return { category: 'refund', confidence: 0.9 };
    if (cat.includes('transfer') || cat.includes('internal')) return { category: 'own_account_transfer', confidence: 0.7 };
    if (cat.includes('overseas') || cat.includes('international') || cat.includes('fx')) return { category: 'overseas_incoming', confidence: 0.85 };
    if (cat.includes('large') || cat.includes('one-off')) return { category: 'large_one_off_incoming', confidence: 0.7 };
    if (cat.includes('recurring') || cat.includes('repeating')) return { category: 'recurring_non_salary', confidence: 0.7 };
  } else {
    if (cat.includes('rent') || cat.includes('mortgage')) return { category: 'rent_mortgage', confidence: 0.9 };
    if (cat.includes('gambling') || cat.includes('betting')) return { category: 'gambling', confidence: 0.95 };
    if (cat.includes('crypto')) return { category: 'crypto', confidence: 0.9 };
    if (cat.includes('investment')) return { category: 'investment', confidence: 0.9 };
    if (cat.includes('loan')) return { category: 'loan_repayment', confidence: 0.85 };
    if (cat.includes('card')) return { category: 'card_settlement', confidence: 0.85 };
    if (cat.includes('solicitor') || cat.includes('property')) return { category: 'property_related', confidence: 0.85 };
    if (cat.includes('transfer') || cat.includes('internal')) return { category: 'own_account_transfer_out', confidence: 0.7 };
    if (cat.includes('large') || cat.includes('one-off')) return { category: 'large_one_off_outgoing', confidence: 0.7 };
  }

  return null;
}

// ── Description pattern match ────────────────────────────────────

function fromPatternMatch(tx: RawTransaction, accounts: AccountRef[], parties: PartyRef[]): { category: TransactionCategory; confidence: number } | null {
  const desc = tx.description ?? '';
  if (!desc.trim()) return null;

  const isIncoming = tx.direction === 'incoming';

  if (isIncoming) {
    if (matchesAny(desc, KW_SALARY)) return { category: 'salary_credit', confidence: 0.8 };
    if (matchesAny(desc, KW_BONUS)) return { category: 'bonus_credit', confidence: 0.75 };
    if (matchesAny(desc, KW_GAMBLING)) return { category: 'unknown_incoming', confidence: 0.8 }; // gambling winnings incoming
    if (matchesAny(desc, KW_CRYPTO)) return { category: 'investment_withdrawal', confidence: 0.75 };
    if (matchesAny(desc, KW_INVESTMENT)) return { category: 'investment_withdrawal', confidence: 0.75 };
    if (matchesAny(desc, KW_LOAN)) return { category: 'loan_receipt', confidence: 0.7 };
    if (matchesAny(desc, KW_CASH)) return { category: 'cash_deposit', confidence: 0.85 };
    if (matchesAny(desc, KW_GOVERNMENT)) return { category: 'government_bonus', confidence: 0.8 };
    if (matchesAny(desc, KW_OVERSEAS)) return { category: 'overseas_incoming', confidence: 0.8 };
    if (matchesAny(desc, KW_REFUND)) return { category: 'refund', confidence: 0.85 };
    if (matchesAny(desc, KW_GIFT)) return { category: 'gift', confidence: 0.65 };
    if (matchesAny(desc, KW_SALE)) return { category: 'sale_proceeds', confidence: 0.7 };

    // Check if description contains a party name → third-party or co-buyer
    const partyMatch = parties.find(
      (p) => p.full_name && desc.toUpperCase().includes(p.full_name.toUpperCase())
    );
    if (partyMatch) {
      return {
        category: partyMatch.role === 'co_buyer' ? 'cobuyer_contribution' : 'third_party_transfer',
        confidence: 0.7,
      };
    }

    if (matchesAny(desc, KW_OWN_TRANSFER)) return { category: 'own_account_transfer', confidence: 0.6 };
  } else {
    if (matchesAny(desc, KW_GAMBLING)) return { category: 'gambling', confidence: 0.9 };
    if (matchesAny(desc, KW_CRYPTO)) return { category: 'crypto', confidence: 0.85 };
    if (matchesAny(desc, KW_INVESTMENT)) return { category: 'investment', confidence: 0.8 };
    if (matchesAny(desc, KW_RENT)) return { category: 'rent_mortgage', confidence: 0.8 };
    if (matchesAny(desc, KW_LOAN)) return { category: 'loan_repayment', confidence: 0.75 };
    if (matchesAny(desc, KW_CARD)) return { category: 'card_settlement', confidence: 0.8 };
    if (matchesAny(desc, KW_CASH)) return { category: 'cash_withdrawal', confidence: 0.85 };
    if (matchesAny(desc, KW_PROPERTY)) return { category: 'property_related', confidence: 0.8 };
    if (matchesAny(desc, KW_OWN_TRANSFER)) return { category: 'own_account_transfer_out', confidence: 0.6 };
  }

  return null;
}

// ── Amount heuristic (fallback) ──────────────────────────────────

function fromAmountHeuristic(tx: RawTransaction): { category: TransactionCategory; confidence: number } {
  const isIncoming = tx.direction === 'incoming';
  const amount = tx.amount ?? 0;

  if (isIncoming) {
    if (tx.is_large || amount >= 5000) return { category: 'large_one_off_incoming', confidence: 0.4 };
    if (tx.is_repeating) return { category: 'recurring_non_salary', confidence: 0.4 };
    return { category: 'unknown_incoming', confidence: 0.2 };
  }

  if (tx.is_large || amount >= 5000) return { category: 'large_one_off_outgoing', confidence: 0.4 };
  return { category: 'unknown_outgoing', confidence: 0.2 };
}

// ── Account-relationship check ───────────────────────────────────

function fromAccountRelationship(
  tx: RawTransaction,
  accounts: AccountRef[],
  fundSources: FundSourceRef[]
): { category: TransactionCategory; confidence: number } | null {
  if (!tx.account_id) return null;
  const isIncoming = tx.direction === 'incoming';

  // Check if the transaction's account is in any fund source's linked_account_ids
  for (const fs of fundSources) {
    if (fs.linked_account_ids?.includes(tx.account_id)) {
      if (isIncoming) {
        return { category: 'own_account_transfer', confidence: 0.65 };
      }
      return { category: 'own_account_transfer_out', confidence: 0.65 };
    }
  }

  // Check if account currency is non-GBP → overseas
  const acct = accounts.find((a) => a.id === tx.account_id);
  if (acct?.account_currency && acct.account_currency !== 'GBP' && isIncoming) {
    return { category: 'overseas_incoming', confidence: 0.6 };
  }

  return null;
}

// ── Core classification function ─────────────────────────────────

export function classifyTransaction(
  tx: RawTransaction,
  accounts: AccountRef[],
  parties: PartyRef[],
  fundSources: FundSourceRef[]
): ClassifiedTransaction {
  // Layer 1: Armalytix label
  const label = fromArmalytixLabel(tx);
  if (label && label.confidence >= 0.7) {
    return {
      ...tx,
      classifiedCategory: label.category,
      classificationConfidence: label.confidence,
      classificationMethod: 'armalytix_label',
      materialityFlags: [],
    };
  }

  // Layer 2: Pattern match
  const pattern = fromPatternMatch(tx, accounts, parties);
  if (pattern && pattern.confidence >= 0.5) {
    return {
      ...tx,
      classifiedCategory: pattern.category,
      classificationConfidence: pattern.confidence,
      classificationMethod: 'pattern_match',
      materialityFlags: [],
    };
  }

  // Layer 3: Account relationship
  const acctRel = fromAccountRelationship(tx, accounts, fundSources);
  if (acctRel) {
    return {
      ...tx,
      classifiedCategory: acctRel.category,
      classificationConfidence: acctRel.confidence,
      classificationMethod: 'account_relationship',
      materialityFlags: [],
    };
  }

  // Layer 4: Use lower-confidence label or pattern if available
  const best = label ?? pattern;
  if (best) {
    return {
      ...tx,
      classifiedCategory: best.category,
      classificationConfidence: best.confidence,
      classificationMethod: label ? 'armalytix_label' : 'pattern_match',
      materialityFlags: [],
    };
  }

  // Layer 5: Amount heuristic fallback
  const heuristic = fromAmountHeuristic(tx);
  return {
    ...tx,
    classifiedCategory: heuristic.category,
    classificationConfidence: heuristic.confidence,
    classificationMethod: 'amount_heuristic',
    materialityFlags: [],
  };
}

// ── Bulk classification ──────────────────────────────────────────

export interface ClassificationContext {
  accounts: AccountRef[];
  parties: PartyRef[];
  fundSources: FundSourceRef[];
}

export function classifyAllTransactions(
  txs: RawTransaction[],
  context: ClassificationContext
): ClassifiedTransaction[] {
  return txs.map((tx) =>
    classifyTransaction(tx, context.accounts, context.parties, context.fundSources)
  );
}

// ── Summary builder ──────────────────────────────────────────────

export interface CategorySummary {
  category: TransactionCategory;
  count: number;
  totalAmount: number;
  direction: 'incoming' | 'outgoing';
}

export function buildTransactionSummary(classified: ClassifiedTransaction[]): CategorySummary[] {
  const map = new Map<TransactionCategory, CategorySummary>();

  for (const tx of classified) {
    const existing = map.get(tx.classifiedCategory);
    const dir: 'incoming' | 'outgoing' = tx.direction === 'incoming' ? 'incoming' : 'outgoing';
    if (existing) {
      existing.count += 1;
      existing.totalAmount += tx.amount ?? 0;
    } else {
      map.set(tx.classifiedCategory, {
        category: tx.classifiedCategory,
        count: 1,
        totalAmount: tx.amount ?? 0,
        direction: dir,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

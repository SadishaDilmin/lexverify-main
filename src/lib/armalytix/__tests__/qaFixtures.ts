/**
 * Golden Test Fixtures — 17 scenario types for Armalytix pipeline QA
 *
 * Each fixture provides minimal synthetic data sufficient to trigger
 * the relevant pipeline rules without bulk.
 */

import type { QATestCase } from './qaTypes';

const CASE_ID = 'qa-case-001';

// ── Helper: build a transaction ─────────────────────────────────

let txSeq = 0;
function tx(overrides: Record<string, unknown> = {}) {
  txSeq++;
  return {
    id: `tx-${String(txSeq).padStart(3, '0')}`,
    case_id: CASE_ID,
    direction: 'incoming' as string | null,
    tx_date: '2025-06-15',
    amount: 5000,
    description: 'TRANSFER',
    linked_fund_source_id: null as string | null,
    explanation_status: null as string | null,
    armalytix_category: null as string | null,
    is_repeating: null as boolean | null,
    is_large: null as boolean | null,
    is_cash_or_cash_like: null as boolean | null,
    is_gambling_related: null as boolean | null,
    is_investment_related: null as boolean | null,
    is_overseas: null as boolean | null,
    account_id: 'acc-001',
    ...overrides,
  };
}

function resetTxSeq() { txSeq = 0; }

// ── FIXTURE 1: Armalytix-only, clean case ───────────────────────

const fixture01: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-001',
    title: 'Armalytix-only — clean salary savings case',
    scenarioType: 'armalytix_only',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'SALARY BACS', amount: 3200, armalytix_category: 'salary' }),
        tx({ description: 'SALARY BACS', amount: 3200, tx_date: '2025-05-15', armalytix_category: 'salary' }),
        tx({ description: 'SALARY BACS', amount: 3200, tx_date: '2025-04-15', armalytix_category: 'salary' }),
      ],
      fundSources: [{
        id: 'fs-001', case_id: CASE_ID, source_category: 'salary_savings',
        employer_name: 'Acme Ltd', declared_amount: 25000,
        date_received: '2025-06-01', linked_account_ids: ['acc-001'],
        verification_status: 'evidenced_by_bank_data',
        income_explains_savings: true, years_to_accumulate: 2,
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'John Smith' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'John Smith' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-001', ref_table: 'sow_fund_sources', ref_id: 'fs-001', verification_status: 'verified' },
      ],
      incomeVerifications: [{
        id: 'iv-001', payslip_name_match: true, matched_employer_name: 'Acme Ltd',
        salary_matched_to_bank: true, avg_salary_credit: 3200, net_pay_on_payslip: 3200,
      }],
      reportHeader: {
        amount_to_prove: 25000, purchase_price: 300000, mortgage_amount: 275000,
        mortgage_lender: 'Nationwide', mortgage_offer_in_place: true,
        total_balance_available: 26000, excess_shortfall: 1000,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-001', minSupported: 9000 }],
      exceptionTypes: [],
      absentExceptionTypes: ['funding_shortfall', 'circular_movement_suspected'],
      mandatoryEnquiryCategories: [],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: ['funding_shortfall'],
      reviewStatus: ['clearance_possible', 'pending_reviewer'],
      fundingChain: { hasShortfall: false, overallConfidence: ['high', 'medium'] },
    },
  };
})();

// ── FIXTURE 2: Non-Armalytix case ───────────────────────────────

const fixture02: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-002',
    title: 'Non-Armalytix — manual statements only',
    scenarioType: 'non_armalytix',
    expectedPathway: 'standard',
    inputs: {
      transactions: [],
      fundSources: [{
        id: 'fs-002', case_id: CASE_ID, source_category: 'savings',
        declared_amount: 50000, verification_status: 'declared_not_verified',
      }],
      accounts: [],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Jane Doe' }],
      manualBalances: [
        { id: 'mb-001', case_id: CASE_ID, amount: 50000, evidence_status: 'unverified', counted_toward_proof: true },
      ],
      evidenceItems: [],
      incomeVerifications: [],
      reportHeader: null,
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['manual_balance_unevidenced'],
      absentExceptionTypes: ['circular_movement_suspected'],
      mandatoryEnquiryCategories: ['manual_balance_unevidenced'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending', 'blocked'],
      fundingChain: { overallConfidence: ['insufficient', 'low'] },
    },
  };
})();

// ── FIXTURE 3: Mixed Armalytix + manual ─────────────────────────

const fixture03: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-003',
    title: 'Mixed — Armalytix covers salary, manual covers investment',
    scenarioType: 'mixed',
    expectedPathway: 'hybrid',
    inputs: {
      transactions: [
        tx({ description: 'SALARY', amount: 2800, armalytix_category: 'salary' }),
      ],
      fundSources: [
        { id: 'fs-003a', case_id: CASE_ID, source_category: 'salary_savings', declared_amount: 20000, employer_name: 'Tech Co', linked_account_ids: ['acc-001'], verification_status: 'evidenced_by_bank_data', income_explains_savings: true, years_to_accumulate: 2 },
        { id: 'fs-003b', case_id: CASE_ID, source_category: 'investment_liquidation', declared_amount: 30000, verification_status: 'declared_not_verified' },
      ],
      accounts: [{ id: 'acc-001', account_holder_name: 'Alex Brown' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Alex Brown' }],
      manualBalances: [
        { id: 'mb-002', case_id: CASE_ID, amount: 30000, evidence_status: 'unverified', counted_toward_proof: true, attachment_name: null },
      ],
      evidenceItems: [
        { id: 'ev-002', ref_table: 'sow_fund_sources', ref_id: 'fs-003a', verification_status: 'verified' },
      ],
      incomeVerifications: [{
        id: 'iv-002', salary_matched_to_bank: true, avg_salary_credit: 2800,
      }],
      reportHeader: {
        amount_to_prove: 50000, purchase_price: 350000, mortgage_amount: 300000,
        mortgage_offer_in_place: true, total_balance_available: 52000,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-003a', minSupported: 2800 }],
      exceptionTypes: ['manual_balance_unevidenced'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['manual_balance_unevidenced'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending', 'pending_reviewer'],
      fundingChain: { overallConfidence: ['medium', 'low'] },
    },
  };
})();

// ── FIXTURE 4: Salary savings only ──────────────────────────────

const fixture04: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-004',
    title: 'Salary savings only — plausible accumulation',
    scenarioType: 'salary_only',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'SALARY BACS', amount: 4500, armalytix_category: 'salary' }),
        tx({ description: 'SALARY BACS', amount: 4500, tx_date: '2025-05-15', armalytix_category: 'salary' }),
      ],
      fundSources: [{
        id: 'fs-004', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 40000, employer_name: 'BigCorp', income_explains_savings: true,
        years_to_accumulate: 3, linked_account_ids: ['acc-001'],
        verification_status: 'evidenced_by_bank_data',
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Tom Green' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Tom Green' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-004', ref_table: 'sow_fund_sources', ref_id: 'fs-004', verification_status: 'verified' },
      ],
      incomeVerifications: [{
        id: 'iv-004', salary_matched_to_bank: true, avg_salary_credit: 4500, net_pay_on_payslip: 4500, payslip_name_match: true, matched_employer_name: 'BigCorp',
      }],
      reportHeader: {
        amount_to_prove: 40000, purchase_price: 250000, mortgage_amount: 210000,
        mortgage_offer_in_place: true, total_balance_available: 42000,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-004', minSupported: 9000 }],
      exceptionTypes: [],
      absentExceptionTypes: ['funding_shortfall'],
      mandatoryEnquiryCategories: [],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: ['funding_shortfall'],
      reviewStatus: ['clearance_possible', 'pending_reviewer'],
      fundingChain: { hasShortfall: false },
    },
  };
})();

// ── FIXTURE 5: Co-buyer contribution ────────────────────────────

const fixture05: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-005',
    title: 'Co-buyer contribution — unevidenced partner',
    scenarioType: 'cobuyer',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'TRANSFER FROM PARTNER', amount: 15000 }),
      ],
      fundSources: [
        { id: 'fs-005a', case_id: CASE_ID, source_category: 'salary_savings', declared_amount: 20000, verification_status: 'evidenced_by_bank_data', linked_account_ids: ['acc-001'] },
        { id: 'fs-005b', case_id: CASE_ID, source_category: 'co_buyer_contribution', declared_amount: 15000, verification_status: 'declared_not_verified' },
      ],
      accounts: [{ id: 'acc-001', account_holder_name: 'Sam White' }],
      parties: [
        { id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Sam White' },
        { id: 'p-002', case_id: CASE_ID, role: 'co_buyer', full_name: 'Pat White', contribution_amount: 15000 },
      ],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-005', ref_table: 'sow_fund_sources', ref_id: 'fs-005a', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 35000, purchase_price: 280000, mortgage_amount: 245000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-005a', minSupported: 0 }],
      exceptionTypes: ['cobuyer_contribution_unevidenced'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['cobuyer_contribution_unevidenced'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: { overallConfidence: ['medium', 'low'] },
    },
  };
})();

// ── FIXTURE 6: Gift funds ───────────────────────────────────────

const fixture06: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-006',
    title: 'Gift — incomplete evidence (no donor letter)',
    scenarioType: 'gift',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'GIFT FROM PARENT', amount: 25000 }),
      ],
      fundSources: [{
        id: 'fs-006', case_id: CASE_ID, source_category: 'gift',
        declared_amount: 25000, verification_status: 'declared_not_verified',
        donor_name: 'Mrs Smith',
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Chris Smith' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Chris Smith' }],
      manualBalances: [],
      evidenceItems: [],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 25000, purchase_price: 200000, mortgage_amount: 175000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['gift_incomplete_evidence'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['gift_incomplete_evidence'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: { overallConfidence: ['low', 'insufficient'] },
    },
  };
})();

// ── FIXTURE 7: Manual balances ──────────────────────────────────

const fixture07: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-007',
    title: 'Manual balances — relied upon but unevidenced',
    scenarioType: 'manual_balances',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [],
      fundSources: [{
        id: 'fs-007', case_id: CASE_ID, source_category: 'savings',
        declared_amount: 40000, verification_status: 'declared_not_verified',
      }],
      accounts: [],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Lee Jones' }],
      manualBalances: [
        { id: 'mb-007', case_id: CASE_ID, amount: 40000, evidence_status: 'unverified', counted_toward_proof: true },
      ],
      evidenceItems: [],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 40000, purchase_price: 300000, mortgage_amount: 260000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['manual_balance_unevidenced'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['manual_balance_unevidenced'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending', 'blocked'],
      fundingChain: { overallConfidence: ['insufficient', 'low'] },
    },
  };
})();

// ── FIXTURE 8: Large unexplained incoming ───────────────────────

const fixture08: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-008',
    title: 'Large unexplained incoming credits',
    scenarioType: 'large_unexplained_credits',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'FPO UNKNOWN REF', amount: 12000, is_large: true }),
        tx({ description: 'FPO TRANSFER', amount: 8000, is_large: true, tx_date: '2025-05-20' }),
      ],
      fundSources: [{
        id: 'fs-008', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 15000, verification_status: 'evidenced_by_bank_data',
        linked_account_ids: ['acc-001'],
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Robin Taylor' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Robin Taylor' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-008', ref_table: 'sow_fund_sources', ref_id: 'fs-008', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 30000, purchase_price: 250000, mortgage_amount: 220000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-008', minSupported: 0 }],
      exceptionTypes: ['unexplained_large_incoming', 'undeclared_incoming_credit'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['large_incoming_unmatched', 'unexplained_incoming_credit'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: {},
    },
  };
})();

// ── FIXTURE 9: Repeated third-party credits ─────────────────────

const fixture09: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-009',
    title: 'Repeated third-party credits from unknown source',
    scenarioType: 'repeated_third_party',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'J BLOGGS', amount: 2000 }),
        tx({ description: 'J BLOGGS', amount: 2000, tx_date: '2025-05-15' }),
        tx({ description: 'J BLOGGS', amount: 2000, tx_date: '2025-04-15' }),
        tx({ description: 'J BLOGGS', amount: 2000, tx_date: '2025-03-15' }),
      ],
      fundSources: [{
        id: 'fs-009', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 20000, verification_status: 'evidenced_by_bank_data',
        linked_account_ids: ['acc-001'],
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Morgan Lee' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Morgan Lee' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-009', ref_table: 'sow_fund_sources', ref_id: 'fs-009', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 20000, purchase_price: 200000, mortgage_amount: 180000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-009', minSupported: 0 }],
      exceptionTypes: ['repeated_third_party_credits'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['repeated_third_party_credits'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: {},
    },
  };
})();

// ── FIXTURE 10: Foreign funds ───────────────────────────────────

const fixture10: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-010',
    title: 'Foreign funds — overseas incoming with limited evidence',
    scenarioType: 'foreign_funds',
    expectedPathway: 'hybrid',
    inputs: {
      transactions: [
        tx({ description: 'WISE INTERNATIONAL', amount: 30000, is_overseas: true }),
      ],
      fundSources: [{
        id: 'fs-010', case_id: CASE_ID, source_category: 'overseas_savings',
        declared_amount: 30000, verification_status: 'declared_not_verified',
        outside_uk: true,
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Priya Patel', account_currency: 'GBP' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Priya Patel' }],
      manualBalances: [
        { id: 'mb-010', case_id: CASE_ID, amount: 30000, evidence_status: 'unverified', counted_toward_proof: true },
      ],
      evidenceItems: [],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 30000, purchase_price: 280000, mortgage_amount: 250000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['overseas_insufficiently_explained', 'manual_balance_unevidenced'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['overseas_source_clarification'],
      discretionaryEnquiryCategories: ['manual_balance_unevidenced'],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending', 'blocked'],
      fundingChain: { overallConfidence: ['low', 'insufficient'] },
    },
  };
})();

// ── FIXTURE 11: Investment liquidation ──────────────────────────

const fixture11: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-011',
    title: 'Investment liquidation outside Armalytix',
    scenarioType: 'investment_liquidation',
    expectedPathway: 'hybrid',
    inputs: {
      transactions: [
        tx({ description: 'HARGREAVES LANSDOWN', amount: 45000, is_investment_related: true }),
      ],
      fundSources: [{
        id: 'fs-011', case_id: CASE_ID, source_category: 'investment_liquidation',
        declared_amount: 45000, verification_status: 'declared_not_verified',
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'David Chen' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'David Chen' }],
      manualBalances: [
        { id: 'mb-011', case_id: CASE_ID, amount: 45000, evidence_status: 'unverified', counted_toward_proof: true },
      ],
      evidenceItems: [],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 45000, purchase_price: 400000, mortgage_amount: 355000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['manual_balance_unevidenced'],
      absentExceptionTypes: ['circular_movement_suspected'],
      mandatoryEnquiryCategories: ['investment_crypto_clarification'],
      discretionaryEnquiryCategories: ['manual_balance_unevidenced'],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: { overallConfidence: ['low', 'insufficient'] },
    },
  };
})();

// ── FIXTURE 12: Possible loan funding ───────────────────────────

const fixture12: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-012',
    title: 'Possible loan — ZOPA credit detected',
    scenarioType: 'possible_loan',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'ZOPA LOAN DISBURSEMENT', amount: 20000 }),
      ],
      fundSources: [{
        id: 'fs-012', case_id: CASE_ID, source_category: 'savings',
        declared_amount: 20000, verification_status: 'evidenced_by_bank_data',
        linked_account_ids: ['acc-001'],
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Kim Park' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Kim Park' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-012', ref_table: 'sow_fund_sources', ref_id: 'fs-012', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 20000, purchase_price: 180000, mortgage_amount: 160000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['possible_undeclared_loan'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['possible_undeclared_loan'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending', 'blocked'],
      fundingChain: {},
    },
  };
})();

// ── FIXTURE 13: Gambling activity ───────────────────────────────

const fixture13: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-013',
    title: 'Gambling — significant BET365 activity',
    scenarioType: 'gambling',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'BET365', amount: 2000, direction: 'outgoing', is_gambling_related: true }),
        tx({ description: 'BET365', amount: 1500, direction: 'outgoing', is_gambling_related: true, tx_date: '2025-05-10' }),
        tx({ description: 'BET365 WITHDRAWAL', amount: 3000, is_gambling_related: true }),
      ],
      fundSources: [{
        id: 'fs-013', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 25000, verification_status: 'evidenced_by_bank_data',
        linked_account_ids: ['acc-001'],
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Ryan Fox' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Ryan Fox' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-013', ref_table: 'sow_fund_sources', ref_id: 'fs-013', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 25000, purchase_price: 220000, mortgage_amount: 195000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['significant_gambling_activity'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['gambling_activity_relevant'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: {},
    },
  };
})();

// ── FIXTURE 14: Funding shortfall ───────────────────────────────

const fixture14: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-014',
    title: 'Funding shortfall — declared less than amount to prove',
    scenarioType: 'funding_shortfall',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'SALARY', amount: 2000, armalytix_category: 'salary' }),
      ],
      fundSources: [{
        id: 'fs-014', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 15000, verification_status: 'evidenced_by_bank_data',
        linked_account_ids: ['acc-001'],
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Emma Clarke' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Emma Clarke' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-014', ref_table: 'sow_fund_sources', ref_id: 'fs-014', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 40000, purchase_price: 250000, mortgage_amount: 210000,
        mortgage_offer_in_place: true, total_balance_available: 16000,
        excess_shortfall: -24000,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-014', minSupported: 2000 }],
      exceptionTypes: ['funding_shortfall'],
      absentExceptionTypes: ['excess_funds_unexplained'],
      mandatoryEnquiryCategories: ['funding_shortfall'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: ['excess_funds_unexplained'],
      reviewStatus: ['blocked', 'enquiries_pending'],
      fundingChain: { hasShortfall: true, overallConfidence: ['insufficient', 'low'] },
    },
  };
})();

// ── FIXTURE 15: Excess funds ────────────────────────────────────

const fixture15: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-015',
    title: 'Unexplained excess funds beyond amount to prove',
    scenarioType: 'excess_funds',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'SALARY', amount: 5000, armalytix_category: 'salary' }),
        tx({ description: 'UNKNOWN CREDIT', amount: 50000 }),
      ],
      fundSources: [{
        id: 'fs-015', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 20000, verification_status: 'evidenced_by_bank_data',
        linked_account_ids: ['acc-001'],
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Olivia Brown' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Olivia Brown' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-015', ref_table: 'sow_fund_sources', ref_id: 'fs-015', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 20000, purchase_price: 200000, mortgage_amount: 180000,
        mortgage_offer_in_place: true, total_balance_available: 55000,
        excess_shortfall: 35000,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-015', minSupported: 5000 }],
      exceptionTypes: ['excess_funds_unexplained', 'undeclared_incoming_credit'],
      absentExceptionTypes: ['funding_shortfall'],
      mandatoryEnquiryCategories: ['excess_funds_unexplained'],
      discretionaryEnquiryCategories: ['unexplained_incoming_credit'],
      noEnquiryCategories: ['funding_shortfall'],
      reviewStatus: ['enquiries_pending'],
      fundingChain: { hasExcess: true },
    },
  };
})();

// ── FIXTURE 16: Contradictory information ───────────────────────

const fixture16: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-016',
    title: 'Contradictory info — declared amount vs bank evidence mismatch',
    scenarioType: 'contradictory_info',
    expectedPathway: 'armalytix',
    inputs: {
      transactions: [
        tx({ description: 'SALARY', amount: 2500, armalytix_category: 'salary', linked_fund_source_id: 'fs-016' }),
      ],
      fundSources: [{
        id: 'fs-016', case_id: CASE_ID, source_category: 'salary_savings',
        declared_amount: 50000, verification_status: 'contradicted',
        employer_name: 'Small Co', income_explains_savings: true,
        years_to_accumulate: 1, linked_account_ids: ['acc-001'],
        annual_gross_salary: 30000,
      }],
      accounts: [{ id: 'acc-001', account_holder_name: 'Liam Scott' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Liam Scott' }],
      manualBalances: [],
      evidenceItems: [
        { id: 'ev-016', ref_table: 'sow_fund_sources', ref_id: 'fs-016', verification_status: 'contradicted' },
      ],
      incomeVerifications: [{
        id: 'iv-016', salary_matched_to_bank: false, avg_salary_credit: 2500,
        net_pay_on_payslip: 2500, payslip_name_match: true, matched_employer_name: 'Small Co',
      }],
      reportHeader: {
        amount_to_prove: 50000, purchase_price: 300000, mortgage_amount: 250000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [],
      exceptionTypes: ['amount_mismatch_declaration_vs_evidence', 'salary_savings_unsupported'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['contradiction_narrative_vs_evidence', 'salary_savings_unsupported'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['blocked', 'enquiries_pending'],
      fundingChain: { hasShortfall: true, overallConfidence: ['insufficient', 'low'] },
    },
  };
})();

// ── FIXTURE 17: Partial Armalytix coverage ──────────────────────

const fixture17: QATestCase = (() => {
  resetTxSeq();
  return {
    id: 'QA-ARM-017',
    title: 'Partial Armalytix — covers main account, not all funding sources',
    scenarioType: 'partial_armalytix',
    expectedPathway: 'hybrid',
    inputs: {
      transactions: [
        tx({ description: 'SALARY', amount: 3500, armalytix_category: 'salary' }),
        tx({ description: 'TRANSFER IN', amount: 10000 }),
      ],
      fundSources: [
        { id: 'fs-017a', case_id: CASE_ID, source_category: 'salary_savings', declared_amount: 25000, verification_status: 'evidenced_by_bank_data', linked_account_ids: ['acc-001'] },
        { id: 'fs-017b', case_id: CASE_ID, source_category: 'property_sale', declared_amount: 40000, verification_status: 'declared_not_verified', outside_uk: false },
      ],
      accounts: [{ id: 'acc-001', account_holder_name: 'Zara Khan' }],
      parties: [{ id: 'p-001', case_id: CASE_ID, role: 'buyer', full_name: 'Zara Khan' }],
      manualBalances: [
        { id: 'mb-017', case_id: CASE_ID, amount: 40000, evidence_status: 'unverified', counted_toward_proof: true },
      ],
      evidenceItems: [
        { id: 'ev-017', ref_table: 'sow_fund_sources', ref_id: 'fs-017a', verification_status: 'verified' },
      ],
      incomeVerifications: [],
      reportHeader: {
        amount_to_prove: 65000, purchase_price: 450000, mortgage_amount: 385000,
        mortgage_offer_in_place: true,
      },
    },
    expected: {
      supportedSources: [{ sourceId: 'fs-017a', minSupported: 3500 }],
      exceptionTypes: ['manual_balance_unevidenced'],
      absentExceptionTypes: [],
      mandatoryEnquiryCategories: ['manual_balance_unevidenced', 'sale_proceeds_evidence'],
      discretionaryEnquiryCategories: [],
      noEnquiryCategories: [],
      reviewStatus: ['enquiries_pending'],
      fundingChain: { overallConfidence: ['low', 'medium'] },
    },
  };
})();

// ── Export all fixtures ─────────────────────────────────────────

export const ALL_FIXTURES: QATestCase[] = [
  fixture01, fixture02, fixture03, fixture04, fixture05,
  fixture06, fixture07, fixture08, fixture09, fixture10,
  fixture11, fixture12, fixture13, fixture14, fixture15,
  fixture16, fixture17,
];

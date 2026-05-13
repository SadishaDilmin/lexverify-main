/**
 * Unit tests for `deriveBlockedChecks`.
 *
 * Pure-function tests over `StructuredArmalytixData` fixtures — no DB,
 * no React, no mocks. Each test asserts that a specific LSAG rule emits
 * (or correctly omits) its `CheckExecutionRecord` based on the inputs
 * the deterministic engine would have seen.
 */

import { describe, it, expect } from 'vitest';
import { deriveBlockedChecks } from '../pendingChecks';
import type { StructuredArmalytixData } from '../promptModule';

function makeData(
  overrides: Partial<StructuredArmalytixData> = {},
): StructuredArmalytixData {
  return {
    accounts: [],
    transactions: [],
    fundSources: [],
    manualBalances: [],
    incomeVerifications: [],
    evidenceItems: [],
    riskFlags: [],
    parties: [],
    reportHeader: null,
    ...overrides,
  };
}

const find = (records: ReturnType<typeof deriveBlockedChecks>, id: string) =>
  records.find((r) => r.checkId === id);

describe('deriveBlockedChecks — early exit', () => {
  it('returns [] when there are no fund sources and no transactions', () => {
    const records = deriveBlockedChecks(makeData());
    expect(records).toEqual([]);
  });
});

describe('deriveBlockedChecks — A7 lifestyle vs declared income (LSAG C)', () => {
  it('emits when a fund source has no annual_gross_salary', () => {
    const records = deriveBlockedChecks(
      makeData({ fundSources: [{ source_category: 'savings' }] }),
    );
    const rec = find(records, 'lifestyle_inconsistent_with_income');
    expect(rec).toBeDefined();
    expect(rec?.missingInputs).toEqual(['sow_fund_sources.annual_gross_salary']);
    expect(rec?.label).toBe('A7 — Lifestyle vs declared income');
  });

  it('omits when a fund source carries a positive annual_gross_salary', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'salary', annual_gross_salary: 50000 }],
      }),
    );
    expect(find(records, 'lifestyle_inconsistent_with_income')).toBeUndefined();
  });

  it('omits A7 when there are only transactions (precondition not met) but still emits A12', () => {
    const records = deriveBlockedChecks(
      makeData({ transactions: [{ amount: 100 }] }),
    );
    expect(find(records, 'lifestyle_inconsistent_with_income')).toBeUndefined();
    expect(find(records, 'late_disclosure_after_challenge')).toBeDefined();
  });
});

describe('deriveBlockedChecks — A12 disclosure timing (LSAG E)', () => {
  it('always emits for an active case', () => {
    const records = deriveBlockedChecks(
      makeData({ fundSources: [{ source_category: 'savings' }] }),
    );
    const rec = find(records, 'late_disclosure_after_challenge');
    expect(rec).toBeDefined();
    expect(rec?.missingInputs).toEqual(['case_disclosures.disclosure_timing']);
    expect(rec?.label).toBe('A12 — Timing of disclosures');
  });
});

describe('deriveBlockedChecks — mortgage funding consistency (LSAG D)', () => {
  it('emits when declared funds < purchase price and mortgage_amount is missing', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'savings', declared_amount: 100000 }],
        reportHeader: { purchase_price: 500000, mortgage_amount: 0 },
      }),
    );
    const rec = find(records, 'mortgage_funding_contradiction');
    expect(rec).toBeDefined();
    expect(rec?.missingInputs).toEqual([
      'armalytix_reports.mortgage_amount',
      'armalytix_reports.mortgage_offer_in_place',
    ]);
  });

  it('omits when mortgage_amount is populated', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'savings', declared_amount: 100000 }],
        reportHeader: { purchase_price: 500000, mortgage_amount: 400000 },
      }),
    );
    expect(find(records, 'mortgage_funding_contradiction')).toBeUndefined();
  });

  it('omits when declared funds already cover the purchase price', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'savings', declared_amount: 600000 }],
        reportHeader: { purchase_price: 500000, mortgage_amount: 0 },
      }),
    );
    expect(find(records, 'mortgage_funding_contradiction')).toBeUndefined();
  });

  it('omits when purchase_price is 0', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'savings' }],
        reportHeader: { purchase_price: 0 },
      }),
    );
    expect(find(records, 'mortgage_funding_contradiction')).toBeUndefined();
  });
});

describe('deriveBlockedChecks — name/identity match (LSAG A)', () => {
  it('emits when there is a salary fund source and no income verifications', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'salary', annual_gross_salary: 50000 }],
        incomeVerifications: [],
      }),
    );
    const rec = find(records, 'name_identity_inconsistency');
    expect(rec).toBeDefined();
    expect(rec?.missingInputs).toEqual(['sow_income_verification']);
    expect(rec?.label).toBe('Name / identity match on payslips');
  });

  it('omits when at least one income verification row exists', () => {
    const records = deriveBlockedChecks(
      makeData({
        fundSources: [{ source_category: 'salary', annual_gross_salary: 50000 }],
        incomeVerifications: [{ id: 'iv1' }],
      }),
    );
    expect(find(records, 'name_identity_inconsistency')).toBeUndefined();
  });

  it('omits when no salary-type fund source is present', () => {
    const records = deriveBlockedChecks(
      makeData({ fundSources: [{ source_category: 'savings' }] }),
    );
    expect(find(records, 'name_identity_inconsistency')).toBeUndefined();
  });

  it.each(['employment', 'wages', 'EMPLOYMENT_INCOME'])(
    'recognises salary category variant %s (case-insensitive) and emits when verifications absent',
    (category) => {
      const records = deriveBlockedChecks(
        makeData({
          fundSources: [{ source_category: category, annual_gross_salary: 40000 }],
        }),
      );
      expect(find(records, 'name_identity_inconsistency')).toBeDefined();
    },
  );
});

describe('deriveBlockedChecks — defensive behaviour', () => {
  it('does not throw when a fund source is missing source_category entirely', () => {
    expect(() =>
      deriveBlockedChecks(
        makeData({ fundSources: [{ declared_amount: 1000 }] }),
      ),
    ).not.toThrow();
    const records = deriveBlockedChecks(
      makeData({ fundSources: [{ declared_amount: 1000 }] }),
    );
    // salary-gated rule must NOT fire when category is unknown
    expect(find(records, 'name_identity_inconsistency')).toBeUndefined();
  });

  it('emitted records carry the blocked_missing_input status and a default reason', () => {
    const records = deriveBlockedChecks(
      makeData({ fundSources: [{ source_category: 'savings' }] }),
    );
    const rec = find(records, 'late_disclosure_after_challenge');
    expect(rec?.status).toBe('blocked_missing_input');
    expect(rec?.reason).toBe('Awaiting case_disclosures.disclosure_timing');
  });
});

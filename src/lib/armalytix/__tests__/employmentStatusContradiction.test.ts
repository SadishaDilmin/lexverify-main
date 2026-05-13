/**
 * Unit tests for `ruleEmploymentStatusContradiction` (LSAG C — Batch C).
 *
 * Pure-function tests covering the emit and omit paths. No DB, no mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  ruleEmploymentStatusContradiction,
  type EmploymentStatusInputs,
  type EmploymentStatusFundSourceInput,
  type EmploymentStatusIncomeVerificationInput,
} from '../exceptionEngine';

let _idCounter = 0;
function fs(
  overrides: Partial<EmploymentStatusFundSourceInput> = {},
): EmploymentStatusFundSourceInput {
  _idCounter += 1;
  return {
    id: overrides.id ?? `fs-${_idCounter}`,
    source_category:
      'source_category' in overrides ? overrides.source_category ?? null : 'salary',
    employer_name:
      'employer_name' in overrides ? overrides.employer_name ?? null : 'Acme Ltd',
    annual_gross_salary:
      'annual_gross_salary' in overrides ? overrides.annual_gross_salary : 45_000,
  };
}

function iv(
  overrides: Partial<EmploymentStatusIncomeVerificationInput> = {},
): EmploymentStatusIncomeVerificationInput {
  _idCounter += 1;
  return {
    id: overrides.id ?? `iv-${_idCounter}`,
    payslip_name_match:
      'payslip_name_match' in overrides ? overrides.payslip_name_match : null,
    salary_matched_to_bank:
      'salary_matched_to_bank' in overrides ? overrides.salary_matched_to_bank : null,
    avg_salary_credit:
      'avg_salary_credit' in overrides ? overrides.avg_salary_credit : null,
    net_pay_on_payslip:
      'net_pay_on_payslip' in overrides ? overrides.net_pay_on_payslip : null,
  };
}

function inputs(
  overrides: Partial<EmploymentStatusInputs> = {},
): EmploymentStatusInputs {
  return {
    fundSources: overrides.fundSources ?? [],
    incomeVerifications: overrides.incomeVerifications ?? [],
  };
}

describe('ruleEmploymentStatusContradiction', () => {
  // ── Emit paths ──────────────────────────────────────────────────

  it('emits (medium) when a salary source coexists with a declared dividend / self-employment source', () => {
    const salary = fs({ id: 'salary-1', source_category: 'salary' });
    const div = fs({ id: 'div-1', source_category: 'dividend_income' });
    const result = ruleEmploymentStatusContradiction(
      inputs({ fundSources: [salary, div] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].exceptionType).toBe('employment_status_contradiction');
    expect(result[0].severity).toBe('medium');
    expect(result[0].linkedRefId).toBe('salary-1');
    expect(result[0].linkedRefTable).toBe('sow_fund_sources');
    expect(result[0].rationale).toMatch(/dividend_income/);
  });

  it('emits (medium) for hyphenated and spaced self-employment markers', () => {
    const salary = fs({ id: 's', source_category: 'salary' });
    const a = fs({ id: 'a', source_category: 'self-employment_income' });
    const b = fs({ id: 'b', source_category: 'sole trader profits' });
    const c = fs({ id: 'c', source_category: 'company_director_distribution' });
    expect(
      ruleEmploymentStatusContradiction(inputs({ fundSources: [salary, a] })),
    ).toHaveLength(1);
    expect(
      ruleEmploymentStatusContradiction(inputs({ fundSources: [salary, b] })),
    ).toHaveLength(1);
    expect(
      ruleEmploymentStatusContradiction(inputs({ fundSources: [salary, c] })),
    ).toHaveLength(1);
  });

  it('emits (high) when bank evidence shows no PAYE-pattern credit (salary_matched_to_bank === false)', () => {
    const salary = fs({ id: 'salary-2' });
    const verification = iv({
      salary_matched_to_bank: false,
      avg_salary_credit: 0,
    });
    const result = ruleEmploymentStatusContradiction(
      inputs({ fundSources: [salary], incomeVerifications: [verification] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
    expect(result[0].rationale).toMatch(/PAYE-pattern/);
  });

  it('emits (high) when both narrative-marker and bank evidence signals are present, citing both reasons', () => {
    const salary = fs({ id: 'salary-3' });
    const div = fs({ id: 'd', source_category: 'dividends' });
    const verification = iv({ salary_matched_to_bank: false, avg_salary_credit: null });
    const result = ruleEmploymentStatusContradiction(
      inputs({
        fundSources: [salary, div],
        incomeVerifications: [verification],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
    expect(result[0].rationale).toMatch(/non-PAYE income source/);
    expect(result[0].rationale).toMatch(/PAYE-pattern credit/);
  });

  it('produces a stable LSAG-C-aligned exception shape (sow_fund_sources ref, source_category field, contradiction action)', () => {
    const salary = fs({ id: 'shape', annual_gross_salary: 60_000 });
    const div = fs({ source_category: 'dividend_income' });
    const result = ruleEmploymentStatusContradiction(
      inputs({ fundSources: [salary, div] }),
    );
    expect(result[0]).toMatchObject({
      exceptionType: 'employment_status_contradiction',
      linkedRefTable: 'sow_fund_sources',
      linkedField: 'source_category',
      autoGenerated: true,
      reviewerConfirmationRequired: true,
      canTriggerEnquiry: true,
    });
    expect(result[0].quantitativeBasis).toMatch(/£60,000/);
    expect(result[0].suggestedNextAction).toMatch(/SA302|accountant/i);
  });

  // ── Omit paths ──────────────────────────────────────────────────

  it('does NOT emit when no salary source is declared', () => {
    const div = fs({ source_category: 'dividend_income' });
    const result = ruleEmploymentStatusContradiction(
      inputs({ fundSources: [div] }),
    );
    expect(result).toEqual([]);
  });

  it('does NOT emit on a clean PAYE matter (salary source only, no contradicting evidence)', () => {
    const salary = fs();
    const verification = iv({ salary_matched_to_bank: true, avg_salary_credit: 3200 });
    const result = ruleEmploymentStatusContradiction(
      inputs({ fundSources: [salary], incomeVerifications: [verification] }),
    );
    expect(result).toEqual([]);
  });

  it('does NOT emit when salary_matched_to_bank is null/undefined (absence ≠ contradiction)', () => {
    const salary = fs();
    expect(
      ruleEmploymentStatusContradiction(
        inputs({ fundSources: [salary], incomeVerifications: [iv()] }),
      ),
    ).toEqual([]);
  });

  it('does NOT emit when salary_matched_to_bank === false but a PAYE pattern is observed (avg_salary_credit > 0)', () => {
    const salary = fs();
    const verification = iv({ salary_matched_to_bank: false, avg_salary_credit: 2800 });
    expect(
      ruleEmploymentStatusContradiction(
        inputs({ fundSources: [salary], incomeVerifications: [verification] }),
      ),
    ).toEqual([]);
  });

  it('does NOT emit on substring-only category matches such as "salary_dividend_blend" without the salary token boundary', () => {
    // The salary token is word-boundary matched, so a category that does not
    // contain the bare token 'salary' (e.g. 'consultancy_fee') should not
    // be treated as a salary source.
    const a = fs({ id: 'a', source_category: 'consultancy_fee' });
    const b = fs({ id: 'b', source_category: 'dividend_income' });
    expect(
      ruleEmploymentStatusContradiction(inputs({ fundSources: [a, b] })),
    ).toEqual([]);
  });

  // ── Defensive paths ─────────────────────────────────────────────

  it('returns [] for undefined inputs', () => {
    expect(ruleEmploymentStatusContradiction(undefined)).toEqual([]);
  });

  it('returns [] when both fundSources and incomeVerifications are empty', () => {
    expect(ruleEmploymentStatusContradiction(inputs())).toEqual([]);
  });

  it('handles missing employer_name and annual_gross_salary gracefully', () => {
    const salary = fs({ employer_name: null, annual_gross_salary: null });
    const div = fs({ source_category: 'dividends' });
    const result = ruleEmploymentStatusContradiction(
      inputs({ fundSources: [salary, div] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rationale).toMatch(/the stated employer/);
    expect(result[0].quantitativeBasis).toBeNull();
  });

  // ── Null factory and token-boundary regression ──────────────────
  describe('null factory and token-boundary regression', () => {
    it('C-N1: does NOT emit on a salary source with all optional fields explicitly null and no contradicting evidence', () => {
      const salary = fs({ employer_name: null, annual_gross_salary: null });
      expect(
        ruleEmploymentStatusContradiction(inputs({ fundSources: [salary] })),
      ).toEqual([]);
    });

    it('C-N2: does NOT emit when incomeVerifications is an empty array (no PAYE-pattern claim either way)', () => {
      const salary = fs();
      expect(
        ruleEmploymentStatusContradiction(
          inputs({ fundSources: [salary], incomeVerifications: [] }),
        ),
      ).toEqual([]);
    });

    it('C-N3: does NOT emit when a self-employment marker appears only as substring inside an unrelated category', () => {
      const salary = fs({ id: 's' });
      const other = fs({ id: 'o', source_category: 'non-director_pension_drawdown' });
      expect(
        ruleEmploymentStatusContradiction(inputs({ fundSources: [salary, other] })),
      ).toEqual([]);
    });

    it('C-N4: emits when a contradicting source_category is uppercase ("DIVIDEND_INCOME") alongside salary', () => {
      const salary = fs({ id: 's' });
      const div = fs({ id: 'd', source_category: 'DIVIDEND_INCOME' });
      const result = ruleEmploymentStatusContradiction(
        inputs({ fundSources: [salary, div] }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].exceptionType).toBe('employment_status_contradiction');
    });

    it('C-N5: emits (high) when salary_matched_to_bank = false and avg_salary_credit is null', () => {
      const salary = fs();
      const verification = iv({
        salary_matched_to_bank: false,
        avg_salary_credit: null,
      });
      const result = ruleEmploymentStatusContradiction(
        inputs({ fundSources: [salary], incomeVerifications: [verification] }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('high');
    });
  });
});

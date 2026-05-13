/**
 * Pending-check deriver for the LSAG Consistency Matrix.
 *
 * Pure function over the same `StructuredArmalytixData` snapshot the
 * deterministic engine consumes. Emits a `CheckExecutionRecord` only when:
 *   1. the check's applicability precondition is met (it WOULD have run), AND
 *   2. a specific, named input is missing from the persisted data.
 *
 * Inapplicable checks are silently omitted (no false "pending" noise).
 * Reads optional fields defensively — schema drift degrades to "no pending"
 * rather than throwing.
 */

import { blocked, type CheckExecutionRecord } from './checkStatus';
import type { StructuredArmalytixData } from './promptModule';

const SALARY_CATEGORIES = new Set(['salary', 'employment', 'employment_income', 'wages']);

function hasSalaryFundSource(data: StructuredArmalytixData): boolean {
  return (data.fundSources ?? []).some((fs: any) =>
    SALARY_CATEGORIES.has(String(fs?.source_category ?? '').toLowerCase()),
  );
}

function hasPositiveSalary(data: StructuredArmalytixData): boolean {
  return (data.fundSources ?? []).some(
    (fs: any) => Number(fs?.annual_gross_salary ?? 0) > 0,
  );
}

function totalDeclaredFunds(data: StructuredArmalytixData): number {
  return (data.fundSources ?? []).reduce(
    (sum: number, fs: any) => sum + Number(fs?.declared_amount ?? 0),
    0,
  );
}

export function deriveBlockedChecks(
  data: StructuredArmalytixData,
): CheckExecutionRecord[] {
  const out: CheckExecutionRecord[] = [];

  // Nothing to assess against → no pending records.
  if ((data.fundSources?.length ?? 0) === 0 && (data.transactions?.length ?? 0) === 0) {
    return out;
  }

  // C — Lifestyle vs declared income (A7)
  // Applicable when there are any fund sources to compare against; blocked when
  // no source carries a positive `annual_gross_salary`.
  if ((data.fundSources?.length ?? 0) > 0 && !hasPositiveSalary(data)) {
    out.push(
      blocked(
        'lifestyle_inconsistent_with_income',
        'A7 — Lifestyle vs declared income',
        ['sow_fund_sources.annual_gross_salary'],
      ),
    );
  }

  // E — Timing of disclosures (A12)
  // The disclosure-timing schema is not yet persisted; this check therefore
  // remains "pending awaiting case_disclosures.disclosure_timing" on every
  // case until that data lands. Emitted only when the matrix would otherwise
  // be active for the case.
  out.push(
    blocked(
      'late_disclosure_after_challenge',
      'A12 — Timing of disclosures',
      ['case_disclosures.disclosure_timing'],
    ),
  );

  // E — Mortgage funding consistency
  // Applicable when declared funds alone do not appear to cover the purchase
  // price; blocked when the mortgage amount is missing so the engine cannot
  // evaluate whether the funding structure is internally consistent.
  const purchasePrice = Number((data.reportHeader as any)?.purchase_price ?? 0);
  const mortgageAmount = Number((data.reportHeader as any)?.mortgage_amount ?? 0);
  if (purchasePrice > 0 && totalDeclaredFunds(data) < purchasePrice && mortgageAmount <= 0) {
    out.push(
      blocked(
        'mortgage_funding_contradiction',
        'Mortgage funding consistency',
        ['armalytix_reports.mortgage_amount', 'armalytix_reports.mortgage_offer_in_place'],
      ),
    );
  }

  // A — Name / identity match on payslips
  // Applicable when there is at least one salary-type fund source; blocked
  // when no income-verification rows exist to cross-check name on payslips.
  if (hasSalaryFundSource(data) && (data.incomeVerifications?.length ?? 0) === 0) {
    out.push(
      blocked(
        'name_identity_inconsistency',
        'Name / identity match on payslips',
        ['sow_income_verification'],
      ),
    );
  }

  return out;
}

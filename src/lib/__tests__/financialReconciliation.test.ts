/**
 * Unit tests for computeFundingSufficiency
 * Wave 15.1 Pre-AI Sufficiency Gate — pure arithmetic, no I/O, no mocking.
 *
 * Framework: Vitest (see vitest.config.ts)
 * Location convention: src/lib/__tests__/ (mirrors purchasePrice.test.ts pattern)
 *
 * Import note: financialReconciliation.ts has zero Deno-specific imports,
 * so Vitest can consume it directly via a relative path.
 *
 * Breakdown-field gap note:
 *   The Wave 15 scoping document §13 required a `breakdown` array of line
 *   items (add/subtract rows with human-readable labels) on SufficiencyResult.
 *   That field was not included in the Wave 15.1 implementation
 *   (financialReconciliation.ts is a PR-#17 file; cannot be modified in this
 *   closeout PR). The "breakdown shape" test cases below verify the arithmetic
 *   decomposition implicitly — each component is tested in isolation — but the
 *   formal `breakdown[]` field is deferred to Wave 15.1.1.
 *   See COMPLIANCE_FINDINGS.md for the logged gap.
 */

import { describe, it, expect } from "vitest";
import {
  computeFundingSufficiency,
} from "../../../supabase/functions/_shared/financialReconciliation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal sufficient baseline.
 * purchase_price=£500,000  stamp_duty=£15,000  legal_fees=£2,000
 * mortgage_amount=£300,000 → funds_required=£217,000
 * One purchaser contributing exactly £217,000.
 */
const BASELINE = {
  purchase_price: 50_000_000,   // £500,000 in pence
  stamp_duty:      1_500_000,   // £15,000
  legal_fees:        200_000,   // £2,000
  mortgage_amount: 30_000_000,  // £300,000
  // funds_required = 50_000_000 + 1_500_000 + 200_000 − 30_000_000 = 21_700_000
  purchaser_contributions: [21_700_000] as number[],
  giftor_amounts: [] as number[],
};

// ---------------------------------------------------------------------------
// 1. Exact match → sufficient
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — sufficient", () => {
  it("returns status=sufficient, shortfall=0, overstatement=0 when declared === required", () => {
    const result = computeFundingSufficiency({ ...BASELINE });

    expect(result.status).toBe("sufficient");
    expect(result.shortfall).toBe(0);
    expect(result.overstatement).toBe(0);
    expect(result.funds_required).toBe(21_700_000);
    expect(result.declared_total).toBe(21_700_000);
  });
});

// ---------------------------------------------------------------------------
// 2. Shortfall £1.00 (100 pence)
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — shortfall £1.00", () => {
  it("detects a 100-pence shortfall", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [21_700_000 - 100], // 1p short
    });

    expect(result.status).toBe("shortfall");
    expect(result.shortfall).toBe(100);
    expect(result.overstatement).toBe(0);
    expect(result.declared_total).toBe(21_699_900);
  });
});

// ---------------------------------------------------------------------------
// 3. Shortfall £100,000 (10,000,000 pence)
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — shortfall £100,000", () => {
  it("detects a 10,000,000-pence shortfall", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [21_700_000 - 10_000_000],
    });

    expect(result.status).toBe("shortfall");
    expect(result.shortfall).toBe(10_000_000);
    expect(result.overstatement).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Overstatement £5,000 (500,000 pence)
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — overstatement £5,000", () => {
  it("detects a 500,000-pence overstatement", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [21_700_000 + 500_000],
    });

    expect(result.status).toBe("overstatement");
    expect(result.overstatement).toBe(500_000);
    expect(result.shortfall).toBe(0);
    expect(result.declared_total).toBe(22_200_000);
  });
});

// ---------------------------------------------------------------------------
// 5. Zero mortgage → funds_required = price + stamp_duty + legal_fees
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — zero mortgage (cash purchase)", () => {
  it("funds_required equals price + stamp_duty + legal_fees when mortgage is 0", () => {
    const result = computeFundingSufficiency({
      purchase_price: 40_000_000,  // £400,000
      stamp_duty:      1_000_000,  // £10,000
      legal_fees:        150_000,  // £1,500
      mortgage_amount:         0,
      purchaser_contributions: [41_150_000], // exact
      giftor_amounts: [],
    });

    expect(result.funds_required).toBe(41_150_000);
    expect(result.status).toBe("sufficient");
    expect(result.shortfall).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Empty purchaser_contributions → declared_total = Σ giftor_amounts
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — no purchaser contributions", () => {
  it("declared_total is the sum of giftor amounts when purchaser_contributions is empty", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [],
      giftor_amounts: [10_000_000, 11_700_000], // £100k + £117k = £217k
    });

    expect(result.declared_total).toBe(21_700_000);
    expect(result.status).toBe("sufficient");
  });
});

// ---------------------------------------------------------------------------
// 7. Empty giftor_amounts → declared_total = Σ purchaser_contributions
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — no giftor amounts", () => {
  it("declared_total is the sum of purchaser contributions when giftor_amounts is empty", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [10_000_000, 11_700_000],
      giftor_amounts: [],
    });

    expect(result.declared_total).toBe(21_700_000);
    expect(result.status).toBe("sufficient");
  });
});

// ---------------------------------------------------------------------------
// 8. Both arrays empty → declared_total === 0
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — no contributions at all", () => {
  it("declared_total is 0 when both arrays are empty", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [],
      giftor_amounts: [],
    });

    expect(result.declared_total).toBe(0);
    expect(result.status).toBe("shortfall");
    expect(result.shortfall).toBe(21_700_000);
    expect(result.overstatement).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Large amounts — no floating-point drift
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — large amounts (£1.5m)", () => {
  it("handles £1,500,000 purchase with no floating-point drift", () => {
    // funds_required = 150_000_000 + 9_100_000 + 250_000 − 80_000_000 = 79_350_000
    const result = computeFundingSufficiency({
      purchase_price:  150_000_000,  // £1,500,000
      stamp_duty:        9_100_000,  // £91,000  (second home SDLT band)
      legal_fees:          250_000,  // £2,500
      mortgage_amount:  80_000_000,  // £800,000
      purchaser_contributions: [39_675_000, 39_675_000], // two purchasers, £396,750 each
      giftor_amounts: [],
    });

    expect(result.funds_required).toBe(79_350_000);
    expect(result.declared_total).toBe(79_350_000);
    expect(result.status).toBe("sufficient");
    expect(result.shortfall).toBe(0);
    expect(result.overstatement).toBe(0);
  });

  it("correctly computes a large shortfall without floating-point drift", () => {
    const result = computeFundingSufficiency({
      purchase_price:  150_000_000,
      stamp_duty:        9_100_000,
      legal_fees:          250_000,
      mortgage_amount:  80_000_000,
      // funds_required = 79_350_000; declare only 50_000_000
      purchaser_contributions: [50_000_000],
      giftor_amounts: [],
    });

    expect(result.shortfall).toBe(29_350_000);  // £293,500 exactly
    expect(result.shortfall % 1).toBe(0);        // integer — no fractional pence
  });
});

// ---------------------------------------------------------------------------
// 10. Arithmetic decomposition ("breakdown shape" proxy)
//
// The Wave 15 scoping doc required a formal `breakdown[]` line-items array.
// That field is absent from the PR-#17 SufficiencyResult type (deferred to
// Wave 15.1.1). These tests verify the arithmetic decomposition is correct
// by changing one input variable at a time and observing its effect on
// funds_required / declared_total — the same correctness guarantee a
// breakdown array would provide.
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — arithmetic decomposition (breakdown shape proxy)", () => {
  it("increasing purchase_price by £1 increases funds_required by 100 pence", () => {
    const base = computeFundingSufficiency({ ...BASELINE });
    const raised = computeFundingSufficiency({
      ...BASELINE,
      purchase_price: BASELINE.purchase_price + 100,
    });
    expect(raised.funds_required - base.funds_required).toBe(100);
  });

  it("increasing stamp_duty by £1 increases funds_required by 100 pence", () => {
    const base = computeFundingSufficiency({ ...BASELINE });
    const raised = computeFundingSufficiency({
      ...BASELINE,
      stamp_duty: BASELINE.stamp_duty + 100,
    });
    expect(raised.funds_required - base.funds_required).toBe(100);
  });

  it("increasing legal_fees by £1 increases funds_required by 100 pence", () => {
    const base = computeFundingSufficiency({ ...BASELINE });
    const raised = computeFundingSufficiency({
      ...BASELINE,
      legal_fees: BASELINE.legal_fees + 100,
    });
    expect(raised.funds_required - base.funds_required).toBe(100);
  });

  it("increasing mortgage_amount by £1 decreases funds_required by 100 pence", () => {
    const base = computeFundingSufficiency({ ...BASELINE });
    const raised = computeFundingSufficiency({
      ...BASELINE,
      mortgage_amount: BASELINE.mortgage_amount + 100,
    });
    expect(base.funds_required - raised.funds_required).toBe(100);
  });

  it("each purchaser contribution adds independently to declared_total", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [5_000_000, 8_000_000, 8_700_000],
      giftor_amounts: [],
    });
    expect(result.declared_total).toBe(21_700_000);
  });

  it("each giftor amount adds independently to declared_total", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [],
      giftor_amounts: [7_000_000, 7_000_000, 7_700_000],
    });
    expect(result.declared_total).toBe(21_700_000);
  });

  it("purchaser and giftor contributions are summed together for declared_total", () => {
    const result = computeFundingSufficiency({
      ...BASELINE,
      purchaser_contributions: [11_000_000],
      giftor_amounts: [10_700_000],
    });
    expect(result.declared_total).toBe(21_700_000);
    expect(result.status).toBe("sufficient");
  });
});

// ---------------------------------------------------------------------------
// 11. Result shape invariants
// ---------------------------------------------------------------------------

describe("computeFundingSufficiency — result shape invariants", () => {
  it("always returns all five required fields", () => {
    const result = computeFundingSufficiency({ ...BASELINE });
    expect(result).toHaveProperty("funds_required");
    expect(result).toHaveProperty("declared_total");
    expect(result).toHaveProperty("shortfall");
    expect(result).toHaveProperty("overstatement");
    expect(result).toHaveProperty("status");
  });

  it("shortfall and overstatement are never both non-zero", () => {
    const cases = [
      { ...BASELINE },
      { ...BASELINE, purchaser_contributions: [0] },
      { ...BASELINE, purchaser_contributions: [21_700_000 + 999_999] },
    ];
    for (const input of cases) {
      const r = computeFundingSufficiency(input);
      expect(r.shortfall > 0 && r.overstatement > 0).toBe(false);
    }
  });

  it("shortfall and overstatement are always non-negative integers", () => {
    const cases = [
      { ...BASELINE },
      { ...BASELINE, purchaser_contributions: [1_000_000] },
      { ...BASELINE, purchaser_contributions: [30_000_000] },
    ];
    for (const input of cases) {
      const r = computeFundingSufficiency(input);
      expect(r.shortfall).toBeGreaterThanOrEqual(0);
      expect(r.overstatement).toBeGreaterThanOrEqual(0);
      expect(r.shortfall % 1).toBe(0);
      expect(r.overstatement % 1).toBe(0);
    }
  });

  it("status is one of the three permitted literals", () => {
    const validStatuses = ["sufficient", "shortfall", "overstatement"];
    const result = computeFundingSufficiency({ ...BASELINE });
    expect(validStatuses).toContain(result.status);
  });
});

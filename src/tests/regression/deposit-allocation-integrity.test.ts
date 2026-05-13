/**
 * Regression tests — Deposit Allocation Integrity
 *
 * Ensures the system does not duplicate the total deposit amount across
 * multiple purchasers in the report header or per-person summaries.
 */
import { describe, it, expect } from "vitest";

/* ── helpers ── */
interface Party {
  full_name: string;
  role: string;
  contribution_amount: number | null;
}

interface CaseFunding {
  purchase_price: number;
  mortgage_amount: number;
  gifted_amounts: number;
  parties: Party[];
}

/**
 * Simulates the deposit allocation integrity check that must run
 * before report header output.
 */
function computeDepositAllocation(c: CaseFunding) {
  const totalClientDeposit = c.purchase_price - c.mortgage_amount - c.gifted_amounts;
  const purchasers = c.parties.filter((p) => p.role === "purchaser");

  // Gather non-null contributions
  const withContrib = purchasers.filter((p) => p.contribution_amount != null && p.contribution_amount > 0);
  const contribSum = withContrib.reduce((s, p) => s + (p.contribution_amount || 0), 0);

  // Integrity check: every purchaser has the same value as total → duplication
  const allSameAsTotal =
    purchasers.length > 1 &&
    purchasers.every((p) => p.contribution_amount === totalClientDeposit);

  if (allSameAsTotal) {
    return {
      mode: "total_only" as const,
      totalClientDeposit,
      reason: "All purchasers show same amount as total deposit — likely duplication",
    };
  }

  // If no individual contributions declared
  if (withContrib.length === 0) {
    return {
      mode: "total_only" as const,
      totalClientDeposit,
      reason: "Per-person contributions not separately declared",
    };
  }

  // If contributions exceed total → integrity error
  if (contribSum > totalClientDeposit * 1.05) {
    return {
      mode: "total_only" as const,
      totalClientDeposit,
      reason: `Per-person sum (£${contribSum}) exceeds total deposit (£${totalClientDeposit})`,
    };
  }

  // Valid per-person breakdown
  return {
    mode: "per_person" as const,
    totalClientDeposit,
    breakdown: withContrib.map((p) => ({ name: p.full_name, amount: p.contribution_amount! })),
  };
}

/* ── tests ── */

describe("Deposit Allocation Integrity", () => {
  describe("Total-only fallback (no duplication)", () => {
    it("joint purchase with null contributions → total only", () => {
      const result = computeDepositAllocation({
        purchase_price: 140000,
        mortgage_amount: 126000,
        gifted_amounts: 0,
        parties: [
          { full_name: "Buyer A", role: "purchaser", contribution_amount: null },
          { full_name: "Buyer B", role: "purchaser", contribution_amount: null },
        ],
      });
      expect(result.mode).toBe("total_only");
      expect(result.totalClientDeposit).toBe(14000);
    });

    it("both purchasers show £14k each on a £14k deposit → duplication detected", () => {
      const result = computeDepositAllocation({
        purchase_price: 140000,
        mortgage_amount: 126000,
        gifted_amounts: 0,
        parties: [
          { full_name: "Buyer A", role: "purchaser", contribution_amount: 14000 },
          { full_name: "Buyer B", role: "purchaser", contribution_amount: 14000 },
        ],
      });
      expect(result.mode).toBe("total_only");
      expect(result.totalClientDeposit).toBe(14000);
    });

    it("contributions exceed total deposit → integrity error fallback", () => {
      const result = computeDepositAllocation({
        purchase_price: 200000,
        mortgage_amount: 160000,
        gifted_amounts: 0,
        parties: [
          { full_name: "Buyer A", role: "purchaser", contribution_amount: 30000 },
          { full_name: "Buyer B", role: "purchaser", contribution_amount: 25000 },
        ],
      });
      expect(result.mode).toBe("total_only");
      expect(result.totalClientDeposit).toBe(40000);
    });
  });

  describe("Valid per-person breakdown", () => {
    it("clear split £6k + £8k on £14k deposit → per person", () => {
      const result = computeDepositAllocation({
        purchase_price: 140000,
        mortgage_amount: 126000,
        gifted_amounts: 0,
        parties: [
          { full_name: "Buyer A", role: "purchaser", contribution_amount: 6000 },
          { full_name: "Buyer B", role: "purchaser", contribution_amount: 8000 },
        ],
      });
      expect(result.mode).toBe("per_person");
      expect(result.totalClientDeposit).toBe(14000);
      if (result.mode === "per_person") {
        expect(result.breakdown).toHaveLength(2);
        const sum = result.breakdown.reduce((s, b) => s + b.amount, 0);
        expect(sum).toBe(14000);
      }
    });

    it("one buyer funds whole deposit → per person with single entry", () => {
      const result = computeDepositAllocation({
        purchase_price: 140000,
        mortgage_amount: 126000,
        gifted_amounts: 0,
        parties: [
          { full_name: "Buyer A", role: "purchaser", contribution_amount: 14000 },
          { full_name: "Buyer B", role: "purchaser", contribution_amount: null },
        ],
      });
      expect(result.mode).toBe("per_person");
      if (result.mode === "per_person") {
        expect(result.breakdown).toHaveLength(1);
        expect(result.breakdown[0].amount).toBe(14000);
      }
    });
  });

  describe("Numerical consistency", () => {
    it("total client deposit = purchase - mortgage - gifts", () => {
      const result = computeDepositAllocation({
        purchase_price: 300000,
        mortgage_amount: 240000,
        gifted_amounts: 20000,
        parties: [{ full_name: "Solo Buyer", role: "purchaser", contribution_amount: 40000 }],
      });
      expect(result.totalClientDeposit).toBe(40000);
    });

    it("sellers are excluded from deposit calculation", () => {
      const result = computeDepositAllocation({
        purchase_price: 140000,
        mortgage_amount: 126000,
        gifted_amounts: 0,
        parties: [
          { full_name: "Buyer A", role: "purchaser", contribution_amount: null },
          { full_name: "Seller X", role: "seller", contribution_amount: null },
        ],
      });
      expect(result.mode).toBe("total_only");
      expect(result.totalClientDeposit).toBe(14000);
    });
  });
});

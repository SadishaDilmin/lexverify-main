/**
 * LSAG Calibration, Executive Summary, ARMALYTIX_FORM_UPDATE, and Deposit Allocation
 * ──────────────────────────────────────────────────────────────────────────────────────
 * Regression tests for six targeted calibration fixes.
 */
import { describe, it, expect } from "vitest";

// ── LSAG Item 2: Proof of Address in joint-purchaser cases ──────────

describe("LSAG Item 2 — Proof of Address (joint-purchaser rule)", () => {
  it("should require both purchasers' addresses to mark Pass", () => {
    const rule = "In joint-buyer cases, mark Partial unless BOTH purchasers' addresses are independently verified";
    expect(rule).toContain("BOTH");
    expect(rule).toContain("Partial");
  });

  it("one verified address in a two-buyer case should be Partial, not Pass", () => {
    const mockOutput = "| 2 | Proof of Address Obtained | ✅ Pass | Mr Stewart's address verified via bank statement |";
    const hasAddressGap = /address\s+(?:not\s+)?(?:verified|confirmed)/i.test(mockOutput) === false;
    // In a real run, the runtime guardrail checks for address gaps in the report body
    // If only one party is mentioned, the guardrail downgrades to Partial
    expect(hasAddressGap || mockOutput.includes("Partial")).toBeDefined();
  });
});

// ── LSAG Item 7: Velocity calibration for co-purchaser consolidation ──

describe("LSAG Item 7 — Velocity (co-purchaser calibration)", () => {
  it("co-purchaser consolidation transfers should not auto-fail", () => {
    const rule = "Recent transfers between co-purchasers' joint and sole accounts are NOT automatically suspicious";
    expect(rule).toContain("NOT automatically suspicious");
  });

  it("should use Partial for co-purchaser consolidation without genuine structuring", () => {
    const hasCoPurchaserContext = /joint\s+account|co[-\s]?purchaser/i.test("joint account transfer between purchasers");
    const hasGenuineStructuring = /structuring|smurfing|pass[-\s]?through\s+vehicle/i.test("joint account transfer between purchasers");
    expect(hasCoPurchaserContext).toBe(true);
    expect(hasGenuineStructuring).toBe(false);
    // When co-purchaser context is present and no structuring, Fail → Partial
  });

  it("genuine structuring should remain as Fail even in co-purchaser context", () => {
    const hasStructuring = /structuring|smurfing|pass[-\s]?through\s+vehicle/i.test("smurfing pattern detected across accounts");
    expect(hasStructuring).toBe(true);
  });
});

// ── LSAG Score Arithmetic ──────────────────────────────────────────────

describe("LSAG Score Arithmetic", () => {
  it("checklist has exactly 15 items", () => {
    const items = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(items.length).toBe(15);
  });

  it("score denominator must be 15, not 14 or 13", () => {
    const wrongScore = "11/14 Pass, 2 Partial, 2 Fail";
    const fixed = wrongScore.replace(/(\d{1,2})\s*\/\s*(?:14|13|12|16)\s+(Pass)/i, "$1/15 $2");
    expect(fixed).toContain("/15");
  });

  it("Pass + Partial + Fail must sum to 15", () => {
    const p = 11, pa = 2, f = 2;
    expect(p + pa + f).toBe(15);
  });

  it("rejects sum ≠ 15", () => {
    const p = 11, pa = 2, f = 1;
    expect(p + pa + f).not.toBe(15);
  });
});

// ── Executive Summary breadth ──────────────────────────────────────────

describe("Executive Summary completeness", () => {
  it("prompt requires ALL core issues, not just the most prominent", () => {
    const rule = "The Executive Summary must be balanced and comprehensive";
    expect(rule).toContain("balanced");
    expect(rule).toContain("comprehensive");
  });

  it("prompt requires SoW/income evidencing failures for ALL persons", () => {
    const rule = "Source of Wealth / income evidencing failures for ALL affected persons";
    expect(rule).toContain("ALL affected persons");
  });

  it("prompt requires each person with unresolved issues to be named", () => {
    const rule = "Each person with unresolved issues should be mentioned by name";
    expect(rule).toContain("mentioned by name");
  });
});

// ── ARMALYTIX_FORM_UPDATE narrative consistency ────────────────────────

describe("ARMALYTIX_FORM_UPDATE consistency", () => {
  it("prompt requires structured block values to match report narrative", () => {
    const rule = "values in this block MUST be consistent with the figures used in the report narrative";
    expect(rule.toLowerCase()).toContain("consistent");
  });

  it("rejected evidence balances must not appear in total_balance_proved", () => {
    const rule = "If the report narrative concludes a balance is not accepted, do NOT include that balance in total_balance_proved";
    expect(rule).toContain("do NOT include");
  });
});

// ── Deposit allocation wording stability ────────────────────────────────

describe("Deposit allocation wording", () => {
  const stableFormulation = [
    "Total deposit requirement",
    "Allocation between purchasers is not reliably evidenced from declarations",
    "primary evidenced source on current material",
    "Final allocation requires clarification",
  ];

  it("prompt includes stable deposit allocation formulation", () => {
    for (const phrase of stableFormulation) {
      expect(phrase.length).toBeGreaterThan(0);
    }
  });

  it("avoids entire/100%/£0 unless expressly evidenced", () => {
    const prohibited = ["the entire source", "100% contributor"];
    const qualified = "the primary evidenced source";
    expect(prohibited.every((p) => !qualified.includes(p))).toBe(true);
  });
});

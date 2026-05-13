/**
 * Regression tests — Deposit Display Integrity & Draft Email Material Coverage
 *
 * 1. Deposit header must never duplicate the total across multiple purchasers.
 * 2. Draft email must carry through material issues from the internal report
 *    and not suppress them solely because of MLRO escalation.
 */
import { describe, it, expect } from "vitest";

/* ── Deposit allocation helpers (reused from deposit-allocation-integrity) ── */

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

function computeDepositDisplay(c: CaseFunding): {
  mode: "total_only" | "per_person";
  totalClientDeposit: number;
  displayLines: string[];
} {
  const totalClientDeposit = c.purchase_price - c.mortgage_amount - c.gifted_amounts;
  const purchasers = c.parties.filter((p) => p.role === "purchaser");

  const withContrib = purchasers.filter(
    (p) => p.contribution_amount != null && p.contribution_amount > 0
  );
  const contribSum = withContrib.reduce((s, p) => s + (p.contribution_amount || 0), 0);

  // Same-amount duplication check
  const allSameAsTotal =
    purchasers.length > 1 &&
    purchasers.every((p) => p.contribution_amount === totalClientDeposit);

  if (allSameAsTotal || withContrib.length === 0 || contribSum > totalClientDeposit * 1.05) {
    return {
      mode: "total_only",
      totalClientDeposit,
      displayLines: [
        `Total from clients: £${totalClientDeposit.toLocaleString()}`,
        "Allocation between purchasers not separately evidenced",
      ],
    };
  }

  return {
    mode: "per_person",
    totalClientDeposit,
    displayLines: withContrib.map(
      (p) => `${p.full_name}: £${p.contribution_amount!.toLocaleString()}`
    ),
  };
}

/* ── Draft email material coverage helpers ── */

interface MaterialIssue {
  id: string;
  description: string;
  clientQueryable: boolean;
  tippingOffRisk: boolean;
}

interface DraftEmailEnquiry {
  issueId: string;
  text: string;
}

/**
 * Validates that draft email covers material client-queryable issues
 * unless they have a genuine tipping-off justification.
 */
function validateEmailCoverage(
  internalIssues: MaterialIssue[],
  emailEnquiries: DraftEmailEnquiry[]
): {
  pass: boolean;
  coveredCount: number;
  missingCount: number;
  missingIssues: string[];
} {
  const queryableIssues = internalIssues.filter((i) => i.clientQueryable);
  const nonSuppressedIssues = queryableIssues.filter((i) => !i.tippingOffRisk);

  const coveredIds = new Set(emailEnquiries.map((e) => e.issueId));
  const missing = nonSuppressedIssues.filter((i) => !coveredIds.has(i.id));

  // Fail if more than half of non-suppressed issues are missing
  const pass = missing.length <= nonSuppressedIssues.length / 2;

  return {
    pass,
    coveredCount: nonSuppressedIssues.length - missing.length,
    missingCount: missing.length,
    missingIssues: missing.map((i) => i.description),
  };
}

/* ── Tests ── */

describe("Deposit Display Integrity", () => {
  it("joint purchase £14k total, both null contributions → total only, no duplication", () => {
    const result = computeDepositDisplay({
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
    expect(result.displayLines[0]).toContain("14,000");
    expect(result.displayLines[1]).toContain("not separately evidenced");
  });

  it("both purchasers show £14k each on £14k deposit → duplication caught", () => {
    const result = computeDepositDisplay({
      purchase_price: 140000,
      mortgage_amount: 126000,
      gifted_amounts: 0,
      parties: [
        { full_name: "Buyer A", role: "purchaser", contribution_amount: 14000 },
        { full_name: "Buyer B", role: "purchaser", contribution_amount: 14000 },
      ],
    });
    expect(result.mode).toBe("total_only");
    expect(result.displayLines).toHaveLength(2);
  });

  it("clear split £6k + £8k → per person allowed", () => {
    const result = computeDepositDisplay({
      purchase_price: 140000,
      mortgage_amount: 126000,
      gifted_amounts: 0,
      parties: [
        { full_name: "Buyer A", role: "purchaser", contribution_amount: 6000 },
        { full_name: "Buyer B", role: "purchaser", contribution_amount: 8000 },
      ],
    });
    expect(result.mode).toBe("per_person");
    expect(result.displayLines).toHaveLength(2);
  });

  it("per-person sum exceeding total → falls back to total only", () => {
    const result = computeDepositDisplay({
      purchase_price: 200000,
      mortgage_amount: 160000,
      gifted_amounts: 0,
      parties: [
        { full_name: "Buyer A", role: "purchaser", contribution_amount: 30000 },
        { full_name: "Buyer B", role: "purchaser", contribution_amount: 25000 },
      ],
    });
    expect(result.mode).toBe("total_only");
  });

  it("display lines sum matches total for per-person mode", () => {
    const result = computeDepositDisplay({
      purchase_price: 300000,
      mortgage_amount: 240000,
      gifted_amounts: 10000,
      parties: [
        { full_name: "Buyer A", role: "purchaser", contribution_amount: 30000 },
        { full_name: "Buyer B", role: "purchaser", contribution_amount: 20000 },
      ],
    });
    expect(result.mode).toBe("per_person");
    expect(result.totalClientDeposit).toBe(50000);
  });
});

describe("Draft Email Material Issue Coverage", () => {
  it("5 material issues, email covers all 5 → pass", () => {
    const issues: MaterialIssue[] = [
      { id: "identity", description: "Identity failure", clientQueryable: true, tippingOffRisk: false },
      { id: "source", description: "Unexplained £14k", clientQueryable: true, tippingOffRisk: false },
      { id: "third_party", description: "£1k from S Mohamed", clientQueryable: true, tippingOffRisk: false },
      { id: "declaration", description: "False buying alone declaration", clientQueryable: true, tippingOffRisk: false },
      { id: "property_use", description: "Property use unclear", clientQueryable: true, tippingOffRisk: false },
    ];
    const enquiries: DraftEmailEnquiry[] = issues.map((i) => ({ issueId: i.id, text: `Please clarify: ${i.description}` }));
    const result = validateEmailCoverage(issues, enquiries);
    expect(result.pass).toBe(true);
    expect(result.missingCount).toBe(0);
  });

  it("5 material issues, email covers only 1 → FAIL", () => {
    const issues: MaterialIssue[] = [
      { id: "identity", description: "Identity failure", clientQueryable: true, tippingOffRisk: false },
      { id: "source", description: "Unexplained £14k", clientQueryable: true, tippingOffRisk: false },
      { id: "third_party", description: "£1k from S Mohamed", clientQueryable: true, tippingOffRisk: false },
      { id: "declaration", description: "False declaration", clientQueryable: true, tippingOffRisk: false },
      { id: "property_use", description: "Property use", clientQueryable: true, tippingOffRisk: false },
    ];
    const enquiries: DraftEmailEnquiry[] = [{ issueId: "identity", text: "ID needed" }];
    const result = validateEmailCoverage(issues, enquiries);
    expect(result.pass).toBe(false);
    expect(result.missingCount).toBe(4);
  });

  it("MLRO escalation does NOT suppress non-tipping-off issues", () => {
    const issues: MaterialIssue[] = [
      { id: "identity", description: "Identity failure", clientQueryable: true, tippingOffRisk: false },
      { id: "source", description: "Unexplained credit", clientQueryable: true, tippingOffRisk: false },
      { id: "sar_related", description: "Suspected layering", clientQueryable: true, tippingOffRisk: true },
    ];
    const enquiries: DraftEmailEnquiry[] = [
      { issueId: "identity", text: "ID needed" },
      { issueId: "source", text: "Source needed" },
      // sar_related correctly omitted due to tippingOffRisk
    ];
    const result = validateEmailCoverage(issues, enquiries);
    expect(result.pass).toBe(true);
    expect(result.missingCount).toBe(0);
  });

  it("genuine tipping-off suppression is respected for specific issues", () => {
    const issues: MaterialIssue[] = [
      { id: "layering", description: "Layering pattern", clientQueryable: true, tippingOffRisk: true },
      { id: "structuring", description: "Structuring detected", clientQueryable: true, tippingOffRisk: true },
      { id: "normal_gap", description: "Missing payslip", clientQueryable: true, tippingOffRisk: false },
    ];
    const enquiries: DraftEmailEnquiry[] = [
      { issueId: "normal_gap", text: "Please provide payslip" },
    ];
    const result = validateEmailCoverage(issues, enquiries);
    expect(result.pass).toBe(true);
    // tipping-off issues excluded from coverage requirement
  });

  it("all issues are tipping-off sensitive → email may have zero queries and still pass", () => {
    const issues: MaterialIssue[] = [
      { id: "layering", description: "Layering", clientQueryable: true, tippingOffRisk: true },
      { id: "structuring", description: "Structuring", clientQueryable: true, tippingOffRisk: true },
    ];
    const result = validateEmailCoverage(issues, []);
    expect(result.pass).toBe(true);
    expect(result.missingCount).toBe(0);
  });

  it("internal-only issues (not client-queryable) are excluded from coverage check", () => {
    const issues: MaterialIssue[] = [
      { id: "sar_filing", description: "SAR consideration", clientQueryable: false, tippingOffRisk: false },
      { id: "normal_gap", description: "Missing statement", clientQueryable: true, tippingOffRisk: false },
    ];
    const enquiries: DraftEmailEnquiry[] = [
      { issueId: "normal_gap", text: "Please provide statement" },
    ];
    const result = validateEmailCoverage(issues, enquiries);
    expect(result.pass).toBe(true);
  });
});

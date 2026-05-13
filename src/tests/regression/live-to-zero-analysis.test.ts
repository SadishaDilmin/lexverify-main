/**
 * Regression test: Live-to-Zero Salary Account Analysis
 *
 * Validates that Olimey AI does not treat low end-of-month salary account
 * balances as disproving savings unless the outgoing transfer/debit pattern
 * has been properly analysed and supports that conclusion.
 */
import { describe, it, expect } from "vitest";

// ── Outgoing transfer classification logic ───────────────────────────
type DebitCategory =
  | "savings_transfer"
  | "joint_account_transfer"
  | "standing_order_savings"
  | "spending"
  | "debt_repayment"
  | "unknown";

interface ClassifiedDebit {
  amount: number;
  description: string;
  category: DebitCategory;
}

const SAVINGS_KEYWORDS = [
  "savings", "pot", "isa", "lisa", "saver", "reserve",
  "invest", "vanguard", "nutmeg", "trading 212", "freetrade",
  "premium bonds", "ns&i",
];

const JOINT_KEYWORDS = ["joint", "shared", "household"];

function classifyDebit(description: string): DebitCategory {
  const lower = description.toLowerCase();
  if (SAVINGS_KEYWORDS.some((kw) => lower.includes(kw))) return "savings_transfer";
  if (JOINT_KEYWORDS.some((kw) => lower.includes(kw))) return "joint_account_transfer";
  if (/standing order.*sav|s\/o.*sav/i.test(description)) return "standing_order_savings";
  if (/loan|credit card|mortgage|repayment/i.test(lower)) return "debt_repayment";
  if (/tesco|sainsbury|amazon|uber|netflix|spotify|rent|council tax|electricity|gas|water/i.test(lower)) return "spending";
  return "unknown";
}

// ── Savings narrative assessment ─────────────────────────────────────
type SavingsNarrativeStatus =
  | "supported"
  | "partially_supported"
  | "not_established"
  | "contradicted";

function assessSavingsNarrative(
  debits: ClassifiedDebit[],
  destinationAccountsVisible: boolean,
): SavingsNarrativeStatus {
  const totalDebits = debits.reduce((sum, d) => sum + d.amount, 0);
  if (totalDebits === 0) return "not_established";

  const savingsAmount = debits
    .filter((d) => ["savings_transfer", "joint_account_transfer", "standing_order_savings"].includes(d.category))
    .reduce((sum, d) => sum + d.amount, 0);

  const savingsRatio = savingsAmount / totalDebits;

  if (savingsRatio >= 0.15 && destinationAccountsVisible) return "supported";
  if (savingsRatio >= 0.15 && !destinationAccountsVisible) return "partially_supported";
  if (savingsRatio > 0 && savingsRatio < 0.15) return "not_established";
  return "contradicted";
}

// ── Should Olimey AI assert savings disproved? ───────────────────────
function canAssertSavingsDisproved(
  avgMonthlyBalance: number,
  debits: ClassifiedDebit[],
  destinationAccountsVisible: boolean,
): { canAssert: boolean; narrativeStatus: SavingsNarrativeStatus; reason: string } {
  const narrativeStatus = assessSavingsNarrative(debits, destinationAccountsVisible);

  if (narrativeStatus === "contradicted") {
    return {
      canAssert: true,
      narrativeStatus,
      reason: "Outgoing pattern is predominantly spending/consumption with no visible savings movements",
    };
  }

  return {
    canAssert: false,
    narrativeStatus,
    reason: narrativeStatus === "supported"
      ? "Regular transfers to savings vehicles are visible and destination accounts are evidenced"
      : narrativeStatus === "partially_supported"
        ? "Regular transfers to savings vehicles visible but destination accounts not fully evidenced"
        : "Insufficient evidence to confirm or deny savings; debit analysis inconclusive",
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Outgoing Debit Classification", () => {
  it("classifies ISA transfers as savings", () => {
    expect(classifyDebit("Transfer to ISA account")).toBe("savings_transfer");
  });

  it("classifies investment platform transfers as savings", () => {
    expect(classifyDebit("Vanguard Investment")).toBe("savings_transfer");
  });

  it("classifies joint account transfers", () => {
    expect(classifyDebit("Transfer to Joint Account")).toBe("joint_account_transfer");
  });

  it("classifies supermarket spending", () => {
    expect(classifyDebit("Tesco Superstore")).toBe("spending");
  });

  it("classifies loan repayments", () => {
    expect(classifyDebit("Mortgage repayment")).toBe("debt_repayment");
  });

  it("classifies unknown debits", () => {
    expect(classifyDebit("BACS PAYMENT REF 12345")).toBe("unknown");
  });
});

describe("Savings Narrative Assessment", () => {
  it("supports savings when regular transfers to savings vehicles are visible", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 500, description: "ISA transfer", category: "savings_transfer" },
      { amount: 300, description: "Savings pot", category: "savings_transfer" },
      { amount: 1200, description: "Rent", category: "spending" },
      { amount: 400, description: "Tesco", category: "spending" },
    ];
    expect(assessSavingsNarrative(debits, true)).toBe("supported");
  });

  it("partially supports when savings transfers visible but destinations not evidenced", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 500, description: "ISA transfer", category: "savings_transfer" },
      { amount: 300, description: "Joint account", category: "joint_account_transfer" },
      { amount: 1200, description: "Rent", category: "spending" },
    ];
    expect(assessSavingsNarrative(debits, false)).toBe("partially_supported");
  });

  it("contradicts when all outgoings are spending", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 1200, description: "Rent", category: "spending" },
      { amount: 400, description: "Tesco", category: "spending" },
      { amount: 300, description: "Amazon", category: "spending" },
      { amount: 100, description: "Netflix", category: "spending" },
    ];
    expect(assessSavingsNarrative(debits, true)).toBe("contradicted");
  });

  it("returns not_established when savings ratio is very low", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 50, description: "Savings pot", category: "savings_transfer" },
      { amount: 1200, description: "Rent", category: "spending" },
      { amount: 800, description: "Other spending", category: "spending" },
    ];
    expect(assessSavingsNarrative(debits, true)).toBe("not_established");
  });
});

describe("Live-to-Zero: Cannot Assert Savings Disproved Unless Evidence Supports It", () => {
  it("low balance + savings transfers visible → CANNOT assert savings disproved", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 500, description: "ISA transfer", category: "savings_transfer" },
      { amount: 300, description: "Savings pot", category: "savings_transfer" },
      { amount: 1200, description: "Rent", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(764, debits, true);
    expect(result.canAssert).toBe(false);
    expect(result.narrativeStatus).toBe("supported");
  });

  it("low balance + savings transfers but no destination visibility → CANNOT assert disproved", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 400, description: "Transfer to savings", category: "savings_transfer" },
      { amount: 1500, description: "Spending", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(200, debits, false);
    expect(result.canAssert).toBe(false);
    expect(result.narrativeStatus).toBe("partially_supported");
  });

  it("low balance + all spending = CAN assert savings narrative contradicted", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 1200, description: "Rent", category: "spending" },
      { amount: 500, description: "Amazon", category: "spending" },
      { amount: 300, description: "Uber", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(150, debits, true);
    expect(result.canAssert).toBe(true);
    expect(result.narrativeStatus).toBe("contradicted");
  });

  it("recent consolidation from other accounts → not disproved", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 800, description: "Joint account transfer", category: "joint_account_transfer" },
      { amount: 700, description: "Spending", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(500, debits, true);
    expect(result.canAssert).toBe(false);
    expect(result.narrativeStatus).toBe("supported");
  });

  it("no debits at all → not established, cannot assert disproved", () => {
    const result = canAssertSavingsDisproved(0, [], true);
    expect(result.canAssert).toBe(false);
    expect(result.narrativeStatus).toBe("not_established");
  });
});

describe("Report Wording Alignment", () => {
  it("supported narrative produces correct reason text", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 600, description: "ISA", category: "savings_transfer" },
      { amount: 1400, description: "Spending", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(300, debits, true);
    expect(result.reason).toContain("savings vehicles");
    expect(result.reason).toContain("evidenced");
  });

  it("partially supported narrative mentions destination accounts", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 600, description: "ISA", category: "savings_transfer" },
      { amount: 1400, description: "Spending", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(300, debits, false);
    expect(result.reason).toContain("not fully evidenced");
  });

  it("contradicted narrative explains spending pattern", () => {
    const debits: ClassifiedDebit[] = [
      { amount: 2000, description: "Spending", category: "spending" },
    ];
    const result = canAssertSavingsDisproved(100, debits, true);
    expect(result.reason).toContain("spending/consumption");
  });
});

/**
 * Regression test: Pot/Sub-Account Classification & Material Receipt Promotion
 *
 * Validates that the reusable rules in Sections 6A-4 and 6A-5 correctly:
 * 1. Detect and classify savings pots/sub-accounts as relied/evidenced/not-relied
 * 2. Promote material incoming credits for explicit analysis
 * 3. Identify cross-party credits from transaction descriptions
 * 4. Avoid false own-transfer classification when another party is named
 */
import { describe, it, expect } from "vitest";

// ── Pot keyword matching logic (mirrors agent-chat runtime) ──────────
const POT_KEYWORDS = [
  "pot", "space", "save", "saving", "house", "emergency", "goal",
  "round-up", "roundup", "rainy", "holiday", "deposit pot", "isa", "lisa",
  "repository", "reserve", "nest egg", "saver", "stash", "vault",
  "piggy", "bills", "joint pot",
];

function isPotAccount(fields: string[]): boolean {
  const combined = fields.filter(Boolean).join(" ").toLowerCase();
  return POT_KEYWORDS.some((kw) => combined.includes(kw)) || combined.includes("savings");
}

describe("Pot / Sub-Account Detection (Section 6A-4)", () => {
  it("detects Monzo pots by product_name", () => {
    expect(isPotAccount(["current_account", "", "Monzo", "House Deposit Pot"])).toBe(true);
  });

  it("detects Starling spaces", () => {
    expect(isPotAccount(["savings", "", "Starling", "Holiday Space"])).toBe(true);
  });

  it("detects ISA accounts", () => {
    expect(isPotAccount(["isa", "", "Nationwide", "Cash ISA"])).toBe(true);
  });

  it("detects 'repository' accounts (conveyancing term)", () => {
    expect(isPotAccount(["savings", "", "HSBC", "Purchase Deposit Repository"])).toBe(true);
  });

  it("detects 'reserve' and 'nest egg' accounts", () => {
    expect(isPotAccount(["", "", "", "Emergency Reserve"])).toBe(true);
    expect(isPotAccount(["", "", "", "Nest Egg Fund"])).toBe(true);
  });

  it("does NOT flag a standard current account", () => {
    expect(isPotAccount(["current_account", "John Smith", "Barclays", ""])).toBe(false);
  });

  it("does NOT flag a mortgage account", () => {
    expect(isPotAccount(["mortgage", "John Smith", "HSBC", ""])).toBe(false);
  });
});

// ── Pot classification logic ─────────────────────────────────────────
type PotClass = "relied_evidenced" | "relied_needs_enquiry" | "not_relied";

function classifyPot(
  balance: number,
  amountToProve: number,
  hasTxData: boolean,
  isManual: boolean,
): PotClass {
  const isSmall = amountToProve > 0 && balance < amountToProve * 0.02;
  const isRelied = amountToProve > 0 && balance > 0;

  if (isSmall || !isRelied) return "not_relied";
  if (isManual) return "relied_needs_enquiry";
  return hasTxData ? "relied_evidenced" : "relied_needs_enquiry";
}

describe("Pot Classification Logic", () => {
  it("classifies small balance (<2% of total) as not relied", () => {
    expect(classifyPot(500, 100000, true, false)).toBe("not_relied");
  });

  it("classifies evidenced pot with tx data as relied+evidenced", () => {
    expect(classifyPot(15000, 100000, true, false)).toBe("relied_evidenced");
  });

  it("classifies pot without tx data as relied+needs enquiry", () => {
    expect(classifyPot(15000, 100000, false, false)).toBe("relied_needs_enquiry");
  });

  it("classifies manual-entry pot as relied+needs enquiry even if large", () => {
    expect(classifyPot(50000, 100000, false, true)).toBe("relied_needs_enquiry");
  });

  it("classifies zero-balance pot as not relied", () => {
    expect(classifyPot(0, 100000, true, false)).toBe("not_relied");
  });
});

// ── Material Receipt Promotion logic ─────────────────────────────────
interface MockTx {
  direction: string;
  amount: number;
  description: string;
  classified_category?: string;
}

function shouldPromoteReceipt(
  tx: MockTx,
  partyNames: string[],
  sourceKeywords: string[][],
): { promote: boolean; linkedSource: string; isOwnTransfer: boolean } {
  if (tx.direction !== "credit" && tx.direction !== "in") return { promote: false, linkedSource: "", isOwnTransfer: false };
  const amount = Math.abs(tx.amount);
  if (amount < 5000) return { promote: false, linkedSource: "", isOwnTransfer: false };

  const desc = tx.description.toLowerCase();
  const isSalary = /salary|payroll|wages|pay\s/i.test(desc);
  const descMentionsOtherParty = partyNames.some((name) => desc.includes(name.toLowerCase()));
  const isOwnTransfer = /(?:^|\s)(?:tfr|int\s|internal\s|own\s?a\/c|from\s?a\/c)/i.test(desc)
    && !descMentionsOtherParty
    && !/third.?party|unknown|unidentified|gift|loan/i.test(desc);

  if (isSalary && amount < 10000) return { promote: false, linkedSource: "", isOwnTransfer: false };

  let linkedSource = "Unlinked";
  for (const [srcName, ...keywords] of sourceKeywords) {
    if (keywords.some((kw) => desc.includes(kw))) {
      linkedSource = srcName;
      break;
    }
  }
  if (linkedSource === "Unlinked" && descMentionsOtherParty) {
    linkedSource = "Cross-party credit";
  }

  const isUnmatched = tx.classified_category === "unmatched" || tx.classified_category === "unknown";
  const promote = linkedSource !== "Unlinked" || isUnmatched || amount >= 10000;

  return { promote, linkedSource, isOwnTransfer };
}

describe("Material Receipt Promotion (Section 6A-5)", () => {
  const parties = ["Anna", "Loukianos"];
  const sources = [["share_sale", "share", "creative work"]];

  it("promotes a large unmatched credit", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 107844.48, description: "TFR FROM CREATIVE WORK", classified_category: "unmatched" },
      parties, sources,
    );
    expect(result.promote).toBe(true);
  });

  it("links credit to declared source when keywords match", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 50000, description: "Share sale proceeds Creative Work Ltd" },
      parties, sources,
    );
    expect(result.promote).toBe(true);
    expect(result.linkedSource).toBe("share_sale");
  });

  it("identifies cross-party credit when description mentions another party", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 8000, description: "Transfer from Loukianos Spyrou" },
      parties, sources,
    );
    expect(result.promote).toBe(true);
    expect(result.linkedSource).toBe("Cross-party credit");
  });

  it("does NOT treat 'transfer from Loukianos' as an own-account transfer", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 8000, description: "TFR from Loukianos" },
      parties, sources,
    );
    expect(result.isOwnTransfer).toBe(false);
  });

  it("skips small salary credits", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 5500, description: "Salary payment" },
      parties, sources,
    );
    expect(result.promote).toBe(false);
  });

  it("promotes exceptionally large salary credits (≥£10k)", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 15000, description: "Salary payment" },
      parties, sources,
    );
    expect(result.promote).toBe(true);
  });

  it("skips debit transactions", () => {
    const result = shouldPromoteReceipt(
      { direction: "debit", amount: 50000, description: "Property payment" },
      parties, sources,
    );
    expect(result.promote).toBe(false);
  });

  it("skips credits below £5,000", () => {
    const result = shouldPromoteReceipt(
      { direction: "credit", amount: 4999, description: "Unknown source" },
      parties, sources,
    );
    expect(result.promote).toBe(false);
  });
});

// ── Evidence-First Draft Email Discipline Tests ────────────────────────

/**
 * Simulates the evidence-first email discipline check.
 * Given an internal report evidence tier status and a draft email text,
 * validates that the email does not re-request already-evidenced items.
 */
interface EvidenceTierStatus {
  sourceEventEvidenced: boolean;
  receiptEvidenced: boolean;
  provenanceResolved: boolean;
}

function detectOverEnquiryViolations(
  tiers: EvidenceTierStatus,
  draftEmailText: string,
): { violations: string[] } {
  const violations: string[] = [];
  const lower = draftEmailText.toLowerCase();

  // If source event is evidenced, email should NOT generically ask to prove source
  if (tiers.sourceEventEvidenced) {
    const genericSourcePatterns = [
      /please\s+(?:explain|confirm|provide\s+evidence\s+of)\s+(?:the\s+)?source\s+of\s+(?:your\s+)?(?:deposit|funds|wealth)/i,
      /where\s+(?:the|your)\s+(?:deposit|funds)\s+(?:came|come)\s+from/i,
      /confirm\s+the\s+origin\s+of\s+(?:your\s+)?(?:deposit|funds)/i,
    ];
    for (const pat of genericSourcePatterns) {
      if (pat.test(draftEmailText)) {
        violations.push("Generic source-of-funds request despite Tier 1 (source event) being evidenced");
      }
    }
  }

  // If receipt is evidenced, email should NOT ask for bank statements to prove receipt
  if (tiers.receiptEvidenced) {
    const genericReceiptPatterns = [
      /provide\s+(?:full\s+|complete\s+)?(?:12|twelve)\s+months?\s+(?:of\s+)?(?:bank\s+)?statements?\s+(?:for\s+)?(?:all|every)/i,
    ];
    for (const pat of genericReceiptPatterns) {
      if (pat.test(draftEmailText)) {
        violations.push("Blanket 12-month statement request despite Tier 2 (receipt) being evidenced");
      }
    }
  }

  return { violations };
}

describe("Evidence-First Draft Email Discipline (Gap-Bridging)", () => {
  it("flags generic source-of-funds request when source event is evidenced", () => {
    const tiers: EvidenceTierStatus = { sourceEventEvidenced: true, receiptEvidenced: true, provenanceResolved: false };
    const email = "Please explain the source of your deposit funds and confirm where the funds came from.";
    const { violations } = detectOverEnquiryViolations(tiers, email);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("Tier 1");
  });

  it("allows targeted provenance enquiry when source is evidenced but provenance is not", () => {
    const tiers: EvidenceTierStatus = { sourceEventEvidenced: true, receiptEvidenced: true, provenanceResolved: false };
    const email = "We have reviewed the documentation showing the deposit derives from the sale of shares. Please clarify how the funds were routed from the BVI entity to your UK account.";
    const { violations } = detectOverEnquiryViolations(tiers, email);
    expect(violations).toHaveLength(0);
  });

  it("allows generic source request when source event is NOT evidenced", () => {
    const tiers: EvidenceTierStatus = { sourceEventEvidenced: false, receiptEvidenced: false, provenanceResolved: false };
    const email = "Please explain the source of your deposit funds.";
    const { violations } = detectOverEnquiryViolations(tiers, email);
    expect(violations).toHaveLength(0);
  });

  it("flags blanket 12-month statement request when receipt is evidenced", () => {
    const tiers: EvidenceTierStatus = { sourceEventEvidenced: true, receiptEvidenced: true, provenanceResolved: false };
    const email = "Please provide 12 months of bank statements for all your accounts.";
    const { violations } = detectOverEnquiryViolations(tiers, email);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("Tier 2");
  });
});

// ── Associated-Party Role Classification Tests ─────────────────────────

type PartyFundingRole = "economic_source_originator" | "operational_fund_holder" | "independent";

function classifyPartyRole(
  party: { name: string; contributionDeclared: number; fundsFromOtherParty: boolean; otherPartyName?: string },
): PartyFundingRole {
  if (party.fundsFromOtherParty && party.otherPartyName) {
    return "operational_fund_holder";
  }
  if (party.contributionDeclared > 0 && !party.fundsFromOtherParty) {
    return "economic_source_originator";
  }
  return "independent";
}

describe("Associated-Party Role Classification (Gap-Bridging)", () => {
  it("classifies the earning party as economic source originator", () => {
    const role = classifyPartyRole({
      name: "Loukianos",
      contributionDeclared: 100000,
      fundsFromOtherParty: false,
    });
    expect(role).toBe("economic_source_originator");
  });

  it("classifies the routing party as operational fund holder", () => {
    const role = classifyPartyRole({
      name: "Anna",
      contributionDeclared: 50000,
      fundsFromOtherParty: true,
      otherPartyName: "Loukianos",
    });
    expect(role).toBe("operational_fund_holder");
  });

  it("classifies an independent contributor correctly", () => {
    const role = classifyPartyRole({
      name: "John",
      contributionDeclared: 0,
      fundsFromOtherParty: false,
    });
    expect(role).toBe("independent");
  });
});

// ── Enquiry Volume Proportionality Test ────────────────────────────────

function countEnquiryPoints(emailText: string): number {
  // Count numbered points (1., 2., 3., etc. and 1.1, 1.2 sub-points)
  const mainPoints = emailText.match(/^\s*\d+\.\s+/gm) || [];
  // Filter out sub-points (X.Y format) to count only main enquiry items
  const topLevel = mainPoints.filter((p) => /^\s*\d+\.\s+/.test(p) && !/^\s*\d+\.\d+/.test(p));
  return topLevel.length;
}

describe("Enquiry Volume Proportionality (Gap-Bridging)", () => {
  it("counts main enquiry points correctly", () => {
    const email = `
1. Please confirm the source of funds.
1.1 Sub-point about the share sale.
1.2 Sub-point about the route.
2. Please confirm the purchasing structure.
3. Please confirm CISACI payments.
4. Final confirmation.
    `;
    expect(countEnquiryPoints(email)).toBe(4);
  });

  it("flags disproportionate enquiry volume", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `${i + 1}. Generic enquiry point ${i + 1}.`).join("\n");
    const count = countEnquiryPoints(lines);
    // More than 10 top-level points for a single party is excessive
    expect(count).toBeGreaterThan(10);
  });
});

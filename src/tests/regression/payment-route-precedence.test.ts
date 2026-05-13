/**
 * Regression tests: Payment-Route-First PRECEDENCE Behaviour
 *
 * Validates that the payment-route-first rule (Step 6 of the Reasoning
 * Priority Hierarchy) takes explicit precedence over older section-specific
 * instructions (Sections 6C, 7, 10, 10A) when all three evidence tiers
 * are satisfied.
 *
 * These tests ensure the newer rule is not subordinated by competing
 * "request 12 months of statements" instructions elsewhere in the prompt.
 */
import { describe, it, expect } from "vitest";

// ── Types ──────────────────────────────────────────────────────────────

interface EvidenceTiers {
  sourceEventEvidenced: boolean;
  receiptEvidenced: boolean;
  purchaseStructureEvidenced: boolean;
}

type EnquirySource =
  | "section_6c_coverage"    // Bank Statement Coverage
  | "section_6d_funding_gap" // Funding Gap / Completion Readiness shortfall
  | "section_7_investment"   // Investment or Trading Accounts
  | "section_10a_unlinked"   // Unlinked Open Banking Account
  | "section_10_linked"      // Linked or Similarly Named Accounts
  | "route_first_step1"      // Payment-route-first: route explanation
  | "route_first_step2"      // Payment-route-first: linking document
  | "route_first_step3"      // Payment-route-first: broad statements (escalation)
  | "independent_enquiry";   // Unrelated to the evidenced chain

interface DraftEnquiry {
  source: EnquirySource;
  text: string;
  /** Whether this enquiry relates to the evidenced funding chain */
  relatedToEvidencedChain: boolean;
}

// ── Precedence Gate Logic ──────────────────────────────────────────────

/**
 * Reusable precedence gate: determines whether section-specific broad
 * statement requests should be deferred to Step 3 of the payment-route-first
 * sequence.
 */
function applyPrecedenceGate(
  tiers: EvidenceTiers,
  enquiries: DraftEnquiry[],
): {
  gateActive: boolean;
  deferredEnquiries: DraftEnquiry[];
  passedEnquiries: DraftEnquiry[];
  hasRouteExplanation: boolean;
  hasLinkingDocument: boolean;
  violations: string[];
} {
  const gateActive =
    tiers.sourceEventEvidenced &&
    tiers.receiptEvidenced &&
    tiers.purchaseStructureEvidenced;

  const hasRouteExplanation = enquiries.some(
    (e) => e.source === "route_first_step1",
  );
  const hasLinkingDocument = enquiries.some(
    (e) => e.source === "route_first_step2",
  );

  const broadSectionSources: EnquirySource[] = [
    "section_6c_coverage",
    "section_6d_funding_gap",
    "section_7_investment",
    "section_10a_unlinked",
    "section_10_linked",
  ];

  const deferredEnquiries: DraftEnquiry[] = [];
  const passedEnquiries: DraftEnquiry[] = [];
  const violations: string[] = [];

  for (const enquiry of enquiries) {
    const isBroadSection = broadSectionSources.includes(enquiry.source);

    if (gateActive && isBroadSection && enquiry.relatedToEvidencedChain) {
      // This enquiry should be deferred to Step 3
      if (!hasRouteExplanation) {
        violations.push(
          `${enquiry.source} broad request present without route explanation (Step 1)`,
        );
      }
      if (!hasLinkingDocument) {
        violations.push(
          `${enquiry.source} broad request present without linking document request (Step 2)`,
        );
      }
      deferredEnquiries.push(enquiry);
    } else {
      passedEnquiries.push(enquiry);
    }
  }

  return {
    gateActive,
    deferredEnquiries,
    passedEnquiries,
    hasRouteExplanation,
    hasLinkingDocument,
    violations,
  };
}

/**
 * Detects whether a draft email uses crude discrepancy/contradiction
 * wording where relational clarification would be more proportionate.
 */
function detectCrudeDiscrepancyWording(emailText: string): {
  hasCrudeWording: boolean;
  hasRelationalWording: boolean;
  crudePatterns: string[];
} {
  const lower = emailText.toLowerCase();

  const crudePatterns = [
    "there is a discrepancy",
    "conflicting information",
    "conflicting stories",
    "contradictory information",
    "your information conflicts",
    "the information provided is inconsistent",
    "we have identified a contradiction",
  ];

  const relationalPatterns = [
    "please explain how",
    "please clarify the relationship",
    "how these facts relate",
    "how these points relate",
    "explain the route",
    "explain the relationship between",
    "please confirm how",
    "clarify how",
  ];

  const matchedCrude = crudePatterns.filter((p) => lower.includes(p));
  const hasRelationalWording = relationalPatterns.some((p) =>
    lower.includes(p),
  );

  return {
    hasCrudeWording: matchedCrude.length > 0,
    hasRelationalWording,
    crudePatterns: matchedCrude,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Payment-Route-First Precedence Gate", () => {
  describe("Gate activation", () => {
    it("activates when all three evidence tiers are satisfied", () => {
      const result = applyPrecedenceGate(
        { sourceEventEvidenced: true, receiptEvidenced: true, purchaseStructureEvidenced: true },
        [],
      );
      expect(result.gateActive).toBe(true);
    });

    it("does not activate when any tier is missing", () => {
      const cases = [
        { sourceEventEvidenced: false, receiptEvidenced: true, purchaseStructureEvidenced: true },
        { sourceEventEvidenced: true, receiptEvidenced: false, purchaseStructureEvidenced: true },
        { sourceEventEvidenced: true, receiptEvidenced: true, purchaseStructureEvidenced: false },
      ];
      for (const tiers of cases) {
        const result = applyPrecedenceGate(tiers, []);
        expect(result.gateActive).toBe(false);
      }
    });
  });

  describe("Section-specific statement requests deferred when gate active", () => {
    const allTiers: EvidenceTiers = {
      sourceEventEvidenced: true,
      receiptEvidenced: true,
      purchaseStructureEvidenced: true,
    };

    it("defers Section 7 investment statement request to Step 3", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain the route...", relatedToEvidencedChain: true },
        { source: "route_first_step2", text: "Please provide a linking document...", relatedToEvidencedChain: true },
        { source: "section_7_investment", text: "Please provide 12 months of investment statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.deferredEnquiries).toHaveLength(1);
      expect(result.deferredEnquiries[0].source).toBe("section_7_investment");
      expect(result.violations).toHaveLength(0); // No violations because Steps 1+2 present
    });

    it("defers Section 10A unlinked account request when part of evidenced chain", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain the route...", relatedToEvidencedChain: true },
        { source: "route_first_step2", text: "Please provide a transfer advice...", relatedToEvidencedChain: true },
        { source: "section_10a_unlinked", text: "Please provide 12 months' statements for the unlinked account.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.deferredEnquiries).toHaveLength(1);
      expect(result.deferredEnquiries[0].source).toBe("section_10a_unlinked");
    });

    it("defers Section 6C coverage request when part of evidenced chain", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain the route...", relatedToEvidencedChain: true },
        { source: "route_first_step2", text: "Please provide a linking document...", relatedToEvidencedChain: true },
        { source: "section_6c_coverage", text: "Please provide the missing 2 months of statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.deferredEnquiries).toHaveLength(1);
      expect(result.deferredEnquiries[0].source).toBe("section_6c_coverage");
    });

    it("does NOT defer unrelated enquiries even when gate is active", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain the route...", relatedToEvidencedChain: true },
        { source: "section_10a_unlinked", text: "Unrelated undisclosed account with unexplained credits.", relatedToEvidencedChain: false },
        { source: "independent_enquiry", text: "Cash deposit enquiry.", relatedToEvidencedChain: false },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.deferredEnquiries).toHaveLength(0);
      expect(result.passedEnquiries).toHaveLength(3);
    });
  });

  describe("Violation detection", () => {
    const allTiers: EvidenceTiers = {
      sourceEventEvidenced: true,
      receiptEvidenced: true,
      purchaseStructureEvidenced: true,
    };

    it("flags violation when Section 7 request appears without route explanation", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "section_7_investment", text: "Please provide 12 months of investment statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain("section_7_investment");
      expect(result.violations[0]).toContain("without route explanation");
    });

    it("flags violation when Section 10A request appears without linking document", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain...", relatedToEvidencedChain: true },
        { source: "section_10a_unlinked", text: "Please provide Cayman account statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.violations.some((v) => v.includes("without linking document"))).toBe(true);
    });

    it("no violations when gate is not active", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "section_7_investment", text: "Please provide 12 months of statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(
        { sourceEventEvidenced: true, receiptEvidenced: false, purchaseStructureEvidenced: true },
        enquiries,
      );
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("Correct escalation sequence", () => {
    const allTiers: EvidenceTiers = {
      sourceEventEvidenced: true,
      receiptEvidenced: true,
      purchaseStructureEvidenced: true,
    };

    it("compliant: route → linking doc → deferred broad request", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain the payment route from the BVI entity to your UK account.", relatedToEvidencedChain: true },
        { source: "route_first_step2", text: "Please provide a transfer advice if available.", relatedToEvidencedChain: true },
        { source: "route_first_step3", text: "If the above cannot be provided, please supply the relevant account statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.gateActive).toBe(true);
      expect(result.hasRouteExplanation).toBe(true);
      expect(result.hasLinkingDocument).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("non-compliant: broad request without Steps 1 or 2", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "section_10a_unlinked", text: "Please provide full Cayman account statements.", relatedToEvidencedChain: true },
        { source: "section_7_investment", text: "Please provide 12 months of offshore investment statements.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Section 6D funding-gap subordination", () => {
    const allTiers: EvidenceTiers = {
      sourceEventEvidenced: true,
      receiptEvidenced: true,
      purchaseStructureEvidenced: true,
    };

    it("defers funding-shortfall enquiry in draft email when gate active and shortfall is chain-related", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "route_first_step1", text: "Please explain the payment route...", relatedToEvidencedChain: true },
        { source: "route_first_step2", text: "Please provide a transfer advice...", relatedToEvidencedChain: true },
        { source: "section_6d_funding_gap", text: "Please confirm how you intend to cover the shortfall of approximately £15,700.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.deferredEnquiries).toHaveLength(1);
      expect(result.deferredEnquiries[0].source).toBe("section_6d_funding_gap");
      expect(result.violations).toHaveLength(0);
    });

    it("flags violation when funding-shortfall leads without route explanation", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "section_6d_funding_gap", text: "A shortfall of £15,700 has been identified. Please provide evidence of additional funds.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(allTiers, enquiries);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain("section_6d_funding_gap");
    });

    it("does NOT defer funding-gap enquiry when gate is inactive", () => {
      const enquiries: DraftEnquiry[] = [
        { source: "section_6d_funding_gap", text: "Shortfall of £50,000 identified.", relatedToEvidencedChain: true },
      ];
      const result = applyPrecedenceGate(
        { sourceEventEvidenced: false, receiptEvidenced: true, purchaseStructureEvidenced: true },
        enquiries,
      );
      expect(result.deferredEnquiries).toHaveLength(0);
      expect(result.passedEnquiries).toHaveLength(1);
    });
  });
});

describe("Draft Email Wording Discipline", () => {
  it("flags crude discrepancy wording", () => {
    const email = "There is a discrepancy between the share sale documentation and the Cayman Islands declaration. The information provided is inconsistent. Please provide full account statements.";
    const result = detectCrudeDiscrepancyWording(email);
    expect(result.hasCrudeWording).toBe(true);
    expect(result.crudePatterns.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts relational wording without crude patterns", () => {
    const email = "We have reviewed the documentation provided. Please explain how the share sale, the Cayman Islands declaration, and the payer identity relate to each other. Please clarify the relationship between the BVI share sale and the offshore jurisdiction declaration.";
    const result = detectCrudeDiscrepancyWording(email);
    expect(result.hasCrudeWording).toBe(false);
    expect(result.hasRelationalWording).toBe(true);
  });

  it("flags mixed wording where crude and relational both appear", () => {
    const email = "There is a discrepancy between the share sale and the declaration. Please explain how these facts relate to each other.";
    const result = detectCrudeDiscrepancyWording(email);
    expect(result.hasCrudeWording).toBe(true);
    expect(result.hasRelationalWording).toBe(true);
  });

  it("accepts clean evidence-acknowledgement opener", () => {
    const email = "We have reviewed the documentation provided, including the share sale agreement and open banking data. We can see that receipt of £107,844 is visible. Please explain how the offshore declaration relates to the share sale proceeds.";
    const result = detectCrudeDiscrepancyWording(email);
    expect(result.hasCrudeWording).toBe(false);
    expect(result.hasRelationalWording).toBe(true);
  });
});

describe("Funding-Shortfall Email Discipline", () => {
  /**
   * Detects whether a draft email leads with a funding-shortfall point
   * before the route-explanation / evidence-acknowledgement sections.
   */
  function detectShortfallLeadsEmail(emailText: string): {
    hasShortfallLanguage: boolean;
    hasEvidenceAcknowledgement: boolean;
    shortfallLeads: boolean;
  } {
    const lower = emailText.toLowerCase();
    const shortfallPatterns = [
      "shortfall of approximately",
      "funding shortfall",
      "shortfall has been identified",
      "cover this shortfall",
      "insufficient funds",
    ];
    const ackPatterns = [
      "we have reviewed",
      "we can see that",
      "documentation provided",
      "evidence already provided",
      "having reviewed the",
    ];

    const hasShortfallLanguage = shortfallPatterns.some((p) => lower.includes(p));
    const hasEvidenceAcknowledgement = ackPatterns.some((p) => lower.includes(p));

    let shortfallLeads = false;
    if (hasShortfallLanguage && hasEvidenceAcknowledgement) {
      const firstShortfall = Math.min(
        ...shortfallPatterns.map((p) => lower.indexOf(p)).filter((i) => i >= 0),
      );
      const firstAck = Math.min(
        ...ackPatterns.map((p) => lower.indexOf(p)).filter((i) => i >= 0),
      );
      shortfallLeads = firstShortfall < firstAck;
    } else if (hasShortfallLanguage && !hasEvidenceAcknowledgement) {
      shortfallLeads = true;
    }

    return { hasShortfallLanguage, hasEvidenceAcknowledgement, shortfallLeads };
  }

  it("flags email that leads with funding shortfall before evidence acknowledgement", () => {
    const email = "A potential shortfall of approximately £15,700 has been identified. Please confirm how you intend to cover this. We have reviewed the documentation provided.";
    const result = detectShortfallLeadsEmail(email);
    expect(result.shortfallLeads).toBe(true);
  });

  it("accepts email where evidence acknowledgement comes before shortfall mention", () => {
    const email = "We have reviewed the documentation provided, including the share sale agreement and bank statements. We note a potential timing-related shortfall of approximately £15,700 based on account balances at the statement date.";
    const result = detectShortfallLeadsEmail(email);
    expect(result.shortfallLeads).toBe(false);
    expect(result.hasShortfallLanguage).toBe(true);
    expect(result.hasEvidenceAcknowledgement).toBe(true);
  });

  it("accepts email with no shortfall language at all", () => {
    const email = "We have reviewed the documentation provided. Please explain the route by which the share-sale proceeds were transferred.";
    const result = detectShortfallLeadsEmail(email);
    expect(result.hasShortfallLanguage).toBe(false);
    expect(result.shortfallLeads).toBe(false);
  });
});

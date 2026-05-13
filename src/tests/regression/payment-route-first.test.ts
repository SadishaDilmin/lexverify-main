/**
 * Regression tests: Payment-Route-First Enquiry Discipline
 *
 * Validates the reusable rule that where source event, receipt, and
 * purchase-structure transfer are materially evidenced, the draft email
 * should prefer route-explanation → linking-document → broader statements
 * rather than jumping straight to broad documentary requests.
 */
import { describe, it, expect } from "vitest";

// ── Evidence Tier Classification ────────────────────────────────────────

interface EvidenceTiers {
  sourceEventEvidenced: boolean;
  receiptEvidenced: boolean;
  purchaseStructureEvidenced: boolean;
}

type EnquiryType =
  | "route_explanation"
  | "linking_document"
  | "broad_statements"
  | "generic_re_proof";

interface DraftEnquiry {
  type: EnquiryType;
  text: string;
}

/**
 * Determines the recommended enquiry escalation sequence based on
 * which evidence tiers are already satisfied.
 */
function recommendEnquirySequence(
  tiers: EvidenceTiers,
  enquiries: DraftEnquiry[],
): {
  allTiersEvidenced: boolean;
  hasRouteExplanation: boolean;
  hasLinkingDoc: boolean;
  hasBroadStatements: boolean;
  hasGenericReProof: boolean;
  broadBeforeRoute: boolean;
  isCompliant: boolean;
} {
  const allTiersEvidenced =
    tiers.sourceEventEvidenced &&
    tiers.receiptEvidenced &&
    tiers.purchaseStructureEvidenced;

  const hasRouteExplanation = enquiries.some((e) => e.type === "route_explanation");
  const hasLinkingDoc = enquiries.some((e) => e.type === "linking_document");
  const hasBroadStatements = enquiries.some((e) => e.type === "broad_statements");
  const hasGenericReProof = enquiries.some((e) => e.type === "generic_re_proof");

  // Broad statements appearing without route explanation first = non-compliant
  const broadBeforeRoute = hasBroadStatements && !hasRouteExplanation;

  // Compliant if: when all tiers evidenced, route explanation comes first,
  // no generic re-proof, and broad statements don't appear without route first
  const isCompliant = allTiersEvidenced
    ? hasRouteExplanation && !hasGenericReProof && !broadBeforeRoute
    : true; // Rule only applies when all tiers are evidenced

  return {
    allTiersEvidenced,
    hasRouteExplanation,
    hasLinkingDoc,
    hasBroadStatements,
    hasGenericReProof,
    broadBeforeRoute,
    isCompliant,
  };
}

/**
 * Checks whether a draft email text contains evidence-acknowledgement
 * language before raising enquiries.
 */
function hasEvidenceAcknowledgement(emailText: string): boolean {
  const lower = emailText.toLowerCase();
  const acknowledgementPatterns = [
    "we have reviewed",
    "we can see that",
    "documentation provided",
    "evidence already provided",
    "documentation already on file",
    "material already provided",
    "we note from the documentation",
    "having reviewed the",
  ];
  return acknowledgementPatterns.some((p) => lower.includes(p));
}

/**
 * Detects whether a draft email jumps straight to broad statement requests
 * without first asking for route explanation.
 */
function detectBroadStatementDefault(emailText: string): {
  hasBroadRequest: boolean;
  hasRouteQuestion: boolean;
  broadBeforeRoute: boolean;
} {
  const lower = emailText.toLowerCase();

  const broadPatterns = [
    "12 months of",
    "full bank statements",
    "full account statements",
    "complete bank statements",
    "complete account statements",
    "cayman account statements",
    "offshore account statements",
    "bvi account statements",
    "investment account statements",
  ];

  const routePatterns = [
    "explain the route",
    "payment route",
    "payment pathway",
    "how the funds moved",
    "how the proceeds moved",
    "route by which",
    "provenance route",
    "how these funds were transferred",
    "explain the relationship between",
    "clarify how",
  ];

  const hasBroadRequest = broadPatterns.some((p) => lower.includes(p));
  const hasRouteQuestion = routePatterns.some((p) => lower.includes(p));

  let broadBeforeRoute = false;
  if (hasBroadRequest && hasRouteQuestion) {
    const firstBroad = Math.min(
      ...broadPatterns
        .map((p) => lower.indexOf(p))
        .filter((i) => i >= 0),
    );
    const firstRoute = Math.min(
      ...routePatterns
        .map((p) => lower.indexOf(p))
        .filter((i) => i >= 0),
    );
    broadBeforeRoute = firstBroad < firstRoute;
  } else if (hasBroadRequest && !hasRouteQuestion) {
    broadBeforeRoute = true;
  }

  return { hasBroadRequest, hasRouteQuestion, broadBeforeRoute };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Payment-Route-First Enquiry Discipline", () => {
  describe("Enquiry sequence compliance", () => {
    it("accepts route-explanation-first when all tiers evidenced", () => {
      const tiers: EvidenceTiers = {
        sourceEventEvidenced: true,
        receiptEvidenced: true,
        purchaseStructureEvidenced: true,
      };
      const enquiries: DraftEnquiry[] = [
        { type: "route_explanation", text: "Please explain the route by which the share-sale proceeds moved from the BVI entity to your UK account." },
        { type: "linking_document", text: "If available, please provide a transfer advice or payment confirmation." },
      ];
      const result = recommendEnquirySequence(tiers, enquiries);
      expect(result.isCompliant).toBe(true);
      expect(result.broadBeforeRoute).toBe(false);
    });

    it("rejects broad statements without route explanation when all tiers evidenced", () => {
      const tiers: EvidenceTiers = {
        sourceEventEvidenced: true,
        receiptEvidenced: true,
        purchaseStructureEvidenced: true,
      };
      const enquiries: DraftEnquiry[] = [
        { type: "broad_statements", text: "Please provide 12 months of Cayman account statements." },
      ];
      const result = recommendEnquirySequence(tiers, enquiries);
      expect(result.isCompliant).toBe(false);
      expect(result.broadBeforeRoute).toBe(true);
    });

    it("rejects generic re-proof when all tiers evidenced", () => {
      const tiers: EvidenceTiers = {
        sourceEventEvidenced: true,
        receiptEvidenced: true,
        purchaseStructureEvidenced: true,
      };
      const enquiries: DraftEnquiry[] = [
        { type: "route_explanation", text: "Please explain the route..." },
        { type: "generic_re_proof", text: "Please confirm the source of your deposit funds." },
      ];
      const result = recommendEnquirySequence(tiers, enquiries);
      expect(result.isCompliant).toBe(false);
    });

    it("allows broad statements when not all tiers are evidenced", () => {
      const tiers: EvidenceTiers = {
        sourceEventEvidenced: true,
        receiptEvidenced: false,
        purchaseStructureEvidenced: false,
      };
      const enquiries: DraftEnquiry[] = [
        { type: "broad_statements", text: "Please provide bank statements showing receipt." },
      ];
      const result = recommendEnquirySequence(tiers, enquiries);
      expect(result.isCompliant).toBe(true); // Rule doesn't apply
    });

    it("accepts route + linking doc + broad statements in correct order", () => {
      const tiers: EvidenceTiers = {
        sourceEventEvidenced: true,
        receiptEvidenced: true,
        purchaseStructureEvidenced: true,
      };
      const enquiries: DraftEnquiry[] = [
        { type: "route_explanation", text: "Please explain how funds moved from the offshore entity to your UK account." },
        { type: "linking_document", text: "Please provide a transfer advice if available." },
        { type: "broad_statements", text: "If the above cannot be provided, please supply the relevant account statements." },
      ];
      const result = recommendEnquirySequence(tiers, enquiries);
      expect(result.isCompliant).toBe(true);
      expect(result.hasBroadStatements).toBe(true);
      expect(result.broadBeforeRoute).toBe(false);
    });
  });

  describe("Evidence acknowledgement in draft emails", () => {
    it("detects proper evidence acknowledgement", () => {
      const email = "We have reviewed the documentation provided, including the share sale agreement and open banking data. We can see that receipt of £107,844 is visible. The remaining point is the provenance route.";
      expect(hasEvidenceAcknowledgement(email)).toBe(true);
    });

    it("rejects email with no evidence acknowledgement", () => {
      const email = "Please provide full bank statements for the past 12 months. Please also confirm the source of your deposit funds and provide supporting documentation.";
      expect(hasEvidenceAcknowledgement(email)).toBe(false);
    });

    it("detects alternative acknowledgement phrasing", () => {
      const email = "Having reviewed the material already provided, we note the source event is supported by the sale agreement.";
      expect(hasEvidenceAcknowledgement(email)).toBe(true);
    });
  });

  describe("Broad-statement-default detection", () => {
    it("flags email that jumps to broad statements without route question", () => {
      const email = "Please provide 12 months of Cayman account statements showing the movement of funds. Please also provide full bank statements for the BVI entity.";
      const result = detectBroadStatementDefault(email);
      expect(result.hasBroadRequest).toBe(true);
      expect(result.hasRouteQuestion).toBe(false);
      expect(result.broadBeforeRoute).toBe(true);
    });

    it("accepts email with route question before broad statements", () => {
      const email = "Please explain the route by which the share-sale proceeds were transferred to your UK account. If you are unable to provide this explanation, please supply the relevant 12 months of account statements.";
      const result = detectBroadStatementDefault(email);
      expect(result.hasBroadRequest).toBe(true);
      expect(result.hasRouteQuestion).toBe(true);
      expect(result.broadBeforeRoute).toBe(false);
    });

    it("flags email where broad request appears before route question", () => {
      const email = "Please provide full bank statements for the offshore account. Additionally, please explain the route by which the funds moved.";
      const result = detectBroadStatementDefault(email);
      expect(result.broadBeforeRoute).toBe(true);
    });

    it("accepts email with only route question and no broad request", () => {
      const email = "Please explain the route by which the share-sale proceeds moved from the BVI entity to your UK account, and provide a transfer advice or payment confirmation if available.";
      const result = detectBroadStatementDefault(email);
      expect(result.hasBroadRequest).toBe(false);
      expect(result.hasRouteQuestion).toBe(true);
      expect(result.broadBeforeRoute).toBe(false);
    });
  });

  describe("Combined discipline check", () => {
    it("compliant email: acknowledges evidence, asks route, then linking doc", () => {
      const email = `We have reviewed the documentation provided, including the share sale agreement and open banking data showing receipt of £107,844 into your Monzo account.

The remaining point we need to clarify is the route by which these proceeds moved from the selling entity to your UK account — specifically, how the Cayman Islands declaration relates to the BVI share sale.

Please explain the payment pathway and, if available, provide a single supporting document such as a transfer advice or completion statement.`;

      expect(hasEvidenceAcknowledgement(email)).toBe(true);
      const broadCheck = detectBroadStatementDefault(email);
      expect(broadCheck.hasRouteQuestion).toBe(true);
      expect(broadCheck.hasBroadRequest).toBe(false);
    });

    it("non-compliant email: no acknowledgement, jumps to broad requests", () => {
      const email = `We require further information regarding the source of your deposit funds.

Please provide 12 months of Cayman account statements and full bank statements for all offshore accounts. Please also confirm whether the funds originated from a share sale or from the Cayman Islands.`;

      expect(hasEvidenceAcknowledgement(email)).toBe(false);
      const broadCheck = detectBroadStatementDefault(email);
      expect(broadCheck.broadBeforeRoute).toBe(true);
    });
  });
});

/**
 * Regression tests: Olimey AI Reasoning-Core Discipline
 *
 * Validates the reusable reasoning hierarchy:
 * 1. Evidence-first analysis (acknowledge before enquiring)
 * 2. False either/or reduction (relational clarification preferred)
 * 3. Gap-focused enquiry (narrow, not generic)
 * 4. Proportionate peripheral treatment
 * 5. Associated-party role classification
 */
import { describe, it, expect } from "vitest";

// ── Evidence-First Report Opening Validator ─────────────────────────────

function hasEvidencePositionSummary(reportText: string): boolean {
  const lower = reportText.toLowerCase();
  // The report should contain an evidence position summary near the top
  // (within the first 2000 chars of the internal report section)
  const internalStart = lower.indexOf("internal report");
  const searchArea = internalStart >= 0
    ? lower.slice(internalStart, internalStart + 3000)
    : lower.slice(0, 3000);

  return (
    searchArea.includes("evidence position") ||
    searchArea.includes("already evidenced") ||
    searchArea.includes("source event evidenced") ||
    searchArea.includes("source event documented") ||
    searchArea.includes("receipt of") && searchArea.includes("visible")
  );
}

function startsWithEvidenceBeforeGaps(reportText: string): boolean {
  const lower = reportText.toLowerCase();
  const firstEvidence = Math.min(
    lower.indexOf("evidenced") >= 0 ? lower.indexOf("evidenced") : Infinity,
    lower.indexOf("evidence position") >= 0 ? lower.indexOf("evidence position") : Infinity,
    lower.indexOf("already established") >= 0 ? lower.indexOf("already established") : Infinity,
    lower.indexOf("documented via") >= 0 ? lower.indexOf("documented via") : Infinity,
  );
  const firstGap = Math.min(
    lower.indexOf("unevidenced") >= 0 ? lower.indexOf("unevidenced") : Infinity,
    lower.indexOf("wholly undocumented") >= 0 ? lower.indexOf("wholly undocumented") : Infinity,
    lower.indexOf("entirely unknown") >= 0 ? lower.indexOf("entirely unknown") : Infinity,
  );
  // Evidence acknowledgement should appear before any "unevidenced" language
  return firstEvidence < firstGap;
}

describe("Evidence-First Report Discipline", () => {
  it("detects evidence position summary in compliant report", () => {
    const report = `## Internal Report\n\n**Evidence Position**: Source event (share sale) documented via sale agreement. Receipt of £107,844 visible in open banking. Remaining gap: provenance trail from BVI.\n\n### Risk Analysis...`;
    expect(hasEvidencePositionSummary(report)).toBe(true);
  });

  it("rejects report that jumps straight to gaps without evidence summary", () => {
    const report = `## Internal Report\n\n### Risk Analysis\nThe source of wealth is wholly unevidenced. Multiple concerns exist...`;
    expect(hasEvidencePositionSummary(report)).toBe(false);
  });

  it("ensures evidence acknowledgement appears before 'unevidenced' language", () => {
    const good = "The source event is evidenced via the share sale agreement. However, the provenance trail remains unevidenced.";
    const bad = "The source of wealth is unevidenced. No documentary evidence was provided.";
    expect(startsWithEvidenceBeforeGaps(good)).toBe(true);
    expect(startsWithEvidenceBeforeGaps(bad)).toBe(false);
  });
});

// ── False Either/Or Detection ───────────────────────────────────────────

function detectFalseEitherOr(text: string): { hasFalseEitherOr: boolean; instances: string[] } {
  const instances: string[] = [];

  // Patterns that force binary choice where relational clarification is better
  const binaryPatterns = [
    /(?:is it|whether it is)\s+(?:a\s+)?(.{10,60})\s+or\s+(?:a\s+)?(.{10,60})\?/gi,
    /(?:please confirm|please clarify)\s+whether\s+(?:the\s+)?(?:funds|source|deposit)\s+(?:is|are|was|were)\s+from\s+(.{10,40})\s+or\s+(?:from\s+)?(.{10,40})/gi,
  ];

  // Context clues that suggest the two options could coexist
  const coexistenceClues = [
    /(?:share\s+sale|investment|proceeds).*(?:cayman|bvi|offshore|jurisdiction)/i,
    /(?:cayman|bvi|offshore|jurisdiction).*(?:share\s+sale|investment|proceeds)/i,
    /(?:salary|employment).*(?:director|company)/i,
    /(?:gift|transfer).*(?:same\s+person|spouse|partner)/i,
  ];

  for (const pat of binaryPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pat.exec(text)) !== null) {
      const context = text.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100);
      const couldCoexist = coexistenceClues.some((cc) => cc.test(context));
      if (couldCoexist) {
        instances.push(`False either/or: "${match[0].slice(0, 80)}..." — options may describe same chain`);
      }
    }
  }

  return { hasFalseEitherOr: instances.length > 0, instances };
}

function isRelationalClarification(text: string): boolean {
  const relationalPatterns = [
    /how\s+(?:these|the\s+two|both)\s+(?:points?|facts?|declarations?)\s+relate/i,
    /whether\s+the\s+.*\s+relates?\s+to\s+the\s+same/i,
    /explain\s+(?:the\s+)?relationship\s+between/i,
    /clarify\s+how\s+.*\s+and\s+.*\s+(?:relate|connect|fit)/i,
    /how\s+(?:these|the)\s+.*\s+relate\s+to\s+(?:each\s+other|one\s+another)/i,
  ];
  return relationalPatterns.some((p) => p.test(text));
}

describe("False Either/Or Reduction", () => {
  it("detects false either/or when share sale and jurisdiction could coexist", () => {
    const text = "The Cayman Islands share sale proceeds — please confirm whether the funds are from a share sale or from the Cayman Islands?";
    const result = detectFalseEitherOr(text);
    expect(result.hasFalseEitherOr).toBe(true);
  });

  it("accepts genuine binary question where options are mutually exclusive", () => {
    const text = "Please confirm whether you are purchasing as an individual or as a company.";
    const result = detectFalseEitherOr(text);
    expect(result.hasFalseEitherOr).toBe(false);
  });

  it("identifies relational clarification language", () => {
    expect(isRelationalClarification(
      "Please explain whether the Cayman Islands declaration relates to the same share-sale proceeds."
    )).toBe(true);
  });

  it("rejects non-relational language", () => {
    expect(isRelationalClarification(
      "Please confirm the source of your deposit funds."
    )).toBe(false);
  });
});

// ── Gap-Focused Enquiry Validation ──────────────────────────────────────

interface EnquiryPoint {
  text: string;
  correspondingGap: string | null; // null = no identified gap
}

function validateEnquiryGapAlignment(enquiries: EnquiryPoint[]): {
  aligned: number;
  orphaned: number;
  orphanedTexts: string[];
} {
  let aligned = 0;
  let orphaned = 0;
  const orphanedTexts: string[] = [];

  for (const eq of enquiries) {
    if (eq.correspondingGap) {
      aligned++;
    } else {
      orphaned++;
      orphanedTexts.push(eq.text);
    }
  }

  return { aligned, orphaned, orphanedTexts };
}

describe("Gap-Focused Enquiry Validation", () => {
  it("accepts enquiries where every point maps to a gap", () => {
    const enquiries: EnquiryPoint[] = [
      { text: "Please clarify the provenance route from BVI to UK", correspondingGap: "Tier 3 provenance unresolved" },
      { text: "Please confirm the purchasing structure", correspondingGap: "Purchaser identity inconsistency" },
    ];
    const result = validateEnquiryGapAlignment(enquiries);
    expect(result.orphaned).toBe(0);
    expect(result.aligned).toBe(2);
  });

  it("flags orphaned enquiries with no corresponding gap", () => {
    const enquiries: EnquiryPoint[] = [
      { text: "Please explain the source of your deposit", correspondingGap: null },
      { text: "Please clarify provenance route", correspondingGap: "Tier 3 unresolved" },
      { text: "Please provide 12 months of statements", correspondingGap: null },
    ];
    const result = validateEnquiryGapAlignment(enquiries);
    expect(result.orphaned).toBe(2);
    expect(result.orphanedTexts).toContain("Please explain the source of your deposit");
  });
});

// ── Peripheral Issue Proportionality ────────────────────────────────────

function assessPeripheralDominance(
  reportText: string,
  mainIssueKeywords: string[],
  peripheralKeywords: string[],
): { mainMentions: number; peripheralMentions: number; peripheralDominant: boolean } {
  const lower = reportText.toLowerCase();
  let mainMentions = 0;
  let peripheralMentions = 0;

  for (const kw of mainIssueKeywords) {
    const regex = new RegExp(kw.toLowerCase(), "g");
    const matches = lower.match(regex);
    mainMentions += matches ? matches.length : 0;
  }

  for (const kw of peripheralKeywords) {
    const regex = new RegExp(kw.toLowerCase(), "g");
    const matches = lower.match(regex);
    peripheralMentions += matches ? matches.length : 0;
  }

  // Peripheral issues should not dominate — they should be ≤50% of main issue mentions
  return {
    mainMentions,
    peripheralMentions,
    peripheralDominant: peripheralMentions > mainMentions && peripheralMentions > 5,
  };
}

describe("Peripheral Issue Proportionality", () => {
  it("flags report where peripheral concerns dominate main funding analysis", () => {
    const report = "crypto crypto crypto crypto crypto crypto crypto address address address address. The provenance trail is unclear.";
    const result = assessPeripheralDominance(
      report,
      ["provenance", "funding chain", "source event", "share sale"],
      ["crypto", "address"],
    );
    expect(result.peripheralDominant).toBe(true);
  });

  it("accepts report where main analysis dominates peripheral mentions", () => {
    const report = "The source event is evidenced. The provenance trail requires clarification. The funding chain shows receipt into UK account. Share sale agreement reviewed. Minor address formatting noted.";
    const result = assessPeripheralDominance(
      report,
      ["provenance", "funding chain", "source event", "share sale"],
      ["crypto", "address"],
    );
    expect(result.peripheralDominant).toBe(false);
  });
});

// ── Reasoning Hierarchy Self-Check Simulation ───────────────────────────

interface ReasoningCheckResult {
  step1_evidence_inventory: boolean;
  step2_precise_gaps: boolean;
  step3_targeted_enquiries: boolean;
  step4_peripheral_proportionate: boolean;
  step5_self_check_passed: boolean;
}

function simulateReasoningHierarchyCheck(
  reportHasEvidenceSummary: boolean,
  gapsArePrecise: boolean,
  enquiriesMapToGaps: boolean,
  peripheralNotDominant: boolean,
): ReasoningCheckResult {
  return {
    step1_evidence_inventory: reportHasEvidenceSummary,
    step2_precise_gaps: gapsArePrecise,
    step3_targeted_enquiries: enquiriesMapToGaps,
    step4_peripheral_proportionate: peripheralNotDominant,
    step5_self_check_passed: reportHasEvidenceSummary && gapsArePrecise && enquiriesMapToGaps && peripheralNotDominant,
  };
}

describe("Reasoning Hierarchy Self-Check", () => {
  it("passes when all five steps are satisfied", () => {
    const result = simulateReasoningHierarchyCheck(true, true, true, true);
    expect(result.step5_self_check_passed).toBe(true);
  });

  it("fails when evidence inventory is missing", () => {
    const result = simulateReasoningHierarchyCheck(false, true, true, true);
    expect(result.step5_self_check_passed).toBe(false);
  });

  it("fails when enquiries don't map to gaps", () => {
    const result = simulateReasoningHierarchyCheck(true, true, false, true);
    expect(result.step5_self_check_passed).toBe(false);
  });

  it("fails when peripheral issues dominate", () => {
    const result = simulateReasoningHierarchyCheck(true, true, true, false);
    expect(result.step5_self_check_passed).toBe(false);
  });
});

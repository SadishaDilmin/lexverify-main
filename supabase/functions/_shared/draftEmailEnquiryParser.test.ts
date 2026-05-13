import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseDraftEmailEnquiries, stripAiMergeMarkers } from "./draftEmailEnquiryParser.ts";

Deno.test("parseDraftEmailEnquiries excludes only Decision-Log-style supervisory artefacts (not Section 6A/10A enquiries)", () => {
  // Decision Log + decision-log "Additional enquiry" blocks must be dropped.
  // Material Inbound Credit Review and Evidence Format Rule are real
  // client-facing enquiries about real transactions/evidence — they MUST pass
  // through to the tracker.
  const draftEmail = `
**1. Identity Document**
Please provide a clear copy of your passport.

**2. Decision Log**
This internal section records supervisory reasoning only.

### Additional enquiry — Decision Log
Record the rule applied and why no further client enquiry is needed.

### Additional enquiry — Material Inbound Credit Review (Section 6A-2)
Please explain the source of the £1,000 credit from S Mohamed.

### Additional enquiry — Evidence Format Rule (Screenshot Rejection)
Please provide official PDF bank statements rather than screenshots.
`;

  const parsed = parseDraftEmailEnquiries(draftEmail);
  const numbers = parsed.map((item) => item.enquiry_number);
  // Identity (1) + the two synthesised "Additional enquiry" rows survive.
  // Decision Log items (2 + the Decision Log Additional enquiry) are dropped.
  assertEquals(numbers.length, 3, `expected 3 surviving enquiries, got: ${JSON.stringify(parsed.map((p) => ({n:p.enquiry_number,c:p.category,s:p.issue_summary})))}`);
  assertEquals(parsed[0]?.enquiry_number, "1");
  assertEquals(parsed[0]?.category, "Identity");
  // Neither surviving "Additional enquiry" is a Decision Log artefact.
  for (const p of parsed) {
    assertFalse(/decision\s*log/i.test(p.issue_summary), `Decision Log leaked: ${p.issue_summary}`);
    assertFalse(/decision\s*log/i.test(p.original_enquiry_text), `Decision Log leaked: ${p.original_enquiry_text}`);
  }
});

Deno.test("parseDraftEmailEnquiries supports inline numbered draft-email items", () => {
  const draftEmail = `
1. **Identity Document:** Please provide a clear copy of your passport.
2. **Proof of Address:** Please provide a utility bill dated within the last 3 months.
3. **Funding:** Please explain the £1,000 payment from S Mohamed.
`;

  const parsed = parseDraftEmailEnquiries(draftEmail);

  assertEquals(parsed.map((item) => item.enquiry_number), ["1", "2", "3"]);
  assertEquals(parsed.map((item) => item.category), ["Identity", "Proof of Address", "Source of Funds"]);
});
Deno.test("stripAiMergeMarkers removes single-line and multi-line ai-merge HTML comments", () => {
  const input = `Hello <!-- ai-merge: enquiry-for=abc section="X" --> world\n<!-- ai-merge: finding=123 -->\nKeep this line.`;
  const out = stripAiMergeMarkers(input);
  assertFalse(/ai-merge/i.test(out), `marker leaked: ${out}`);
  assert(out.includes("Keep this line."));
  assert(out.includes("Hello") && out.includes("world"));
});

Deno.test("parseDraftEmailEnquiries strips ai-merge markers from every persisted field", () => {
  const draftEmail = `
**1. Identity Document**
Please provide a clear copy of your passport.

<!-- ai-merge: enquiry-for=32d1780f65dab202ea120fd7ee973a3ce61554b8c923d914410637e8ea9715ff section="Section 10A" -->
### Additional enquiry — Own-Account Transfer Verification
Could you please provide clarity on the smaller credits received from 'EVRI LIMITED' and 'Collective Society Ltd' into both your joint and single Halifax accounts?
`;

  const parsed = parseDraftEmailEnquiries(draftEmail);
  for (const item of parsed) {
    assertFalse(/ai-merge/i.test(item.original_enquiry_text), `original_enquiry_text leaked marker: ${item.original_enquiry_text}`);
    assertFalse(/ai-merge/i.test(item.evidence_required), `evidence_required leaked marker: ${item.evidence_required}`);
    assertFalse(/ai-merge/i.test(item.issue_summary), `issue_summary leaked marker: ${item.issue_summary}`);
  }
});

Deno.test("parseDraftEmailEnquiries always populates evidence_required (never empty)", () => {
  const draftEmail = `
**1. Personal Profile**
Section 5C header is missing from the report. No Personal Profile block found for: Nkem Renaldo Stewart, Evangelia Gkata.

**2. Identity Document**
Please provide a clear copy of your passport.
`;

  const parsed = parseDraftEmailEnquiries(draftEmail);
  assertEquals(parsed.length, 2);
  for (const item of parsed) {
    assert(item.evidence_required.length > 0, `evidence_required empty for "${item.issue_summary}"`);
  }
});

import { collapseNearDuplicates } from "./draftEmailEnquiryParser.ts";

Deno.test("collapseNearDuplicates collapses two near-identical numbered enquiries about the same transaction", () => {
  // Real-world reproduction: items 6 and 7 from case 3202f6f3 — both about
  // the same £1,000 credit from S Mohamed, just under different section labels.
  const draftEmail = `
**6. Material Inbound Credit Review (Section 6A-2)**
Please explain the source and purpose of the £1,000.00 credit received on 29 January 2026 from 'S Mohamed'.

**7. Material Credit Anti-Bundling (Section 6A-2)**
Could you please provide evidence for the source of the £1,000.00 credit received into your account on 29 January 2026 from 'S Mohamed', and explain the purpose of this transaction?

**8. Identity Document**
Please provide a clear copy of your passport.
`;
  const parsed = parseDraftEmailEnquiries(draftEmail);
  // Expect: 6 kept, 7 collapsed as duplicate, 8 (genuinely different) kept.
  assertEquals(parsed.map((p) => p.enquiry_number), ["6", "8"]);
});

Deno.test("collapseNearDuplicates does NOT collapse genuinely distinct enquiries", () => {
  // Two enquiries that share the word 'provide' and 'statement' but are about
  // different topics must both survive.
  const items = [
    { enquiry_number: "1", category: "Identity", issue_summary: "Please provide a clear copy of your passport.", original_enquiry_text: "**1. Identity**\nPlease provide a clear copy of your passport.", evidence_required: "x" },
    { enquiry_number: "2", category: "Income",   issue_summary: "Please provide three months of payslips from your employer.", original_enquiry_text: "**2. Income**\nPlease provide three months of payslips from your employer.", evidence_required: "x" },
    { enquiry_number: "3", category: "Source of Funds", issue_summary: "Please explain the £14,000 credit from the sale of two cars.", original_enquiry_text: "**3. Source of Funds**\nPlease explain the £14,000 credit from the sale of two cars.", evidence_required: "x" },
  ];
  const out = collapseNearDuplicates(items);
  assertEquals(out.length, 3);
});

Deno.test("parser no longer drops legitimate Section 6A / 10A enquiries flagged by old internalTitlePattern", () => {
  // Regression: a previous over-broad filter dropped these as 'internal QA
  // artefacts'. They are real client enquiries about real transactions.
  const draftEmail = `
**1. Material Inbound Credit Review (Section 6A-2)**
Please explain the £500 credit from 'J Bloggs' on 1 March 2026.

**2. Own-Account Transfer Verification (Section 10A)**
Could you confirm the originating account for the £2,000 transfer marked 'From A/C XXXXXXXX'?

**3. Evidence Format Rule (Screenshot Rejection)**
Please provide official PDF bank statements rather than image files.
`;
  const parsed = parseDraftEmailEnquiries(draftEmail);
  assertEquals(parsed.map((p) => p.enquiry_number), ["1", "2", "3"]);
});

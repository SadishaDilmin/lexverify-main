/**
 * Prompt-sectioned parallel worker domains for Olimey AI Open Banking analysis.
 * 
 * Instead of splitting documents by page range with the FULL prompt for each worker,
 * we split the PROMPT ITSELF into specialist domains. Each worker becomes a domain
 * expert, processing the relevant document sections against a focused set of instructions.
 */

// ── Domain definitions ──────────────────────────────────────────────────

export interface PromptDomain {
  id: string;
  label: string;
  /** Keywords that match document classifications / names to this domain */
  docPatterns: RegExp[];
  /** Section markers in the deployed prompt that belong to this domain */
  promptSectionMarkers: RegExp[];
  /** Fallback: if no sections match, use this focused instruction */
  fallbackInstruction: string;
}

export const PROMPT_DOMAINS: PromptDomain[] = [
  {
    id: "income-employment",
    label: "Income & Employment",
    docPatterns: [
      /payslip/i, /pay[_\s-]*slip/i, /salary/i, /p60/i, /p45/i,
      /employment/i, /sa302/i, /sa100/i, /tax[_\s-]*return/i,
      /tax[_\s-]*computation/i, /employer/i, /hmrc/i,
      /income/i, /dividend/i, /royalt/i, /pension/i,
    ],
    promptSectionMarkers: [
      /###?\s*\d*\.?\s*Income\s*[&]\s*Wealth\s*Review/i,
      /###?\s*\d*\.?\s*Background\s*Section/i,
      /###?\s*\d*\.?\s*Identity\s*Document\s*Cross-Check/i,
      /###?\s*\d*\.?\s*Companies\s*House\s*Identity/i,
      /salary\s*analysis/i,
      /employment\s*verification/i,
      /payslip\s*matching/i,
    ],
    fallbackInstruction: `Focus ONLY on Income & Employment analysis:
- Verify salary credits match payslips or employment documentation
- Check P60/P45/SA302 consistency with declared employment
- Validate employer details and income patterns
- Flag any income discrepancies or unexplained employment gaps
- Apply the Aggregation Rule for recurring credits
- Produce a structured findings section for Income & Employment only.`,
  },
  {
    id: "wealth-savings",
    label: "Wealth & Savings",
    docPatterns: [
      /savings/i, /investment/i, /isa/i, /pension/i,
      /wealth[_\s-]*report/i, /portfolio/i, /endowment/i,
      /inheritance/i, /probate/i, /death[_\s-]*cert/i,
      /sale[_\s-]*proceeds/i, /completion[_\s-]*statement/i,
    ],
    promptSectionMarkers: [
      /Source\s*of\s*(?:the\s*)?Source.*Mandate/i,
      /Wealth\s*Formation\s*Timeline/i,
      /savings\s*analysis/i,
      /ISA\s*limit/i,
      /investment\s*proceeds/i,
    ],
    fallbackInstruction: `Focus ONLY on Wealth & Savings analysis:
- Trace the formation of savings and wealth over time
- Verify ISA limits and investment proceeds
- Check inheritance documentation (grants of probate, death certificates)
- Validate sale proceeds from previous properties
- Apply the "Source of Source" mandate for savings transfers >£5,000
- Build the Wealth Formation Timeline for this domain
- Produce a structured findings section for Wealth & Savings only.`,
  },
  {
    id: "funding-transactions",
    label: "Funding & Transactions",
    docPatterns: [
      /armalytix/i, /open[_\s-]*banking/i, /source[_\s-]*of[_\s-]*funds/i,
      /bank[_\s-]*statement/i, /statement[_\s-]?\d/i,
      /mortgage/i, /gift[_\s-]*letter/i, /gift[_\s-]*declaration/i,
      /funding/i, /deposit/i, /contribution/i,
      /affordability/i, /truelayer/i, /plaid/i,
      /account[_\s-]*summary/i, /ledger/i,
    ],
    promptSectionMarkers: [
      /Material\s*Inbound\s*Credit\s*Review/i,
      /§\s*6A-2/i,
      /Section\s*6A-2/i,
      /Funding\s*Gap/i,
      /SDLT/i,
      /Non-Salary\s*Credit\s*Audit/i,
      /Unexplained\s*Non-Salary\s*Credits/i,
      /Source\s*of\s*Funds\s*Results/i,
      /Transaction\s*History\s*Cross-Verification/i,
      /Multi-Account\s*Awareness/i,
      /Intra-Account\s*Transfer/i,
      /Unknown\s*Third-Party\s*Funding/i,
      /gift\s*verification/i,
      /mortgage/i,
      /PRE-ANALYSIS\s*FUNDING\s*SUFFICIENCY/i,
    ],
    fallbackInstruction: `Focus ONLY on Funding & Transaction analysis:

## ARMALYTIX STRUCTURED DATA AWARENESS
If structured Armalytix reconciliation outputs are provided (source reconciliation table, funding chain summary, exceptions, draft enquiries), use them as the PRIMARY analytical framework for this domain. Cross-reference structured exceptions against document evidence. Do not re-derive what the structured pipeline has already computed — validate and refine. If no structured Armalytix outputs are provided, perform the full analysis from documents as normal.

## MANDATORY: Material Inbound Credit Review (Section 6A-2)
EVERY non-salary credit ≥£1,000 (or recurring pattern of smaller credits from the same source) in any bank statement or Open Banking report MUST be individually addressed. For each material credit, you MUST either:
(a) explain the credit with evidence from the documents, OR
(b) raise a specific enquiry citing the EXACT date, amount, and transaction narrative (e.g. 'From A/C XXXXXXXX').
Credits described as transfers from unlinked accounts MUST trigger an enquiry unless the originating account is verified in the evidence package. DO NOT summarise credits in aggregate — each one must be listed individually.

**ANTI-BUNDLING RULE — STRICTLY ENFORCED**: One row per credit in the Material Inbound Credits Review table. One numbered enquiry line per credit in the draft client email, citing the exact date, exact amount, and the transaction narrative as it appears in the statement. A bundled enquiry such as "please provide information on all payments over £1,000" or "please explain various unexplained credits" is FORBIDDEN. Recurring credits from the same identical payer may be grouped into one enquiry ONLY when (a) the payer string is identical, (b) at least 3 occurrences exist, and (c) every individual date and amount is still listed underneath the grouped heading.

## MANDATORY: Own-Account Transfer Verification (Section 10A)
Credits described as "From A/C XXXXXXXX" or similar patterns MUST only be treated as benign own-account transfers if the originating account is (a) linked in the open banking report OR (b) provided as a separate statement. Otherwise, raise an enquiry asking who the transfer is from, why it was received, and request the originating account statement.

## MANDATORY: Completion Readiness Check (Step 5.5)
Compare actual liquid balances visible in evidence against net funds required for completion (Purchase Price + SDLT + Legal Fees - Mortgage). If a shortfall exists, raise an enquiry. This section is ALWAYS required when financial data is present.

- Perform the Material Inbound Credit Review (Section 6A-2): categorise EVERY material credit
- Build the Non-Salary Credit Audit table
- Analyse Armalytix Source of Funds Results (both Summary and Detailed Response)
- Cross-verify transaction history against declared sources
- Apply Multi-Account Awareness for intra-account transfers
- Detect Unknown Third-Party Funding
- Calculate the Funding Gap (purchase price + SDLT + legal fees - mortgage - declared funds)
- Verify gift amounts and gift letters
- Produce structured findings for Funding & Transactions only.`,
  },
  {
    id: "risk-compliance",
    label: "Risk & Compliance",
    docPatterns: [
      /passport/i, /driving[_\s-]*licen/i, /photo[_\s-]*id/i,
      /identity/i, /id[_\s-]*check/i, /id[_\s-]*verif/i,
      /liveness/i, /biometric/i, /selfie/i,
      /lexisnexis/i, /idu/i, /sanctions/i, /pep/i,
      /aml/i, /ml[_\s-]*check/i, /screening/i,
      /proof[_\s-]*of[_\s-]*address/i, /utility[_\s-]*bill/i,
      /council[_\s-]*tax/i, /thirdfort/i, /infotrak/i,
    ],
    promptSectionMarkers: [
      /AML\s*(?:Risk\s*)?(?:Rating|Indicators)/i,
      /PEP/i,
      /sanctions/i,
      /cash\s*deposits/i,
      /structured\s*transfer/i,
      /LSAG\s*compliance/i,
      /Red\s*Flag/i,
      /Enhanced\s*Due\s*Diligence/i,
      /Visual\s*Forgery\s*Heuristics/i,
      /Identity\s*Verification/i,
      /LSAG\s*Compliance\s*Checklist/i,
      /Document\s*Authenticity/i,
      /Jurisdiction\s*Risk/i,
    ],
    fallbackInstruction: `Focus ONLY on Risk & Compliance analysis:

## ARMALYTIX PROVENANCE AWARENESS
If structured Armalytix provenance and verification data is provided, use it to distinguish between client declarations, bank evidence, uploaded documents, manual entries, AI-inferred links and reviewer-confirmed findings. Never treat client declarations within the Armalytix report as independently verified unless supported by bank data or uploaded documents. If no structured Armalytix outputs are provided, apply standard documentary verification rules.

## MANDATORY: Evidence Format Rule (Screenshot Rejection)
If any uploaded document appears to be a screenshot of a bank statement (PNG/JPG of financial data, cropped images, photos of screens), you MUST explicitly reject it and request an official PDF download or open banking linking. Non-financial screenshots (LinkedIn, employer sites) are acceptable. Check file extensions — .png/.jpg files named "bank_statement" or "source_of_funds" are likely screenshots and MUST be rejected.

## MANDATORY: Employment Role & Tenure Enquiry
When salary credits identify an employer but the specific job role/title and tenure are NOT discernible from documents, you MUST raise a targeted enquiry requesting: (1) job role/title, (2) tenure/start date, and (3) LinkedIn or employer profile link.

## MANDATORY: OCR / Image-Extraction Discrepancy Safeguard (Forger-Motive Sanity Check)
For any image-sourced identity field (passport number, MRZ digits, date of birth, expiry/issue date, name spelling, driving-licence number, NI number, account/sort code on a scanned statement) where two reads of the SAME physical artefact disagree by only ONE or TWO characters, treat the disagreement as an OCR / image-extraction artefact rather than fraud. A genuine forger has no rational motive to fabricate a document that differs from the original by a single digit — there is no benefit to a near-clone. Default classification for such near-identical disagreements: **Amber — manual visual review**, never Red / Critical. Do NOT use language such as "passport numbers do not match", "conflicting passports", "two different passport numbers", "presence of different passport numbers", "critical identity discrepancy", or "indicator of identity (document) fraud" in this case.

**MULTI-FILENAME CLAUSE**: This safeguard applies regardless of how many filenames the images are stored under. If two image files purport to be the SAME person's passport (e.g. \`Nkem_-_Passport.png\` and \`Client_Passport.png\`), and the ID-field values differ by only 1–2 characters, treat the disagreement as an OCR / image-extraction artefact, NOT as evidence of two different documents. The same rule applies to a single passport image where the VIZ and MRZ are read separately and disagree by 1–2 characters — that is one physical artefact read twice, not two documents. Worked counter-example: \`R0258841\` (from \`Nkem_-_Passport.png\`) vs \`R0258641\` (from \`Client_Passport.png\`) for the same named individual — edit distance 1, both \`.png\` — classify as Amber manual review, NOT as conflicting passports / identity fraud.

When an identity document summary contains an '--- OCR-CORROBORATION ---' block (two independent OCR reads of the same image), record in the Decision Log whether the two reads agreed verbatim or differed, and state the conclusion. Use the second read to corroborate, not to multiply false-positive findings. The safeguard does NOT apply to: (a) two genuinely different documents (e.g. passport vs driving licence), (b) cross-source amount/date mismatches in financial transactions, or (c) high-stakes Visual Forgery Heuristic signals — those continue to escalate normally.

- Assess AML red flags, fraud indicators, and jurisdiction risk
- Check PEP/sanctions status for all persons
- Perform identity document cross-checks and visual forgery heuristics
- Verify proof of address documentation
- Apply the LSAG Compliance Checklist
- Detect structured transfers and cash deposit patterns
- Apply Enhanced Due Diligence where PEP status requires it
- Assign the overall AML risk rating
- Produce structured findings for Risk & Compliance only.`,
  },
];

// ── Shared preamble sections (sent to ALL workers) ──────────────────────

const SHARED_SECTION_MARKERS = [
  /^##\s*SCOPE/im,
  /^##\s*PROPORTIONALITY/im,
  /^##\s*STRUCTURED\s*FORM\s*INPUT/im,
  /^##\s*DOCUMENT\s*HANDLING/im,
  /^##\s*DOCUMENT\s*ACCEPTANCE/im,
  /^##\s*KNOWLEDGE\s*BASE\s*CITATION/im,
  /^##\s*BANK\s*ACCOUNT\s*PRIVACY/im,
  /^##\s*CORE\s*STRUCTURED\s*ANALYSIS/im,
  /^##\s*OUTPUT\s*FORMAT/im,
];

// ── Prompt splitting logic ──────────────────────────────────────────────

/**
 * Extract the shared preamble from the full deployed prompt.
 * The preamble includes role definition, scope, proportionality,
 * form input rules, and document handling — sections every worker needs.
 */
export function extractSharedPreamble(fullPrompt: string): string {
  // Take everything up to the first domain-specific section
  // The preamble typically includes everything before "## ANALYSIS RULES"
  // or "## CORE STRUCTURED ANALYSIS FRAMEWORK"
  const analysisRulesIdx = fullPrompt.search(/^##\s*ANALYSIS\s*RULES/im);
  const coreFrameworkIdx = fullPrompt.search(/^##\s*CORE\s*STRUCTURED\s*ANALYSIS\s*FRAMEWORK/im);
  
  const cutoff = Math.min(
    ...[analysisRulesIdx, coreFrameworkIdx].filter(i => i > 0)
  );
  
  if (cutoff > 0 && cutoff < fullPrompt.length * 0.8) {
    return fullPrompt.slice(0, cutoff).trim();
  }
  
  // Fallback: return first 40% of prompt as preamble
  return fullPrompt.slice(0, Math.floor(fullPrompt.length * 0.4)).trim();
}

/**
 * Extract domain-specific sections from the full prompt by matching
 * section headings/markers that belong to this domain.
 */
export function extractDomainSections(fullPrompt: string, domain: PromptDomain): string {
  const sections: string[] = [];
  
  for (const marker of domain.promptSectionMarkers) {
    const idx = fullPrompt.search(marker);
    if (idx === -1) continue;
    
    // Find the start of this section (go back to nearest ## or ###)
    let sectionStart = idx;
    const beforeText = fullPrompt.slice(Math.max(0, idx - 200), idx);
    const headingMatch = beforeText.match(/(?:^|\n)(#{2,3}\s+[^\n]+)\n[^#]*$/);
    if (headingMatch) {
      sectionStart = idx - (beforeText.length - beforeText.lastIndexOf(headingMatch[1]));
    }
    
    // Find the end of this section (next ## heading or end of prompt)
    const afterText = fullPrompt.slice(idx + 1);
    const nextHeading = afterText.search(/\n#{2}\s+/);
    const sectionEnd = nextHeading > 0 ? idx + 1 + nextHeading : fullPrompt.length;
    
    const section = fullPrompt.slice(sectionStart, sectionEnd).trim();
    if (section.length > 50 && !sections.includes(section)) {
      sections.push(section);
    }
  }
  
  return sections.length > 0
    ? sections.join("\n\n")
    : domain.fallbackInstruction;
}

/**
 * Build a domain-specific system prompt for a parallel worker.
 */
export function buildDomainPrompt(
  fullPrompt: string,
  domain: PromptDomain,
  totalDomains: number,
  contextInjection: string,
  knowledgeContext: string,
): string {
  const preamble = extractSharedPreamble(fullPrompt);
  const domainSections = extractDomainSections(fullPrompt, domain);
  
  const domainDirective = `

## PARALLEL WORKER DIRECTIVE
You are operating as a SPECIALIST WORKER for the "${domain.label}" domain.
This is 1 of ${totalDomains} parallel workers, each handling a different analytical domain.
A consolidation pass will merge all domain results into a single unified report.

**Your scope**: Focus ONLY on ${domain.label} findings. Do NOT produce a full report — 
produce a structured analysis covering ONLY your domain. Use markdown headings and 
include all relevant evidence citations.

**Cross-domain references**: If you identify something relevant to another domain 
(e.g., a transaction that also has AML implications), note it briefly as a 
"Cross-Domain Flag" at the end of your output so the consolidation pass can route it correctly.
`;

  return [
    preamble,
    domainDirective,
    domainSections,
    contextInjection,
    knowledgeContext,
  ].filter(Boolean).join("\n\n");
}

// ── Document-to-domain mapping ──────────────────────────────────────────

/**
 * Map document summaries to the most relevant domain(s).
 * Each summary is assigned to AT LEAST one domain. Financial docs 
 * (Armalytix, bank statements) go to funding-transactions.
 * Documents that match no specific domain go to ALL domains.
 */
export function mapDocsToDomains(
  docSummaries: string[],
): Map<string, string[]> {
  const domainDocs = new Map<string, string[]>();
  for (const domain of PROMPT_DOMAINS) {
    domainDocs.set(domain.id, []);
  }

  const FULL_SPECTRUM_FINANCIAL_DOC_PATTERN = /armalytix|open[_\s-]*banking|source[_\s-]*of[_\s-]*(funds|wealth)|truelayer|plaid|affordability|wealth[_\s-]*report/i;

  for (const summary of docSummaries) {
    const nameMatch = summary.match(/\[Document:\s*([^\]\[]+?)(?:\s*\[Tagged to:.*?\])?\]/);
    const docName = nameMatch?.[1]?.trim().toLowerCase() || "";
    const leadingContent = summary.slice(0, 4000);

    // Armalytix / Open Banking reports are full-spectrum evidence packs.
    // They contain income, savings, funding, and risk data, so every specialist
    // worker must receive them — not just funding-transactions.
    if (FULL_SPECTRUM_FINANCIAL_DOC_PATTERN.test(docName) || FULL_SPECTRUM_FINANCIAL_DOC_PATTERN.test(leadingContent)) {
      for (const domain of PROMPT_DOMAINS) {
        domainDocs.get(domain.id)!.push(summary);
      }
      continue;
    }
    
    let matched = false;
    for (const domain of PROMPT_DOMAINS) {
      if (domain.docPatterns.some(p => p.test(docName))) {
        domainDocs.get(domain.id)!.push(summary);
        matched = true;
      }
    }
    
    // Unmatched docs go to ALL domains (they may contain relevant info)
    if (!matched) {
      for (const domain of PROMPT_DOMAINS) {
        domainDocs.get(domain.id)!.push(summary);
      }
    }
  }
  
  return domainDocs;
}

/**
 * Detect whether the document set contains Open Banking / Armalytix reports
 * that would benefit from domain-split parallel processing.
 */
export function hasOpenBankingDocs(docSummaries: string[]): boolean {
  const OB_PATTERN = /armalytix|open[_\s-]*banking|source[_\s-]*of[_\s-]*funds|truelayer|plaid|affordability|wealth[_\s-]*report/i;
  return docSummaries.some(s => {
    const nameMatch = s.match(/\[Document:\s*([^\]\[]+)/);
    const name = nameMatch?.[1] || "";
    return OB_PATTERN.test(name) || OB_PATTERN.test(s.slice(0, 500));
  });
}

/**
 * Minimum doc count to trigger domain-split parallel processing.
 * Below this threshold, the overhead of 4 workers isn't justified.
 */
export const MIN_DOCS_FOR_DOMAIN_SPLIT = 3;

/**
 * Armalytix Conditional Prompt Module
 *
 * Provides:
 * 1. ARMALYTIX_CONDITIONAL_PROMPT — injected into system prompt when structured data exists
 * 2. buildArmalytixContextBlock — serialises FullAnalysisResult into user-message context
 * 3. shouldActivateArmalytixModule — checks if armalytix_reports row exists
 * 4. fetchStructuredArmalytixData — fetches all sow_* tables for runFullAnalysis
 *
 * This module layers onto the existing Olimey AI prompt without replacing it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FullAnalysisResult } from './contradictionDetector';
import type { DraftEnquiry } from './enquiryGenerator';
import type { ExceptionItem } from './exceptionEngine';
import type { DecisionSupportOutput } from './decisionSupportEngine';
import type { SourceReconciliation, FundingChainSummary } from './reconciliationEngine';

// ── Conditional prompt block ─────────────────────────────────────

export const ARMALYTIX_CONDITIONAL_PROMPT = `

## ARMALYTIX STRUCTURED ANALYSIS PROTOCOL

**ACTIVATION CONDITION**: This protocol activates ONLY when structured Armalytix pipeline outputs are provided below. If no structured outputs are present, follow the standard Olimey AI source-of-funds review pathway.

**IMPORTANT**: This module SUPPLEMENTS the existing Olimey AI rules. All base AML/SoF analysis instructions remain in force. This adds Armalytix-specific discipline when structured data is available.

### AVAILABILITY & SUITABILITY RULE

- If structured Armalytix reconciliation, exceptions and decision-support data are provided → follow this Armalytix review protocol as the PRIMARY analytical framework.
- If Armalytix data is ABSENT → use the standard Olimey AI source-of-funds review pathway. Do NOT weaken the analysis.
- If Armalytix covers only SOME sources (e.g. UK bank accounts but not overseas or investment accounts) → use this protocol for Armalytix-covered sources AND the standard documentary review for non-Armalytix sources. COMBINE both.
- If funds are in foreign accounts, investment platforms, savings products, corporate structures or other non-Armalytix-supported sources → review those through the normal documentary/evidence pathway. Do NOT ignore them.

### STAGE 1 — USE STRUCTURED INPUTS FIRST

When structured Armalytix outputs are provided, PRIORITISE them over re-deriving from raw document text:
- Matter/purchase facts (purchase price, mortgage, amount to prove, excess/shortfall)
- Party data and co-buyer contributions
- Connected account data and balances
- Manual balances and their evidence status
- Source-of-funds records with declared amounts and verification statuses
- Provenance and verification statuses for each data item
- Income verification data (salary matching, employer verification)
- Transaction classifications and materiality assessments
- Source reconciliation results (supported vs unsupported amounts per source)
- Funding chain summary (total evidenced, total shortfall, reconciliation ratio)
- Exceptions and risk flags with severity ratings
- Draft enquiries with priority and category
- Reviewer summary (accepted vs unresolved items)
- Decision-support outputs (overall status, clearance blockers, evidence gaps)

Use the original Armalytix report text only as a SECONDARY source where structured data is missing, ambiguous or inconsistent.

### STAGE 2 — PROVENANCE DISCIPLINE

Explicitly distinguish between data origins in your analysis:
- **Client declarations** (inside Armalytix journey) — NEVER treated as independently verified
- **Bank/Open Banking evidence** — Tier 1, high confidence
- **Uploaded document evidence** — verified only if file confirmed present
- **Manual entries** — unverified unless independently supported
- **AI-inferred links** — pending reviewer confirmation
- **Reviewer-confirmed findings** — highest confidence

When reporting findings, state the provenance basis. Do NOT present client answers within the Armalytix report as independently confirmed facts.

### STAGE 3 — REQUIRE RECONCILIATION BEFORE CONCLUSION

Before concluding that source of funds is adequately explained, review the structured reconciliation outputs for:
- Supported vs unsupported declared amounts per source
- Unexplained incoming funds (amount and count)
- Unresolved manual balances relied upon for completion
- Co-buyer / gift attribution gaps
- Timing mismatches between declared receipt and observed transactions
- Contradictions between declarations and evidence
- Funding shortfall or unexplained excess
- Unmatched material transactions

Do NOT conclude "funds adequately explained" if the structured outputs show material unresolved items.

### STAGE 4 — EXCEPTION-LED REVIEW

Explicitly address each structured exception/risk flag provided, especially:
- Material exceptions (high/critical severity)
- Unmatched or unresolved incoming items ≥£1,000
- Manual balances relied upon but not fully evidenced
- Declared sources that remain partially verified or contradicted
- Funding chain gaps or shortfalls

Each material exception must be either:
(a) explained with evidence reference, or
(b) raised as a specific enquiry.

Do NOT silently drop exceptions.

### STAGE 5 — PROPORTIONATE ENQUIRY DISCIPLINE

Use the structured draft enquiries as your starting framework. Refine them where needed:
- Adopt the priority ordering (critical → high → medium → low)
- Distinguish mandatory vs discretionary enquiries
- Avoid duplicating enquiries that address the same underlying issue
- Do NOT ask for evidence that the structured outputs show as already accepted
- Do NOT treat inferred issues as confirmed — use qualified language
- Do NOT over-escalate immaterial points
- Maintain professional, polite, specific enquiry wording

### STAGE 6 — REVIEWER-READY STRUCTURED OUTPUT

When Armalytix structured data is available, produce your output in these sections:

1. **Funding Overview** — purchase price, mortgage, amount to prove, total evidenced, shortfall/excess
2. **Supported / Apparently Supported Sources** — sources where reconciliation shows adequate evidence
3. **Partially Supported or Unresolved Sources** — sources with gaps, partial evidence or pending verification
4. **Unexplained / Contradictory / Material Issues** — contradictions, unexplained large credits, material exceptions
5. **Manual Balances & Evidence Position** — manual balances relied upon, their evidence status
6. **Co-Buyer / Gift / Third-Party Funding Position** — attribution, evidence gaps, donor verification
7. **Transactions of Concern or Requiring Explanation** — material unmatched transactions, suspicious patterns
8. **Enquiries to Raise** — grouped by priority (mandatory first, then discretionary)
9. **Reviewer Decision-Support Summary** — overall status, blockers, evidence gap summary

When Armalytix is NOT used, continue using the existing broader Olimey AI report format.

### NON-NEGOTIABLE RULES (ARMALYTIX)

1. NEVER treat a client declaration in Armalytix as independently verified unless supported by bank data, uploaded documents, or reviewer confirmation.
2. ALWAYS review structured exceptions and unmatched items before concluding.
3. ALWAYS assess whether the amount being relied upon for the purchase can actually be explained through a coherent funding chain.
4. If declared sources do not fully reconcile with observed transactions, balances or evidence — say so clearly.
5. If a source is partially supported, describe it as "partially supported" — do not present it as fully verified.
6. Preserve uncertainty where linkage is inferred rather than proven.
7. Do NOT rely only on Armalytix summary sections if transaction-level data or exception outputs show additional issues.
8. Distinguish clearly between: accepted / apparently supported, unresolved / needs review, contradicted / unsupported.
9. If the structured pipeline identifies a funding shortfall, do NOT conclude "funds are adequate" without addressing it.
10. If structured exceptions exist for gifts, loans, overseas funds, gambling activity or third-party credits, these MUST be addressed explicitly.
`;

// ── Context block builder ────────────────────────────────────────

/**
 * Serialise FullAnalysisResult into a structured markdown block
 * for injection into the user message context.
 */
export function buildArmalytixContextBlock(analysis: FullAnalysisResult): string {
  const sections: string[] = [];

  sections.push('## STRUCTURED ARMALYTIX ANALYSIS OUTPUTS');
  sections.push('The following structured outputs were generated by the Armalytix forensic analysis pipeline. Use these as your PRIMARY analytical framework.');

  // 1. Funding chain summary
  const fc = analysis.fundingChain;
  const reconRatio = fc.amountToProve > 0
    ? ((fc.totalEvidencedFunds / fc.amountToProve) * 100).toFixed(1)
    : 'N/A';
  sections.push(`
### Funding Chain Summary
| Metric | Value |
|--------|-------|
| Amount to Prove | £${fc.amountToProve.toLocaleString()} |
| Total Evidenced Funds | £${fc.totalEvidencedFunds.toLocaleString()} |
| Declared Not Evidenced | £${fc.totalDeclaredNotEvidenced.toLocaleString()} |
| Unexplained Incoming | £${fc.totalUnexplainedIncoming.toLocaleString()} |
| Shortfall | ${fc.hasShortfall ? `£${fc.shortfallAmount.toLocaleString()}` : 'None'} |
| Excess | ${fc.hasExcess ? `£${fc.excessAmount.toLocaleString()}${fc.excessExplained ? ' (explained)' : ' (unexplained)'}` : 'None'} |
| Reconciliation Ratio | ${reconRatio}% |
| Overall Confidence | **${fc.overallConfidence}** |`);

  // 2. Source reconciliation table
  if (analysis.sourceReconciliations.length > 0) {
    sections.push('\n### Source Reconciliation');
    sections.push('| Source | Declared | Supported | Gap | Status | Confidence |');
    sections.push('|--------|----------|-----------|-----|--------|------------|');
    for (const r of analysis.sourceReconciliations) {
      const gap = r.declaredAmount - r.supportedAmount;
      sections.push(
        `| ${r.sourceCategory} | £${r.declaredAmount.toLocaleString()} | £${r.supportedAmount.toLocaleString()} | £${gap.toLocaleString()} | ${r.reconciliationStatus} | ${r.confidenceOfMatch} |`
      );
    }
  }

  // 3. Material exceptions (high/critical only)
  const materialExceptions = analysis.exceptions.filter(
    (e) => e.severity === 'critical' || e.severity === 'high'
  );
  if (materialExceptions.length > 0) {
    sections.push('\n### Material Exceptions');
    for (const ex of materialExceptions) {
      sections.push(`- **[${ex.severity.toUpperCase()}]** ${ex.exceptionType}: ${ex.rationale}${ex.quantitativeBasis ? ` (${ex.quantitativeBasis})` : ''}`);
    }
  }

  // All exceptions summary count
  const exByLevel = {
    critical: analysis.exceptions.filter(e => e.severity === 'critical').length,
    high: analysis.exceptions.filter(e => e.severity === 'high').length,
    medium: analysis.exceptions.filter(e => e.severity === 'medium').length,
    low: analysis.exceptions.filter(e => e.severity === 'low').length,
  };
  sections.push(`\n**Exception totals**: ${exByLevel.critical} critical, ${exByLevel.high} high, ${exByLevel.medium} medium, ${exByLevel.low} low`);

  // 4. Draft enquiries summary
  if (analysis.draftEnquiries.length > 0) {
    sections.push('\n### Draft Enquiries');
    const mandatory = analysis.draftEnquiries.filter(e => e.mandatory === 'mandatory');
    const discretionary = analysis.draftEnquiries.filter(e => e.mandatory === 'discretionary');

    if (mandatory.length > 0) {
      sections.push(`\n**Mandatory (${mandatory.length}):**`);
      for (const eq of mandatory.slice(0, 15)) {
        sections.push(`- [${eq.priority}] ${eq.enquiryCategory}: ${eq.userFacingEnquiryText.slice(0, 200)}`);
      }
      if (mandatory.length > 15) sections.push(`  ... and ${mandatory.length - 15} more`);
    }

    if (discretionary.length > 0) {
      sections.push(`\n**Discretionary (${discretionary.length}):**`);
      for (const eq of discretionary.slice(0, 10)) {
        sections.push(`- [${eq.priority}] ${eq.enquiryCategory}: ${eq.userFacingEnquiryText.slice(0, 200)}`);
      }
      if (discretionary.length > 10) sections.push(`  ... and ${discretionary.length - 10} more`);
    }
  }

  // 5. Decision support summary
  const ds = analysis.decisionSupport;
  sections.push(`
### Decision Support
| Metric | Value |
|--------|-------|
| Overall Review Status | **${ds.overallReviewStatus}** |
| Funds Position | **${ds.fundsPositionStatus}** |
| Unresolved Issues | ${ds.keyUnresolvedIssuesCount} |
| High Severity Issues | ${ds.highSeverityIssuesCount} |
| Mandatory Enquiries | ${ds.mandatoryEnquiriesCount} |
| Discretionary Enquiries | ${ds.discretionaryEnquiriesCount} |
| Reviewer Attention Required | ${ds.reviewerAttentionRequired ? 'YES' : 'No'} |`);

  if (ds.potentialClearanceBlockers.length > 0) {
    sections.push('\n**Clearance Blockers:**');
    for (const b of ds.potentialClearanceBlockers) {
      sections.push(`- [${b.severity}] ${b.reason}`);
    }
  }

  if (ds.evidenceGapSummary.length > 0) {
    sections.push('\n**Evidence Gaps:**');
    for (const g of ds.evidenceGapSummary) {
      sections.push(`- ${g.gapType}: ${g.description}${g.amount != null ? ` (£${g.amount.toLocaleString()})` : ''}`);
    }
  }

  // 6. Reviewer summary counts
  const rs = analysis.reviewerSummary;
  sections.push(`
### Reviewer Summary
- Accepted items: ${rs.acceptedCount}
- Unresolved items: ${rs.unresolvedCount}
- Draft enquiries: ${rs.enquiryCount}`);

  // 7. Unmatched transactions
  if (analysis.matchResult.unmatched.length > 0) {
    sections.push(`\n### Unmatched Transactions: ${analysis.matchResult.unmatched.length} transaction(s) could not be matched to any declared source.`);
  }

  sections.push('\n---\n');

  return sections.join('\n');
}

// ── Activation check ─────────────────────────────────────────────

/**
 * Check if structured Armalytix data exists for a case.
 */
export async function shouldActivateArmalytixModule(
  caseId: string,
  supabaseClient: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('armalytix_reports')
    .select('id')
    .eq('case_id', caseId)
    .limit(1);

  if (error) {
    console.warn('[Armalytix Module] Failed to check armalytix_reports:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

// ── Structured data fetcher ──────────────────────────────────────

export interface StructuredArmalytixData {
  accounts: any[];
  transactions: any[];
  fundSources: any[];
  manualBalances: any[];
  incomeVerifications: any[];
  evidenceItems: any[];
  riskFlags: any[];
  parties: any[];
  reportHeader: any | null;
}

/**
 * Fetch all sow_* table data for a case in parallel.
 * Returns typed inputs suitable for runFullAnalysis.
 */
export async function fetchStructuredArmalytixData(
  caseId: string,
  supabaseClient: SupabaseClient
): Promise<StructuredArmalytixData> {
  const [
    accountsRes,
    transactionsRes,
    fundSourcesRes,
    manualBalancesRes,
    incomeVerRes,
    evidenceRes,
    riskFlagsRes,
    partiesRes,
    reportRes,
  ] = await Promise.all([
    supabaseClient.from('sow_connected_accounts').select('*').eq('case_id', caseId),
    supabaseClient.from('sow_transactions').select('*').eq('case_id', caseId),
    supabaseClient.from('sow_fund_sources').select('*').eq('case_id', caseId),
    supabaseClient.from('sow_manual_balances').select('*').eq('case_id', caseId),
    supabaseClient.from('sow_income_verification').select('*').eq('case_id', caseId),
    supabaseClient.from('sow_evidence_items').select('*').eq('case_id', caseId),
    supabaseClient.from('sow_risk_flags').select('*').eq('case_id', caseId),
    supabaseClient.from('case_parties').select('*').eq('case_id', caseId),
    supabaseClient
      .from('armalytix_reports')
      .select('mortgage_amount, mortgage_lender, mortgage_offer_in_place, gifts_declared')
      .eq('case_id', caseId)
      .maybeSingle(),
  ]);

  return {
    accounts: accountsRes.data || [],
    transactions: transactionsRes.data || [],
    fundSources: fundSourcesRes.data || [],
    manualBalances: manualBalancesRes.data || [],
    incomeVerifications: incomeVerRes.data || [],
    evidenceItems: evidenceRes.data || [],
    riskFlags: riskFlagsRes.data || [],
    parties: partiesRes.data || [],
    reportHeader: reportRes.data || null,
  };
}

/**
 * Convert fetched structured data into the inputs shape for runFullAnalysis.
 */
export function buildAnalysisInputs(data: StructuredArmalytixData) {
  // Map DB rows to the lightweight type stubs expected by the analysis pipeline
  const transactions = data.transactions.map((tx: any) => ({
    id: tx.id,
    date: tx.tx_date || '',
    amount: tx.amount || 0,
    description: tx.description || '',
    direction: tx.direction || 'unknown',
    accountId: tx.connected_account_id || '',
  }));

  const matchableFundSources = data.fundSources.map((fs: any) => ({
    id: fs.id,
    sourceCategory: fs.source_category || 'unknown',
    declaredAmount: fs.declared_amount || 0,
    employerName: fs.employer_name || null,
    dateReceived: fs.date_received || null,
    linkedAccountIds: fs.linked_account_ids || [],
  }));

  const classificationContext = {
    accounts: data.accounts.map((a: any) => ({
      id: a.id,
      accountHolderName: a.account_holder_name || '',
      accountCurrency: a.account_currency || 'GBP',
    })),
    parties: data.parties.map((p: any) => ({
      id: p.id,
      fullName: p.full_name || '',
      role: p.role || 'Purchaser',
    })),
    fundSources: data.fundSources.map((fs: any) => ({
      id: fs.id,
      sourceCategory: fs.source_category || '',
      employerName: fs.employer_name || null,
    })),
  };

  const materialityContext = {
    purchasePrice: data.reportHeader?.purchase_price || 0,
    amountToProve: data.reportHeader?.amount_to_prove || 0,
    totalDeclaredFunds: data.fundSources.reduce((sum: number, fs: any) => sum + (fs.declared_amount || 0), 0),
  };

  const reconciliationInputs = {
    fundSources: data.fundSources,
    manualBalances: data.manualBalances,
    evidenceItems: data.evidenceItems,
    incomeVerifications: data.incomeVerifications,
    parties: data.parties,
    amountToProve: data.reportHeader?.amount_to_prove || 0,
    purchasePrice: data.reportHeader?.purchase_price || 0,
    mortgageAmount: data.reportHeader?.mortgage_amount || 0,
  };

  const contradictionCheckInputs = {
    fundSources: data.fundSources,
    evidenceItems: data.evidenceItems,
    transactions: data.transactions,
    manualBalances: data.manualBalances,
    parties: data.parties,
    incomeVerifications: data.incomeVerifications,
    accounts: data.accounts,
    reportHeader: data.reportHeader,
  };

  // A1 — Purchaser count contradiction. Pure mapping over case_parties.
  const purchaserCountInputs = {
    parties: data.parties.map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? null,
      role: p.role ?? null,
      on_mortgage: p.on_mortgage ?? null,
      contribution_amount: p.contribution_amount ?? null,
    })),
    armalytixDetectedBuyerCount:
      typeof data.reportHeader?.number_of_buyers === 'number'
        ? data.reportHeader.number_of_buyers
        : null,
  };

  // B3 — Gift declared vs denied. Only emit inputs when `gifts_declared`
  // is a strict boolean on the armalytix_reports header — absence ≠ denial,
  // so we leave the field undefined and the rule will not fire.
  const giftsDeclaredRaw = (data.reportHeader as any)?.gifts_declared;
  const giftDeclarationInputs =
    typeof giftsDeclaredRaw === 'boolean'
      ? {
          giftDeclared: giftsDeclaredRaw,
          transactions: data.transactions.map((tx: any) => ({
            id: tx.id,
            direction: tx.direction ?? null,
            amount: typeof tx.amount === 'number' ? tx.amount : null,
            description: tx.description ?? null,
            tx_date: tx.tx_date ?? null,
            classifiedCategory: tx.classified_category ?? null,
          })),
        }
      : undefined;

  // C5 — Employment status contradiction. Pure mapping over fund sources +
  // income verifications. The rule itself only emits when there is a salary
  // source AND either a self-employment marker on the same matter OR a
  // strict-boolean `salary_matched_to_bank === false` with no PAYE evidence.
  const employmentStatusInputs = {
    fundSources: data.fundSources.map((fs: any) => ({
      id: fs.id,
      source_category: fs.source_category ?? null,
      employer_name: fs.employer_name ?? null,
      annual_gross_salary:
        typeof fs.annual_gross_salary === 'number' ? fs.annual_gross_salary : null,
    })),
    incomeVerifications: data.incomeVerifications.map((iv: any) => ({
      id: iv.id,
      payslip_name_match: typeof iv.payslip_name_match === 'boolean' ? iv.payslip_name_match : null,
      salary_matched_to_bank:
        typeof iv.salary_matched_to_bank === 'boolean' ? iv.salary_matched_to_bank : null,
      avg_salary_credit:
        typeof iv.avg_salary_credit === 'number' ? iv.avg_salary_credit : null,
      net_pay_on_payslip:
        typeof iv.net_pay_on_payslip === 'number' ? iv.net_pay_on_payslip : null,
    })),
  };

  return {
    transactions,
    classificationContext,
    matchableFundSources,
    materialityContext,
    reconciliationInputs,
    contradictionCheckInputs,
    purchaserCountInputs,
    giftDeclarationInputs,
    employmentStatusInputs,
  };
}

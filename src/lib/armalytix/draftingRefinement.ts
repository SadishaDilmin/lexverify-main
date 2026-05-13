/**
 * Post-Validation Drafting Refinement Module
 *
 * Pure functions for:
 * 1. Calculation accuracy guards (shortfall/excess/amounts)
 * 2. Evidence-aware enquiry filtering (don't re-request present evidence)
 * 3. Party-specific enquiry attribution (Alice vs Conor vs Joint)
 * 4. Output labelling/recipient context
 * 5. Unresolved-only gating
 *
 * No DB calls. Layers on top of existing enquiry generator outputs.
 */

import type { DraftEnquiry, EnquiryCategory } from './enquiryGenerator';
import type { FundingChainSummary, SourceReconciliation } from './reconciliationEngine';
import type { ExceptionItem } from './exceptionEngine';
import type { ClassifiedIssue, GovernanceOutput, SignOffDecisionSupport } from './reviewerPolicyEngine';

// ── Types ────────────────────────────────────────────────────────

export type EvidencePresenceStatus =
  | 'not_uploaded'
  | 'uploaded_not_reviewed'
  | 'uploaded_insufficient'
  | 'uploaded_sufficient';

export interface EvidenceStatusRecord {
  refTable: string;
  refId: string;
  status: EvidencePresenceStatus;
  reason?: string; // e.g. "date range insufficient", "unreadable"
}

export type PartyAttribution = 'party_specific' | 'joint' | 'unattributed';

export interface PartyInfo {
  partyId: string;
  fullName: string;
  role: string; // 'purchaser', 'co_buyer', etc.
  linkedAccountIds: string[];
  linkedFundSourceIds: string[];
}

export interface AttributedEnquiry extends DraftEnquiry {
  /** Which party this enquiry is attributable to */
  partyAttribution: PartyAttribution;
  /** Specific party ID(s) if party_specific */
  attributedPartyIds: string[];
  /** Specific party name(s) for labelling */
  attributedPartyNames: string[];
  /** Evidence status for the linked item */
  evidenceStatus: EvidencePresenceStatus;
  /** If re-requesting evidence, the explicit reason */
  reRequestReason: string | null;
  /** Validated figure from the reconciled funding chain */
  validatedAmount: number | null;
  /** Whether the figure is uncertain */
  amountUncertain: boolean;
}

export type OutputRecipient = 'buyers' | 'seller_conveyancer' | 'lender' | 'internal';

export interface OutputLabel {
  title: string;
  recipientType: OutputRecipient;
  recipientNames: string[];
  subject: string;
}

// ── A. Calculation accuracy guards ───────────────────────────────

export interface CalculationGuardResult {
  isConsistent: boolean;
  correctedShortfall: number;
  correctedExcess: number;
  correctedAmountToProve: number;
  correctedTotalEvidenced: number;
  warnings: string[];
}

/**
 * Cross-check figures used in drafting against the reconciled funding chain.
 * Returns corrected values and warns if the draft would quote inconsistent figures.
 */
export function guardCalculations(
  fundingChain: FundingChainSummary,
  reportHeaderExcessShortfall: number | null
): CalculationGuardResult {
  const warnings: string[] = [];
  const atp = fundingChain.amountToProve;
  const evidenced = fundingChain.totalEvidencedFunds + fundingChain.supportedManualBalances;

  let correctedShortfall = fundingChain.shortfallAmount;
  let correctedExcess = fundingChain.excessAmount;

  // Cross-check with report header if available
  if (reportHeaderExcessShortfall != null) {
    const headerShortfall = reportHeaderExcessShortfall < 0 ? Math.abs(reportHeaderExcessShortfall) : 0;
    const headerExcess = reportHeaderExcessShortfall > 0 ? reportHeaderExcessShortfall : 0;

    // If reconciled shortfall differs from header by >10% and >£1000, warn
    if (correctedShortfall > 0 && headerShortfall > 0) {
      const diff = Math.abs(correctedShortfall - headerShortfall);
      if (diff > correctedShortfall * 0.1 && diff > 1000) {
        warnings.push(
          `Reconciled shortfall (£${correctedShortfall.toLocaleString()}) differs from report header shortfall (£${headerShortfall.toLocaleString()}) by £${diff.toLocaleString()}. Using reconciled figure but flagging uncertainty.`
        );
      }
    }

    // If header says no shortfall but reconciliation shows one (or vice versa)
    if (headerExcess > 0 && correctedShortfall > 0 && correctedShortfall < 2000) {
      warnings.push(
        `Report header indicates excess of £${headerExcess.toLocaleString()} but reconciliation shows shortfall of £${correctedShortfall.toLocaleString()}. Gap likely reflects limited transaction visibility.`
      );
    }
  }

  const isConsistent = warnings.length === 0;

  return {
    isConsistent,
    correctedShortfall,
    correctedExcess,
    correctedAmountToProve: atp,
    correctedTotalEvidenced: evidenced,
    warnings,
  };
}

/**
 * Apply validated figures to a draft enquiry, replacing any incorrectly
 * derived amounts with the reconciled figures.
 * When figures are uncertain (guard.isConsistent === false), avoids stating
 * any precise shortfall and instead uses descriptive language.
 */
export function applyValidatedFigures(
  enquiry: DraftEnquiry,
  fundingChain: FundingChainSummary,
  guard: CalculationGuardResult
): DraftEnquiry {
  const updated = { ...enquiry };

  if (enquiry.enquiryCategory === 'funding_shortfall') {
    if (!guard.isConsistent) {
      // Figures conflict — remove any precise amount and use descriptive language
      updated.amountInvolved = null as any;
      updated.userFacingEnquiryText = updated.userFacingEnquiryText
        .replace(/there is a (funding )?shortfall of £[\d,]+(?:\.\d+)?/i,
          'there appears to be a remaining gap between the funds evidenced so far and the total amount required to complete this purchase')
        .replace(/shortfall of (approximately )?£[\d,]+(?:\.\d+)?/i,
          'a remaining gap in the funds evidenced so far')
        .replace(/£[\d,]+(?:\.\d+)?\s*(shortfall|gap|deficit)/i,
          'a remaining gap in the evidenced funds');
    } else {
      updated.amountInvolved = guard.correctedShortfall;
      if (guard.correctedShortfall > 0) {
        updated.userFacingEnquiryText = updated.userFacingEnquiryText.replace(
          /£[\d,]+(?:\.\d+)?/,
          `£${guard.correctedShortfall.toLocaleString()}`
        );
      }
    }
  }

  if (enquiry.enquiryCategory === 'excess_funds_unexplained') {
    updated.amountInvolved = guard.correctedExcess;
    if (guard.correctedExcess > 0) {
      updated.userFacingEnquiryText = updated.userFacingEnquiryText.replace(
        /£[\d,]+(?:\.\d+)?/,
        `£${guard.correctedExcess.toLocaleString()}`
      );
    }
  }

  return updated;
}

// ── B. Evidence-aware filtering ──────────────────────────────────

/**
 * Derive evidence presence status for a specific item from evidence items and reconciliation data.
 */
export function deriveEvidenceStatus(
  refTable: string,
  refId: string,
  evidenceItems: Array<{ ref_table: string; ref_id: string; verification_status?: string | null }>,
  reconciliations: SourceReconciliation[]
): EvidenceStatusRecord {
  // Find matching evidence items
  const linked = evidenceItems.filter(e => e.ref_table === refTable && e.ref_id === refId);

  if (linked.length === 0) {
    // Check if reconciliation shows any linked evidence
    if (refTable === 'sow_fund_sources') {
      const recon = reconciliations.find(r => r.fundSourceId === refId);
      if (recon && recon.linkedEvidenceCount > 0) {
        // Evidence exists via reconciliation linkage
        if (recon.reconciliationStatus === 'fully_reconciled') {
          return { refTable, refId, status: 'uploaded_sufficient' };
        }
        if (recon.reconciliationStatus === 'partially_reconciled') {
          return { refTable, refId, status: 'uploaded_insufficient', reason: 'partially reconciled — gap remains' };
        }
      }
    }
    return { refTable, refId, status: 'not_uploaded' };
  }

  // Check verification statuses
  const hasVerified = linked.some(e => e.verification_status === 'verified' || e.verification_status === 'accepted');
  const hasPending = linked.some(e => e.verification_status === 'pending' || !e.verification_status);
  const hasRejected = linked.some(e => e.verification_status === 'rejected' || e.verification_status === 'insufficient');

  if (hasVerified) return { refTable, refId, status: 'uploaded_sufficient' };
  if (hasRejected) return { refTable, refId, status: 'uploaded_insufficient', reason: 'evidence rejected or insufficient' };
  if (hasPending) return { refTable, refId, status: 'uploaded_not_reviewed' };

  return { refTable, refId, status: 'uploaded_not_reviewed' };
}

/**
 * Filter out enquiries where evidence is already present and sufficient.
 * For enquiries where evidence exists but is insufficient, modify wording to state why.
 */
export function filterByEvidenceStatus(
  enquiries: DraftEnquiry[],
  evidenceItems: Array<{ ref_table: string; ref_id: string; verification_status?: string | null }>,
  reconciliations: SourceReconciliation[]
): DraftEnquiry[] {
  return enquiries.reduce<DraftEnquiry[]>((acc, enquiry) => {
    const linkedTable = enquiry.linkedSourceId ? 'sow_fund_sources' :
      enquiry.linkedTransactionIds.length > 0 ? 'sow_transactions' :
      enquiry.linkedBalanceId ? 'sow_manual_balances' : null;
    const linkedId = enquiry.linkedSourceId || enquiry.linkedTransactionIds[0] || enquiry.linkedBalanceId || null;

    if (!linkedTable || !linkedId) {
      acc.push(enquiry);
      return acc;
    }

    const status = deriveEvidenceStatus(linkedTable, linkedId, evidenceItems, reconciliations);

    switch (status.status) {
      case 'uploaded_sufficient':
        // Evidence is present and adequate — suppress this enquiry
        return acc;

      case 'uploaded_insufficient': {
        // Evidence exists but is insufficient — modify wording
        const modified = { ...enquiry };
        const reason = status.reason || 'the existing evidence is incomplete or insufficient';
        modified.userFacingEnquiryText =
          `We note that documentation has been provided in relation to this item. However, ${reason}. ` +
          modified.userFacingEnquiryText;
        modified.internalGuidanceNote =
          `[EVIDENCE PRESENT BUT INSUFFICIENT: ${reason}] ${modified.internalGuidanceNote}`;
        acc.push(modified);
        return acc;
      }

      case 'uploaded_not_reviewed': {
        // Evidence uploaded but not yet reviewed — softer wording
        const modified = { ...enquiry };
        modified.userFacingEnquiryText =
          `We note that a document may have been provided in relation to this item but it has not yet been linked or reviewed against this specific requirement. ` +
          modified.userFacingEnquiryText;
        acc.push(modified);
        return acc;
      }

      case 'not_uploaded':
      default:
        acc.push(enquiry);
        return acc;
    }
  }, []);
}

// ── C. Unresolved-only gating ────────────────────────────────────

/**
 * Filter enquiries to only include those tied to unresolved/material issues.
 * Removes enquiries for:
 * - Low-severity exceptions that are already resolved or accepted
 * - Issues classified as 'note_only' or 'resolved' by governance
 * - Issues below materiality threshold (but only if discretionary AND low priority AND immaterial)
 *
 * IMPORTANT: Does NOT blanket-suppress all items for a party just because some are resolved.
 * Each enquiry is evaluated independently.
 */
export function filterToUnresolvedOnly(
  enquiries: DraftEnquiry[],
  governance: GovernanceOutput,
  fundingChain: FundingChainSummary
): DraftEnquiry[] {
  // Build set of resolved/note-only exception refs from governance
  const suppressedRefs = new Set<string>();
  for (const ci of governance.classifiedIssues) {
    if (
      ci.treatment === 'resolved' ||
      ci.treatment === 'note_only' ||
      ci.treatment === 'overridden_by_reviewer'
    ) {
      const ref = `${ci.exception.exceptionType}::${ci.exception.linkedRefTable}::${ci.exception.linkedRefId}`;
      suppressedRefs.add(ref);
    }
    // Note: 'accepted_subject_to_confirmation' is NOT suppressed — these still need confirmation
  }

  return enquiries.filter(enquiry => {
    // Suppress if governance says resolved/note-only/overridden
    if (enquiry.linkedExceptionRef && suppressedRefs.has(enquiry.linkedExceptionRef)) return false;

    // Suppress ONLY if discretionary AND low priority AND truly immaterial (<1% of funds)
    // Raised threshold from 2% to 1% to avoid over-suppression
    if (enquiry.mandatory === 'discretionary' && enquiry.priority === 'low') {
      const proportion = enquiry.proportionOfFunds ?? 0;
      if (proportion < 0.01) return false; // Less than 1% of funds — immaterial
    }

    return true;
  });
}

// ── D. Party-specific attribution ────────────────────────────────

/**
 * Attribute each enquiry to specific party/parties based on linked accounts,
 * fund sources, and transaction ownership.
 */
export function attributeEnquiriesToParties(
  enquiries: DraftEnquiry[],
  parties: PartyInfo[],
  fundSources: Array<{ id: string; linked_account_ids?: string[] | null; source_category?: string | null }>,
  accounts: Array<{ id: string; account_holder_name?: string | null }>,
  transactions: Array<{ id: string; connected_account_id?: string | null }>
): AttributedEnquiry[] {
  return enquiries.map(enquiry => {
    const attributed: AttributedEnquiry = {
      ...enquiry,
      partyAttribution: 'unattributed',
      attributedPartyIds: [],
      attributedPartyNames: [],
      evidenceStatus: 'not_uploaded',
      reRequestReason: null,
      validatedAmount: enquiry.amountInvolved,
      amountUncertain: false,
    };

    // Try to attribute via fund source
    if (enquiry.linkedSourceId) {
      const fs = fundSources.find(f => f.id === enquiry.linkedSourceId);
      if (fs?.linked_account_ids && fs.linked_account_ids.length > 0) {
        const ownerParties = findPartiesForAccounts(fs.linked_account_ids, accounts, parties);
        if (ownerParties.length === 1) {
          attributed.partyAttribution = 'party_specific';
          attributed.attributedPartyIds = [ownerParties[0].partyId];
          attributed.attributedPartyNames = [ownerParties[0].fullName];
        } else if (ownerParties.length > 1) {
          attributed.partyAttribution = 'joint';
          attributed.attributedPartyIds = ownerParties.map(p => p.partyId);
          attributed.attributedPartyNames = ownerParties.map(p => p.fullName);
        }
      }

      // Co-buyer sources are always party-specific to the co-buyer
      if (fs?.source_category?.toLowerCase().includes('co_buyer') || fs?.source_category?.toLowerCase().includes('co-buyer')) {
        const coBuyer = parties.find(p => p.role === 'co_buyer');
        if (coBuyer) {
          attributed.partyAttribution = 'party_specific';
          attributed.attributedPartyIds = [coBuyer.partyId];
          attributed.attributedPartyNames = [coBuyer.fullName];
        }
      }
    }

    // Try to attribute via transaction
    if (enquiry.linkedTransactionIds.length > 0 && attributed.partyAttribution === 'unattributed') {
      const txId = enquiry.linkedTransactionIds[0];
      const tx = transactions.find(t => t.id === txId);
      if (tx?.connected_account_id) {
        const ownerParties = findPartiesForAccounts([tx.connected_account_id], accounts, parties);
        if (ownerParties.length === 1) {
          attributed.partyAttribution = 'party_specific';
          attributed.attributedPartyIds = [ownerParties[0].partyId];
          attributed.attributedPartyNames = [ownerParties[0].fullName];
        } else if (ownerParties.length > 1) {
          attributed.partyAttribution = 'joint';
          attributed.attributedPartyIds = ownerParties.map(p => p.partyId);
          attributed.attributedPartyNames = ownerParties.map(p => p.fullName);
        }
      }
    }

    // Funding plan enquiries are always joint
    if (
      enquiry.enquiryCategory === 'funding_shortfall' ||
      enquiry.enquiryCategory === 'excess_funds_unexplained'
    ) {
      attributed.partyAttribution = 'joint';
      attributed.attributedPartyIds = parties.map(p => p.partyId);
      attributed.attributedPartyNames = parties.map(p => p.fullName);
    }

    return attributed;
  });
}

function findPartiesForAccounts(
  accountIds: string[],
  accounts: Array<{ id: string; account_holder_name?: string | null }>,
  parties: PartyInfo[]
): PartyInfo[] {
  const matched: PartyInfo[] = [];
  for (const accId of accountIds) {
    const acc = accounts.find(a => a.id === accId);
    if (!acc?.account_holder_name) continue;

    const holderName = acc.account_holder_name.toLowerCase().trim();
    for (const party of parties) {
      if (
        holderName.includes(party.fullName.toLowerCase().trim()) ||
        party.fullName.toLowerCase().trim().includes(holderName)
      ) {
        if (!matched.find(m => m.partyId === party.partyId)) {
          matched.push(party);
        }
      }
    }

    // Also check via linked account IDs
    for (const party of parties) {
      if (party.linkedAccountIds.includes(accId) && !matched.find(m => m.partyId === party.partyId)) {
        matched.push(party);
      }
    }
  }
  return matched;
}

// ── E. Separate personal vs joint funding-plan enquiries ─────────

export interface SeparatedEnquiries {
  /** Enquiries specific to individual parties, grouped by party */
  perParty: Map<string, AttributedEnquiry[]>;
  /** Joint funding-plan enquiries */
  joint: AttributedEnquiry[];
  /** Unattributed enquiries (fallback) */
  unattributed: AttributedEnquiry[];
}

export function separateEnquiriesByParty(enquiries: AttributedEnquiry[]): SeparatedEnquiries {
  const perParty = new Map<string, AttributedEnquiry[]>();
  const joint: AttributedEnquiry[] = [];
  const unattributed: AttributedEnquiry[] = [];

  for (const eq of enquiries) {
    if (eq.partyAttribution === 'joint') {
      joint.push(eq);
    } else if (eq.partyAttribution === 'party_specific' && eq.attributedPartyIds.length > 0) {
      const partyId = eq.attributedPartyIds[0];
      const existing = perParty.get(partyId) || [];
      existing.push(eq);
      perParty.set(partyId, existing);
    } else {
      unattributed.push(eq);
    }
  }

  return { perParty, joint, unattributed };
}

// ── F. Output labelling ──────────────────────────────────────────

/**
 * Generate correct output label based on case context and enquiry content.
 */
export function buildOutputLabel(
  caseReference: string,
  buyerNames: string[],
  propertyAddress: string,
  recipientType: OutputRecipient = 'buyers'
): OutputLabel {
  const recipientNames = recipientType === 'buyers' ? buyerNames : [];

  let title: string;
  let subject: string;

  switch (recipientType) {
    case 'buyers':
      title = `Source of Funds Enquiries — ${caseReference}`;
      subject = `${caseReference} — Source of Funds: Information Required`;
      break;
    case 'seller_conveyancer':
      title = `Pre-Contract Enquiries — ${caseReference}`;
      subject = `${caseReference} — Pre-Contract Enquiries`;
      break;
    case 'lender':
      title = `Certificate of Title — Source of Funds Summary — ${caseReference}`;
      subject = `${caseReference} — Source of Funds Summary for Lender`;
      break;
    case 'internal':
      title = `Internal Source of Funds Review — ${caseReference}`;
      subject = `${caseReference} — Internal SoF Review`;
      break;
  }

  return { title, recipientType, recipientNames, subject };
}

// ── G. Full refinement pass orchestrator ─────────────────────────

export interface RefinementInputs {
  draftEnquiries: DraftEnquiry[];
  fundingChain: FundingChainSummary;
  governance: GovernanceOutput;
  reconciliations: SourceReconciliation[];
  evidenceItems: Array<{ ref_table: string; ref_id: string; verification_status?: string | null }>;
  parties: PartyInfo[];
  fundSources: Array<{ id: string; linked_account_ids?: string[] | null; source_category?: string | null }>;
  accounts: Array<{ id: string; account_holder_name?: string | null }>;
  transactions: Array<{ id: string; connected_account_id?: string | null }>;
  caseReference: string;
  propertyAddress: string;
}

export interface RefinementResult {
  /** Refined enquiries with party attribution and evidence awareness */
  refinedEnquiries: AttributedEnquiry[];
  /** Enquiries separated by party */
  separatedEnquiries: SeparatedEnquiries;
  /** Calculation guard result */
  calculationGuard: CalculationGuardResult;
  /** Output label for buyer-facing draft */
  buyerOutputLabel: OutputLabel;
  /** Output label for internal review */
  internalOutputLabel: OutputLabel;
  /** Count of enquiries suppressed by evidence filtering */
  suppressedByEvidence: number;
  /** Count of enquiries suppressed by governance/resolution */
  suppressedByGovernance: number;
  /** Debug log entries */
  debugLog: string[];
}

export function runDraftingRefinement(inputs: RefinementInputs): RefinementResult {
  const debugLog: string[] = [];
  const initialCount = inputs.draftEnquiries.length;
  debugLog.push(`[drafting-refinement] Starting with ${initialCount} draft enquiries`);

  // A. Calculation accuracy
  const guard = guardCalculations(inputs.fundingChain, inputs.fundingChain.reportHeaderExcessShortfall);
  if (!guard.isConsistent) {
    debugLog.push(`[drafting-refinement] Calculation warnings: ${guard.warnings.join('; ')}`);
  }

  // Apply validated figures
  let enquiries = inputs.draftEnquiries.map(e => applyValidatedFigures(e, inputs.fundingChain, guard));
  debugLog.push(`[drafting-refinement] Applied validated figures`);

  // B. Evidence-aware filtering
  const beforeEvidence = enquiries.length;
  enquiries = filterByEvidenceStatus(enquiries, inputs.evidenceItems, inputs.reconciliations);
  const suppressedByEvidence = beforeEvidence - enquiries.length;
  debugLog.push(`[drafting-refinement] Evidence filtering: ${suppressedByEvidence} suppressed, ${enquiries.length} remaining`);

  // C. Unresolved-only gating
  const beforeGovernance = enquiries.length;
  enquiries = filterToUnresolvedOnly(enquiries, inputs.governance, inputs.fundingChain);
  const suppressedByGovernance = beforeGovernance - enquiries.length;
  debugLog.push(`[drafting-refinement] Governance filtering: ${suppressedByGovernance} suppressed, ${enquiries.length} remaining`);

  // D. Party attribution
  const attributed = attributeEnquiriesToParties(
    enquiries, inputs.parties, inputs.fundSources, inputs.accounts, inputs.transactions
  );

  // Enrich evidence status on attributed enquiries
  for (const eq of attributed) {
    const linkedTable = eq.linkedSourceId ? 'sow_fund_sources' :
      eq.linkedTransactionIds.length > 0 ? 'sow_transactions' :
      eq.linkedBalanceId ? 'sow_manual_balances' : null;
    const linkedId = eq.linkedSourceId || eq.linkedTransactionIds[0] || eq.linkedBalanceId || null;
    if (linkedTable && linkedId) {
      const status = deriveEvidenceStatus(linkedTable, linkedId, inputs.evidenceItems, inputs.reconciliations);
      eq.evidenceStatus = status.status;
      if (status.status === 'uploaded_insufficient') {
        eq.reRequestReason = status.reason || 'existing evidence insufficient';
      }
    }
  }

  const partyStats = new Map<string, number>();
  for (const eq of attributed) {
    for (const name of eq.attributedPartyNames) {
      partyStats.set(name, (partyStats.get(name) || 0) + 1);
    }
  }
  const jointCount = attributed.filter(e => e.partyAttribution === 'joint').length;
  debugLog.push(`[drafting-refinement] Party attribution: joint=${jointCount}, per-party=${JSON.stringify(Object.fromEntries(partyStats))}`);

  // E. Separate by party
  const separated = separateEnquiriesByParty(attributed);

  // F. Output labels
  const buyerNames = inputs.parties.map(p => p.fullName);
  const buyerLabel = buildOutputLabel(inputs.caseReference, buyerNames, inputs.propertyAddress, 'buyers');
  const internalLabel = buildOutputLabel(inputs.caseReference, buyerNames, inputs.propertyAddress, 'internal');

  debugLog.push(`[drafting-refinement] Complete: ${attributed.length} final enquiries (was ${initialCount})`);

  return {
    refinedEnquiries: attributed,
    separatedEnquiries: separated,
    calculationGuard: guard,
    buyerOutputLabel: buyerLabel,
    internalOutputLabel: internalLabel,
    suppressedByEvidence,
    suppressedByGovernance,
    debugLog,
  };
}

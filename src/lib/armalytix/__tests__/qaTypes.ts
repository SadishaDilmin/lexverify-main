/**
 * QA / Testing / Calibration Framework — Type Definitions
 *
 * Defines fixture schemas, evaluation types, scoring metrics,
 * and reviewer feedback hooks for the Armalytix pipeline QA layer.
 */

import type { RawTransaction, AccountRef, PartyRef, FundSourceRef } from '../transactionClassifier';
import type { ExceptionType } from '../exceptionEngine';
import type { EnquiryCategory } from '../enquiryGenerator';
import type { ReviewStatus } from '../decisionSupportEngine';
import type { FundingConfidence } from '../reconciliationEngine';

// ── Scenario types ──────────────────────────────────────────────

export const SCENARIO_TYPES = [
  'armalytix_only',
  'non_armalytix',
  'mixed',
  'salary_only',
  'cobuyer',
  'gift',
  'manual_balances',
  'large_unexplained_credits',
  'repeated_third_party',
  'foreign_funds',
  'investment_liquidation',
  'possible_loan',
  'gambling',
  'funding_shortfall',
  'excess_funds',
  'contradictory_info',
  'partial_armalytix',
] as const;

export type ScenarioType = (typeof SCENARIO_TYPES)[number];

// ── Fixture inputs ──────────────────────────────────────────────

export interface FixtureManualBalance {
  id: string;
  case_id: string;
  amount?: number | null;
  attachment_name?: string | null;
  evidence_status?: string | null;
  counted_toward_proof?: boolean | null;
}

export interface FixtureEvidenceItem {
  id: string;
  ref_table: string;
  ref_id: string;
  source_origin?: string | null;
  verification_status?: string | null;
}

export interface FixtureIncomeVerification {
  id: string;
  payslip_name_match?: boolean | null;
  matched_employer_name?: string | null;
  salary_matched_to_bank?: boolean | null;
  avg_salary_credit?: number | null;
  net_pay_on_payslip?: number | null;
}

export interface FixtureReportHeader {
  mortgage_amount?: number | null;
  mortgage_lender?: string | null;
  mortgage_offer_in_place?: boolean | null;
  amount_to_prove?: number | null;
  purchase_price?: number | null;
  total_balance_available?: number | null;
  excess_shortfall?: number | null;
}

export interface FixtureInputs {
  transactions: RawTransaction[];
  fundSources: (FundSourceRef & {
    declared_amount?: number | null;
    date_received?: string | null;
    donor_name?: string | null;
    verification_status?: string | null;
    outside_uk?: boolean | null;
    income_explains_savings?: boolean | null;
    years_to_accumulate?: number | null;
    annual_gross_salary?: number | null;
    supporting_doc_uploaded?: boolean | null;
    supporting_doc_name?: string | null;
    linked_account_ids?: string[] | null;
    bonuses_declared?: boolean | null;
  })[];
  accounts: AccountRef[];
  parties: (PartyRef & {
    contribution_amount?: number | null;
    buyer_relationship?: string | null;
  })[];
  manualBalances: FixtureManualBalance[];
  evidenceItems: FixtureEvidenceItem[];
  incomeVerifications: FixtureIncomeVerification[];
  reportHeader: FixtureReportHeader | null;
}

// ── Expected outputs ────────────────────────────────────────────

export interface ExpectedSource {
  sourceId: string;
  minSupported: number;
}

export interface ExpectedOutputs {
  supportedSources: ExpectedSource[];
  exceptionTypes: ExceptionType[];
  absentExceptionTypes: ExceptionType[];
  mandatoryEnquiryCategories: EnquiryCategory[];
  discretionaryEnquiryCategories: EnquiryCategory[];
  noEnquiryCategories: EnquiryCategory[];
  reviewStatus: ReviewStatus[];
  fundingChain: {
    hasShortfall?: boolean;
    hasExcess?: boolean;
    overallConfidence?: FundingConfidence[];
  };
  blockerCount?: { min: number; max: number };
}

// ── QA Test Case ────────────────────────────────────────────────

export interface QATestCase {
  id: string;
  title: string;
  scenarioType: ScenarioType;
  expectedPathway: 'armalytix' | 'standard' | 'hybrid';
  inputs: FixtureInputs;
  expected: ExpectedOutputs;
}

// ── Evaluation outputs ──────────────────────────────────────────

export interface QAScores {
  issueRecall: number;
  issuePrecision: number;
  enquiryRecall: number;
  enquiryPrecision: number;
  duplicateEnquiryRate: number;
  unsupportedConclusionRate: number;
  unresolvedVisibility: number;
  pathwayCorrect: boolean;
}

export interface FalseNegativeItem {
  expectedExceptionType: ExceptionType;
  fixtureId: string;
  notes: string;
}

export interface FalsePositiveItem {
  raisedExceptionType: ExceptionType;
  fixtureId: string;
  notes: string;
}

export interface DuplicateGroup {
  mergeGroupKey: string;
  enquiryCount: number;
  categories: EnquiryCategory[];
}

export interface OverEscalation {
  exceptionType: ExceptionType;
  raisedSeverity: string;
  reasoning: string;
}

export interface UnderEscalation {
  exceptionType: ExceptionType;
  raisedSeverity: string;
  expectedMinSeverity: string;
}

export interface QAEvaluation {
  fixtureId: string;
  scores: QAScores;
  falseNegatives: FalseNegativeItem[];
  falsePositives: FalsePositiveItem[];
  duplicateEnquiries: DuplicateGroup[];
  overEscalations: OverEscalation[];
  underEscalations: UnderEscalation[];
}

// ── Suite report ────────────────────────────────────────────────

export interface AggregateScores {
  meanIssueRecall: number;
  meanIssuePrecision: number;
  meanEnquiryRecall: number;
  meanEnquiryPrecision: number;
  meanDuplicateRate: number;
  minIssueRecall: number;
  minIssuePrecision: number;
  pathwayAccuracy: number;
}

export interface QASuiteReport {
  runDate: string;
  totalCases: number;
  passed: number;
  failed: number;
  aggregateScores: AggregateScores;
  perCaseResults: QAEvaluation[];
  falseNegativeSummary: { exceptionType: string; missedInCases: string[] }[];
  falsePositiveSummary: { exceptionType: string; raisedInCases: string[] }[];
  calibrationNotes: string[];
}

// ── Prompt QA rubric ────────────────────────────────────────────

export interface PromptQARubric {
  usesStructuredInputs: boolean | null;
  distinguishesDeclarationsFromEvidence: boolean | null;
  surfacesExceptions: boolean | null;
  surfacesUnmatchedItems: boolean | null;
  generatesProportionateEnquiries: boolean | null;
  avoidsGenericSummarisation: boolean | null;
  handlesHybridCorrectly: boolean | null;
  outputHasRequiredSections: string[];
  score: number;
}

// ── Reviewer feedback hooks ─────────────────────────────────────

export const FEEDBACK_TYPES = [
  'issue_missed',
  'issue_overcalled',
  'enquiry_wording_poor',
  'enquiry_wording_good',
  'evidence_request_missing',
  'evidence_request_unnecessary',
  'severity_too_high',
  'severity_too_low',
  'resolved_by_existing_evidence',
  'pathway_wrong',
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface ReviewerFeedbackItem {
  fixtureId: string;
  feedbackType: FeedbackType;
  linkedExceptionType?: ExceptionType;
  linkedEnquiryCategory?: EnquiryCategory;
  notes: string;
  timestamp: string;
}

export interface CalibrationLog {
  feedbackItems: ReviewerFeedbackItem[];
  aggregateTrends: { feedbackType: string; count: number }[];
}

/**
 * Build a calibration log from reviewer feedback items.
 */
export function buildCalibrationLog(items: ReviewerFeedbackItem[]): CalibrationLog {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.feedbackType, (counts.get(item.feedbackType) ?? 0) + 1);
  }
  return {
    feedbackItems: items,
    aggregateTrends: Array.from(counts.entries()).map(([feedbackType, count]) => ({
      feedbackType,
      count,
    })).sort((a, b) => b.count - a.count),
  };
}

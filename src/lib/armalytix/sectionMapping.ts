/**
 * Armalytix Section-to-Schema Mapping Specification
 *
 * Defines how content from each Armalytix report section maps into
 * the Olimey AI sow_* schema. Consumed by the future parser.
 */

import type { ProvenanceOrigin, VerificationStatus } from './provenanceTypes';

export interface ArmalytixFieldMapping {
  /** Armalytix report section name */
  sourceSection: string;
  /** Regex or label pattern to match in the source, null = section-level */
  sourcePattern: string | null;
  /** Destination table in public schema */
  destinationTable: string;
  /** Destination column(s) */
  destinationField: string;
  /** Default provenance origin for this mapping */
  provenanceDefault: ProvenanceOrigin;
  /** Default verification status on first extraction */
  verificationDefault: VerificationStatus;
  /** true = value copied verbatim, false = derived/computed */
  isDirect: boolean;
  /** Whether a reviewer must confirm before the value is treated as reliable */
  requiresReviewerConfirmation: boolean;
  /** Whether this value feeds into the amount-to-prove calculation */
  contributesToAmountToProve: boolean;
  /** Whether this value can trigger later risk flags or enquiries */
  canTriggerEnquiry: boolean;
}

// ─────────────────────────────────────────────────────────────────
// 1. REPORT METADATA
// ─────────────────────────────────────────────────────────────────

const reportMetadata: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Report Metadata',
    sourcePattern: 'Report Date',
    destinationTable: 'armalytix_reports',
    destinationField: 'report_date',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'not_applicable',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Report Metadata',
    sourcePattern: 'Report File|Filename',
    destinationTable: 'armalytix_reports',
    destinationField: 'report_file_name',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'not_applicable',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Report Metadata',
    sourcePattern: 'Case Reference|Matter Reference',
    destinationTable: 'cases',
    destinationField: 'case_reference',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'not_applicable',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
];

// ─────────────────────────────────────────────────────────────────
// 2. MATTER / PURCHASE SUMMARY
// ─────────────────────────────────────────────────────────────────

const purchaseSummary: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Property Address',
    destinationTable: 'cases',
    destinationField: 'property_address',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Purchase Price',
    destinationTable: 'cases',
    destinationField: 'purchase_price',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Tenure|Freehold|Leasehold',
    destinationTable: 'cases',
    destinationField: 'tenure',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'First Time Buyer',
    destinationTable: 'armalytix_reports',
    destinationField: 'first_time_buyer',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Stamp Duty|SDLT',
    destinationTable: 'armalytix_reports',
    destinationField: 'stamp_duty_expected',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'declared_only',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Developer Incentives',
    destinationTable: 'armalytix_reports',
    destinationField: 'developer_incentives',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Prior Deposit|Deposit Paid',
    destinationTable: 'armalytix_reports',
    destinationField: 'prior_deposit_paid',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Matter / Purchase Summary',
    sourcePattern: 'Current Residential Status',
    destinationTable: 'armalytix_reports',
    destinationField: 'current_residential_status',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
];

// ─────────────────────────────────────────────────────────────────
// 3. BUYER / JOINT BUYER DETAILS
// ─────────────────────────────────────────────────────────────────

const buyerDetails: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Buyer / Joint Buyer Details',
    sourcePattern: 'Full Name|Buyer Name|Purchaser',
    destinationTable: 'case_parties',
    destinationField: 'full_name',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Buyer / Joint Buyer Details',
    sourcePattern: 'Relationship|Joint Buyer Relationship',
    destinationTable: 'case_parties',
    destinationField: 'buyer_relationship',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Buyer / Joint Buyer Details',
    sourcePattern: 'Contribution|Co-Buyer Contribution',
    destinationTable: 'case_parties',
    destinationField: 'contribution_amount',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Buyer / Joint Buyer Details',
    sourcePattern: 'Contact Permission',
    destinationTable: 'case_parties',
    destinationField: 'contact_permission',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Buyer / Joint Buyer Details',
    sourcePattern: 'On Mortgage|Both on Mortgage',
    destinationTable: 'case_parties',
    destinationField: 'on_mortgage',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Buyer / Joint Buyer Details',
    sourcePattern: 'Outside UK|Overseas',
    destinationTable: 'case_parties',
    destinationField: 'outside_uk',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 4. FUNDING OVERVIEW / AMOUNT TO PROVE
// ─────────────────────────────────────────────────────────────────

const fundingOverview: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Amount to Prove|Funds Required',
    destinationTable: 'armalytix_reports',
    destinationField: 'amount_to_prove',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'declared_only',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Total Balance Available',
    destinationTable: 'armalytix_reports',
    destinationField: 'total_balance_available',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'declared_only',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Excess|Shortfall',
    destinationTable: 'armalytix_reports',
    destinationField: 'excess_shortfall',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'declared_only',
    isDirect: false,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Mortgage Amount|Expected Mortgage|Lending|Borrowing',
    destinationTable: 'armalytix_reports',
    destinationField: 'mortgage_amount',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Mortgage Lender',
    destinationTable: 'armalytix_reports',
    destinationField: 'mortgage_lender',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Mortgage Type|Repayment|Interest Only',
    destinationTable: 'armalytix_reports',
    destinationField: 'mortgage_type',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Mortgage Offer|Mortgage Offer in Place',
    destinationTable: 'armalytix_reports',
    destinationField: 'mortgage_offer_in_place',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Funding Overview',
    sourcePattern: 'Gifts|Gift Declared',
    destinationTable: 'armalytix_reports',
    destinationField: 'gifts_declared',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 5. CONNECTED ACCOUNT SUMMARIES
// ─────────────────────────────────────────────────────────────────

const connectedAccounts: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Bank Name|Provider',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'bank_name',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Sort Code',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'sort_code',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Account Number',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'masked_account_number',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Account Holder|Name',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'account_holder_name',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Current Balance|Balance',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'current_balance',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Account Type|Type',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'account_type',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Average Monthly Paid In|Avg.*Paid In',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'avg_monthly_paid_in',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Average Monthly Paid Out|Avg.*Paid Out',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'avg_monthly_paid_out',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Connected Account Summaries',
    sourcePattern: 'Date Range|Period|From.*To',
    destinationTable: 'sow_connected_accounts',
    destinationField: 'date_range_start,date_range_end',
    provenanceDefault: 'account_summary_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
];

// ─────────────────────────────────────────────────────────────────
// 6. MANUALLY ADDED BALANCES & ATTACHMENTS
// ─────────────────────────────────────────────────────────────────

const manualBalances: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Manually Added Balances',
    sourcePattern: 'Description|Label',
    destinationTable: 'sow_manual_balances',
    destinationField: 'description',
    provenanceDefault: 'manual_entry',
    verificationDefault: 'unverified',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Manually Added Balances',
    sourcePattern: 'Amount|Value',
    destinationTable: 'sow_manual_balances',
    destinationField: 'amount',
    provenanceDefault: 'manual_entry',
    verificationDefault: 'unverified',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Manually Added Balances',
    sourcePattern: 'Attachment|Supporting Document|File',
    destinationTable: 'sow_manual_balances',
    destinationField: 'attachment_name',
    provenanceDefault: 'uploaded_document',
    verificationDefault: 'unverified',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 7. SALARY / INCOME VERIFICATION
// ─────────────────────────────────────────────────────────────────

const incomeVerification: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Payslip|Pay Slip',
    destinationTable: 'sow_income_verification',
    destinationField: 'payslip_uploaded',
    provenanceDefault: 'uploaded_document',
    verificationDefault: 'unverified',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Net Pay|Take Home',
    destinationTable: 'sow_income_verification',
    destinationField: 'net_pay_on_payslip',
    provenanceDefault: 'uploaded_document',
    verificationDefault: 'evidenced_by_attachment',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Payslip Name Match',
    destinationTable: 'sow_income_verification',
    destinationField: 'payslip_name_match',
    provenanceDefault: 'ai_inference',
    verificationDefault: 'inferred_pending_review',
    isDirect: false,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Salary Match|Salary Matched.*Bank',
    destinationTable: 'sow_income_verification',
    destinationField: 'salary_matched_to_bank',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Employer Name|Matched Employer',
    destinationTable: 'sow_income_verification',
    destinationField: 'matched_employer_name',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Salary Transaction Count|Number of Salary',
    destinationTable: 'sow_income_verification',
    destinationField: 'salary_tx_count',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Average Salary Credit|Avg.*Salary',
    destinationTable: 'sow_income_verification',
    destinationField: 'avg_salary_credit',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Salary / Income Verification',
    sourcePattern: 'Variability|Salary Variability',
    destinationTable: 'sow_income_verification',
    destinationField: 'variability_pct',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 8 + 9. TRANSACTION SUMMARIES (INCOMING & OUTGOING)
// ─────────────────────────────────────────────────────────────────

const transactionMappings: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Incoming Transaction Summary',
    sourcePattern: null,
    destinationTable: 'sow_transactions',
    destinationField: 'direction=incoming',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Outgoing Transaction Summary',
    sourcePattern: null,
    destinationTable: 'sow_transactions',
    destinationField: 'direction=outgoing',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 10. RAW TRANSACTION LISTINGS
// ─────────────────────────────────────────────────────────────────

const rawTransactions: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Raw Transaction Listings',
    sourcePattern: 'Date|Transaction Date',
    destinationTable: 'sow_transactions',
    destinationField: 'tx_date',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Raw Transaction Listings',
    sourcePattern: 'Description|Narrative',
    destinationTable: 'sow_transactions',
    destinationField: 'description',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Raw Transaction Listings',
    sourcePattern: 'Amount|Value',
    destinationTable: 'sow_transactions',
    destinationField: 'amount',
    provenanceDefault: 'bank_transaction_data',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Raw Transaction Listings',
    sourcePattern: 'Category|Code',
    destinationTable: 'sow_transactions',
    destinationField: 'armalytix_category',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 11. SOURCE OF FUNDS DECLARATIONS
// ─────────────────────────────────────────────────────────────────

const fundSourceDeclarations: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Source Category|Source Type|Primary Source',
    destinationTable: 'sow_fund_sources',
    destinationField: 'source_category',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Declared Amount|Contribution|Value',
    destinationTable: 'sow_fund_sources',
    destinationField: 'declared_amount',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Employer|Employer Name',
    destinationTable: 'sow_fund_sources',
    destinationField: 'employer_name',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Annual.*Salary|Gross Salary',
    destinationTable: 'sow_fund_sources',
    destinationField: 'annual_gross_salary',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Date Received|Receipt Date',
    destinationTable: 'sow_fund_sources',
    destinationField: 'date_received',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Years.*Accumulate|Accumulation Period',
    destinationTable: 'sow_fund_sources',
    destinationField: 'years_to_accumulate',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Income Explains Savings',
    destinationTable: 'sow_fund_sources',
    destinationField: 'income_explains_savings',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Outside UK|Overseas Funds',
    destinationTable: 'sow_fund_sources',
    destinationField: 'outside_uk',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Source of Funds Declarations',
    sourcePattern: 'Supporting Document|Uploaded File',
    destinationTable: 'sow_fund_sources',
    destinationField: 'supporting_doc_uploaded,supporting_doc_name',
    provenanceDefault: 'uploaded_document',
    verificationDefault: 'unverified',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 12. GIFT / CO-BUYER / GOV BONUS / SALE / SAVINGS / LOAN NOTES
// ─────────────────────────────────────────────────────────────────

const specialNotes: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Gift / Co-Buyer / Special Notes',
    sourcePattern: 'Gift.*Donor|Gift.*From|Relationship',
    destinationTable: 'sow_fund_sources',
    destinationField: 'source_sub_category,declared_description',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Gift / Co-Buyer / Special Notes',
    sourcePattern: 'Government Bonus|Help to Buy|ISA Bonus|Lifetime ISA',
    destinationTable: 'sow_fund_sources',
    destinationField: 'source_sub_category',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Gift / Co-Buyer / Special Notes',
    sourcePattern: 'Sale Proceeds|Property Sale',
    destinationTable: 'sow_fund_sources',
    destinationField: 'source_sub_category',
    provenanceDefault: 'client_declaration',
    verificationDefault: 'declared_only',
    isDirect: true,
    requiresReviewerConfirmation: true,
    contributesToAmountToProve: true,
    canTriggerEnquiry: true,
  },
];

// ─────────────────────────────────────────────────────────────────
// 13. ARMALYTIX TRANSACTION MARKERS / LABELS
// ─────────────────────────────────────────────────────────────────

const transactionMarkers: ArmalytixFieldMapping[] = [
  {
    sourceSection: 'Transaction Markers',
    sourcePattern: 'Salary|Repeating Credit',
    destinationTable: 'sow_transactions',
    destinationField: 'is_repeating',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
  {
    sourceSection: 'Transaction Markers',
    sourcePattern: 'Large Credit|Large Debit',
    destinationTable: 'sow_transactions',
    destinationField: 'is_large',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Transaction Markers',
    sourcePattern: 'Cash In|Cash Out|Cash.*Like',
    destinationTable: 'sow_transactions',
    destinationField: 'is_cash_or_cash_like',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Transaction Markers',
    sourcePattern: 'Gambling|Betting|Casino',
    destinationTable: 'sow_transactions',
    destinationField: 'is_gambling_related',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Transaction Markers',
    sourcePattern: 'Investment|Trading|Platform',
    destinationTable: 'sow_transactions',
    destinationField: 'is_investment_related',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: true,
  },
  {
    sourceSection: 'Transaction Markers',
    sourcePattern: 'Inter.*Account|Transfer.*Own|Internal Transfer',
    destinationTable: 'sow_transactions',
    destinationField: 'is_inter_account_transfer',
    provenanceDefault: 'armalytix_generated_summary',
    verificationDefault: 'evidenced_by_bank_data',
    isDirect: false,
    requiresReviewerConfirmation: false,
    contributesToAmountToProve: false,
    canTriggerEnquiry: false,
  },
];

// ─────────────────────────────────────────────────────────────────
// COMBINED MAPPING SPECIFICATION
// ─────────────────────────────────────────────────────────────────

export const ARMALYTIX_SECTION_MAPPINGS: ArmalytixFieldMapping[] = [
  ...reportMetadata,
  ...purchaseSummary,
  ...buyerDetails,
  ...fundingOverview,
  ...connectedAccounts,
  ...manualBalances,
  ...incomeVerification,
  ...transactionMappings,
  ...rawTransactions,
  ...fundSourceDeclarations,
  ...specialNotes,
  ...transactionMarkers,
];

/**
 * Helper: get all mappings for a given destination table.
 */
export function getMappingsForTable(table: string): ArmalytixFieldMapping[] {
  return ARMALYTIX_SECTION_MAPPINGS.filter((m) => m.destinationTable === table);
}

/**
 * Helper: get all mappings that contribute to amount-to-prove.
 */
export function getAmountToProveMappings(): ArmalytixFieldMapping[] {
  return ARMALYTIX_SECTION_MAPPINGS.filter((m) => m.contributesToAmountToProve);
}

/**
 * Helper: get all mappings that can trigger enquiries.
 */
export function getEnquiryTriggerMappings(): ArmalytixFieldMapping[] {
  return ARMALYTIX_SECTION_MAPPINGS.filter((m) => m.canTriggerEnquiry);
}

/**
 * Helper: get all mappings that require reviewer confirmation.
 */
export function getReviewerRequiredMappings(): ArmalytixFieldMapping[] {
  return ARMALYTIX_SECTION_MAPPINGS.filter((m) => m.requiresReviewerConfirmation);
}

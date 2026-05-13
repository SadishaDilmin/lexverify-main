/**
 * Shared mapping from AI document classification categories to case folder keys.
 * Used by both post-upload classification and existing-file reclassification.
 */

export const CATEGORY_TO_FOLDER: Record<string, string> = {
  "Bank Statement": "aml-sow",
  "Payslip": "aml-sow",
  "P60 / P45": "aml-sow",
  "Tax Return / SA302": "aml-sow",
  "Gift Letter / Declaration": "aml-sow",
  "Mortgage Offer / Agreement in Principle": "aml-sow",
  "ID Document (Passport / Driving Licence)": "aml-sow",
  "Proof of Address": "aml-sow",
  "Open Banking Report": "aml-sow",
  "Savings / ISA Statement": "aml-sow",
  "Pension Statement": "aml-sow",
  "Investment / Share Certificate": "aml-sow",
  "Business Accounts / Company Financials": "aml-sow",
  "Tenancy Agreement / Rental Income": "aml-sow",
  "Inheritance / Probate Documentation": "aml-sow",
  "Compensation / Settlement Agreement": "aml-sow",
  "Insurance Policy": "miscellaneous",
  "Utility Bill": "aml-sow",
  "Council Tax Bill": "aml-sow",
  "Purchase Instruction Form": "contracts",
  "Solicitor Completion Statement": "contracts",
  "Property Valuation": "miscellaneous",
  "Other / Unknown": "",
};

/** Classification confidence levels */
export type ClassificationConfidence = "high" | "medium" | "low";

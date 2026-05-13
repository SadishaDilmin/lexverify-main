export type UserRole = "super_admin" | "admin" | "support_admin" | "auditor" | "user";

export interface User {
  id: string;
  fullName: string;
  email: string;
  position: string;
  role: UserRole;
  active: boolean;
}

export type CaseStatus = "open" | "documents_pending" | "review_ready" | "review_complete" | "completed" | "closed";
export type TransactionType = "Purchase" | "Sale";
export type Tenure = "Freehold" | "Leasehold" | "Commonhold" | "Unknown";
export type PropertyType = "House" | "Flat" | "Maisonette" | "Other" | "Unknown";
export type RiskLevel = "green" | "amber" | "red";

export interface CaseRecord {
  id: string;
  caseReference: string;
  propertyAddress: string;
  transactionType: TransactionType;
  tenure: Tenure;
  propertyType: PropertyType;
  feeEarnerName: string;
  feeEarnerEmail: string;
  sellerConveyancerEmail?: string;
  lender?: string;
  
  status: CaseStatus;
  riskLevel?: RiskLevel;
  riskScore?: number;
  lastUpdated: string;
  createdAt: string;
}

export interface DocumentUpload {
  type: "local_authority" | "drainage_water" | "environmental" | "epc";
  fileName?: string;
  uploaded: boolean;
  complete: boolean;
  notes?: string;
}

export interface RiskScoreBreakdown {
  localSearch: number;
  drainageWater: number;
  environmental: number;
  epc: number;
  total: number;
  level: RiskLevel;
  topDrivers: { description: string; reference: string; impact: number }[];
}

export interface AuditLogEntry {
  id: string;
  caseReference?: string;
  userName: string;
  userEmail: string;
  userPosition: string;
  timestamp: string;
  eventType: string;
  metadata?: string;
}

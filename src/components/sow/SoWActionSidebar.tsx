import {
  Send, Search, Mail, FileSearch, ChevronRight, Bot, Loader2,
  AlertTriangle, Users, FileText, Pencil, Coins, Shield, Eye,
  FileWarning, Sparkles, CheckCircle2, Banknote, PiggyBank, Gift,
  FilterX, Info as InfoIcon, UserCheck, CircleAlert, GitMerge, AlertCircle,
} from "lucide-react";
import { useState } from "react";
import SoWMissingDocuments, { parseMissingDocuments, type MissingDocItem } from "./SoWMissingDocuments";
import SectionFindingCard from "./SectionFindingCard";
import {
  currentResolution,
  type SectionCompliancePayload,
  type SectionResolutionAction,
  type SectionValidationResult,
} from "@/lib/sowSectionValidator";
import { resolveFinding } from "@/lib/sectionFindingActions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import RingChart from "@/components/RingChart";
import SoWCaseProgress from "./SoWCaseProgress";
import ConsistencyMatrix from "./ConsistencyMatrix";
import type { ExceptionItem } from "@/lib/armalytix/exceptionEngine";
import type { DraftEnquiry } from "@/lib/armalytix/enquiryGenerator";
import type { CheckExecutionRecord } from "@/lib/armalytix/checkStatus";


interface ActionItem {
  label: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface AIStatus {
  docsProcessed: number;
  docsTotal: number;
  fundingPattern: string;
  amlRiskLevel: string;
  profileVerified?: boolean;
}

interface PersonProfile {
  fullName: string;
  role: string;
  contributionAmount: string;
  fundingSource: string;
  employmentStatus: string;
  pepStatus: string;
  buyerType: string;
  files: { id: string }[];
  raiseEnquiryFunding: boolean;
  raiseEnquiryEmployment: boolean;
}

interface ProfileField {
  key: string;
  label: string;
  filled: boolean;
}

function getPersonProfileFields(person: PersonProfile): ProfileField[] {
  const fields: ProfileField[] = [
    { key: "fullName", label: "Full Name", filled: !!person.fullName.trim() },
    { key: "contributionAmount", label: "Contribution (£)", filled: !!person.contributionAmount.trim() },
    { key: "fundingSource", label: "Funding Source", filled: person.raiseEnquiryFunding || !!person.fundingSource },
    { key: "employmentStatus", label: "Employment", filled: person.raiseEnquiryEmployment || !!person.employmentStatus },
    { key: "pepStatus", label: "PEP Status", filled: !!person.pepStatus && person.pepStatus !== "Unknown" },
    { key: "files", label: "Documents Attached", filled: person.files.length > 0 },
  ];
  if (person.role === "Purchaser") {
    fields.push({ key: "buyerType", label: "Buyer Type", filled: !!person.buyerType && person.buyerType !== "Standard" });
  }
  return fields;
}

function computeOverallCompleteness(persons: PersonProfile[], transactionFilled: boolean[]): {
  overall: number;
  persons: { name: string; role: string; pct: number; missing: string[] }[];
  transactionPct: number;
} {
  const txFilled = transactionFilled.filter(Boolean).length;
  const txTotal = transactionFilled.length;
  const transactionPct = txTotal > 0 ? Math.round((txFilled / txTotal) * 100) : 100;

  const personResults = persons.map((p) => {
    const fields = getPersonProfileFields(p);
    const filled = fields.filter((f) => f.filled).length;
    const pct = Math.round((filled / fields.length) * 100);
    const missing = fields.filter((f) => !f.filled).map((f) => f.label);
    return { name: p.fullName.trim() || `${p.role}`, role: p.role, pct, missing };
  });

  const totalFields = persons.reduce((sum, p) => sum + getPersonProfileFields(p).length, 0) + txTotal;
  const totalFilled = persons.reduce((sum, p) => sum + getPersonProfileFields(p).filter((f) => f.filled).length, 0) + txFilled;
  const overall = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0;

  return { overall, persons: personResults, transactionPct };
}

interface SoWActionSidebarProps {
  onRunAssessment: () => void;
  onEditCaseDetails: () => void;
  onOpenAssistant: () => void;
  onUploadMissing?: (file: File, category: string, label: string) => void;
  isLoading: boolean;
  bulkBusy: boolean;
  hasResults: boolean;
  aiStatus: AIStatus;
  complianceConfidence: number;
  creditBalance: number | null;
  creditCost: number;
  resultText?: string;
  progress: {
    docsUploaded: boolean;
    classified: boolean;
    analysisRun: boolean;
    complianceReviewed: boolean;
    enquiriesGenerated: boolean;
  };
  filteredFindingsCount?: number;
  sectionValidation?: SectionValidationResult | null;
  /** ai_reports.id required for resolving section-compliance findings. */
  aiReportId?: string;
  /** Notify parent that the persisted compliance payload changed (resolution applied). */
  onComplianceUpdated?: (
    compliance: SectionCompliancePayload,
    reportFields?: { internal_report?: string | null; client_report?: string | null; draft_email?: string | null } | null,
  ) => void;
  persons?: PersonProfile[];
  transactionFilled?: boolean[];
  evidenceFileNames?: string[];
  uploadingCategory?: string | null;
  uploadedCategories?: Set<string>;
  /** LSAG A–E live findings for the current case (Armalytix-backed cases only). */
  matrixEnabled?: boolean;
  matrixExceptions?: ExceptionItem[];
  matrixEnquiries?: DraftEnquiry[];
  matrixPendingChecks?: CheckExecutionRecord[];
}

// Parse compliance risk indicators from result text
function parseComplianceRiskIndicators(text: string, hasResults: boolean) {
  if (!hasResults || !text) return [];
  const lower = text.toLowerCase();

  const pepRisk = lower.includes("politically exposed") || lower.includes("pep")
    ? "High"
    : lower.includes("public office") || lower.includes("government")
      ? "Medium" : "None";

  const fundingAnomaly = lower.includes("circular") || lower.includes("round-trip")
    ? "High"
    : lower.includes("anomal") || lower.includes("inconsisten") || lower.includes("unexplained deposit")
      || (lower.includes("cash deposit") && (lower.includes("flag") || lower.includes("concern")))
      ? "Medium" : "None";

  const addressMismatch = lower.includes("address") && lower.includes("mismatch") && lower.includes("unexplained")
    ? "High"
    : lower.includes("mismatch") || lower.includes("address discrepanc")
      || (lower.includes("address") && lower.includes("inconsisten"))
      ? "Medium" : "None";

  const docGap = (lower.includes("gap") && lower.includes("statement"))
    || lower.includes("stale") || lower.includes("coverage insufficient")
    ? "Medium"
    : lower.includes("missing") && lower.includes("bank statement")
      ? "Medium" : "None";

  return [
    { label: "PEP / sanctions risk", level: pepRisk },
    { label: "Funding anomaly", level: fundingAnomaly },
    { label: "Address mismatch", level: addressMismatch },
    { label: "Document gaps", level: docGap },
  ];
}

// Parse evidence breakdown
function parseEvidenceBreakdown(text: string, hasResults: boolean) {
  if (!hasResults) return [];
  const items = [
    { label: "Income Evidence", keyword: "income", icon: Banknote },
    { label: "Savings Evidence", keyword: "savings", icon: PiggyBank },
    { label: "Gift Evidence", keyword: "gift", icon: Gift },
    { label: "ID Evidence", keyword: "identity", icon: Shield },
  ];
  return items.map((item) => {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(item.keyword);
    if (idx === -1) return { ...item, status: "Awaiting" as const };
    const nearby = lower.slice(Math.max(0, idx - 80), idx + 150);
    if (nearby.includes("missing") || nearby.includes("not provided") || nearby.includes("outstanding")) return { ...item, status: "Missing" as const };
    if (nearby.includes("partial") || nearby.includes("insufficient")) return { ...item, status: "Partial" as const };
    return { ...item, status: "Verified" as const };
  });
}

const statusColor = { Verified: "text-[hsl(var(--risk-green))]", Partial: "text-[hsl(var(--risk-amber))]", Missing: "text-[hsl(var(--risk-red))]", Awaiting: "text-muted-foreground" };

export default function SoWActionSidebar({
  onRunAssessment,
  onEditCaseDetails,
  onOpenAssistant,
  onUploadMissing,
  isLoading,
  bulkBusy,
  hasResults,
  aiStatus,
  complianceConfidence,
  creditBalance,
  creditCost,
  resultText = "",
  progress,
  filteredFindingsCount = 0,
  sectionValidation = null,
  aiReportId,
  onComplianceUpdated,
  persons = [],
  transactionFilled = [],
  evidenceFileNames = [],
  uploadingCategory = null,
  uploadedCategories = new Set(),
  matrixEnabled = false,
  matrixExceptions = [],
  matrixEnquiries = [],
  matrixPendingChecks = [],
}: SoWActionSidebarProps) {
  const { toast } = useToast();
  const completeness = computeOverallCompleteness(persons, transactionFilled);
  const actions: ActionItem[] = [
    {
      label: "Run Full Olimey AI Analysis",
      description: "Comprehensive source of wealth review",
      icon: Send,
      onClick: onRunAssessment,
      disabled: isLoading || bulkBusy,
      loading: isLoading,
    },
    {
      label: "Case Details & Parties",
      description: "Property, price, tenure, purchasers & giftors",
      icon: Pencil,
      onClick: onEditCaseDetails,
    },
  ];

  const insufficient = creditBalance !== null && creditBalance < creditCost;

  const missingDocItems = parseMissingDocuments(resultText, { evidenceFileNames });
  const evidenceBreakdown = parseEvidenceBreakdown(resultText, hasResults);
  const riskIndicators = parseComplianceRiskIndicators(resultText, hasResults);

  // Section-compliance state derived from validation result + persisted resolutions
  const complianceFindings = sectionValidation?.compliance?.findings ?? sectionValidation?.omissions ?? [];
  const complianceResolutions = sectionValidation?.compliance?.resolutions ?? [];

  const handleResolveFinding = async (
    findingId: string,
    action: SectionResolutionAction,
    opts?: { revertsResolutionId?: string; sourceResolutionId?: string },
  ) => {
    if (!aiReportId) {
      toast({ title: "Cannot resolve", description: "Save the report first.", variant: "destructive" });
      return;
    }
    try {
      const result = await resolveFinding({
        aiReportId,
        findingId,
        action,
        revertsResolutionId: opts?.revertsResolutionId,
        sourceResolutionId: opts?.sourceResolutionId,
      });
      onComplianceUpdated?.(result.compliance, result.reportFields ?? null);
      const isMerge = action === "ai_merged";
      const isRevertOfMerge = action === "reverted" && !!result.reportFields;
      toast({
        title:
          action === "reverted"
            ? isRevertOfMerge ? "Merge undone — report restored" : "Resolution undone"
            : isMerge ? "AI draft merged into report" : "Finding resolved",
        description:
          action === "ai_addressed"
            ? "AI draft ready — review, then press Merge into report or copy manually."
            : isMerge ? "Report fields updated. Use Undo to restore the prior text." : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Resolution failed", description: msg, variant: "destructive" });
    }
  };

  // ── Bulk-merge support ────────────────────────────────────────────
  // A finding is eligible for bulk merge when its current (non-reverted)
  // resolution is `ai_addressed`, the AI output has no error, and there is
  // mergeable content (report_amendment or added_enquiry).
  const bulkMergeCandidates = complianceFindings
    .map((f) => {
      const r = currentResolution(f.id, complianceResolutions);
      if (!r || r.action !== "ai_addressed") return null;
      const out = (r.ai_output as Record<string, unknown> | null) ?? null;
      if (!out || (typeof out.error === "string" && out.error.length > 0)) return null;
      const amend = typeof out.report_amendment === "string" ? out.report_amendment.trim() : "";
      const enquiry = typeof out.added_enquiry === "string" ? out.added_enquiry.trim() : "";
      if (amend.length === 0 && enquiry.length === 0) return null;
      return { findingId: f.id, sectionLabel: f.section, sourceResolutionId: r.id };
    })
    .filter((x): x is { findingId: string; sectionLabel: string; sourceResolutionId: string } => x !== null);

  const [bulkMergeBusy, setBulkMergeBusy] = useState(false);
  const [confirmingBulkMerge, setConfirmingBulkMerge] = useState(false);

  const handleBulkMerge = async () => {
    if (!aiReportId || bulkMergeBusy || bulkMergeCandidates.length === 0) return;
    setBulkMergeBusy(true);
    let succeeded = 0;
    const failed: { section: string; error: string }[] = [];
    // Sequential: each merge snapshots prior text and appends; concurrent calls
    // would race on report fields and produce non-deterministic Undo state.
    for (const candidate of bulkMergeCandidates) {
      try {
        const result = await resolveFinding({
          aiReportId,
          findingId: candidate.findingId,
          action: "ai_merged",
          sourceResolutionId: candidate.sourceResolutionId,
        });
        // Mirror updated state into the parent immediately so the next iteration
        // sees the post-merge report fields when the edge function snapshots.
        onComplianceUpdated?.(result.compliance, result.reportFields ?? null);
        succeeded += 1;
      } catch (err) {
        failed.push({
          section: candidate.sectionLabel,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    setBulkMergeBusy(false);
    setConfirmingBulkMerge(false);

    if (failed.length === 0) {
      toast({
        title: `Merged ${succeeded} AI-drafted finding${succeeded !== 1 ? "s" : ""}`,
        description: "Each merge logged separately. Use Undo on any card to restore prior text.",
      });
    } else if (succeeded === 0) {
      toast({
        title: "Bulk merge failed",
        description: failed[0].error,
        variant: "destructive",
      });
    } else {
      toast({
        title: `Merged ${succeeded} of ${succeeded + failed.length}`,
        description: `${failed.length} failed: ${failed.map((f) => f.section).join(", ")}`,
        variant: "destructive",
      });
    }
  };


  return (
    <div className="w-full min-w-0 border-l border-border bg-card/50 flex flex-col h-full">
      {/* Premium Header */}
      <div className="px-4 py-4 border-b border-border bg-gradient-to-r from-card to-muted/30">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/20">
            <Bot size={15} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground leading-tight tracking-tight">AI Compliance Assistant</h3>
            <p className="text-[10px] text-muted-foreground">Olimey AI Review</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="pl-3 pr-4 py-3 pb-24 space-y-3">
          {/* Action buttons */}
          <div className="space-y-1.5">
            {actions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-muted/50 hover:shadow-sm transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors border border-accent/10">
                  {action.loading ? (
                    <Loader2 size={14} className="text-accent animate-spin" />
                  ) : (
                    <action.icon size={14} className="text-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-tight">{action.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{action.description}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
              </button>
            ))}
          </div>

          {/* Profile Completeness Score */}
          {persons.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck size={11} /> Profile Completeness
                </h4>
                <span className={`text-sm font-bold ${
                  completeness.overall >= 80 ? "text-[hsl(var(--risk-green))]"
                    : completeness.overall >= 50 ? "text-[hsl(var(--risk-amber))]"
                    : "text-[hsl(var(--risk-red))]"
                }`}>
                  {completeness.overall}%
                </span>
              </div>
              <Progress
                value={completeness.overall}
                className="h-1.5"
              />

              {/* Transaction completeness */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground flex items-center gap-1">
                  <FileText size={10} /> Transaction Details
                </span>
                <span className={`font-medium ${
                  completeness.transactionPct >= 80 ? "text-[hsl(var(--risk-green))]"
                    : completeness.transactionPct >= 50 ? "text-[hsl(var(--risk-amber))]"
                    : "text-[hsl(var(--risk-red))]"
                }`}>{completeness.transactionPct}%</span>
              </div>

              {/* Per-person breakdown */}
              {completeness.persons.map((p, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1 truncate max-w-[160px]">
                      <Users size={10} /> {p.name}
                    </span>
                    <span className={`font-medium ${
                      p.pct >= 80 ? "text-[hsl(var(--risk-green))]"
                        : p.pct >= 50 ? "text-[hsl(var(--risk-amber))]"
                        : "text-[hsl(var(--risk-red))]"
                    }`}>{p.pct}%</span>
                  </div>
                  {p.missing.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-4">
                      {p.missing.map((m) => (
                        <span key={m} className="inline-flex items-center gap-0.5 rounded-full bg-[hsl(var(--risk-amber-bg))] text-[hsl(var(--risk-amber))] px-1.5 py-0.5 text-[9px] font-medium">
                          <CircleAlert size={8} /> {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {creditBalance !== null && (
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs ${
              insufficient
                ? "border-destructive/30 bg-destructive/5"
                : "border-accent/20 bg-accent/5"
            }`}>
              <span className="flex items-center gap-1.5">
                <Coins size={12} className={insufficient ? "text-destructive" : "text-accent"} />
                <span className="text-muted-foreground">Balance: <strong className="text-foreground">{creditBalance}</strong></span>
              </span>
              <span className={`font-semibold ${insufficient ? "text-destructive" : "text-accent"}`}>
                Cost: {creditCost}
              </span>
            </div>
          )}

          <Separator />

          {/* AI Status - card style */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">AI Findings</h4>
            {[
              { icon: FileText, label: "Docs Processed", value: `${aiStatus.docsProcessed}/${aiStatus.docsTotal}`, color: "text-foreground" },
              {
                icon: Search, label: "Funding Pattern", value: aiStatus.fundingPattern,
                color: aiStatus.fundingPattern === "Consistent" ? "text-[hsl(var(--risk-green))]"
                  : aiStatus.fundingPattern === "Inconsistent" ? "text-[hsl(var(--risk-red))]"
                  : "text-muted-foreground"
              },
              {
                icon: Eye, label: "Profile Verified", value: aiStatus.profileVerified ? "Yes" : "Pending",
                color: aiStatus.profileVerified ? "text-[hsl(var(--risk-green))]" : "text-muted-foreground"
              },
            ].map((item) => (
              <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-card text-xs accent-bar-left">
                <span className="min-w-0 flex items-center gap-1.5 pl-2 text-muted-foreground">
                  <item.icon size={12} /> {item.label}
                </span>
                <span className={`min-w-0 break-words text-right font-semibold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Relevance Gate — Filtered Findings Indicator */}
          {hasResults && filteredFindingsCount > 0 && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[hsl(var(--risk-green))]/20 bg-[hsl(var(--risk-green))]/5">
              <div className="w-7 h-7 rounded-lg bg-[hsl(var(--risk-green))]/10 flex items-center justify-center shrink-0 border border-[hsl(var(--risk-green))]/20">
                <FilterX size={13} className="text-[hsl(var(--risk-green))]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-foreground leading-tight">
                  {filteredFindingsCount} finding{filteredFindingsCount !== 1 ? "s" : ""} filtered
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Non-actionable items removed by AI relevance gate
                </p>
              </div>
            </div>
          )}

          {/* Section Compliance findings are now rendered inline within the
              Internal Report (see SectionFindingStrip). The right-hand sidebar
              no longer duplicates them. */}

          <Separator />

          {/* Compliance Confidence */}
          <div className="flex min-w-0 flex-col items-center space-y-3">
            <div className="flex min-w-0 items-center gap-1 w-full px-1">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Compliance Confidence</h4>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors" aria-label="How is this calculated?">
                    <InfoIcon size={12} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="left" align="start" className="w-72 text-xs space-y-2 p-3">
                  <p className="font-semibold text-foreground text-sm">How is this score calculated?</p>
                  <p className="text-muted-foreground">
                    The Compliance Confidence score is an <span className="font-medium text-foreground">indicative gauge</span> derived
                    from keyword analysis of the AI-generated report. It starts at 50% and adjusts based on evidence detected:
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-risk-green font-medium">Positive signals (+5 to +10 each):</p>
                    <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                      <li>Income / salary verified</li>
                      <li>Savings evidence confirmed</li>
                      <li>Identity & address verified</li>
                      <li>Bank statements present</li>
                      <li>Gift declarations provided</li>
                      <li>Open banking data verified</li>
                    </ul>
                    <p className="text-destructive font-medium mt-1.5">Negative signals (−5 to −15 each):</p>
                    <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                      <li>Missing or outstanding documents</li>
                      <li>Inconsistencies detected</li>
                      <li>Statement gaps flagged</li>
                      <li>Cash deposit concerns</li>
                      <li>Circular / round-trip payments</li>
                      <li>High or medium risk indicators</li>
                    </ul>
                  </div>
                  <div className="border-t border-border pt-1.5 space-y-0.5">
                    <p className="text-muted-foreground"><span className="font-medium text-risk-green">≥ 70%</span> → Low AML risk</p>
                    <p className="text-muted-foreground"><span className="font-medium text-risk-amber">40–69%</span> → Medium AML risk</p>
                    <p className="text-muted-foreground"><span className="font-medium text-destructive">&lt; 40%</span> → High AML risk</p>
                  </div>
                  <p className="text-muted-foreground italic text-[10px] pt-0.5">This is an automated indicator — always review the full report for a definitive assessment.</p>
                </PopoverContent>
              </Popover>
            </div>
            <RingChart
              value={complianceConfidence}
              max={100}
              size={80}
              strokeWidth={4}
              label={`${complianceConfidence}%`}
              sublabel={
                complianceConfidence >= 70 ? "Low AML risk"
                  : complianceConfidence >= 40 ? "Medium AML risk"
                  : complianceConfidence > 0 ? "High AML risk"
                  : "Awaiting analysis"
              }
            />
            {/* Evidence breakdown */}
            {hasResults && evidenceBreakdown.length > 0 && (
              <div className="w-full space-y-1">
                {evidenceBreakdown.map((item) => (
                  <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 text-[11px] px-1">
                    <span className="min-w-0 truncate text-muted-foreground flex items-center gap-1.5">
                      <item.icon size={11} /> {item.label}
                    </span>
                    <span className={`shrink-0 font-medium ${statusColor[item.status]}`}>{item.status}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Risk indicators */}
            {hasResults && riskIndicators.length > 0 && (
              <div className="w-full space-y-1 border-t border-border pt-2">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Risk Indicators</p>
                {riskIndicators.map((item) => (
                  <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 text-[11px] px-1">
                    <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
                    <span className={`shrink-0 font-medium ${
                      item.level === "None" || item.level === "Low" ? "text-[hsl(var(--risk-green))]"
                        : item.level === "Medium" ? "text-[hsl(var(--risk-amber))]"
                        : "text-[hsl(var(--risk-red))]"
                    }`}>{item.level}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Missing Evidence indicator (details in banner above results) */}
          {hasResults && missingDocItems.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-1.5 px-1 py-1">
                <FileWarning size={11} className="text-[hsl(var(--risk-amber))]" />
                <span className="text-[10px] text-muted-foreground">{missingDocItems.length} missing document{missingDocItems.length !== 1 ? "s" : ""} — see banner above results</span>
              </div>
            </>
          )}

          {/* LSAG Consistency Matrix — Armalytix-backed cases only */}
          {matrixEnabled && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="px-1">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    LSAG Consistency Matrix
                  </h4>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                    Cross-document A–E findings from the live case data.
                  </p>
                </div>
                {matrixExceptions.length > 0 || matrixPendingChecks.length > 0 ? (
                  <ConsistencyMatrix
                    exceptions={matrixExceptions}
                    enquiries={matrixEnquiries}
                    pendingChecks={matrixPendingChecks}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground px-1 py-2">
                    No cross-document findings yet.
                  </p>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Case Progress */}
          <div className="px-1">
            <SoWCaseProgress {...progress} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * useSoWSubmit — M2 extraction of the 600+ line handleSubmit orchestration
 * from SoWFormUI.tsx into a dedicated custom hook.
 *
 * Preserves: atomic credit deduction (deduct_credits_atomic RPC),
 * Gemini 2.5 Pro model overrides, H1 graceful "Retry All Failed Batches",
 * consolidation pass with graceful degradation, and warmup ping.
 */

import { useState, useRef, useCallback } from "react";
import type { SufficiencyResult, SufficiencyAcknowledgement } from "@/types/sufficiency";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, type UserCredits } from "@/hooks/useCredits";
import { estimateSoWCredits, type SoWCreditBreakdown } from "@/lib/sowCredits";
import { uploadFilesToCaseFolder, downloadFolderFiles, saveAssessmentReport } from "@/lib/caseFolders";
import type { AttachedFile } from "@/components/AgentChatFileAttachment";
import type { streamChat as StreamChatFn } from "@/lib/streamChat";
import { streamChunkWorker } from "@/lib/streamChat";
import {
  PROMPT_DOMAINS,
  buildDomainPrompt,
  mapDocsToDomains,
  hasOpenBankingDocs,
  MIN_DOCS_FOR_DOMAIN_SPLIT,
} from "@/lib/sowPromptDomains";
import { SINGLE_PASS_CHAR_THRESHOLD } from "@/components/sow/sowHelpers";
import {
  buildPersonalProfileSection,
  upsertPersonalProfileSection,
  type PersonInputForProfile,
  type ProfileResultPerson,
  type CompaniesHouseResultPerson,
  type OfsiResultParty,
  type FcaResultFirm,
  type FatfData,
} from "@/lib/sow/personalProfileBuilder";
import { persistEnrichmentForCase } from "@/lib/sow/persistEnrichment";

import {
  type DocExtractionStat,
  type PersonDetail,
  type DocProcessingItem,
  type DocProcessingState,
  MAX_AGENT_CHAT_MESSAGE_CHARS,
  MAX_DOC_SUMMARY_CHARS,
  MAX_FINANCIAL_DOC_SUMMARY_CHARS,
  MAX_PROFILE_INTEL_CHARS,
  DOCS_PER_CHUNK,
  SOW_STREAM_TIMEOUT_MS,
  SOW_CHUNK_TIMEOUT_MS,
  PROFILE_MARKER,
  INTERNAL_MARKER,
  EMAIL_MARKER,
  isFinancialDoc,
  isExtractionFailureSummary,
  truncateForContext,
  buildBoundedAssessmentContext,
  chunkDocumentsBySize,
  parseSections,
  Semaphore,
  preProcessDocuments,
  extractEvidenceMap,
  persistEvidenceMap,
} from "@/components/sow/sowHelpers";
import { getDocClassification, isFinancialByClassification } from "@/components/sow/sowHelpers";
import { listFolderFiles } from "@/lib/caseFolders";
import { validateMandatorySections, type SectionValidationResult } from "@/lib/sowSectionValidator";
import { evaluateDraftEmailCoverage } from "@/lib/draftEmailCoverage";

// ── Types ─────────────────────────────────────────────────────────────

export interface SoWFormState {
  propertyAddress: string;
  purchasePrice: string;
  caseReference: string;
  tenure: string;
  stampDuty: string;
  legalFees: string;
  mortgageAmount: string;
  clientFundsToVerify: string;
  transactionType: string;
  propertyType: string;
  lender: string;
  additionalContext: string;
  riskClassification: string;
  purchasers: PersonDetail[];
  hasGiftors: boolean;
  giftors: PersonDetail[];
}

export interface SoWSubmitConfig {
  agentId: string;
  streamChat: typeof StreamChatFn;
  selectedCaseId: string | null;
  attachedFiles: AttachedFile[];
  formState: SoWFormState;
  prefillData: { purchasers?: any[]; giftors?: any[] };
  savedFileNames: React.MutableRefObject<Set<string>>;
  logAuditEvent: (eventType: string, caseRef?: string, metadata?: Record<string, any>) => Promise<void>;
  /** Callback to open transaction dialog for missing fields */
  openTransactionDialog: () => void;
}

/**
 * Canonical run phases for a SoW assessment. Drives the SoWRunStatusPanel.
 * Any new `setDocProcessingStatus` call site SHOULD also call `setRunPhase`
 * to keep the panel state honest. Phases:
 *   idle | preparing | extracting | analysing | retrying-batches |
 *   consolidating | retrying-consolidation | timed-out | failed |
 *   complete | cancelled
 */
export type SoWRunPhase =
  | "idle"
  | "preparing"
  | "extracting"
  | "analysing"
  | "retrying-batches"
  | "consolidating"
  | "retrying-consolidation"
  | "timed-out"
  | "failed"
  | "complete"
  | "cancelled";

export interface SoWRunPhaseDetail {
  current?: number;
  total?: number;
  attempt?: number;
  model?: string;
}

/**
 * Snapshot of the work that was completed and preserved at the instant
 * consolidation failed. Captured once inside the catch block, then frozen
 * until the next submit / retry / cancel resets it. Read-only — surfaces
 * what the operator keeps if they don't retry, and what the retry will reuse.
 */
export interface SoWPreservedSnapshot {
  capturedAt: number;
  docsExtracted: number;
  docsTotal: number;
  batchesCompleted: number;
  batchesTotal: number;
  batchRetryRounds: number;
  consolidationElapsedSec: number;
  preservedCharCount: number;
}

export interface SoWSubmitReturn {
  /** Trigger the full SoW submission pipeline */
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  /** Cancel an in-progress analysis */
  handleCancel: () => void;
  /** Retry a failed consolidation pass */
  handleRetryConsolidation: () => Promise<void>;
  /** Whether the analysis is currently running */
  isSubmitting: boolean;
  /** H1: Chunk failure state for "Retry All Failed Batches" */
  chunkFailureState: { failed: boolean; message: string; retryFn: () => void } | null;
  /** 0–100 progress through the pipeline */
  overallProgress: number;
  /** Human-readable status label */
  docProcessingStatus: string | null;
  /** Per-doc extraction statistics */
  extractionStats: DocExtractionStat[];
  /** Live per-document processing status */
  docItems: DocProcessingItem[];
  /** The accumulated AI result text */
  result: string;
  setResult: React.Dispatch<React.SetStateAction<string>>;
  /** Saved report ID after persistence */
  savedReportId: string | undefined;
  setSavedReportId: React.Dispatch<React.SetStateAction<string | undefined>>;
  /** Filtered findings count from relevance gate */
  filteredFindingsCount: number;
  /** Post-generation section validation result */
  sectionValidation: SectionValidationResult | null;
  setSectionValidation: React.Dispatch<React.SetStateAction<SectionValidationResult | null>>;
  /** Credit confirmation dialog state */
  creditConfirmOpen: boolean;
  setCreditConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pendingCreditBreakdown: SoWCreditBreakdown | null;
  /** Accept the credit confirmation and proceed */
  confirmCredits: () => void;
  /** Previous result for comparison view */
  previousResult: string;
  showComparison: boolean;
  setShowComparison: React.Dispatch<React.SetStateAction<boolean>>;
  /** Save the current report to DB; resolves with the saved ai_reports.id (or undefined). */
  saveReport: (fullText: string) => Promise<string | undefined>;
  /** Ref to pending chunk results for retry consolidation */
  hasPendingConsolidation: boolean;
  /** Elapsed seconds counter */
  elapsedSeconds: number;
  /** Typed run-phase state machine for the run-status panel */
  runPhase: SoWRunPhase;
  runPhaseDetail: SoWRunPhaseDetail;
  /** Reactive mirror of the per-run idempotency key (sow-<ms>) */
  currentRunIdValue: string | null;
  /** Round of batch retries used in the current run (0 if none) */
  chunkRetryRound: number;
  /** Reactive mirror of consolidationAttempts.current for this run */
  consolidationAttemptsThisRun: number;
  /** Snapshot captured at consolidation timeout; null otherwise */
  preservedSnapshot: SoWPreservedSnapshot | null;
  // ── Wave 15.1 Sufficiency Gate ───────────────────────────────────
  /** Whether the SufficiencyConfirmationModal should be open */
  sufficiencyModalOpen: boolean;
  /** The SufficiencyResult that triggered the modal (null when closed) */
  pendingSufficiencyResult: SufficiencyResult | null;
  /** Called when the solicitor cancels the sufficiency modal */
  onSufficiencyCancel: () => void;
  /** Called when the solicitor confirms (passes rationale for shortfall) */
  onSufficiencyConfirm: (rationale: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useSoWSubmit(config: SoWSubmitConfig): SoWSubmitReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data: credits } = useCredits();

  // ── Submission state ────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [docProcessingStatus, setDocProcessingStatus] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [savedReportId, setSavedReportId] = useState<string | undefined>(undefined);
  const [filteredFindingsCount, setFilteredFindingsCount] = useState(0);
  const [sectionValidation, setSectionValidation] = useState<SectionValidationResult | null>(null);
  const [extractionStats, setExtractionStats] = useState<DocExtractionStat[]>([]);
  const [docItems, setDocItems] = useState<DocProcessingItem[]>([]);
  const [previousResult, setPreviousResult] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Run-phase state machine. Mirrors the existing setDocProcessingStatus
  // call sites so the SoWRunStatusPanel stays in sync without duplicating logic.
  const [runPhase, setRunPhase] = useState<SoWRunPhase>("idle");
  const [runPhaseDetail, setRunPhaseDetail] = useState<SoWRunPhaseDetail>({});
  const [chunkRetryRound, setChunkRetryRound] = useState(0);
  // Reactive mirrors of refs so React re-renders when the values change.
  const [currentRunIdValue, setCurrentRunIdValue] = useState<string | null>(null);
  const [consolidationAttemptsThisRun, setConsolidationAttemptsThisRun] = useState(0);
  // Frozen snapshot of work preserved when consolidation times out.
  // Populated only inside the catch block; cleared on submit/retry/cancel.
  const [preservedSnapshot, setPreservedSnapshot] = useState<SoWPreservedSnapshot | null>(null);

  // ── Wave 15.1 Sufficiency Gate ──────────────────────────────────
  const [sufficiencyModalOpen, setSufficiencyModalOpen] = useState(false);
  const [pendingSufficiencyResult, setPendingSufficiencyResult] = useState<SufficiencyResult | null>(null);
  // Resolved when the solicitor confirms the gate; rejected when they cancel.
  const sufficiencyGateResolveRef = useRef<((ack: SufficiencyAcknowledgement | null) => void) | null>(null);
  // Stores the gate result + acknowledgement for forwarding to resolve-sow-context.
  const sufficiencyContextRef = useRef<{
    result: SufficiencyResult;
    acknowledgement: SufficiencyAcknowledgement | null;
  } | null>(null);

  // H1: Chunk failure state
  const [chunkFailureState, setChunkFailureState] = useState<{
    failed: boolean;
    message: string;
    retryFn: () => void;
  } | null>(null);

  // Credit confirmation
  const [creditConfirmOpen, setCreditConfirmOpen] = useState(false);
  const [pendingCreditBreakdown, setPendingCreditBreakdown] = useState<SoWCreditBreakdown | null>(null);

  // Refs
  const abortRef = useRef<AbortController | null>(null);
  const analysisStartTime = useRef<number>(0);
  const firstDeltaReceived = useRef(false);
  const docSummaryCache = useRef<Map<string, string>>(new Map()); // keyed by fileHash||name
  const pendingChunkResults = useRef<string | null>(null);
  const pendingConsolidationMeta = useRef<{ docCount: number; chunkCount: number; hasOpenBanking?: boolean; docInventory?: string[]; formData?: string; systemPrompt?: string; selectedCaseId?: string | null; tenure?: string; lender?: string } | null>(null);
  const pendingSubmitEvent = useRef<React.FormEvent | null>(null);
  // Per-run idempotency key. Minted at handleSubmit start, reused by retry,
  // cleared on cancel / fatal error / fully-successful retry so the next
  // user-initiated submit starts a fresh run. Drives upsert dedupe in saveReport.
  const currentRunId = useRef<string | null>(null);
  const consolidationAttempts = useRef<number>(0);
  // Captured during a run so saveReport() can render the deterministic
  // Section 5C (Personal Profile) table from the same enrichment data the
  // model saw. Cleared after the run completes (success or failure).
  const enrichmentContextRef = useRef<{
    persons: Array<PersonInputForProfile & { id: string; role?: string }>;
    profileResult: { profiles?: ProfileResultPerson[] } | null;
    chResult: { results?: CompaniesHouseResultPerson[] } | null;
    ofsiResult: { results?: OfsiResultParty[]; overall_status?: string } | null;
    fcaResult: { results?: FcaResultFirm[] } | null;
    fatfData: FatfData | null;
  } | null>(null);

  // ── Save report ─────────────────────────────────────────────────
  // Returns the saved ai_reports.id (or undefined on failure) so callers can
  // chain follow-up work that needs the id (e.g. section validator persistence).
  const saveReport = useCallback(async (fullText: string): Promise<string | undefined> => {
    const { selectedCaseId } = config;
    if (!selectedCaseId) return undefined;

    const { cleanText, entries: evidenceEntries } = extractEvidenceMap(fullText);
    const { assessment, profileIntelligence, internalReport, draftEmail } = parseSections(cleanText);
    const clientReportWithProfile = profileIntelligence
      ? `${assessment}\n\n${PROFILE_MARKER}\n\n${profileIntelligence}`
      : assessment;

    // ── Deterministic Personal Profile (Section 5C) overwrite ──────
    // Replace any model-authored Section 5C with the canonical 8-row table
    // built directly from collected enrichment data. Single source of truth
    // for layout; "Not checked" is an explicit, audit-visible status.
    //
    // CRITICAL: Section 5C must render for every named person on EVERY run,
    // even when enrichment partially failed and the captured ctx is missing
    // or incomplete. We therefore derive a fallback persons list from the
    // form state and pass null enrichment results to the builder — every
    // category will then resolve to "Not checked" rather than disappearing.
    let clientReportFinal = clientReportWithProfile;
    try {
      const ctx = enrichmentContextRef.current;
      const ID_DOC_PATTERN = /passport|driving[_\s-]*licen|photo[_\s-]*id|national[_\s-]*id|biometric|liveness|id[_\s-]*check|id[_\s-]*verif|thirdfort|infotrak/i;

      // Always derive a fallback persons list from the form state so we can
      // render Section 5C even when enrichment context capture failed.
      const fs = config.formState;
      const formPersons = [
        ...(fs?.purchasers || []),
        ...(fs?.hasGiftors ? (fs.giftors || []) : []),
      ]
        .filter((p) => p && p.fullName && p.fullName.trim())
        .map((p) => {
          const employerVal = p.employmentStatus === "Other" ? p.employmentStatusOther : p.employmentStatus;
          const isGenericStatus = !employerVal || /^(employed|self[- ]?employed|retired|unemployed|student|other|unknown)$/i.test((employerVal || "").trim());
          const hasIdDocument = (p.files || []).some((f: { name: string }) => ID_DOC_PATTERN.test(f.name));
          return {
            id: p.fullName,
            fullName: p.fullName,
            occupation: p.employmentStatus === "Other" ? p.employmentStatusOther : p.employmentStatus,
            employer: isGenericStatus ? undefined : employerVal,
            jurisdictions: [] as string[],
            hasIdDocument,
          };
        });

      // Prefer captured persons (carry richer per-person metadata used by
      // enrichment). Fall back to form-derived persons when the run did not
      // capture them (e.g. enrichment block threw before the capture step).
      const persons = (ctx && ctx.persons.length > 0) ? ctx.persons : formPersons;

      if (persons.length > 0) {
        const deterministic = buildPersonalProfileSection({
          persons,
          profileResult: ctx?.profileResult ?? null,
          chResult: ctx?.chResult ?? null,
          ofsiResult: ctx?.ofsiResult ?? null,
          fcaResult: ctx?.fcaResult ?? null,
          fatfData: ctx?.fatfData ?? null,
        });
        if (deterministic) {
          clientReportFinal = upsertPersonalProfileSection(clientReportWithProfile, deterministic);
          const source = ctx && ctx.persons.length > 0 ? "captured-ctx" : "form-fallback";
          const enrichmentPresent = !!(ctx && (ctx.profileResult || ctx.chResult || ctx.ofsiResult || ctx.fcaResult || ctx.fatfData));
          console.log(`[SoW] Personal Profile (5C) deterministic table inserted | persons=${persons.length} | source=${source} | enrichment=${enrichmentPresent ? "partial-or-full" : "none-all-not-checked"} | bytes=${deterministic.length}`);
        }
      } else {
        console.warn("[SoW] Section 5C skipped — no named persons found on form or captured ctx");
      }
    } catch (profileErr) {
      // Never block save on rendering failure — keep the model-authored version.
      console.warn("[SoW] Deterministic Personal Profile build failed; falling back to model output:", profileErr);
    }

    const hasVisibleOutsideUK = /outside-uk\s*\/\s*jurisdiction enquiry|overseas jurisdiction.*source of funds|cayman|outside the uk/i.test(draftEmail || "");
    const hasVisibleTransferTrail = /transfer-trail enquiry|transfer trail.*deposit|moved into the account.*purchase|transferred into the account.*purchase|onward transfer|transfer chain showing each step|traced from the original source through to the purchase funds|which account or savings.*holds the purchase funds|how.*proceeds.*moved.*into.*account/i.test(draftEmail || "");
    const hasVisibleSharedParty = /shared-party\s*\/\s*cross-party funding enquiry|cross-party funding enquiry|confirmation of source of funds\s*—|confirm.*contribution.*derives.*from|confirm.*funds.*from.*evidenced|funding plan between|how.*funds.*entered.*purchase.*structure/i.test(draftEmail || "");
    // Body-trace hash: simple DJB2
    const bodyHash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); };
    console.log(`[RULE-FIRE-PROOF][save] caseId=${selectedCaseId} stage=persisted_draft_email | fullText_chars=${fullText.length} draft_chars=${(draftEmail || "").length} draft_hash=${bodyHash(draftEmail || "")} | outsideUK_present=${hasVisibleOutsideUK} transferTrail_present=${hasVisibleTransferTrail} sharedParty_present=${hasVisibleSharedParty}`);

    try {
      // Defensive fallback: if no run id is set (e.g. saveReport called outside
      // the normal handleSubmit/retry flow), mint one and warn so we don't
      // silently insert a duplicate row.
      if (!currentRunId.current) {
        currentRunId.current = `sow-${Date.now()}`;
        setCurrentRunIdValue(currentRunId.current);
        console.warn("[SoW] saveReport called with no currentRunId — minted ad-hoc id", currentRunId.current);
      }
      consolidationAttempts.current += 1;
      setConsolidationAttemptsThisRun(consolidationAttempts.current);

      // ── Deterministic draft-email coverage gate (judge rule #22) ──
      // Compares HIGH-risk material issues in the internal report against
      // enquiries actually present in the draft email. When coverage is
      // insufficient, finalisation_status is flipped to "coverage_gap" so
      // the UI can surface the gap and the conveyancer is not handed a
      // silently under-covering email. We DO NOT rewrite draft_email here.
      const finalInternalReport = internalReport || assessment;
      const finalDraftEmail = draftEmail || "";
      let coverageReportPayload: Record<string, unknown> | null = null;
      let finalisationStatusOverride: string | null = null;
      try {
        const coverage = evaluateDraftEmailCoverage({
          internalReport: finalInternalReport,
          draftEmail: finalDraftEmail,
        });
        coverageReportPayload = {
          total: coverage.total,
          covered: coverage.covered,
          uncovered: coverage.uncovered,
          coverageRatio: coverage.coverageRatio,
          highUncovered: coverage.highUncovered,
          gateTripped: coverage.gateTripped,
          reason: coverage.reason,
          uncoveredEntries: coverage.uncoveredEntries.map((e) => ({
            id: e.issue.id,
            label: e.issue.label,
            severity: e.issue.severity,
            source: e.issue.source,
            evidenceLine: e.issue.evidenceLine,
            matchedTokens: e.matchedTokens,
          })),
          coveredEntries: coverage.coveredEntries.map((e) => ({
            id: e.issue.id,
            label: e.issue.label,
            severity: e.issue.severity,
            source: e.issue.source,
            matchedTokens: e.matchedTokens,
          })),
          generatedAt: coverage.generatedAt,
        };
        if (coverage.gateTripped) {
          finalisationStatusOverride = "coverage_gap";
        }
        console.log(
          `[CoverageGate] caseId=${selectedCaseId} total=${coverage.total} covered=${coverage.covered} highUncovered=${coverage.highUncovered} gateTripped=${coverage.gateTripped} reason=${coverage.reason ?? "n/a"}`,
        );
      } catch (gateErr) {
        // Never let the gate block persistence — it is purely advisory.
        console.warn("[CoverageGate] evaluation failed; persisting without coverage report", gateErr);
      }

      const baseUpsert = {
        case_id: selectedCaseId,
        ai_run_id: currentRunId.current,
        internal_report: finalInternalReport,
        draft_email: draftEmail || null,
        client_report: clientReportFinal,
        confidence_level: "medium",
        consolidation_attempts: consolidationAttempts.current,
        coverage_report: coverageReportPayload as never,
      };
      const upsertPayload = finalisationStatusOverride
        ? { ...baseUpsert, finalisation_status: finalisationStatusOverride }
        : baseUpsert;

      const { data, error } = await supabase
        .from("ai_reports")
        .upsert(upsertPayload, { onConflict: "ai_run_id" })
        .select("id")
        .single();
      if (error) throw error;
      setSavedReportId(data.id);
      queryClient.invalidateQueries({ queryKey: ["ai_report", selectedCaseId] });

      if (finalisationStatusOverride === "coverage_gap" && coverageReportPayload) {
        const highCount = (coverageReportPayload.highUncovered as number) ?? 0;
        toast({
          title: "Report saved with coverage gap",
          description: `${highCount} HIGH-risk finding${highCount === 1 ? "" : "s"} from the report ${highCount === 1 ? "is" : "are"} not addressed in the draft email. Review the Coverage panel before sending.`,
        });
      } else {
        toast({ title: "Report saved", description: "SoW assessment saved to case file." });
      }

      if (evidenceEntries.length > 0 && data.id) {
        listFolderFiles(selectedCaseId, "aml-sow").then((files) => {
          const filesList = files.map((f: any) => ({
            name: f.name || f.fileName || "",
            path: f.path || f.filePath || `${selectedCaseId}/aml-sow/${f.name || f.fileName || ""}`,
          }));
          persistEvidenceMap(data.id, selectedCaseId, evidenceEntries, filesList);
          queryClient.invalidateQueries({ queryKey: ["evidence_references", data.id] });
        }).catch(() => {
          persistEvidenceMap(data.id, selectedCaseId, evidenceEntries, []);
          queryClient.invalidateQueries({ queryKey: ["evidence_references", data.id] });
        });
      }
      return data.id as string;
    } catch (e: any) {
      console.error("Failed to save SoW report:", e);
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
      return undefined;
    }
  }, [config.selectedCaseId, queryClient, toast]);

  // ── Core submit ─────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const {
      agentId, streamChat, selectedCaseId, attachedFiles, formState,
      prefillData, savedFileNames, logAuditEvent, openTransactionDialog,
    } = config;
    const {
      propertyAddress, purchasePrice, caseReference, tenure, stampDuty,
      legalFees, mortgageAmount, clientFundsToVerify, transactionType,
      propertyType, lender, additionalContext, riskClassification,
      purchasers, hasGiftors, giftors,
    } = formState;

    // ── Validation ──────────────────────────────────────────────
    if (!selectedCaseId) {
      toast({ title: "Case required", description: "Please link a case before running the SoW assessment.", variant: "destructive" });
      return;
    }
    if (!propertyAddress.trim()) { toast({ title: "Required", description: "Please enter the property address.", variant: "destructive" }); return; }
    if (!purchasePrice.trim()) { toast({ title: "Required", description: "Please enter the purchase price.", variant: "destructive" }); return; }
    // ── Auto-resolve missing funding/employment from documents or raise enquiry ──
    const autoEnquiryNames: string[] = [];
    for (const p of purchasers) {
      if (!p.fullName.trim()) { toast({ title: "Required", description: "All purchasers must have a name.", variant: "destructive" }); return; }
      if (!p.fundingSource && !p.raiseEnquiryFunding) {
        // Auto-raise enquiry for missing funding source
        p.raiseEnquiryFunding = true;
        autoEnquiryNames.push(`${p.fullName} (funding source)`);
      }
      if (!p.employmentStatus && !p.raiseEnquiryEmployment) {
        p.raiseEnquiryEmployment = true;
        autoEnquiryNames.push(`${p.fullName} (employment)`);
      }
    }
    if (hasGiftors) {
      for (const g of giftors) {
        if (!g.fullName.trim()) { toast({ title: "Required", description: "All giftors must have a name.", variant: "destructive" }); return; }
        if (!g.fundingSource && !g.raiseEnquiryFunding) {
          g.raiseEnquiryFunding = true;
          autoEnquiryNames.push(`${g.fullName} (funding source)`);
        }
        if (!g.employmentStatus && !g.raiseEnquiryEmployment) {
          g.raiseEnquiryEmployment = true;
          autoEnquiryNames.push(`${g.fullName} (employment)`);
        }
        if (!g.relationshipToPurchaser) { toast({ title: "Required", description: `Please select the relationship for giftor ${g.fullName}.`, variant: "destructive" }); return; }
      }
    }
    if (autoEnquiryNames.length > 0) {
      toast({
        title: "Auto-raised enquiries",
        description: `Could not determine from documents: ${autoEnquiryNames.join(", ")}. These will be raised as enquiries in the report.`,
      });
    }
    const openBankingFilePattern = /armalytix|open\s*banking|source[\s_-]*of[\s_-]*(funds|wealth)|wealth[\s_-]*report|affordability|truelayer|plaid|thirdfort|infotrak/i;
    const hasOpenBankingAttachment = [...attachedFiles, ...purchasers.flatMap((p) => p.files), ...(hasGiftors ? giftors.flatMap((g) => g.files) : [])]
      .some((file) => openBankingFilePattern.test(file.name));

    let hasStoredOpenBankingAttachment = false;
    if (!hasOpenBankingAttachment && selectedCaseId) {
      const storedFileGroups = await Promise.all([
        listFolderFiles(selectedCaseId, "aml-sow"),
        listFolderFiles(selectedCaseId, "miscellaneous"),
        listFolderFiles(selectedCaseId, "correspondence"),
        listFolderFiles(selectedCaseId, "reports"),
      ]);
      hasStoredOpenBankingAttachment = storedFileGroups
        .flat()
        .some((file) => openBankingFilePattern.test(file.name));
    }

    if (!mortgageAmount.trim() && !clientFundsToVerify.trim() && !hasOpenBankingAttachment && !hasStoredOpenBankingAttachment) {
      toast({ title: "Client funds to verify required", description: "The mortgage amount is not yet known. Please enter the total client funds to verify.", variant: "destructive" });
      openTransactionDialog();
      return;
    }

    // ── Update party enquiry flags ──────────────────────────────
    const partiesToUpdate = [...(prefillData.purchasers || []), ...(prefillData.giftors || [])];
    const allFormPersons = [...purchasers, ...(hasGiftors ? giftors : [])];
    for (const party of partiesToUpdate) {
      const match = allFormPersons.find((p) => p.fullName.trim().toLowerCase() === party.full_name?.trim().toLowerCase());
      if (match && (match.raiseEnquiryFunding !== (party.raise_enquiry_funding ?? false) || match.raiseEnquiryEmployment !== (party.raise_enquiry_employment ?? false))) {
        supabase.from("case_parties").update({
          raise_enquiry_funding: match.raiseEnquiryFunding,
          raise_enquiry_employment: match.raiseEnquiryEmployment,
        } as any).eq("id", party.id).then(({ error }) => {
          if (error) console.warn("Failed to persist enquiry flags for", party.full_name, error);
        });
      }
    }

    // ── Collect files ───────────────────────────────────────────
    const allPersons = [...purchasers, ...(hasGiftors ? giftors : [])];
    const allPersonFiles = allPersons.flatMap((p) => p.files);
    let allFiles: AttachedFile[] = [...attachedFiles, ...allPersonFiles];

    const fileOwnerMap = new Map<string, string>();
    for (const p of allPersons) {
      for (const f of p.files) {
        fileOwnerMap.set(f.name, p.fullName);
      }
    }

    // ── Wave 15.1 Pre-AI Sufficiency Gate ──────────────────────
    // Runs BEFORE credit check and AI call so the result can be injected
    // into resolve-sow-context as established fact for the AI.
    // Non-blocking on network failure — gate errors never abort submission.
    // Skip on credit-confirm re-entry (pendingSubmitEvent is set) — gate
    // already ran on the initial invocation and result is stored in ref.
    if (!pendingSubmitEvent.current) {
      sufficiencyContextRef.current = null; // Reset only on fresh submit

      const parsePence = (raw: string | undefined): number => {
        if (!raw) return 0;
        const cleaned = raw.replace(/[£,\s]/g, "");
        const pounds = parseFloat(cleaned);
        if (!isFinite(pounds) || pounds < 0) return 0;
        return Math.round(pounds * 100);
      };

      const suffInput = {
        purchase_price: parsePence(purchasePrice),
        stamp_duty: parsePence(stampDuty),
        legal_fees: parsePence(legalFees),
        mortgage_amount: parsePence(mortgageAmount),
        purchaser_contributions: purchasers.map((p) => parsePence(p.contributionAmount)),
        giftor_amounts: hasGiftors ? giftors.map((g) => parsePence(g.contributionAmount)) : [],
      };

      try {
        const { data: checkData, error: checkError } = await supabase.functions.invoke(
          "pre-sow-checks",
          { body: { case_id: selectedCaseId ?? undefined, sufficiency_input: suffInput } }
        );

        if (checkError) {
          console.warn("[SoW] pre-sow-checks failed (non-blocking):", checkError);
        } else if (checkData?.data) {
          const suffResult: SufficiencyResult = checkData.data;

          if (suffResult.status !== "sufficient") {
            // Open the confirmation modal and wait for the solicitor's decision.
            // Promise resolves with acknowledgement or null (cancel).
            const ack: SufficiencyAcknowledgement | null = await new Promise((resolve) => {
              sufficiencyGateResolveRef.current = resolve;
              setPendingSufficiencyResult(suffResult);
              setSufficiencyModalOpen(true);
            });

            if (ack === null) {
              // Solicitor cancelled — write observability event (fire-and-forget) and abort
              supabase.functions.invoke("pre-sow-checks", {
                body: {
                  case_id: selectedCaseId ?? undefined,
                  sufficiency_input: suffInput,
                  _event_override: "sow.sufficiency.cancelled",
                },
              }).catch(() => {});
              toast({
                title: "Assessment cancelled",
                description: "Submission was cancelled at the funding sufficiency check.",
              });
              return;
            }

            // Solicitor confirmed — write warning-severity audit event (fire-and-forget)
            const eventType = suffResult.status === "shortfall"
              ? "sow.sufficiency.shortfall_acknowledged"
              : "sow.sufficiency.overstatement_acknowledged";

            supabase.functions.invoke("pre-sow-checks", {
              body: {
                case_id: selectedCaseId ?? undefined,
                sufficiency_input: suffInput,
                _event_override: eventType,
                _event_severity: "warning",
                _event_metadata: {
                  rationale: ack.rationale || null,
                  acknowledgedAt: ack.acknowledgedAt,
                },
              },
            }).catch(() => {});

            // Store for forwarding to resolve-sow-context
            sufficiencyContextRef.current = { result: suffResult, acknowledgement: ack };
          } else {
            // Sufficient — store for context injection (single-line note to AI)
            sufficiencyContextRef.current = { result: suffResult, acknowledgement: null };
          }
        }
      } catch (gateErr) {
        // Gate errors must never block submission
        console.warn("[SoW] Sufficiency gate exception (non-blocking):", gateErr);
      }
    } // end if (!pendingSubmitEvent.current)

    // ── Credit check ────────────────────────────────────────────
    const supportingDocCount = attachedFiles.length + allPersons.reduce((sum, p) => sum + p.files.length, 0);
    const breakdown = estimateSoWCredits({
      purchaserCount: purchasers.length,
      giftorCount: hasGiftors ? giftors.length : 0,
      supportingDocCount,
    });

    if (credits != null) {
      if (credits.balance < breakdown.total) {
        toast({ title: "Insufficient Credits", description: `This assessment requires ${breakdown.total} credits but you have ${credits.balance}.`, variant: "destructive" });
        return;
      }
      if (!pendingSubmitEvent.current) {
        setPendingCreditBreakdown(breakdown);
        pendingSubmitEvent.current = e || { preventDefault: () => {} } as React.FormEvent;
        setCreditConfirmOpen(true);
        return;
      }
    }

    // Save previous result for comparison
    if (result && result.length > 200) {
      setPreviousResult(result);
      setShowComparison(true);
    }

    pendingSubmitEvent.current = null;
    const abortController = new AbortController();
    abortRef.current = abortController;
    analysisStartTime.current = Date.now();
    setElapsedSeconds(0);
    // Mint a fresh idempotency key for this run. Reused by saveReport and
    // handleRetryConsolidation so retry overwrites the row in place.
    currentRunId.current = `sow-${Date.now()}`;
    consolidationAttempts.current = 0;
    setCurrentRunIdValue(currentRunId.current);
    setConsolidationAttemptsThisRun(0);
    setChunkRetryRound(0);
    setPreservedSnapshot(null);
    setRunPhase("preparing");
    setRunPhaseDetail({});
    setIsSubmitting(true);
    setDocItems([]);
    firstDeltaReceived.current = false;
    setFilteredFindingsCount(0);

    // ── Build prompt ────────────────────────────────────────────
    const personSections = allPersons.map((p, i) => {
      const pepLabel = p.pepStatus && p.pepStatus !== "Unknown" ? p.pepStatus : "";
      const buyerLabel = p.role === "Purchaser" && p.buyerType && p.buyerType !== "Standard" ? p.buyerType : "";
      const categorisedFiles = p.files.filter(f => (f as any).docCategory);
      const uncategorisedFiles = p.files.filter(f => !(f as any).docCategory);
      const categoryLabels: Record<string, string> = {
        identity: "Identity Documents", proof_of_address: "Proof of Address",
        bank_statements: "Bank Statements", open_banking: "Open Banking Reports",
        client_questionnaire: "Client Questionnaire",
      };
      const categorisedSection = categorisedFiles.length > 0
        ? Object.entries(
            categorisedFiles.reduce((acc, f) => {
              const cat = (f as any).docCategory || "other";
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(f.name);
              return acc;
            }, {} as Record<string, string[]>)
          ).map(([cat, names]) => `- ${categoryLabels[cat] || cat}: ${names.join(", ")}`).join("\n")
        : "";

      return [
        `### ${p.role} ${i + 1}: ${p.fullName || "Unnamed"}`,
        p.fundingSource ? `- Funding: ${p.fundingSource === "Other" && p.fundingSourceOther ? p.fundingSourceOther : p.fundingSource}` : (p.raiseEnquiryFunding ? "- Funding: ⚠️ RAISE ENQUIRY (unknown source)" : ""),
        p.contributionAmount ? `- Contribution: £${p.contributionAmount}` : "",
        p.employmentStatus ? `- Employment: ${p.employmentStatus === "Other" && p.employmentStatusOther ? p.employmentStatusOther : p.employmentStatus}` : (p.raiseEnquiryEmployment ? "- Employment: ⚠️ RAISE ENQUIRY (unknown status)" : ""),
        p.role === "Giftor" ? `- Relationship to Purchaser: ${p.relationshipToPurchaser === "Other" && p.relationshipOther ? p.relationshipOther : p.relationshipToPurchaser}` : "",
        pepLabel ? `- PEP Status: ${pepLabel}` : "",
        buyerLabel ? `- Buyer Type: ${buyerLabel}` : "",
        p.additionalNotes ? `- Notes: ${p.additionalNotes}` : "",
        categorisedSection ? `\n**Categorised Documents:**\n${categorisedSection}` : "",
        uncategorisedFiles.length > 0 ? `- Other supporting documents: ${uncategorisedFiles.map((f) => f.name).join(", ")}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    const riskLabel = riskClassification && riskClassification !== "not_assessed"
      ? { low: "Low", medium: "Medium", high: "High", very_high: "Very High" }[riskClassification] || ""
      : "";

    const prompt = [
      "## Source of Wealth Assessment Request",
      `**Property Address:** ${propertyAddress}`,
      `**Purchase Price:** £${purchasePrice}`,
      tenure ? `**Tenure:** ${tenure}` : "",
      transactionType ? `**Transaction Type:** ${transactionType}` : "",
      propertyType ? `**Property Type:** ${propertyType}` : "",
      lender ? `**Lender:** ${lender}` : "",
      caseReference ? `**Case Reference:** ${caseReference}` : "",
      stampDuty ? `**Stamp Duty:** £${stampDuty}` : "",
      legalFees ? `**Legal Fees:** £${legalFees}` : "",
      mortgageAmount ? `**Mortgage Amount:** £${mortgageAmount}` : "",
      !mortgageAmount && clientFundsToVerify ? `**Client Funds to Verify:** £${clientFundsToVerify} (mortgage amount not yet known — report should focus on verifying this amount)` : "",
      riskLabel ? `**Conveyancer Risk Classification:** ${riskLabel} Risk` : "",
      "",
      "## Persons Involved",
      personSections,
      additionalContext ? `\n## Additional Context\n${additionalContext}` : "",
    ].filter(Boolean).join("\n");

    // PHASE 3 Sub-batch B fix for B.3 consistency check.
    // Snapshot the SDLT figure that the client actually stitched into the
    // prompt at this exact dispatch (mirrors line 644 above). The edge
    // function compares this against the value resolved from cases.* at
    // post-process time. If they disagree, an sdlt_resolution_inconsistency
    // observability event fires — catching the exact "local-state-stitched-
    // into-prompt-but-not-persisted" class of bug. null means "no figure in
    // prompt body" (which must equal NULL in cases.* for the assertion to
    // pass).
    const clientPromptSdltNum: number | null = (() => {
      const trimmed = (stampDuty || "").trim();
      if (!trimmed) return null;
      const n = Number(trimmed.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    })();

    try {
      // ── Save unsaved files ──────────────────────────────────
      const unsavedFiles = allFiles.filter(f => !savedFileNames.current.has(f.name));
      if (selectedCaseId && unsavedFiles.length > 0) {
        setRunPhase("preparing");
        setDocProcessingStatus("Saving documents to case files…");
        try {
          const { copied, failed, succeededNames } = await uploadFilesToCaseFolder(
            unsavedFiles.map(f => ({ name: f.name, base64: f.base64, mimeType: f.mimeType })),
            selectedCaseId, "aml-sow",
          );
          if (failed > 0) console.warn(`[SoW] ${failed} file(s) failed to save`);
          // Only mark individually succeeded files
          for (const name of succeededNames) {
            savedFileNames.current.add(name);
          }
        } catch (err) {
          console.warn("[SoW] Case folder save error:", err);
        }
      }

      // ── Hydrate stored files ────────────────────────────────
      const inMemoryNames = new Set(allFiles.map(f => f.name.toLowerCase()));
      if (selectedCaseId) {
        setRunPhase("preparing");
        setDocProcessingStatus("Loading stored documents…");
        try {
          const storedDownloads = await downloadFolderFiles(selectedCaseId, "aml-sow", inMemoryNames);
          if (storedDownloads.length > 0) {
            for (const sf of storedDownloads) {
              allFiles.push({ name: sf.name, base64: sf.base64, mimeType: sf.mimeType } as any);
            }
          }

          const updatedInMemoryNames = new Set(allFiles.map(f => f.name.toLowerCase()));
          const sowEvidenceNamePattern = /passport|driving.?licen|liveness|identity.?check|id.?check|id.?verif|national.?id|proof.?of.?id|photo.?id|biometric|bank.?statement|statement[_\s-]?\d|open.?banking|source.?of.?(funds|wealth)|wealth.?report|affordability|tax\s*return|tax\s*computation|\bsa302\b|\bsa100\b|hmrc|payslip|p60|p45|gift\s*(letter|declaration|deed)|proof.?of.?address|utility.?bill|council.?tax|dividend|royalt|armalytix|truelayer|plaid|thirdfort|infotrak|purchase.?instruction/i;

          const [miscDownloads, corrDownloads, reportDownloads] = await Promise.all([
            downloadFolderFiles(selectedCaseId, "miscellaneous", updatedInMemoryNames, sowEvidenceNamePattern),
            downloadFolderFiles(selectedCaseId, "correspondence", updatedInMemoryNames, sowEvidenceNamePattern),
            downloadFolderFiles(selectedCaseId, "reports", updatedInMemoryNames, sowEvidenceNamePattern),
          ]);
          for (const sf of [...miscDownloads, ...corrDownloads, ...reportDownloads]) {
            allFiles.push({ name: sf.name, base64: sf.base64, mimeType: sf.mimeType } as any);
          }
        } catch (err) {
          console.warn("[SoW] Failed to hydrate stored files:", err);
        }
      }

      // ── Pre-process documents + profile intelligence ────────
      // Initialize per-document tracking
      const initialDocItems: DocProcessingItem[] = allFiles.map(f => ({
        name: f.name,
        state: "queued" as DocProcessingState,
      }));
      setDocItems(initialDocItems);

      if (allFiles.length > 0) {
        setRunPhase("extracting");
        setRunPhaseDetail({ current: 0, total: allFiles.length });
        setDocProcessingStatus("Pre-processing documents…");
        setOverallProgress(8);
      } else {
        setRunPhase("preparing");
        setDocProcessingStatus("Preparing analysis…");
        setOverallProgress(5);
      }

      // Cached pre-processing
      const cachedSummaries: string[] = [];
      const uncachedFiles: AttachedFile[] = [];
      const highFidelityDocPattern = /passport|driving[_\s-]*licen[cs]e|photo[_\s-]*id|identity|id[_\s-]*check|id[_\s-]*verif|liveness|biometric|selfie|proof[_\s-]*of[_\s-]*address|utility[_\s-]*bill|council[_\s-]*tax|address[_\s-]*verification|bank[_\s-]*statement|open[_\s-]*banking|armalytix|truelayer|plaid|thirdfort|infotrak|source[_\s-]*of[_\s-]*funds|source[_\s-]*of[_\s-]*wealth|wealth[_\s-]*report/i;

      for (const f of allFiles) {
        const cacheKey = (f as any).fileHash || f.name; // Use content hash when available
        const shouldBypassCache = highFidelityDocPattern.test(f.name);
        const cached = shouldBypassCache ? null : docSummaryCache.current.get(cacheKey);
        const hasUsableCachedSummary = cached && !isExtractionFailureSummary(cached);
        if (hasUsableCachedSummary) {
          cachedSummaries.push(cached);
          // Mark cached docs as done immediately
          setDocItems(prev => prev.map(d => d.name === f.name ? { ...d, state: "done" as DocProcessingState, finishedAt: Date.now() } : d));
        } else {
          if (cached && !hasUsableCachedSummary) {
            docSummaryCache.current.delete(cacheKey);
          }
          uncachedFiles.push(f);
        }
      }
      if (cachedSummaries.length > 0) {
        console.log(`[SoW] Re-using ${cachedSummaries.length} cached doc summaries, ${uncachedFiles.length} new`);
      }

      // Extract Armalytix full legal names from cached doc summaries (includes middle names)
      const armalytixNamePattern = /(?:full\s*(?:legal\s*)?name|account\s*holder|applicant)\s*[:：]\s*([A-Z][a-zA-Z\s\-']+)/g;
      const armalytixNames = new Map<string, string>();
      for (const summary of cachedSummaries) {
        let match;
        while ((match = armalytixNamePattern.exec(summary)) !== null) {
          const extractedName = match[1].trim();
          if (extractedName.split(/\s+/).length >= 2) {
            for (const p of allPersons) {
              const pParts = p.fullName.toLowerCase().split(/\s+/);
              const eParts = extractedName.toLowerCase().split(/\s+/);
              if (pParts[0] === eParts[0] && pParts[pParts.length - 1] === eParts[eParts.length - 1]) {
                armalytixNames.set(p.fullName, extractedName);
              }
            }
          }
        }
      }

      const profilePersons = allPersons
        .filter(p => p.fullName.trim())
        .map(p => ({
          fullName: p.fullName,
          armalytixName: armalytixNames.get(p.fullName),
          occupation: p.employmentStatus === "Other" ? p.employmentStatusOther : p.employmentStatus,
          employer: undefined,
          location: propertyAddress,
        }));

      const handleDocStatus = (name: string, state: DocProcessingState) => {
        setDocItems(prev => prev.map(d =>
          d.name === name
            ? { ...d, state, ...(state === "extracting" ? { startedAt: Date.now() } : {}), ...(state === "done" || state === "error" ? { finishedAt: Date.now() } : {}) }
            : d
        ));
      };

      const chPersons = allPersons
        .filter(p => p.fullName.trim())
        .map(p => ({ fullName: p.fullName, companyName: undefined as string | undefined, companyNumber: undefined as string | undefined }));

      // Build OFSI screening parties
      const ofsiParties = allPersons
        .filter(p => p.fullName.trim())
        .map(p => ({ full_name: p.fullName, role: p.role }));

      // Build FCA firms list — extract employer/firm names from person data where available
      const fcaFirms: Array<{ name: string; frn?: string }> = [];
      const seenFirms = new Set<string>();
      for (const p of allPersons) {
        const employer = p.employmentStatus === "Other" ? p.employmentStatusOther : p.employmentStatus;
        // Only check firms that look like actual company names (not statuses like "Employed")
        if (employer && employer.length > 3 && !/^(employed|self[- ]?employed|retired|unemployed|student|other|unknown)$/i.test(employer)) {
          const key = employer.toLowerCase().trim();
          if (!seenFirms.has(key)) {
            seenFirms.add(key);
            fcaFirms.push({ name: employer });
          }
        }
      }
      // Also check the lender if specified
      if (lender && lender.trim().length > 2) {
        const lenderKey = lender.toLowerCase().trim();
        if (!seenFirms.has(lenderKey)) {
          fcaFirms.push({ name: lender });
        }
      }

      const preProcessStart = Date.now();
      let extractionProgressInterval: ReturnType<typeof setInterval> | null = null;
      if (uncachedFiles.length > 0) {
        extractionProgressInterval = setInterval(() => {
          const elapsedMs = Date.now() - preProcessStart;
          const elapsedMinutes = elapsedMs / 60000;
          const progressFloor = Math.min(42, 8 + Math.round(elapsedMinutes * 6));
          setOverallProgress((current) => Math.max(current < 50 ? current : 0, progressFloor));
        }, 1000);
      }

      const [freshSummaries, profileResult, chResult, ofsiResult, fcaResult] = await Promise.all([
        uncachedFiles.length > 0
          ? preProcessDocuments(uncachedFiles, (done, total) => {
              const completed = done + cachedSummaries.length;
              setRunPhase("extracting");
              setRunPhaseDetail({ current: completed, total: allFiles.length });
              setDocProcessingStatus(`Processing documents… ${completed}/${allFiles.length}`);
              setOverallProgress(Math.max(8, Math.round((completed / Math.max(allFiles.length, 1)) * 45)));
            }, fileOwnerMap, handleDocStatus)
              .finally(() => {
                if (extractionProgressInterval) clearInterval(extractionProgressInterval);
              })
          : Promise.resolve([]),
        profilePersons.length > 0
          ? supabase.functions.invoke("profile-intelligence", { body: { persons: profilePersons, propertyAddress } })
              .then(({ data, error }) => { if (error) { console.warn("[SoW] Profile intelligence error:", error); return null; } return data; })
              .catch(err => { console.warn("[SoW] Profile intelligence fetch error:", err); return null; })
          : Promise.resolve(null),
        chPersons.length > 0
          ? supabase.functions.invoke("companies-house-lookup", { body: { persons: chPersons } })
              .then(({ data, error }) => { if (error) { console.warn("[SoW] Companies House lookup error:", error); return null; } return data; })
              .catch(err => { console.warn("[SoW] Companies House lookup fetch error:", err); return null; })
          : Promise.resolve(null),
        // OFSI sanctions screening — runs in parallel, fail-safe
        ofsiParties.length > 0
          ? supabase.functions.invoke("ofsi-sanctions-check", { body: { parties: ofsiParties, threshold: 0.78 } })
              .then(({ data, error }) => { if (error) { console.warn("[SoW] OFSI sanctions check error:", error); return null; } return data; })
              .catch(err => { console.warn("[SoW] OFSI sanctions check fetch error:", err); return null; })
          : Promise.resolve(null),
        // FCA Register check — runs in parallel, fail-safe
        fcaFirms.length > 0
          ? supabase.functions.invoke("fca-register-check", { body: { firms: fcaFirms } })
              .then(({ data, error }) => { if (error) { console.warn("[SoW] FCA register check error:", error); return null; } return data; })
              .catch(err => { console.warn("[SoW] FCA register check fetch error:", err); return null; })
          : Promise.resolve(null),
      ]);

      // Merge summaries and update cache (keyed by content hash)
      const docSummaries = [...cachedSummaries, ...freshSummaries];
      for (let i = 0; i < uncachedFiles.length; i++) {
        if (freshSummaries[i] && !isExtractionFailureSummary(freshSummaries[i])) {
          const cacheKey = (uncachedFiles[i] as any).fileHash || uncachedFiles[i].name;
          docSummaryCache.current.set(cacheKey, freshSummaries[i]);
        }
      }

      // Extraction stats
      const stats: DocExtractionStat[] = docSummaries.map((s) => {
        const nameMatch = s.match(/\[Document:\s*([^\]\[]+?)(?:\s*\[Tagged to:.*?\])?[\]\s]/);
        const docName = nameMatch?.[1]?.trim() || "Unknown";
        const contentMatch = s.match(/--- DOCUMENT CONTENT START ---\n([\s\S]*?)\n--- DOCUMENT CONTENT END ---/);
        const charCount = contentMatch?.[1]?.length || 0;
        // Use content-based classification from API, fall back to filename
        const apiClassification = getDocClassification(docName);
        const financial = apiClassification
          ? isFinancialByClassification(apiClassification)
          : isFinancialDoc(docName);
        const cap = financial ? MAX_FINANCIAL_DOC_SUMMARY_CHARS : MAX_DOC_SUMMARY_CHARS;
        return { name: docName, charCount, isFinancial: financial, wasTruncated: charCount >= cap * 0.95, cap };
      });
      setExtractionStats(stats);
      console.log(`[SoW] Document pipeline: ${allFiles.length} files collected, ${docSummaries.length} summaries produced (${cachedSummaries.length} cached, ${freshSummaries.length} fresh). Extraction stats:`, stats.map(s => `${s.name}: ${s.charCount} chars${s.wasTruncated ? ' [TRUNCATED]' : ''}`));

      setRunPhase("preparing");
      setDocProcessingStatus("Preparing analysis…");

      // ── Multimodal critical files ───────────────────────────
      const CRITICAL_DOC_PATTERN = /armalytix|bank\s*statement|open\s*banking|thirdfort|infotrak|passport|driving\s*licen[cs]e|photo\s*id|identity|id\s*check|id\s*verif|liveness|biometric|proof\s*of\s*address|utility\s*bill|council\s*tax|mortgage\s*offer|completion\s*statement|source\s*of\s*funds|ml\s*check|payslip|pay\s*slip|p60|sa302|tax\s*return|gift\s*letter/i;
      // Only image types universally supported by AI gateways — PDFs are already text-extracted in doc summaries
      const NATIVE_MULTIMODAL_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
      const MAX_MULTIMODAL_FILES = 10;
      const MAX_MULTIMODAL_TOTAL_B64 = 20 * 1024 * 1024;

      const criticalNativeFiles: AttachedFile[] = [];
      let multimodalTotalSize = 0;
      for (const f of allFiles) {
        if (criticalNativeFiles.length >= MAX_MULTIMODAL_FILES) break;
        const ext = "." + f.name.split(".").pop()?.toLowerCase();
        if (!NATIVE_MULTIMODAL_EXTS.has(ext)) continue;
        if (!CRITICAL_DOC_PATTERN.test(f.name)) continue;
        if (multimodalTotalSize + f.base64.length > MAX_MULTIMODAL_TOTAL_B64) continue;
        criticalNativeFiles.push(f);
        multimodalTotalSize += f.base64.length;
      }

      // Per-chunk cap: Supabase edge functions have ~6MB request body limit;
      // The SoW text context (summaries, prompt, knowledge base) can be 2-3MB alone,
      // so cap multimodal files per chunk at 2MB base64 to leave headroom.
      const MAX_CHUNK_MULTIMODAL_B64 = 2 * 1024 * 1024;

      const getChunkNativeFiles = (chunk: string[]) => {
        const chunkDocNames = new Set(
          chunk
            .map((summary) => summary.match(/\[Document:\s*([^\]\[]+)/)?.[1]?.trim().toLowerCase())
            .filter((name): name is string => Boolean(name))
        );

        const matched = criticalNativeFiles.filter((file) => chunkDocNames.has(file.name.trim().toLowerCase()));

        // C2 Fix: If there's only ONE multimodal file that exceeds the per-chunk cap,
        // allow it through as a dedicated single-file chunk rather than silently dropping
        // critical verification documents (passports, ID checks, etc.)
        if (matched.length === 1 && matched[0].base64.length > MAX_CHUNK_MULTIMODAL_B64) {
          console.warn(
            `[SoW] Multimodal file "${matched[0].name}" exceeds ${MAX_CHUNK_MULTIMODAL_B64 / 1024 / 1024}MB per-chunk cap ` +
            `(${(matched[0].base64.length / 1024 / 1024).toFixed(2)}MB) — allowing as critical single-file override`
          );
          return matched;
        }

        // Standard path: enforce per-chunk size cap for multi-file chunks
        const capped: AttachedFile[] = [];
        let chunkB64Size = 0;
        for (const f of matched) {
          if (chunkB64Size + f.base64.length > MAX_CHUNK_MULTIMODAL_B64) {
            console.warn(`[SoW] Skipping multimodal file "${f.name}" in chunk (would exceed ${MAX_CHUNK_MULTIMODAL_B64 / 1024 / 1024}MB per-chunk cap)`);
            continue;
          }
          capped.push(f);
          chunkB64Size += f.base64.length;
        }
        return capped;
      };

      if (criticalNativeFiles.length > 0) {
        console.log(`[SoW] Prepared ${criticalNativeFiles.length} critical file(s) for chunk-scoped multimodal analysis`);
      }
      setOverallProgress((current) => Math.max(current, 50));

      if (abortController.signal.aborted) throw new Error("Analysis cancelled.");

      // ── Enrich prompt ───────────────────────────────────────
      const rawProfile = profileResult?.markdownSummary || "";
      const profileSection = rawProfile ? `\n\n${truncateForContext(rawProfile, MAX_PROFILE_INTEL_CHARS)}` : "";
      const chSection = chResult?.markdownSummary ? `\n\n${truncateForContext(chResult.markdownSummary, 4000)}` : "";
      let priorReportContext = "";
      if (result && result.length > 200) {
        const condensed = result.slice(0, 3000);
        priorReportContext = `\n\n## Previous Assessment (for reference)\n${condensed}\n\nNote: A previous assessment exists. Focus on validating and refining rather than regenerating from scratch. Update findings if documents have changed.`;
      }
      // ── Open Banking / Armalytix awareness injection ────────
      // When Armalytix or Open Banking reports are present, they already contain
      // 12+ months of bank transaction data. Inject directive to suppress
      // false "missing bank statements" requests.
      let openBankingDirective = "";
      const obDetected = hasOpenBankingDocs(docSummaries);
      if (obDetected) {
        openBankingDirective = `\n\n## ⚠️ CRITICAL: Open Banking / Armalytix Data Present
The attached documents include an Armalytix Source of Funds Report (or equivalent Open Banking report). This report ALREADY CONTAINS comprehensive bank transaction data — typically 12+ months of transaction history across all linked accounts, including income credits, outgoing debits, balances, and savings movements.

**YOU MUST NOT:**
- Request "12 months bank statements" or "additional bank statements" as missing documents
- Flag bank statement data as missing or insufficient when Armalytix data is present
- Treat Armalytix transaction data as inferior to raw bank statements — it is Tier 1 evidence (bank-derived)

**YOU MUST:**
- Use the Armalytix transaction data as your primary source for income verification, spending patterns, and balance analysis
- Only request additional bank statements if the Armalytix report explicitly identifies gaps in coverage or if specific accounts are missing from the report
- Treat the Armalytix "Source of Funds Results" and "Transaction Summary" sections as equivalent to 12 months of bank statements`;
      }

      // ── Armalytix structured analysis injection ─────────────
      let armalytixPromptInjection = "";
      let armalytixContextBlock = "";
      if (selectedCaseId) {
        try {
          const { shouldActivateArmalytixModule, fetchStructuredArmalytixData, buildAnalysisInputs, buildArmalytixContextBlock, ARMALYTIX_CONDITIONAL_PROMPT } = await import("@/lib/armalytix/promptModule");
          const hasArmalytix = await shouldActivateArmalytixModule(selectedCaseId, supabase);
          if (hasArmalytix) {
            console.log("[SoW] Armalytix structured data detected — activating conditional analysis module");
            const structuredData = await fetchStructuredArmalytixData(selectedCaseId, supabase);
            if (structuredData.fundSources.length > 0 || structuredData.transactions.length > 0) {
              const { runFullAnalysis } = await import("@/lib/armalytix/contradictionDetector");
              const analysisInputs = buildAnalysisInputs(structuredData);
              const analysisResult = runFullAnalysis(analysisInputs as any);
              armalytixPromptInjection = ARMALYTIX_CONDITIONAL_PROMPT;
              armalytixContextBlock = buildArmalytixContextBlock(analysisResult);
              console.log(`[SoW] Armalytix analysis complete: ${analysisResult.exceptions.length} exceptions, ${analysisResult.draftEnquiries.length} enquiries, status=${analysisResult.decisionSupport.overallReviewStatus}`);
            } else {
              console.log("[SoW] Armalytix report exists but no structured fund sources/transactions — falling back to standard pathway");
            }
          }
        } catch (err) {
          console.warn("[SoW] Armalytix module activation failed (non-fatal, falling back to standard pathway):", err);
        }
      }

      // ── FATF jurisdiction reference injection ──────────────
      // Reads the stored verified FATF list from the DB (refreshed by scheduled fatf-refresh).
      // Falls back to live scrape or static list if stored data is missing/stale.
      let fatfSection = "";
      let capturedFatfData: FatfData | null = null;
      try {
        const { data: fatfData, error: fatfError } = await supabase.functions.invoke("fatf-jurisdiction-check", {
          body: { jurisdictions: ["_list_all"] },
        });
        if (!fatfError && fatfData) {
          capturedFatfData = { blackList: fatfData.blackList, greyList: fatfData.greyList };
          const sourceLabels: Record<string, string> = {
            stored: "Verified stored FATF list (refreshed by scheduled check)",
            live_fallback: "Live scrape fallback (stored list was stale/missing) — verify manually",
            static_fallback: "Static fallback (both DB and live source unavailable) — verify manually",
            // Legacy compat
            live: "Live scrape of official FATF website",
            fallback: "Static fallback (live source unavailable) — verify manually",
          };
          const srcLabel = sourceLabels[fatfData.source] || fatfData.source;
          const isUnreliable = ["static_fallback", "fallback", "live_fallback"].includes(fatfData.source);
          fatfSection = `\n\n## FATF_JURISDICTION_CHECK_RESULTS
**FATF Publication Date**: ${fatfData.publicationDate || fatfData.listVersion || "unknown"}
**Data Source**: ${srcLabel}
**Last Refreshed**: ${fatfData.lastRefreshedAt || fatfData.checkedAt || "unknown"}
**Official URL**: ${fatfData.sourceUrl || "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html"}
**Checked At**: ${fatfData.checkedAt || new Date().toISOString()}

**Black List (Call for Action)**: ${fatfData.blackList?.join(", ") || "See FATF website"}
**Grey List (Increased Monitoring)**: ${fatfData.greyList?.join(", ") || "See FATF website"}

**MANDATORY RULE**: When you encounter ANY jurisdiction/nationality in the case documents, check it against ONLY this list above. If the jurisdiction does not appear on either list, it is NOT listed. Do NOT use your own training data to classify FATF status.${isUnreliable ? "\n**WARNING**: This data may not reflect the very latest FATF publication. State in the report that FATF status should be verified manually against the official source." : ""}`;
          console.log(`[SoW] FATF reference data injected | source=${fatfData.source} | publication=${fatfData.publicationDate || fatfData.listVersion} | refreshed=${fatfData.lastRefreshedAt || "n/a"} | black=${fatfData.blackList?.length} | grey=${fatfData.greyList?.length}`);
        }
      } catch (err) {
        console.warn("[SoW] FATF reference injection failed (non-fatal):", err);
        fatfSection = `\n\n## FATF_JURISDICTION_CHECK_RESULTS
**Status**: FATF list could not be retrieved automatically.
**MANDATORY RULE**: Do NOT guess or infer FATF Grey/Black List status from your training data. For any jurisdiction encountered, state: "FATF status could not be verified automatically; manual review required against https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html"`;
      }

      // ── Capture enrichment context for deterministic Section 5C ────
      // Built once per run, consumed by saveReport() to overwrite any
      // model-authored Personal Profile with the canonical 8-row table,
      // and by persistEnrichmentForCase() to write structured audit rows.
      try {
        const ID_DOC_PATTERN = /passport|driving[_\s-]*licen|photo[_\s-]*id|national[_\s-]*id|biometric|liveness|id[_\s-]*check|id[_\s-]*verif|thirdfort|infotrak/i;
        const personsForProfile = allPersons
          .filter((p) => p.fullName.trim())
          .map((p) => {
            const employerVal = p.employmentStatus === "Other" ? p.employmentStatusOther : p.employmentStatus;
            const isGenericStatus = !employerVal || /^(employed|self[- ]?employed|retired|unemployed|student|other|unknown)$/i.test((employerVal || "").trim());
            const hasIdDocument = (p.files || []).some((f) => ID_DOC_PATTERN.test(f.name));
            return {
              id: p.fullName, // stable per-run id; persons table not exposed here
              fullName: p.fullName,
              role: (p as { role?: string }).role,
              occupation: p.employmentStatus === "Other" ? p.employmentStatusOther : p.employmentStatus,
              employer: isGenericStatus ? undefined : employerVal,
              jurisdictions: [] as string[], // form does not collect nationality; FATF row will return N/A
              hasIdDocument,
            };
          });
        enrichmentContextRef.current = {
          persons: personsForProfile,
          profileResult: profileResult as { profiles?: ProfileResultPerson[] } | null,
          chResult: chResult as { results?: CompaniesHouseResultPerson[] } | null,
          ofsiResult: ofsiResult as { results?: OfsiResultParty[]; overall_status?: string } | null,
          fcaResult: fcaResult as { results?: FcaResultFirm[] } | null,
          fatfData: capturedFatfData,
        };
        console.log(`[SoW] Enrichment context captured for Section 5C | persons=${personsForProfile.length} | profileHits=${(profileResult as { profiles?: unknown[] } | null)?.profiles?.length ?? 0} | chHits=${(chResult as { results?: unknown[] } | null)?.results?.length ?? 0}`);
      } catch (capErr) {
        console.warn("[SoW] Failed to capture enrichment context (non-fatal):", capErr);
        enrichmentContextRef.current = null;
      }

      // ── OFSI sanctions section injection ────────────────────
      let ofsiSection = "";
      if (ofsiResult) {
        try {
          const overallStatus = ofsiResult.overall_status || "clear";
          const screenedAt = ofsiResult.screened_at || new Date().toISOString();
          const totalEntries = ofsiResult.total_ofsi_entries || "unknown";
          ofsiSection = `\n\n## OFSI_SANCTIONS_CHECK_RESULTS
**Screened At**: ${screenedAt}
**OFSI List Size**: ${totalEntries} entries
**Overall Status**: ${overallStatus === "clear" ? "✅ No matches" : overallStatus === "potential_match" ? "⚠️ Potential match(es) — review required" : "🔴 Strong match(es) — immediate review required"}
**Source**: OFSI Consolidated List (https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets)

`;
          for (const r of (ofsiResult.results || [])) {
            ofsiSection += `### ${r.partyName}${r.partyRole ? ` (${r.partyRole})` : ""}\n`;
            ofsiSection += `- **Status**: ${r.status === "clear" ? "✅ Clear — no sanctions match" : r.status === "potential_match" ? "⚠️ Potential match — manual review recommended" : "🔴 Strong match — DO NOT PROCEED without compliance review"}\n`;
            if (r.matches && r.matches.length > 0) {
              for (const m of r.matches.slice(0, 3)) {
                ofsiSection += `  - Match: ${m.ofsiName} (score: ${m.score}, type: ${m.type}, regime: ${m.regime})\n`;
              }
            }
            ofsiSection += "\n";
          }
          ofsiSection += `**MANDATORY RULE**: Use these OFSI screening results in Section 5B of the report. If status is "clear", confirm screening was conducted with no match. If "potential_match" or "strong_match", flag immediately and recommend the Compliance Officer reviews before proceeding.`;
          console.log(`[SoW] OFSI sanctions results injected | overall=${overallStatus} | parties=${(ofsiResult.results || []).length}`);
        } catch (err) {
          console.warn("[SoW] OFSI section build error (non-fatal):", err);
        }
      }

      // ── FCA Register section injection ──────────────────────
      let fcaSection = "";
      if (fcaResult?.markdownSummary) {
        fcaSection = `\n\n${truncateForContext(fcaResult.markdownSummary, 3000)}`;
        fcaSection += `\n\n**MANDATORY RULE**: Use these FCA Register results in the Personal Profile section. If a firm/employer is authorised, cite this as supporting evidence for the person's declared occupation. If not found, note this neutrally — absence from the FCA Register does not imply wrongdoing (most employers are not regulated firms). Only flag as a concern if the person specifically claims to work for a regulated firm that cannot be found.`;
        console.log(`[SoW] FCA register results injected | firms=${(fcaResult.results || []).length}`);
      }

      const enrichedPrompt = prompt + profileSection + chSection + ofsiSection + fcaSection + priorReportContext + openBankingDirective + armalytixPromptInjection + fatfSection;

      // ── Chunked analysis ────────────────────────────────────
      // Size-aware chunking: ensures each chunk fits within the 250K context budget
      const chunks = chunkDocumentsBySize(docSummaries);
      const totalExtractedChars = docSummaries.reduce((sum, s) => sum + s.length, 0);

      // ── SINGLE-PASS BYPASS THRESHOLD ────────────────────────
      // If total extracted text fits within the single-pass threshold,
      // collapse all chunks into one to preserve cross-document reasoning.
      // This prevents the lossy domain-split / multi-worker path from
      // fragmenting evidence chains in small-to-medium cases.
      const useSinglePassBypass = totalExtractedChars <= SINGLE_PASS_CHAR_THRESHOLD;
      const effectiveChunks = useSinglePassBypass && chunks.length > 1
        ? [docSummaries] // Flatten all docs into one chunk
        : chunks;

      const chosenPath = useSinglePassBypass ? "single-pass" : (
        hasOpenBankingDocs(docSummaries) && docSummaries.length >= MIN_DOCS_FOR_DOMAIN_SPLIT
          ? "domain-split" : "multi-chunk"
      );

      console.log(
        `[SoW][PATH-SELECTION] ` +
        `totalExtractedChars=${totalExtractedChars} | ` +
        `threshold=${SINGLE_PASS_CHAR_THRESHOLD} | ` +
        `originalChunks=${chunks.length} | ` +
        `effectiveChunks=${effectiveChunks.length} | ` +
        `chosenPath=${chosenPath} | ` +
        `reason=${useSinglePassBypass
          ? `total text (${totalExtractedChars} chars) <= threshold (${SINGLE_PASS_CHAR_THRESHOLD} chars) — using holistic single-pass`
          : `total text (${totalExtractedChars} chars) > threshold — using ${chosenPath}`
        }`
      );

      const totalChunks = effectiveChunks.length;
      let fullResponse = "";
      // Tracks how many batches were successfully completed by the time we
      // (potentially) enter consolidation. Updated by both the standard
      // multi-chunk path and the single-chunk path so the preserved-progress
      // snapshot can show batchesCompleted / batchesTotal honestly on a
      // consolidation timeout.
      let batchesCompletedAtConsolidation = 0;

      if (totalChunks === 1) {
        setRunPhase("analysing");
        setRunPhaseDetail({ current: 0, total: 1 });
        setDocProcessingStatus("Running Olimey AI analysis…");
        setOverallProgress(55);
        const contextWithDocs = buildBoundedAssessmentContext(armalytixContextBlock ? armalytixContextBlock + "\n\n" + enrichedPrompt : enrichedPrompt, effectiveChunks[0]);
        const singleChunkNativeFiles = getChunkNativeFiles(effectiveChunks[0]);

        if (criticalNativeFiles.length > 0) {
          const singleChunkB64Size = singleChunkNativeFiles.reduce((sum, file) => sum + file.base64.length, 0);
          console.log(
            `[SoW] Single-chunk multimodal payload: ${singleChunkNativeFiles.length}/${criticalNativeFiles.length} file(s), ${(singleChunkB64Size / 1024 / 1024).toFixed(2)}MB base64`
          );
        }

        // Checkpoint-resume: retry up to 2 times on timeout, carrying partial output forward
        const MAX_ANALYSIS_RETRIES = 2;
        let chunkResponse = "";
        let analysisSuccess = false;
        let useMultimodalFiles = singleChunkNativeFiles.length > 0;

        for (let attempt = 0; attempt <= MAX_ANALYSIS_RETRIES; attempt++) {
          const isResume = attempt > 0 && chunkResponse.length > 200;
          const msgs: { role: string; content: string }[] = isResume
            ? [
                { role: "user", content: contextWithDocs },
                { role: "assistant", content: chunkResponse },
                { role: "user", content: "The connection was interrupted. Continue your analysis EXACTLY from where you left off. Do NOT repeat any content you have already produced above. Pick up mid-sentence if needed." },
              ]
            : [{ role: "user", content: contextWithDocs }];

          if (isResume) {
            setDocProcessingStatus(`Connection lost — resuming analysis (attempt ${attempt + 1})…`);
            // Small backoff before retry
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }

          try {
            await new Promise<void>((resolve, reject) => {
              let deltaCount = 0;
              streamChat({
                agentId,
                caseId: selectedCaseId || undefined,
                aiRunId: currentRunId.current || undefined,
                clientPromptSdlt: clientPromptSdltNum,
                messages: msgs as any,
                files: !isResume && useMultimodalFiles ? singleChunkNativeFiles : undefined,
                skipJudge: true, // Always use direct-stream passthrough to avoid Supabase proxy timeout on long SoW analysis
                timeoutMs: SOW_STREAM_TIMEOUT_MS,
                signal: abortController.signal,
                onDelta: (text) => {
                  if (!firstDeltaReceived.current) { firstDeltaReceived.current = true; if (!isResume) chunkResponse = ""; }
                  chunkResponse += text;
                  setResult(chunkResponse);
                  // Update progress during streaming (55% → 92%)
                  deltaCount++;
                  if (deltaCount % 5 === 0) {
                    const streamPct = Math.min(92, 55 + deltaCount * 0.15);
                    setOverallProgress(Math.round(streamPct));
                  }
                },
                onDone: () => resolve(),
                onError: (msg) => reject(new Error(msg)),
                onMeta: (meta) => {
                  const gate = meta.relevance_gate as { filtered_count?: number } | undefined;
                  if (gate?.filtered_count) setFilteredFindingsCount(gate.filtered_count);
                },
              });
            });
            analysisSuccess = true;
            break; // success — exit retry loop
          } catch (err: any) {
            const message = String(err?.message || "");
            const isTimeout = message.includes("timed out") || message.includes("Network error");
            const canFallbackToTextOnly = !isResume && useMultimodalFiles && chunkResponse.length === 0 && (
              message.includes("Failed to fetch") ||
              message.includes("temporarily unavailable") ||
              message.includes("could not be reached") ||
              message.includes("Request Entity Too Large") ||
              message.includes("413") ||
              message.includes("payload") ||
              message.includes("body") ||
              message.includes("Something went wrong")
            );

            if (canFallbackToTextOnly) {
              console.warn("[SoW] Multimodal analysis request failed before first token — retrying text-only", message);
              useMultimodalFiles = false;
              setDocProcessingStatus("Multimodal upload failed — retrying analysis with extracted text only…");
              continue;
            }

            if (isTimeout && attempt < MAX_ANALYSIS_RETRIES && chunkResponse.length > 200) {
              console.warn(`[SoW] Analysis attempt ${attempt + 1} timed out with ${chunkResponse.length} chars — will resume`);
              continue;
            }
            throw err; // non-recoverable error
          }
        }

        if (!analysisSuccess && chunkResponse.length > 500) {
          // We have substantial partial output — use it rather than failing
          console.warn(`[SoW] All retries exhausted but using partial output (${chunkResponse.length} chars)`);
          chunkResponse += "\n\n---\n⚠️ *Note: This assessment may be incomplete due to a connection interruption during analysis. Please review and re-run if critical sections are missing.*";
          setResult(chunkResponse);
        }

        fullResponse = chunkResponse;
        if (analysisSuccess || chunkResponse.length > 500) batchesCompletedAtConsolidation = 1;
      } else {
        // ── Domain-split detection ────────────────────────────────
        // If documents include Open Banking / Armalytix reports with enough docs,
        // use prompt-sectioned parallel workers for faster processing
        const useDomainSplit = hasOpenBankingDocs(docSummaries) && docSummaries.length >= MIN_DOCS_FOR_DOMAIN_SPLIT;

        if (useDomainSplit) {
          // ── DOMAIN-SPLIT PARALLEL WORKER PATH ─────────────────
          const domainSplitT0 = performance.now();
          console.log(`[SoW] Domain-split parallel processing: ${docSummaries.length} docs across ${PROMPT_DOMAINS.length} specialist workers`);
          setRunPhase("preparing");
          setDocProcessingStatus("Resolving shared context…");
          setOverallProgress(52);

          // 1. Pre-resolve shared context (prompt + KB + profile) once
          let resolvedContext: {
            fullPrompt: string;
            contextInjection: string;
            knowledgeContext: string;
          } | null = null;

          const ctxT0 = performance.now();
          try {
            const { data: ctxData, error: ctxError } = await supabase.functions.invoke(
              "resolve-sow-context",
              {
                body: {
                  caseId: selectedCaseId,
                  tenure: tenure || undefined,
                  lender: lender || undefined,
                  // Wave 15.1: forward sufficiency gate result for AI context injection
                  sufficiencyResult: sufficiencyContextRef.current?.result ?? undefined,
                  sufficiencyAcknowledgement: sufficiencyContextRef.current?.acknowledgement ?? undefined,
                },
              }
            );
            if (ctxError) throw ctxError;
            resolvedContext = ctxData;
          } catch (ctxErr) {
            console.warn("[SoW] resolve-sow-context failed, falling back to standard chunking:", ctxErr);
          }
          const ctxLatencyMs = Math.round(performance.now() - ctxT0);
          console.log(`[SoW][perf] resolve-sow-context: ${ctxLatencyMs}ms`);

          if (resolvedContext) {
            // 2. Map docs to domains
            const domainDocs = mapDocsToDomains(docSummaries);

            // 3. Build domain-specific prompts and fan out workers
            const MAX_CONCURRENT_WORKERS = 4;
            const workerSem = new Semaphore(MAX_CONCURRENT_WORKERS);
            let completedWorkers = 0;
            const totalWorkers = PROMPT_DOMAINS.length;
            const workerTimings: { domainId: string; latencyMs: number; chars: number; status: string }[] = [];

            setRunPhase("analysing");
            setRunPhaseDetail({ current: 0, total: totalWorkers });
            setDocProcessingStatus(`Running ${totalWorkers} specialist workers in parallel…`);

            const runDomainWorker = async (domain: typeof PROMPT_DOMAINS[0]): Promise<{ domainId: string; text: string }> => {
              await workerSem.acquire();
              const workerT0 = performance.now();
              try {
                const domainPrompt = buildDomainPrompt(
                  resolvedContext!.fullPrompt,
                  domain,
                  totalWorkers,
                  resolvedContext!.contextInjection,
                  resolvedContext!.knowledgeContext,
                );

                const domainDocSummaries = domainDocs.get(domain.id) || [];
                const domainEnrichedPrompt = armalytixContextBlock
                  ? armalytixContextBlock + "\n\n" + enrichedPrompt
                  : enrichedPrompt;
                const contextWithDocs = buildBoundedAssessmentContext(domainEnrichedPrompt, domainDocSummaries);

                // Get multimodal files relevant to this domain
                const domainNativeFiles = criticalNativeFiles.filter(f =>
                  domain.docPatterns.some(p => p.test(f.name))
                );
                const cappedNativeFiles: AttachedFile[] = [];
                let nativeB64Size = 0;
                for (const f of domainNativeFiles) {
                  if (nativeB64Size + f.base64.length > MAX_CHUNK_MULTIMODAL_B64) break;
                  cappedNativeFiles.push(f);
                  nativeB64Size += f.base64.length;
                }

                let workerResponse = "";
                await new Promise<void>((resolve, reject) => {
                  streamChunkWorker({
                    systemPrompt: domainPrompt,
                    messages: [{ role: "user", content: contextWithDocs }],
                    files: cappedNativeFiles.length > 0
                      ? cappedNativeFiles.map(f => ({ base64: f.base64, name: f.name, mimeType: f.mimeType }))
                      : undefined,
                    model: "google/gemini-2.5-pro",
                    domainId: domain.id,
                    timeoutMs: SOW_CHUNK_TIMEOUT_MS,
                    signal: abortController.signal,
                    onDelta: (text) => { workerResponse += text; },
                    onDone: () => resolve(),
                    onError: (msg) => reject(new Error(msg)),
                  });
                });

                const latencyMs = Math.round(performance.now() - workerT0);
                workerTimings.push({ domainId: domain.id, latencyMs, chars: workerResponse.length, status: "ok" });
                console.log(`[SoW][perf] worker ${domain.id}: ${latencyMs}ms | ${workerResponse.length} chars`);

                return { domainId: domain.id, text: workerResponse };
              } catch (err) {
                const latencyMs = Math.round(performance.now() - workerT0);
                workerTimings.push({ domainId: domain.id, latencyMs, chars: 0, status: "failed" });
                console.warn(`[SoW][perf] worker ${domain.id}: FAILED after ${latencyMs}ms`);
                throw err;
              } finally {
                workerSem.release();
                completedWorkers++;
                const pct = 52 + Math.round((completedWorkers / totalWorkers) * 38);
                setOverallProgress(pct);
                setRunPhase("analysing");
                setRunPhaseDetail({ current: completedWorkers, total: totalWorkers });
                setDocProcessingStatus(`Specialist workers… ${completedWorkers}/${totalWorkers} complete`);
              }
            };

            const settled = await Promise.allSettled(
              PROMPT_DOMAINS.map(domain => runDomainWorker(domain))
            );

            // ── Observability summary ─────────────────────────────
            const domainSplitTotalMs = Math.round(performance.now() - domainSplitT0);
            const maxWorkerMs = workerTimings.reduce((m, t) => Math.max(m, t.latencyMs), 0);
            const sumWorkerMs = workerTimings.reduce((s, t) => s + t.latencyMs, 0);
            console.log(
              `[SoW][perf] DOMAIN-SPLIT SUMMARY:\n` +
              `  Total wall-clock: ${domainSplitTotalMs}ms (${(domainSplitTotalMs / 1000).toFixed(1)}s)\n` +
              `  Context resolution: ${ctxLatencyMs}ms\n` +
              `  Slowest worker: ${maxWorkerMs}ms\n` +
              `  Sum of worker times (sequential equivalent): ${sumWorkerMs}ms (${(sumWorkerMs / 1000).toFixed(1)}s)\n` +
              `  Parallelism speedup: ${sumWorkerMs > 0 ? (sumWorkerMs / maxWorkerMs).toFixed(2) : "N/A"}x\n` +
              `  Workers: ${workerTimings.map(t => `${t.domainId}=${t.latencyMs}ms[${t.status}]`).join(", ")}`
            );

            const domainResults: { domainId: string; text: string }[] = [];
            const failedDomains: string[] = [];
            for (let i = 0; i < settled.length; i++) {
              const s = settled[i];
              if (s.status === "fulfilled") {
                domainResults.push(s.value);
              } else {
                console.warn(`[SoW] Domain worker "${PROMPT_DOMAINS[i].id}" failed:`, s.reason?.message);
                failedDomains.push(PROMPT_DOMAINS[i].label);
              }
            }

            if (domainResults.length === 0) {
              // All domain workers failed — fall through to standard chunk path below
              console.warn("[SoW] All domain workers failed, falling back to standard chunking");
            } else {
              // Combine domain results with headers
              batchesCompletedAtConsolidation = domainResults.length;
              fullResponse = domainResults
                .map(r => {
                  const domain = PROMPT_DOMAINS.find(d => d.id === r.domainId);
                  return `## ${domain?.label || r.domainId} Analysis\n\n${r.text}`;
                })
                .join("\n\n---\n\n");

              if (failedDomains.length > 0) {
                fullResponse = `> ⚠️ **${failedDomains.length} specialist worker(s) failed**: ${failedDomains.join(", ")}. Results below are from successful workers.\n\n` + fullResponse;
              }

              firstDeltaReceived.current = true;
              setResult(fullResponse);
            }
          }

          // If domain-split didn't produce results, fall through to standard chunking
          if (!fullResponse) {
            console.log("[SoW] Domain-split produced no results, using standard chunk path");
          }
        }

        // ── STANDARD MULTI-CHUNK PATH (fallback or non-OB docs) ────
        if (!fullResponse) {
        const standardT0 = performance.now();
        const MAX_CONCURRENT_ANALYSIS = 3;
        const MAX_CHUNK_RETRIES = 2;
        const analysisSem = new Semaphore(MAX_CONCURRENT_ANALYSIS);
        let completedChunks = 0;
        const chunkTimings: { index: number; latencyMs: number; chars: number; status: string }[] = [];

        setRunPhase("analysing");
        setRunPhaseDetail({ current: 0, total: totalChunks });
        setDocProcessingStatus(`Analysing all ${totalChunks} batches in parallel…`);
        setOverallProgress(52);

        const runChunk = async (chunk: string[], chunkIdx: number): Promise<string> => {
          await analysisSem.acquire();
          const chunkT0 = performance.now();
          try {
            let chunkPrompt = armalytixContextBlock
              ? armalytixContextBlock + "\n\n" + enrichedPrompt
              : enrichedPrompt;
            chunkPrompt += `\n\n**Note:** This is batch ${chunkIdx + 1} of ${totalChunks}. Analyse these documents thoroughly. A consolidation pass will merge all batch results.`;
            const contextWithDocs = buildBoundedAssessmentContext(chunkPrompt, chunk);
            const chunkNativeFiles = getChunkNativeFiles(chunk);

            let chunkResponse = "";
            await new Promise<void>((resolve, reject) => {
              streamChat({
                agentId,
                caseId: selectedCaseId || undefined,
                aiRunId: currentRunId.current || undefined,
                clientPromptSdlt: clientPromptSdltNum,
                messages: [{ role: "user", content: contextWithDocs }],
                files: chunkNativeFiles.length > 0 ? chunkNativeFiles : undefined,
                skipJudge: true,
                modelOverride: "google/gemini-2.5-pro",
                timeoutMs: SOW_CHUNK_TIMEOUT_MS,
                signal: abortController.signal,
                onDelta: (text) => { chunkResponse += text; },
                onDone: () => resolve(),
                onError: (msg) => reject(new Error(msg)),
              });
            });

            const latencyMs = Math.round(performance.now() - chunkT0);
            chunkTimings.push({ index: chunkIdx, latencyMs, chars: chunkResponse.length, status: "ok" });
            console.log(`[SoW][perf] standard chunk ${chunkIdx}: ${latencyMs}ms | ${chunkResponse.length} chars`);
            return chunkResponse;
          } catch (err) {
            const latencyMs = Math.round(performance.now() - chunkT0);
            chunkTimings.push({ index: chunkIdx, latencyMs, chars: 0, status: "failed" });
            console.warn(`[SoW][perf] standard chunk ${chunkIdx}: FAILED after ${latencyMs}ms`);
            throw err;
          } finally {
            analysisSem.release();
            completedChunks++;
            const analysisPct = 50 + Math.round((completedChunks / totalChunks) * 40);
            setOverallProgress(analysisPct);
            setRunPhase("analysing");
            setRunPhaseDetail({ current: completedChunks, total: totalChunks });
            setDocProcessingStatus(`Analysing batches… ${completedChunks}/${totalChunks} complete`);
          }
        };

        const settled = await Promise.allSettled(effectiveChunks.map((chunk, idx) => runChunk(chunk, idx)));

        const chunkResults: { index: number; text: string }[] = [];
        const failedIdxs: number[] = [];
        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          if (s.status === "fulfilled") {
            chunkResults.push({ index: i, text: s.value });
          } else {
            console.warn(`[SoW] Chunk ${i + 1} failed:`, s.reason?.message);
            failedIdxs.push(i);
          }
        }

        // Retry failed chunks
        let remainingFailed = [...failedIdxs];
        for (let retryRound = 0; retryRound < MAX_CHUNK_RETRIES && remainingFailed.length > 0; retryRound++) {
          setRunPhase("retrying-batches");
          setRunPhaseDetail({ attempt: retryRound + 1, total: remainingFailed.length });
          setChunkRetryRound(retryRound + 1);
          setDocProcessingStatus(`Retrying ${remainingFailed.length} failed batch(es) (attempt ${retryRound + 1})…`);
          completedChunks = 0;
          if (retryRound > 0) await new Promise(r => setTimeout(r, 3000 * retryRound));
          const retrySettled = await Promise.allSettled(remainingFailed.map((idx) => runChunk(effectiveChunks[idx], idx)));
          const stillFailed: number[] = [];
          for (let j = 0; j < retrySettled.length; j++) {
            const r = retrySettled[j];
            if (r.status === "fulfilled") {
              chunkResults.push({ index: remainingFailed[j], text: r.value });
            } else {
              stillFailed.push(remainingFailed[j]);
            }
          }
          remainingFailed = stillFailed;
        }

        // H1 Fix: All chunks failed — preserve state
        if (chunkResults.length === 0) {
          setIsSubmitting(false);
          setDocProcessingStatus(null);
          setOverallProgress(0);
          setRunPhase("failed");
          setRunPhaseDetail({});
          setChunkFailureState({
            failed: true,
            message: "All analysis batches failed. Your files and form data are preserved.",
            retryFn: () => {
              setChunkFailureState(null);
              handleSubmit();
            },
          });
          abortRef.current = null;
          return;
        }

        chunkResults.sort((a, b) => a.index - b.index);
        const failedCount = totalChunks - chunkResults.length;
        batchesCompletedAtConsolidation = chunkResults.length;
        fullResponse = chunkResults.map((r) => r.text).join("\n\n---\n\n");
        if (failedCount > 0) {
          fullResponse = `> ⚠️ **${failedCount} of ${totalChunks} batch(es) could not be processed.** Results below are from the successful batches.\n\n` + fullResponse;
        }

        // ── Standard path observability summary ───────────────
        const standardTotalMs = Math.round(performance.now() - standardT0);
        const maxChunkMs = chunkTimings.reduce((m, t) => Math.max(m, t.latencyMs), 0);
        const sumChunkMs = chunkTimings.reduce((s, t) => s + t.latencyMs, 0);
        console.log(
          `[SoW][perf] STANDARD CHUNK SUMMARY:\n` +
          `  Total wall-clock: ${standardTotalMs}ms (${(standardTotalMs / 1000).toFixed(1)}s)\n` +
          `  Chunks: ${totalChunks} | Concurrency: ${MAX_CONCURRENT_ANALYSIS}\n` +
          `  Slowest chunk: ${maxChunkMs}ms\n` +
          `  Sum of chunk times (sequential equivalent): ${sumChunkMs}ms (${(sumChunkMs / 1000).toFixed(1)}s)\n` +
          `  Parallelism speedup: ${sumChunkMs > 0 ? (sumChunkMs / maxChunkMs).toFixed(2) : "N/A"}x\n` +
          `  Chunks: ${chunkTimings.map(t => `#${t.index}=${t.latencyMs}ms[${t.status}]`).join(", ")}`
        );

        firstDeltaReceived.current = true;
        setResult(fullResponse);
        } // end standard multi-chunk fallback
      }

      // ── Consolidation pass ──────────────────────────────────
      // Run consolidation if multi-chunk OR domain-split produced results
      const needsConsolidation = totalChunks > 1 || (hasOpenBankingDocs(docSummaries) && docSummaries.length >= MIN_DOCS_FOR_DOMAIN_SPLIT && fullResponse.includes("## ") && fullResponse.includes("Analysis\n"));

      // Build a document inventory for the consolidation pass so it knows
      // exactly which documents were provided and can't hallucinate missing ones
      const docInventory = docSummaries.map((s) => {
        const nameMatch = s.match(/\[Document:\s*([^\]\[]+?)(?:\s*\[Tagged to:.*?\])?\]/);
        return nameMatch?.[1]?.trim() || "Unknown document";
      });
      const docInventorySection = `\n\n## DOCUMENT INVENTORY\nThe following ${docInventory.length} document(s) were provided and extracted for this assessment. Do NOT request any of these as "missing":\n${docInventory.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;

      // Include the original form data so the consolidation pass can
      // cross-reference funding structures, purchase price, parties, etc.
      const formDataSection = `\n\n## ORIGINAL FORM DATA\n${prompt}`;

      if (needsConsolidation) {
        const chunkOnlyResults = fullResponse;
        pendingChunkResults.current = chunkOnlyResults;

        const consolidationStartedAt = Date.now();
        setRunPhase("consolidating");
        setRunPhaseDetail({ model: "Gemini 2.5 Pro", attempt: (consolidationAttempts.current || 0) + 1 });
        setDocProcessingStatus("Consolidating analysis…");
        setOverallProgress(92);

        const consolidationOBDirective = obDetected ? `\n\n## ⚠️ CRITICAL: Open Banking / Armalytix Data Present
The documents include an Armalytix Source of Funds Report (or equivalent Open Banking report) containing comprehensive bank transaction data (12+ months). 
**YOU MUST NOT** request "12 months bank statements" or "additional bank statements" as missing documents. 
**YOU MUST NOT** flag bank statement data as missing or insufficient — Armalytix transaction data IS Tier 1 bank-derived evidence equivalent to bank statements.
Only request additional bank statements if the Armalytix report explicitly identifies gaps in coverage.\n` : "";
        const consolidationPrompt = `You previously analysed ${docSummaries.length} documents across ${totalChunks} batches for a Source of Wealth assessment.\n\nBelow is the full accumulated analysis:\n\n${truncateForContext(fullResponse, MAX_AGENT_CHAT_MESSAGE_CHARS - 4000)}${consolidationOBDirective}${docInventorySection}${formDataSection}\n\nNow produce a single, consolidated Source of Wealth report in the standard format. Merge all findings, remove duplication, and present one cohesive assessment. Include the <!-- PROFILE_INFO_START -->, <!-- INTERNAL_REPORT_START -->, and <!-- DRAFT_EMAIL_START --> markers as usual. The Profile Intelligence section (after <!-- PROFILE_INFO_START -->) MUST include all Firecrawl intelligence and Companies House verification findings for every person.\n\n**IMPORTANT:** Cross-reference the DOCUMENT INVENTORY above against your findings. If a document appears in the inventory, it was successfully extracted and analysed — do NOT flag it as missing or request it to be provided.`;

        // Resolve a system prompt for the chunk-worker passthrough.
        // Always call resolve-sow-context so the worker gets the deployed
        // SoW prompt + KB + FATF/OFSI/FCA injections (the domain-split
        // resolvedContext is scoped to its branch and not reused here).
        let consolidationSystemPrompt: string | null = null;
        try {
          const { data: ctxData, error: ctxError } = await supabase.functions.invoke(
            "resolve-sow-context",
            {
              body: {
                caseId: selectedCaseId,
                tenure: tenure || undefined,
                lender: lender || undefined,
                // Wave 15.1: forward sufficiency gate result for AI context injection
                sufficiencyResult: sufficiencyContextRef.current?.result ?? undefined,
                sufficiencyAcknowledgement: sufficiencyContextRef.current?.acknowledgement ?? undefined,
              },
            }
          );
          if (ctxError) throw ctxError;
          if (ctxData?.fullPrompt) {
            consolidationSystemPrompt = [
              ctxData.fullPrompt,
              ctxData.contextInjection || "",
              ctxData.knowledgeContext || "",
            ].filter(Boolean).join("\n\n");
          }
        } catch (resolveErr) {
          console.warn("[SoW] Could not resolve system prompt for consolidation:", resolveErr);
        }

        // Cache for retry path so a page reload isn't required.
        pendingConsolidationMeta.current = {
          docCount: docSummaries.length,
          chunkCount: totalChunks,
          hasOpenBanking: obDetected,
          docInventory,
          formData: prompt,
          systemPrompt: consolidationSystemPrompt || undefined,
          selectedCaseId: selectedCaseId || null,
          tenure: tenure || undefined,
          lender: lender || undefined,
        };

        try {
          if (!consolidationSystemPrompt) {
            throw new Error("Could not resolve SoW system prompt for consolidation");
          }
          let consolidation = "";
          await new Promise<void>((resolve, reject) => {
            streamChunkWorker({
              systemPrompt: consolidationSystemPrompt!,
              messages: [{ role: "user", content: consolidationPrompt }],
              model: "google/gemini-2.5-pro",
              domainId: "consolidation",
              timeoutMs: SOW_STREAM_TIMEOUT_MS,
              signal: abortController.signal,
              onDelta: (text) => {
                consolidation += text;
                setResult(consolidation);
              },
              onDone: () => resolve(),
              onError: (msg) => reject(new Error(msg)),
            });
          });

          fullResponse = consolidation;
          pendingChunkResults.current = null;
        } catch (consolidationErr: any) {
          console.error("Consolidation failed, falling back to chunk results:", consolidationErr);
          const banner = "\n\n> ⚠️ **Consolidation timed out** — showing individual batch results below. Click 'Retry Consolidation' to try again.\n\n";
          fullResponse = banner + chunkOnlyResults;
          setResult(fullResponse);
          // Capture a frozen snapshot of preserved progress for the panel.
          // Values are read from outer-scoped state at the catch point so
          // they reflect exactly what was completed before the timeout.
          setPreservedSnapshot({
            capturedAt: Date.now(),
            docsExtracted: docItems.filter(d => d.state === "done").length,
            docsTotal: docItems.length,
            batchesCompleted: batchesCompletedAtConsolidation,
            batchesTotal: totalChunks,
            batchRetryRounds: chunkRetryRound,
            consolidationElapsedSec: Math.round((Date.now() - consolidationStartedAt) / 1000),
            preservedCharCount: pendingChunkResults.current?.length ?? 0,
          });
          setRunPhase("timed-out");
          setRunPhaseDetail({ attempt: consolidationAttempts.current });
          toast({
            title: "Consolidation timed out",
            description: "Your batch results are preserved. Click 'Retry Consolidation' to try again.",
            variant: "default",
          });
        }
      }

      // ── Done ────────────────────────────────────────────────
      setIsSubmitting(false);
      setDocProcessingStatus(null);
      setOverallProgress(100);
      // Only flip to "complete" if consolidation didn't already mark "timed-out".
      setRunPhase((prev) => (prev === "timed-out" ? prev : "complete"));
      setTimeout(() => setOverallProgress(0), 1000);
      logAuditEvent("sow_assessment_completed", caseReference || undefined, {
        purchaser_count: purchasers.length,
        giftor_count: hasGiftors ? giftors.length : 0,
        document_count: allFiles.length,
        chunk_count: totalChunks,
        response_length: fullResponse.length,
      });
      const persistedReportId = await saveReport(fullResponse);

      // ── Persist structured enrichment evidence (Wave 7 audit trail) ──
      // Best-effort: never blocks the run. Restores per-person rows in
      // external_profile_checks / external_profile_signals so the report's
      // Section 5C is auditable to its source data.
      const enrichCtx = enrichmentContextRef.current;
      if (enrichCtx && persistedReportId && selectedCaseId && currentRunId.current) {
        persistEnrichmentForCase({
          caseId: selectedCaseId,
          aiRunId: currentRunId.current,
          persons: enrichCtx.persons.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            occupation: p.occupation,
            employer: p.employer,
          })),
          profileResult: enrichCtx.profileResult,
          chResult: enrichCtx.chResult,
          ofsiResult: enrichCtx.ofsiResult,
          fcaResult: enrichCtx.fcaResult,
        }).catch((err) => console.warn("[SoW] persistEnrichmentForCase failed (non-fatal):", err));
      }

      // ── Post-generation section validation (async, non-blocking) ──
      const docNames = allFiles.map((f: AttachedFile) => f.name);
      setSectionValidation(null);
      const expectedPersonNames = enrichmentContextRef.current?.persons.map((p) => p.fullName) ?? [];
      validateMandatorySections(fullResponse, docNames, persistedReportId, expectedPersonNames)
        .then((result) => {
          setSectionValidation(result);
          if (!result.passed) {
            console.warn("[section-validator] Omissions found:", result.omissions);
            toast({
              title: "Section compliance check",
              description: `${result.omissions.length} mandatory section(s) may need attention. Review the validation panel below the report.`,
              variant: "default",
            });
          }
        })
        .catch((err) => console.warn("[section-validator] Failed:", err));
      if (selectedCaseId) {
        saveAssessmentReport(selectedCaseId, "Olimey AI Source of Wealth", fullResponse)
          .then(() => queryClient.invalidateQueries({ queryKey: ["documents", selectedCaseId] }))
          .catch((err) => console.warn("[SoW] Failed to save report:", err));
      }

      // C1 Fix: Atomic credit deduction via RPC
      if (credits != null && profile?.user_id) {
        try {
          const { data: deductResult, error: deductErr } = await supabase.rpc(
            "deduct_credits_atomic" as any,
            {
              p_user_id: profile.user_id,
              p_amount: breakdown.total,
              p_description: `SoW Assessment — ${caseReference || "No ref"}`,
              p_case_id: selectedCaseId || null,
            }
          );
          if (deductErr) {
            console.error("[SoW] Credit deduction RPC error:", deductErr);
            toast({ title: "Credit deduction failed", description: "Your report was saved but credits were not deducted. Please contact support.", variant: "destructive" });
          } else if (deductResult && !(deductResult as any).success) {
            console.warn("[SoW] Credit deduction rejected:", (deductResult as any).error);
            toast({ title: "Credit issue", description: (deductResult as any).error || "Could not deduct credits.", variant: "destructive" });
          }
          queryClient.invalidateQueries({ queryKey: ["credits"] });
        } catch (creditErr) {
          console.error("[SoW] Credit deduction exception:", creditErr);
          toast({ title: "Credit deduction failed", description: "Report saved. Credits not deducted — please contact support.", variant: "destructive" });
        }
      }
    } catch (e: any) {
      setIsSubmitting(false);
      setDocProcessingStatus(null);
      setOverallProgress(0);
      abortRef.current = null;
      // Clear idempotency key so the next user-initiated submit starts a fresh run.
      currentRunId.current = null;
      enrichmentContextRef.current = null;
      consolidationAttempts.current = 0;
      setCurrentRunIdValue(null);
      setConsolidationAttemptsThisRun(0);
      if (e.message === "Analysis cancelled.") {
        setRunPhase("cancelled");
        setRunPhaseDetail({});
        toast({ title: "Cancelled", description: "Olimey AI analysis was cancelled." });
      } else {
        setRunPhase("failed");
        setRunPhaseDetail({});
        const msg = e.message || "Unknown error";
        const isCreditsIssue = msg.toLowerCase().includes("insufficient credits") || msg.toLowerCase().includes("credit");
        toast({
          title: isCreditsIssue ? "Insufficient Credits" : "Error",
          description: isCreditsIssue
            ? `${msg} Go to Buy Credits to top up.`
            : msg,
          variant: "destructive",
          duration: isCreditsIssue ? 10000 : 5000,
        });
      }
    }
  }, [config, credits, profile, result, toast, queryClient, saveReport]);

  // ── Cancel ──────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsSubmitting(false);
    setDocProcessingStatus(null);
    setOverallProgress(0);
    setRunPhase("cancelled");
    setRunPhaseDetail({});
    setPreservedSnapshot(null);
    // Clear idempotency key so the next submit starts a fresh run.
    currentRunId.current = null;
    enrichmentContextRef.current = null;
    sufficiencyContextRef.current = null;
    consolidationAttempts.current = 0;
    setCurrentRunIdValue(null);
    setConsolidationAttemptsThisRun(0);
  }, []);

  // ── Retry Consolidation ─────────────────────────────────────────
  const handleRetryConsolidation = useCallback(async () => {
    const chunkText = pendingChunkResults.current;
    const meta = pendingConsolidationMeta.current;
    if (!chunkText || !meta) return;

    // agentId/streamChat no longer needed: consolidation routes through sow-chunk-worker.

    setIsSubmitting(true);
    setPreservedSnapshot(null);
    setRunPhase("retrying-consolidation");
    setRunPhaseDetail({ model: "Gemini 2.5 Pro", attempt: (consolidationAttempts.current || 0) + 1 });
    setDocProcessingStatus("Retrying consolidation…");
    setOverallProgress(92);
    analysisStartTime.current = Date.now();
    setElapsedSeconds(0);

    const retryOBDirective = meta.hasOpenBanking ? `\n\n## ⚠️ CRITICAL: Open Banking / Armalytix Data Present
The documents include an Armalytix Source of Funds Report (or equivalent Open Banking report) containing comprehensive bank transaction data (12+ months). 
**YOU MUST NOT** request "12 months bank statements" or "additional bank statements" as missing documents. 
**YOU MUST NOT** flag bank statement data as missing or insufficient — Armalytix transaction data IS Tier 1 bank-derived evidence equivalent to bank statements.\n` : "";
    const retryDocInventorySection = meta.docInventory && meta.docInventory.length > 0
      ? `\n\n## DOCUMENT INVENTORY\nThe following ${meta.docInventory.length} document(s) were provided and extracted for this assessment. Do NOT request any of these as "missing":\n${meta.docInventory.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n")}`
      : "";
    const retryFormDataSection = meta.formData ? `\n\n## ORIGINAL FORM DATA\n${meta.formData}` : "";
    const consolidationPrompt = `You previously analysed ${meta.docCount} documents across ${meta.chunkCount} batches for a Source of Wealth assessment.\n\nBelow is the full accumulated analysis:\n\n${truncateForContext(chunkText, MAX_AGENT_CHAT_MESSAGE_CHARS - 4000)}${retryOBDirective}${retryDocInventorySection}${retryFormDataSection}\n\nNow produce a single, consolidated Source of Wealth report in the standard format. Merge all findings, remove duplication, and present one cohesive assessment. Include the <!-- PROFILE_INFO_START -->, <!-- INTERNAL_REPORT_START -->, and <!-- DRAFT_EMAIL_START --> markers as usual. The Profile Intelligence section (after <!-- PROFILE_INFO_START -->) MUST include all Firecrawl intelligence and Companies House verification findings for every person.\n\n**IMPORTANT:** Cross-reference the DOCUMENT INVENTORY above against your findings. If a document appears in the inventory, it was successfully extracted and analysed — do NOT flag it as missing or request it to be provided.`;

    // Use the cached system prompt from the original consolidation attempt
    // when available; otherwise re-resolve from resolve-sow-context.
    let retrySystemPrompt: string | null = meta.systemPrompt || null;
    if (!retrySystemPrompt) {
      try {
        const { data: ctxData, error: ctxError } = await supabase.functions.invoke(
          "resolve-sow-context",
          {
            body: {
              caseId: meta.selectedCaseId || config.selectedCaseId,
              tenure: meta.tenure || undefined,
              lender: meta.lender || undefined,
              // Wave 15.1: forward sufficiency gate result (preserved from original run)
              sufficiencyResult: sufficiencyContextRef.current?.result ?? undefined,
              sufficiencyAcknowledgement: sufficiencyContextRef.current?.acknowledgement ?? undefined,
            },
          }
        );
        if (ctxError) throw ctxError;
        if (ctxData?.fullPrompt) {
          retrySystemPrompt = [
            ctxData.fullPrompt,
            ctxData.contextInjection || "",
            ctxData.knowledgeContext || "",
          ].filter(Boolean).join("\n\n");
        }
      } catch (resolveErr) {
        console.warn("[SoW] Could not resolve system prompt for retry consolidation:", resolveErr);
      }
    }

    try {
      if (!retrySystemPrompt) {
        throw new Error("Could not resolve SoW system prompt for retry consolidation");
      }
      let consolidation = "";
      await new Promise<void>((resolve, reject) => {
        streamChunkWorker({
          systemPrompt: retrySystemPrompt!,
          messages: [{ role: "user", content: consolidationPrompt }],
          model: "google/gemini-2.5-pro",
          domainId: "consolidation-retry",
          timeoutMs: SOW_STREAM_TIMEOUT_MS,
          onDelta: (text) => {
            consolidation += text;
            setResult(consolidation);
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
      });

      setResult(consolidation);
      pendingChunkResults.current = null;
      await saveReport(consolidation);
      // Retry succeeded end-to-end — clear idempotency key so the next
      // user-initiated submit starts a fresh run.
      currentRunId.current = null;
      enrichmentContextRef.current = null;
      consolidationAttempts.current = 0;
      setCurrentRunIdValue(null);
      setConsolidationAttemptsThisRun(0);
      setRunPhase("complete");
      setRunPhaseDetail({});
      toast({ title: "Consolidation complete", description: "Report has been consolidated successfully." });
    } catch (err: any) {
      console.error("Retry consolidation failed:", err);
      setRunPhase("timed-out");
      setRunPhaseDetail({ attempt: consolidationAttempts.current });
      toast({ title: "Consolidation failed again", description: "Your batch results are still available.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setDocProcessingStatus(null);
      setOverallProgress(0);
    }
  }, [config, toast, saveReport]);

  // ── Confirm credits ─────────────────────────────────────────────
  const confirmCredits = useCallback(() => {
    setCreditConfirmOpen(false);
    const evt = pendingSubmitEvent.current;
    // Keep the ref set so handleSubmit knows we've confirmed
    handleSubmit(evt || undefined);
  }, [handleSubmit]);

  // ── Wave 15.1 Sufficiency Gate callbacks ───────────────────────
  const onSufficiencyCancel = useCallback(() => {
    setSufficiencyModalOpen(false);
    setPendingSufficiencyResult(null);
    if (sufficiencyGateResolveRef.current) {
      sufficiencyGateResolveRef.current(null);
      sufficiencyGateResolveRef.current = null;
    }
  }, []);

  const onSufficiencyConfirm = useCallback((rationale: string) => {
    setSufficiencyModalOpen(false);
    setPendingSufficiencyResult(null);
    if (sufficiencyGateResolveRef.current) {
      sufficiencyGateResolveRef.current({
        acknowledgedAt: new Date().toISOString(),
        rationale,
      });
      sufficiencyGateResolveRef.current = null;
    }
  }, []);

  return {
    handleSubmit,
    handleCancel,
    handleRetryConsolidation,
    isSubmitting,
    chunkFailureState,
    overallProgress,
    docProcessingStatus,
    extractionStats,
    docItems,
    result,
    setResult,
    savedReportId,
    setSavedReportId,
    filteredFindingsCount,
    sectionValidation,
    setSectionValidation,
    creditConfirmOpen,
    setCreditConfirmOpen,
    pendingCreditBreakdown,
    confirmCredits,
    previousResult,
    showComparison,
    setShowComparison,
    saveReport,
    hasPendingConsolidation: pendingChunkResults.current !== null,
    elapsedSeconds,
    runPhase,
    runPhaseDetail,
    currentRunIdValue,
    chunkRetryRound,
    consolidationAttemptsThisRun,
    preservedSnapshot,
    sufficiencyModalOpen,
    pendingSufficiencyResult,
    onSufficiencyCancel,
    onSufficiencyConfirm,
  };
}


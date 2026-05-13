import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Bot, Loader2, Send, Plus, Trash2, Paperclip, Users, Gift, Coins, Banknote,
  Upload, AlertTriangle, FileUp, Sparkles, FileText, X, Download, MessageSquare,
  FolderOpen, ClipboardList, Mail, ShieldCheck, ListChecks,
  ChevronDown, ChevronRight, MoreHorizontal, MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  type AttachedFile,
  useMultiFileAttachment,
  AttachedFilesBar,
  DropZoneOverlay,
  FileChip,
  formatFileSize,
} from "@/components/AgentChatFileAttachment";
import { useAgentPrefill } from "@/hooks/useAgentPrefill";
import BulkAMLUpload, { type ClassifiedFile, type ExtractedFormData } from "@/components/BulkAMLUpload";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useCredits } from "@/hooks/useCredits";
import { estimateSoWCredits, type SoWCreditBreakdown } from "@/lib/sowCredits";
import EditableReportTab from "@/components/EditableReportTab";
import StructuredSoWReportTab from "@/components/case-workspace/StructuredSoWReportTab";
import QueryFeedbackTab from "@/components/QueryFeedbackTab";
import EnquiryTrackerPanel from "@/components/EnquiryTrackerPanel";
import SoWAssistantPanel from "@/components/SoWAssistantPanel";
import SoWActionSidebar from "@/components/sow/SoWActionSidebar";
import SoWTransactionDialog from "@/components/sow/SoWTransactionDialog";
import SoWCaseHeader from "@/components/sow/SoWCaseHeader";
import SoWSdltAbsentBanner from "@/components/sow/SoWSdltAbsentBanner";

import { supabase } from "@/integrations/supabase/client";
import { extractFilesFromDrop } from "@/lib/folderUpload";
import SoWMissingDocuments, { parseMissingDocuments } from "@/components/sow/SoWMissingDocuments";
import { uploadFilesToCaseFolder, listFolderFiles, saveAssessmentReport } from "@/lib/caseFolders";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { exportInternalReport, exportDraftEmail, exportSoWAll } from "@/lib/docxExport";
import { useAuth } from "@/contexts/AuthContext";

import { Progress } from "@/components/ui/progress";
import SoWPostAnalysisActions from "@/components/sow/SoWPostAnalysisActions";
import SoWComparisonView from "@/components/sow/SoWComparisonView";
import SoWFundingGapCalculator from "@/components/sow/SoWFundingGapCalculator";
import SoWDocCompleteness from "@/components/sow/SoWDocCompleteness";
import { generateLenderSoWPdf } from "@/lib/reportPdf";
import { warmUpEdgeFunction } from "@/lib/edgeFunctionWarmup";
import TimedProgressBar from "@/components/TimedProgressBar";
import SoWRunStatusPanel from "@/components/sow/SoWRunStatusPanel";
import SufficiencyConfirmationModal from "@/components/sow/SufficiencyConfirmationModal";
import { useSoWSubmit, type SoWFormState } from "@/hooks/useSoWSubmit";
import { useConsistencyMatrix } from "@/hooks/useConsistencyMatrix";

// M4 Fix: Import pure functions, types, constants from extracted helpers module
import {
  type PersonDetail,
  type SoWFormUIProps,
  type ExtractionWarning,
  type FundingEvidenceEntry,
  MAX_FILE_SIZE,
  SOW_STREAM_TIMEOUT_MS,
  FUNDING_OPTIONS,
  EMPLOYMENT_OPTIONS,
  RELATIONSHIP_OPTIONS,
  PROFILE_MARKER,
  INTERNAL_MARKER,
  EMAIL_MARKER,
  genId,
  isAllowedFile,
  fileToBase64,
  createPerson,
  truncateForContext,
  parseExtractionWarnings,
  parseSections,
  parseFundingEvidenceSources,
  buildFundingEvidenceMap,
  preProcessDocuments,
  extractEvidenceMap,
  extractArmalytixFormUpdate,
  type ArmalytixFormUpdate,
} from "@/components/sow/sowHelpers";

// ── Assessment ⨯ Compliance Summary merge ──────────────────────────────
// The agent emits two related bodies for SoW: the narrative `client_report`
// (the "assessment") and the structured `internal_report` (the "compliance
// summary"). Most narrative sections overlap, but the structured body holds
// the better-formatted Decision Log, LSAG Auto-Scoring, and Funding Evidence
// Sources tables that reviewers rely on. The whole document is internal —
// the dual-body split is a generation-time scaffold, not a user-facing
// distinction.
//
// Merge rules, in order:
//   1. PRECEDENCE — for the headings listed below, the structured version
//      may REPLACE the assessment version (subject to hierarchy + length-floor
//      guards) so that the better-formatted table wins.
//   2. ALIAS GROUPING — the model emits the same logical section under
//      different titles in the two bodies (e.g. "Section 17: LSAG Compliance
//      Checklist Auto-Scoring" vs "LSAG Compliance Checklist (Internal)").
//      `HEADING_ALIAS_GROUPS` collapses these so the second copy is dropped
//      rather than rendered alongside.
//   3. DROP-DUPLICATES — any structured-body block whose heading (or alias
//      group) is already present in the assessment is dropped, never appended.
//   4. APPEND-NEW — structured-body blocks that have no counterpart in the
//      assessment are appended at the end (preserves the Decision Log,
//      Funding Evidence Sources table, etc.).
const INTERNAL_PRECEDENCE_HEADINGS: RegExp[] = [
  /internal compliance summary/i,
  /compliance summary/i,
  /decision log/i,
  /lsag compliance checklist/i,
  /lsag.*auto[- ]scoring/i,
  /funding evidence sources?/i,
  /aml.*compliance.*dashboard/i,
  /mlro escalation/i,
  /sar consideration/i,
];

// Alias groups: different headings the model uses for the same logical
// section across the two bodies. Keep narrow — only add a group once a
// duplication has been confirmed in real reports.
const HEADING_ALIAS_GROUPS: Record<string, RegExp[]> = {
  lsag_checklist: [
    /lsag.*compliance checklist.*auto[- ]scoring/i,
    /lsag.*compliance checklist.*\(internal\)/i,
    /lsag.*compliance checklist$/i,
    /lsag.*genesis compliance checklist/i,
    /^section\s*17.*lsag/i,
  ],
  funding_gap: [
    /funding gap analysis/i,
    /^section\s*6d/i,
    /^6d\b.*funding gap/i,
  ],
  funding_evidence_sources: [
    /^funding evidence sources?( table)?$/i,
  ],
  compliance_summary: [
    /internal compliance summary/i,
    /^section\s*3.*(internal report|compliance summary)/i,
    /^aml risk rating( &| and)? final assessment/i,
    /^compliance summary$/i,
    /^final assessment$/i,
  ],
  considered_but_not_raised: [
    /considered but not raised/i,
  ],
};

function aliasGroupOf(key: string): string | null {
  if (!key) return null;
  for (const [group, patterns] of Object.entries(HEADING_ALIAS_GROUPS)) {
    if (patterns.some((re) => re.test(key))) return group;
  }
  return null;
}

interface ReportBlock {
  /** Original heading line incl. leading `#`s, trailing newline trimmed. */
  headingLine: string;
  /** Heading depth (number of leading `#`s, 1–6). */
  level: number;
  /** Normalised heading text used as the merge key. */
  key: string;
  /** Body text below the heading, up to the next heading. */
  body: string;
}

function normaliseHeading(headingText: string): string {
  return headingText
    .toLowerCase()
    .replace(/^#+\s*/, "")
    .replace(/^section\s+\d+\s*[-–—:.)]\s*/i, "")
    .replace(/^\d+\s*[.)]\s*/, "")
    .replace(/\s*\(section\s+\d+\)\s*$/i, "")
    .replace(/[*_`]+/g, "")
    .replace(/[\s—–-]+/g, " ")
    .replace(/[.:;,!?]+$/g, "")
    .trim();
}

function splitIntoBlocks(body: string): { preamble: string; blocks: ReportBlock[] } {
  if (!body) return { preamble: "", blocks: [] };
  // Match heading lines (h1–h6). Capture index so we can slice bodies.
  const headingRegex = /^(#{1,6})\s+(.+?)\s*$/gm;
  const matches: { idx: number; len: number; line: string; level: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(body)) !== null) {
    matches.push({ idx: m.index, len: m[0].length, line: m[0], level: m[1].length, text: m[2] });
  }
  if (matches.length === 0) return { preamble: body, blocks: [] };
  const preamble = body.slice(0, matches[0].idx);
  const blocks: ReportBlock[] = matches.map((mm, i) => {
    const bodyStart = mm.idx + mm.len;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].idx : body.length;
    return {
      headingLine: mm.line,
      level: mm.level,
      key: normaliseHeading(mm.text),
      body: body.slice(bodyStart, bodyEnd).replace(/^\n+/, "").replace(/\s+$/, ""),
    };
  });
  return { preamble, blocks };
}

/**
 * Decide whether `extra` is a substantive enough rendering to REPLACE the
 * primary block, or whether it is a brief recap that should be appended
 * instead. Rules:
 *   - If primary contains a markdown table but extra does not, do not replace
 *     (extra is a textual recap of a tabular section).
 *   - Otherwise require extra body length to be ≥ 60% of primary body length.
 *   - Empty extra never replaces.
 */
function isSubstantiveReplacement(primaryBody: string, extraBody: string): boolean {
  const eb = extraBody.trim();
  if (!eb) return false;
  const pb = primaryBody.trim();
  if (!pb) return true;
  const primaryHasTable = /^\s*\|.+\|\s*$/m.test(pb);
  const extraHasTable = /^\s*\|.+\|\s*$/m.test(eb);
  if (primaryHasTable && !extraHasTable) return false;
  return eb.length >= Math.floor(pb.length * 0.6);
}

function mergeReportSections(primary: string, extra: string): string {
  if (!extra || !extra.trim()) return primary;
  if (!primary || !primary.trim()) return extra;

  const primaryParsed = splitIntoBlocks(primary);
  const extraParsed = splitIntoBlocks(extra);

  // No headings to merge against — fall back to primary unchanged.
  if (primaryParsed.blocks.length === 0) return primary;

  // Build lookups of extra blocks by both exact key AND alias group, so the
  // merger can match e.g. assessment "Section 17: LSAG ... Auto-Scoring"
  // against structured "LSAG Compliance Checklist (Internal)".
  // Last-wins on duplicates within the same body.
  const extraByKey = new Map<string, ReportBlock>();
  const extraByGroup = new Map<string, ReportBlock>();
  for (const b of extraParsed.blocks) {
    if (!b.key) continue;
    extraByKey.set(b.key, b);
    const group = aliasGroupOf(b.key);
    if (group) extraByGroup.set(group, b);
  }

  const primaryKeys = new Set(primaryParsed.blocks.map((b) => b.key));
  const primaryGroups = new Set(
    primaryParsed.blocks.map((b) => aliasGroupOf(b.key)).filter((g): g is string => !!g),
  );
  const usedExtraKeys = new Set<string>();

  // Walk primary blocks; for precedence-listed headings, attempt replacement
  // from the structured body. Replacement is permitted by exact key OR by
  // alias group, subject to the hierarchy + length-floor guards.
  const mergedBlocks = primaryParsed.blocks.map((block) => {
    const isPrecedence = INTERNAL_PRECEDENCE_HEADINGS.some((re) => re.test(block.key));
    if (!isPrecedence) return block;
    const group = aliasGroupOf(block.key);
    const replacement = extraByKey.get(block.key) || (group ? extraByGroup.get(group) : undefined);
    if (!replacement) return block;
    // Hierarchy guard: a deeper extra heading is a child recap, not a peer.
    if (replacement.level > block.level) return block;
    // Length-floor guard: short recaps must not overwrite full tables.
    if (!isSubstantiveReplacement(block.body, replacement.body)) {
      // Even when we don't replace, mark the extra block as used so it is
      // not appended at the end as a visible duplicate of the primary.
      usedExtraKeys.add(replacement.key);
      return block;
    }
    usedExtraKeys.add(replacement.key);
    return { ...block, body: replacement.body };
  });

  // Append extra blocks whose heading (and alias group) is not present in
  // primary. If a precedence-listed heading already exists in primary —
  // either by exact key or by alias group — we DROP the extra copy. The
  // primary version remains canonical in its original position; appending
  // the extra would visibly duplicate the section.
  const appendBlocks: ReportBlock[] = [];
  for (const eb of extraParsed.blocks) {
    if (!eb.key) continue;
    if (usedExtraKeys.has(eb.key)) continue;
    if (primaryKeys.has(eb.key)) continue; // already present in primary — drop
    const ebGroup = aliasGroupOf(eb.key);
    if (ebGroup && primaryGroups.has(ebGroup)) continue; // alias of an existing primary section — drop
    appendBlocks.push(eb);
  }

  const renderBlocks = (blocks: ReportBlock[]): string =>
    blocks.map((b) => `${b.headingLine}\n\n${b.body}`.trimEnd()).join("\n\n");

  const mainBody = `${primaryParsed.preamble.trimEnd()}${primaryParsed.preamble.trim() ? "\n\n" : ""}${renderBlocks(mergedBlocks)}`.trim();
  if (appendBlocks.length === 0) return mainBody;
  return `${mainBody}\n\n${renderBlocks(appendBlocks)}`.trim();
}

// ── Component ──────────────────────────────────────────────────────────
export default function SoWFormUI({ agentId, agentName, streamChat }: SoWFormUIProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const {
    selectedCaseId,
    prefillData,
    loadingParties,
  } = useAgentPrefill();
  const { data: credits } = useCredits();

  // H5 Fix: Warm up edge function container on mount so analysis doesn't hit cold start
  useEffect(() => { warmUpEdgeFunction(); }, []);

  // ── Audit logging helper ─────────────────────────────────────────
  const logAuditEvent = useCallback(async (eventType: string, caseRef?: string, metadata?: Record<string, any>) => {
    if (!profile) return;
    try {
      await supabase.from("audit_log").insert({
        case_reference: caseRef || null,
        user_id: profile.user_id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position || "",
        event_type: eventType,
        metadata: metadata || null,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }
  }, [profile]);

  // Transaction fields
  const [propertyAddress, setPropertyAddress] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [tenure, setTenure] = useState("");
  const [stampDuty, setStampDuty] = useState("");
  const [legalFees, setLegalFees] = useState("");
  const [mortgageAmount, setMortgageAmount] = useState("");
  const [clientFundsToVerify, setClientFundsToVerify] = useState("");
  const [transactionType, setTransactionType] = useState("Purchase");
  const [propertyType, setPropertyType] = useState("");
  const [lender, setLender] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [armalytixFilledFields, setArmalytixFilledFields] = useState<Set<string>>(new Set());
  const [additionalContext, setAdditionalContext] = useState("");
  const [riskClassification, setRiskClassification] = useState("");

  const peoplePrefilledForCase = useRef<string | null>(null);
  const partiesLoadStarted = useRef(false);

  // Dialog states
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  

  const [pendingExtraction, setPendingExtraction] = useState<ExtractedFormData | null>(null);
  const [pendingArmalytixUpdate, setPendingArmalytixUpdate] = useState<ArmalytixFormUpdate | null>(null);

  // Track files already persisted to case storage so we don't re-upload at analysis time
  const savedFileNames = useRef<Set<string>>(new Set());

  // Track when loadingParties goes true
  useEffect(() => {
    if (loadingParties && selectedCaseId) {
      partiesLoadStarted.current = true;
    }
  }, [loadingParties, selectedCaseId]);

  useEffect(() => {
    if (selectedCaseId && prefillData.propertyAddress) {
      if (!propertyAddress) setPropertyAddress(prefillData.propertyAddress);
      if (!caseReference) setCaseReference(prefillData.caseReference);
      if (!tenure) setTenure(prefillData.tenure || "");
      if (!purchasePrice) setPurchasePrice(prefillData.purchasePrice || "");
      if (!stampDuty) setStampDuty(prefillData.stampDuty || "");
      if (!legalFees) setLegalFees(prefillData.legalFees || "");
      if (!transactionType && prefillData.transactionType) setTransactionType(prefillData.transactionType);
      if (!propertyType && prefillData.propertyType) setPropertyType(prefillData.propertyType);
      if (!lender && prefillData.lender) setLender(prefillData.lender);
      if (!additionalContext && prefillData.aiContextNotes?.["source-of-wealth"]) {
        setAdditionalContext(prefillData.aiContextNotes["source-of-wealth"]);
      }
      setPrefilled(true);
    } else if (!selectedCaseId && prefilled) {
      setPropertyAddress(""); setCaseReference(""); setTenure("");
      setPurchasePrice(""); setStampDuty(""); setLegalFees("");
      setTransactionType("Purchase"); setPropertyType(""); setLender("");
      setPurchasers([createPerson("Purchaser")]); setHasGiftors(false); setGiftors([]);
      setPrefilled(false);
      peoplePrefilledForCase.current = null;
      partiesLoadStarted.current = false;
    }

    if (!selectedCaseId || loadingParties) return;
    if (peoplePrefilledForCase.current === selectedCaseId) return;
    if (!partiesLoadStarted.current) return;

    const hasUserEnteredPurchasers = purchasers.some((p) => p.fullName.trim());
    const hasUserEnteredGiftors = giftors.some((g) => g.fullName.trim());

    const pepMap: Record<string, string> = {
      unknown: "Unknown", not_pep: "Not a PEP", pep: "PEP",
      pep_family: "PEP Family Member", pep_associate: "PEP Close Associate",
    };

     const mappedPurchasers = (prefillData.purchasers || [])
      .filter((p) => p.full_name?.trim())
      .map((p) => ({
        ...createPerson("Purchaser"),
        fullName: p.full_name,
        pepStatus: pepMap[p.pep_status] || "Unknown",
        buyerType: (p as any).buyer_type || "Standard",
        raiseEnquiryFunding: p.raise_enquiry_funding ?? false,
        raiseEnquiryEmployment: p.raise_enquiry_employment ?? false,
      }));

    const mappedGiftors = (prefillData.giftors || [])
      .filter((p) => p.full_name?.trim())
      .map((p) => ({
        ...createPerson("Giftor"),
        fullName: p.full_name,
        relationshipToPurchaser: p.relationship_to_purchaser || "",
        pepStatus: pepMap[p.pep_status] || "Unknown",
        raiseEnquiryFunding: p.raise_enquiry_funding ?? false,
        raiseEnquiryEmployment: p.raise_enquiry_employment ?? false,
      }));

    if (!hasUserEnteredPurchasers && mappedPurchasers.length > 0) setPurchasers(mappedPurchasers);
    if (!hasUserEnteredGiftors && mappedGiftors.length > 0) { setHasGiftors(true); setGiftors(mappedGiftors); }

    peoplePrefilledForCase.current = selectedCaseId;
  }, [selectedCaseId, loadingParties, prefillData]);

  // Persons
  const [purchasers, setPurchasers] = useState<PersonDetail[]>([createPerson("Purchaser")]);
  const [hasGiftors, setHasGiftors] = useState(false);
  const [giftors, setGiftors] = useState<PersonDetail[]>([]);

  // Shared files
  const { attachedFiles, fileInputRef, handleFileSelect, removeFile, clearFiles, processFiles, addAttachedFiles } = useMultiFileAttachment();

  // Background save: persist files to case-documents/aml-sow immediately on upload
  const saveFilesToCaseInBackground = useCallback((files: { name: string; base64: string; mimeType: string }[]) => {
    if (!selectedCaseId || files.length === 0) return;
    // Fire-and-forget — don't block the UI
    uploadFilesToCaseFolder(files, selectedCaseId, "aml-sow")
      .then(({ copied, failed, succeededNames }) => {
        // Only mark individually succeeded files — prevents false "saved" on partial failures
        for (const name of succeededNames) {
          savedFileNames.current.add(name);
        }
        if (copied > 0) {
          queryClient.invalidateQueries({ queryKey: ["case-folder-files", selectedCaseId, "aml-sow"] });
          queryClient.invalidateQueries({ queryKey: ["case-folder-counts", selectedCaseId] });
        }
        if (failed > 0) console.warn(`[SoW bg-save] ${failed} file(s) failed`);
      })
      .catch(err => console.warn("[SoW bg-save] error:", err));
  }, [selectedCaseId, queryClient]);

  // Auto-save shared files when they are added via file input
  const prevAttachedCount = useRef(0);
  useEffect(() => {
    if (attachedFiles.length > prevAttachedCount.current) {
      const newFiles = attachedFiles.slice(prevAttachedCount.current);
      saveFilesToCaseInBackground(newFiles.map(f => ({ name: f.name, base64: f.base64, mimeType: f.mimeType })));
    }
    prevAttachedCount.current = attachedFiles.length;
  }, [attachedFiles, saveFilesToCaseInBackground]);

  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 0 });

  // Bulk upload busy state
  const [bulkBusy, setBulkBusy] = useState(false);

  // UI-only state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [activeOutputTab, setActiveOutputTab] = useState("files");
  const outputTabsCardRef = useRef<HTMLDivElement>(null);
  const analysisStartTime = useRef<number>(0);

  // ── Hook: submission orchestration (M2 extraction) ──────────────
  const {
    handleSubmit, handleCancel, handleRetryConsolidation,
    isSubmitting, chunkFailureState, overallProgress, docProcessingStatus,
    extractionStats, docItems, result, setResult, savedReportId, setSavedReportId,
    filteredFindingsCount, sectionValidation, setSectionValidation, creditConfirmOpen, setCreditConfirmOpen,
    pendingCreditBreakdown, confirmCredits, previousResult,
    showComparison, setShowComparison, saveReport, hasPendingConsolidation,
    runPhase, runPhaseDetail, currentRunIdValue, chunkRetryRound,
    consolidationAttemptsThisRun, elapsedSeconds, preservedSnapshot,
    sufficiencyModalOpen, pendingSufficiencyResult, onSufficiencyCancel, onSufficiencyConfirm,
  } = useSoWSubmit({
    agentId,
    streamChat,
    selectedCaseId,
    attachedFiles,
    formState: {
      propertyAddress, purchasePrice, caseReference, tenure, stampDuty,
      legalFees, mortgageAmount, clientFundsToVerify, transactionType,
      propertyType, lender, additionalContext, riskClassification,
      purchasers, hasGiftors, giftors,
    },
    prefillData,
    savedFileNames,
    logAuditEvent,
    openTransactionDialog: () => { setTransactionDialogOpen(true); },
  });
  const isLoading = isSubmitting; // Alias for JSX backward compat

  // Track analysis start for progress bar
  useEffect(() => {
    if (isSubmitting) analysisStartTime.current = Date.now();
  }, [isSubmitting]);

  // ── LSAG Consistency Matrix (live derivation over persisted sow_* rows) ──
  const consistencyMatrixQuery = useConsistencyMatrix(selectedCaseId);
  const matrixData = consistencyMatrixQuery.data;

  // Refresh the matrix when an assessment run completes — sow_* rows may have
  // changed during the run (e.g. new fund sources, reclassifications).
  useEffect(() => {
    if (runPhase === "complete" && selectedCaseId) {
      queryClient.invalidateQueries({
        queryKey: ["consistency-matrix", selectedCaseId],
      });
    }
  }, [runPhase, selectedCaseId, queryClient]);

  // ── localStorage draft persistence (keyed by caseId) ─────────────
  const DRAFT_KEY_PREFIX = "ls_sow_draft_";
  const draftRestoredRef = useRef<string | null>(null);

  // Restore draft on case selection — deferred until DB prefill settles (C3 fix)
  const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  useEffect(() => {
    if (!selectedCaseId || draftRestoredRef.current === selectedCaseId) return;
    // C3 Fix: Wait for DB prefill to complete before restoring localStorage
    // This prevents stale cached values from shadowing fresh DB data
    if (loadingParties) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY_PREFIX + selectedCaseId);
      if (!raw) {
        draftRestoredRef.current = selectedCaseId;
        return;
      }
      const d = JSON.parse(raw);
      // C2 Fix: Skip expired drafts
      if (d.ts && Date.now() - d.ts > DRAFT_TTL_MS) {
        localStorage.removeItem(DRAFT_KEY_PREFIX + selectedCaseId);
        draftRestoredRef.current = selectedCaseId;
        return;
      }
      // C1/C3 Fix: Only restore fields the user manually entered — skip if DB prefill already populated
      if (d.clientFundsToVerify && !clientFundsToVerify) setClientFundsToVerify(d.clientFundsToVerify);
      if (d.mortgageAmount && !mortgageAmount) setMortgageAmount(d.mortgageAmount);
      if (d.additionalContext && !additionalContext) setAdditionalContext(d.additionalContext);
      if (d.riskClassification && !riskClassification) setRiskClassification(d.riskClassification);
      // Skip fields that are populated by DB prefill (purchasePrice, stampDuty, legalFees, propertyType, lender)
      // — only restore if DB had no value
      if (d.stampDuty && !stampDuty) setStampDuty(d.stampDuty);
      if (d.legalFees && !legalFees) setLegalFees(d.legalFees);
      if (d.propertyType && !propertyType) setPropertyType(d.propertyType);
      if (d.lender && !lender) setLender(d.lender);
      // Don't restore purchasers/giftors if DB prefill already populated them
      if (d.purchasers?.length && purchasers.length === 1 && !purchasers[0].fullName.trim()) {
        setPurchasers(d.purchasers.map((p: any) => ({ ...createPerson(p.role || "Purchaser"), ...p, files: [] })));
      }
      if (d.hasGiftors && d.giftors?.length && giftors.length === 0) {
        setHasGiftors(true);
        setGiftors(d.giftors.map((g: any) => ({ ...createPerson("Giftor"), ...g, files: [] })));
      }
      // Restore AI output
      if (d.result && !result) setResult(d.result);
      if (d.savedReportId) setSavedReportId(d.savedReportId);
      draftRestoredRef.current = selectedCaseId;
    } catch { /* corrupt cache — ignore */ }
  }, [selectedCaseId, loadingParties]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed a firm-specific knowledge-base clause into Additional Context when the
  // box is otherwise empty (no CMS prefill, no restored draft, no manual entry).
  // Runs once per case so clearing the textarea does not re-inject the clause.
  const firmDefaultAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCaseId || loadingParties) return;
    if (!prefilled && !!prefillData.propertyAddress) return; // wait for DB prefill
    if (draftRestoredRef.current !== selectedCaseId) return; // wait for draft restore
    if (firmDefaultAppliedFor.current === selectedCaseId) return;
    firmDefaultAppliedFor.current = selectedCaseId;
    const firm = (profile?.firm_name || "").trim();
    const clause = firm
      ? `The analysis should use the ${firm} knowledge base information.`
      : `The analysis should use the firm's knowledge base information.`;
    // Append the clause if it isn't already present, so AI-generated context
    // notes (or any restored draft) don't suppress the firm KB instruction.
    setAdditionalContext((prev) => {
      const current = (prev || "").trim();
      if (!current) return clause;
      if (/knowledge base/i.test(current)) return prev;
      return `${prev}\n\n${clause}`;
    });
  }, [selectedCaseId, loadingParties, prefilled, prefillData.propertyAddress, profile?.firm_name, additionalContext]);

  // Persist draft on changes (debounced via ref to avoid excessive writes)
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!selectedCaseId) return;
    clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      try {
        const draft = {
          clientFundsToVerify, mortgageAmount, additionalContext, riskClassification,
          stampDuty, legalFees, propertyType, lender,
          purchasers: purchasers.map(({ files, ...rest }) => rest),
          hasGiftors,
          giftors: giftors.map(({ files, ...rest }) => rest),
          result: result.slice(0, 500_000), // cap to avoid quota issues
          savedReportId,
          ts: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY_PREFIX + selectedCaseId, JSON.stringify(draft));
      } catch { /* quota — non-critical */ }
    }, 1500);
    return () => clearTimeout(draftSaveTimer.current);
  }, [selectedCaseId, clientFundsToVerify, mortgageAmount, additionalContext, riskClassification,
      stampDuty, legalFees, propertyType, lender, purchasers, hasGiftors, giftors, result, savedReportId]);


  const sections = parseSections(result);
  const extractionWarnings = useMemo(() => parseExtractionWarnings(result), [result]);
  const hasResults = !!result;

  // ── Detect Armalytix form update in AI result ──────────────────
  useEffect(() => {
    if (!result || result.length < 500) return;
    if (isSubmitting) return;
    const update = extractArmalytixFormUpdate(result);
    if (update && !pendingArmalytixUpdate) {
      // Auto-apply immediately instead of requiring user click
      applyArmalytixUpdate(update);
    }
  }, [result, isSubmitting]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyArmalytixUpdate = useCallback((update: ArmalytixFormUpdate) => {
    const filled = new Set<string>();

    if (update.purchase_price != null && !purchasePrice) { setPurchasePrice(String(update.purchase_price)); filled.add("purchasePrice"); }
    if (update.mortgage_amount != null) { setMortgageAmount(String(update.mortgage_amount)); filled.add("mortgageAmount"); }
    if (update.mortgage_lender && !lender) { setLender(update.mortgage_lender); filled.add("lender"); }
    if (update.stamp_duty != null) { setStampDuty(String(update.stamp_duty)); filled.add("stampDuty"); }
    if (update.tenure && !tenure) { setTenure(update.tenure); filled.add("tenure"); }
    if (update.property_type && !propertyType) { setPropertyType(update.property_type); filled.add("propertyType"); }

    // Update person details from Armalytix
    if (update.persons && update.persons.length > 0) {
      const updatedPurchasers = [...purchasers];
      for (const ap of update.persons) {
        if (ap.role !== "purchaser") continue;
        const match = updatedPurchasers.find(
          (p) => p.fullName.trim().toLowerCase() === ap.full_name.trim().toLowerCase()
        );
        if (match) {
          if (ap.employer && !match.additionalNotes) match.additionalNotes = `Employer: ${ap.employer}`;
          if (ap.funding_source && !match.fundingSource) match.fundingSource = ap.funding_source;
          if (ap.contribution_amount != null && !match.contributionAmount)
            match.contributionAmount = String(ap.contribution_amount);
          if (ap.employment_status && !match.employmentStatus)
            match.employmentStatus = ap.employment_status;
        }
      }
      setPurchasers(updatedPurchasers);
    }

    if (filled.size > 0) {
      setArmalytixFilledFields(prev => new Set([...prev, ...filled]));
    }

    setPendingArmalytixUpdate(null);
    toast({ title: "Armalytix data applied", description: "Mortgage, stamp duty and other fields auto-populated from the report." });
  }, [purchasePrice, mortgageAmount, lender, stampDuty, tenure, propertyType, purchasers, toast]);

  // Funding evidence source map — parsed from internal report
  const fundingEvidenceMap = useMemo(
    () => buildFundingEvidenceMap(parseFundingEvidenceSources(sections.internalReport)),
    [sections.internalReport]
  );

  // ── Person merge helpers ─────────────────────────────────────────
  const normaliseName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

  const mergePersonFields = (existing: PersonDetail, incoming: PersonDetail): PersonDetail => ({
    ...existing,
    fullName: existing.fullName || incoming.fullName,
    fundingSource: existing.fundingSource || incoming.fundingSource,
    fundingSourceOther: existing.fundingSourceOther || incoming.fundingSourceOther,
    contributionAmount: existing.contributionAmount || incoming.contributionAmount,
    employmentStatus: existing.employmentStatus || incoming.employmentStatus,
    employmentStatusOther: existing.employmentStatusOther || incoming.employmentStatusOther,
    additionalNotes: existing.additionalNotes && incoming.additionalNotes && existing.additionalNotes !== incoming.additionalNotes
      ? `${existing.additionalNotes}; ${incoming.additionalNotes}`
      : existing.additionalNotes || incoming.additionalNotes,
    relationshipToPurchaser: existing.relationshipToPurchaser || incoming.relationshipToPurchaser,
    relationshipOther: existing.relationshipOther || incoming.relationshipOther,
  });

  const mergeExtractedPersons = useCallback((persons: any[]) => {
    const buildPerson = (p: any): PersonDetail => ({
      id: genId(),
      fullName: p.fullName || "",
      role: p.role === "Giftor" ? "Giftor" : "Purchaser",
      fundingSource: FUNDING_OPTIONS.includes(p.fundingSource) ? p.fundingSource : (p.fundingSource ? "Other" : ""),
      fundingSourceOther: FUNDING_OPTIONS.includes(p.fundingSource) ? "" : (p.fundingSource || ""),
      contributionAmount: p.contributionAmount || "",
      employmentStatus: EMPLOYMENT_OPTIONS.includes(p.employmentStatus) ? p.employmentStatus : (p.employmentStatus ? "Other" : ""),
      employmentStatusOther: EMPLOYMENT_OPTIONS.includes(p.employmentStatus) ? "" : (p.employmentStatus || ""),
      additionalNotes: p.additionalNotes || "",
      relationshipToPurchaser: p.role === "Giftor" ? (RELATIONSHIP_OPTIONS.includes(p.relationshipToPurchaser) ? p.relationshipToPurchaser : (p.relationshipToPurchaser ? "Other" : "")) : "",
      relationshipOther: p.role === "Giftor" && !RELATIONSHIP_OPTIONS.includes(p.relationshipToPurchaser) ? (p.relationshipToPurchaser || "") : "",
      files: [],
      raiseEnquiryFunding: false,
      raiseEnquiryEmployment: false,
      pepStatus: "Unknown",
      buyerType: "Standard",
    });

    const extractedPurchasers = persons.filter((p) => p.role !== "Giftor").map(buildPerson);
    const extractedGiftors = persons.filter((p) => p.role === "Giftor").map(buildPerson);

    const mergeInto = (existing: PersonDetail[], incoming: PersonDetail[]): PersonDetail[] => {
      const result = [...existing];
      for (const inc of incoming) {
        const normInc = normaliseName(inc.fullName);
        if (!normInc) { result.push(inc); continue; }
        const matchIdx = result.findIndex((ex) => normaliseName(ex.fullName) === normInc);
        if (matchIdx !== -1) {
          result[matchIdx] = mergePersonFields(result[matchIdx], inc);
        } else {
          result.push(inc);
        }
      }
      return result;
    };

    if (extractedPurchasers.length > 0) {
      setPurchasers((prev) => {
        const isEmpty = prev.length === 1 && !prev[0].fullName.trim();
        return isEmpty ? extractedPurchasers : mergeInto(prev, extractedPurchasers);
      });
    }
    if (extractedGiftors.length > 0) {
      setHasGiftors(true);
      setGiftors((prev) => mergeInto(prev, extractedGiftors));
    }
  }, []);

  // ── Drag-and-drop ────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragging(false);

    toast({ title: "Scanning dropped folder…", description: "Detecting files, please wait." });

    const result = await extractFilesFromDrop(e);

    if (result.guidanceMessage) {
      toast({
        title: result.limitExceeded
          ? `Too many files (${result.detectedCount} detected)`
          : "Upload issue",
        description: result.guidanceMessage,
        variant: "destructive",
      });
      return;
    }

    if (result.zipErrors.length > 0) {
      toast({ title: "Upload issue", description: result.zipErrors[0], variant: "destructive" });
    }
    if (result.files.length > 0) {
      await processFiles(result.files);
      // Save to case files in background
      const filesToSave: { name: string; base64: string; mimeType: string }[] = [];
      for (const file of Array.from(result.files)) {
        if (isAllowedFile(file) && file.size <= MAX_FILE_SIZE) {
          try {
            const b64 = await fileToBase64(file);
            filesToSave.push({ name: file.name, base64: b64, mimeType: file.type || "application/octet-stream" });
          } catch { /* skip */ }
        }
      }
      saveFilesToCaseInBackground(filesToSave);
    } else if (result.zipErrors.length === 0) {
      toast({ title: "No supported files found", description: "The folder may be empty or contain unsupported file types. Use the 'Upload Folder' button for larger batches.", variant: "destructive" });
    }
  }, [processFiles, toast, saveFilesToCaseInBackground]);

  // ── Person management ────────────────────────────────────────────
  const addPurchaser = useCallback(() => setPurchasers((prev) => [...prev, createPerson("Purchaser")]), []);
  const removePurchaser = useCallback((id: string) => setPurchasers((prev) => prev.filter((p) => p.id !== id)), []);
  const updatePurchaser = useCallback((id: string, field: keyof PersonDetail, value: any) => {
    setPurchasers((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }, []);
  const addGiftor = useCallback(() => setGiftors((prev) => [...prev, createPerson("Giftor")]), []);
  const removeGiftor = useCallback((id: string) => setGiftors((prev) => prev.filter((p) => p.id !== id)), []);
  const updateGiftor = useCallback((id: string, field: keyof PersonDetail, value: any) => {
    setGiftors((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }, []);
  const handleGiftorToggle = useCallback((checked: boolean) => {
    setHasGiftors(checked);
    if (checked && giftors.length === 0) setGiftors([createPerson("Giftor")]);
  }, [giftors.length]);

  // ── Per-person file upload ───────────────────────────────────────
  const handlePersonFileUpload = useCallback(async (
    personId: string,
    role: "Purchaser" | "Giftor",
    files: FileList,
    docCategory?: string
  ) => {
    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      if (!isAllowedFile(file)) { toast({ title: `Unsupported: ${file.name}`, variant: "destructive" }); continue; }
      if (file.size > MAX_FILE_SIZE) { toast({ title: `Too large: ${file.name}`, variant: "destructive" }); continue; }
      try {
        const base64 = await fileToBase64(file);
        const attached: AttachedFile & { docCategory?: string } = { id: genId(), name: file.name, mimeType: file.type || "application/octet-stream", base64, size: file.size };
        if (docCategory) (attached as any).docCategory = docCategory;
        newFiles.push(attached);
      } catch { toast({ title: "Error", description: `Failed to read ${file.name}.`, variant: "destructive" }); }
    }
    if (newFiles.length === 0) return;
    const updater = role === "Purchaser" ? setPurchasers : setGiftors;
    updater((prev) => prev.map((p) =>
      p.id === personId ? { ...p, files: [...p.files, ...newFiles] } : p
    ));
    // Save to case files in background
    saveFilesToCaseInBackground(newFiles.map(f => ({ name: f.name, base64: f.base64, mimeType: f.mimeType })));
  }, [toast, saveFilesToCaseInBackground]);

  const removePersonFile = useCallback((personId: string, fileId: string, role: "Purchaser" | "Giftor") => {
    const updater = role === "Purchaser" ? setPurchasers : setGiftors;
    updater((prev) => prev.map((p) =>
      p.id === personId ? { ...p, files: p.files.filter((f) => f.id !== fileId) } : p
    ));
  }, []);

  // ── Bulk AML classification handler ──────────────────────────────
  const handleBulkClassified = useCallback((classified: ClassifiedFile[]) => {
    for (const cf of classified) {
      if (!cf.readable) continue;
      const matchPerson = (persons: PersonDetail[]): string | null => {
        if (!cf.personName) return null;
        const normTarget = cf.personName.trim().toLowerCase();
        const match = persons.find((p) => p.fullName.trim().toLowerCase() === normTarget);
        return match?.id || null;
      };

      const purchaserMatch = matchPerson(purchasers);
      const giftorMatch = hasGiftors ? matchPerson(giftors) : null;

      if (purchaserMatch) {
        setPurchasers((prev) => prev.map((p) =>
          p.id === purchaserMatch ? { ...p, files: [...p.files, cf.file] } : p
        ));
      } else if (giftorMatch) {
        setGiftors((prev) => prev.map((p) =>
          p.id === giftorMatch ? { ...p, files: [...p.files, cf.file] } : p
        ));
      } else {
        // No person match — add as shared document so it appears in the Files tab
        addAttachedFiles([cf.file]);
      }
    }
    // Save all classified files to case files in background
    const filesToSave = classified
      .filter(cf => cf.readable)
      .map(cf => ({ name: cf.file.name, base64: cf.file.base64, mimeType: cf.file.mimeType }));
    saveFilesToCaseInBackground(filesToSave);
    toast({
      title: "Documents classified",
      description: `${classified.filter(c => c.readable).length} document(s) processed and routed.`,
    });
  }, [purchasers, giftors, hasGiftors, toast, addAttachedFiles, saveFilesToCaseInBackground]);

  // ── Form extraction handler ──────────────────────────────────────
  const handleFormExtracted = useCallback((data: ExtractedFormData) => {
    setPendingExtraction(data);
  }, []);

  const applyExtractedData = useCallback(() => {
    if (!pendingExtraction) return;
    const d = pendingExtraction;
    const filled = new Set<string>();

    if (d.propertyAddress) setPropertyAddress(d.propertyAddress);
    if (d.purchasePrice) setPurchasePrice(d.purchasePrice);
    if (d.mortgageAmount) { setMortgageAmount(d.mortgageAmount); filled.add("mortgageAmount"); }
    if (d.caseReference) setCaseReference(d.caseReference);
    if (d.tenure) setTenure(d.tenure);
    if (d.stampDuty) { setStampDuty(d.stampDuty); filled.add("stampDuty"); }
    if (d.legalFees) setLegalFees(d.legalFees);
    if (d.additionalContext) setAdditionalContext((prev) => prev ? `${prev}\n${d.additionalContext}` : d.additionalContext);

    if (filled.size > 0) {
      setArmalytixFilledFields(prev => new Set([...prev, ...filled]));
    }

    if (d.purchasers && d.purchasers.length > 0) {
      const mapped = d.purchasers.map((p) => ({
        ...createPerson("Purchaser" as const),
        fullName: p.fullName,
        fundingSource: FUNDING_OPTIONS.includes(p.fundingSource) ? p.fundingSource : (p.fundingSource ? "Other" : ""),
        fundingSourceOther: FUNDING_OPTIONS.includes(p.fundingSource) ? "" : (p.fundingSource || ""),
        contributionAmount: p.contributionAmount || "",
        employmentStatus: EMPLOYMENT_OPTIONS.includes(p.employmentStatus) ? p.employmentStatus : (p.employmentStatus ? "Other" : ""),
        employmentStatusOther: EMPLOYMENT_OPTIONS.includes(p.employmentStatus) ? "" : (p.employmentStatus || ""),
        additionalNotes: p.additionalNotes || "",
      }));
      setPurchasers(mapped);
    }

    if (d.hasGiftors && d.giftors && d.giftors.length > 0) {
      setHasGiftors(true);
      const mapped = d.giftors.map((g) => ({
        ...createPerson("Giftor" as const),
        fullName: g.fullName,
        fundingSource: FUNDING_OPTIONS.includes(g.fundingSource) ? g.fundingSource : (g.fundingSource ? "Other" : ""),
        fundingSourceOther: FUNDING_OPTIONS.includes(g.fundingSource) ? "" : (g.fundingSource || ""),
        contributionAmount: g.contributionAmount || "",
        employmentStatus: EMPLOYMENT_OPTIONS.includes(g.employmentStatus) ? g.employmentStatus : (g.employmentStatus ? "Other" : ""),
        employmentStatusOther: EMPLOYMENT_OPTIONS.includes(g.employmentStatus) ? "" : (g.employmentStatus || ""),
        additionalNotes: g.additionalNotes || "",
        relationshipToPurchaser: RELATIONSHIP_OPTIONS.includes(g.relationshipToPurchaser) ? g.relationshipToPurchaser : (g.relationshipToPurchaser ? "Other" : ""),
        relationshipOther: RELATIONSHIP_OPTIONS.includes(g.relationshipToPurchaser) ? "" : (g.relationshipToPurchaser || ""),
      }));
      setGiftors(mapped);
    }

    setPendingExtraction(null);
    toast({ title: "Form auto-filled", description: "All fields populated from documents. Please review." });
    logAuditEvent("sow_form_autofilled", caseReference || undefined, {
      purchasers_extracted: d.purchasers?.length || 0,
      giftors_extracted: d.giftors?.length || 0,
      judge_approved: d.judgeApproved,
      corrections_count: d.corrections?.length || 0,
    });
  }, [pendingExtraction, toast, logAuditEvent, caseReference]);



  // ── Incremental missing document upload ──────────────────────────
  const [incrementalUploading, setIncrementalUploading] = useState<string | null>(null);
  const [incrementalUploaded, setIncrementalUploaded] = useState<Set<string>>(new Set());

  const handleUploadMissing = useCallback(async (file: File, category: string, label: string) => {
    if (!selectedCaseId || !result) {
      toast({ title: "No report", description: "Run a full assessment first.", variant: "destructive" });
      return;
    }

    // Validate file
    if (!isAllowedFile(file)) {
      toast({ title: "Unsupported file type", description: `${file.name} is not a supported file format.`, variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: `${file.name} exceeds the 100MB limit.`, variant: "destructive" });
      return;
    }

    // Credit check (1 credit per incremental doc)
    if (credits != null && credits.balance < 1) {
      toast({ title: "Insufficient Credits", description: "Incremental updates require 1 credit.", variant: "destructive" });
      return;
    }

    setIncrementalUploading(category);

    try {
      // 1. Convert to base64 and save to case storage
      const base64 = await fileToBase64(file);
      const attached: AttachedFile = { id: genId(), name: file.name, mimeType: file.type || "application/octet-stream", base64, size: file.size };

      saveFilesToCaseInBackground([{ name: file.name, base64, mimeType: file.type || "application/octet-stream" }]);

      // 2. Pre-process the single file
      const summaries = await preProcessDocuments(
        [attached],
        () => {},
        undefined,
      );
      const docSummary = summaries[0] || `[Document: ${file.name}] — Unable to extract content.`;

      // 3. Build the incremental prompt
      const condensedReport = truncateForContext(result, 6000);
      const incrementalPrompt = `## Incremental Document Update

A new document has been uploaded to address a gap identified in the previous Source of Wealth assessment.

### New Document
**Category:** ${label}
**File:** ${file.name}

${docSummary}

### Previous Assessment Context
${condensedReport}

### Instructions
1. Analyse the new document thoroughly.
2. Update ONLY the sections of the assessment affected by this new evidence.
3. Produce the updated report maintaining the same output format with section markers:
   - \`<!-- PROFILE_INFO_START -->\` (if profile info changes)
   - \`<!-- INTERNAL_REPORT_START -->\`
   - \`<!-- DRAFT_EMAIL_START -->\`
4. For sections NOT affected by this document, reproduce them as-is.
5. Mark the updated sections with a note: "**[Updated: ${label} received]**"
6. If this document resolves a previously flagged issue, explicitly note it is now resolved.
7. Do NOT regenerate the entire report from scratch — only update what is relevant.`;

      // 4. Stream the incremental response
      let incrementalResponse = "";
      await new Promise<void>((resolve, reject) => {
        streamChat({
          agentId,
          caseId: selectedCaseId || undefined,
          messages: [{ role: "user", content: incrementalPrompt }],
          files: /\.(pdf|jpg|jpeg|png|tif|tiff|bmp|webp|heic)$/i.test(file.name) ? [attached] : undefined,
          modelOverride: "google/gemini-2.5-flash",
          timeoutMs: SOW_STREAM_TIMEOUT_MS,
          onDelta: (text) => {
            incrementalResponse += text;
            setResult(incrementalResponse);
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
      });

      // 5. Update result and save
      setResult(incrementalResponse);
      
      // Update existing report in DB
      if (savedReportId) {
        const { cleanText, entries: evidenceEntries } = extractEvidenceMap(incrementalResponse);
        const { assessment, profileIntelligence, internalReport, draftEmail } = parseSections(cleanText);
        const clientReportWithProfile = profileIntelligence
          ? `${assessment}\n\n${PROFILE_MARKER}\n\n${profileIntelligence}`
          : assessment;
        const savedOutsideUK = /outside-uk\s*\/\s*jurisdiction enquiry|cayman|outside the uk/i.test(draftEmail || "");
        const savedTransferTrail = /transfer-trail enquiry|transfer chain|purchase funds/i.test(draftEmail || "");
        const savedSharedParty = /shared-party\s*\/\s*cross-party funding enquiry|anna[\s\S]{0,160}derived from|cross-party funding/i.test(draftEmail || "");
        const bodyHash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); };
        console.log(`[RULE-FIRE-PROOF][save-incremental] caseId=${selectedCaseId || "NONE"} stage=persisted_draft_email | draft_chars=${(draftEmail || "").length} draft_hash=${bodyHash(draftEmail || "")} | outsideUK_present=${savedOutsideUK} transferTrail_present=${savedTransferTrail} sharedParty_present=${savedSharedParty}`);
        await supabase
          .from("ai_reports")
          .update({
            client_report: clientReportWithProfile,
            internal_report: internalReport || assessment,
            draft_email: draftEmail || null,
            modified_at: new Date().toISOString(),
            modification_count: 1,
            modified_by: profile?.user_id || null,
          } as any)
          .eq("id", savedReportId);
        queryClient.invalidateQueries({ queryKey: ["ai_report", selectedCaseId] });
        queryClient.invalidateQueries({ queryKey: ["sow-saved-report", selectedCaseId] });
      } else {
        saveReport(incrementalResponse);
      }

      // 6. Deduct 1 credit
      if (credits != null && profile) {
        supabase.from("credit_transactions").insert({
          user_id: profile.user_id,
          amount: -1,
          balance_after: credits.balance - 1,
          transaction_type: "usage",
          description: `SoW Incremental Update — ${label} — ${caseReference || "No ref"}`,
          case_id: selectedCaseId || null,
        }).then(() => queryClient.invalidateQueries({ queryKey: ["credits"] }));
      }

      // 7. Mark as uploaded
      setIncrementalUploaded(prev => new Set(prev).add(category));
      toast({ title: "Report updated", description: `${label} processed and report updated (1 credit used).` });
      logAuditEvent("sow_incremental_update", caseReference || undefined, { category, fileName: file.name });
    } catch (err: any) {
      console.error("Incremental upload error:", err);
      toast({ title: "Update failed", description: err.message || "Failed to process the document.", variant: "destructive" });
    } finally {
      setIncrementalUploading(null);
    }
  }, [selectedCaseId, result, credits, agentId, streamChat, toast, saveFilesToCaseInBackground, saveReport, savedReportId, profile, caseReference, queryClient, logAuditEvent]);

  // ── Total file count ─────────────────────────────────────────────
  const allPersons = [...purchasers, ...(hasGiftors ? giftors : [])];
  const inMemoryFileCount = attachedFiles.length + allPersons.reduce((sum, p) => sum + p.files.length, 0);
  // ── Load persisted files from case-documents/aml-sow storage ────
  const { data: storedFiles = [] } = useQuery({
    queryKey: ["case-folder-files", selectedCaseId, "aml-sow"],
    queryFn: () => listFolderFiles(selectedCaseId!, "aml-sow"),
    enabled: !!selectedCaseId,
    staleTime: 30_000,
  });

  const evidenceFileNames = useMemo(() => {
    const names = new Set<string>();
    attachedFiles.forEach((f) => names.add(f.name));
    allPersons.forEach((p) => p.files.forEach((f) => names.add(f.name)));
    extractionStats.forEach((s) => names.add(s.name));
    storedFiles.forEach((sf) => names.add(sf.name));
    return Array.from(names).filter(Boolean);
  }, [attachedFiles, allPersons, extractionStats, storedFiles]);

  // ── Load latest saved report for this case ──────────────────────
  const { data: savedReport } = useQuery({
    queryKey: ["sow-saved-report", selectedCaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_reports")
        .select("id, client_report, internal_report, draft_email, version, section_compliance")
        .eq("case_id", selectedCaseId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCaseId,
    staleTime: 60_000,
  });

  // Hydrate result from saved report when no in-memory result exists
  useEffect(() => {
    if (savedReport && !result && !isLoading) {
      // Reconstruct the full text from saved sections
      const parts: string[] = [];
      if (savedReport.client_report) parts.push(savedReport.client_report);
      if (savedReport.internal_report) {
        parts.push(INTERNAL_MARKER);
        parts.push(savedReport.internal_report);
      }
      if (savedReport.draft_email) {
        parts.push(EMAIL_MARKER);
        parts.push(savedReport.draft_email);
      }
      if (parts.length > 0) {
        setResult(parts.join("\n\n"));
        setSavedReportId(savedReport.id);
        setActiveOutputTab("internal");
      }
    }
  }, [savedReport, selectedCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate persisted section-compliance findings + resolutions whenever the
  // saved report changes — independent of whether `result` is in memory. This
  // ensures that after a fresh assessment run (which sets `result` first and
  // only later receives the persisted compliance row), or after a refresh,
  // the inline Section Compliance strips re-appear with their resolutions.
  useEffect(() => {
    const compliance = (savedReport as any)?.section_compliance;
    if (!compliance || !Array.isArray(compliance.findings) || compliance.findings.length === 0) {
      return;
    }
    setSectionValidation((prev) => {
      // Don't overwrite a fresher in-memory result for the same report (the
      // live validator may have written more recent resolutions in this tab).
      const prevTs = prev?.checkedAt ? Date.parse(prev.checkedAt) : 0;
      const nextTs = compliance.last_validated_at ? Date.parse(compliance.last_validated_at) : 0;
      if (prev && prevTs >= nextTs) return prev;
      return {
        passed: compliance.findings.length === 0,
        omissions: compliance.findings,
        compliance,
        checkedAt: compliance.last_validated_at ?? new Date().toISOString(),
      };
    });
  }, [savedReport, setSectionValidation]);

  const totalFiles = inMemoryFileCount > 0 ? inMemoryFileCount : storedFiles.length;

  // ── AI Assistant helpers ─────────────────────────────────────────
  const handleAssistantApplyEdits = useCallback((edits: import("@/components/SoWAssistantPanel").FormEditCommand[]) => {
    for (const edit of edits) {
      if (!edit.personRole && edit.personIndex === undefined) {
        switch (edit.field) {
          case "propertyAddress": setPropertyAddress(edit.value); break;
          case "purchasePrice": setPurchasePrice(edit.value); break;
          case "caseReference": setCaseReference(edit.value); break;
          case "tenure": setTenure(edit.value); break;
          case "stampDuty": setStampDuty(edit.value); break;
          case "legalFees": setLegalFees(edit.value); break;
        }
      } else {
        const idx = edit.personIndex ?? 0;
        const updater = edit.personRole === "Giftor" ? setGiftors : setPurchasers;
        updater((prev) => prev.map((p, i) => {
          if (i !== idx) return p;
          const key = edit.field as keyof PersonDetail;
          if (key in p) return { ...p, [key]: edit.value };
          return p;
        }));
      }
    }
  }, []);

  const handleAssistantAddNote = useCallback((note: string) => {
    const timestamp = new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
    setAdditionalContext((prev) => prev ? `${prev}\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`);
    toast({ title: "Note added", description: "AI observation added to case notes." });
    logAuditEvent("sow_ai_note_added", caseReference || undefined, { note: note.slice(0, 2000) });
  }, [toast, logAuditEvent, caseReference]);

  // ── Build assistant form context ─────────────────────────────────
  const formContextForAssistant = {
    propertyAddress, purchasePrice, caseReference, tenure, stampDuty, legalFees, additionalContext,
    purchasers: purchasers.map((p) => ({
      fullName: p.fullName,
      fundingSource: p.fundingSource === "Other" && p.fundingSourceOther ? p.fundingSourceOther : p.fundingSource,
      contributionAmount: p.contributionAmount,
      employmentStatus: p.employmentStatus === "Other" && p.employmentStatusOther ? p.employmentStatusOther : p.employmentStatus,
    })),
    giftors: giftors.map((g) => ({
      fullName: g.fullName,
      fundingSource: g.fundingSource === "Other" && g.fundingSourceOther ? g.fundingSourceOther : g.fundingSource,
      contributionAmount: g.contributionAmount,
      relationshipToPurchaser: g.relationshipToPurchaser === "Other" && g.relationshipOther ? g.relationshipOther : g.relationshipToPurchaser,
    })),
    openBankingFileNames: [], purchaseInstructionFileNames: [],
    attachedFileNames: attachedFiles.map((f) => f.name),
    result,
    openBankingFiles: [], purchaseInstructionFiles: [],
    attachedFiles,
    personFiles: allPersons.map((p) => ({ personName: p.fullName, files: p.files })),
  };

  // ── Credit calculations ──────────────────────────────────────────
  const liveBreakdown = estimateSoWCredits({
    purchaserCount: purchasers.length,
    giftorCount: hasGiftors ? giftors.length : 0,
    supportingDocCount: attachedFiles.length + allPersons.reduce((sum, p) => sum + p.files.length, 0),
  });

  // ── AI Status & confidence from results ──────────────────────────
  const aiStatus = {
    docsProcessed: hasResults ? totalFiles : 0,
    docsTotal: totalFiles,
    fundingPattern: hasResults
      ? (result.toLowerCase().includes("inconsisten") ? "Inconsistent" : "Consistent")
      : "Awaiting",
    amlRiskLevel: hasResults
      ? (result.toLowerCase().includes("high risk") || result.toLowerCase().includes("high aml")
        ? "High"
        : result.toLowerCase().includes("medium risk") || result.toLowerCase().includes("moderate risk")
        ? "Medium"
        : "Low")
      : "Awaiting",
    profileVerified: hasResults && !!sections.profileIntelligence,
  };

  const complianceConfidence = (() => {
    if (!hasResults) return 0;
    const lower = result.toLowerCase();
    let score = 50;
    if (lower.includes("income verified") || lower.includes("salary confirmed") || lower.includes("payslips provided")) score += 10;
    if (lower.includes("savings evidence") || lower.includes("savings verified")) score += 8;
    if (lower.includes("gift declaration") || lower.includes("gift letter")) score += 6;
    if (lower.includes("identity verified") || lower.includes("id verified") || lower.includes("passport verified")) score += 8;
    if (lower.includes("address verified") || lower.includes("address confirmed")) score += 6;
    if (lower.includes("bank statement") && !lower.includes("missing")) score += 5;
    if (lower.includes("open banking") && lower.includes("verified")) score += 5;
    if (lower.includes("missing") || lower.includes("not provided") || lower.includes("outstanding")) score -= 12;
    if (lower.includes("inconsisten")) score -= 10;
    if (lower.includes("gap") && lower.includes("statement")) score -= 8;
    if (lower.includes("high risk") || lower.includes("high aml")) score -= 15;
    if (lower.includes("medium risk") || lower.includes("moderate risk")) score -= 5;
    if (lower.includes("cash deposit") && (lower.includes("flag") || lower.includes("concern"))) score -= 8;
    if (lower.includes("circular") || lower.includes("round-trip")) score -= 10;
    return Math.max(5, Math.min(98, score));
  })();

  const caseProgress = {
    docsUploaded: totalFiles > 0,
    classified: bulkBusy === false && totalFiles > 0,
    analysisRun: hasResults,
    complianceReviewed: hasResults && !!sections.internalReport,
    enquiriesGenerated: hasResults && !!sections.draftEmail,
    profileDiscovered: hasResults && !!sections.profileIntelligence,
  };

  // ── Output tab config ────────────────────────────────────────────
  const primaryTabs = [
    { value: "files", label: "Files", icon: FolderOpen },
    { value: "sow_tracker", label: "Enquiries", icon: ListChecks },
  ];
  const resultTabs = [
    { value: "profile", label: "Profile Info", icon: Users },
    { value: "internal", label: "Compliance Report", icon: ClipboardList },
    { value: "email", label: "Draft Email", icon: Mail },
  ];
  const moreTabs = [
    { value: "qa", label: "QA Check", icon: ShieldCheck },
    { value: "feedback", label: "Feedback", icon: MessageSquare },
  ];

  // ── Transaction dialog field change handler ──────────────────────
  const handleDialogFieldChange = useCallback((field: string, value: string) => {
    switch (field) {
      case "propertyAddress": setPropertyAddress(value); break;
      case "purchasePrice": setPurchasePrice(value); break;
      case "caseReference": setCaseReference(value); break;
      case "tenure": setTenure(value); break;
      case "stampDuty": setStampDuty(value); break;
      case "legalFees": setLegalFees(value); break;
      case "mortgageAmount": setMortgageAmount(value); break;
      case "clientFundsToVerify": setClientFundsToVerify(value); break;
      case "additionalContext": setAdditionalContext(value); break;
      case "transactionType": setTransactionType(value); break;
      case "propertyType": setPropertyType(value); break;
      case "lender": setLender(value); break;
      case "riskClassification": setRiskClassification(value); break;
    }
  }, []);

  // ── Transaction dialog field BLUR handler (persistence) ──────────
  // PHASE 3 Sub-batch B fix: the SoW dialog historically only updated
  // local React state — values were stitched into the prompt at dispatch
  // but never written to the database. Result: the banner re-evaluation
  // (driven by cases.sdlt_form_value) and the deterministic post-process
  // (which re-reads cases.*) saw NULL even after the conveyancer typed a
  // figure. This produced a real compliance-grade inconsistency: same
  // evidence, divergent funding-gap output between runs. We now persist
  // SDLT to cases.sdlt_form_value on blur so the banner, the prompt, and
  // the post-process all observe the same authoritative figure.
  //
  // Scope: SDLT amount only. Surcharge tri-state inputs are deferred to a
  // separate edit-case parity ticket and remain out of scope here.
  const handleDialogFieldBlur = useCallback(async (field: string, value: string) => {
    if (field !== "stampDuty" || !selectedCaseId) return;
    const trimmed = value.trim();
    // Empty input → NULL (clears any prior figure). Otherwise parse as
    // numeric; reject NaN silently to avoid corrupting the column.
    let toPersist: number | null = null;
    if (trimmed.length > 0) {
      const parsed = Number(trimmed.replace(/,/g, ""));
      if (!Number.isFinite(parsed)) return;
      toPersist = parsed;
    }
    try {
      const { error } = await supabase
        .from("cases")
        .update({ sdlt_form_value: toPersist })
        .eq("id", selectedCaseId);
      if (error) {
        console.warn("[SoW] Failed to persist sdlt_form_value:", error.message);
        toast({
          title: "SDLT not saved",
          description: "Your figure is held locally for this run, but failed to save to the case. Re-enter and try again.",
          variant: "destructive",
        });
        return;
      }
      // Refresh consistency-matrix consumers and any cached cases reads so
      // the banner re-evaluates against the latest persisted figure.
      queryClient.invalidateQueries({ queryKey: ["consistency-matrix", selectedCaseId] });
    } catch (e) {
      console.warn("[SoW] Persistence error for sdlt_form_value:", e);
    }
  }, [selectedCaseId, toast, queryClient]);

  return (
    <>
      <div className={`grid h-full w-full grid-cols-1 gap-6 overflow-x-clip relative ${
        assistantOpen ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "lg:grid-cols-[minmax(0,1fr)_300px]"
      }`}>
        {/* ── Center workspace ──────────────────────────────────── */}
        <div
          className="min-w-0 overflow-y-auto"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <DropZoneOverlay visible={isDragging} />

          <div className="max-w-4xl mx-auto px-4 py-5 pb-24 space-y-5">
            {/* Page header */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-foreground tracking-tight">Source of Wealth Workspace</h1>
              {!isLoading && result && sections.assessment && sections.internalReport && sections.draftEmail && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-lg"
                  onClick={() => exportSoWAll({
                    caseReference: caseReference || "SoW",
                    propertyAddress,
                    conveyancer: prefillData.fullName || "Conveyancer",
                    assessment: sections.assessment,
                    internalReport: sections.internalReport,
                    draftEmail: sections.draftEmail,
                    transactionType,
                    propertyType,
                    tenure,
                    purchasePrice,
                    lender,
                    stampDuty,
                    legalFees,
                    mortgageAmount,
                    purchasers: purchasers.map(p => p.fullName).filter(Boolean),
                    giftors: hasGiftors ? giftors.map(g => g.fullName).filter(Boolean) : [],
                  })}
                >
                  <Download size={14} /> Export All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-lg"
                  onClick={() => generateLenderSoWPdf({
                    caseReference: caseReference || "SoW",
                    propertyAddress,
                    feeEarner: prefillData.fullName || "Conveyancer",
                    purchasePrice,
                    mortgageAmount,
                    tenure,
                    lender,
                    transactionType,
                    purchasers: purchasers.map(p => p.fullName).filter(Boolean),
                    giftors: hasGiftors ? giftors.map(g => g.fullName).filter(Boolean) : [],
                    internalReport: sections.internalReport || sections.assessment,
                  })}
                >
                  <Download size={14} /> Lender PDF
                </Button>
              </div>
              )}
            </div>

            {/* Premium Case Header */}
            <SoWCaseHeader
              caseReference={caseReference}
              propertyAddress={propertyAddress}
              purchasePrice={purchasePrice}
              tenure={tenure}
              totalFiles={totalFiles}
              isLoading={isLoading}
              purchaserCount={purchasers.filter(p => p.fullName).length}
              giftorCount={hasGiftors ? giftors.filter(g => g.fullName).length : 0}
              onEditTransaction={() => { setTransactionDialogOpen(true); }}
            />

            {/* PHASE 3 Sub-batch B — SDLT-absent inline banner.
                Visible only when both cases.stamp_duty (CMS) and
                cases.sdlt_form_value (manual) are NULL. Non-blocking;
                informs the conveyancer that the funding-gap dimension will
                be MANUAL_REVIEW_REQUIRED unless SDLT is supplied. The
                "Enter SDLT" action opens the existing transaction dialog
                where the Stamp Duty field can be edited inline. */}
            <SoWSdltAbsentBanner
              visible={
                !!selectedCaseId &&
                !isLoading &&
                prefillData.sdltMissing &&
                // Hide as soon as the conveyancer has typed a value locally,
                // even if the DB write hasn't settled yet — avoids a flash
                // of the banner after blur. Persistence happens in
                // handleDialogFieldBlur.
                !stampDuty.trim()
              }
              onEnterSdlt={() => setTransactionDialogOpen(true)}
            />

            {/* Upload section */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 tracking-tight">
                    <Upload size={16} className="text-accent" />
                    Upload Documents
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {["PDF", "DOC", "Images"].map((fmt) => (
                      <span key={fmt} className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground font-medium">{fmt}</span>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-1">Up to 100 files · 100MB each</span>
                  </div>
                </div>
                {bulkBusy && (
                  <span className="text-xs text-accent flex items-center gap-1.5 font-medium">
                    <Loader2 size={12} className="animate-spin" /> Classifying…
                  </span>
                )}
              </div>

              {/* Document processing status with animated progress */}
              {docProcessingStatus && (
                <TimedProgressBar
                  status={docProcessingStatus}
                  overallProgress={overallProgress}
                  extractionProgress={extractionProgress}
                  startTime={analysisStartTime.current}
                  onCancel={handleCancel}
                  docItems={docItems}
                />
              )}

              {/* Consolidated SoW run status — replaces the two ad-hoc alert rows.
                   Shows phase, retries, attempts, and surfaces retry / cancel
                   actions in a single deterministic surface. */}
              <SoWRunStatusPanel
                runPhase={runPhase}
                detail={runPhaseDetail}
                elapsedSeconds={elapsedSeconds}
                runId={currentRunIdValue}
                chunkRetryRound={chunkRetryRound}
                consolidationAttempts={consolidationAttemptsThisRun}
                hasPendingConsolidation={hasPendingConsolidation}
                chunkFailureState={chunkFailureState}
                caseId={selectedCaseId}
                preservedSnapshot={preservedSnapshot}
                onRetryConsolidation={handleRetryConsolidation}
                onCancel={handleCancel}
              />

              <BulkAMLUpload
                onFilesClassified={handleBulkClassified}
                onFormExtracted={handleFormExtracted}
                onBusyChange={setBulkBusy}
                disabled={isLoading}
              />
            </div>

            {/* Person-tagged document summary */}
            {allPersons.some(p => p.files.length > 0) && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-sm">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 tracking-tight">
                  <Users size={14} className="text-accent" />
                  Person-Tagged Documents
                </h3>
                <div className="space-y-1.5">
                  {allPersons.filter(p => p.files.length > 0).map((p) => (
                    <div key={p.id} className="flex items-start gap-2">
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium mt-0.5">
                        👤 {p.fullName || p.role}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {p.files.map((f) => (
                          <span key={f.id} className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-foreground">
                            <FileText size={10} className="text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[140px]">{f.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {attachedFiles.length > 0 && (
                  <div className="flex items-start gap-2 pt-1 border-t border-border/50">
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium mt-0.5">
                      📎 Shared
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{attachedFiles.length} document{attachedFiles.length !== 1 ? "s" : ""} (not person-tagged)</span>
                  </div>
                )}
              </div>
            )}

            {/* Missing Documents Banner */}
            {hasResults && (() => {
              const missingDocItems = parseMissingDocuments(result, { evidenceFileNames });
              return missingDocItems.length > 0 ? (
                <Card className="border-[hsl(var(--risk-amber))]/30 bg-[hsl(var(--risk-amber))]/5 rounded-xl shadow-sm">
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-[hsl(var(--risk-amber))] shrink-0" />
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Missing Documents ({missingDocItems.length})</h3>
                        <p className="text-xs text-muted-foreground">
                          Upload the documents below to run an incremental update (1 credit each) instead of a full re-run.
                        </p>
                      </div>
                    </div>
                    <SoWMissingDocuments
                      items={missingDocItems}
                      onUploadMissing={handleUploadMissing}
                      disabled={isLoading}
                      uploadingCategory={incrementalUploading}
                      uploadedCategories={incrementalUploaded}
                    />
                  </CardContent>
                </Card>
              ) : null;
            })()}

            <Card ref={outputTabsCardRef} className="border-border rounded-xl shadow-sm">
              <CardContent className="pt-4">
                <Tabs value={activeOutputTab} onValueChange={(val) => {
                  setActiveOutputTab(val);
                  // Scroll the card into view so user sees the content change
                  setTimeout(() => outputTabsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-transparent border-b border-border rounded-none pb-2">
                      {primaryTabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1">
                          <tab.icon size={12} /> {tab.label}
                        </TabsTrigger>
                      ))}
                      {hasResults && resultTabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1">
                          <tab.icon size={12} /> {tab.label}
                        </TabsTrigger>
                      ))}
                      {hasResults && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2 py-1.5 text-xs font-medium ring-offset-background transition-all hover:bg-muted text-muted-foreground gap-1">
                              <MoreHorizontal size={12} /> More
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {moreTabs.map((tab) => (
                              <DropdownMenuItem key={tab.value} onClick={() => setActiveOutputTab(tab.value)} className="gap-2 text-xs">
                                <tab.icon size={12} /> {tab.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TabsList>
                  </div>

                  <TabsContent value="files" className="mt-4">
                    {totalFiles > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{totalFiles} document{totalFiles !== 1 ? "s" : ""} attached to this review</p>

                        {/* Funding Evidence Sources summary (shown after analysis) */}
                        {fundingEvidenceMap.size > 0 && (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Banknote size={14} className="text-primary" />
                              <span className="text-xs font-semibold text-primary">Funding Evidence Sources</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">{fundingEvidenceMap.size} doc{fundingEvidenceMap.size !== 1 ? "s" : ""}</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Documents below that contributed deposit, contribution, or funding data are tagged with a 💰 badge.</p>
                          </div>
                        )}

                        {/* Per-person file list (in-memory) */}
                        {allPersons.filter(p => p.files.length > 0).map((p) => (
                          <div key={p.id} className="space-y-1">
                            <p className="text-xs font-medium text-foreground">{p.fullName || p.role}</p>
                            <div className="flex flex-wrap gap-1">
                              {p.files.map((f) => {
                                const evidence = fundingEvidenceMap.get(f.name.toLowerCase()) || fundingEvidenceMap.get(f.name.replace(/\.[^.]+$/, "").toLowerCase());
                                return (
                                  <div key={f.id} className="flex items-center gap-0.5">
                                    <FileChip file={f} onRemove={() => removePersonFile(p.id, f.id, p.role)} disabled={isLoading} ownerName={p.fullName || p.role} />
                                    {evidence && (
                                      <span title={`Funding data: ${evidence.dataContributed}`} className="inline-flex items-center gap-0.5 rounded bg-primary/10 text-primary px-1 py-0.5 text-[9px] font-medium cursor-help">
                                        💰 {evidence.dataContributed.length > 30 ? evidence.dataContributed.slice(0, 28) + "…" : evidence.dataContributed}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {attachedFiles.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground">Shared Documents</p>
                            <div className="flex flex-wrap gap-1">
                              {attachedFiles.map((f) => {
                                const evidence = fundingEvidenceMap.get(f.name.toLowerCase()) || fundingEvidenceMap.get(f.name.replace(/\.[^.]+$/, "").toLowerCase());
                                return (
                                  <div key={f.id} className="flex items-center gap-0.5">
                                    <FileChip file={f} onRemove={() => removeFile(f.id)} disabled={isLoading} />
                                    {evidence && (
                                      <span title={`Funding data: ${evidence.dataContributed}`} className="inline-flex items-center gap-0.5 rounded bg-primary/10 text-primary px-1 py-0.5 text-[9px] font-medium cursor-help">
                                        💰 {evidence.dataContributed.length > 30 ? evidence.dataContributed.slice(0, 28) + "…" : evidence.dataContributed}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* Persisted storage files (when no in-memory files loaded) */}
                        {inMemoryFileCount === 0 && storedFiles.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground">Saved Case Files</p>
                            <div className="flex flex-wrap gap-1">
                              {storedFiles.map((sf) => {
                                const evidence = fundingEvidenceMap.get(sf.name.toLowerCase()) || fundingEvidenceMap.get(sf.name.replace(/\.[^.]+$/, "").toLowerCase());
                                return (
                                  <div
                                    key={sf.name}
                                    className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-foreground"
                                  >
                                    <FileText size={12} className="text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[180px]">{sf.name}</span>
                                    {sf.size > 0 && (
                                      <span className="text-muted-foreground text-[10px]">
                                        {formatFileSize(sf.size)}
                                      </span>
                                    )}
                                    {evidence && (
                                      <span title={`Funding data: ${evidence.dataContributed}`} className="inline-flex items-center gap-0.5 rounded bg-primary/10 text-primary px-1 py-0.5 text-[9px] font-medium cursor-help shrink-0">
                                        💰 {evidence.dataContributed.length > 30 ? evidence.dataContributed.slice(0, 28) + "…" : evidence.dataContributed}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FolderOpen size={32} className="mx-auto mb-3 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Upload documents above to get started.</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* assessment tab removed — merged into internal */}

                  <TabsContent value="profile" className="mt-4">
                    {result ? (
                      <StructuredSoWReportTab
                        title="Profile Intelligence"
                        subtitle="Social & economic profile discovery"
                        content={sections.profileIntelligence || null}
                        queryClient={queryClient}
                        emptyMessage={isLoading ? "Discovering social & economic profiles…" : "No profile intelligence generated. Re-run the assessment to include Firecrawl profile discovery."}
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Profile intelligence will appear here after running the assessment.
                      </div>
                    )}
                  </TabsContent>

                   <TabsContent value="internal" className="mt-4">
                    {result ? (
                      <div className="space-y-6">
                        {/* Extraction warning banner */}
                        {extractionWarnings.length > 0 && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <AlertTriangle size={16} className="text-destructive shrink-0" />
                              <span className="text-sm font-semibold text-destructive">Document Extraction Warning</span>
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-auto">{extractionWarnings.length}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">The AI flagged potential issues reading one or more documents. Please verify these claims manually — documents may be fully readable.</p>
                            <ul className="space-y-1">
                              {extractionWarnings.map((w, i) => (
                                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                  <span className="text-destructive mt-0.5">•</span>
                                  <span><strong>{w.filename}</strong>: {w.reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* Internal Report — assessment narrative merged with the
                            structured Compliance Summary sections (Decision Log,
                            LSAG Auto-Scoring, Funding Evidence Sources, etc.).
                            See `mergeReportSections` at the top of this file. */}
                        {(() => {
                          const mergedInternalReport =
                            sections.internalReport &&
                            sections.internalReport.length > 80 &&
                            sections.internalReport !== sections.assessment
                              ? mergeReportSections(sections.assessment ?? "", sections.internalReport)
                              : sections.assessment;
                          return (
                            <StructuredSoWReportTab
                              title="Compliance Report"
                              subtitle="Full source of wealth compliance report (internal use)"
                              content={mergedInternalReport}
                              aiReportId={savedReportId || undefined}
                              caseId={selectedCaseId || undefined}
                              dbField="client_report"
                              queryClient={queryClient}
                              emptyMessage={isLoading ? "Generating…" : "No report generated."}
                              onExport={savedReportId && selectedCaseId
                                ? (text) => exportInternalReport(caseReference || "SoW", prefillData.fullName || "Conveyancer", `sow-${savedReportId || "draft"}`, text)
                                : undefined}
                              compliance={sectionValidation?.compliance ?? null}
                              onSwitchTab={(tab) => setActiveOutputTab(tab)}
                            />
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Internal report will appear here after running the assessment.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="email" className="mt-4">
                    {result ? (
                      <StructuredSoWReportTab
                        title="Client Enquiries Email"
                        subtitle="Draft email requesting missing evidence"
                        content={sections.draftEmail || null}
                        aiReportId={savedReportId || undefined}
                        caseId={selectedCaseId || undefined}
                        dbField="draft_email"
                        queryClient={queryClient}
                        emptyMessage={isLoading ? "Generating…" : "No client email generated."}
                        onExport={(text) => exportDraftEmail(caseReference || "SoW", text)}
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Client email draft will appear here after running the assessment.
                      </div>
                    )}
                  </TabsContent>


                  <TabsContent value="sow_tracker" className="mt-4">
                    {selectedCaseId ? (
                      <EnquiryTrackerPanel caseId={selectedCaseId} agentType="sow" caseReference={caseReference || "SoW"} agentLabel="Olimey AI" />
                    ) : (
                      <div className="text-center py-8">
                        <ListChecks size={32} className="mx-auto mb-3 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Link this review to a case to enable the enquiry tracker.</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="qa" className="mt-4">
                    <div className="text-center py-8">
                      <ShieldCheck size={32} className="mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">QA Check results will appear here.</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="feedback" className="mt-4">
                    {selectedCaseId ? (
                      <QueryFeedbackTab caseId={selectedCaseId} caseReference={caseReference || "SoW"} />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare size={24} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Link a case to enable feedback.</p>
                      </div>
                    )}
                  </TabsContent>

                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Right action sidebar ──────────────────────────────── */}
        {/* Right margin (lg:mr-16 = 64px) keeps the inner sidebar clear of the
            absolutely-positioned floating action buttons (FloatingCaseFiles +
            SupportChatWidget) at bottom-right (each 56px wide, anchored at right-6).
            Wrapper width matches inner sidebar exactly so it does not overflow the
            flex container at narrower viewports. pb-24 ensures the footer CTAs
            clear the floating cluster when the sidebar scrolls to the bottom. */}
        <div
          className={`hidden min-w-0 pb-24 lg:block ${
            assistantOpen ? "lg:w-[320px]" : "lg:w-[300px]"
          }`}
        >
          {assistantOpen ? (
            <div className="w-[320px] min-w-[320px]">
              <SoWAssistantPanel
                formContext={formContextForAssistant}
                streamChat={streamChat}
                collapsed={false}
                onToggleCollapse={() => setAssistantOpen(false)}
                onApplyEdits={handleAssistantApplyEdits}
                onAddNote={handleAssistantAddNote}
                caseReference={caseReference}
              />
            </div>
          ) : (
            <SoWActionSidebar
              onRunAssessment={() => handleSubmit()}
              onEditCaseDetails={() => { setTransactionDialogOpen(true); }}
              onOpenAssistant={() => setAssistantOpen(true)}
              onUploadMissing={handleUploadMissing}
              isLoading={isLoading}
              bulkBusy={bulkBusy}
              hasResults={hasResults}
              aiStatus={aiStatus}
              complianceConfidence={complianceConfidence}
              creditBalance={credits?.balance ?? null}
              creditCost={liveBreakdown.total}
              resultText={result}
              progress={caseProgress}
              filteredFindingsCount={filteredFindingsCount}
              sectionValidation={sectionValidation}
              aiReportId={savedReportId}
              onComplianceUpdated={(compliance, reportFields) => {
                // Mirror persisted compliance back into local validation state so the
                // sidebar reflects the new resolution chain without a refetch.
                setSectionValidation((prev) => ({
                  passed: compliance.findings.length === 0,
                  omissions: compliance.findings,
                  compliance,
                  checkedAt: compliance.last_validated_at ?? prev?.checkedAt ?? new Date().toISOString(),
                }));

                // Auto-merge / revert-of-merge: the edge function returned updated
                // report-field text. Rebuild the in-memory `result` string in the
                // same shape as the initial hydration (client_report → INTERNAL_MARKER →
                // internal_report → EMAIL_MARKER → draft_email) so the visible report
                // tabs update without a hard refresh. Also invalidate cached queries
                // so any other consumer sees the new version.
                if (reportFields && (reportFields.internal_report !== undefined
                  || reportFields.client_report !== undefined
                  || reportFields.draft_email !== undefined)) {
                  // Re-parse the current `result` to know the existing sections, then
                  // override with whichever fields the server returned.
                  const { sections } = (() => {
                    try {
                      // parseSections is the same helper used elsewhere in this file.
                      const parsed = parseSections(result || "");
                      return { sections: parsed };
                    } catch {
                      return { sections: { assessment: "", profileIntelligence: "", internalReport: "", draftEmail: "" } };
                    }
                  })();
                  const nextClient = reportFields.client_report !== undefined
                    ? (reportFields.client_report ?? "")
                    : sections.assessment;
                  const nextInternal = reportFields.internal_report !== undefined
                    ? (reportFields.internal_report ?? "")
                    : sections.internalReport;
                  const nextEmail = reportFields.draft_email !== undefined
                    ? (reportFields.draft_email ?? "")
                    : sections.draftEmail;

                  const parts: string[] = [];
                  if (nextClient) parts.push(nextClient);
                  if (nextInternal) {
                    parts.push(INTERNAL_MARKER);
                    parts.push(nextInternal);
                  }
                  if (nextEmail) {
                    parts.push(EMAIL_MARKER);
                    parts.push(nextEmail);
                  }
                  if (parts.length > 0) setResult(parts.join("\n\n"));
                  queryClient.invalidateQueries({ queryKey: ["sow-saved-report", selectedCaseId] });
                  queryClient.invalidateQueries({ queryKey: ["ai_report", selectedCaseId] });
                }
              }}
              persons={[...purchasers, ...(hasGiftors ? giftors : [])]}
              transactionFilled={[
                !!propertyAddress.trim(),
                !!purchasePrice.trim(),
                !!caseReference.trim(),
                !!tenure.trim(),
                !!mortgageAmount.trim(),
                !!transactionType,
                !!propertyType.trim(),
              ]}
              evidenceFileNames={evidenceFileNames}
              uploadingCategory={incrementalUploading}
              uploadedCategories={incrementalUploaded}
              matrixEnabled={matrixData?.enabled ?? false}
              matrixExceptions={matrixData?.exceptions ?? []}
              matrixEnquiries={matrixData?.draftEnquiries ?? []}
              matrixPendingChecks={matrixData?.pendingChecks ?? []}
            />
          )}
        </div>

        {/* Mobile: Run SoW button */}
        <div className="lg:hidden fixed bottom-4 right-4 z-30 flex gap-2 backdrop-blur-md bg-background/70 rounded-xl p-2 border border-border shadow-lg">
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg gap-1.5"
            onClick={() => handleSubmit()}
            disabled={isLoading || bulkBusy}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Run SoW
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="shadow-lg"
            onClick={() => { setTransactionDialogOpen(true); }}
          >
            <FileText size={14} />
          </Button>
        </div>
      </div>

      {/* Transaction / Parties Dialog */}
      <SoWTransactionDialog
        open={transactionDialogOpen}
        onOpenChange={setTransactionDialogOpen}
        fields={{ propertyAddress, purchasePrice, caseReference, tenure, stampDuty, legalFees, mortgageAmount, clientFundsToVerify, additionalContext, transactionType, propertyType, lender, riskClassification }}
        onFieldChange={handleDialogFieldChange}
        onFieldBlur={handleDialogFieldBlur}
        purchasers={purchasers}
        giftors={giftors}
        hasGiftors={hasGiftors}
        onAddPurchaser={addPurchaser}
        onRemovePurchaser={removePurchaser}
        onUpdatePurchaser={updatePurchaser}
        onAddGiftor={addGiftor}
        onRemoveGiftor={removeGiftor}
        onUpdateGiftor={updateGiftor}
        onGiftorToggle={handleGiftorToggle}
        onPersonFileUpload={handlePersonFileUpload}
        onRemovePersonFile={removePersonFile}
        isLoading={isLoading}
        attachedFiles={attachedFiles}
        fileInputRef={fileInputRef}
        onFileSelect={handleFileSelect}
        onRemoveFile={removeFile}
        pendingArmalytixUpdate={pendingArmalytixUpdate}
        onApplyArmalytixUpdate={pendingArmalytixUpdate ? () => applyArmalytixUpdate(pendingArmalytixUpdate) : undefined}
        armalytixFilledFields={armalytixFilledFields}
      />

      {/* Extraction confirmation dialog */}
      <AlertDialog open={!!pendingExtraction} onOpenChange={(open) => { if (!open) setPendingExtraction(null); }}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-accent" />
              Confirm Auto-filled Form Data
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>AI has extracted the following from your documents. Please review before applying.</p>
                {pendingExtraction && pendingExtraction.corrections.length > 0 && (
                  <div className="rounded-md border border-[hsl(var(--risk-amber))]/30 bg-[hsl(var(--risk-amber-bg))] p-2 space-y-1">
                    <p className="text-xs font-medium text-[hsl(var(--risk-amber))] flex items-center gap-1">
                      <AlertTriangle size={12} /> Quality review made {pendingExtraction.corrections.length} correction(s):
                    </p>
                    {pendingExtraction.corrections.map((c, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground">• <strong>{c.field}</strong>: {c.reason}</p>
                    ))}
                  </div>
                )}
                {pendingExtraction && (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-border p-2">
                      <span className="text-muted-foreground">Property Address</span>
                      <span className="font-medium">{pendingExtraction.propertyAddress || "—"}</span>
                      <span className="text-muted-foreground">Purchase Price</span>
                      <span className="font-medium">{pendingExtraction.purchasePrice ? `£${pendingExtraction.purchasePrice}` : "—"}</span>
                      <span className="text-muted-foreground">Case Reference</span>
                      <span className="font-medium">{pendingExtraction.caseReference || "—"}</span>
                      <span className="text-muted-foreground">Tenure</span>
                      <span className="font-medium">{pendingExtraction.tenure || "—"}</span>
                    </div>
                    {pendingExtraction.purchasers.length > 0 && (
                      <div className="rounded-md border border-border p-2 space-y-1">
                        <p className="font-medium text-foreground">Purchasers ({pendingExtraction.purchasers.length})</p>
                        {pendingExtraction.purchasers.map((p, i) => (
                          <div key={i} className="pl-2 border-l-2 border-accent/30">
                            <p className="font-medium">{p.fullName}</p>
                            <p className="text-muted-foreground">Funding: {p.fundingSource || "—"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {pendingExtraction.giftors.length > 0 && (
                      <div className="rounded-md border border-border p-2 space-y-1">
                        <p className="font-medium text-foreground">Giftors ({pendingExtraction.giftors.length})</p>
                        {pendingExtraction.giftors.map((g, i) => (
                          <div key={i} className="pl-2 border-l-2 border-accent/30">
                            <p className="font-medium">{g.fullName}</p>
                            <p className="text-muted-foreground">Relationship: {g.relationshipToPurchaser || "—"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {pendingExtraction.verificationNotes && (
                      <p className="text-[11px] text-muted-foreground italic">{pendingExtraction.verificationNotes}</p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyExtractedData}>Apply to Form</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credit confirmation dialog */}
      <AlertDialog open={creditConfirmOpen} onOpenChange={(open) => { if (!open) setCreditConfirmOpen(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Coins size={18} className="text-accent" />
              Confirm Credit Usage
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>This Source of Wealth assessment will use the following credits:</p>
                {pendingCreditBreakdown && (
                  <div className="rounded-lg border border-border p-3 space-y-1.5 text-xs">
                    {pendingCreditBreakdown.lines.map((line, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{line.label}</span>
                        <span className={`font-medium ${line.credits > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                          {line.credits > 0 ? `+${line.credits}` : "—"}
                        </span>
                      </div>
                    ))}
                    <Separator className="my-1.5" />
                    <div className="flex justify-between font-semibold text-sm">
                      <span>Total</span>
                      <span className="text-accent">{pendingCreditBreakdown.total} credits</span>
                    </div>
                  </div>
                )}
                {credits && (
                  <p className="text-xs text-muted-foreground">
                    Remaining balance after: <strong>{credits.balance - (pendingCreditBreakdown?.total ?? 0)}</strong> credits
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={confirmCredits}
            >
              Confirm & Run Assessment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wave 15.1 Sufficiency Gate modal */}
      <SufficiencyConfirmationModal
        open={sufficiencyModalOpen}
        result={pendingSufficiencyResult}
        onCancel={onSufficiencyCancel}
        onConfirm={onSufficiencyConfirm}
      />
    </>
  );
}

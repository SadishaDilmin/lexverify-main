import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2, AlertTriangle, Clock, Upload, FileText, ChevronDown, ChevronRight,
  Loader2, Send, Shield, XCircle, RefreshCw, FileDown, Eye, Trash2, FileUp, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  prescanReplyFile,
  sectionLabel,
  type PrescanMatch,
  type PrescanConfidence,
} from "@/lib/enquiryReplyPrescan";
import { CoverageGapBanner } from "@/components/sow/CoverageGapBanner";
import { stripUserFacingNoise, toCleanProse } from "@/lib/userFacingText";

/**
 * Renders an AI-authored prose value as cleanly-spaced paragraphs.
 * Strips machine markers (EVIDENCE_MAP, ai-merge, extraction warnings) and
 * literal markdown punctuation (`**`, leading `*`/`-` bullets, `#` headings)
 * before display, then maps blank-line-separated blocks to <p> elements.
 */
function CleanProse({
  value,
  className = "text-muted-foreground mt-0.5 leading-relaxed",
  emptyFallback = null,
}: {
  value: string | null | undefined;
  className?: string;
  emptyFallback?: React.ReactNode;
}) {
  const { paragraphs } = toCleanProse(value);
  if (paragraphs.length === 0) return <>{emptyFallback}</>;
  return (
    <div className="space-y-2">
      {paragraphs.map((p, i) => (
        <p key={i} className={className}>
          {p}
        </p>
      ))}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────
type AgentType = "sow";
type EnquiryStatus = "open" | "partially_satisfied" | "satisfied" | "escalate" | "not_applicable";

interface EnquiryItem {
  id: string;
  enquiry_number: string;
  category: string;
  issue_summary: string;
  original_enquiry_text: string;
  evidence_required: string | null;
  reply_summary: string | null;
  evidence_received: string | null;
  status: EnquiryStatus;
  next_action: string | null;
  who_replied: string | null;
  date_raised: string;
  date_last_updated: string;
  round_id: string;
}

interface EnquiryRound {
  id: string;
  round_number: number;
  status: string;
  internal_report: string | null;
  draft_email: string | null;
  outstanding_summary: string | null;
  ai_run_id: string | null;
  created_at: string;
}

interface EnquiryTrackerPanelProps {
  caseId: string;
  agentType: AgentType;
  caseReference: string;
  agentLabel: string;
}

const STATUS_CONFIG: Record<EnquiryStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  open: { label: "Open", color: "bg-risk-red/10 text-risk-red border-risk-red/20", icon: Clock },
  partially_satisfied: { label: "Partially Satisfied", color: "bg-risk-amber/10 text-risk-amber border-risk-amber/20", icon: AlertTriangle },
  satisfied: { label: "Satisfied", color: "bg-risk-green/10 text-risk-green border-risk-green/20", icon: CheckCircle2 },
  escalate: { label: "Escalate", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Shield },
  not_applicable: { label: "N/A", color: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

const AGENT_LABELS: Record<AgentType, string> = { sow: "SoW" };

const INGEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-replies`;

// ── Helpers ────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".csv", ".md", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".eml", ".msg", ".xls", ".xlsx", ".rtf"];

function isAllowedFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

// Helper for proposed-match confidence chip styling.
const CONFIDENCE_CHIP: Record<PrescanConfidence, string> = {
  high: "bg-risk-green/10 text-risk-green border-risk-green/30",
  medium: "bg-risk-amber/10 text-risk-amber border-risk-amber/30",
  low: "bg-muted text-muted-foreground border-border",
};

// ── Component ──────────────────────────────────────────────────────────
export default function EnquiryTrackerPanel({ caseId, agentType, caseReference, agentLabel }: EnquiryTrackerPanelProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);

  // Reply upload state
  // A PendingReply is a file that has been (or is being) uploaded to storage
  // and pre-scanned by the AI. The user confirms the proposed enquiry mapping
  // before the heavier ingest-replies analysis is invoked.
  type PendingReplyStatus = "uploading" | "prescanning" | "ready" | "failed";
  interface PendingReply {
    id: string; // local key
    file: File;
    file_path?: string; // storage key once uploaded
    status: PendingReplyStatus;
    error?: string;
    auto_note?: string;
    suggested_classification?: string;
    proposed: PrescanMatch[]; // AI proposal (read-only reference)
    confirmedEnquiryIds: Set<string>; // user-tickable set
    prescanFailed?: boolean;
  }
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isGeneratingFinal, setIsGeneratingFinal] = useState(false);
  const [finalReport, setFinalReport] = useState<{ client: string; internal: string } | null>(null);
  const [isDraggingReply, setIsDraggingReply] = useState(false);
  // Banner shown after a successful ingest summarising the targeted refresh.
  const [lastIngestSummary, setLastIngestSummary] = useState<{
    updates_count: number;
    new_enquiries_count: number;
    affected_sections: string[];
    section_rerun_triggered: boolean;
    round_number: number;
    at: number;
  } | null>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const replyDropRef = useRef<HTMLDivElement>(null);

  // ── Queries ────────────────────────────────────────────────────────
  const { data: rounds = [], isLoading: roundsLoading } = useQuery({
    queryKey: ["enquiry_rounds", caseId, agentType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enquiry_rounds" as any)
        .select("*")
        .eq("case_id", caseId)
        .eq("agent_type", agentType)
        .order("round_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EnquiryRound[];
    },
    enabled: !!caseId,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ["enquiry_items", caseId, agentType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enquiry_items" as any)
        .select("*")
        .eq("case_id", caseId)
        .eq("agent_type", agentType);
      if (error) throw error;
      // enquiry_number is stored as text (e.g. "1", "1.2", "10") so a DB-side
      // ascending sort orders lexicographically ("10" before "2"). Sort numerically
      // on the client, segment-by-segment, so dotted sub-numbers stay grouped.
      const rawItems = (data || []) as unknown as EnquiryItem[];
      // Hide enquiries that were retained in the database purely as a
      // duplicate-of-another audit record. The system marker
      // "[system] Marked as duplicate of enquiry #N" is written by the
      // de-duplication restoration flow when a near-identical numbered
      // enquiry was emitted by the model. The audit trail stays in the DB,
      // but the tracker UI must not surface them as live items — they
      // create the impression of two separate questions about the same
      // underlying matter. This rule applies to ALL cases, current and
      // future, and complements the parser-side `collapseNearDuplicates`
      // safeguard which prevents new duplicates being seeded in the first
      // place.
      const items = rawItems.filter((i) => {
        const summary = (i.reply_summary ?? "").trim();
        return !/^\[system\]\s*Marked as duplicate of enquiry/i.test(summary);
      });
      const parts = (n: string | null | undefined): number[] =>
        String(n ?? "")
          .split(".")
          .map((p) => {
            const v = parseInt(p, 10);
            return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
          });
      return [...items].sort((a, b) => {
        const pa = parts(a.enquiry_number);
        const pb = parts(b.enquiry_number);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
          const av = pa[i] ?? 0;
          const bv = pb[i] ?? 0;
          if (av !== bv) return av - bv;
        }
        return String(a.enquiry_number ?? "").localeCompare(String(b.enquiry_number ?? ""));
      });
    },
    enabled: !!caseId,
  });

  // Latest finalised AI report — used to seed Round 1 when the tracker is empty
  // and to gate the "Seed from latest report" CTA on the empty state.
  const { data: latestReport } = useQuery({
    queryKey: ["enquiry_tracker_latest_report", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_reports")
        .select("id, ai_run_id, finalisation_status, draft_email, coverage_report, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      const ready =
        (row.finalisation_status === "fully_consolidated" || row.finalisation_status === "completed") &&
        !!row.draft_email &&
        row.draft_email.trim().length > 50;
      return { ...row, ready };
    },
    enabled: !!caseId,
    staleTime: 30_000,
  });

  // Seed Round 1 from the latest finalised Olimey AI report.
  const seedRoundOne = useMutation({
    mutationFn: async (opts?: { force_new_round?: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("seed-enquiries-from-report", {
        body: { case_id: caseId, agent_type: agentType, force_new_round: opts?.force_new_round ?? false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        seeded: boolean;
        reason?: string;
        round_id?: string;
        round_number?: number;
        items_inserted?: number;
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["enquiry_rounds", caseId, agentType] });
      queryClient.invalidateQueries({ queryKey: ["enquiry_items", caseId, agentType] });
      if (res.seeded) {
        toast({
          title: "Round 1 seeded",
          description: `${res.items_inserted} ${res.items_inserted === 1 ? "enquiry" : "enquiries"} created from the latest Olimey AI report.`,
        });
      } else if (res.reason === "rounds_already_exist") {
        // Silent — auto-seed effect raced with an existing round; harmless.
      } else if (res.reason === "no_enquiries_in_draft") {
        toast({
          title: "No enquiries detected",
          description: "The draft email did not contain numbered enquiries to seed.",
          variant: "destructive",
        });
      } else if (res.reason === "report_not_finalised") {
        toast({
          title: "Report not finalised",
          description: "Wait for the Olimey AI run to finish, then try again.",
        });
      }
    },
    onError: (err: unknown) => {
      toast({
        title: "Seeding failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  // Reconcile the latest round with the latest finalised report — adds any
  // enquiries (including merged "Additional enquiry" addenda) that are missing
  // from the tracker without touching user-modified rows.
  const reconcileLatest = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("seed-enquiries-from-report", {
        body: { case_id: caseId, agent_type: agentType, mode: "reconcile" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        seeded: boolean;
        reason?: string;
        items_inserted?: number;
        items_skipped_existing?: number;
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["enquiry_items", caseId, agentType] });
      queryClient.invalidateQueries({ queryKey: ["enquiry_rounds", caseId, agentType] });
      if (res.seeded && (res.items_inserted ?? 0) > 0) {
        toast({
          title: "Tracker reconciled",
          description: `${res.items_inserted} new ${res.items_inserted === 1 ? "enquiry" : "enquiries"} added from the latest report.`,
        });
      } else if (res.reason === "nothing_to_reconcile") {
        toast({
          title: "Already in sync",
          description: "The tracker already covers every enquiry in the latest report.",
        });
      } else if (res.reason === "report_not_finalised") {
        toast({
          title: "Report not finalised",
          description: "Wait for the Olimey AI run to finish, then try again.",
        });
      }
    },
    onError: (err: unknown) => {
      toast({
        title: "Re-sync failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  // Auto-seed once on mount when a finalised report exists but the tracker is
  // empty. Idempotent — server returns `rounds_already_exist` on repeat calls.
  const autoSeedAttempted = useRef(false);
  useEffect(() => {
    if (autoSeedAttempted.current) return;
    if (roundsLoading) return;
    if (rounds.length > 0) return;
    if (!latestReport?.ready) return;
    autoSeedAttempted.current = true;
    seedRoundOne.mutate(undefined);
  }, [roundsLoading, rounds.length, latestReport?.ready, seedRoundOne]);

  const latestRound = rounds[rounds.length - 1];
  const openItems = allItems.filter((i) => i.status === "open" || i.status === "partially_satisfied" || i.status === "escalate");
  const satisfiedItems = allItems.filter((i) => i.status === "satisfied" || i.status === "not_applicable");
  const allSatisfied = allItems.length > 0 && openItems.length === 0;

  const readinessLabel = allItems.length === 0 ? "No Enquiries" : allSatisfied ? "Ready" : "Not Ready";
  const readinessColor = allItems.length === 0
    ? "bg-muted text-muted-foreground"
    : allSatisfied
    ? "bg-risk-green/10 text-risk-green border-risk-green/20"
    : "bg-risk-amber/10 text-risk-amber border-risk-amber/20";

  if (latestRound && expandedRound === null) setExpandedRound(latestRound.id);

  // ── Reply file handling ───────────────────────────────────────────
  // Files dropped or selected here are immediately uploaded to the
  // enquiry-replies bucket and pre-scanned by the AI to propose which open
  // enquiries each one answers. The user reviews the proposal in the
  // confirmation panel below before invoking the ingest analysis.

  const buildPendingId = (file: File) => `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;

  const uploadAndPrescan = useCallback(async (file: File): Promise<void> => {
    const localId = buildPendingId(file);
    setPendingReplies((prev) => [
      ...prev,
      {
        id: localId,
        file,
        status: "uploading",
        proposed: [],
        confirmedEnquiryIds: new Set<string>(),
      },
    ]);

    // 1. Upload to storage
    const filePath = `${caseId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("enquiry-replies")
      .upload(filePath, file);

    if (uploadError) {
      setPendingReplies((prev) =>
        prev.map((p) => p.id === localId ? { ...p, status: "failed", error: uploadError.message } : p),
      );
      toast({ title: "Upload failed", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
      return;
    }

    setPendingReplies((prev) =>
      prev.map((p) => p.id === localId ? { ...p, file_path: filePath, status: "prescanning" } : p),
    );

    // 2. Pre-scan
    try {
      const result = await prescanReplyFile({
        case_id: caseId,
        agent_type: agentType,
        file_path: filePath,
        file_name: file.name,
      });

      // Pre-tick all proposed matches by default; user can untick before analysing.
      const confirmed = new Set<string>(result.matches.map((m) => m.enquiry_id));

      setPendingReplies((prev) => prev.map((p) =>
        p.id === localId
          ? {
              ...p,
              status: "ready",
              auto_note: result.auto_note,
              suggested_classification: result.suggested_classification,
              proposed: result.matches,
              confirmedEnquiryIds: confirmed,
              prescanFailed: !!result.prescan_failed,
            }
          : p,
      ));
    } catch (e: any) {
      setPendingReplies((prev) => prev.map((p) =>
        p.id === localId
          ? {
              ...p,
              status: "ready",
              auto_note: "AI pre-scan unavailable. Please confirm enquiry mapping manually.",
              proposed: [],
              confirmedEnquiryIds: new Set<string>(),
              prescanFailed: true,
              error: e?.message,
            }
          : p,
      ));
      toast({
        title: "Pre-scan unavailable",
        description: `${file.name}: ${e?.message || "AI pre-scan failed — you can still tick enquiries manually."}`,
        variant: "destructive",
      });
    }
  }, [caseId, agentType, toast]);

  const ingestFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (!isAllowedFile(file)) {
        toast({ title: "Unsupported file", description: `${file.name} skipped.`, variant: "destructive" });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${file.name} exceeds 10MB.`, variant: "destructive" });
        continue;
      }
      // Fire-and-forget — each file uploads + pre-scans independently so the UI
      // can show progress per file without blocking other uploads.
      void uploadAndPrescan(file);
    }
  }, [toast, uploadAndPrescan]);

  const handleReplyFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await ingestFiles(Array.from(files));
    if (replyInputRef.current) replyInputRef.current.value = "";
  }, [ingestFiles]);

  const removePendingReply = (id: string) =>
    setPendingReplies((prev) => prev.filter((p) => p.id !== id));

  const toggleEnquiryConfirmation = (replyId: string, enquiryId: string, checked: boolean) => {
    setPendingReplies((prev) => prev.map((p) => {
      if (p.id !== replyId) return p;
      const next = new Set(p.confirmedEnquiryIds);
      if (checked) next.add(enquiryId); else next.delete(enquiryId);
      return { ...p, confirmedEnquiryIds: next };
    }));
  };

  // ── Drag-and-drop for replies ─────────────────────────────────────
  const handleReplyDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingReply(true);
  }, []);

  const handleReplyDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (replyDropRef.current && !replyDropRef.current.contains(e.relatedTarget as Node)) {
      setIsDraggingReply(false);
    }
  }, []);

  const handleReplyDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingReply(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await ingestFiles(Array.from(files));
  }, [ingestFiles]);

  // ── Derived: are all pending replies ready to analyse? ────────────
  const readyReplies = pendingReplies.filter((p) => p.status === "ready");
  const stillProcessing = pendingReplies.some((p) => p.status === "uploading" || p.status === "prescanning");
  const allHighConfidence = readyReplies.length > 0 && readyReplies.every((p) =>
    p.proposed.length > 0 && p.proposed.every((m) => m.confidence === "high"),
  );
  const totalConfirmedMappings = readyReplies.reduce((acc, p) => acc + p.confirmedEnquiryIds.size, 0);

  // ── Ingest replies ────────────────────────────────────────────────
  const handleIngestReplies = async () => {
    if (readyReplies.length === 0) return;
    setIsIngesting(true);
    try {
      const reply_files = await Promise.all(readyReplies.map(async (p) => {
        // Extract text inline only for plain-text formats; binary formats are
        // re-extracted server-side via ingest-file-to-text during ingestion.
        let text_content: string | undefined;
        const name = p.file.name.toLowerCase();
        if (p.file.type === "text/plain" || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) {
          text_content = await p.file.text();
        }

        const proposedIds = p.proposed.map((m) => m.enquiry_id);
        const confirmedIds = Array.from(p.confirmedEnquiryIds);
        const proposedSet = new Set(proposedIds);
        const userAddedAny = confirmedIds.some((id) => !proposedSet.has(id));
        const userRemovedAny = proposedIds.some((id) => !p.confirmedEnquiryIds.has(id));

        let mapping_source: "ai_auto_accepted" | "ai_user_corrected" | "user_added" | "general_reply" | "prescan_failed";
        if (p.prescanFailed && confirmedIds.length === 0) mapping_source = "prescan_failed";
        else if (p.prescanFailed && confirmedIds.length > 0) mapping_source = "user_added";
        else if (proposedIds.length === 0 && confirmedIds.length === 0) mapping_source = "general_reply";
        else if (proposedIds.length === 0 && confirmedIds.length > 0) mapping_source = "user_added";
        else if (!userAddedAny && !userRemovedAny) mapping_source = "ai_auto_accepted";
        else mapping_source = "ai_user_corrected";

        // Per-enquiry confidence dictionary, only for AI-proposed matches.
        const ai_confidence: Record<string, string> = {};
        for (const m of p.proposed) ai_confidence[m.enquiry_id] = m.confidence;

        return {
          file_name: p.file.name,
          file_path: p.file_path!,
          text_content,
          confirmed_enquiry_ids: confirmedIds,
          ai_proposed_enquiry_ids: proposedIds,
          ai_confidence,
          auto_note: p.auto_note,
          mapping_source,
        };
      }));

      const resp = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          case_id: caseId,
          agent_type: agentType,
          action: "ingest_replies",
          reply_files,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || "Reply ingestion failed");
      }

      const result = await resp.json();
      const sectionsCount = (result.affected_sections || []).length;
      toast({
        title: "Replies processed",
        description:
          `${result.updates_count} enquir${result.updates_count !== 1 ? "ies" : "y"} updated · ` +
          `${result.new_enquiries_count} new raised` +
          (sectionsCount > 0
            ? ` · ${sectionsCount} report section${sectionsCount !== 1 ? "s" : ""} refreshed`
            : "") +
          (result.fraud_indicators?.length
            ? ` · ⚠️ ${result.fraud_indicators.length} potential inconsistenc${result.fraud_indicators.length !== 1 ? "ies" : "y"} flagged`
            : ""),
      });

      setLastIngestSummary({
        updates_count: result.updates_count || 0,
        new_enquiries_count: result.new_enquiries_count || 0,
        affected_sections: result.affected_sections || [],
        section_rerun_triggered: !!result.section_rerun_triggered,
        round_number: result.round_number,
        at: Date.now(),
      });

      setPendingReplies([]);
      queryClient.invalidateQueries({ queryKey: ["enquiry_rounds", caseId, agentType] });
      queryClient.invalidateQueries({ queryKey: ["enquiry_items", caseId, agentType] });
    } catch (e: any) {
      toast({ title: "Ingestion failed", description: e.message, variant: "destructive" });
    } finally {
      setIsIngesting(false);
    }
  };


  // ── Generate final report ─────────────────────────────────────────
  const handleGenerateFinal = async () => {
    setIsGeneratingFinal(true);
    try {
      const resp = await fetch(INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          case_id: caseId,
          agent_type: agentType,
          action: "generate_final",
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || "Final report generation failed");
      }

      const result = await resp.json();
      setFinalReport({ client: result.final_client_report, internal: result.internal_completion_note });
      toast({ title: "Final report generated", description: "The final client report and internal completion note are ready." });
      queryClient.invalidateQueries({ queryKey: ["enquiry_rounds", caseId, agentType] });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setIsGeneratingFinal(false);
    }
  };

  // ── Override finalisation ──────────────────────────────────────────
  const handleOverride = async () => {
    if (!profile || !overrideReason.trim()) return;
    try {
      await supabase.from("enquiry_overrides" as any).insert({
        case_id: caseId, agent_type: agentType,
        open_enquiry_ids: openItems.map((i) => i.id),
        reason: overrideReason.trim(),
        user_id: profile.user_id, user_name: profile.full_name, user_email: profile.email,
      });
      await supabase.from("audit_log").insert({
        case_reference: caseReference, user_id: profile.user_id,
        user_name: profile.full_name, user_email: profile.email,
        user_position: profile.position || "",
        event_type: "enquiry_override_finalisation",
        metadata: { agent_type: agentType, open_items_count: openItems.length, reason: overrideReason.trim() },
      });
      if (latestRound) {
        await supabase.from("enquiry_rounds" as any).update({ status: "overridden" }).eq("id", latestRound.id);
      }
      toast({ title: "Override recorded", description: "Finalisation override has been logged for audit purposes." });
      setShowOverrideDialog(false);
      setOverrideReason("");
      setOverrideAcknowledged(false);
      queryClient.invalidateQueries({ queryKey: ["enquiry_rounds", caseId, agentType] });
    } catch (e: any) {
      toast({ title: "Override failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  if (roundsLoading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </CardContent>
      </Card>
    );
  }

  if (rounds.length === 0) {
    const reportReady = !!latestReport?.ready;
    const seeding = seedRoundOne.isPending;
    return (
      <Card className="border-border">
        <CardContent className="text-center py-8">
          <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            {reportReady ? "Tracker not yet seeded" : "No enquiries raised yet"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {reportReady
              ? `A finalised ${agentLabel} report is available. Seed Round 1 from its draft enquiry email to start tracking responses.`
              : `Run the initial ${agentLabel} review to generate enquiries.`}
          </p>
          {reportReady && (
            <Button
              size="sm"
              onClick={() => seedRoundOne.mutate(undefined)}
              disabled={seeding}
            >
              {seeding ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={14} />
                  Seeding Round 1…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2" size={14} />
                  Seed Round 1 from latest report
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }


  return (
    <div className="space-y-4">
      {/* Coverage gap banner — shown whenever the latest finalised report has
          unaddressed material findings, so the gap surfaces in the workflow
          where the user is most likely to act on it. */}
      <CoverageGapBanner
        coverageReport={(latestReport as any)?.coverage_report}
        finalisationStatus={latestReport?.finalisation_status}
        context="tracker"
      />

      {/* Readiness Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Enquiry Tracker — {AGENT_LABELS[agentType]}</h3>
          <Badge variant="outline" className={readinessColor}>{readinessLabel}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{satisfiedItems.length}/{allItems.length} satisfied</span>
          <span>·</span>
          <span>{rounds.length} round{rounds.length !== 1 ? "s" : ""}</span>
          {latestReport?.ready && (
            <Button
              size="sm"
              variant="outline"
              className="ml-2 h-7 px-2 text-xs"
              onClick={() => reconcileLatest.mutate()}
              disabled={reconcileLatest.isPending}
              title="Add any enquiries from the latest finalised report that aren't yet in the tracker. User-modified rows are never touched."
            >
              {reconcileLatest.isPending ? (
                <Loader2 className="animate-spin mr-1.5" size={12} />
              ) : (
                <RefreshCw className="mr-1.5" size={12} />
              )}
              Re-sync from latest report
            </Button>
          )}
        </div>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(["open", "partially_satisfied", "satisfied", "escalate", "not_applicable"] as EnquiryStatus[]).map((status) => {
          const count = allItems.filter((i) => i.status === status).length;
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} className={`rounded-lg border px-3 py-2 ${cfg.color}`}>
              <div className="flex items-center gap-1.5">
                <cfg.icon size={12} />
                <span className="text-[11px] font-semibold">{cfg.label}</span>
              </div>
              <div className="text-lg font-bold font-mono mt-0.5">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Upload Replies Section */}
      {openItems.length > 0 && (
        <Card
          ref={replyDropRef}
          className={`transition-colors duration-200 ${isDraggingReply ? "border-accent bg-accent/10 ring-2 ring-accent/30" : "border-accent/20 bg-accent/5"}`}
          onDragOver={handleReplyDragOver}
          onDragLeave={handleReplyDragLeave}
          onDrop={handleReplyDrop}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-accent" />
              <h4 className="text-sm font-semibold text-foreground">Upload Replies / New Evidence</h4>
            </div>

            {isDraggingReply ? (
              <div className="flex flex-col items-center justify-center py-6 text-accent animate-bounce">
                <Upload size={28} />
                <p className="text-sm font-medium mt-2">Drop files here</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Drag &amp; drop files here, or click to select. Each file is auto-classified by AI against your open enquiries — review the proposed mapping before analysing.
                </p>

                {/* Per-file pre-scan + confirmation cards */}
                {pendingReplies.length > 0 && (
                  <div className="space-y-2">
                    {pendingReplies.map((p) => {
                      const proposedSet = new Set(p.proposed.map((m) => m.enquiry_id));
                      const otherOpen = openItems.filter((i) => !proposedSet.has(i.id));
                      return (
                        <div
                          key={p.id}
                          className="rounded-lg border border-border bg-background/60 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <FileText size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-foreground truncate">
                                  {p.file.name}
                                </div>
                                {p.suggested_classification && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    AI classification: {p.suggested_classification.replace(/_/g, " ")}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => removePendingReply(p.id)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              disabled={isIngesting}
                              aria-label="Remove file"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {p.status === "uploading" && (
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Loader2 size={12} className="animate-spin" /> Uploading…
                            </div>
                          )}
                          {p.status === "prescanning" && (
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Sparkles size={12} className="animate-pulse" /> AI pre-scanning to detect matching enquiries…
                            </div>
                          )}
                          {p.status === "failed" && (
                            <div className="text-[11px] text-destructive">
                              Upload failed: {p.error}
                            </div>
                          )}

                          {p.status === "ready" && (
                            <>
                              {p.auto_note && (
                                <div className="text-[11px] text-muted-foreground italic border-l-2 border-accent/40 pl-2">
                                  {p.auto_note}
                                </div>
                              )}

                              {p.proposed.length > 0 ? (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                                    AI-proposed matches
                                  </div>
                                  {p.proposed.map((m) => {
                                    const item = allItems.find((i) => i.id === m.enquiry_id);
                                    const checked = p.confirmedEnquiryIds.has(m.enquiry_id);
                                    return (
                                      <label
                                        key={m.enquiry_id}
                                        className="flex items-start gap-2 text-xs cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={(v) => toggleEnquiryConfirmation(p.id, m.enquiry_id, v as boolean)}
                                          disabled={isIngesting}
                                          className="mt-0.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono font-semibold">{m.enquiry_number}</span>
                                            <Badge variant="outline" className={`text-[9px] uppercase ${CONFIDENCE_CHIP[m.confidence]}`}>
                                              {m.confidence}
                                            </Badge>
                                            {item && (
                                              <span className="text-muted-foreground">{item.category}</span>
                                            )}
                                          </div>
                                          {item && (
                                            <div className="text-[11px] text-muted-foreground line-clamp-2">
                                              {item.issue_summary}
                                            </div>
                                          )}
                                          {m.reasoning_snippet && (
                                            <div className="text-[10px] text-muted-foreground/80 italic mt-0.5">
                                              Why: {m.reasoning_snippet}
                                            </div>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-[11px] text-risk-amber bg-risk-amber/5 border border-risk-amber/20 rounded px-2 py-1.5">
                                  {p.prescanFailed
                                    ? "AI couldn't link this file to an open enquiry. Tick any relevant enquiries below, or proceed as a general reply."
                                    : "No confident match against open enquiries — tick any relevant enquiries below if needed."}
                                </div>
                              )}

                              {/* Add another enquiry — only the ones not already proposed */}
                              {otherOpen.length > 0 && (
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <button
                                      type="button"
                                      className="text-[11px] text-accent hover:underline inline-flex items-center gap-1"
                                    >
                                      <ChevronRight size={10} /> Add another enquiry
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto pl-2 border-l border-border/50">
                                      {otherOpen.map((item) => {
                                        const checked = p.confirmedEnquiryIds.has(item.id);
                                        return (
                                          <label
                                            key={item.id}
                                            className="flex items-start gap-2 text-[11px] cursor-pointer"
                                          >
                                            <Checkbox
                                              checked={checked}
                                              onCheckedChange={(v) => toggleEnquiryConfirmation(p.id, item.id, v as boolean)}
                                              disabled={isIngesting}
                                              className="mt-0.5"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <span className="font-mono font-semibold mr-1.5">{item.enquiry_number}</span>
                                              <span className="text-muted-foreground">{item.category}</span>
                                              <div className="text-muted-foreground line-clamp-1">{item.issue_summary}</div>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={replyInputRef}
                    type="file"
                    accept=".pdf,.txt,.csv,.md,.doc,.docx,.jpg,.jpeg,.png,.eml,.msg,.xls,.xlsx,.rtf"
                    multiple
                    className="hidden"
                    onChange={handleReplyFileSelect}
                  />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => replyInputRef.current?.click()} disabled={isIngesting}>
                    <FileUp size={14} />
                    {pendingReplies.length > 0 ? "Add More Files" : "Select Files"}
                  </Button>
                  {readyReplies.length > 0 && (
                    <Button
                      size="sm"
                      className={`gap-1.5 ${allHighConfidence ? "bg-risk-green text-white hover:bg-risk-green/90" : "bg-accent text-accent-foreground hover:bg-accent/90"}`}
                      onClick={handleIngestReplies}
                      disabled={isIngesting || stillProcessing}
                      title={stillProcessing ? "Waiting for pre-scan to finish" : undefined}
                    >
                      {isIngesting ? (
                        <><Loader2 size={14} className="animate-spin" /> Processing…</>
                      ) : allHighConfidence ? (
                        <><Sparkles size={14} /> Accept all &amp; Analyse {readyReplies.length}</>
                      ) : (
                        <><Sparkles size={14} /> Analyse {readyReplies.length} Repl{readyReplies.length !== 1 ? "ies" : "y"}</>
                      )}
                    </Button>
                  )}
                  {stillProcessing && (
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> Pre-scan in progress…
                    </span>
                  )}
                  {readyReplies.length > 0 && totalConfirmedMappings === 0 && (
                    <span className="text-[11px] text-risk-amber">
                      No enquiries ticked — files will be ingested as general replies.
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Post-ingest refresh banner */}
      {lastIngestSummary && (
        <div className="rounded-lg border border-risk-green/30 bg-risk-green/5 px-3 py-2.5 flex items-start gap-2.5">
          <RefreshCw size={14} className="text-risk-green mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-foreground">
              Round {lastIngestSummary.round_number} processed —
              {" "}{lastIngestSummary.updates_count} enquir{lastIngestSummary.updates_count !== 1 ? "ies" : "y"} updated
              {lastIngestSummary.new_enquiries_count > 0 && `, ${lastIngestSummary.new_enquiries_count} new raised`}
            </div>
            {lastIngestSummary.affected_sections.length > 0 ? (
              <div className="text-muted-foreground mt-0.5">
                Targeted refresh in progress for {lastIngestSummary.affected_sections.length} section
                {lastIngestSummary.affected_sections.length !== 1 ? "s" : ""}:
                {" "}
                {lastIngestSummary.affected_sections.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ", "}
                    <span className="font-medium text-foreground">{sectionLabel(s)}</span>
                  </span>
                ))}
                . Other report sections left unchanged.
              </div>
            ) : (
              <div className="text-muted-foreground mt-0.5">
                No report sections required rewriting — Decision Log updated only.
              </div>
            )}
          </div>
          <button
            onClick={() => setLastIngestSummary(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}


      {/* Rounds */}
      {rounds.map((round) => {
        const roundItems = allItems.filter((i) => i.round_id === round.id);
        const isExpanded = expandedRound === round.id;
        return (
          <Collapsible key={round.id} open={isExpanded} onOpenChange={(open) => setExpandedRound(open ? round.id : null)}>
            <Card className="border-border">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <CardTitle className="text-sm">
                        Round {round.round_number}
                        <span className="text-xs text-muted-foreground font-normal ml-2">
                          {new Date(round.created_at).toLocaleDateString("en-GB")}
                        </span>
                      </CardTitle>
                      <Badge variant="outline" className={
                        round.status === "satisfied" ? "bg-risk-green/10 text-risk-green border-risk-green/20" :
                        round.status === "overridden" ? "bg-risk-amber/10 text-risk-amber border-risk-amber/20" :
                        "bg-muted text-muted-foreground border-border"
                      }>{round.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {roundItems.length} enquir{roundItems.length !== 1 ? "ies" : "y"}
                    </span>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  {round.outstanding_summary && (
                    <div className="p-3 rounded-lg bg-risk-amber/5 border border-risk-amber/10">
                      <h4 className="text-xs font-semibold text-risk-amber mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Outstanding Enquiries Summary
                      </h4>
                      <div className="text-xs text-muted-foreground prose prose-xs max-w-none">
                        <ReactMarkdown>{round.outstanding_summary}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {roundItems.length > 0 ? (
                    <div className="space-y-2">
                      {roundItems.map((item) => {
                        const cfg = STATUS_CONFIG[item.status];
                        const isItemExpanded = expandedItem === item.id;
                        return (
                          <Collapsible key={item.id} open={isItemExpanded} onOpenChange={(open) => setExpandedItem(open ? item.id : null)}>
                            <CollapsibleTrigger asChild>
                              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border hover:bg-muted/40 transition-colors cursor-pointer">
                                <cfg.icon size={14} className="mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-mono font-semibold text-foreground">{item.enquiry_number}</span>
                                    <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                                    <span className="text-xs text-muted-foreground">{item.category}</span>
                                  </div>
                                  <p className="text-xs text-foreground mt-0.5 line-clamp-2">{stripUserFacingNoise(item.issue_summary)}</p>
                                </div>
                                {isItemExpanded ? <ChevronDown size={14} className="shrink-0 mt-1" /> : <ChevronRight size={14} className="shrink-0 mt-1" />}
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-8 mt-1 space-y-2 pb-2">
                                <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-3 text-xs">
                                  <div>
                                    <span className="font-semibold text-foreground">Original Enquiry:</span>
                                    <CleanProse value={item.original_enquiry_text} />
                                  </div>
                                  {item.evidence_required && (
                                    <div>
                                      <span className="font-semibold text-foreground">Evidence Required:</span>
                                      <CleanProse value={item.evidence_required} />
                                    </div>
                                  )}
                                  {item.reply_summary && (
                                    <div>
                                      <span className="font-semibold text-foreground">Reply Summary:</span>
                                      <CleanProse value={item.reply_summary} />
                                      {item.who_replied && (
                                        <span className="text-[10px] text-muted-foreground italic">Reply from: {item.who_replied}</span>
                                      )}
                                    </div>
                                  )}
                                  {item.evidence_received && (
                                    <div>
                                      <span className="font-semibold text-foreground">Evidence Received:</span>
                                      <CleanProse value={item.evidence_received} />
                                    </div>
                                  )}
                                  {item.next_action && (
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-foreground">Next Action:</span>
                                      <Badge variant="outline" className="text-[10px]">{item.next_action.replace(/_/g, " ")}</Badge>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                                    <span>Raised: {new Date(item.date_raised).toLocaleDateString("en-GB")}</span>
                                    <span>Updated: {new Date(item.date_last_updated).toLocaleDateString("en-GB")}</span>
                                  </div>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">No enquiry items in this round.</p>
                  )}

                  {round.internal_report && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs w-full justify-start">
                          <Eye size={12} /> View Internal Update Report
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3 rounded-lg bg-muted/10 border border-border/50 text-xs prose prose-xs max-w-none">
                          <ReactMarkdown>{stripUserFacingNoise(round.internal_report)}</ReactMarkdown>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  {round.draft_email && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs w-full justify-start">
                          <Send size={12} /> View Draft Enquiry Email
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-4 rounded-lg bg-muted/10 border border-border/50 text-xs leading-relaxed">
                          <CleanProse
                            value={round.draft_email}
                            className="text-foreground leading-relaxed"
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Final Report Display */}
      {finalReport && (
        <Card className="border-risk-green/30 bg-risk-green/5">
          <CardContent className="p-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 size={16} className="text-risk-green" />
              Final Client Report — {AGENT_LABELS[agentType]}
            </h4>
            <div className="prose prose-sm max-w-none text-xs">
              <ReactMarkdown>{finalReport.client}</ReactMarkdown>
            </div>
            <Separator />
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs w-full justify-start">
                  <Eye size={12} /> View Internal Completion Note
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-3 rounded-lg bg-muted/10 border border-border/50 text-xs prose prose-xs max-w-none">
                  <ReactMarkdown>{finalReport.internal}</ReactMarkdown>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Readiness / Actions controls */}
      {allItems.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {AGENT_LABELS[agentType]} Readiness: {readinessLabel}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {allSatisfied
                    ? "All enquiries satisfied. You may generate the final client report."
                    : `${openItems.length} enquir${openItems.length !== 1 ? "ies" : "y"} still outstanding. Upload replies to progress.`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Generate Final Report button */}
                {(allSatisfied || latestRound?.status === "overridden") && !finalReport && (
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-risk-green text-white hover:bg-risk-green/90"
                    onClick={handleGenerateFinal}
                    disabled={isGeneratingFinal}
                  >
                    {isGeneratingFinal ? (
                      <><Loader2 size={12} className="animate-spin" /> Generating…</>
                    ) : (
                      <><FileDown size={12} /> Generate Final Client Report</>
                    )}
                  </Button>
                )}

                {/* Override */}
                {!allSatisfied && (
                  <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs border-risk-amber/30 text-risk-amber hover:bg-risk-amber/10">
                        <Shield size={12} /> Override & Finalise
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-risk-amber">
                          <AlertTriangle size={18} /> Override Finalisation Warning
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              <strong className="text-foreground">{openItems.length} enquir{openItems.length !== 1 ? "ies" : "y"}</strong> remain{openItems.length === 1 ? "s" : ""} unresolved.
                              Proceeding will generate a final report with open items flagged. This action will be recorded in the audit log.
                            </p>
                            <div className="space-y-2">
                              <Label htmlFor="override-reason" className="text-xs font-semibold">Reason for override (required)</Label>
                              <Textarea
                                id="override-reason"
                                placeholder="Explain why finalisation is appropriate despite outstanding enquiries..."
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                className="text-xs min-h-[80px]"
                              />
                            </div>
                            <div className="flex items-start gap-2">
                              <Checkbox id="override-ack" checked={overrideAcknowledged} onCheckedChange={(checked) => setOverrideAcknowledged(checked as boolean)} />
                              <Label htmlFor="override-ack" className="text-xs text-muted-foreground leading-relaxed">
                                I confirm that I have exercised independent professional judgement and accept responsibility for finalising this report with outstanding enquiries. I understand this will be recorded in the audit log.
                              </Label>
                            </div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleOverride}
                          disabled={!overrideReason.trim() || !overrideAcknowledged}
                          className="bg-risk-amber text-white hover:bg-risk-amber/90"
                        >
                          <Shield size={14} className="mr-1.5" /> Confirm Override
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

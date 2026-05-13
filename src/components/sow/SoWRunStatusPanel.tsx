/**
 * SoWRunStatusPanel — single-surface live status for a SoW run.
 *
 * Pure presentational. All signals are derived in `useSoWSubmit` and passed in.
 * Renders the explicit run state (preparing → extracting → analysing →
 * consolidating → complete / timed-out / failed / cancelled) with proportionate,
 * non-prosecutorial copy and audit-friendly counters (run id, attempts, retries).
 *
 * Read-only post-completion: a small react-query lookup reads the latest
 * `ai_reports.consolidation_attempts` for the case so a page refresh after a
 * completed run still shows the honest attempts count.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  X,
  Send,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type RunPhase =
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

export interface RunPhaseDetail {
  current?: number;
  total?: number;
  attempt?: number;
  model?: string;
}

interface ChunkFailureState {
  failed: boolean;
  message: string;
  retryFn: () => void;
}

/**
 * Frozen snapshot of preserved progress at the instant consolidation timed out.
 * Mirrors `SoWPreservedSnapshot` from useSoWSubmit. Kept as a local interface to
 * avoid a runtime import from the hook into a presentational component.
 */
export interface PreservedSnapshot {
  capturedAt: number;
  docsExtracted: number;
  docsTotal: number;
  batchesCompleted: number;
  batchesTotal: number;
  batchRetryRounds: number;
  consolidationElapsedSec: number;
  preservedCharCount: number;
}

interface SoWRunStatusPanelProps {
  runPhase: RunPhase;
  detail: RunPhaseDetail;
  elapsedSeconds: number;
  runId: string | null;
  chunkRetryRound: number;
  consolidationAttempts: number;
  hasPendingConsolidation: boolean;
  chunkFailureState: ChunkFailureState | null;
  caseId?: string | null;
  preservedSnapshot?: PreservedSnapshot | null;
  onRetryConsolidation: () => void;
  onCancel: () => void;
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0s";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, Math.floor(totalSeconds % 60));
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

interface PhasePresentation {
  label: string;
  tone: "neutral" | "info" | "warn" | "error" | "success";
  Icon: typeof Loader2;
  spin?: boolean;
}

function presentPhase(phase: RunPhase, detail: RunPhaseDetail): PhasePresentation {
  switch (phase) {
    case "preparing":
      return { label: "Preparing", tone: "neutral", Icon: Loader2, spin: true };
    case "extracting": {
      const counts = detail.total ? ` ${detail.current ?? 0} / ${detail.total}` : "";
      return { label: `Extracting documents${counts}`, tone: "info", Icon: Loader2, spin: true };
    }
    case "analysing": {
      const counts = detail.total ? ` ${detail.current ?? 0} / ${detail.total}` : "";
      return { label: `Analysing batches${counts}`, tone: "info", Icon: Loader2, spin: true };
    }
    case "retrying-batches": {
      const round = detail.attempt ? ` (attempt ${detail.attempt})` : "";
      return { label: `Retrying failed batches${round}`, tone: "warn", Icon: RefreshCw, spin: true };
    }
    case "consolidating": {
      const model = detail.model ? ` (${detail.model})` : "";
      const attempt = detail.attempt && detail.attempt > 1 ? ` · attempt ${detail.attempt}` : "";
      return { label: `Consolidating${model}${attempt}`, tone: "info", Icon: Sparkles, spin: false };
    }
    case "retrying-consolidation":
      return {
        label: `Retrying consolidation${detail.attempt ? ` · attempt ${detail.attempt}` : ""}`,
        tone: "warn",
        Icon: RefreshCw,
        spin: true,
      };
    case "timed-out":
      return { label: "Consolidation timed out — batch results preserved", tone: "warn", Icon: AlertTriangle };
    case "failed":
      return { label: "Run failed", tone: "error", Icon: XCircle };
    case "complete":
      return { label: "Run complete", tone: "success", Icon: CheckCircle2 };
    case "cancelled":
      return { label: "Run cancelled", tone: "neutral", Icon: XCircle };
    case "idle":
    default:
      return { label: "Idle", tone: "neutral", Icon: Clock };
  }
}

function toneClasses(tone: PhasePresentation["tone"]) {
  switch (tone) {
    case "info":
      return { dot: "bg-accent", text: "text-foreground", border: "border-accent/30", bg: "bg-accent/5" };
    case "warn":
      return { dot: "bg-risk-amber", text: "text-foreground", border: "border-risk-amber/40", bg: "bg-risk-amber/5" };
    case "error":
      return { dot: "bg-destructive", text: "text-foreground", border: "border-destructive/40", bg: "bg-destructive/5" };
    case "success":
      return { dot: "bg-[hsl(var(--risk-green))]", text: "text-foreground", border: "border-border", bg: "bg-card" };
    case "neutral":
    default:
      return { dot: "bg-muted-foreground", text: "text-muted-foreground", border: "border-border", bg: "bg-muted/20" };
  }
}

export default function SoWRunStatusPanel({
  runPhase,
  detail,
  elapsedSeconds,
  runId,
  chunkRetryRound,
  consolidationAttempts,
  hasPendingConsolidation,
  chunkFailureState,
  caseId,
  preservedSnapshot,
  onRetryConsolidation,
  onCancel,
}: SoWRunStatusPanelProps) {
  // After a run completes (or after a refresh), source the persisted attempts
  // count from ai_reports so the panel stays honest across reloads.
  const { data: latestReport } = useQuery({
    queryKey: ["ai_report_status", caseId],
    queryFn: async () => {
      if (!caseId) return null;
      const { data, error } = await supabase
        .from("ai_reports")
        .select("id, consolidation_attempts, ai_run_id, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[SoWRunStatusPanel] could not load latest ai_report:", error.message);
        return null;
      }
      return data;
    },
    enabled: !!caseId && (runPhase === "complete" || runPhase === "idle"),
    staleTime: 10_000,
  });

  // A "live" run is one where work is actively in flight on the client.
  // timed-out / failed / cancelled / complete / idle are all terminal/paused.
  const liveRunPhases: RunPhase[] = [
    "preparing", "extracting", "analysing",
    "retrying-batches", "consolidating", "retrying-consolidation",
  ];
  const isLiveRun = liveRunPhases.includes(runPhase);
  const effectiveAttempts =
    consolidationAttempts > 0
      ? consolidationAttempts
      : latestReport?.consolidation_attempts ?? 0;

  const presentation = useMemo(() => presentPhase(runPhase, detail), [runPhase, detail]);
  const tone = toneClasses(presentation.tone);
  const { Icon, spin, label } = presentation;

  // Hide entirely when idle and there is no persisted history to report,
  // and no in-memory pending state to surface.
  if (
    runPhase === "idle" &&
    !hasPendingConsolidation &&
    !chunkFailureState?.failed &&
    !latestReport
  ) {
    return null;
  }

  const showRetryConsolidation =
    !isLiveRun && (runPhase === "timed-out" || hasPendingConsolidation);

  const showCancel = isLiveRun;

  return (
    <Card className={`p-4 space-y-3 ${tone.border} ${tone.bg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="relative flex h-2 w-2 mt-1.5 shrink-0">
            {isLiveRun && (
              <span className={`absolute inline-flex h-full w-full rounded-full ${tone.dot} opacity-60 animate-ping`} />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${tone.dot}`} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon size={14} className={spin ? "animate-spin" : ""} aria-hidden />
              <span className="truncate">{label}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono tabular-nums">
              {runId ? <>Run: <span className="text-foreground/80">{runId}</span></> : <span>SoW Run Status</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLiveRun && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono tabular-nums">
              <Clock size={11} /> {formatDuration(elapsedSeconds)}
            </span>
          )}
          {showCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onCancel}
            >
              <X size={12} className="mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Status meta row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {chunkRetryRound > 0 && (
          <Badge variant="outline" className="border-risk-amber/40 text-foreground">
            Batch retries: {chunkRetryRound}
          </Badge>
        )}
        {(effectiveAttempts > 0 || runPhase === "consolidating" || runPhase === "retrying-consolidation") && (
          <Badge variant="outline" className="border-border text-foreground">
            Consolidation attempts: {Math.max(effectiveAttempts, detail.attempt ?? 0)}
          </Badge>
        )}
        {runPhase === "complete" && latestReport?.ai_run_id && latestReport.ai_run_id !== runId && (
          <Badge variant="outline" className="border-border text-muted-foreground">
            Saved report present
          </Badge>
        )}
      </div>

      {/* Preserved-progress snapshot — only on timed-out, captured at catch */}
      {runPhase === "timed-out" && preservedSnapshot && (
        <div className="rounded-md border border-risk-amber/30 bg-risk-amber/5 px-3 py-2.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-foreground font-medium">
            <span>Preserved progress</span>
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
              snapshot at {new Intl.DateTimeFormat(undefined, {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
              }).format(new Date(preservedSnapshot.capturedAt))}
            </span>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-muted-foreground">Documents extracted</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {preservedSnapshot.docsExtracted} / {preservedSnapshot.docsTotal}
            </dd>
            <dt className="text-muted-foreground">Batches analysed</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {preservedSnapshot.batchesCompleted} / {preservedSnapshot.batchesTotal}
              {preservedSnapshot.batchRetryRounds > 0 && (
                <span className="text-muted-foreground">
                  {" "}({preservedSnapshot.batchRetryRounds} retry round{preservedSnapshot.batchRetryRounds === 1 ? "" : "s"})
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Consolidation</dt>
            <dd className="font-mono tabular-nums text-foreground">
              timed out after {formatDuration(preservedSnapshot.consolidationElapsedSec)}
            </dd>
            <dt className="text-muted-foreground">Saved batch results</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {preservedSnapshot.preservedCharCount > 0
                ? `~${(Math.round(preservedSnapshot.preservedCharCount / 100) * 100).toLocaleString()} chars preserved`
                : "none preserved"}
            </dd>
          </dl>
        </div>
      )}

      {/* Action row — retry consolidation surfaced here, not duplicated elsewhere */}
      {showRetryConsolidation && (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Batch results are preserved. Retry to produce a single consolidated report.
          </span>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={onRetryConsolidation}>
            <Sparkles size={12} /> Retry Consolidation
          </Button>
        </div>
      )}

      {/* Action row — failed batches retry */}
      {chunkFailureState?.failed && (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
          <span className="text-xs text-foreground">{chunkFailureState.message}</span>
          <Button size="sm" variant="destructive" className="h-8 text-xs gap-1.5" onClick={chunkFailureState.retryFn}>
            <Send size={12} /> Retry All Failed Batches
          </Button>
        </div>
      )}
    </Card>
  );
}

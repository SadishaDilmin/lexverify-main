import { useState, useEffect } from "react";
import { Clock, X, FileText, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { DocProcessingItem } from "@/components/sow/sowHelpers";

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface TimedProgressBarProps {
  /** Status text shown beside the pulsing dot */
  status: string;
  /** Overall progress 0-100. Falls back to extraction-based or default 15% */
  overallProgress?: number;
  /** Optional extraction-level progress (current/total items) */
  extractionProgress?: { current: number; total: number };
  /** Timestamp (ms) when work started — used for elapsed + estimated remaining */
  startTime: number;
  /** Called when Cancel is clicked. Omit to hide cancel button. */
  onCancel?: () => void;
  /** Per-document processing status for live tracking */
  docItems?: DocProcessingItem[];
}

export default function TimedProgressBar({
  status,
  overallProgress = 0,
  extractionProgress,
  startTime,
  onCancel,
  docItems,
}: TimedProgressBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!startTime) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const hasDocItems = docItems && docItems.length > 0;
  const doneCount = docItems?.filter(d => d.state === "done").length ?? 0;
  const extractingItems = docItems?.filter(d => d.state === "extracting") ?? [];
  const errorCount = docItems?.filter(d => d.state === "error").length ?? 0;
  const allDocsFinished = hasDocItems && extractingItems.length === 0 && docItems!.every(d => d.state === "done" || d.state === "error");

  // Base progress from props
  const basePct = overallProgress > 0
    ? overallProgress
    : extractionProgress && extractionProgress.total > 0
      ? (extractionProgress.current / extractionProgress.total) * 100
      : 15;

  // When docs are all extracted but analysis is still running, smoothly
  // advance from the base percentage toward 95% over time so users see movement.
  const [animatedPct, setAnimatedPct] = useState(basePct);

  useEffect(() => {
    if (!allDocsFinished || basePct >= 95) {
      setAnimatedPct(basePct);
      return;
    }
    const analysisStart = Date.now();
    const startPct = basePct;
    const targetPct = 95;
    const tick = () => {
      const analysisSecs = (Date.now() - analysisStart) / 1000;
      const factor = 1 - Math.exp(-analysisSecs / 120);
      setAnimatedPct(Math.min(targetPct, startPct + (targetPct - startPct) * factor));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [allDocsFinished, basePct]);

  const pct = allDocsFinished ? animatedPct : basePct;
  const displayedPct = Math.round(pct);

  const estimatedRemaining = pct > 5 && elapsed > 3
    ? Math.max(0, Math.round((elapsed / pct) * (100 - pct)))
    : null;

  return (
    <div className="space-y-2 px-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          <span className="text-foreground font-medium">{status}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground font-mono tabular-nums">
            <Clock size={11} />
            <span>{formatDuration(elapsed)}</span>
            {estimatedRemaining !== null && (
              <span className="text-muted-foreground/70">· ~{formatDuration(estimatedRemaining)} left</span>
            )}
          </div>
          {displayedPct > 0 && (
            <span className="text-muted-foreground font-mono tabular-nums">{displayedPct}%</span>
          )}
          {onCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onCancel}
            >
              <X size={12} className="mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>
      <Progress
        value={pct}
        className="h-1.5 bg-muted rounded-full"
      />

      {/* Per-document processing list */}
      {hasDocItems && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="font-medium">
              {allDocsFinished ? (
                <>✅ All {docItems!.length} documents extracted — AI analysis in progress…</>
              ) : (
                <>
                  {doneCount}/{docItems!.length} documents extracted
                  {errorCount > 0 && <span className="text-destructive ml-1">({errorCount} failed)</span>}
                </>
              )}
            </span>
          </button>

          {expanded && (
            <div className="mt-1.5 max-h-[180px] overflow-y-auto space-y-0.5 rounded-lg border border-border/40 bg-card/50 p-2">
              {/* Show currently extracting first, then queued, then done */}
              {[...docItems!]
                .sort((a, b) => {
                  const order = { extracting: 0, queued: 1, error: 2, done: 3 };
                  return (order[a.state] ?? 4) - (order[b.state] ?? 4);
                })
                .map((item, i) => (
                  <div
                    key={`${item.name}-${i}`}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-all ${
                      item.state === "extracting"
                        ? "bg-accent/10 border border-accent/20"
                        : item.state === "error"
                        ? "bg-destructive/5"
                        : ""
                    }`}
                  >
                    {item.state === "done" && (
                      <CheckCircle2 size={12} className="text-[hsl(var(--risk-green))] shrink-0" />
                    )}
                    {item.state === "extracting" && (
                      <Loader2 size={12} className="text-accent shrink-0 animate-spin" />
                    )}
                    {item.state === "error" && (
                      <AlertCircle size={12} className="text-destructive shrink-0" />
                    )}
                    {item.state === "queued" && (
                      <FileText size={12} className="text-muted-foreground/50 shrink-0" />
                    )}
                    <span
                      className={`truncate flex-1 ${
                        item.state === "extracting"
                          ? "text-foreground font-medium"
                          : item.state === "done"
                          ? "text-muted-foreground"
                          : item.state === "error"
                          ? "text-destructive"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {item.name}
                    </span>
                    {item.state === "extracting" && item.startedAt && (
                      <LiveTimer startedAt={item.startedAt} />
                    )}
                    {item.state === "done" && item.startedAt && item.finishedAt && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums shrink-0">
                        {formatDuration(Math.round((item.finishedAt - item.startedAt) / 1000))}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small live timer for documents currently being processed */
function LiveTimer({ startedAt }: { startedAt: number }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => setSecs(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <span className="text-[10px] text-accent font-mono tabular-nums shrink-0">
      {formatDuration(secs)}
    </span>
  );
}

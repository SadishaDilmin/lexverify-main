/**
 * SectionFindingCard — single-finding row inside the SectionCompliance sidebar.
 *
 * Shows the open finding with reviewer actions (Dismiss, Accept as-is, Promote,
 * Ask AI to address) OR the resolved-state chip with reviewer + timestamp +
 * Undo button. When a finding has an `ai_addressed` draft, the reviewer can
 * one-click "Merge into report" — the edge function appends the snippet into
 * internal_report / client_report / draft_email and snapshots the prior text
 * so Undo restores it deterministically.
 *
 * State is derived from the resolution chain on the parent. Pure presentational —
 * all writes go through the `resolveFinding` wrapper passed in as `onAction`.
 */
import { useState } from "react";
import { Loader2, Check, X, ArrowUpRight, Sparkles, Undo2, Copy, GitMerge, AlertCircle } from "lucide-react";
import type {
  SectionFinding,
  SectionResolution,
  SectionResolutionAction,
} from "@/lib/sowSectionValidator";

interface SectionFindingCardProps {
  finding: SectionFinding;
  /** Latest non-reverted resolution for this finding, or null if open. */
  resolution: SectionResolution | null;
  /** Disabled when there is no persisted aiReportId to attach the resolution to. */
  canResolve: boolean;
  onAction: (
    action: SectionResolutionAction,
    opts?: { revertsResolutionId?: string; sourceResolutionId?: string },
  ) => Promise<void>;
}

const SEVERITY_STYLE: Record<SectionFinding["severity"], { border: string; text: string }> = {
  critical: { border: "border-[hsl(var(--risk-red))]/30 bg-[hsl(var(--risk-red))]/5", text: "text-[hsl(var(--risk-red))]" },
  high: { border: "border-[hsl(var(--risk-amber))]/30 bg-[hsl(var(--risk-amber))]/5", text: "text-[hsl(var(--risk-amber))]" },
  medium: { border: "border-border bg-muted/30", text: "text-muted-foreground" },
};

const ACTION_LABEL: Record<SectionResolutionAction, string> = {
  dismissed: "Dismissed",
  accepted_as_is: "Accepted as-is",
  promoted: "Promoted to enquiry",
  ai_addressed: "AI-drafted correction",
  ai_merged: "AI draft merged into report",
  reverted: "Reverted",
};

const FIELD_LABEL: Record<string, string> = {
  internal_report: "Internal report",
  client_report: "Client report",
  draft_email: "Draft enquiry email",
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}

export default function SectionFindingCard({
  finding,
  resolution,
  canResolve,
  onAction,
}: SectionFindingCardProps) {
  const [busy, setBusy] = useState<SectionResolutionAction | null>(null);
  const [showAiDetail, setShowAiDetail] = useState(false);
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const style = SEVERITY_STYLE[finding.severity] ?? SEVERITY_STYLE.medium;

  const trigger = async (
    action: SectionResolutionAction,
    opts?: { revertsResolutionId?: string; sourceResolutionId?: string },
  ) => {
    if (busy) return;
    setBusy(action);
    try {
      await onAction(action, opts);
      if (action === "ai_merged") setConfirmingMerge(false);
    } finally {
      setBusy(null);
    }
  };

  // ── Resolved view ──────────────────────────────────────────────
  if (resolution) {
    const aiOutput = resolution.action === "ai_addressed" ? (resolution.ai_output as Record<string, unknown> | null) : null;
    const addedEnquiry = aiOutput && typeof aiOutput.added_enquiry === "string" ? aiOutput.added_enquiry : "";
    const decisionLog = aiOutput && typeof aiOutput.decision_log_entry === "string" ? aiOutput.decision_log_entry : "";
    const reportAmend = aiOutput && typeof aiOutput.report_amendment === "string" ? aiOutput.report_amendment : "";
    const aiError = aiOutput && typeof aiOutput.error === "string" ? aiOutput.error : "";
    const hasMergeableContent = !aiError && (reportAmend.trim().length > 0 || addedEnquiry.trim().length > 0);

    // Merged-state extras
    const mergedFields = resolution.action === "ai_merged" && Array.isArray((resolution as any).merged_fields)
      ? ((resolution as any).merged_fields as string[])
      : [];

    return (
      <div className={`min-w-0 rounded-lg border p-2.5 ${style.border}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-[9px] font-bold uppercase ${style.text}`}>{finding.severity}</span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80">·</span>
              <span className="text-[9px] font-semibold uppercase text-foreground/70">{ACTION_LABEL[resolution.action]}</span>
            </div>
            <p className="break-words text-[11px] font-medium text-foreground leading-snug">{finding.section}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-1">
              {resolution.resolved_by_name ?? "Reviewer"} · {formatTimestamp(resolution.resolved_at)}
            </p>
            {resolution.note && (
              <p className="break-words text-[10px] text-muted-foreground leading-snug mt-1 italic">"{resolution.note}"</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => trigger("reverted", { revertsResolutionId: resolution.id })}
            disabled={busy !== null || !canResolve}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label={resolution.action === "ai_merged" ? "Undo merge and restore prior report text" : "Undo resolution"}
            title={resolution.action === "ai_merged" ? "Undo merge — restores the prior report text" : "Undo resolution"}
          >
            {busy === "reverted" ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
            Undo
          </button>
        </div>

        {/* Merged-state summary: which fields the merge touched */}
        {resolution.action === "ai_merged" && mergedFields.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground">
              Merged into:{" "}
              <span className="font-semibold text-foreground">
                {mergedFields.map((f) => FIELD_LABEL[f] ?? f).join(", ")}
              </span>
            </p>
            <p className="text-[9px] text-muted-foreground/80 italic mt-0.5">
              Undo restores the prior text exactly. The original AI draft remains in the resolution history.
            </p>
          </div>
        )}

        {resolution.action === "ai_addressed" && (
          <div className="mt-2 pt-2 border-t border-border/50">
            {aiError ? (
              <p className="text-[10px] text-[hsl(var(--risk-red))]">AI draft failed: {aiError}</p>
            ) : (
              <>
                {/* Auto-merge action — primary CTA, with confirm step. */}
                {hasMergeableContent && canResolve && (
                  <div className="mb-2">
                    {!confirmingMerge ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingMerge(true)}
                        disabled={busy !== null}
                        className="w-full inline-flex items-center justify-center gap-1.5 text-[10px] px-2 py-1.5 rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15 font-semibold disabled:opacity-50"
                      >
                        <GitMerge size={11} /> Merge into report
                      </button>
                    ) : (
                      <div className="rounded border border-accent/40 bg-accent/5 p-2 space-y-1.5">
                        <p className="text-[10px] text-foreground leading-snug flex items-start gap-1">
                          <AlertCircle size={11} className="text-accent shrink-0 mt-0.5" />
                          <span>
                            This will append the AI draft to the{" "}
                            <strong>internal report</strong>, <strong>client report</strong>, and{" "}
                            <strong>draft enquiry email</strong>. Undo restores the prior text exactly.
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => setConfirmingMerge(false)}
                            disabled={busy !== null}
                            className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => trigger("ai_merged", { sourceResolutionId: resolution.id })}
                            disabled={busy !== null}
                            className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded border border-accent/40 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold disabled:opacity-50"
                          >
                            {busy === "ai_merged" ? <Loader2 size={10} className="animate-spin" /> : <GitMerge size={10} />}
                            Confirm merge
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowAiDetail((v) => !v)}
                  className="text-[10px] text-foreground/70 hover:text-foreground underline"
                >
                  {showAiDetail ? "Hide" : "Show"} AI-drafted proposal (review before merging)
                </button>
                {showAiDetail && (
                  <div className="mt-2 space-y-2">
                    {addedEnquiry && (
                      <div className="rounded border border-border bg-background p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] uppercase font-semibold text-muted-foreground">Draft enquiry</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(addedEnquiry)}
                            className="inline-flex items-center gap-1 text-[10px] text-foreground/70 hover:text-foreground"
                          >
                            <Copy size={10} /> Copy
                          </button>
                        </div>
                        <p className="text-[11px] text-foreground whitespace-pre-wrap break-words leading-snug">{addedEnquiry}</p>
                      </div>
                    )}
                    {decisionLog && (
                      <div className="rounded border border-border bg-background p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] uppercase font-semibold text-muted-foreground">Decision log entry</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(decisionLog)}
                            className="inline-flex items-center gap-1 text-[10px] text-foreground/70 hover:text-foreground"
                          >
                            <Copy size={10} /> Copy
                          </button>
                        </div>
                        <p className="text-[11px] text-foreground whitespace-pre-wrap break-words leading-snug">{decisionLog}</p>
                      </div>
                    )}
                    {reportAmend && (
                      <div className="rounded border border-border bg-background p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] uppercase font-semibold text-muted-foreground">Suggested amendment</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(reportAmend)}
                            className="inline-flex items-center gap-1 text-[10px] text-foreground/70 hover:text-foreground"
                          >
                            <Copy size={10} /> Copy
                          </button>
                        </div>
                        <p className="text-[11px] text-foreground whitespace-pre-wrap break-words leading-snug">{reportAmend}</p>
                      </div>
                    )}
                    <p className="text-[9px] text-muted-foreground italic">
                      Use "Merge into report" to apply this automatically, or copy the text above to merge manually.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Open view ──────────────────────────────────────────────────
  return (
    <div className={`min-w-0 rounded-lg border p-2.5 ${style.border}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[9px] font-bold uppercase ${style.text}`}>{finding.severity}</span>
      </div>
      <p className="break-words text-[11px] font-medium text-foreground leading-snug">{finding.section}</p>
      <p className="break-words text-[10px] text-muted-foreground leading-snug mt-0.5">{finding.reason}</p>
      {finding.expectedBehaviour && (
        <p className="break-words text-[10px] text-muted-foreground/80 leading-snug mt-1 italic">
          Expected: {finding.expectedBehaviour}
        </p>
      )}

      {!canResolve && (
        <p className="text-[10px] text-muted-foreground/80 italic mt-2">
          Save the report to enable reviewer actions.
        </p>
      )}

      {canResolve && (
        <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => trigger("dismissed")}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy === "dismissed" ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => trigger("accepted_as_is")}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy === "accepted_as_is" ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            Accept as-is
          </button>
          <button
            type="button"
            onClick={() => trigger("promoted")}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy === "promoted" ? <Loader2 size={10} className="animate-spin" /> : <ArrowUpRight size={10} />}
            Promote
          </button>
          <button
            type="button"
            onClick={() => trigger("ai_addressed")}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {busy === "ai_addressed" ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            Ask AI
          </button>
        </div>
      )}
    </div>
  );
}

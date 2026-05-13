/**
 * SectionFindingStrip — inline finding row rendered inside the matching
 * report section (replaces the right-hand SectionCompliance sidebar in the
 * Internal Report view).
 *
 * Reuses the same resolution actions as SectionFindingCard but is laid out
 * as a single, wide strip with action buttons on the right. After an
 * `ai_addressed` draft is generated, two routing buttons appear:
 *   - Merge into Report  → calls `ai_merged` with target=internal_report
 *   - Add to Draft Email → calls `ai_merged` with target=draft_email and
 *                          asks the parent to switch to the Email tab.
 * Promote / Accept-as-is / Dismiss collapse the strip to a one-line audit
 * receipt with Undo. "Promoted" links to the SoW Tracker tab.
 *
 * Pure presentation. All writes go through the parent `onAction` (which
 * wraps `resolveFinding`).
 */
import { useState } from "react";
import {
  Loader2, Check, X, ArrowUpRight, Sparkles, Undo2, GitMerge, Mail, AlertCircle,
} from "lucide-react";
import type {
  SectionFinding,
  SectionResolution,
  SectionResolutionAction,
} from "@/lib/sowSectionValidator";

interface SectionFindingStripProps {
  finding: SectionFinding;
  resolution: SectionResolution | null;
  canResolve: boolean;
  onAction: (
    action: SectionResolutionAction,
    opts?: {
      revertsResolutionId?: string;
      sourceResolutionId?: string;
      note?: string;
    },
  ) => Promise<void>;
  /** Switch the case workspace to the SoW Tracker tab. */
  onOpenTracker?: () => void;
  /** Switch the case workspace to the SoW Email tab. */
  onOpenEmail?: () => void;
}

const SEVERITY_STYLE: Record<SectionFinding["severity"], { bar: string; chip: string }> = {
  critical: {
    bar: "bg-destructive",
    chip: "bg-destructive/10 text-destructive border-destructive/30",
  },
  high: {
    bar: "bg-risk-amber",
    chip: "bg-risk-amber/10 text-risk-amber border-risk-amber/30",
  },
  medium: {
    bar: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground border-border",
  },
};

const ACTION_LABEL: Record<SectionResolutionAction, string> = {
  dismissed: "Dismissed",
  accepted_as_is: "Accepted as-is",
  promoted: "Promoted to enquiry",
  ai_addressed: "AI draft ready",
  ai_merged: "AI draft merged",
  reverted: "Reverted",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function SectionFindingStrip({
  finding,
  resolution,
  canResolve,
  onAction,
  onOpenTracker,
  onOpenEmail,
}: SectionFindingStripProps) {
  const [busy, setBusy] = useState<SectionResolutionAction | null>(null);
  const [showAiDetail, setShowAiDetail] = useState(false);
  const style = SEVERITY_STYLE[finding.severity] ?? SEVERITY_STYLE.medium;

  const trigger = async (
    action: SectionResolutionAction,
    opts?: { revertsResolutionId?: string; sourceResolutionId?: string; note?: string },
  ) => {
    if (busy) return;
    setBusy(action);
    try {
      await onAction(action, opts);
    } finally {
      setBusy(null);
    }
  };

  // ── Resolved view ──────────────────────────────────────────────
  if (resolution && resolution.action !== "ai_addressed") {
    const isPromoted = resolution.action === "promoted";
    const isMerged = resolution.action === "ai_merged";
    return (
      <div className={`relative flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 pl-3 pr-2 py-1.5`}>
        <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${style.bar} opacity-60`} />
        <Check size={12} className="text-muted-foreground shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-tight flex-1 min-w-0 truncate">
          <span className="font-medium text-foreground">{ACTION_LABEL[resolution.action]}</span>
          {" · "}
          {finding.section}
          {" · "}
          {resolution.resolved_by_name ?? "Reviewer"} · {formatTimestamp(resolution.resolved_at)}
        </p>
        {isPromoted && onOpenTracker && (
          <button
            type="button"
            onClick={onOpenTracker}
            className="text-[10px] text-accent hover:underline shrink-0 inline-flex items-center gap-1"
          >
            View in Tracker <ArrowUpRight size={10} />
          </button>
        )}
        {isMerged && onOpenEmail && (
          <button
            type="button"
            onClick={onOpenEmail}
            className="text-[10px] text-accent hover:underline shrink-0 inline-flex items-center gap-1"
          >
            View in Email <ArrowUpRight size={10} />
          </button>
        )}
        <button
          type="button"
          onClick={() => trigger("reverted", { revertsResolutionId: resolution.id })}
          disabled={busy !== null || !canResolve}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {busy === "reverted" ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />}
          Undo
        </button>
      </div>
    );
  }

  // ── AI-addressed view (draft ready, awaiting routing decision) ──
  if (resolution && resolution.action === "ai_addressed") {
    const aiOutput = (resolution.ai_output as Record<string, unknown> | null) ?? {};
    const addedEnquiry = typeof aiOutput.added_enquiry === "string" ? aiOutput.added_enquiry : "";
    const reportAmend = typeof aiOutput.report_amendment === "string" ? aiOutput.report_amendment : "";
    const aiError = typeof aiOutput.error === "string" ? aiOutput.error : "";
    const canMergeReport = !aiError && reportAmend.trim().length > 0;
    const canAddEmail = !aiError && addedEnquiry.trim().length > 0;

    return (
      <div className={`relative rounded-md border border-accent/30 bg-accent/5 pl-3 pr-3 py-2 space-y-2`}>
        <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${style.bar}`} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <Sparkles size={11} className="text-accent" />
              <span className="text-[10px] font-bold uppercase text-accent">AI draft ready</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] font-medium text-foreground/80">{finding.section}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => trigger("reverted", { revertsResolutionId: resolution.id })}
            disabled={busy !== null}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {busy === "reverted" ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />}
            Discard
          </button>
        </div>

        {aiError ? (
          <p className="text-[11px] text-destructive flex items-start gap-1.5">
            <AlertCircle size={11} className="mt-0.5 shrink-0" /> {aiError}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowAiDetail((v) => !v)}
              className="text-[10px] text-foreground/70 hover:text-foreground underline"
            >
              {showAiDetail ? "Hide" : "Show"} AI-drafted proposal
            </button>
            {showAiDetail && (
              <div className="space-y-1.5 pt-1">
                {addedEnquiry && (
                  <div className="rounded border border-border bg-background/80 p-2">
                    <p className="text-[9px] uppercase font-semibold text-muted-foreground mb-0.5">Suggested enquiry</p>
                    <p className="text-[11px] text-foreground whitespace-pre-wrap leading-snug">{addedEnquiry}</p>
                  </div>
                )}
                {reportAmend && (
                  <div className="rounded border border-border bg-background/80 p-2">
                    <p className="text-[9px] uppercase font-semibold text-muted-foreground mb-0.5">Suggested amendment</p>
                    <p className="text-[11px] text-foreground whitespace-pre-wrap leading-snug">{reportAmend}</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {canMergeReport && (
                <button
                  type="button"
                  onClick={() => trigger("ai_merged", {
                    sourceResolutionId: resolution.id,
                    note: "target_field=internal_report",
                  })}
                  disabled={busy !== null || !canResolve}
                  className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border border-accent/40 bg-accent text-accent-foreground hover:bg-accent/90 font-semibold disabled:opacity-50"
                >
                  {busy === "ai_merged" ? <Loader2 size={10} className="animate-spin" /> : <GitMerge size={10} />}
                  Merge into Report
                </button>
              )}
              {canAddEmail && (
                <button
                  type="button"
                  onClick={async () => {
                    await trigger("ai_merged", {
                      sourceResolutionId: resolution.id,
                      note: "target_field=draft_email",
                    });
                    onOpenEmail?.();
                  }}
                  disabled={busy !== null || !canResolve}
                  className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border border-accent/40 bg-background text-accent hover:bg-accent/10 font-semibold disabled:opacity-50"
                >
                  <Mail size={10} />
                  Add to Draft Email
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Open view ──────────────────────────────────────────────────
  return (
    <div className={`relative rounded-md border border-border/70 bg-card pl-3 pr-3 py-2`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${style.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${style.chip}`}>
              {finding.severity}
            </span>
            <span className="text-[11px] font-semibold text-foreground">{finding.section}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">{finding.reason}</p>
          {finding.expectedBehaviour && (
            <p className="text-[10px] text-muted-foreground/80 italic leading-snug">
              Expected: {finding.expectedBehaviour}
            </p>
          )}
        </div>
      </div>

      {!canResolve ? (
        <p className="text-[10px] text-muted-foreground/80 italic mt-2">
          Save the report to enable reviewer actions.
        </p>
      ) : (
        <div className="mt-2 pt-2 border-t border-border/40 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => trigger("dismissed")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy === "dismissed" ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => trigger("accepted_as_is")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy === "accepted_as_is" ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            Accept as-is
          </button>
          <button
            type="button"
            onClick={async () => {
              await trigger("promoted");
              onOpenTracker?.();
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy === "promoted" ? <Loader2 size={10} className="animate-spin" /> : <ArrowUpRight size={10} />}
            Promote → Enquiry
          </button>
          <button
            type="button"
            onClick={() => trigger("ai_addressed")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 disabled:opacity-50 ml-auto"
          >
            {busy === "ai_addressed" ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            Ask AI
          </button>
        </div>
      )}
    </div>
  );
}

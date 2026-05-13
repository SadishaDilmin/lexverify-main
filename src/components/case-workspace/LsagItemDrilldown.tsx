import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, AlertTriangle, FileText, Eye, Clock,
  User as UserIcon, ShieldAlert, History, Info,
} from "lucide-react";
import type { EvidenceReference } from "@/components/evidence/types";
import { RELATIONSHIP_LABELS, RELATIONSHIP_STYLES } from "@/components/evidence/types";
import { useReportAudit } from "@/hooks/useReportAudit";
import { LSAG_CANONICAL_ITEMS, type ItemMatchResult } from "@/lib/lsagItemMatcher";

interface LsagItemDrilldownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rendered checklist row info. */
  itemName: string;
  itemStatus: "pass" | "fail" | "partial";
  /** Canonical LSAG number 1–15, or 0 if the row could not be canonicalised. */
  canonicalNumber: number;
  matchedOn: string;
  /** Evidence rows attached to this item (already filtered by matcher). */
  evidence: ItemMatchResult<EvidenceReference>[];
  /** For audit trail. */
  aiReportId: string | undefined;
  /**
   * True when the entire ai_report has zero evidence_references rows.
   * Drives an honest, case-level empty-state message instead of the
   * generic per-item one.
   */
  caseHasNoEvidence?: boolean;
  /**
   * True when the LSAG section has evidence rows the matcher couldn't bucket.
   * Tells the reviewer that the empty state may be a matching gap rather
   * than a missing-citation gap.
   */
  sectionHasUnmappedEvidence?: boolean;
  /** Open the existing EvidenceViewerDialog on a specific reference. */
  onOpenEvidence: (refs: EvidenceReference[], heading: string, label: string) => void;
}

const STATUS_META = {
  pass: { icon: CheckCircle2, label: "Pass", cls: "text-risk-green border-risk-green/30 bg-risk-green/10" },
  fail: { icon: XCircle, label: "Fail", cls: "text-destructive border-destructive/30 bg-destructive/10" },
  partial: { icon: AlertTriangle, label: "Partial", cls: "text-risk-amber border-risk-amber/30 bg-risk-amber/10" },
} as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function LsagItemDrilldown({
  open,
  onOpenChange,
  itemName,
  itemStatus,
  canonicalNumber,
  matchedOn,
  evidence,
  aiReportId,
  caseHasNoEvidence = false,
  sectionHasUnmappedEvidence = false,
  onOpenEvidence,
}: LsagItemDrilldownProps) {
  const { data: audit, isLoading: auditLoading } = useReportAudit(aiReportId);
  const meta = STATUS_META[itemStatus];
  const StatusIcon = meta.icon;

  const canonical = useMemo(
    () => LSAG_CANONICAL_ITEMS.find((i) => i.number === canonicalNumber) || null,
    [canonicalNumber],
  );

  // Compose all evidence rows for this item into a single list for the viewer.
  const allRefs = evidence.map((e) => e.row);

  /**
   * Pick the most informative empty-state copy for this tile.
   *  - case-level empty  → "no citations captured for this case"
   *  - section has unmapped rows → matcher-gap explanation
   *  - otherwise → original per-item wording
   */
  const emptyState = caseHasNoEvidence
    ? {
        title: "No evidence captured for this case",
        body:
          "The agent run for this case did not persist any source citations, so no evidence excerpts can be shown for any LSAG item. The Pass / Partial / Fail decision and rationale remain visible in the section body of the report.",
      }
    : sectionHasUnmappedEvidence
      ? {
          title: "Evidence exists but could not be matched to this item",
          body:
            "Citations were captured for the LSAG section but the matcher could not confidently attribute any of them to this specific item. Open the section-level evidence chip above the grid to see the unmapped rows.",
        }
      : {
          title: "No evidence linked to this item",
          body:
            "The agent did not record a source citation for this specific item. The conclusion is visible in the body of the LSAG section above; the absence of a citation itself is recorded here for audit purposes.",
        };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <SheetTitle className="text-base flex items-center gap-2">
                <StatusIcon size={16} className={meta.cls.split(" ")[0]} />
                {itemName}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {canonical
                  ? <>LSAG checklist item {canonical.number} — <span className="font-medium text-foreground">{canonical.label}</span></>
                  : <>Item could not be mapped to a canonical LSAG number. Evidence shown below is best-effort.</>}
                {matchedOn && (
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    Tile mapped via {matchedOn}.
                  </span>
                )}
              </SheetDescription>
            </div>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.cls}`}>
              {meta.label}
            </Badge>
          </div>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Evidence list */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText size={12} /> Evidence excerpts
                <Badge variant="outline" className="text-[10px] ml-1">{evidence.length}</Badge>
              </h3>
              {evidence.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => onOpenEvidence(allRefs, "LSAG Compliance Checklist", itemName)}
                >
                  <Eye size={12} /> Open all in viewer
                </Button>
              )}
            </div>

            {evidence.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center space-y-1.5">
                <ShieldAlert size={18} className="mx-auto text-muted-foreground" />
                <p className="text-xs text-foreground font-medium">{emptyState.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {emptyState.body}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {evidence.map((ev, idx) => {
                  const ref = ev.row;
                  const relStyle = RELATIONSHIP_STYLES[ref.relationship_type];
                  return (
                    <div
                      key={ref.id || idx}
                      className="rounded-md border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {ref.document_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {ref.page_number ? `Page ${ref.page_number}` : "Page —"}
                            {" · "}
                            <span className={`${relStyle.text}`}>
                              {RELATIONSHIP_LABELS[ref.relationship_type]}
                            </span>
                            {ref.confidence_score != null && (
                              <> {" · "} Confidence {Math.round(ref.confidence_score * 100)}%</>
                            )}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-7 text-xs shrink-0"
                          onClick={() => onOpenEvidence([ref], "LSAG Compliance Checklist", itemName)}
                        >
                          <Eye size={12} /> View
                        </Button>
                      </div>
                      {ref.source_snippet && (
                        <blockquote className="text-[11px] text-foreground italic leading-relaxed border-l-2 border-border pl-2.5">
                          &ldquo;{ref.source_snippet.slice(0, 320)}
                          {ref.source_snippet.length > 320 ? "…" : ""}&rdquo;
                        </blockquote>
                      )}
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Info size={10} /> Matched via {ev.matchedOn || "section heading"}
                        {" · "}cited {formatDate(ref.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          {/* Audit traceability */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History size={12} /> Report audit trail
            </h3>

            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Report generated</span>
                <span className="text-foreground font-medium">{formatDate(audit?.created_at || null)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Last modified</span>
                <span className="text-foreground font-medium">{formatDate(audit?.modified_at || null)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Modified by</span>
                <span className="text-foreground font-medium">{audit?.modified_by_name || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Edits recorded</span>
                <span className="text-foreground font-medium">{audit?.modification_count ?? 0}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Report version</span>
                <span className="text-foreground font-medium">v{audit?.version ?? 1}</span>
              </div>
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">Audit log events ({audit?.events.length ?? 0})</p>
              {auditLoading ? (
                <p className="text-[11px] text-muted-foreground">Loading audit history…</p>
              ) : !audit?.events.length ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Report has not been edited since generation — no edit events to show.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {audit.events.map((ev) => (
                    <li key={ev.id} className="rounded-md border border-border bg-card p-2 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground flex items-center gap-1">
                          <Clock size={10} className="text-muted-foreground" />
                          {ev.event_type}
                        </span>
                        <span className="text-muted-foreground">{formatDate(ev.created_at)}</span>
                      </div>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <UserIcon size={10} /> {ev.user_name || ev.user_email}
                        {ev.user_position && <span className="opacity-70">· {ev.user_position}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

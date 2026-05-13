/**
 * CoverageGapBanner — surfaces the deterministic draft-email coverage gate
 * result (judge rule #22 enforcement) wherever the user is reviewing the
 * report or the enquiry tracker.
 *
 * Reads ai_reports.coverage_report (jsonb sidecar persisted by useSoWSubmit)
 * and renders an honest, non-blocking banner explaining how many HIGH-risk
 * material findings are not addressed in the draft email. Does not auto-rewrite
 * email content — the conveyancer remains responsible for redrafting,
 * suppressing with justification, or escalating.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CoverageEntryShape {
  id: string;
  label: string;
  severity: "high" | "medium";
  source: "lsag" | "funding_evidence" | "red_flag" | "addendum";
  evidenceLine?: string;
  matchedTokens?: string[];
}

interface CoverageReportShape {
  total: number;
  covered: number;
  uncovered: number;
  coverageRatio: number;
  highUncovered: number;
  gateTripped: boolean;
  reason: string | null;
  uncoveredEntries: CoverageEntryShape[];
  coveredEntries?: CoverageEntryShape[];
  generatedAt?: string;
}

interface Props {
  /** Raw value from ai_reports.coverage_report. */
  coverageReport: unknown;
  /** Raw value from ai_reports.finalisation_status. */
  finalisationStatus?: string | null;
  /** Optional context label for headline (e.g. "draft email", "tracker"). */
  context?: string;
  className?: string;
}

const SOURCE_LABEL: Record<CoverageEntryShape["source"], string> = {
  lsag: "LSAG checklist",
  funding_evidence: "Funding evidence",
  red_flag: "Primary red flag",
  addendum: "Merged finding",
};

function isCoverageReport(value: unknown): value is CoverageReportShape {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.total === "number" &&
    typeof v.covered === "number" &&
    typeof v.gateTripped === "boolean" &&
    Array.isArray(v.uncoveredEntries)
  );
}

export function CoverageGapBanner({
  coverageReport,
  finalisationStatus,
  context = "draft email",
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const report = useMemo<CoverageReportShape | null>(() => {
    return isCoverageReport(coverageReport) ? coverageReport : null;
  }, [coverageReport]);

  // Render only when the gate has actually tripped, OR when finalisation_status
  // is explicitly "coverage_gap" (covers older rows where the sidecar may be
  // partial). Keep silent on healthy rows so the UI stays uncluttered.
  if (!report) return null;
  const isCoverageGap = report.gateTripped || finalisationStatus === "coverage_gap";
  if (!isCoverageGap) return null;

  const highMissing = report.uncoveredEntries.filter((e) => e.severity === "high");
  const mediumMissing = report.uncoveredEntries.filter((e) => e.severity !== "high");
  const coveragePct = Math.round(report.coverageRatio * 100);

  return (
    <Card className={`border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30 ${className ?? ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Coverage gap in {context}
              </h3>
              <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-100">
                {report.covered}/{report.total} addressed ({coveragePct}%)
              </Badge>
              {report.highUncovered > 0 && (
                <Badge variant="destructive">
                  {report.highUncovered} HIGH-risk missing
                </Badge>
              )}
            </div>
            <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1">
              {report.reason ??
                "The draft email does not address every material finding in the internal report."}{" "}
              Review the gaps below before sending. You can redraft the email, raise the missing
              points in the Enquiries tracker, or document a tipping-off / suppression rationale.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-amber-900 dark:text-amber-100 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 -ml-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 mr-1" />
          ) : (
            <ChevronRight className="h-4 w-4 mr-1" />
          )}
          {expanded ? "Hide" : "Show"} {report.uncovered} uncovered{" "}
          {report.uncovered === 1 ? "finding" : "findings"}
        </Button>

        {expanded && (
          <div className="space-y-3 pt-1">
            {highMissing.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-100/80 mb-1.5">
                  HIGH-risk findings not in {context}
                </h4>
                <ul className="space-y-1.5">
                  {highMissing.map((entry) => (
                    <li
                      key={entry.id}
                      className="text-sm text-amber-950 dark:text-amber-50 bg-white/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md p-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide shrink-0">
                          {SOURCE_LABEL[entry.source]}
                        </Badge>
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{entry.label}</div>
                          {entry.evidenceLine && entry.evidenceLine !== entry.label && (
                            <div className="text-xs text-amber-900/80 dark:text-amber-100/80 mt-0.5">
                              {entry.evidenceLine}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {mediumMissing.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-100/80 mb-1.5">
                  Other partial findings
                </h4>
                <ul className="space-y-1 text-sm text-amber-950 dark:text-amber-50">
                  {mediumMissing.map((entry) => (
                    <li key={entry.id} className="pl-2 border-l-2 border-amber-300 dark:border-amber-700">
                      {entry.label}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.generatedAt && (
              <p className="text-[11px] text-amber-900/70 dark:text-amber-100/70">
                Coverage check generated {new Date(report.generatedAt).toLocaleString()} ·
                deterministic gate, no AI redrafting performed.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CoverageGapBanner;

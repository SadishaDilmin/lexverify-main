/**
 * LSAG A–E consistency matrix — presentation-only view.
 *
 * Buckets existing ExceptionItem[] and DraftEnquiry[] into the five
 * LSAG categories. No new logic; pure derivation over engine output.
 */

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import type { ExceptionItem, ExceptionType } from "@/lib/armalytix/exceptionEngine";
import type { DraftEnquiry } from "@/lib/armalytix/enquiryGenerator";
import {
  EXCEPTION_TO_LSAG_CATEGORY,
  LSAG_CATEGORY_LABELS,
  type LsagCategory,
} from "@/lib/armalytix/lsagWordingLibrary";
import type { CheckExecutionRecord } from "@/lib/armalytix/checkStatus";

interface ConsistencyMatrixProps {
  exceptions: ExceptionItem[];
  enquiries?: DraftEnquiry[];
  pendingChecks?: CheckExecutionRecord[];
  className?: string;
}

type SeverityToken = "critical" | "high" | "medium" | "low" | "none";

function rollupSeverity(items: ExceptionItem[]): SeverityToken {
  if (items.some((i) => i.severity === "critical")) return "critical";
  if (items.some((i) => i.severity === "high")) return "high";
  if (items.some((i) => i.severity === "medium")) return "medium";
  if (items.some((i) => i.severity === "low")) return "low";
  return "none";
}

function ragClasses(sev: SeverityToken): string {
  switch (sev) {
    case "critical":
    case "high":
      return "bg-[hsl(var(--risk-red))]/10 text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]/30";
    case "medium":
      return "bg-[hsl(var(--risk-amber))]/10 text-[hsl(var(--risk-amber))] border-[hsl(var(--risk-amber))]/30";
    case "low":
      return "bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/30";
    case "none":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function ragLabel(sev: SeverityToken): string {
  switch (sev) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "none":
    default:
      return "Clear";
  }
}

const ORDER: LsagCategory[] = [
  "A_purchasers_and_beneficial_ownership",
  "B_gift_and_third_party_funding",
  "C_employment_income_savings",
  "D_accounts_and_flow_of_funds",
  "E_declarations_behaviour_timing",
];

export default function ConsistencyMatrix({
  exceptions,
  enquiries = [],
  pendingChecks = [],
  className,
}: ConsistencyMatrixProps) {
  const grouped = useMemo(() => {
    const buckets: Record<LsagCategory, ExceptionItem[]> = {
      A_purchasers_and_beneficial_ownership: [],
      B_gift_and_third_party_funding: [],
      C_employment_income_savings: [],
      D_accounts_and_flow_of_funds: [],
      E_declarations_behaviour_timing: [],
    };
    for (const ex of exceptions) {
      const cat = EXCEPTION_TO_LSAG_CATEGORY[ex.exceptionType as ExceptionType];
      if (cat) buckets[cat].push(ex);
    }
    return buckets;
  }, [exceptions]);

  const enquiryCountByException = useMemo(() => {
    const map = new Map<ExceptionType, number>();
    for (const e of enquiries) {
      const key = e.linkedExceptionType as ExceptionType;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [enquiries]);

  const pendingByCategory = useMemo(() => {
    const map: Partial<Record<LsagCategory, CheckExecutionRecord[]>> = {};
    for (const p of pendingChecks) {
      const cat = EXCEPTION_TO_LSAG_CATEGORY[p.checkId as ExceptionType];
      if (!cat) continue;
      (map[cat] ||= []).push(p);
    }
    return map;
  }, [pendingChecks]);

  return (
    <div className={`rounded-xl border border-border bg-card ${className ?? ""}`}>
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Consistency Matrix</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          LSAG A–E grouping of cross-document findings.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {ORDER.map((cat) => {
          const items = grouped[cat];
          const sev = rollupSeverity(items);
          const enquiriesForCat = items.reduce(
            (n, ex) => n + (enquiryCountByException.get(ex.exceptionType as ExceptionType) ?? 0),
            0,
          );
          const pending = pendingByCategory[cat] ?? [];
          return (
            <li key={cat} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {LSAG_CATEGORY_LABELS[cat]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {items.length} finding{items.length === 1 ? "" : "s"}
                    {enquiriesForCat > 0 ? ` · ${enquiriesForCat} enquir${enquiriesForCat === 1 ? "y" : "ies"}` : ""}
                    {pending.length > 0 ? ` · ${pending.length} pending` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ragClasses(sev)}`}
                >
                  {sev === "none" ? (
                    <CheckCircle2 size={10} />
                  ) : (
                    <AlertTriangle size={10} />
                  )}
                  {ragLabel(sev)}
                </span>
              </div>

              {pending.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pending.map((p, i) => (
                    <li
                      key={`${p.checkId}-${i}`}
                      className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <CircleDashed size={11} className="mt-0.5 shrink-0" />
                      <span>
                        Pending — {p.label}
                        {p.missingInputs && p.missingInputs.length > 0 ? (
                          <> · awaiting <span className="font-medium text-foreground">{p.missingInputs.join(", ")}</span></>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

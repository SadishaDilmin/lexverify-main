import { AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PHASE 3 Sub-batch B — inline SDLT-absent banner.
 *
 * Shown only when BOTH `cases.stamp_duty` (CMS) and `cases.sdlt_form_value`
 * (manual) are NULL. The conveyancer's choice changes what happens at
 * analysis time:
 *   - Enter SDLT now → analysis runs with funding-gap arithmetic complete.
 *   - Proceed without → analysis still runs, but the funding-gap dimension
 *     is flagged MANUAL_REVIEW_REQUIRED by the deterministic post-process.
 *
 * The banner does NOT block the run. It surfaces a conscious choice.
 *
 * The divergence case (form ≠ CMS) is intentionally NOT surfaced here —
 * divergence is handled automatically (form wins per precedence, audit log
 * captures it, report carries the verbatim flag). A banner there would
 * train conveyancers to dismiss banners without reading.
 */
export interface SoWSdltAbsentBannerProps {
  visible: boolean;
  onEnterSdlt: () => void;
}

const SoWSdltAbsentBanner = ({ visible, onEnterSdlt }: SoWSdltAbsentBannerProps) => {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800/60 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <AlertTriangle size={18} className="text-amber-700 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 tracking-tight">
            Stamp Duty figure not on file
          </h3>
          <p className="text-xs text-amber-900/80 dark:text-amber-100/80 leading-relaxed">
            No SDLT figure has been provided by the CMS or entered manually for this case.
            You can run the assessment now, but the funding-gap dimension will be flagged{" "}
            <span className="font-semibold">MANUAL_REVIEW_REQUIRED</span> and the report will
            carry an explicit caveat. To complete the funding-gap arithmetic, enter the SDLT
            figure on the case before running.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-400/70 bg-background/60 hover:bg-amber-100/60 dark:hover:bg-amber-900/40"
            onClick={onEnterSdlt}
          >
            <Pencil size={13} />
            Enter SDLT
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SoWSdltAbsentBanner;

/**
 * SufficiencyConfirmationModal.tsx
 *
 * Wave 15.1 Pre-AI Sufficiency Gate — confirmation dialog.
 *
 * Renders only when the gate status is "shortfall" or "overstatement".
 * "sufficient" → this component is never opened.
 *
 * Shortfall:   Requires a written rationale and an explicit acknowledgement
 *              checkbox before the solicitor may proceed.
 * Overstatement: Informational only — single Acknowledge button.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Info } from "lucide-react";
import type { SufficiencyResult } from "@/types/sufficiency";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format pence as £X,XXX.XX */
function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(pence / 100);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SufficiencyConfirmationModalProps {
  open: boolean;
  result: SufficiencyResult | null;
  /** Called when the solicitor cancels / closes without proceeding */
  onCancel: () => void;
  /**
   * Called when the solicitor confirms they wish to proceed.
   * For shortfall: passes the rationale text entered.
   * For overstatement: passes an empty string.
   */
  onConfirm: (rationale: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SufficiencyConfirmationModal = ({
  open,
  result,
  onCancel,
  onConfirm,
}: SufficiencyConfirmationModalProps) => {
  const [rationale, setRationale] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset local state whenever the modal opens
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setRationale("");
      setAcknowledged(false);
      onCancel();
    }
  };

  if (!result || result.status === "sufficient") return null;

  const isShortfall = result.status === "shortfall";
  const gap = isShortfall ? result.shortfall : result.overstatement;

  // Count non-whitespace characters for the rationale floor.
  // Prevents padding the minimum with spaces/newlines.
  const rationaleNonWS = rationale.replace(/\s/g, "").length;
  const RATIONALE_MIN = 50;

  const canProceed = isShortfall
    ? rationaleNonWS >= RATIONALE_MIN && acknowledged
    : true; // overstatement: no gate

  const handleConfirm = () => {
    if (!canProceed) return;
    const finalRationale = isShortfall ? rationale.trim() : "";
    setRationale("");
    setAcknowledged(false);
    onConfirm(finalRationale);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isShortfall ? (
              <>
                <AlertTriangle size={18} className="text-destructive shrink-0" />
                Funding Shortfall Detected
              </>
            ) : (
              <>
                <Info size={18} className="text-amber-500 shrink-0" />
                Funding Overstatement Detected
              </>
            )}
          </DialogTitle>

          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              {isShortfall ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    The declared funds ({formatGBP(result.declared_total)}) fall{" "}
                    <span className="font-semibold text-destructive">
                      {formatGBP(gap)} short
                    </span>{" "}
                    of the total buyer-funded requirement ({formatGBP(result.funds_required)}).
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This shortfall will be flagged in the AI analysis as an established fact.
                    You may still proceed, but you must provide a written rationale explaining
                    why the assessment should continue despite the gap (e.g. additional funds
                    expected, staged drawdown, funds held by another party).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The declared funds ({formatGBP(result.declared_total)}) exceed the total
                    buyer-funded requirement by{" "}
                    <span className="font-semibold text-amber-600">
                      {formatGBP(gap)}
                    </span>{" "}
                    (requirement: {formatGBP(result.funds_required)}).
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This overstatement will be noted in the AI analysis. The AI will be asked
                    to account for surplus funds and, if unexplained, may treat them as a risk
                    indicator. You may proceed without additional input.
                  </p>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Shortfall only — rationale + checkbox */}
        {isShortfall && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sufficiency-rationale">
                Rationale for proceeding{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="sufficiency-rationale"
                placeholder="Describe the reason for the funding gap and why the assessment should proceed — e.g. additional funds expected on exchange, staged drawdown agreed with lender, funds held by another party pending completion."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />
              {rationale.length > 0 && rationaleNonWS < RATIONALE_MIN && (
                <p className="text-xs text-destructive">
                  Please provide a more substantive rationale — at least 50 non-whitespace
                  characters required ({RATIONALE_MIN - rationaleNonWS} remaining).
                </p>
              )}
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="sufficiency-acknowledge"
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(!!v)}
                className="mt-0.5"
              />
              <Label
                htmlFor="sufficiency-acknowledge"
                className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
              >
                I acknowledge this shortfall and confirm that I am proceeding with
                professional judgement. The shortfall will be recorded in the case
                audit trail and surfaced to the AI for analysis.
              </Label>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canProceed}
            variant={isShortfall ? "destructive" : "default"}
          >
            {isShortfall ? "Proceed with Shortfall" : "Acknowledge & Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SufficiencyConfirmationModal;

import { CheckCircle2, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export interface WorkflowStep {
  id: string;
  label: string;
  done: boolean;
  action: () => void;
}

interface WorkspaceWorkflowProps {
  steps: WorkflowStep[];
  /** ID of the currently active step (highlights with pulsing indicator) */
  activeStepId?: string;
  /** Optional footer below the steps (e.g. "Complete Case" button) */
  footer?: ReactNode;
  /** Optional button rendered in the header row (e.g. "View Files") */
  headerAction?: ReactNode;
}

export default function WorkspaceWorkflow({
  steps,
  activeStepId,
  footer,
  headerAction,
}: WorkspaceWorkflowProps) {
  const next = steps.find((s) => !s.done) ?? steps[steps.length - 1];

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Next step
            </div>
            <div className="text-sm font-semibold text-foreground">{next.label}</div>
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={next.action}
            >
              Continue
            </Button>
          </div>
        </div>

        <div
          className={`grid grid-cols-2 ${
            steps.length <= 4
              ? "sm:grid-cols-3 lg:grid-cols-4"
              : "sm:grid-cols-3 lg:grid-cols-5"
          } gap-2`}
        >
          {steps.map((s, idx) => {
            const isCurrent = activeStepId ? s.id === activeStepId : s.id === next.id;
            return (
              <button
                key={s.id}
                onClick={s.action}
                className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                  s.done && !isCurrent
                    ? "border-accent/20 bg-accent/5 hover:bg-accent/10"
                    : isCurrent
                    ? "border-accent bg-accent/15 ring-1 ring-accent/30 hover:bg-accent/20"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`text-[11px] font-semibold truncate ${
                      isCurrent ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {idx + 1}. {s.label}
                  </div>
                  {s.done && !isCurrent ? (
                    <CheckCircle2 size={14} className="text-risk-green shrink-0" />
                  ) : isCurrent ? (
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-40" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
                    </span>
                  ) : (
                    <Info size={14} className="text-muted-foreground shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {footer && (
          <div className="mt-3 pt-3 border-t border-border/40">{footer}</div>
        )}
      </CardContent>
    </Card>
  );
}

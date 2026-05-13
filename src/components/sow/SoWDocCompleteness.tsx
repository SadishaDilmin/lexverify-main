import { CheckCircle2, Circle, AlertCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DocSlotStatus {
  id: string;
  label: string;
  hint: string;
  reason: string;
  filled: boolean;
  count: number;
}

interface SoWDocCompletenessProps {
  slots: DocSlotStatus[];
  sharedDocCount: number;
}

export default function SoWDocCompleteness({ slots, sharedDocCount }: SoWDocCompletenessProps) {
  const filledCount = slots.filter(s => s.filled).length;
  const totalSlots = slots.length;
  const pct = totalSlots > 0 ? Math.round((filledCount / totalSlots) * 100) : 0;

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-border bg-card p-3 space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 size={11} /> Document Completeness
          </h4>
          <span className={`text-xs font-bold ${
            pct >= 80 ? "text-[hsl(var(--risk-green))]"
              : pct >= 40 ? "text-[hsl(var(--risk-amber))]"
              : "text-[hsl(var(--risk-red))]"
          }`}>{filledCount}/{totalSlots}</span>
        </div>

        <div className="space-y-1">
          {slots.map((slot) => (
            <Tooltip key={slot.id}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors cursor-help">
                  <div className="flex items-center gap-2">
                    {slot.filled ? (
                      <CheckCircle2 size={12} className="text-[hsl(var(--risk-green))] shrink-0" />
                    ) : (
                      <Circle size={12} className="text-[hsl(var(--risk-red))] shrink-0" />
                    )}
                    <span className={`text-[11px] ${slot.filled ? "text-foreground" : "text-muted-foreground"}`}>
                      {slot.label}
                    </span>
                  </div>
                  {slot.filled ? (
                    <span className="text-[10px] text-[hsl(var(--risk-green))] font-medium">{slot.count} file{slot.count !== 1 ? "s" : ""}</span>
                  ) : (
                    <AlertCircle size={10} className="text-[hsl(var(--risk-red))]" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[200px]">
                <p className="text-xs font-medium">{slot.label}</p>
                <p className="text-[10px] text-muted-foreground">{slot.reason}</p>
                <p className="text-[10px] text-muted-foreground italic mt-1">{slot.hint}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {sharedDocCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <Info size={10} /> +{sharedDocCount} shared document{sharedDocCount !== 1 ? "s" : ""} (uncategorised)
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

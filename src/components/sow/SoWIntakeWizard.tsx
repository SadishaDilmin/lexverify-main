import { CheckCircle2 } from "lucide-react";

interface WizardStep {
  id: string;
  label: string;
  complete: boolean;
}

interface SoWIntakeWizardProps {
  currentStep: string;
  onStepChange: (step: string) => void;
  steps: WizardStep[];
}

export default function SoWIntakeWizard({ currentStep, onStepChange, steps }: SoWIntakeWizardProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/20 overflow-x-auto">
      {steps.map((step, idx) => {
        const isCurrent = step.id === currentStep;
        const isPast = step.complete && !isCurrent;
        return (
          <button
            key={step.id}
            onClick={() => onStepChange(step.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
              isCurrent
                ? "bg-accent text-accent-foreground shadow-sm"
                : isPast
                ? "bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] hover:bg-[hsl(var(--risk-green))]/20"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {isPast ? (
              <CheckCircle2 size={12} />
            ) : (
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                isCurrent ? "bg-accent-foreground/20" : "bg-muted"
              }`}>{idx + 1}</span>
            )}
            {step.label}
          </button>
        );
      })}
    </div>
  );
}

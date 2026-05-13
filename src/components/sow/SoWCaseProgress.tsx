import { CheckCircle2, Circle, FileText, Sparkles, BarChart3, ShieldCheck, Mail } from "lucide-react";

interface Step {
  label: string;
  icon: React.ElementType;
  complete: boolean;
}

interface SoWCaseProgressProps {
  docsUploaded: boolean;
  classified: boolean;
  analysisRun: boolean;
  complianceReviewed: boolean;
  enquiriesGenerated: boolean;
}

export default function SoWCaseProgress({
  docsUploaded,
  classified,
  analysisRun,
  complianceReviewed,
  enquiriesGenerated,
}: SoWCaseProgressProps) {
  const steps: Step[] = [
    { label: "Documents Uploaded", icon: FileText, complete: docsUploaded },
    { label: "AI Classification", icon: Sparkles, complete: classified },
    { label: "Risk Analysis", icon: BarChart3, complete: analysisRun },
    { label: "Compliance Review", icon: ShieldCheck, complete: complianceReviewed },
    { label: "Enquiries Generated", icon: Mail, complete: enquiriesGenerated },
  ];

  const completedCount = steps.filter((s) => s.complete).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Case Progress</h4>
        <span className="text-[10px] text-muted-foreground">{completedCount}/{steps.length}</span>
      </div>
      <div className="space-y-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            {step.complete ? (
              <CheckCircle2 size={14} className="text-[hsl(var(--risk-green))] shrink-0" />
            ) : (
              <Circle size={14} className="text-muted-foreground/40 shrink-0" />
            )}
            <span className={`text-xs ${step.complete ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

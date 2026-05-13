import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SoWStatusCardProps {
  hasReport: boolean;
  internalReport: string | null;
  onClick?: () => void;
}

function parseComplianceRisk(report: string | null): { level: "green" | "amber" | "red" | null; missingCount: number } {
  if (!report) return { level: null, missingCount: 0 };

  const lower = report.toLowerCase();
  let level: "green" | "amber" | "red" | null = null;
  if (lower.includes("high risk") || lower.includes("risk rating: red") || lower.includes("overall risk: red")) {
    level = "red";
  } else if (lower.includes("medium risk") || lower.includes("risk rating: amber") || lower.includes("overall risk: amber")) {
    level = "amber";
  } else if (lower.includes("low risk") || lower.includes("risk rating: green") || lower.includes("overall risk: green")) {
    level = "green";
  }

  const missingMatch = report.match(/missing.*?(\d+)/i) || report.match(/(\d+)\s*missing/i);
  const missingCount = missingMatch ? parseInt(missingMatch[1], 10) : 0;

  return { level, missingCount };
}

export default function SoWStatusCard({ hasReport, internalReport, onClick }: SoWStatusCardProps) {
  const { level, missingCount } = parseComplianceRisk(internalReport);

  const riskColor = level === "green" ? "text-[hsl(var(--risk-green))]"
    : level === "amber" ? "text-[hsl(var(--risk-amber))]"
    : level === "red" ? "text-[hsl(var(--risk-red))]"
    : "text-muted-foreground";

  const riskLabel = level ? level.charAt(0).toUpperCase() + level.slice(1) : "—";

  return (
    <Card className={`border-border${onClick ? " cursor-pointer hover:border-accent/40 transition-colors" : ""}`} onClick={onClick}>
      <CardContent className="p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 flex items-center gap-1">
          {hasReport ? (
            <CheckCircle2 size={10} className="text-[hsl(var(--risk-green))]" />
          ) : (
            <Circle size={10} className="text-muted-foreground" />
          )}
          Olimey AI Assessment
        </div>

        <div className={`text-sm font-bold ${hasReport ? "text-[hsl(var(--risk-green))]" : "text-muted-foreground"}`}>
          {hasReport ? "Complete" : "Not Started"}
        </div>

        {hasReport && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className={`flex items-center gap-1 ${riskColor}`}>
              <ShieldCheck size={9} className="shrink-0" />
              Compliance: {riskLabel}
            </span>
            {missingCount > 0 && (
              <span className="flex items-center gap-1 text-[hsl(var(--risk-amber))]">
                {missingCount} missing
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

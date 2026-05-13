import { ShieldAlert, FileText, AlertTriangle } from "lucide-react";

interface SoWRiskGuidanceProps {
  riskLevel: string;
}

const GUIDANCE: Record<string, { title: string; color: string; bg: string; border: string; tips: string[] }> = {
  high: {
    title: "High Risk — Enhanced Due Diligence Required",
    color: "text-[hsl(var(--risk-red))]",
    bg: "bg-[hsl(var(--risk-red))]/5",
    border: "border-[hsl(var(--risk-red))]/30",
    tips: [
      "Upload tax returns (SA302) or company accounts to verify income claims",
      "Ensure bank statements cover at least 6 months (not 3)",
      "Request a signed solicitor's undertaking for any third-party contributions",
      "Consider requesting an Armalytix or Thirdfort open banking report",
      "Document the rationale for proceeding with a high-risk client in case notes",
    ],
  },
  very_high: {
    title: "Very High Risk — Senior Partner Approval Recommended",
    color: "text-[hsl(var(--risk-red))]",
    bg: "bg-[hsl(var(--risk-red))]/8",
    border: "border-[hsl(var(--risk-red))]/40",
    tips: [
      "Mandatory: Upload certified copy of passport and secondary ID",
      "Mandatory: Full 12-month bank statements for all parties",
      "Request company accounts for last 3 years if business income claimed",
      "Consider independent AML screening via a third-party provider",
      "All gift letters must be witnessed and include declaration of source",
      "Document senior partner sign-off in Additional Context before proceeding",
      "Consider whether this matter should be reported to your MLRO",
    ],
  },
};

export default function SoWRiskGuidance({ riskLevel }: SoWRiskGuidanceProps) {
  const guidance = GUIDANCE[riskLevel];
  if (!guidance) return null;

  return (
    <div className={`rounded-lg border ${guidance.border} ${guidance.bg} p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-start gap-2">
        <ShieldAlert size={14} className={`${guidance.color} shrink-0 mt-0.5`} />
        <div>
          <p className={`text-xs font-semibold ${guidance.color}`}>{guidance.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Based on your risk classification, consider uploading the following additional evidence:
          </p>
        </div>
      </div>
      <ul className="space-y-1 pl-5">
        {guidance.tips.map((tip, i) => (
          <li key={i} className="text-[10px] text-foreground leading-relaxed flex items-start gap-1.5">
            <span className={`shrink-0 mt-0.5 ${guidance.color}`}>•</span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

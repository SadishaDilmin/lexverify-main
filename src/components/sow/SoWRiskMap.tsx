import {
  Banknote, PiggyBank, Gift, ArrowLeftRight, ShieldCheck,
} from "lucide-react";

type EvidenceStatus = "Verified" | "Partial" | "Missing" | "Awaiting";

interface EvidenceRow {
  label: string;
  icon: React.ElementType;
  status: EvidenceStatus;
}

interface SoWRiskMapProps {
  resultText: string;
  hasResults: boolean;
}

function parseStatus(text: string, keyword: string): EvidenceStatus {
  if (!text) return "Awaiting";
  const lower = text.toLowerCase();
  // Look for patterns near the keyword
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return "Awaiting";
  const nearby = lower.slice(Math.max(0, idx - 100), idx + 200);
  if (nearby.includes("verified") || nearby.includes("confirmed") || nearby.includes("satisfactory")) return "Verified";
  if (nearby.includes("partial") || nearby.includes("insufficient") || nearby.includes("limited")) return "Partial";
  if (nearby.includes("missing") || nearby.includes("not provided") || nearby.includes("absent") || nearby.includes("outstanding")) return "Missing";
  return "Verified"; // Default if keyword found but no explicit status
}

const statusConfig: Record<EvidenceStatus, { color: string; bg: string; label: string }> = {
  Verified: { color: "text-[hsl(var(--risk-green))]", bg: "bg-[hsl(var(--risk-green-bg))]", label: "Verified" },
  Partial: { color: "text-[hsl(var(--risk-amber))]", bg: "bg-[hsl(var(--risk-amber-bg))]", label: "Partial" },
  Missing: { color: "text-[hsl(var(--risk-red))]", bg: "bg-[hsl(var(--risk-red-bg))]", label: "Missing" },
  Awaiting: { color: "text-muted-foreground", bg: "bg-muted", label: "Awaiting" },
};

const borderColors: Record<EvidenceStatus, string> = {
  Verified: "border-l-[hsl(var(--risk-green))]",
  Partial: "border-l-[hsl(var(--risk-amber))]",
  Missing: "border-l-[hsl(var(--risk-red))]",
  Awaiting: "border-l-border",
};

export default function SoWRiskMap({ resultText, hasResults }: SoWRiskMapProps) {
  const rows: EvidenceRow[] = [
    { label: "Income Evidence", icon: Banknote, status: hasResults ? parseStatus(resultText, "income") : "Awaiting" },
    { label: "Savings Evidence", icon: PiggyBank, status: hasResults ? parseStatus(resultText, "savings") : "Awaiting" },
    { label: "Gift Evidence", icon: Gift, status: hasResults ? parseStatus(resultText, "gift") : "Awaiting" },
    { label: "Transaction Consistency", icon: ArrowLeftRight, status: hasResults ? parseStatus(resultText, "consisten") : "Awaiting" },
    { label: "Sanctions Screening", icon: ShieldCheck, status: hasResults ? parseStatus(resultText, "sanction") : "Awaiting" },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
        Compliance Evidence Map
      </p>
      {rows.map((row) => {
        const cfg = statusConfig[row.status];
        return (
          <div
            key={row.label}
            className={`flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card border-l-4 ${borderColors[row.status]}`}
          >
            <div className="flex items-center gap-3">
              <row.icon size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{row.label}</span>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

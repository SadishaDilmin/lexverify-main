import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Calculator, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FundingGapProps {
  purchasePrice: string;
  mortgageAmount: string;
  stampDuty: string;
  legalFees: string;
  contributions: { name: string; amount: string; role: string }[];
}

function parseAmount(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[,£\s]/g, "")) || 0;
}

function formatCurrency(val: number): string {
  return val.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function SoWFundingGapCalculator({
  purchasePrice,
  mortgageAmount,
  stampDuty,
  legalFees,
  contributions,
}: FundingGapProps) {
  const calc = useMemo(() => {
    const pp = parseAmount(purchasePrice);
    const mortgage = parseAmount(mortgageAmount);
    const sdlt = parseAmount(stampDuty);
    const legal = parseAmount(legalFees);
    const totalCosts = pp + sdlt + legal;
    const totalContributions = contributions.reduce((sum, c) => sum + parseAmount(c.amount), 0);
    const totalFunding = mortgage + totalContributions;
    const gap = totalCosts - totalFunding;
    const deposit = pp - mortgage;
    const hasData = pp > 0;

    return { pp, mortgage, sdlt, legal, totalCosts, totalContributions, totalFunding, gap, deposit, hasData };
  }, [purchasePrice, mortgageAmount, stampDuty, legalFees, contributions]);

  if (!calc.hasData) return null;

  const gapSeverity = calc.gap > 0
    ? calc.gap > calc.pp * 0.1 ? "critical" : calc.gap > calc.pp * 0.05 ? "warning" : "minor"
    : "clear";

  const severityConfig = {
    critical: { color: "text-[hsl(var(--risk-red))]", bg: "bg-[hsl(var(--risk-red))]/10", border: "border-[hsl(var(--risk-red))]/30", label: "Critical Gap", icon: AlertTriangle },
    warning: { color: "text-[hsl(var(--risk-amber))]", bg: "bg-[hsl(var(--risk-amber))]/10", border: "border-[hsl(var(--risk-amber))]/30", label: "Funding Gap", icon: TrendingDown },
    minor: { color: "text-[hsl(var(--risk-amber))]", bg: "bg-[hsl(var(--risk-amber))]/5", border: "border-[hsl(var(--risk-amber))]/20", label: "Minor Gap", icon: TrendingDown },
    clear: { color: "text-[hsl(var(--risk-green))]", bg: "bg-[hsl(var(--risk-green))]/10", border: "border-[hsl(var(--risk-green))]/30", label: "Fully Funded", icon: CheckCircle2 },
  };

  const cfg = severityConfig[gapSeverity];

  return (
    <TooltipProvider>
      <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <Calculator size={12} className="text-accent" /> Pre-Flight Funding Check
          </h4>
          <span className={`text-xs font-bold flex items-center gap-1 ${cfg.color}`}>
            <cfg.icon size={12} /> {cfg.label}
          </span>
        </div>

        {/* Funding Breakdown */}
        <div className="space-y-1.5">
          <Row label="Purchase Price" value={calc.pp} />
          {calc.sdlt > 0 && <Row label="Stamp Duty (SDLT)" value={calc.sdlt} />}
          {calc.legal > 0 && <Row label="Legal Fees" value={calc.legal} />}
          <div className="border-t border-border/50 pt-1">
            <Row label="Total Costs" value={calc.totalCosts} bold />
          </div>
        </div>

        <div className="space-y-1.5">
          {calc.mortgage > 0 && <Row label="Mortgage" value={-calc.mortgage} green />}
          {contributions.filter(c => parseAmount(c.amount) > 0).map((c, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div>
                  <Row
                    label={`${c.name || c.role} contribution`}
                    value={-parseAmount(c.amount)}
                    green
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{c.role}: £{formatCurrency(parseAmount(c.amount))}</p></TooltipContent>
            </Tooltip>
          ))}
          <div className="border-t border-border/50 pt-1">
            <Row label="Total Funding" value={calc.totalFunding} bold green />
          </div>
        </div>

        {/* Gap Result */}
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.border} ${cfg.bg}`}>
          <span className="text-xs font-semibold text-foreground">
            {calc.gap > 0 ? "Unexplained Gap" : calc.gap < 0 ? "Surplus" : "Balanced"}
          </span>
          <span className={`text-sm font-bold ${cfg.color}`}>
            £{formatCurrency(Math.abs(calc.gap))}
          </span>
        </div>

        {calc.gap > 0 && (
          <p className="text-[10px] text-muted-foreground leading-tight">
            ⚠️ There is an unexplained funding gap of £{formatCurrency(calc.gap)}. 
            The AI analysis will flag this and request evidence to explain the shortfall per Reg 28 MLR 2017.
          </p>
        )}

        {calc.mortgage > 0 && calc.pp > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>LTV: <strong className="text-foreground">{Math.round((calc.mortgage / calc.pp) * 100)}%</strong></span>
            <span>Deposit: <strong className="text-foreground">£{formatCurrency(calc.deposit)}</strong></span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function Row({ label, value, bold, green }: { label: string; value: number; bold?: boolean; green?: boolean }) {
  const isNeg = value < 0;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className={`text-muted-foreground ${bold ? "font-semibold text-foreground" : ""}`}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold text-foreground" : ""} ${green && isNeg ? "text-[hsl(var(--risk-green))]" : ""}`}>
        {isNeg ? "−" : ""}£{formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

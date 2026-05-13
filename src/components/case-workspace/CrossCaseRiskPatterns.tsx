import { useMemo } from "react";
import { TrendingUp, AlertTriangle, Gift, FileSearch, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PatternItem {
  label: string;
  count: number;
  icon: typeof AlertTriangle;
  severity: "critical" | "warning" | "info";
}

export default function CrossCaseRiskPatterns() {
  const { data: recentReports = [] } = useQuery({
    queryKey: ["cross_case_risk_patterns"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("ai_reports")
        .select("internal_report, confidence_level, created_at")
        .gte("created_at", thirtyDaysAgo)
        .not("internal_report", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const patterns = useMemo<PatternItem[]>(() => {
    if (recentReports.length === 0) return [];

    let giftedDeposits = 0;
    let fundingGaps = 0;
    let staleBankStatements = 0;
    let missingId = 0;
    let highRiskClassifications = 0;

    for (const report of recentReports) {
      const text = (report.internal_report || "").toLowerCase();
      if (text.includes("gift") && (text.includes("declaration") || text.includes("deposit"))) giftedDeposits++;
      if (text.includes("funding gap") || text.includes("shortfall") || text.includes("unexplained")) fundingGaps++;
      if (text.includes("stale") || text.includes("outdated") || (text.includes("bank statement") && text.includes("older"))) staleBankStatements++;
      if (text.includes("missing") && (text.includes("identity") || text.includes("passport") || text.includes("id document"))) missingId++;
      if (report.confidence_level === "low" || text.includes("high risk") || text.includes("very high risk")) highRiskClassifications++;
    }

    const items: PatternItem[] = [];
    if (fundingGaps > 0) items.push({ label: "Funding gap detected", count: fundingGaps, icon: AlertTriangle, severity: "critical" });
    if (giftedDeposits > 0) items.push({ label: "Gifted deposit flagged", count: giftedDeposits, icon: Gift, severity: "warning" });
    if (staleBankStatements > 0) items.push({ label: "Stale bank statements", count: staleBankStatements, icon: FileSearch, severity: "warning" });
    if (missingId > 0) items.push({ label: "Missing ID documents", count: missingId, icon: FileSearch, severity: "warning" });
    if (highRiskClassifications > 0) items.push({ label: "High-risk classification", count: highRiskClassifications, icon: Landmark, severity: "info" });

    return items.sort((a, b) => b.count - a.count);
  }, [recentReports]);

  if (patterns.length === 0 && recentReports.length === 0) return null;

  const severityColor = {
    critical: "text-[hsl(var(--risk-red))] bg-[hsl(var(--risk-red))]/10 border-[hsl(var(--risk-red))]/20",
    warning: "text-[hsl(var(--risk-amber))] bg-[hsl(var(--risk-amber))]/10 border-[hsl(var(--risk-amber))]/20",
    info: "text-accent bg-accent/10 border-accent/20",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp size={14} className="text-accent" />
          Firm-Wide Risk Patterns
          <Badge variant="secondary" className="text-[9px] h-4">Last 30 days</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            No recurring risk patterns detected across {recentReports.length} recent case{recentReports.length !== 1 ? "s" : ""}.
          </p>
        ) : (
          <div className="space-y-1.5">
            {patterns.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${severityColor[p.severity]}`}>
                  <Icon size={14} className="shrink-0" />
                  <span className="flex-1 text-[11px] font-medium">{p.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5 font-bold">
                    {p.count} case{p.count !== 1 ? "s" : ""}
                  </Badge>
                </div>
              );
            })}
            <p className="text-[9px] text-muted-foreground pt-1">
              Based on {recentReports.length} report{recentReports.length !== 1 ? "s" : ""} in the last 30 days
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

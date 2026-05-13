import { useMemo } from "react";
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function FirmAnalyticsDashboard() {
  const { data: cases = [] } = useQuery({
    queryKey: ["firm-analytics-cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, status, risk_level, risk_score, transaction_type, property_type, tenure, created_at, updated_at, purchase_price")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: creditData } = useQuery({
    queryKey: ["firm-analytics-credits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("amount, transaction_type, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    const recent30 = cases.filter((c) => new Date(c.created_at) >= thirtyDaysAgo);
    const recent7 = cases.filter((c) => new Date(c.created_at) >= sevenDaysAgo);
    const completed = cases.filter((c) => c.status === "completed");
    const active = cases.filter((c) => c.status !== "completed" && c.status !== "closed");

    // Risk distribution
    const riskDist = { green: 0, amber: 0, red: 0, unscored: 0 };
    cases.forEach((c) => {
      if (c.risk_level === "green") riskDist.green++;
      else if (c.risk_level === "amber") riskDist.amber++;
      else if (c.risk_level === "red") riskDist.red++;
      else riskDist.unscored++;
    });

    // Average risk score
    const scoredCases = cases.filter((c) => c.risk_score != null);
    const avgRiskScore = scoredCases.length > 0
      ? Math.round(scoredCases.reduce((s, c) => s + (c.risk_score || 0), 0) / scoredCases.length)
      : null;

    // Transaction type breakdown
    const txTypes: Record<string, number> = {};
    cases.forEach((c) => {
      txTypes[c.transaction_type] = (txTypes[c.transaction_type] || 0) + 1;
    });
    const topTxTypes = Object.entries(txTypes).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Credit usage (30 days)
    const creditUsed30 = (creditData || [])
      .filter((t) => new Date(t.created_at) >= thirtyDaysAgo && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    // Average turnaround (created → completed)
    const turnarounds = completed
      .filter((c) => c.updated_at)
      .map((c) => (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 86400000);
    const avgTurnaround = turnarounds.length > 0 ? Math.round(turnarounds.reduce((s, t) => s + t, 0) / turnarounds.length) : null;

    // Total portfolio value
    const totalValue = cases
      .filter((c) => c.purchase_price)
      .reduce((s, c) => s + (c.purchase_price || 0), 0);

    return {
      total: cases.length, active: active.length, completed: completed.length,
      recent30: recent30.length, recent7: recent7.length,
      riskDist, avgRiskScore, topTxTypes, creditUsed30, avgTurnaround, totalValue,
    };
  }, [cases, creditData]);

  if (cases.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 size={14} className="text-accent" />
          Firm Analytics
          <Badge variant="secondary" className="text-[9px] h-4">{stats.total} cases</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Active", value: stats.active, icon: Briefcase, color: "text-accent" },
            { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-[hsl(var(--risk-green))]" },
            { label: "Last 7 days", value: stats.recent7, icon: TrendingUp, color: "text-accent" },
            { label: "Last 30 days", value: stats.recent30, icon: Clock, color: "text-muted-foreground" },
          ].map((m) => (
            <div key={m.label} className="p-2.5 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <m.icon size={12} className={m.color} />
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
              </div>
              <span className="text-lg font-bold text-foreground">{m.value}</span>
            </div>
          ))}
        </div>

        {/* Risk distribution */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Risk Distribution</span>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-muted/50">
            {stats.riskDist.green > 0 && (
              <div className="bg-[hsl(var(--risk-green))] transition-all" style={{ width: `${(stats.riskDist.green / stats.total) * 100}%` }} />
            )}
            {stats.riskDist.amber > 0 && (
              <div className="bg-[hsl(var(--risk-amber))] transition-all" style={{ width: `${(stats.riskDist.amber / stats.total) * 100}%` }} />
            )}
            {stats.riskDist.red > 0 && (
              <div className="bg-[hsl(var(--risk-red))] transition-all" style={{ width: `${(stats.riskDist.red / stats.total) * 100}%` }} />
            )}
            {stats.riskDist.unscored > 0 && (
              <div className="bg-muted-foreground/20 transition-all" style={{ width: `${(stats.riskDist.unscored / stats.total) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[hsl(var(--risk-green))]" />{stats.riskDist.green} Green</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[hsl(var(--risk-amber))]" />{stats.riskDist.amber} Amber</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[hsl(var(--risk-red))]" />{stats.riskDist.red} Red</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/20" />{stats.riskDist.unscored} Unscored</span>
          </div>
        </div>

        {/* Additional metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {stats.avgRiskScore !== null && (
            <div className="flex justify-between p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">Avg. Risk Score</span>
              <span className="font-semibold text-foreground">{stats.avgRiskScore}/100</span>
            </div>
          )}
          {stats.avgTurnaround !== null && (
            <div className="flex justify-between p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">Avg. Turnaround</span>
              <span className="font-semibold text-foreground">{stats.avgTurnaround}d</span>
            </div>
          )}
          <div className="flex justify-between p-2 rounded-lg bg-muted/20">
            <span className="text-muted-foreground">Credits (30d)</span>
            <span className="font-semibold text-foreground">{stats.creditUsed30} used</span>
          </div>
          {stats.totalValue > 0 && (
            <div className="flex justify-between p-2 rounded-lg bg-muted/20">
              <span className="text-muted-foreground">Portfolio Value</span>
              <span className="font-semibold text-foreground">£{(stats.totalValue / 1_000_000).toFixed(1)}M</span>
            </div>
          )}
        </div>

        {/* Top transaction types */}
        {stats.topTxTypes.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Top Transaction Types</span>
            <div className="space-y-1">
              {stats.topTxTypes.map(([type, count]) => (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div className="h-full bg-accent/60 rounded-full" style={{ width: `${(count / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-muted-foreground w-24 truncate">{type}</span>
                  <span className="font-medium text-foreground w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

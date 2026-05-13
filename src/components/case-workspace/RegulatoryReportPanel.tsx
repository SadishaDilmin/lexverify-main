import { useState } from "react";
import { FileText, Download, Calendar, Loader2, Shield, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface RegulatoryReportPanelProps {
  onExportPdf?: (data: any) => void;
}

export default function RegulatoryReportPanel({ onExportPdf }: RegulatoryReportPanelProps) {
  const [period, setPeriod] = useState("30");
  const [generating, setGenerating] = useState(false);

  const cutoffDate = new Date(Date.now() - Number(period) * 86400000).toISOString();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["regulatory_report_stats", period],
    queryFn: async () => {
      // Fetch cases in period
      const { data: cases, error: casesErr } = await supabase
        .from("cases")
        .select("id, risk_level, risk_score, status, transaction_type, created_at")
        .gte("created_at", cutoffDate)
        .order("created_at", { ascending: false });
      if (casesErr) throw casesErr;

      // Fetch AI reports in period
      const { count: reportCount } = await supabase
        .from("ai_reports")
        .select("id", { count: "exact", head: true })
        .gte("created_at", cutoffDate);

      const totalCases = cases?.length || 0;
      const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0, unscored: 0 };
      const statusDistribution: Record<string, number> = {};

      for (const c of cases || []) {
        const level = (c.risk_level || "unscored").toLowerCase();
        if (level in riskDistribution) riskDistribution[level as keyof typeof riskDistribution]++;
        else riskDistribution.unscored++;
        statusDistribution[c.status] = (statusDistribution[c.status] || 0) + 1;
      }

      const avgRiskScore = cases && cases.length > 0
        ? Math.round(cases.filter((c) => c.risk_score).reduce((s, c) => s + (c.risk_score || 0), 0) / Math.max(cases.filter((c) => c.risk_score).length, 1))
        : 0;

      return {
        totalCases,
        aiReportsGenerated: reportCount || 0,
        riskDistribution,
        statusDistribution,
        avgRiskScore,
        periodLabel: period === "7" ? "Last 7 days" : period === "30" ? "Last 30 days" : "Last 90 days",
      };
    },
    staleTime: 60_000,
  });

  const handleExport = async () => {
    if (!stats || !onExportPdf) return;
    setGenerating(true);
    try {
      onExportPdf(stats);
    } finally {
      setGenerating(false);
    }
  };

  const riskColors = {
    low: "text-[hsl(var(--risk-green))] bg-[hsl(var(--risk-green))]/10",
    medium: "text-[hsl(var(--risk-amber))] bg-[hsl(var(--risk-amber))]/10",
    high: "text-[hsl(var(--risk-red))] bg-[hsl(var(--risk-red))]/10",
    critical: "text-destructive bg-destructive/10",
    unscored: "text-muted-foreground bg-muted",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield size={14} className="text-accent" />
            Regulatory Compliance Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-7 text-[10px] w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            {onExportPdf && (
              <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1" onClick={handleExport} disabled={generating || isLoading}>
                {generating ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                Export PDF
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <div className="space-y-3">
            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-center">
                <p className="text-lg font-bold text-foreground">{stats.totalCases}</p>
                <p className="text-[9px] text-muted-foreground">Total Cases</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-center">
                <p className="text-lg font-bold text-foreground">{stats.aiReportsGenerated}</p>
                <p className="text-[9px] text-muted-foreground">AI Reports</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-center">
                <p className="text-lg font-bold text-foreground">{stats.avgRiskScore}/100</p>
                <p className="text-[9px] text-muted-foreground">Avg Risk Score</p>
              </div>
            </div>

            {/* Risk distribution */}
            <div>
              <p className="text-[10px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <TrendingUp size={10} /> Risk Distribution
              </p>
              <div className="flex gap-1.5">
                {(Object.entries(stats.riskDistribution) as [string, number][])
                  .filter(([, count]) => count > 0)
                  .map(([level, count]) => (
                    <Badge key={level} className={`text-[9px] ${riskColors[level as keyof typeof riskColors]}`}>
                      {level}: {count}
                    </Badge>
                  ))}
              </div>
            </div>

            {/* Status distribution */}
            <div>
              <p className="text-[10px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <Calendar size={10} /> Case Status
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(stats.statusDistribution).map(([status, count]) => (
                  <Badge key={status} variant="secondary" className="text-[9px]">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground border-t border-border pt-2">
              This summary can be exported as a PDF for COLP/COFA regulatory review. Data covers {stats.periodLabel.toLowerCase()}.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { useMemo } from "react";
import { TrendingUp, TrendingDown, BarChart3, AlertTriangle, CheckCircle2, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function AIConfidenceCalibrationPanel() {
  const { data: comparisons = [], isLoading } = useQuery({
    queryKey: ["confidence_calibration_data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benchmark_comparisons")
        .select("precision_score, recall_score, extraction_accuracy, evidence_grounding, reasoning_quality, created_at, status, prompt_version")
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60_000,
  });

  const metrics = useMemo(() => {
    if (comparisons.length === 0) return null;

    const recent = comparisons.slice(0, 20);
    const older = comparisons.slice(20, 50);

    const avg = (arr: any[], field: string) => {
      const vals = arr.map((c) => c[field]).filter((v) => v != null) as number[];
      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    };

    const recentPrecision = avg(recent, "precision_score");
    const recentRecall = avg(recent, "recall_score");
    const olderPrecision = avg(older, "precision_score");
    const olderRecall = avg(older, "recall_score");

    const precisionTrend = older.length > 0 ? recentPrecision - olderPrecision : 0;
    const recallTrend = older.length > 0 ? recentRecall - olderRecall : 0;

    const recentExtraction = avg(recent, "extraction_accuracy");
    const recentEvidence = avg(recent, "evidence_grounding");
    const recentReasoning = avg(recent, "reasoning_quality");

    // False positive/negative approximation from precision/recall
    const falsePositiveRate = 1 - (recentPrecision / 100);
    const falseNegativeRate = 1 - (recentRecall / 100);

    return {
      precision: recentPrecision,
      recall: recentRecall,
      precisionTrend,
      recallTrend,
      extraction: recentExtraction,
      evidence: recentEvidence,
      reasoning: recentReasoning,
      falsePositiveRate,
      falseNegativeRate,
      sampleSize: recent.length,
      totalSamples: comparisons.length,
    };
  }, [comparisons]);

  if (isLoading || !metrics) return null;

  const TrendIcon = ({ value }: { value: number }) => {
    if (Math.abs(value) < 1) return <span className="text-[9px] text-muted-foreground">→</span>;
    return value > 0
      ? <TrendingUp size={10} className="text-[hsl(var(--risk-green))]" />
      : <TrendingDown size={10} className="text-[hsl(var(--risk-red))]" />;
  };

  const scoreColor = (v: number) =>
    v >= 90 ? "text-[hsl(var(--risk-green))]" : v >= 75 ? "text-[hsl(var(--risk-amber))]" : "text-[hsl(var(--risk-red))]";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target size={14} className="text-accent" />
          AI Confidence Calibration
          <Badge variant="secondary" className="text-[9px] h-4">{metrics.totalSamples} evaluations</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Precision</span>
              <TrendIcon value={metrics.precisionTrend} />
            </div>
            <p className={`text-xl font-bold ${scoreColor(metrics.precision)}`}>
              {metrics.precision.toFixed(1)}%
            </p>
            <p className="text-[9px] text-muted-foreground">
              {metrics.precisionTrend > 0 ? "+" : ""}{metrics.precisionTrend.toFixed(1)}% vs prior
            </p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Recall</span>
              <TrendIcon value={metrics.recallTrend} />
            </div>
            <p className={`text-xl font-bold ${scoreColor(metrics.recall)}`}>
              {metrics.recall.toFixed(1)}%
            </p>
            <p className="text-[9px] text-muted-foreground">
              {metrics.recallTrend > 0 ? "+" : ""}{metrics.recallTrend.toFixed(1)}% vs prior
            </p>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Extraction", value: metrics.extraction },
            { label: "Evidence", value: metrics.evidence },
            { label: "Reasoning", value: metrics.reasoning },
          ].map((m) => (
            <div key={m.label} className="px-2 py-1.5 rounded bg-muted/20 border border-border text-center">
              <p className={`text-sm font-bold ${scoreColor(m.value)}`}>{m.value.toFixed(0)}%</p>
              <p className="text-[8px] text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Error rates */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-foreground">Error Analysis</p>
          <div className="flex gap-2">
            <div className={`flex-1 px-2 py-1.5 rounded-lg border text-[10px] ${
              metrics.falsePositiveRate > 0.15
                ? "border-[hsl(var(--risk-red))]/20 bg-[hsl(var(--risk-red))]/5"
                : "border-border bg-muted/20"
            }`}>
              <span className="text-muted-foreground">False Positives</span>
              <p className={`font-bold ${metrics.falsePositiveRate > 0.15 ? "text-[hsl(var(--risk-red))]" : "text-foreground"}`}>
                {(metrics.falsePositiveRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className={`flex-1 px-2 py-1.5 rounded-lg border text-[10px] ${
              metrics.falseNegativeRate > 0.1
                ? "border-[hsl(var(--risk-red))]/20 bg-[hsl(var(--risk-red))]/5"
                : "border-border bg-muted/20"
            }`}>
              <span className="text-muted-foreground">False Negatives</span>
              <p className={`font-bold ${metrics.falseNegativeRate > 0.1 ? "text-[hsl(var(--risk-red))]" : "text-foreground"}`}>
                {(metrics.falseNegativeRate * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Drift warning */}
        {(metrics.precisionTrend < -5 || metrics.recallTrend < -5) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--risk-red))]/5 border border-[hsl(var(--risk-red))]/20">
            <AlertTriangle size={12} className="text-[hsl(var(--risk-red))] shrink-0" />
            <span className="text-[10px] text-[hsl(var(--risk-red))] font-medium">
              Model drift detected — performance dropped &gt;5%. Consider re-running stress tests.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

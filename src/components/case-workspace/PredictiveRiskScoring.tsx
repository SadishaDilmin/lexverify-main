import { useMemo } from "react";
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PredictiveRiskScoringProps {
  propertyType?: string;
  transactionType?: string;
  tenure?: string;
  purchasePrice?: number | null;
  partyCount: number;
  lender?: string | null;
}

export default function PredictiveRiskScoring({
  propertyType, transactionType, tenure, purchasePrice, partyCount, lender,
}: PredictiveRiskScoringProps) {
  // Fetch historical case data for pattern matching
  const { data: historicalCases = [] } = useQuery({
    queryKey: ["predictive_risk_historical"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("property_type, transaction_type, tenure, purchase_price, risk_level, risk_score")
        .not("risk_level", "is", null)
        .not("risk_score", "is", null)
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60_000,
  });

  const prediction = useMemo(() => {
    if (historicalCases.length < 10) return null;

    // Score similarity of current case to historical cases
    let weightedRiskSum = 0;
    let weightSum = 0;
    const factors: Array<{ label: string; impact: "increases" | "decreases" | "neutral"; weight: number }> = [];

    for (const hist of historicalCases) {
      let similarity = 0;
      if (hist.property_type === propertyType) similarity += 3;
      if (hist.transaction_type === transactionType) similarity += 2;
      if (hist.tenure === tenure) similarity += 2;
      if (purchasePrice && hist.purchase_price) {
        const ratio = Math.min(purchasePrice, hist.purchase_price) / Math.max(purchasePrice, hist.purchase_price);
        similarity += ratio * 2; // 0-2 based on price similarity
      }

      if (similarity > 1) {
        weightedRiskSum += (hist.risk_score || 0) * similarity;
        weightSum += similarity;
      }
    }

    if (weightSum === 0) return null;

    const predictedScore = Math.round(weightedRiskSum / weightSum);
    const predictedLevel = predictedScore <= 30 ? "Low" : predictedScore <= 60 ? "Medium" : predictedScore <= 80 ? "High" : "Critical";

    // Identify risk factors
    const typeMatches = historicalCases.filter((c) => c.property_type === propertyType);
    const avgTypeScore = typeMatches.length > 0
      ? typeMatches.reduce((s, c) => s + (c.risk_score || 0), 0) / typeMatches.length
      : predictedScore;

    if (avgTypeScore > 50) {
      factors.push({ label: `${propertyType} properties trend higher risk`, impact: "increases", weight: avgTypeScore });
    }
    if (partyCount > 2) {
      factors.push({ label: `${partyCount} parties increases complexity`, impact: "increases", weight: 15 });
    }
    if (purchasePrice && purchasePrice > 500000) {
      factors.push({ label: "High-value transaction (>£500k)", impact: "increases", weight: 10 });
    }
    if (tenure === "leasehold") {
      factors.push({ label: "Leasehold tenure adds risk factors", impact: "increases", weight: 8 });
    }
    if (transactionType === "purchase") {
      factors.push({ label: "Purchase transactions are standard risk", impact: "neutral", weight: 0 });
    }

    return { predictedScore, predictedLevel, confidence: Math.min(95, Math.round((weightSum / historicalCases.length) * 1000)), factors, sampleSize: historicalCases.length };
  }, [historicalCases, propertyType, transactionType, tenure, purchasePrice, partyCount]);

  if (!prediction) return null;

  const levelConfig = {
    Low: { color: "text-[hsl(var(--risk-green))]", bg: "bg-[hsl(var(--risk-green))]/10 border-[hsl(var(--risk-green))]/20", icon: CheckCircle2 },
    Medium: { color: "text-[hsl(var(--risk-amber))]", bg: "bg-[hsl(var(--risk-amber))]/10 border-[hsl(var(--risk-amber))]/20", icon: BarChart3 },
    High: { color: "text-[hsl(var(--risk-red))]", bg: "bg-[hsl(var(--risk-red))]/10 border-[hsl(var(--risk-red))]/20", icon: AlertTriangle },
    Critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", icon: AlertTriangle },
  };

  const config = levelConfig[prediction.predictedLevel as keyof typeof levelConfig] || levelConfig.Medium;
  const LevelIcon = config.icon;

  return (
    <Card className={`border ${config.bg.split(" ")[1]}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          Predicted Risk Assessment
          <Badge variant="secondary" className="text-[9px] h-4">Pre-Analysis</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Prediction result */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${config.bg}`}>
          <LevelIcon size={18} className={config.color} />
          <div>
            <p className={`text-sm font-bold ${config.color}`}>
              {prediction.predictedLevel} Risk — {prediction.predictedScore}/100
            </p>
            <p className="text-[9px] text-muted-foreground">
              Based on {prediction.sampleSize} historical cases · {prediction.confidence}% confidence
            </p>
          </div>
        </div>

        {/* Contributing factors */}
        {prediction.factors.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-foreground flex items-center gap-1">
              <TrendingUp size={10} /> Contributing Factors
            </p>
            {prediction.factors.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-muted/20 border border-border">
                {f.impact === "increases" ? (
                  <TrendingUp size={9} className="text-[hsl(var(--risk-red))] shrink-0" />
                ) : f.impact === "decreases" ? (
                  <CheckCircle2 size={9} className="text-[hsl(var(--risk-green))] shrink-0" />
                ) : (
                  <BarChart3 size={9} className="text-muted-foreground shrink-0" />
                )}
                <span className="text-muted-foreground">{f.label}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[9px] text-muted-foreground border-t border-border pt-2">
          This is a statistical prediction based on historical patterns. Run a full AI analysis for definitive risk scoring.
        </p>
      </CardContent>
    </Card>
  );
}

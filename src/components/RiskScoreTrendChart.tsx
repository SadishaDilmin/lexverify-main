import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { format } from "date-fns";

interface RiskScoreTrendChartProps {
  caseId: string;
}

const chartConfig = {
  total: { label: "Total Score", color: "hsl(var(--accent))" },
  local: { label: "Local Search", color: "hsl(var(--chart-1, 220 70% 50%))" },
  drainage: { label: "Drainage & Water", color: "hsl(var(--chart-2, 160 60% 45%))" },
  environmental: { label: "Environmental", color: "hsl(var(--chart-3, 30 80% 55%))" },
  epc: { label: "EPC", color: "hsl(var(--chart-4, 280 65% 60%))" },
} satisfies ChartConfig;

export default function RiskScoreTrendChart({ caseId }: RiskScoreTrendChartProps) {
  const { data: scores, isLoading } = useQuery({
    queryKey: ["risk_score_trend", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_scores")
        .select("total_score, local_search_score, drainage_water_score, environmental_score, epc_score, risk_level, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!caseId,
  });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Loading trend data…
        </CardContent>
      </Card>
    );
  }

  if (!scores || scores.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No risk assessments recorded yet.
        </CardContent>
      </Card>
    );
  }

  const chartData = scores.map((s, i) => ({
    name: `Run ${i + 1}`,
    date: format(new Date(s.created_at), "dd MMM yy"),
    total: s.total_score,
    local: s.local_search_score,
    drainage: s.drainage_water_score,
    environmental: s.environmental_score,
    epc: s.epc_score,
    level: s.risk_level,
  }));

  const latest = scores[scores.length - 1];
  const previous = scores.length > 1 ? scores[scores.length - 2] : null;
  const delta = previous ? latest.total_score - previous.total_score : 0;

  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta > 0 ? "text-risk-red" : delta < 0 ? "text-risk-green" : "text-muted-foreground";

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Risk Score Progression</CardTitle>
          <div className="flex items-center gap-2">
            {scores.length > 1 && (
              <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
                <TrendIcon size={14} />
                <span>{delta > 0 ? "+" : ""}{delta} pts</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">{scores.length} assessment{scores.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <ReferenceLine y={30} stroke="hsl(var(--risk-green, 145 60% 45%))" strokeDasharray="4 4" strokeOpacity={0.5} />
            <ReferenceLine y={60} stroke="hsl(var(--risk-red, 0 72% 51%))" strokeDasharray="4 4" strokeOpacity={0.5} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--accent))"
              strokeWidth={2.5}
              fill="url(#fillTotal)"
              dot={{ r: 4, fill: "hsl(var(--accent))" }}
              activeDot={{ r: 6 }}
            />
            <Line type="monotone" dataKey="local" stroke="hsl(var(--chart-1, 220 70% 50%))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="drainage" stroke="hsl(var(--chart-2, 160 60% 45%))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="environmental" stroke="hsl(var(--chart-3, 30 80% 55%))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="epc" stroke="hsl(var(--chart-4, 280 65% 60%))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </AreaChart>
        </ChartContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 justify-center">
          {[
            { key: "total", label: "Total", color: "bg-accent" },
            { key: "local", label: "Local Search", color: "bg-[hsl(220,70%,50%)]" },
            { key: "drainage", label: "Drainage", color: "bg-[hsl(160,60%,45%)]" },
            { key: "environmental", label: "Environmental", color: "bg-[hsl(30,80%,55%)]" },
            { key: "epc", label: "EPC", color: "bg-[hsl(280,65%,60%)]" },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
              {item.label}
            </div>
          ))}
        </div>

        {/* Risk zone legend */}
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-4 h-px bg-risk-green inline-block" style={{ borderTop: "2px dashed" }} /> Green ≤29</span>
          <span className="flex items-center gap-1"><span className="w-4 h-px bg-risk-amber inline-block" /> Amber 30–59</span>
          <span className="flex items-center gap-1"><span className="w-4 h-px bg-risk-red inline-block" style={{ borderTop: "2px dashed" }} /> Red ≥60</span>
        </div>
      </CardContent>
    </Card>
  );
}

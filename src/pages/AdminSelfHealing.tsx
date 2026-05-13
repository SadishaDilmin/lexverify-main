import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Brain,
  TrendingUp,
  Trophy,
  ShieldAlert,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import FailureTriageView from "@/components/self-healing/FailureTriageView";

const AdminSelfHealing = () => {
  // Fetch correction signals (auto-heals vs manual)
  const { data: corrections = [] } = useQuery({
    queryKey: ["self_healing_corrections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_correction_signals")
        .select("id, document_type, ocr_engine, confidence_score, created_at, user_role")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch confidence suppressions
  const { data: suppressions = [] } = useQuery({
    queryKey: ["self_healing_suppressions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("confidence_suppressions")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch clause patterns
  const { data: patterns = [] } = useQuery({
    queryKey: ["self_healing_patterns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clause_pattern_memory")
        .select("*")
        .order("occurrence_count", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Learning Velocity chart data (last 30 days)
  const velocityData = useMemo(() => {
    const days: Record<string, { date: string; autoHeals: number; manualCorrections: number }> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: key, autoHeals: 0, manualCorrections: 0 };
    }
    for (const c of corrections) {
      const key = c.created_at.slice(0, 10);
      if (days[key]) {
        if (c.user_role === "system") {
          days[key].autoHeals++;
        } else {
          days[key].manualCorrections++;
        }
      }
    }
    return Object.values(days);
  }, [corrections]);

  // Engine Leaderboard
  const engineStats = useMemo(() => {
    const map: Record<string, { engine: string; total: number; avgConf: number; docTypes: Set<string> }> = {};
    for (const c of corrections) {
      const eng = c.ocr_engine || "default";
      if (!map[eng]) map[eng] = { engine: eng, total: 0, avgConf: 0, docTypes: new Set() };
      map[eng].total++;
      map[eng].avgConf += Number(c.confidence_score);
      map[eng].docTypes.add(c.document_type);
    }
    return Object.values(map).map((e) => ({
      engine: e.engine,
      total: e.total,
      avgConf: e.total > 0 ? +(e.avgConf / e.total).toFixed(3) : 0,
      docTypes: Array.from(e.docTypes).join(", "),
    })).sort((a, b) => b.avgConf - a.avgConf);
  }, [corrections]);

  // Summary stats
  const totalAutoHeals = velocityData.reduce((s, d) => s + d.autoHeals, 0);
  const totalManual = velocityData.reduce((s, d) => s + d.manualCorrections, 0);
  const totalPatterns = patterns.reduce((s, p) => s + (p.occurrence_count ?? 0), 0);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                Self-Healing Document Intelligence
              </h1>
              <p className="text-sm text-muted-foreground">
                Continuous learning for forensic-grade legal document extraction.
              </p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-[hsl(var(--risk-green))]">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Auto-Heals
              </div>
              <p className="text-3xl font-bold text-foreground">{totalAutoHeals}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-[hsl(var(--risk-amber))]">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                <XCircle className="h-3.5 w-3.5" />
                Manual Corrections
              </div>
              <p className="text-3xl font-bold text-foreground">{totalManual}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                <Activity className="h-3.5 w-3.5" />
                Pattern Memory
              </div>
              <p className="text-3xl font-bold text-foreground">{totalPatterns}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total occurrences tracked</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-[hsl(var(--risk-red))]">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                Suppressions Active
              </div>
              <p className="text-3xl font-bold text-foreground">{suppressions.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Document families flagged</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="velocity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="velocity" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Learning Velocity
            </TabsTrigger>
            <TabsTrigger value="engines" className="gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Engine Leaderboard
            </TabsTrigger>
            <TabsTrigger value="calibration" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Confidence Calibration
            </TabsTrigger>
            <TabsTrigger value="triage" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Failure Triage
            </TabsTrigger>
          </TabsList>

          {/* Learning Velocity */}
          <TabsContent value="velocity">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Auto-Heals vs Manual Corrections (30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={velocityData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => v.slice(5)}
                        className="text-muted-foreground"
                      />
                      <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="autoHeals"
                        name="Auto-Heals"
                        stackId="1"
                        stroke="hsl(var(--risk-green))"
                        fill="hsl(var(--risk-green))"
                        fillOpacity={0.3}
                      />
                      <Area
                        type="monotone"
                        dataKey="manualCorrections"
                        name="Manual Corrections"
                        stackId="1"
                        stroke="hsl(var(--risk-amber))"
                        fill="hsl(var(--risk-amber))"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Engine Leaderboard */}
          <TabsContent value="engines">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">OCR Engine Performance by Document Type</CardTitle>
              </CardHeader>
              <CardContent>
                {engineStats.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12 text-sm">
                    No engine data available yet. Correction signals will populate this view.
                  </p>
                ) : (
                  <div className="space-y-6">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={engineStats}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="engine" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} domain={[0, 1]} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--popover))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.5rem",
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="avgConf" name="Avg Confidence" radius={[4, 4, 0, 0]}>
                            {engineStats.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={
                                  entry.avgConf >= 0.85
                                    ? "hsl(var(--risk-green))"
                                    : entry.avgConf >= 0.7
                                      ? "hsl(var(--risk-amber))"
                                      : "hsl(var(--risk-red))"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Engine</TableHead>
                          <TableHead>Avg Confidence</TableHead>
                          <TableHead>Corrections</TableHead>
                          <TableHead>Document Types</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {engineStats.map((e, i) => (
                          <TableRow key={e.engine}>
                            <TableCell>
                              {i === 0 ? (
                                <Badge className="bg-[hsl(var(--risk-green))] text-white">
                                  <Trophy className="h-3 w-3 mr-1" />
                                  #1
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">#{i + 1}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{e.engine}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                style={{
                                  borderColor:
                                    e.avgConf >= 0.85
                                      ? "hsl(var(--risk-green))"
                                      : e.avgConf >= 0.7
                                        ? "hsl(var(--risk-amber))"
                                        : "hsl(var(--risk-red))",
                                  color:
                                    e.avgConf >= 0.85
                                      ? "hsl(var(--risk-green))"
                                      : e.avgConf >= 0.7
                                        ? "hsl(var(--risk-amber))"
                                        : "hsl(var(--risk-red))",
                                }}
                              >
                                {(e.avgConf * 100).toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell>{e.total}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                              {e.docTypes || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Confidence Calibration */}
          <TabsContent value="calibration">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Active Confidence Suppressions</CardTitle>
              </CardHeader>
              <CardContent>
                {suppressions.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--risk-green))]" />
                    <p className="text-sm font-medium text-foreground">All document families calibrated</p>
                    <p className="text-xs text-muted-foreground">
                      No confidence suppression is currently active.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {suppressions.map((s) => (
                      <Card
                        key={s.id}
                        className="border-[hsl(var(--risk-amber))]/30 bg-[hsl(var(--risk-amber-bg))]"
                      >
                        <CardContent className="py-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-foreground">{s.document_type}</span>
                            <Badge
                              variant="outline"
                              className="border-[hsl(var(--risk-amber))]/50 text-[hsl(var(--risk-amber))] text-xs"
                            >
                              <ShieldAlert className="h-3 w-3 mr-1" />
                              Suppressed
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                              Engine: <span className="font-medium text-foreground">{s.ocr_engine}</span>
                            </span>
                            <span>
                              Factor:{" "}
                              <span className="font-medium text-[hsl(var(--risk-amber))]">
                                ×{Number(s.suppression_factor).toFixed(2)}
                              </span>
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{s.reason}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Failure Triage */}
          <TabsContent value="triage">
            <FailureTriageView />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AdminSelfHealing;

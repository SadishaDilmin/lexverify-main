import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Clock, CheckCircle2, XOctagon, AlertTriangle, TrendingUp, Siren } from "lucide-react";
import { differenceInMinutes, differenceInDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(220 70% 55%)",
];

const FILING_DEADLINE_DAYS = 60;
const CRITICAL_THRESHOLD_DAYS = 45;

export default function AdminComplianceDashboard() {
  const { data: proactiveCases = [] } = useQuery({
    queryKey: ["compliance-proactive-cases"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("benchmark_cases")
        .select("id, oversight_status, oversight_at, created_at, confidence_level, agent_type")
        .eq("source_type", "dms_proactive")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  // Fetch regulatory audit findings for deadline tracker
  const { data: auditFindings = [] } = useQuery({
    queryKey: ["compliance-audit-findings"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("regulatory_audit_findings")
        .select("id, file_name, agreement_type, agreement_date, created_at, filed_at, status, sra_solicitor_name, sra_id_number")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const verified = proactiveCases.filter((c: any) => c.oversight_status === "human_verified").length;
  const overridden = proactiveCases.filter((c: any) => c.oversight_status === "overridden").length;
  const pending = proactiveCases.filter((c: any) => !c.oversight_status || c.oversight_status === "pending_review").length;
  const total = proactiveCases.length;

  // Avg review time
  const reviewTimes = proactiveCases
    .filter((c: any) => c.oversight_at && c.created_at)
    .map((c: any) => differenceInMinutes(new Date(c.oversight_at), new Date(c.created_at)));
  const avgReviewMin = reviewTimes.length > 0
    ? (reviewTimes.reduce((a: number, b: number) => a + b, 0) / reviewTimes.length).toFixed(1)
    : "N/A";

  // Per-agent breakdown
  const agentMap: Record<string, { verified: number; overridden: number; pending: number; reviewTimes: number[] }> = {};
  for (const c of proactiveCases) {
    const agent = (c as any).agent_type || "unknown";
    if (!agentMap[agent]) agentMap[agent] = { verified: 0, overridden: 0, pending: 0, reviewTimes: [] };
    const status = (c as any).oversight_status;
    if (status === "human_verified") agentMap[agent].verified++;
    else if (status === "overridden") agentMap[agent].overridden++;
    else agentMap[agent].pending++;
    if ((c as any).oversight_at && (c as any).created_at) {
      agentMap[agent].reviewTimes.push(differenceInMinutes(new Date((c as any).oversight_at), new Date((c as any).created_at)));
    }
  }

  const agentChartData = Object.entries(agentMap).map(([agent, stats]) => ({
    agent: agent.replace(/-/g, " "),
    avgReview: stats.reviewTimes.length
      ? Math.round(stats.reviewTimes.reduce((a, b) => a + b, 0) / stats.reviewTimes.length)
      : 0,
    verified: stats.verified,
    overridden: stats.overridden,
    pending: stats.pending,
  }));

  const pieData = [
    { name: "Verified", value: verified },
    { name: "Overridden", value: overridden },
    { name: "Pending", value: pending },
  ].filter(d => d.value > 0);

  // Statutory Deadline Tracker
  const unfiledFindings = auditFindings.filter((f: any) => !f.filed_at);
  const overdueFindings = unfiledFindings.filter((f: any) => {
    const daysSinceFound = differenceInDays(new Date(), new Date(f.created_at));
    return daysSinceFound >= CRITICAL_THRESHOLD_DAYS;
  });
  const criticalFindings = unfiledFindings.filter((f: any) => {
    const daysSinceFound = differenceInDays(new Date(), new Date(f.created_at));
    return daysSinceFound >= FILING_DEADLINE_DAYS;
  });

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance Dashboard</h1>
            <p className="text-sm text-muted-foreground">EU AI Act — Oversight Efficiency & Regulatory Metrics</p>
          </div>
        </div>

        {/* CRITICAL OVERDUE ALERT */}
        {criticalFindings.length > 0 && (
          <Card className="border-destructive bg-destructive/10 animate-pulse">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Siren className="h-6 w-6 text-destructive" />
                <div>
                  <p className="text-sm font-bold text-destructive">
                    CRITICAL: {criticalFindings.length} FILING{criticalFindings.length > 1 ? "S" : ""} OVERDUE
                  </p>
                  <p className="text-xs text-destructive/80">
                    HMLR 2026 Regulations require filing within {FILING_DEADLINE_DAYS} days. These agreements have exceeded the statutory deadline.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {overdueFindings.length > 0 && criticalFindings.length === 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <div>
                  <p className="text-sm font-bold text-destructive">
                    WARNING: {overdueFindings.length} filing{overdueFindings.length > 1 ? "s" : ""} approaching deadline
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These agreements are past {CRITICAL_THRESHOLD_DAYS} days and must be filed within {FILING_DEADLINE_DAYS} days per HMLR 2026 Regs.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{total}</p>
                  <p className="text-xs text-muted-foreground">Total Proactive Cases</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{total > 0 ? ((verified / total) * 100).toFixed(1) : 0}%</p>
                  <p className="text-xs text-muted-foreground">Human Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-accent-foreground" />
                <div>
                  <p className="text-2xl font-bold">{avgReviewMin}{avgReviewMin !== "N/A" ? " min" : ""}</p>
                  <p className="text-xs text-muted-foreground">Avg. Time to Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{pending}</p>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Statutory Deadline Tracker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Statutory Deadline Tracker — HMLR 2026
            </CardTitle>
            <CardDescription>60-day filing window for Contractual Control agreements</CardDescription>
          </CardHeader>
          <CardContent>
            {unfiledFindings.length > 0 ? (
              <div className="space-y-2">
                {unfiledFindings.slice(0, 10).map((f: any) => {
                  const daysElapsed = differenceInDays(new Date(), new Date(f.created_at));
                  const daysRemaining = FILING_DEADLINE_DAYS - daysElapsed;
                  const isCritical = daysRemaining <= 0;
                  const isWarning = daysElapsed >= CRITICAL_THRESHOLD_DAYS && !isCritical;
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                        isCritical ? "border-destructive bg-destructive/10" : isWarning ? "border-destructive/50 bg-destructive/5" : "border-border"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{f.file_name}</p>
                        <p className="text-xs text-muted-foreground">{f.agreement_type} — Found {daysElapsed} days ago</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCritical ? (
                          <Badge variant="destructive" className="animate-pulse text-[10px]">
                            FILING OVERDUE
                          </Badge>
                        ) : isWarning ? (
                          <Badge variant="destructive" className="text-[10px]">
                            {daysRemaining}d remaining
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {daysRemaining}d remaining
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
                {unfiledFindings.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    + {unfiledFindings.length - 10} more unfiled findings
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                ✅ All known Contractual Control agreements are filed or no findings yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Oversight Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">No proactive cases yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Avg. Review Time by Agent</CardTitle>
              <CardDescription>Minutes from trigger to human review</CardDescription>
            </CardHeader>
            <CardContent>
              {agentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={agentChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="agent" tick={{ fontSize: 11 }} />
                    <YAxis label={{ value: "min", angle: -90, position: "insideLeft" }} />
                    <RechartsTooltip />
                    <Bar dataKey="avgReview" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">No review data yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center pt-2 pb-6">
          <Badge variant="outline" className="text-xs px-4 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            SRA & EU AI Act Compliant — Mar 2026
          </Badge>
        </div>
      </div>
    </AppLayout>
  );
}

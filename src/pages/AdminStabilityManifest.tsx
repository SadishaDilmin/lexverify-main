import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, Lock, Unlock, AlertTriangle, CheckCircle2, XCircle, Info, Fingerprint, Activity, Scale, Brain, Download, FileJson, FileText, TrendingDown, FileWarning, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AGENTS = [
  { id: "source-of-wealth", name: "Olimey AI" },
];

// ── Zero-Text Extraction Monitor Widget ───────────────────────────────
function ZeroTextExtractionWidget() {
  const { data: zeroTextEvents, isLoading } = useQuery({
    queryKey: ["zero-text-extraction-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_logs" as any)
        .select("*")
        .eq("category", "edge_function_error")
        .like("message", "%ZERO_TEXT%")
        .order("created_at", { ascending: false })
        .limit(20);
      return ((data ?? []) as unknown) as Array<{
        id: string;
        created_at: string;
        level: string;
        message: string;
        metadata: any;
      }>;
    },
    refetchInterval: 30_000,
  });

  const totalFailures = zeroTextEvents?.filter(e => e.message.includes("ZERO_TEXT_EXTRACTED"))?.length ?? 0;
  const totalRetrySuccesses = zeroTextEvents?.filter(e => e.message.includes("RETRY_SUCCESS"))?.length ?? 0;
  const hasRecentFailures = totalFailures > 0;

  return (
    <Card className={hasRecentFailures ? "border-destructive/40" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileWarning className={`h-5 w-5 ${hasRecentFailures ? "text-destructive" : "text-primary"}`} />
          Document Extraction Monitor
          {hasRecentFailures && (
            <Badge variant="destructive" className="ml-2">{totalFailures} failure(s)</Badge>
          )}
          {totalRetrySuccesses > 0 && (
            <Badge variant="secondary" className="ml-1">
              <RefreshCw className="h-3 w-3 mr-1" />
              {totalRetrySuccesses} auto-recovered
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Recent zero-text extraction events from the document processing pipeline
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : !zeroTextEvents?.length ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            No extraction failures detected. All documents processing normally.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zeroTextEvents.map((event) => {
                const meta = event.metadata as any;
                const isRetrySuccess = event.message.includes("RETRY_SUCCESS");
                const isFailure = event.message.includes("ZERO_TEXT_EXTRACTED");
                return (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(event.created_at), "dd MMM HH:mm")}
                    </TableCell>
                    <TableCell>
                      {isRetrySuccess ? (
                        <Badge variant="secondary" className="text-xs">
                          <RefreshCw className="h-3 w-3 mr-1" /> Recovered
                        </Badge>
                      ) : isFailure ? (
                        <Badge variant="destructive" className="text-xs">Failed</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{event.level}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate font-mono">
                      {meta?.fileName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {meta?.fileSizeKB ? `${Math.round(meta.fileSizeKB)}KB` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                      {isRetrySuccess
                        ? `Recovered via ${meta?.retryModel ?? "unknown"} (${meta?.charCount ?? 0} chars)`
                        : meta?.sectionalAttempted
                          ? "Sectional + single-pass + retry all failed"
                          : meta?.retryAttempted
                            ? "Single-pass + retry failed"
                            : "All models failed"
                      }
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminStabilityManifest() {
  // --- System Health: evaluation_worker lock ---
  const { data: lockData } = useQuery({
    queryKey: ["stability-lock"],
    queryFn: async () => {
      const { data } = await supabase
        .from("benchmark_system_locks")
        .select("*")
        .eq("lock_type", "evaluation_worker" as any)
        .maybeSingle();
      return data;
    },
    refetchInterval: 15_000,
  });

  // --- Last successful batch ---
  const { data: lastBatch } = useQuery({
    queryKey: ["stability-last-batch"],
    queryFn: async () => {
      const { data } = await supabase
        .from("benchmark_batches")
        .select("*")
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // --- Precision Ledger: Manual vs Synthetic Recall per agent ---
  const { data: ledgerData } = useQuery({
    queryKey: ["stability-precision-ledger"],
    queryFn: async () => {
      const { data: comparisons } = await supabase
        .from("benchmark_comparisons")
        .select("benchmark_case_id, recall_score, precision_score, status")
        .eq("status", "complete");

      if (!comparisons?.length) return [];

      const caseIds = [...new Set(comparisons.map((c) => c.benchmark_case_id))];
      const { data: cases } = await supabase
        .from("benchmark_cases")
        .select("id, agent_type, source_type")
        .in("id", caseIds);

      const caseMap = new Map(cases?.map((c) => [c.id, c]) ?? []);

      const agentStats: Record<string, { manualRecall: number[]; synthRecall: number[]; manualPrecision: number[]; synthPrecision: number[] }> = {};

      for (const comp of comparisons) {
        const bc = caseMap.get(comp.benchmark_case_id);
        if (!bc) continue;
        if (!agentStats[bc.agent_type]) {
          agentStats[bc.agent_type] = { manualRecall: [], synthRecall: [], manualPrecision: [], synthPrecision: [] };
        }
        const s = agentStats[bc.agent_type];
        if (bc.source_type === "manual") {
          if (comp.recall_score != null) s.manualRecall.push(comp.recall_score);
          if (comp.precision_score != null) s.manualPrecision.push(comp.precision_score);
        } else {
          if (comp.recall_score != null) s.synthRecall.push(comp.recall_score);
          if (comp.precision_score != null) s.synthPrecision.push(comp.precision_score);
        }
      }

      return AGENTS.map((a) => {
        const s = agentStats[a.id];
        const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
        const mr = avg(s?.manualRecall ?? []);
        const sr = avg(s?.synthRecall ?? []);
        const mp = avg(s?.manualPrecision ?? []);
        const sp = avg(s?.synthPrecision ?? []);
        return {
          name: a.name,
          id: a.id,
          manualRecall: mr,
          synthRecall: sr,
          recallDelta: mr != null && sr != null ? mr - sr : null,
          manualPrecision: mp,
          synthPrecision: sp,
        };
      });
    },
  });

  // --- Audit Log: Last 10 disagreed calibrations ---
  const { data: calibrations } = useQuery({
    queryKey: ["stability-calibrations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("benchmark_judge_calibration")
        .select("*")
        .eq("human_verdict", "disagree")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // --- Prompt Trace: deployed versions + defaults ---
  const { data: promptTrace } = useQuery({
    queryKey: ["stability-prompt-trace"],
    queryFn: async () => {
      const results = await Promise.all(
        AGENTS.map(async (agent) => {
          const { data: deployed } = await supabase
            .from("prompt_versions")
            .select("version, status")
            .eq("agent_id", agent.id)
            .eq("status", "deployed")
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();

          const { data: fallback } = await supabase
            .from("prompt_defaults")
            .select("id, agent_id")
            .eq("agent_id", agent.id)
            .maybeSingle();

          return {
            name: agent.name,
            id: agent.id,
            deployedVersion: deployed?.version ?? null,
            hasFallback: !!fallback,
          };
        })
      );
      return results;
    },
  });

  const pct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
  const isLocked = lockData?.is_locked ?? false;

  // ── Model Drift Monitor (Art. 15) ──
  const { data: driftData } = useQuery({
    queryKey: ["stability-drift-monitor"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      // Recent 30 days
      const { data: recent } = await supabase
        .from("benchmark_comparisons")
        .select("benchmark_case_id, precision_score, recall_score, created_at")
        .eq("status", "complete")
        .gte("created_at", thirtyDaysAgo);

      // Previous 30 days (30-60 days ago)
      const { data: previous } = await supabase
        .from("benchmark_comparisons")
        .select("benchmark_case_id, precision_score, recall_score, created_at")
        .eq("status", "complete")
        .gte("created_at", sixtyDaysAgo)
        .lt("created_at", thirtyDaysAgo);

      const avgPrecision = (arr: any[]) => {
        const vals = arr.filter((c) => c.precision_score != null).map((c) => c.precision_score as number);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };

      const recentPrecision = avgPrecision(recent ?? []);
      const previousPrecision = avgPrecision(previous ?? []);
      const recentRecall = (() => {
        const vals = (recent ?? []).filter((c) => c.recall_score != null).map((c) => c.recall_score as number);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      })();
      const previousRecall = (() => {
        const vals = (previous ?? []).filter((c) => c.recall_score != null).map((c) => c.recall_score as number);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      })();

      const precisionDrift = recentPrecision != null && previousPrecision != null
        ? recentPrecision - previousPrecision : null;
      const recallDrift = recentRecall != null && previousRecall != null
        ? recentRecall - previousRecall : null;

      const isDrifting = precisionDrift != null && precisionDrift < -0.05;

      return {
        recentPrecision, previousPrecision, precisionDrift,
        recentRecall, previousRecall, recallDrift,
        isDrifting,
        recentCount: recent?.length ?? 0,
        previousCount: previous?.length ?? 0,
      };
    },
  });




  // ── Compliance Export: proactive triggers ──
  const { data: proactiveCases } = useQuery({
    queryKey: ["stability-proactive-cases"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("benchmark_cases")
        .select("id, title, agent_type, source_type, status, created_at, trigger_context, confidence_level, oversight_status, oversight_by, oversight_at, oversight_reason")
        .eq("source_type", "dms_proactive")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const exportJSON = useCallback(() => {
    if (!proactiveCases?.length) return;
    const log = {
      exported_at: new Date().toISOString(),
      total_proactive_triggers: proactiveCases.length,
      regulation: "EU AI Act 2024 — Art. 14 Transparency",
      entries: proactiveCases.map((c: any) => ({
        case_id: c.id,
        title: c.title,
        agent: c.agent_type,
        status: c.status,
        confidence: c.confidence_level,
        created_at: c.created_at,
        trigger_context: c.trigger_context,
        oversight_status: c.oversight_status || "pending_review",
        verified_by: c.oversight_by || null,
        verified_at: c.oversight_at || null,
        override_reason: c.oversight_reason || null,
      })),
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olimey-compliance-log-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [proactiveCases]);

  const exportPDF = useCallback(() => {
    if (!proactiveCases?.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Olimey AI Compliance Log", 14, 20);
    doc.setFontSize(9);
    doc.text(`EU AI Act — Art. 14 Transparency Report`, 14, 28);
    doc.text(`Exported: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 34);
    doc.text(`Total Proactive Triggers: ${proactiveCases.length}`, 14, 40);

    let y = 50;
    for (const c of proactiveCases.slice(0, 50)) {
      if (y > 270) { doc.addPage(); y = 20; }
      const ctx = c.trigger_context as any;
      doc.setFontSize(10);
      doc.text(`${c.title}`, 14, y);
      doc.setFontSize(8);
      doc.text(`Agent: ${c.agent_type} | Status: ${c.status} | Confidence: ${c.confidence_level}`, 14, y + 5);
      doc.text(`Date: ${format(new Date(c.created_at), "dd MMM yyyy HH:mm")}`, 14, y + 10);
      const oversightLabel = c.oversight_status || "pending_review";
      const verifier = c.oversight_by ? `${c.oversight_by}` : "Unverified";
      doc.text(`Oversight: ${oversightLabel.replace(/_/g, " ")} | Natural Person: ${verifier}`, 14, y + 15);
      if (c.oversight_reason) {
        doc.text(`Override Reason: ${c.oversight_reason}`, 14, y + 20);
        y += 5;
      }
      if (ctx?.ai_justification) {
        const lines = doc.splitTextToSize(`Justification: ${ctx.ai_justification}`, 180);
        doc.text(lines, 14, y + 20);
        y += 20 + lines.length * 4;
      } else {
        y += 20;
      }
      y += 6;
    }

    doc.save(`olimey-compliance-log-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  }, [proactiveCases]);

  const [complianceLoading, setComplianceLoading] = useState(false);
  const downloadComplianceSummary = useCallback(async () => {
    setComplianceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-compliance-report");
      if (error) throw error;
      const md = data?.markdown ?? "No report generated.";
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `olimey-compliance-summary-${format(new Date(), "yyyy-MM-dd")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Compliance report error:", e);
    } finally {
      setComplianceLoading(false);
    }
  }, []);



  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <Fingerprint className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stability Manifest</h1>
            <p className="text-sm text-muted-foreground">Olimey AI 4-Phase Stability Rollout — Live System Status</p>
          </div>
        </div>

        {/* ── Section 0b: Zero-Text Extraction Monitor ── */}
        <ZeroTextExtractionWidget />

        {/* ── Section 1: System Health ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-primary" /> System Health</CardTitle>
            <CardDescription>Evaluation worker lock status &amp; last successful run</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="flex items-center gap-3 rounded-lg border p-4">
                {isLocked ? <Lock className="h-5 w-5 text-destructive" /> : <Unlock className="h-5 w-5 text-primary" />}
                <div>
                  <p className="text-sm font-medium">{isLocked ? "Worker Locked" : "Worker Idle"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isLocked && lockData?.locked_at
                      ? `Locked at ${format(new Date(lockData.locked_at), "dd MMM yyyy HH:mm")}`
                      : "No active lock"}
                  </p>
                  {isLocked && lockData?.expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Expires {format(new Date(lockData.expires_at), "HH:mm")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                {lastBatch ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
                <div>
                  <p className="text-sm font-medium">{lastBatch ? "Last Successful Run" : "No completed batch"}</p>
                  <p className="text-xs text-muted-foreground">
                    {lastBatch?.completed_at
                      ? format(new Date(lastBatch.completed_at), "dd MMM yyyy HH:mm")
                      : "—"}
                  </p>
                  {lastBatch && (
                    <p className="text-xs text-muted-foreground">
                      {lastBatch.completed_cases}/{lastBatch.total_cases} cases · {lastBatch.failed_cases} failed
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Precision Ledger ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Scale className="h-5 w-5 text-primary" /> Precision Ledger</CardTitle>
            <CardDescription>Delta between Manual and Synthetic scores per agent</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Manual Recall</TableHead>
                  <TableHead className="text-right">Synthetic Recall</TableHead>
                  <TableHead className="text-right">Δ Recall</TableHead>
                  <TableHead className="text-right">Manual Precision</TableHead>
                  <TableHead className="text-right">Synthetic Precision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledgerData ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{pct(row.manualRecall)}</TableCell>
                    <TableCell className="text-right">{pct(row.synthRecall)}</TableCell>
                    <TableCell className="text-right">
                      {row.recallDelta != null ? (
                        <Badge variant={Math.abs(row.recallDelta) > 0.05 ? "destructive" : "secondary"}>
                          {row.recallDelta > 0 ? "+" : ""}{(row.recallDelta * 100).toFixed(1)}%
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{pct(row.manualPrecision)}</TableCell>
                    <TableCell className="text-right">{pct(row.synthPrecision)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Section 3: Judge Calibration Audit ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Brain className="h-5 w-5 text-primary" /> Judge Calibration Audit</CardTitle>
            <CardDescription>Last 10 entries where a human disagreed with the AI judge</CardDescription>
          </CardHeader>
          <CardContent>
            {calibrations?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead className="text-right">Corrected Precision</TableHead>
                    <TableHead className="text-right">Corrected Recall</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calibrations.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{format(new Date(c.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant={c.human_verdict === "disagree" ? "destructive" : "secondary"}>
                          {c.human_verdict}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{c.corrected_precision_score != null ? pct(c.corrected_precision_score) : "—"}</TableCell>
                      <TableCell className="text-right">{c.corrected_recall_score != null ? pct(c.corrected_recall_score) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{c.human_notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No disagreements recorded yet.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Section 4: Prompt Trace ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" /> Prompt Trace</CardTitle>
            <CardDescription>Deployed prompt versions and fallback verification</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-center">Deployed Version</TableHead>
                  <TableHead className="text-center">Fallback Check</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(promptTrace ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">
                      {row.deployedVersion != null ? (
                        <Badge variant="secondary">v{row.deployedVersion}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.hasFallback ? (
                        <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <XCircle className="h-4 w-4 text-destructive mx-auto" />
                          </TooltipTrigger>
                          <TooltipContent>No prompt_defaults entry — agent will throw PROMPT_NOT_FOUND</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.deployedVersion != null || row.hasFallback ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20">Operational</Badge>
                      ) : (
                        <Badge variant="destructive">No Prompt</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Section 5: Compliance Export ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Download className="h-5 w-5 text-primary" /> Compliance Export</CardTitle>
            <CardDescription>Export proactive trigger log for EU AI Act regulatory reporting (Art. 14)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="outline" onClick={exportJSON} disabled={!proactiveCases?.length}>
                <FileJson className="h-4 w-4 mr-2" /> Export JSON
              </Button>
              <Button variant="outline" onClick={exportPDF} disabled={!proactiveCases?.length}>
                <FileText className="h-4 w-4 mr-2" /> Export PDF
              </Button>
              <Button onClick={downloadComplianceSummary} disabled={complianceLoading}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                {complianceLoading ? "Generating…" : "Download Compliance Summary"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {proactiveCases?.length ?? 0} proactive trigger(s) available
              </span>
            </div>
          </CardContent>
        </Card>


        {/* ── Section 5b: Model Drift Monitor (Art. 15) ── */}
        <Card className={driftData?.isDrifting ? "border-destructive/50" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingDown className={`h-5 w-5 ${driftData?.isDrifting ? "text-destructive" : "text-primary"}`} />
              Model Drift Monitor
              {driftData?.isDrifting && (
                <Badge variant="destructive" className="ml-2">⚠ DRIFT DETECTED</Badge>
              )}
            </CardTitle>
            <CardDescription>
              EU AI Act Art. 15 — Accuracy & Robustness: 30-day rolling precision/recall trend comparison
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Precision (Last 30d vs Prior 30d)</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold">{pct(driftData?.recentPrecision ?? null)}</span>
                  {driftData?.precisionDrift != null && (
                    <Badge variant={driftData.precisionDrift < -0.05 ? "destructive" : driftData.precisionDrift < 0 ? "secondary" : "default"}>
                      {driftData.precisionDrift > 0 ? "+" : ""}{(driftData.precisionDrift * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Prior: {pct(driftData?.previousPrecision ?? null)} · {driftData?.recentCount ?? 0} recent / {driftData?.previousCount ?? 0} prior evaluations
                </p>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recall (Last 30d vs Prior 30d)</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold">{pct(driftData?.recentRecall ?? null)}</span>
                  {driftData?.recallDrift != null && (
                    <Badge variant={driftData.recallDrift < -0.05 ? "destructive" : driftData.recallDrift < 0 ? "secondary" : "default"}>
                      {driftData.recallDrift > 0 ? "+" : ""}{(driftData.recallDrift * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Prior: {pct(driftData?.previousRecall ?? null)}
                </p>
              </div>
            </div>

            {driftData?.isDrifting && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Model Drift Warning</p>
                  <p className="text-xs text-muted-foreground">
                    Average precision has dropped by {pct(Math.abs(driftData.precisionDrift!))} over the last 30 days (&gt;5% threshold).
                    Benchmark re-run recommended.
                  </p>
                </div>
              </div>
            )}

            {!driftData?.isDrifting && driftData?.precisionDrift != null && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                No significant drift detected. Precision change within acceptable range.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center pt-4 pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-primary/30 bg-primary/5 px-6 py-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold tracking-wide text-primary">SRA & EU AI Act Compliant — Mar 2026</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

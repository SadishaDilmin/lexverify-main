import { useState, useCallback, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Wand2, CheckCircle2, XCircle, Clock, Rocket, RotateCcw, FileCode2, Eye,
  FlaskConical, Loader2, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { format } from "date-fns";
import InfoTooltip from "@/components/InfoTooltip";

const AGENT_TYPES = [
  { value: "source-of-wealth", label: "Olimey AI (SoW)" },
];

const PATCH_STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pending", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  applied: { label: "Applied", variant: "secondary" },
};

const VERSION_STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  deployed: { label: "Deployed", variant: "secondary" },
  rolled_back: { label: "Superseded", variant: "outline" },
};

const READINESS_RECALL_TARGET = 0.95;
const READINESS_PRECISION_TARGET = 0.85;
const LOW_MARGINAL_GAIN_THRESHOLD = 0.02;

export default function AdminPromptManagement() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [agentFilter, setAgentFilter] = useState("all");

  /* ── Patches query ── */
  const { data: patches = [], isLoading: patchesLoading } = useQuery({
    queryKey: ["prompt_patches", agentFilter],
    queryFn: async () => {
      let q = (supabase as any).from("prompt_patches").select("*").order("created_at", { ascending: false });
      if (agentFilter !== "all") q = q.eq("agent_id", agentFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  /* ── Versions query ── */
  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ["prompt_versions", agentFilter],
    queryFn: async () => {
      let q = (supabase as any).from("prompt_versions").select("*").order("created_at", { ascending: false });
      if (agentFilter !== "all") q = q.eq("agent_id", agentFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  /* ── Benchmark comparisons for readiness gate ── */
  const { data: benchmarkComparisons = [] } = useQuery({
    queryKey: ["benchmark_comparisons_readiness"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_comparisons")
        .select("benchmark_case_id, recall_score, precision_score, status, prompt_version")
        .eq("status", "complete");
      if (error) throw error;
      return data as any[];
    },
  });

  /* ── Benchmark cases to map agent_type ── */
  const { data: benchmarkCases = [] } = useQuery({
    queryKey: ["benchmark_cases_readiness"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_cases")
        .select("id, agent_type, confidence_level");
      if (error) throw error;
      return data as any[];
    },
  });

  /* ── Regression test runs for readiness gate ── */
  const { data: regressionRuns = [] } = useQuery({
    queryKey: ["regression_test_runs_readiness"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("regression_test_runs")
        .select("*")
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  /* ── Deploy readiness confirmation dialog state ── */
  const [deployConfirmDialog, setDeployConfirmDialog] = useState<{
    version: any;
    avgRecall: number | null;
    avgPrecision: number | null;
    deployedRecall: number | null;
    deployedPrecision: number | null;
    regressionOk: boolean | null;
    blockers: string[];
    warnings: string[];
    isReady: boolean;
    hasHighSeverityRegression: boolean;
  } | null>(null);
  const [regressionAckCode, setRegressionAckCode] = useState("");
  const [regressionAckError, setRegressionAckError] = useState(false);

  const REGRESSION_ACK_CODE = "DEPLOY-OVERRIDE";

  const openDeployGate = useCallback((version: any) => {
    const caseMap = new Map(benchmarkCases.map((bc: any) => [bc.id, bc]));
    // Use the latest comparison per benchmark case for this agent (most recent scores)
    const allAgentComparisons = benchmarkComparisons.filter((c: any) =>
      caseMap.get(c.benchmark_case_id)?.agent_type === version.agent_id
    );
    // Deduplicate: keep only the latest (first in desc-sorted array) per benchmark_case_id
    const latestByCase = new Map<string, any>();
    for (const c of allAgentComparisons) {
      if (!latestByCase.has(c.benchmark_case_id)) {
        latestByCase.set(c.benchmark_case_id, c);
      }
    }
    const agentComparisons = Array.from(latestByCase.values());
    const withRecall = agentComparisons.filter((c: any) => c.recall_score != null);
    const withPrecision = agentComparisons.filter((c: any) => c.precision_score != null);
    const avgRecall = withRecall.length > 0 ? withRecall.reduce((s: number, c: any) => s + Number(c.recall_score), 0) / withRecall.length : null;
    const avgPrecision = withPrecision.length > 0 ? withPrecision.reduce((s: number, c: any) => s + Number(c.precision_score), 0) / withPrecision.length : null;

    // Find currently deployed version's scores for delta calculation
    const deployedVersion = versions.find((v: any) => v.agent_id === version.agent_id && v.status === "deployed");
    let deployedRecall: number | null = null;
    let deployedPrecision: number | null = null;
    if (deployedVersion) {
      const deployedComparisons = benchmarkComparisons.filter((c: any) =>
        caseMap.get(c.benchmark_case_id)?.agent_type === version.agent_id && c.prompt_version === String(deployedVersion.version)
      );
      const dWithRecall = deployedComparisons.filter((c: any) => c.recall_score != null);
      const dWithPrecision = deployedComparisons.filter((c: any) => c.precision_score != null);
      deployedRecall = dWithRecall.length > 0 ? dWithRecall.reduce((s: number, c: any) => s + Number(c.recall_score), 0) / dWithRecall.length : null;
      deployedPrecision = dWithPrecision.length > 0 ? dWithPrecision.reduce((s: number, c: any) => s + Number(c.precision_score), 0) / dWithPrecision.length : null;
    }

    // Check for high-severity regressions: cases previously passing that now fail
    const highSeverityCases = benchmarkCases.filter((bc: any) =>
      bc.agent_type === version.agent_id && (bc.confidence_level === "high" || bc.confidence_level === "critical")
    );
    let hasHighSeverityRegression = false;
    for (const hsc of highSeverityCases) {
      const prevComp = benchmarkComparisons.find((c: any) =>
        c.benchmark_case_id === hsc.id && c.prompt_version === String(deployedVersion?.version) &&
        c.recall_score != null && c.recall_score >= READINESS_RECALL_TARGET
      );
      const newComp = benchmarkComparisons.find((c: any) =>
        c.benchmark_case_id === hsc.id && c.prompt_version !== String(deployedVersion?.version) &&
        c.recall_score != null && c.recall_score < READINESS_RECALL_TARGET
      );
      if (prevComp && newComp) {
        hasHighSeverityRegression = true;
        break;
      }
    }

    const latestRegression = regressionRuns.find((r: any) => r.agent_type === version.agent_id);
    const latestRegressions = typeof latestRegression?.summary?.regressions === "number"
      ? latestRegression.summary.regressions
      : null;
    const regressionOk = latestRegression ? (latestRegressions === 0 || latestRegressions == null) : null;

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (avgRecall != null && avgRecall < READINESS_RECALL_TARGET) blockers.push(`Recall ${Math.round(avgRecall * 100)}% < ${Math.round(READINESS_RECALL_TARGET * 100)}% target`);
    if (avgPrecision != null && avgPrecision < READINESS_PRECISION_TARGET) blockers.push(`Precision ${Math.round(avgPrecision * 100)}% < ${Math.round(READINESS_PRECISION_TARGET * 100)}% target`);
    if (regressionOk === false) blockers.push("Regressions found in latest test run");
    if (avgRecall == null && avgPrecision == null) blockers.push("No benchmark data available — deploy at your own risk");
    if (hasHighSeverityRegression) blockers.push("High-severity case(s) that previously passed are now failing — Regression Acknowledgment required");

    // Low marginal gain warning
    if (deployedRecall != null && avgRecall != null && deployedPrecision != null && avgPrecision != null) {
      const recallDelta = avgRecall - deployedRecall;
      const precisionDelta = avgPrecision - deployedPrecision;
      if (recallDelta < LOW_MARGINAL_GAIN_THRESHOLD && precisionDelta < LOW_MARGINAL_GAIN_THRESHOLD) {
        warnings.push(`Low Marginal Gain: Recall Δ ${(recallDelta * 100).toFixed(1)}%, Precision Δ ${(precisionDelta * 100).toFixed(1)}% (both < ${LOW_MARGINAL_GAIN_THRESHOLD * 100}%)`);
      }
    }

    setRegressionAckCode("");
    setRegressionAckError(false);
    setDeployConfirmDialog({
      version,
      avgRecall,
      avgPrecision,
      deployedRecall,
      deployedPrecision,
      regressionOk,
      blockers,
      warnings,
      isReady: blockers.length === 0,
      hasHighSeverityRegression,
    });
  }, [benchmarkComparisons, benchmarkCases, regressionRuns, versions]);

  /* ── Audit helper ── */
  const logAudit = useCallback(async (eventType: string, metadata: Record<string, any> = {}) => {
    if (!profile) return;
    await supabase.from("audit_log").insert({
      user_id: profile.user_id,
      user_name: profile.full_name,
      user_email: profile.email,
      user_position: profile.position,
      event_type: eventType,
      metadata,
    });
  }, [profile]);

  /* ── Patch review ── */
  const reviewPatch = useMutation({
    mutationFn: async ({ patchId, status, notes }: { patchId: string; status: string; notes: string }) => {
      const { error } = await (supabase as any).from("prompt_patches").update({
        status,
        reviewed_by: profile!.user_id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      }).eq("id", patchId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["prompt_patches"] });
      logAudit("prompt_patch_reviewed", { patch_id: vars.patchId, status: vars.status });
      toast({ title: `Patch ${vars.status}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Create version from approved patches ── */
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [versionForm, setVersionForm] = useState({ agent_id: "", prompt_text: "", change_reason: "" });
  const [selectedPatchIds, setSelectedPatchIds] = useState<string[]>([]);

  const approvedPatches = patches.filter((p: any) => p.status === "approved");

  const createVersion = useMutation({
    mutationFn: async () => {
      const maxVersion = versions.filter((v: any) => v.agent_id === versionForm.agent_id).reduce((m: number, v: any) => Math.max(m, v.version), 0);
      const { error } = await (supabase as any).from("prompt_versions").insert({
        agent_id: versionForm.agent_id,
        version: maxVersion + 1,
        prompt_text: versionForm.prompt_text,
        change_reason: versionForm.change_reason,
        patch_ids: selectedPatchIds,
        created_by: profile!.user_id,
      });
      if (error) throw error;
      if (selectedPatchIds.length > 0) {
        await (supabase as any).from("prompt_patches").update({ status: "applied" }).in("id", selectedPatchIds);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt_versions"] });
      qc.invalidateQueries({ queryKey: ["prompt_patches"] });
      logAudit("prompt_version_created", { agent_id: versionForm.agent_id, patches: selectedPatchIds.length });
      toast({ title: "Prompt version created" });
      setShowCreateVersion(false);
      setVersionForm({ agent_id: "", prompt_text: "", change_reason: "" });
      setSelectedPatchIds([]);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Version actions ── */
  const updateVersionStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "approved") {
        updates.approved_by = profile!.user_id;
        updates.approved_at = new Date().toISOString();
      }
      if (status === "deployed") {
        updates.deployed_at = new Date().toISOString();
        const version = versions.find((v: any) => v.id === id);
        if (version) {
          await (supabase as any).from("prompt_versions")
            .update({ status: "rolled_back" })
            .eq("agent_id", version.agent_id)
            .eq("status", "deployed")
            .neq("id", id);
        }
      }
      const { error } = await (supabase as any).from("prompt_versions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["prompt_versions"] });
      logAudit("prompt_version_status_changed", { version_id: vars.id, status: vars.status });
      toast({ title: `Version ${vars.status}` });
      if (vars.status === "deployed") {
        const version = versions.find((v: any) => v.id === vars.id);
        if (version) {
          setTimeout(() => verifyDeploy(vars.id, version.agent_id), 500);
        }
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Patch detail dialog ── */
  const [viewPatch, setViewPatch] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  /* ── Version detail dialog ── */
  const [viewVersion, setViewVersion] = useState<any>(null);

  /* ── Deploy Verification ── */
  const [verifyingVersionId, setVerifyingVersionId] = useState<string | null>(null);
  const [regressionRunningForVersion, setRegressionRunningForVersion] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, { status: string; message: string; checks?: Record<string, boolean>; duration_ms?: number; regression?: "running" | "triggered" | "failed" }>>({});

  /* ── Regression polling state ── */
  const [regressionPolling, setRegressionPolling] = useState<Record<string, { runId: string; agentId: string; startTime: number }>>({});
  const [regressionLiveStatus, setRegressionLiveStatus] = useState<Record<string, { status: string; total: number; completed: number; failed: number; regressions: number | null; error?: string | null }>>({});
  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const regressionToastRef = useRef<Record<string, string>>({});

  const startRegressionPolling = useCallback((versionId: string, runId: string, agentId: string) => {
    if (pollingRef.current[versionId]) {
      clearInterval(pollingRef.current[versionId]);
      delete pollingRef.current[versionId];
    }

    setRegressionPolling(prev => ({ ...prev, [versionId]: { runId, agentId, startTime: Date.now() } }));
    setRegressionLiveStatus(prev => ({ ...prev, [versionId]: { status: "running", total: 0, completed: 0, failed: 0, regressions: null } }));
    delete regressionToastRef.current[versionId];

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (intervalId && pollingRef.current[versionId] !== intervalId) {
        clearInterval(intervalId);
        return;
      }

      try {
        const { data, error } = await (supabase as any).from("regression_test_runs")
          .select("status, total_cases, completed_cases, summary")
          .eq("id", runId)
          .single();
        if (error || !data) return;

        const summary = (data.summary && typeof data.summary === "object") ? data.summary as Record<string, any> : {};
        const regressions = typeof summary.regressions === "number" ? summary.regressions : null;
        const failed = typeof summary.failed === "number" ? summary.failed : 0;
        const errorMessage = typeof summary.error === "string" ? summary.error : null;

        setRegressionLiveStatus(prev => ({
          ...prev,
          [versionId]: {
            status: data.status,
            total: data.total_cases || 0,
            completed: data.completed_cases || 0,
            failed,
            regressions,
            error: errorMessage,
          },
        }));

        if (data.status === "complete" || data.status === "failed") {
          if (pollingRef.current[versionId]) {
            clearInterval(pollingRef.current[versionId]);
            delete pollingRef.current[versionId];
          }
          setRegressionPolling(prev => { const n = { ...prev }; delete n[versionId]; return n; });

          const regPassed = data.status === "complete" && (regressions === 0 || regressions == null);
          setVerifyResults(prev => ({
            ...prev,
            [versionId]: {
              ...prev[versionId],
              regression: regPassed ? "triggered" : "failed",
            },
          }));

          const toastKey = `${runId}:${data.status}`;
          if (regressionToastRef.current[versionId] !== toastKey) {
            regressionToastRef.current[versionId] = toastKey;
            qc.invalidateQueries({ queryKey: ["regression_test_runs_readiness"] });
            toast({
              title: data.status === "complete" ? "Regression test complete ✅" : "Regression test failed ❌",
              description: data.status === "complete"
                ? `${data.completed_cases}/${data.total_cases} cases evaluated. ${regressions || 0} regression(s) found.`
                : (errorMessage || `${failed || 0} case(s) failed during evaluation.`),
              variant: regPassed ? "default" : "destructive",
            });
          }
        }
      } catch { /* ignore polling errors */ }
    };

    intervalId = setInterval(poll, 4000);
    pollingRef.current[versionId] = intervalId;
    poll();
  }, [qc, toast]);

  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

  const triggerRegression = useCallback(async (versionId: string, agentId: string) => {
    setRegressionRunningForVersion(versionId);
    setVerifyResults(prev => ({
      ...prev,
      [versionId]: { ...prev[versionId], regression: "running" },
    }));

    try {
      const resp = await supabase.functions.invoke("run-regression-test", {
        body: { agent_type: agentId },
      });

      if (resp.error) {
        const statusCode = (resp.error as any)?.context?.status;
        if (statusCode === 409) {
          const payload = await (resp.error as any).context.json().catch(() => ({}));
          const existingRunId = payload?.existing_run_id;
          setVerifyResults(prev => ({
            ...prev,
            [versionId]: { ...prev[versionId], regression: "triggered" },
          }));
          toast({
            title: "Regression already running",
            description: "A test is already in progress for this agent. Tracking its progress.",
          });
          if (existingRunId) {
            startRegressionPolling(versionId, existingRunId, agentId);
          }
          return;
        }
        throw resp.error;
      }

      const runId = resp.data?.run_id;
      setVerifyResults(prev => ({
        ...prev,
        [versionId]: { ...prev[versionId], regression: "triggered" },
      }));
      toast({
        title: "Regression test triggered 🧪",
        description: `Full benchmark suite running for ${AGENT_TYPES.find(a => a.value === agentId)?.label ?? agentId}. Progress will update live.`,
      });
      if (runId) {
        startRegressionPolling(versionId, runId, agentId);
      }
    } catch (e: any) {
      setVerifyResults(prev => ({
        ...prev,
        [versionId]: { ...prev[versionId], regression: "failed" },
      }));
      toast({ title: "Regression test failed", description: e.message, variant: "destructive" });
    } finally {
      setRegressionRunningForVersion(null);
    }
  }, [toast, startRegressionPolling]);

  const verifyDeploy = useCallback(async (versionId: string, agentId: string) => {
    setVerifyingVersionId(versionId);
    try {
      const { data, error } = await supabase.functions.invoke("verify-prompt-deploy", {
        body: { agent_id: agentId, version_id: versionId },
      });
      if (error) throw error;
      setVerifyResults(prev => ({ ...prev, [versionId]: data }));
      toast({
        title: data.status === "pass" ? "Deploy Verified ✅" : "Verification Warning ⚠️",
        description: data.message,
        variant: data.status === "pass" ? "default" : "destructive",
      });
      if (data.status === "pass") {
        setTimeout(() => triggerRegression(versionId, agentId), 1000);
      }
    } catch (e: any) {
      setVerifyResults(prev => ({ ...prev, [versionId]: { status: "error", message: e.message } }));
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setVerifyingVersionId(null);
    }
  }, [toast, triggerRegression]);

  const handleDeployWithGate = useCallback(() => {
    if (!deployConfirmDialog) return;
    if (deployConfirmDialog.hasHighSeverityRegression) {
      if (regressionAckCode !== REGRESSION_ACK_CODE) {
        setRegressionAckError(true);
        return;
      }
      logAudit("regression_acknowledgment_override", {
        version_id: deployConfirmDialog.version.id,
        agent_id: deployConfirmDialog.version.agent_id,
      });
    }
    updateVersionStatus.mutate({ id: deployConfirmDialog.version.id, status: "deployed" });
    setDeployConfirmDialog(null);
  }, [deployConfirmDialog, regressionAckCode, updateVersionStatus, logAudit]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCode2 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">Prompt Management
                <InfoTooltip title="Prompt Management">
                  <p>This page manages the system prompts that control how each AI agent analyses documents. Changes follow a governed pipeline:</p>
                  <p className="mt-1"><strong>Patches</strong> → AI-suggested improvements based on benchmark failure patterns.</p>
                  <p><strong>Versions</strong> → Approved patches are compiled into versioned prompts that can be deployed to production.</p>
                  <p><strong>Deploy → Verify → Regression</strong> → Safety pipeline ensures changes don't break existing behaviour before going live.</p>
                </InfoTooltip>
              </h1>
              <p className="text-xs text-muted-foreground">Version control, approval workbench &amp; deployment</p>
            </div>
          </div>
            <div className="flex items-center gap-2">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Filter by agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Agents</SelectItem>
                {AGENT_TYPES.map(a => <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="patches" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="patches" className="text-xs gap-1">
              <Wand2 className="h-3.5 w-3.5" /> Prompt Patches ({patches.length})
              <InfoTooltip title="Prompt Patches"><p>AI-generated suggestions for improving agent prompts based on recurring failure patterns identified in benchmark evaluations. Each patch includes an instruction, predicted impact, and failure example. Approve or reject patches, then compile approved ones into a new prompt version.</p></InfoTooltip>
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs gap-1">
              <FileCode2 className="h-3.5 w-3.5" /> Versions ({versions.length})
              <InfoTooltip title="Prompt Versions"><p>Versioned snapshots of agent system prompts. Each version goes through a lifecycle: <strong>Draft → Approved → Deployed → Superseded</strong>. Only approved versions can be deployed. Deployment triggers an automatic health check and optional regression test.</p></InfoTooltip>
            </TabsTrigger>
          </TabsList>

          {/* ── Patches Tab ── */}
          <TabsContent value="patches" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                AI-generated prompt improvement suggestions from benchmark comparisons. Review, approve, or reject before creating a new version.
              </p>
              {approvedPatches.length > 0 && (
                <Button size="sm" onClick={() => {
                  setSelectedPatchIds(approvedPatches.map((p: any) => p.id));
                  setVersionForm({
                    agent_id: approvedPatches[0].agent_id,
                    prompt_text: approvedPatches.map((p: any) => `// PATCH: ${p.title}\n${p.patch_instruction}`).join("\n\n"),
                    change_reason: approvedPatches.map((p: any) => p.title).join("; "),
                  });
                  setShowCreateVersion(true);
                }}>
                  <Rocket className="h-4 w-4 mr-1" /> Create Version from {approvedPatches.length} Approved
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patch</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patchesLoading && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                    )}
                    {!patchesLoading && patches.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No patches yet. Run a comparison and generate patches from the AI Learning Engine.</TableCell></TableRow>
                    )}
                    {patches.map((p: any) => {
                      const st = PATCH_STATUS_META[p.status] || PATCH_STATUS_META.pending;
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <button className="text-left" onClick={() => { setViewPatch(p); setReviewNotes(p.review_notes || ""); }}>
                              <span className="text-sm font-medium hover:underline">{p.title}</span>
                              <span className="block text-[10px] text-muted-foreground">{p.change_reason.slice(0, 80)}</span>
                            </button>
                          </TableCell>
                          <TableCell className="text-xs">{AGENT_TYPES.find(a => a.value === p.agent_id)?.label ?? p.agent_id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{p.predicted_impact}</TableCell>
                          <TableCell><Badge variant={st.variant} className="text-[10px]">{st.label}</Badge></TableCell>
                          <TableCell className="text-right">
                            {p.status === "pending" && (
                              <div className="flex items-center justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Approve" onClick={() => reviewPatch.mutate({ patchId: p.id, status: "approved", notes: "" })}>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Reject" onClick={() => reviewPatch.mutate({ patchId: p.id, status: "rejected", notes: "" })}>
                                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Versions Tab ── */}
          <TabsContent value="versions" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Prompt version history with approval workflow. Only approved versions can be deployed.
              </p>
              <Button size="sm" onClick={() => { setSelectedPatchIds([]); setVersionForm({ agent_id: AGENT_TYPES[0].value, prompt_text: "", change_reason: "" }); setShowCreateVersion(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New Version
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                     <TableHead>Agent</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="flex items-center gap-1">Verification <InfoTooltip title="Verification Column"><p>Shows the result of the 3-stage safety pipeline: <strong>Deploy</strong> (push to production) → <strong>Verify</strong> (health check with a synthetic case) → <strong>Regression</strong> (full benchmark comparison). "Verified" = health check passed. "Regression passed" = no performance degradation across all cases.</p></InfoTooltip></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versionsLoading && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                    )}
                    {!versionsLoading && versions.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No prompt versions yet.</TableCell></TableRow>
                    )}
                    {versions.map((v: any) => {
                      const st = VERSION_STATUS_META[v.status] || VERSION_STATUS_META.draft;
                      const vr = verifyResults[v.id];
                      const isVerifying = verifyingVersionId === v.id;
                      return (
                        <TableRow key={v.id}>
                          <TableCell className="text-xs font-medium">{AGENT_TYPES.find(a => a.value === v.agent_id)?.label ?? v.agent_id}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">v{v.version}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{v.change_reason}</TableCell>
                          <TableCell><Badge variant={st.variant} className="text-[10px]">{st.label}</Badge></TableCell>
                          <TableCell>
                            {isVerifying && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
                              </div>
                            )}
                            {!isVerifying && regressionRunningForVersion === v.id && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Triggering regression…
                              </div>
                            )}
                            {/* Live regression progress */}
                            {!isVerifying && regressionRunningForVersion !== v.id && regressionPolling[v.id] && regressionLiveStatus[v.id] && (
                              (() => {
                                const rs = regressionLiveStatus[v.id];
                                const pct = rs.total > 0 ? Math.round((rs.completed / rs.total) * 100) : 5;
                                return (
                                  <div className="space-y-1 min-w-[140px]">
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                      <span className="text-foreground font-medium">Regression running</span>
                                      <span className="ml-auto text-muted-foreground font-mono tabular-nums">{rs.completed}/{rs.total}</span>
                                    </div>
                                    <Progress value={pct} className="h-1.5 bg-muted rounded-full" />
                                  </div>
                                );
                              })()
                            )}
                            {/* Final state badges */}
                            {!isVerifying && regressionRunningForVersion !== v.id && !regressionPolling[v.id] && vr && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {vr.regression === "failed" ? (
                                        <Badge variant="destructive" className="text-[10px] gap-1">
                                          <FlaskConical className="h-3 w-3" /> Regression failed
                                        </Badge>
                                      ) : vr.regression === "triggered" ? (
                                        <>
                                          {vr.status === "pass" ? (
                                            <Badge variant="default" className="text-[10px] gap-1">
                                              <ShieldCheck className="h-3 w-3" /> Verified
                                            </Badge>
                                          ) : vr.status === "fail" ? (
                                            <Badge variant="destructive" className="text-[10px] gap-1">
                                              <AlertTriangle className="h-3 w-3" /> Issues
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[10px] gap-1">
                                              <XCircle className="h-3 w-3" /> Error
                                            </Badge>
                                          )}
                                          {regressionLiveStatus[v.id]?.status === "complete" ? (
                                            <Badge variant={regressionLiveStatus[v.id]?.regressions === 0 ? "default" : "destructive"} className="text-[10px] gap-1">
                                              <FlaskConical className="h-3 w-3" />
                                              {regressionLiveStatus[v.id]?.regressions === 0 || regressionLiveStatus[v.id]?.regressions == null
                                                ? `Regression passed (${regressionLiveStatus[v.id]?.completed}/${regressionLiveStatus[v.id]?.total})`
                                                : `${regressionLiveStatus[v.id]?.regressions} regression(s)`}
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary" className="text-[10px] gap-1">
                                              <FlaskConical className="h-3 w-3" /> Regression sent
                                            </Badge>
                                          )}
                                        </>
                                      ) : vr.status === "pass" ? (
                                        <Badge variant="default" className="text-[10px] gap-1">
                                          <ShieldCheck className="h-3 w-3" /> Passed
                                        </Badge>
                                      ) : vr.status === "fail" ? (
                                        <Badge variant="destructive" className="text-[10px] gap-1">
                                          <AlertTriangle className="h-3 w-3" /> Issues
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] gap-1">
                                          <XCircle className="h-3 w-3" /> Error
                                        </Badge>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                                    <p>{vr.message}</p>
                                    {vr.duration_ms && <p className="text-muted-foreground mt-1">Response time: {(vr.duration_ms / 1000).toFixed(1)}s</p>}
                                    {vr.checks && (
                                      <ul className="mt-1 space-y-0.5">
                                        {Object.entries(vr.checks).map(([k, val]) => (
                                          <li key={k} className="flex items-center gap-1">
                                            {val ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <XCircle className="h-3 w-3 text-destructive" />}
                                            {k.replace(/_/g, " ")}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    {regressionLiveStatus[v.id]?.status === "complete" && (
                                      <p className="text-muted-foreground mt-2 border-t pt-1">
                                        🧪 Regression complete — {regressionLiveStatus[v.id]?.completed}/{regressionLiveStatus[v.id]?.total} cases, {regressionLiveStatus[v.id]?.regressions || 0} regression(s)
                                      </p>
                                    )}
                                    {vr.regression === "triggered" && !regressionLiveStatus[v.id]?.status && (
                                      <p className="text-muted-foreground mt-2 border-t pt-1">🧪 Regression test triggered — view results in Benchmark Dashboard</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!isVerifying && regressionRunningForVersion !== v.id && !regressionPolling[v.id] && !vr && v.status !== "deployed" && (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(v.created_at), "dd MMM yyyy, HH:mm")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => setViewVersion(v)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {v.status === "draft" && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Approve" onClick={() => updateVersionStatus.mutate({ id: v.id, status: "approved" })}>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                              )}
                              {v.status === "approved" && (
                                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => openDeployGate(v)}>
                                  <Rocket className="h-3 w-3 mr-1" /> Deploy
                                </Button>
                              )}
                              {v.status === "deployed" && (
                                <>
                                  <Button
                                    size="sm" variant="outline" className="h-7 text-xs gap-1"
                                    title="Run verification with synthetic case"
                                    disabled={isVerifying}
                                    onClick={() => verifyDeploy(v.id, v.agent_id)}
                                  >
                                    <FlaskConical className="h-3 w-3" /> Verify
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Rollback" onClick={() => updateVersionStatus.mutate({ id: v.id, status: "rolled_back" })}>
                                    <RotateCcw className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Patch Detail Dialog ── */}
        <Dialog open={!!viewPatch} onOpenChange={() => setViewPatch(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewPatch?.title}</DialogTitle>
              <DialogDescription>Prompt patch detail &amp; review</DialogDescription>
            </DialogHeader>
            {viewPatch && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground text-xs block">Agent</span>{AGENT_TYPES.find(a => a.value === viewPatch.agent_id)?.label}</div>
                  <div><span className="text-muted-foreground text-xs block">Status</span><Badge variant={PATCH_STATUS_META[viewPatch.status]?.variant || "outline"} className="text-xs">{PATCH_STATUS_META[viewPatch.status]?.label}</Badge></div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Patch Instruction</Label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs whitespace-pre-wrap font-mono">{viewPatch.patch_instruction}</pre>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Failure Example</Label>
                  <p className="text-sm mt-1">{viewPatch.failure_example}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Change Reason</Label>
                  <p className="text-sm mt-1">{viewPatch.change_reason}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Predicted Impact</Label>
                  <p className="text-sm mt-1">{viewPatch.predicted_impact}</p>
                </div>
                {viewPatch.status === "pending" && (
                  <div className="border-t pt-4 space-y-3">
                    <div>
                      <Label className="text-xs">Review Notes</Label>
                      <Textarea className="mt-1 text-xs" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Optional notes…" />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" variant="default" onClick={() => { reviewPatch.mutate({ patchId: viewPatch.id, status: "approved", notes: reviewNotes }); setViewPatch(null); }}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button className="flex-1" variant="destructive" onClick={() => { reviewPatch.mutate({ patchId: viewPatch.id, status: "rejected", notes: reviewNotes }); setViewPatch(null); }}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Version Detail Dialog ── */}
        <Dialog open={!!viewVersion} onOpenChange={() => setViewVersion(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {AGENT_TYPES.find(a => a.value === viewVersion?.agent_id)?.label} — v{viewVersion?.version}
              </DialogTitle>
              <DialogDescription>Prompt version detail</DialogDescription>
            </DialogHeader>
            {viewVersion && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground text-xs block">Status</span><Badge variant={VERSION_STATUS_META[viewVersion.status]?.variant || "outline"}>{VERSION_STATUS_META[viewVersion.status]?.label}</Badge></div>
                  <div><span className="text-muted-foreground text-xs block">Created</span>{format(new Date(viewVersion.created_at), "dd MMM yyyy HH:mm")}</div>
                  {viewVersion.deployed_at && <div><span className="text-muted-foreground text-xs block">Deployed</span>{format(new Date(viewVersion.deployed_at), "dd MMM yyyy HH:mm")}</div>}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Change Reason</Label>
                  <p className="text-sm mt-1">{viewVersion.change_reason}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Prompt Text</Label>
                  <ScrollArea className="max-h-[400px] mt-1">
                    <pre className="p-3 bg-muted rounded-md text-xs whitespace-pre-wrap font-mono">{viewVersion.prompt_text}</pre>
                  </ScrollArea>
                </div>
                {viewVersion.patch_ids?.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Applied Patches</Label>
                    <p className="text-xs mt-1">{viewVersion.patch_ids.length} patch(es) incorporated</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Create Version Dialog ── */}
        <Dialog open={showCreateVersion} onOpenChange={setShowCreateVersion}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Prompt Version</DialogTitle>
              <DialogDescription>
                {selectedPatchIds.length > 0
                  ? `Creating from ${selectedPatchIds.length} approved patch(es)`
                  : "Create a new prompt version manually"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Agent *</Label>
                <Select value={versionForm.agent_id} onValueChange={v => setVersionForm(p => ({ ...p, agent_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select agent…" /></SelectTrigger>
                  <SelectContent>{AGENT_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Change Reason *</Label>
                <Input className="mt-1" value={versionForm.change_reason} onChange={e => setVersionForm(p => ({ ...p, change_reason: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Prompt Text *</Label>
                <Textarea className="mt-1 min-h-[250px] text-xs font-mono" value={versionForm.prompt_text} onChange={e => setVersionForm(p => ({ ...p, prompt_text: e.target.value }))} placeholder="Full prompt text or patch additions…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateVersion(false)}>Cancel</Button>
              <Button onClick={() => createVersion.mutate()} disabled={!versionForm.agent_id || !versionForm.prompt_text || createVersion.isPending}>
                {createVersion.isPending ? "Creating…" : "Create Version"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Deploy Readiness Gate Dialog ── */}
        <Dialog open={!!deployConfirmDialog} onOpenChange={() => setDeployConfirmDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {deployConfirmDialog?.isReady ? (
                  <ShieldCheck className="h-5 w-5 text-primary" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                Deployment Readiness Check
              </DialogTitle>
              <DialogDescription>
                {AGENT_TYPES.find(a => a.value === deployConfirmDialog?.version?.agent_id)?.label} — v{deployConfirmDialog?.version?.version}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Recall</p>
                  <p className={`text-lg font-bold ${deployConfirmDialog?.avgRecall != null ? (deployConfirmDialog.avgRecall >= READINESS_RECALL_TARGET ? "text-primary" : "text-destructive") : "text-muted-foreground"}`}>
                    {deployConfirmDialog?.avgRecall != null ? `${Math.round(deployConfirmDialog.avgRecall * 100)}%` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Target: {Math.round(READINESS_RECALL_TARGET * 100)}%</p>
                  {deployConfirmDialog?.deployedRecall != null && deployConfirmDialog?.avgRecall != null && (
                    <p className={`text-[10px] font-medium mt-0.5 ${deployConfirmDialog.avgRecall - deployConfirmDialog.deployedRecall >= 0 ? "text-primary" : "text-destructive"}`}>
                      Δ {((deployConfirmDialog.avgRecall - deployConfirmDialog.deployedRecall) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Precision</p>
                  <p className={`text-lg font-bold ${deployConfirmDialog?.avgPrecision != null ? (deployConfirmDialog.avgPrecision >= READINESS_PRECISION_TARGET ? "text-primary" : "text-destructive") : "text-muted-foreground"}`}>
                    {deployConfirmDialog?.avgPrecision != null ? `${Math.round(deployConfirmDialog.avgPrecision * 100)}%` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Target: {Math.round(READINESS_PRECISION_TARGET * 100)}%</p>
                  {deployConfirmDialog?.deployedPrecision != null && deployConfirmDialog?.avgPrecision != null && (
                    <p className={`text-[10px] font-medium mt-0.5 ${deployConfirmDialog.avgPrecision - deployConfirmDialog.deployedPrecision >= 0 ? "text-primary" : "text-destructive"}`}>
                      Δ {((deployConfirmDialog.avgPrecision - deployConfirmDialog.deployedPrecision) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Regression</p>
                  <p className={`text-lg font-bold ${deployConfirmDialog?.regressionOk === true ? "text-primary" : deployConfirmDialog?.regressionOk === false ? "text-destructive" : "text-muted-foreground"}`}>
                    {deployConfirmDialog?.regressionOk === true ? "✓ Stable" : deployConfirmDialog?.regressionOk === false ? "✗ Issues" : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Zero regressions</p>
                </div>
              </div>

              {/* Warnings */}
              {deployConfirmDialog?.warnings && deployConfirmDialog.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {deployConfirmDialog.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                      <span className="text-xs text-yellow-700 dark:text-yellow-400">{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Readiness badge */}
              {deployConfirmDialog?.isReady ? (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Ready for Live — all thresholds met</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-destructive">Blockers:</p>
                  <ul className="space-y-1">
                    {deployConfirmDialog?.blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Regression Acknowledgment Code */}
              {deployConfirmDialog?.hasHighSeverityRegression && (
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-medium text-destructive">Regression Acknowledgment Required</Label>
                  <p className="text-[10px] text-muted-foreground">
                    High-severity cases have regressed. To override, enter the acknowledgment code: <code className="font-mono bg-muted px-1 rounded">DEPLOY-OVERRIDE</code>
                  </p>
                  <Input
                    className={`font-mono text-xs ${regressionAckError ? "border-destructive" : ""}`}
                    placeholder="Enter acknowledgment code…"
                    value={regressionAckCode}
                    onChange={e => { setRegressionAckCode(e.target.value); setRegressionAckError(false); }}
                  />
                  {regressionAckError && (
                    <p className="text-[10px] text-destructive">Invalid acknowledgment code</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeployConfirmDialog(null)}>Cancel</Button>
              {deployConfirmDialog?.isReady ? (
                <Button onClick={handleDeployWithGate}>
                  <Rocket className="h-4 w-4 mr-1" /> Deploy
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  disabled={deployConfirmDialog?.hasHighSeverityRegression && regressionAckCode !== REGRESSION_ACK_CODE}
                  onClick={handleDeployWithGate}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" /> Deploy Anyway
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
function Plus({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

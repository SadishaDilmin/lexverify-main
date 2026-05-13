import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useBenchmarkPolling } from "@/hooks/useBenchmarkPolling";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError, friendlyEdgeFunctionError } from "@/lib/edgeFunctionErrors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  BarChart3, Database, FlaskConical, Beaker, TrendingUp, AlertTriangle,
  Play, Filter, Loader2, ShieldCheck, XCircle, Gavel, BrainCircuit, Wand2,
  ArrowRight, Lightbulb, GitCompare, Rocket, ArrowUp, ArrowDown, Minus,
  CheckCircle2, XOctagon, Plus, BookOpen, Bell, Check, Info, Trash2, PlayCircle,
  Upload, ChevronDown, Zap, StopCircle,
} from "lucide-react";
import adversarialSowCases from "@/data/uk_adversarial_sow.json";
import { format } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, ReferenceLine,
} from "recharts";
import BenchmarkCaseDetail from "@/components/benchmark/BenchmarkCaseDetail";
import NewBenchmarkCaseDialog from "@/components/benchmark/NewBenchmarkCaseDialog";
import InfoTooltip from "@/components/InfoTooltip";
import TimedProgressBar from "@/components/TimedProgressBar";

/** Normalize all backend batch statuses to a consistent label + variant */
function normalizeBatchStatus(status: string): { label: string; variant: "default" | "destructive" | "secondary" | "outline" } {
  switch (status) {
    case "complete":
    case "completed":
      return { label: "Complete", variant: "default" };
    case "credit_limit":
    case "credit_exhausted":
      return { label: "Credit Limit", variant: "destructive" };
    case "failed":
      return { label: "Failed", variant: "destructive" };
    case "timeout":
      return { label: "Timeout", variant: "destructive" };
    case "pending":
      return { label: "Pending", variant: "secondary" };
    case "running":
      return { label: "Running", variant: "secondary" };
    default:
      return { label: status || "Unknown", variant: "outline" };
  }
}

const AGENT_TYPES = [
  { value: "source-of-wealth", label: "Olimey AI (SoW)" },
];

const READINESS_RECALL_TARGET = 0.95;
const READINESS_PRECISION_TARGET = 0.85;

const DIFF_LABELS: Record<string, string> = {
  match: "Match",
  ai_missed_material_issue: "AI Missed Issue",
  ai_false_positive: "False Positive",
  data_extraction_error: "Extraction Error",
  severity_classification_error: "Severity Mismatch",
  action_recommendation_error: "Action Error",
  evidence_citation_failure: "Citation Failure",
};

const VERDICT_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ai_correct: { label: "AI Correct", variant: "default" },
  human_correct: { label: "Human Correct", variant: "destructive" },
  partially_correct: { label: "Partial", variant: "secondary" },
  inconclusive: { label: "Inconclusive", variant: "outline" },
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(220 70% 55%)",
  "hsl(30 80% 55%)",
  "hsl(280 60% 55%)",
  "hsl(160 60% 45%)",
];

export default function AdminBenchmarkDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [skipEvaluated, setSkipEvaluated] = useState(true);
  const [excludeSyntheticFromTargets, setExcludeSyntheticFromTargets] = useState(false);
  const [regressionRunning, setRegressionRunning] = useState(false);
  const [patchGenRunning, setPatchGenRunning] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedPatternIds, setSelectedPatternIds] = useState<Set<string>>(new Set());
  const [selectedPatchIds, setSelectedPatchIds] = useState<Set<string>>(new Set());
  const [testingPatchId, setTestingPatchId] = useState<string | null>(null);

  /* ── vault-merged state ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [batchStartTime, setBatchStartTime] = useState(0);
  const batchCancelledRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedRegressionRun, setExpandedRegressionRun] = useState<string | null>(null);
  const [regressionCaseFilter, setRegressionCaseFilter] = useState<string>("all");
  const [showSingleCasePicker, setShowSingleCasePicker] = useState(false);
  const [singleCaseSearch, setSingleCaseSearch] = useState("");

  // Deep-link: auto-select case from URL query param
  useEffect(() => {
    const caseId = searchParams.get("case");
    if (caseId) setSelectedCaseId(caseId);
  }, [searchParams]);

  /* ── create case mutation ── */
  const createCase = useMutation({
    mutationFn: async (form: { title: string; property_address: string; transaction_type: string; case_type: string; agent_type: string; notes: string }) => {
      const { error } = await (supabase as any).from("benchmark_cases").insert({ ...form, created_by: profile!.user_id });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bm_dash_cases"] });
      qc.invalidateQueries({ queryKey: ["benchmark_cases"] });
      toast({ title: "Benchmark case created" });
      setShowNewDialog(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── queries ── */
  const { data: cases = [], isLoading: casesLoading, refetch: refetchCases } = useQuery({
    queryKey: ["bm_dash_cases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_cases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const { data: comparisons = [] } = useQuery({
    queryKey: ["bm_dash_comparisons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_comparisons")
        .select("*")
        .in("status", ["complete", "completed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    staleTime: 60_000,
    refetchInterval: 15_000,
  });

  const { data: compItems = [] } = useQuery({
    queryKey: ["bm_dash_comp_items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_comparison_items").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data as any[];
    },
    staleTime: 60_000,
    refetchInterval: 15_000,
  });

  const { data: judgeReviews = [] } = useQuery({
    queryKey: ["bm_dash_judge_reviews"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_judge_reviews").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as any[];
    },
    staleTime: 60_000,
    refetchInterval: 15_000,
  });

  const { data: failurePatternsDB = [] } = useQuery({
    queryKey: ["bm_dash_failure_patterns"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_failure_patterns")
        .select("*")
        .order("updated_at", { ascending: false })
        .order("occurrence_count", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15_000,
  });

  const { data: promptPatches = [] } = useQuery({
    queryKey: ["bm_dash_prompt_patches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prompt_patches").select("id, title, agent_id, status, created_at, benchmark_case_id").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: regressionRuns = [] } = useQuery({
    queryKey: ["bm_dash_regression_runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("regression_test_runs").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: (query) => {
      const runs = query.state.data as any[] | undefined;
      const hasActive = runs?.some((r: any) => r.status === "running" || r.status === "pending");
      return hasActive ? 5000 : false;
    },
  });

  const { data: regressionResults = [] } = useQuery({
    queryKey: ["bm_dash_regression_results"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("regression_test_results").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch comparison items for proposed comparisons in regression results to build failure reason summaries
  const proposedComparisonIds = regressionResults
    .filter((r: any) => r.regression_detected && r.proposed_comparison_id)
    .map((r: any) => r.proposed_comparison_id as string);

  const { data: regressionComparisonItems = [] } = useQuery({
    queryKey: ["bm_dash_regression_comp_items", proposedComparisonIds],
    queryFn: async () => {
      if (proposedComparisonIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("benchmark_comparison_items")
        .select("comparison_id, difference_type")
        .in("comparison_id", proposedComparisonIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: proposedComparisonIds.length > 0,
  });

  // Build a map: proposed_comparison_id → failure reason summary string
  const regressionReasonMap = useMemo(() => {
    const map: Record<string, string> = {};
    const grouped: Record<string, Record<string, number>> = {};
    for (const item of regressionComparisonItems) {
      if (!grouped[item.comparison_id]) grouped[item.comparison_id] = {};
      const dt = item.difference_type || "unknown";
      grouped[item.comparison_id][dt] = (grouped[item.comparison_id][dt] || 0) + 1;
    }
    const labels: Record<string, string> = {
      human_only: "missed",
      ai_only: "hallucinated",
      mismatch: "mismatch",
      match: "matched",
    };
    for (const [compId, counts] of Object.entries(grouped)) {
      const parts: string[] = [];
      for (const dt of ["human_only", "ai_only", "mismatch"] as const) {
        if (counts[dt]) parts.push(`${counts[dt]} ${labels[dt] || dt}`);
      }
      map[compId] = parts.length > 0 ? parts.join(", ") : "—";
    }
    return map;
  }, [regressionComparisonItems]);

  const { data: promptVersions = [] } = useQuery({
    queryKey: ["bm_dash_prompt_versions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("prompt_versions").select("*").order("version", { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: autoDeploySettings = [] } = useQuery({
    queryKey: ["bm_dash_auto_deploy"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("auto_deploy_settings").select("*").order("agent_type");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: adminNotifications = [], refetch: refetchNotifs } = useQuery({
    queryKey: ["bm_dash_notifications"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("admin_notifications")
        .select("*")
        .in("event_type", ["regression_test_complete", "regression_test_failed", "batch_evaluation_complete", "auto_deploy_prompt_version"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  // Active batch tracking (no auto-refetch — managed by useBenchmarkPolling)
  const { data: activeBatch, refetch: refetchBatch } = useQuery({
    queryKey: ["bm_active_batch"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_batches")
        .select("*")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });

  // Intelligent polling with exponential backoff + visibility-aware
  const batchProgressPct = activeBatch
    ? activeBatch.total_cases > 0
      ? Math.round(((activeBatch.completed_cases + activeBatch.failed_cases) / activeBatch.total_cases) * 100)
      : 0
    : 0;

  const pollAndTriggerWorker = useCallback(async () => {
    refetchBatch();
    // Force-release stale locks before poking the worker
    await supabase
      .from("benchmark_system_locks")
      .update({ is_locked: false, locked_at: null, expires_at: null, locked_by: null })
      .eq("lock_type", "evaluation_worker")
      .eq("locked_by", "benchmark-worker")
      .lt("locked_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());
    // Poke the worker to ensure it keeps processing
    supabase.functions.invoke("benchmark-worker", { body: {} }).catch(() => {});
  }, [refetchBatch]);

  const { isBackedOff } = useBenchmarkPolling({
    isActive: !!activeBatch,
    progressPct: batchProgressPct,
    onPoll: pollAndTriggerWorker,
  });

  // Completed batches history
  const { data: completedBatches = [] } = useQuery({
    queryKey: ["bm_completed_batches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_batches")
        .select("*")
        .in("status", ["complete", "completed", "failed", "credit_limit", "credit_exhausted", "timeout"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15_000,
  });

  // Realtime subscription for batch progress
  const invalidateAllResults = useCallback(() => {
    refetchBatch();
    qc.invalidateQueries({ queryKey: ["bm_completed_batches"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_comparisons"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_comp_items"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_judge_reviews"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_failure_patterns"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_cases"] });
  }, [refetchBatch, qc]);

  useEffect(() => {
    const channel = supabase
      .channel("batch-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "benchmark_batches" }, () => {
        invalidateAllResults();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [invalidateAllResults]);

  const unreadCount = adminNotifications.filter((n: any) => !n.read).length;

  // Realtime subscription for live notification updates
  useEffect(() => {
    const channel = supabase
      .channel("admin-notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, () => {
        refetchNotifs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchNotifs]);

  const markAsRead = useCallback(async (id: string) => {
    await (supabase as any).from("admin_notifications").update({ read: true }).eq("id", id);
    refetchNotifs();
  }, [refetchNotifs]);

  const markAllRead = useCallback(async () => {
    const unreadIds = adminNotifications.filter((n: any) => !n.read).map((n: any) => n.id);
    if (unreadIds.length === 0) return;
    await (supabase as any).from("admin_notifications").update({ read: true }).in("id", unreadIds);
    refetchNotifs();
  }, [adminNotifications, refetchNotifs]);

  const [autoDeployEdits, setAutoDeployEdits] = useState<Record<string, any>>({});
  const [savingAutoDeploy, setSavingAutoDeploy] = useState(false);

  const getAutoDeployValue = (agentType: string, field: string, fallback: any) => {
    if (autoDeployEdits[agentType]?.[field] !== undefined) return autoDeployEdits[agentType][field];
    const row = autoDeploySettings.find((s: any) => s.agent_type === agentType);
    return row?.[field] ?? fallback;
  };

  const setAutoDeployField = (agentType: string, field: string, value: any) => {
    setAutoDeployEdits(prev => ({
      ...prev,
      [agentType]: { ...prev[agentType], [field]: value },
    }));
  };

  const saveAutoDeploySettings = useCallback(async () => {
    setSavingAutoDeploy(true);
    try {
      for (const [agentType, edits] of Object.entries(autoDeployEdits)) {
        if (Object.keys(edits as any).length === 0) continue;
        await (supabase as any).from("auto_deploy_settings")
          .update({ ...(edits as any), updated_at: new Date().toISOString(), updated_by: profile?.user_id })
          .eq("agent_type", agentType);
      }
      setAutoDeployEdits({});
      qc.invalidateQueries({ queryKey: ["bm_dash_auto_deploy"] });
      toast({ title: "Auto-deploy settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSavingAutoDeploy(false);
  }, [autoDeployEdits, profile, qc, toast]);

  /* ── filtered cases ── */
  const filtered = useMemo(() => {
    return cases.filter((c: any) => {
      if (sourceFilter !== "all" && c.source_type !== sourceFilter) return false;
      if (agentFilter !== "all" && c.agent_type !== agentFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (c.is_excluded) return false;
      return true;
    });
  }, [cases, sourceFilter, agentFilter, statusFilter]);

  const resetCaseFilters = useCallback(() => {
    setSourceFilter("all");
    setAgentFilter("all");
    setStatusFilter("all");
    refetchCases();
  }, [refetchCases]);

  /* ── filtered case IDs for scoping related data ── */
  const filteredCaseIds = useMemo(() => new Set(filtered.map((c: any) => c.id)), [filtered]);

  /* ── filtered comparisons & related ── */
  const filteredComparisons = useMemo(() =>
    comparisons.filter((c: any) => filteredCaseIds.has(c.benchmark_case_id)),
    [comparisons, filteredCaseIds]);

  /** Scope comparisons to the latest completed batch so old pre-fix scores don't pollute averages */
  const latestBatchCutoff = useMemo(() => {
    if (completedBatches.length === 0) return null;
    // Use the most recent completed batch's created_at as the cutoff
    return completedBatches[0]?.created_at ?? null;
  }, [completedBatches]);

  /** Deduplicated: only the LATEST comparison per benchmark case, scoped to latest batch */
  const latestComparisons = useMemo(() => {
    const scopedComps = latestBatchCutoff
      ? filteredComparisons.filter((c: any) => c.created_at >= latestBatchCutoff)
      : filteredComparisons;
    const latest: Record<string, any> = {};
    for (const c of scopedComps) {
      const key = c.benchmark_case_id;
      const existing = latest[key];
      if (!existing || new Date(c.completed_at || c.created_at) > new Date(existing.completed_at || existing.created_at)) {
        latest[key] = c;
      }
    }
    return Object.values(latest);
  }, [filteredComparisons, latestBatchCutoff]);

  const filteredCompItems = useMemo(() => {
    const compIds = new Set(filteredComparisons.map((c: any) => c.id));
    return compItems.filter((ci: any) => compIds.has(ci.comparison_id));
  }, [compItems, filteredComparisons]);

  const filteredJudgeReviews = useMemo(() => {
    const compIds = new Set(filteredComparisons.map((c: any) => c.id));
    return judgeReviews.filter((jr: any) => compIds.has(jr.comparison_id));
  }, [judgeReviews, filteredComparisons]);

  /* ── filtered agent-scoped data ── */
  const filteredFailurePatterns = useMemo(() => {
    let result = failurePatternsDB;
    if (agentFilter !== "all") result = result.filter((p: any) => p.agent_type === agentFilter);
    if (sourceFilter !== "all" || statusFilter !== "all") {
      result = result.filter((p: any) => {
        const caseIds: string[] = p.example_case_ids || [];
        if (caseIds.length === 0) return true; // keep patterns with no linked cases
        return caseIds.some((id: string) => filteredCaseIds.has(id));
      });
    }
    return [...result].sort((a: any, b: any) => {
      const aTime = new Date(a?.updated_at || a?.detected_at || 0).getTime();
      const bTime = new Date(b?.updated_at || b?.detected_at || 0).getTime();
      if (bTime !== aTime) return bTime - aTime;
      return (b?.occurrence_count || 0) - (a?.occurrence_count || 0);
    });
  }, [failurePatternsDB, agentFilter, sourceFilter, statusFilter, filteredCaseIds]);

  const filteredPromptPatches = useMemo(() => {
    let result = promptPatches;
    if (agentFilter !== "all") result = result.filter((p: any) => p.agent_id === agentFilter);
    if (sourceFilter !== "all" || statusFilter !== "all") {
      result = result.filter((p: any) => {
        if (!p.benchmark_case_id) return true; // keep patches not linked to a specific case
        return filteredCaseIds.has(p.benchmark_case_id);
      });
    }
    return result;
  }, [promptPatches, agentFilter, sourceFilter, statusFilter, filteredCaseIds]);

  const filteredRegressionRuns = useMemo(() => {
    let result = regressionRuns;
    if (agentFilter !== "all") result = result.filter((r: any) => r.agent_type === agentFilter);
    return result;
  }, [regressionRuns, agentFilter]);

  /* ── summary metrics ── */
  const totalCases = filtered.length;
  const realCount = filtered.filter((c: any) => c.source_type === "real").length;
  const syntheticCount = filtered.filter((c: any) => c.source_type === "synthetic").length;
  const syntheticPct = totalCases > 0 ? syntheticCount / totalCases : 0;
  const hasBiasWarning = syntheticPct > 0.5;

  /* ── source-weighted accuracy helpers ── */
  const getSourceScopedComparisons = useCallback((sourceType?: string) => {
    if (!sourceType) return latestComparisons;
    return latestComparisons.filter((c: any) => {
      const bc = filtered.find((b: any) => b.id === c.benchmark_case_id);
      return bc?.source_type === sourceType;
    });
  }, [latestComparisons, filtered]);

  const computeAvg = useCallback((comps: any[], field: string) => {
    const scored = comps.filter((c: any) => c[field] != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((s: number, c: any) => s + Number(c[field]), 0) / scored.length * 100);
  }, []);

  const realComps = useMemo(() => getSourceScopedComparisons("real"), [getSourceScopedComparisons]);
  const syntheticComps = useMemo(() => getSourceScopedComparisons("synthetic"), [getSourceScopedComparisons]);

  const realRecall = useMemo(() => computeAvg(realComps, "recall_score"), [realComps, computeAvg]);
  const realPrecision = useMemo(() => computeAvg(realComps, "precision_score"), [realComps, computeAvg]);
  const syntheticRecall = useMemo(() => computeAvg(syntheticComps, "recall_score"), [syntheticComps, computeAvg]);
  const syntheticPrecision = useMemo(() => computeAvg(syntheticComps, "precision_score"), [syntheticComps, computeAvg]);

  /* Global Weighted Accuracy: Manual 1.0x, Synthetic 0.6x */
  const REAL_WEIGHT = 1.0;
  const SYNTHETIC_WEIGHT = 0.6;

  const weightedScore = useMemo(() => {
    const realScored = realComps.filter((c: any) => c.recall_score != null && c.precision_score != null);
    const synthScored = syntheticComps.filter((c: any) => c.recall_score != null && c.precision_score != null);
    if (realScored.length + synthScored.length === 0) return null;
    const realAvg = realScored.length > 0
      ? realScored.reduce((s: number, c: any) => s + (Number(c.recall_score) + Number(c.precision_score)) / 2, 0) / realScored.length
      : 0;
    const synthAvg = synthScored.length > 0
      ? synthScored.reduce((s: number, c: any) => s + (Number(c.recall_score) + Number(c.precision_score)) / 2, 0) / synthScored.length
      : 0;
    const totalWeight = (realScored.length > 0 ? REAL_WEIGHT : 0) + (synthScored.length > 0 ? SYNTHETIC_WEIGHT : 0);
    const weighted = ((realAvg * REAL_WEIGHT) + (synthAvg * SYNTHETIC_WEIGHT)) / totalWeight;
    return Math.round(weighted * 100);
  }, [realComps, syntheticComps]);

  // Standard avg recall/precision (used when exclude-synthetic is OFF)
  const avgRecall = useMemo(() => computeAvg(latestComparisons, "recall_score"), [latestComparisons, computeAvg]);
  const avgPrecision = useMemo(() => computeAvg(latestComparisons, "precision_score"), [latestComparisons, computeAvg]);

  // Target-scoped scores (respects excludeSyntheticFromTargets toggle)
  const targetRecall = excludeSyntheticFromTargets ? realRecall : avgRecall;
  const targetPrecision = excludeSyntheticFromTargets ? realPrecision : avgPrecision;

  /* ── daily trend ── */
  const dailyTrend = useMemo(() => {
    const byDay: Record<string, { recalls: number[]; precisions: number[] }> = {};
    for (const c of filteredComparisons as any[]) {
      if (c.recall_score == null && c.precision_score == null) continue;
      const d = (c.completed_at || c.created_at || "").slice(0, 10);
      if (!d) continue;
      if (!byDay[d]) byDay[d] = { recalls: [], precisions: [] };
      if (c.recall_score != null) byDay[d].recalls.push(Number(c.recall_score));
      if (c.precision_score != null) byDay[d].precisions.push(Number(c.precision_score));
    }
    let cumRecallSum = 0, cumRecallCount = 0, cumPrecisionSum = 0, cumPrecisionCount = 0;
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { recalls, precisions }]) => {
        cumRecallSum += recalls.reduce((a, b) => a + b, 0);
        cumRecallCount += recalls.length;
        cumPrecisionSum += precisions.reduce((a, b) => a + b, 0);
        cumPrecisionCount += precisions.length;
        return {
          date: format(new Date(date), "dd MMM"),
          recall: recalls.length ? Math.round(recalls.reduce((a, b) => a + b, 0) / recalls.length * 100) : null,
          precision: precisions.length ? Math.round(precisions.reduce((a, b) => a + b, 0) / precisions.length * 100) : null,
          cumRecall: cumRecallCount ? Math.round(cumRecallSum / cumRecallCount * 100) : null,
          cumPrecision: cumPrecisionCount ? Math.round(cumPrecisionSum / cumPrecisionCount * 100) : null,
          count: recalls.length + precisions.length,
        };
      });
  }, [filteredComparisons]);

  /* ── judge summary ── */
  const judgeSummary = useMemo(() => {
    const verdicts: Record<string, number> = {};
    let totalGrounded = 0;
    for (const jr of filteredJudgeReviews) {
      verdicts[jr.judge_verdict] = (verdicts[jr.judge_verdict] || 0) + 1;
      if (jr.evidence_grounded) totalGrounded++;
    }
    return { total: filteredJudgeReviews.length, verdicts, grounded: totalGrounded };
  }, [filteredJudgeReviews]);

  /* ── failure pattern aggregation from comp items ── */
  const inlineFailures = useMemo(() => {
    const map: Record<string, { type: string; count: number; label: string }> = {};
    for (const item of filteredCompItems) {
      if (item.difference_type === "match") continue;
      const key = item.difference_type;
      if (!map[key]) map[key] = { type: key, count: 0, label: DIFF_LABELS[key] || key };
      map[key].count++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filteredCompItems]);

  /* ── issue type distribution for pie chart ── */
  const issueTypeDist = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of filteredCompItems) {
      if (!item.issue_type) continue;
      map[item.issue_type] = (map[item.issue_type] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 22) + "…" : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [filteredCompItems]);

  /* ── score by agent for bar chart ── */
  const scoreByAgent = useMemo(() => {
    const agentMap: Record<string, { recall: number[]; precision: number[] }> = {};
    for (const comp of latestComparisons) {
      const bc = filtered.find((c: any) => c.id === comp.benchmark_case_id);
      if (!bc) continue;
      if (!agentMap[bc.agent_type]) agentMap[bc.agent_type] = { recall: [], precision: [] };
      if (comp.recall_score != null) agentMap[bc.agent_type].recall.push(Number(comp.recall_score));
      if (comp.precision_score != null) agentMap[bc.agent_type].precision.push(Number(comp.precision_score));
    }
    return Object.entries(agentMap).map(([agent, scores]) => ({
      agent: AGENT_TYPES.find(a => a.value === agent)?.label || agent,
      recall: scores.recall.length ? Math.round(scores.recall.reduce((a, b) => a + b, 0) / scores.recall.length * 100) : 0,
      precision: scores.precision.length ? Math.round(scores.precision.reduce((a, b) => a + b, 0) / scores.precision.length * 100) : 0,
    }));
  }, [latestComparisons, filtered]);

  /* ── deployment readiness ── */
  const deploymentReadiness = useMemo(() => {
    const agents = [...new Set(filtered.map((c: any) => c.agent_type))];
    return agents.map(agent => {
      const agentLabel = AGENT_TYPES.find(a => a.value === agent)?.label || agent;
      const deployedPV = promptVersions.find((pv: any) => pv.agent_id === agent && pv.status === "deployed");
      const pendingPV = promptVersions.find((pv: any) => pv.agent_id === agent && (pv.status === "draft" || pv.status === "pending"));
      const agentRuns = filteredRegressionRuns.filter((r: any) => r.agent_type === agent && r.status === "complete");
      const latestRun = agentRuns[0];
      const agentPatterns = filteredFailurePatterns.filter((fp: any) => fp.agent_type === agent && fp.status !== "resolved");
      const agentPatches = filteredPromptPatches.filter((pp: any) => pp.agent_id === agent && (pp.status === "draft" || pp.status === "pending"));

      // Compute per-agent recall & precision from completed comparisons
      // When excludeSyntheticFromTargets is ON, only use real/manual cases
      const agentComps = latestComparisons.filter((c: any) => {
        const bc = filtered.find((b: any) => b.id === c.benchmark_case_id);
        if (bc?.agent_type !== agent || c.status !== "complete") return false;
        if (excludeSyntheticFromTargets && bc?.source_type === "synthetic") return false;
        return true;
      });
      const recallVals = agentComps.map((c: any) => c.recall_score).filter((v: any) => v != null);
      const precisionVals = agentComps.map((c: any) => c.precision_score).filter((v: any) => v != null);
      const agentAvgRecall = recallVals.length ? recallVals.reduce((a: number, b: number) => a + b, 0) / recallVals.length : null;
      const agentAvgPrecision = precisionVals.length ? precisionVals.reduce((a: number, b: number) => a + b, 0) / precisionVals.length : null;

      const hasRegressions = latestRun?.summary?.regressions > 0;
      const hasOpenPatterns = agentPatterns.length > 0;
      const hasPendingPatches = agentPatches.length > 0;
      const hasLowRecall = agentAvgRecall != null && agentAvgRecall < READINESS_RECALL_TARGET;
      const hasLowPrecision = agentAvgPrecision != null && agentAvgPrecision < READINESS_PRECISION_TARGET;

      let readiness: "Ready for Live" | "caution" | "blocked" = "Ready for Live";
      const blockers: string[] = [];
      if (hasRegressions) { readiness = "blocked"; blockers.push(`${latestRun.summary.regressions} regression(s) detected`); }
      if (hasLowRecall) { readiness = "blocked"; blockers.push(`Recall ${Math.round(agentAvgRecall! * 100)}% < ${Math.round(READINESS_RECALL_TARGET * 100)}% target`); }
      if (hasLowPrecision) { readiness = "blocked"; blockers.push(`Precision ${Math.round(agentAvgPrecision! * 100)}% < ${Math.round(READINESS_PRECISION_TARGET * 100)}% target`); }
      if (hasOpenPatterns) { readiness = readiness === "blocked" ? "blocked" : "caution"; blockers.push(`${agentPatterns.length} unresolved failure pattern(s)`); }
      if (hasPendingPatches) { readiness = readiness === "blocked" ? "blocked" : "caution"; blockers.push(`${agentPatches.length} pending prompt patch(es)`); }
      if (!latestRun) { readiness = "caution"; blockers.push("No regression test run yet"); }
      if (agentAvgRecall == null) { readiness = readiness === "blocked" ? "blocked" : "caution"; blockers.push("No recall data available"); }
      if (agentAvgPrecision == null) { readiness = readiness === "blocked" ? "blocked" : "caution"; blockers.push("No precision data available"); }

      return {
        agent, agentLabel,
        deployedVersion: deployedPV ? `v${deployedPV.version}` : "—",
        pendingVersion: pendingPV ? `v${pendingPV.version}` : null,
        latestRun,
        readiness,
        blockers,
        openPatterns: agentPatterns.length,
        pendingPatches: agentPatches.length,
        agentAvgRecall,
        agentAvgPrecision,
      };
    });
  }, [filtered, filteredComparisons, promptVersions, filteredRegressionRuns, filteredFailurePatterns, filteredPromptPatches, excludeSyntheticFromTargets]);

  /* ── combined evaluate & analyse (background batch) ── */

  const evaluatedCaseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of comparisons) ids.add((c as any).benchmark_case_id);
    return ids;
  }, [comparisons]);

  const evalReadyCount = useMemo(() => {
    let cases = filtered.filter((c: any) => c.status === "ready");
    if (skipEvaluated) cases = cases.filter((c: any) => !evaluatedCaseIds.has(c.id));
    return cases.length;
  }, [filtered, skipEvaluated, evaluatedCaseIds]);

  const runEvaluationForCases = useCallback(async (casesToEval: any[]) => {
    if (casesToEval.length === 0) {
      toast({ title: "No cases to evaluate", description: "No benchmark cases match the selection.", variant: "destructive" });
      return;
    }
    if (activeBatch) {
      toast({ title: "Batch already running", description: "Wait for the current batch to finish or check notifications.", variant: "destructive" });
      return;
    }

    setEvalSubmitting(true);
    try {
      const { data: batch, error: batchErr } = await (supabase as any)
        .from("benchmark_batches")
        .insert({
          total_cases: casesToEval.length,
          include_analysis: true,
          agent_filter: agentFilter,
          source_filter: sourceFilter,
          created_by: profile!.user_id,
        })
        .select("id")
        .single();

      if (batchErr) throw batchErr;

      const items = casesToEval.map((c: any) => ({
        batch_id: batch.id,
        benchmark_case_id: c.id,
      }));
      const { error: itemsErr } = await (supabase as any)
        .from("benchmark_job_items")
        .insert(items);

      if (itemsErr) throw itemsErr;

      await supabase
        .from("benchmark_system_locks")
        .update({ is_locked: false, locked_at: null, expires_at: null, locked_by: null })
        .eq("lock_type", "evaluation_worker");

      supabase.functions.invoke("benchmark-worker", { body: {} }).catch((err) => {
        console.warn("Initial worker trigger failed (will retry via polling):", err);
      });

      refetchBatch();
      toast({
        title: "Evaluation queued",
        description: `${casesToEval.length} case${casesToEval.length > 1 ? "s" : ""} submitted for background evaluation. You'll receive a notification when it's complete.`,
      });
    } catch (err: any) {
      toast({ title: "Failed to queue evaluation", description: err.message, variant: "destructive" });
    }
    setEvalSubmitting(false);
  }, [agentFilter, sourceFilter, activeBatch, profile, toast, refetchBatch]);

  const runFullEvaluation = useCallback(async (quickCount?: number) => {
    let readyForEval = filtered.filter((c: any) => c.status === "ready");
    if (skipEvaluated) readyForEval = readyForEval.filter((c: any) => !evaluatedCaseIds.has(c.id));
    if (readyForEval.length === 0) {
      toast({ title: "No cases to evaluate", description: skipEvaluated ? "All matching cases have already been evaluated. Uncheck 'Skip already evaluated' to re-run them." : "No benchmark cases match the current filters.", variant: "destructive" });
      return;
    }

    if (quickCount && readyForEval.length > quickCount) {
      const shuffled = [...readyForEval].sort(() => Math.random() - 0.5);
      readyForEval = shuffled.slice(0, quickCount);
    }

    await runEvaluationForCases(readyForEval);
  }, [filtered, skipEvaluated, evaluatedCaseIds, runEvaluationForCases, toast]);

  const runSingleCaseEvaluation = useCallback(async (caseItem: any) => {
    setShowSingleCasePicker(false);
    setSingleCaseSearch("");
    await runEvaluationForCases([caseItem]);
  }, [runEvaluationForCases]);

  /* ── cancel evaluation ── */
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelEvaluation = useCallback(async () => {
    if (!activeBatch) return;
    setCancelling(true);
    try {
      // Mark pending job items as skipped
      await supabase
        .from("benchmark_job_items")
        .update({ status: "skipped", completed_at: new Date().toISOString(), error_message: "Cancelled by user" })
        .eq("batch_id", activeBatch.id)
        .eq("status", "pending");

      // Mark the batch as aborted
      await supabase
        .from("benchmark_batches")
        .update({ status: "aborted", completed_at: new Date().toISOString() })
        .eq("id", activeBatch.id);

      await refetchBatch();
      qc.invalidateQueries({ queryKey: ["bm_comparisons"] });
      toast({ title: "Evaluation cancelled", description: `Batch aborted. ${activeBatch.completed_cases} case(s) were already processed.` });
    } catch (err: any) {
      toast({ title: "Failed to cancel", description: err.message, variant: "destructive" });
    }
    setCancelling(false);
    setCancelConfirmOpen(false);
  }, [activeBatch, refetchBatch, qc, toast]);

  /* ── run regression test ── */
  const runRegressionTest = useCallback(async (quickCount?: number) => {
    const targetAgent = agentFilter !== "all" ? agentFilter : null;
    if (!targetAgent) {
      toast({ title: "Select an agent", description: "Choose a specific agent from filters to run regression tests.", variant: "destructive" });
      return;
    }
    setRegressionRunning(true);
    try {
      // If quick test, pick N random case IDs from the filtered set
      let selectedCaseIds: string[] | undefined;
      if (quickCount && filtered.length > quickCount) {
        const shuffled = [...filtered].sort(() => Math.random() - 0.5);
        selectedCaseIds = shuffled.slice(0, quickCount).map((c: any) => c.id);
      }

      const resp = await supabase.functions.invoke("run-regression-test", {
        body: {
          agent_type: targetAgent,
          source_types: sourceFilter !== "all" ? [sourceFilter] : undefined,
          ...(selectedCaseIds ? { case_ids: selectedCaseIds } : {}),
        },
      });
      if (resp.error) {
        const msg = await extractEdgeFunctionError(resp, "Regression test failed");
        throw new Error(msg);
      }
      qc.invalidateQueries({ queryKey: ["bm_dash_regression_runs"] });
      qc.invalidateQueries({ queryKey: ["bm_dash_regression_results"] });
      qc.invalidateQueries({ queryKey: ["bm_dash_comparisons"] });
      toast({ title: "Regression test started", description: quickCount ? `Running on ${selectedCaseIds?.length ?? quickCount} cases` : `Running on all cases` });
    } catch (err: any) {
      const { title, description } = friendlyEdgeFunctionError(err.message, "Regression test failed");
      toast({ title, description, variant: "destructive" });
    }
    setRegressionRunning(false);
  }, [agentFilter, sourceFilter, filtered, qc, toast]);

  const runPatternAnalysis = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    setAnalysisRunning(true);
    try {
      const targetAgents = agentFilter === "all" ? AGENT_TYPES.map((a) => a.value) : [agentFilter];
      let totalPatterns = 0;
      const failures: string[] = [];

      for (const targetAgent of targetAgents) {
        const resp = await supabase.functions.invoke("benchmark-analyze-patterns", {
          body: {
            agent_type: targetAgent,
            source_type: sourceFilter,
          },
        });

        if (resp.error) {
          const msg = await extractEdgeFunctionError(resp, `Pattern analysis failed for ${targetAgent}`);
          failures.push(msg);
          continue;
        }

        if (typeof resp.data?.patterns === "number") {
          totalPatterns += resp.data.patterns;
        }
      }

      qc.invalidateQueries({ queryKey: ["bm_dash_failure_patterns"] });

      if (failures.length === targetAgents.length) {
        throw new Error(failures[0] || "Pattern analysis failed");
      }

      if (!silent) {
        if (failures.length > 0) {
          toast({
            title: "Pattern analysis partially refreshed",
            description: `${totalPatterns} pattern(s) rebuilt. ${failures.length} agent scope(s) failed — retry once.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Pattern analysis refreshed",
            description: `${totalPatterns} pattern(s) rebuilt from latest comparisons.`,
          });
        }
      }

      return true;
    } catch (err: any) {
      const { title, description } = friendlyEdgeFunctionError(err.message, "Pattern analysis failed");
      toast({ title, description, variant: "destructive" });
      return false;
    } finally {
      setAnalysisRunning(false);
    }
  }, [agentFilter, sourceFilter, qc, toast]);

  /* ── generate prompt patches from failures ── */
  const generatePatches = useCallback(async () => {
    const targetAgent = agentFilter !== "all" ? agentFilter : null;
    if (!targetAgent) {
      toast({ title: "Select an agent", description: "Choose a specific agent from filters to generate patches.", variant: "destructive" });
      return;
    }
    const patternsForAgent = failurePatternsDB.filter((p: any) => p.agent_type === targetAgent && p.improvement_recommendation);
    if (patternsForAgent.length === 0) {
      toast({ title: "No patterns", description: "No failure patterns with recommendations found. Run pattern analysis first.", variant: "destructive" });
      return;
    }
    setPatchGenRunning(true);
    try {
      const resp = await supabase.functions.invoke("generate-prompt-patches", {
        body: { agent_type: targetAgent },
      });
      if (resp.error) {
        const msg = await extractEdgeFunctionError(resp, "Patch generation failed");
        throw new Error(msg);
      }
      qc.invalidateQueries({ queryKey: ["bm_dash_prompt_patches"] });
      toast({ title: "Patches generated", description: "Prompt patches created. Review them in the Prompt Management page." });
    } catch (err: any) {
      const { title, description } = friendlyEdgeFunctionError(err.message, "Patch generation failed");
      toast({ title, description, variant: "destructive" });
    }
    setPatchGenRunning(false);
  }, [agentFilter, failurePatternsDB, qc, toast]);

  /* ── per-patch regression lookup ── */
  const patchRunLookup = useMemo(() => {
    const map: Record<string, any> = {};
    for (const run of regressionRuns) {
      if (run.prompt_patch_id && run.status === "complete") {
        const existing = map[run.prompt_patch_id];
        if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
          map[run.prompt_patch_id] = run;
        }
      }
    }
    return map;
  }, [regressionRuns]);

  /* ── test a single patch ── */
  const testSinglePatch = useCallback(async (patchId: string, patchAgentId: string) => {
    setTestingPatchId(patchId);
    try {
      const resp = await supabase.functions.invoke("run-regression-test", {
        body: {
          agent_type: patchAgentId,
          prompt_patch_id: patchId,
        },
      });
      if (resp.error) {
        const msg = await extractEdgeFunctionError(resp, "Patch test failed");
        throw new Error(msg);
      }
      qc.invalidateQueries({ queryKey: ["bm_dash_regression_runs"] });
      qc.invalidateQueries({ queryKey: ["bm_dash_regression_results"] });
      toast({ title: "Patch test complete", description: "Results are now visible in the table." });
    } catch (err: any) {
      const { title, description } = friendlyEdgeFunctionError(err.message, "Patch test failed");
      toast({ title, description, variant: "destructive" });
    }
    setTestingPatchId(null);
  }, [qc, toast]);

  /* ── toggle exclude ── */
  const toggleExclude = useCallback(async (id: string, currentlyExcluded: boolean) => {
    await (supabase as any).from("benchmark_cases").update({ is_excluded: !currentlyExcluded }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["bm_dash_cases"] });
  }, [qc]);

  /* ── audit helper ── */
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

  /* ── delete case ── */
  const handleDeleteCase = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await (supabase as any).from("synthetic_generated_cases").delete().eq("benchmark_case_id", deleteTarget.id);
      const { error } = await (supabase as any).from("benchmark_cases").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      await logAudit("benchmark_case_deleted", { case_id: deleteTarget.id, title: deleteTarget.title });
      qc.invalidateQueries({ queryKey: ["bm_dash_cases"] });
      qc.invalidateQueries({ queryKey: ["benchmark_cases"] });
      if (selectedCaseId === deleteTarget.id) setSelectedCaseId(null);
      toast({ title: "Case deleted", description: `"${deleteTarget.title}" and all related data removed.` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, selectedCaseId, qc, toast, logAudit]);

  /* ── batch comparison helpers ── */
  const readyCases = useMemo(() => filtered.filter((c: any) => c.status === "ready"), [filtered]);
  const readyIds = useMemo(() => new Set(readyCases.map((c: any) => c.id as string)), [readyCases]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (readyIds.size > 0 && [...readyIds].every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(readyIds));
    }
  };

  const handleBatchCompare = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    batchCancelledRef.current = false;
    setBatchRunning(true);
    setBatchStartTime(Date.now());
    setBatchProgress({ done: 0, failed: 0, total: ids.length });

    const CONCURRENCY = 3;
    let running = 0;
    let idx = 0;
    let done = 0;
    let failed = 0;
    let stoppedForCredits = false;

    await new Promise<void>((resolve) => {
      const next = () => {
        if (batchCancelledRef.current) { resolve(); return; }
        while (running < CONCURRENCY && idx < ids.length) {
          const caseId = ids[idx++];
          running++;
          (async () => {
            let retries = 1;
            let ok = false;
            while (retries >= 0 && !ok) {
              try {
                const resp = await supabase.functions.invoke("benchmark-compare", { body: { benchmark_case_id: caseId } });
                if (resp.error) {
                  const msg = await extractEdgeFunctionError(resp, "Comparison failed");
                  throw new Error(msg);
                }
                ok = true;
              } catch (err: any) {
                const msg = err?.message || "";
                if (/payment_required|not enough credits|credit limit/i.test(msg)) {
                  stoppedForCredits = true;
                  batchCancelledRef.current = true;
                  failed++;
                  break;
                }
                if (retries > 0) { retries--; } else { failed++; break; }
              }
            }
            if (ok) done++;
            running--;
            setBatchProgress({ done: done + failed, failed, total: ids.length });
            if (done + failed === ids.length) resolve();
            else next();
          })();
        }
      };
      next();
    });

    setBatchRunning(false);
    qc.invalidateQueries({ queryKey: ["bm_dash_cases"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_comparisons"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_comp_items"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_judge_reviews"] });
    qc.invalidateQueries({ queryKey: ["bm_dash_failure_patterns"] });
    qc.invalidateQueries({ queryKey: ["bm_completed_batches"] });
    qc.invalidateQueries({ queryKey: ["benchmark_cases"] });
    setSelectedIds(new Set());

    if (done > 0) {
      await runPatternAnalysis({ silent: true });
    }

    if (stoppedForCredits) {
      toast({
        title: "Batch stopped",
        description: `Lovable AI credits exhausted. ${done} succeeded, ${failed} failed before stopping.`,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Batch comparison complete",
      description: `${done} succeeded, ${failed} failed out of ${ids.length} cases.`,
      variant: failed > 0 ? "destructive" : "default",
    });
  }, [selectedIds, qc, toast, runPatternAnalysis]);

  const handleCancelBatch = useCallback(() => {
    batchCancelledRef.current = true;
    setBatchRunning(false);
    toast({ title: "Batch cancelled" });
  }, [toast]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Benchmark Orchestration Dashboard</h1>
              <p className="text-sm text-muted-foreground">Unified benchmark pipeline — real & synthetic cases</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="relative">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <p className="text-sm font-semibold">Notifications</p>
                  {unreadCount > 0 && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllRead}>
                      <Check className="h-3 w-3 mr-1" /> Mark all read
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-80">
                  {adminNotifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No notifications yet</p>
                  ) : (
                    adminNotifications.map((n: any) => (
                      <button
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                          <div className={!n.read ? "" : "ml-4"}>
                            <p className="text-sm font-medium">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(n.created_at), "dd MMM yyyy HH:mm")}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={() => setShowNewDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Case
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/prompt-management")}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Prompts
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/benchmark-guide")}>
              <BookOpen className="h-3.5 w-3.5 mr-1" /> Guide
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Database className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{totalCases}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">Total Cases <InfoTooltip title="Total Cases"><p>The total number of benchmark cases (both real and synthetic) loaded into the Learning Engine for evaluation.</p></InfoTooltip></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <FlaskConical className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{realCount} <span className="text-sm font-normal text-muted-foreground">/ {syntheticCount}</span></p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">Real / Synthetic <InfoTooltip title="Real vs Synthetic"><p><strong>Real cases</strong> are uploaded from actual conveyancing transactions with human-written ground-truth reports.</p><p><strong>Synthetic cases</strong> are AI-generated scenarios with auto-created gold-standard findings for scalable testing.</p></InfoTooltip></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Beaker className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{filteredComparisons.length}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">Evaluations <InfoTooltip title="Evaluations"><p>Each evaluation compares the AI agent's findings against the human ground-truth. It produces Recall (how much was found) and Precision (how accurate the findings are) scores.</p></InfoTooltip></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold flex items-center justify-center gap-1">{targetRecall != null ? `${targetRecall}%` : "—"}
                <InfoTooltip title="Recall">
                  <p>Recall measures what percentage of human-identified issues the AI also found. <span className="font-mono">True Positives / (True Positives + Missed Issues) × 100</span>.</p>
                  <p className="font-medium mt-1">Target: ≥ 95%. Low recall means the AI is missing important findings.</p>
                  {excludeSyntheticFromTargets && <p className="text-xs mt-1 italic">Currently showing real-world cases only (synthetic excluded).</p>}
                </InfoTooltip>
              </p>
              <p className="text-xs text-muted-foreground">{excludeSyntheticFromTargets ? "Real-World Recall" : "Avg Recall"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold flex items-center justify-center gap-1">{targetPrecision != null ? `${targetPrecision}%` : "—"}
                <InfoTooltip title="Precision">
                  <p>Precision measures what percentage of AI-flagged issues are genuine (confirmed by the human ground-truth). <span className="font-mono">True Positives / (True Positives + False Positives) × 100</span>.</p>
                  <p className="font-medium mt-1">Target: ≥ 85%. Low precision means the AI is over-flagging — generating too many false alerts.</p>
                  {excludeSyntheticFromTargets && <p className="text-xs mt-1 italic">Currently showing real-world cases only (synthetic excluded).</p>}
                </InfoTooltip>
              </p>
              <p className="text-xs text-muted-foreground">{excludeSyntheticFromTargets ? "Real-World Precision" : "Avg Precision"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Gavel className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{judgeSummary.total}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">Judge Reviews <InfoTooltip title="Judge Reviews"><p>An independent AI model (from a different model family) re-evaluates disputed findings to determine whether the AI or human was correct. This ensures model independence and prevents bias.</p></InfoTooltip></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <GitCompare className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{filteredRegressionRuns.filter((r: any) => r.status === "complete").length}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">Regression Runs <InfoTooltip title="Regression Runs"><p>Regression tests compare a new prompt version against the prior version across all benchmark cases, ensuring changes don't degrade performance on cases that previously worked correctly.</p></InfoTooltip></p>
            </CardContent>
          </Card>
        </div>

        {/* Source-Weighted Accuracy + Bias Warning */}
        <Card>
          <CardContent className="py-3 px-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Real-World</p>
                  <p className="text-sm font-bold">{realRecall != null ? `R:${realRecall}%` : "—"} / {realPrecision != null ? `P:${realPrecision}%` : "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Weight: 1.0×</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Synthetic</p>
                  <p className="text-sm font-bold">{syntheticRecall != null ? `R:${syntheticRecall}%` : "—"} / {syntheticPrecision != null ? `P:${syntheticPrecision}%` : "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Weight: 0.6×</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    Global Weighted
                    {hasBiasWarning && (
                      <InfoTooltip title="⚠️ Bias Warning">
                        <p className="text-destructive font-medium">Dataset is {Math.round(syntheticPct * 100)}% synthetic (threshold: 50%).</p>
                        <p className="mt-1">Model-on-model bias risk: synthetic cases are generated and judged by AI. Scores may be inflated. Add more real-world cases for reliable metrics.</p>
                      </InfoTooltip>
                    )}
                  </p>
                  <p className={`text-sm font-bold ${hasBiasWarning ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {weightedScore != null ? `${weightedScore}%` : "—"}
                    {hasBiasWarning && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-500" />}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Manual 1.0× + Synthetic 0.6×</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="real">Real</SelectItem>
                <SelectItem value="synthetic">Synthetic</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {AGENT_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {(sourceFilter !== "all" || agentFilter !== "all" || statusFilter !== "all") && (
              <Button size="sm" variant="ghost" onClick={resetCaseFilters}>
                Reset filters
              </Button>
            )}
            <div className="flex items-center gap-2 mr-2">
              <Checkbox id="skip-evaluated" checked={skipEvaluated} onCheckedChange={(v) => setSkipEvaluated(!!v)} />
              <Label htmlFor="skip-evaluated" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap flex items-center gap-1">Skip already evaluated <InfoTooltip title="Skip Already Evaluated"><p>When enabled, cases that already have a completed evaluation will be excluded from the next batch run, so only unevaluated cases are processed.</p></InfoTooltip></Label>
            </div>
            <div className="flex items-center gap-2 mr-2">
              <Switch id="exclude-synthetic" checked={excludeSyntheticFromTargets} onCheckedChange={setExcludeSyntheticFromTargets} className="scale-75" />
              <Label htmlFor="exclude-synthetic" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap flex items-center gap-1">
                Exclude Synthetic from Targets
                <InfoTooltip title="Exclude Synthetic Cases">
                  <p>When enabled, the <strong>Recall ≥ 95%</strong> and <strong>Precision ≥ 85%</strong> performance targets will only consider <strong>real-world (manual)</strong> cases.</p>
                  <p className="mt-1">Synthetic cases generated by AI may inflate scores due to model-on-model bias. Enable this to ensure deployment readiness is based on human-validated ground truth.</p>
                </InfoTooltip>
              </Label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={regressionRunning}>
                  {regressionRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <GitCompare className="h-3.5 w-3.5 mr-1" />}
                  Regression Test
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => runRegressionTest(20)}>
                  <FlaskConical className="h-3.5 w-3.5 mr-2" />
                  Quick Test (20 cases)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runRegressionTest()}>
                  <GitCompare className="h-3.5 w-3.5 mr-2" />
                  Full Test (all cases)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <InfoTooltip title="Regression Test"><p>Compares the current deployed prompt against the latest proposed version. <strong>Quick Test</strong> runs on 20 random cases for fast validation. <strong>Full Test</strong> runs all cases. Requires an agent filter.</p></InfoTooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={evalSubmitting || !!activeBatch}>
                  {evalSubmitting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Submitting…</>
                    : activeBatch ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Running in background…</>
                    : <><Play className="h-3.5 w-3.5 mr-1" /> Evaluate & Analyse ({evalReadyCount}) <ChevronDown className="h-3 w-3 ml-1" /></>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowSingleCasePicker(true)}>
                  <Database className="h-3.5 w-3.5 mr-2" />
                  Single Case…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runFullEvaluation(20)}>
                  <Zap className="h-3.5 w-3.5 mr-2" />
                  Quick Eval (20 cases)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runFullEvaluation()}>
                  <Play className="h-3.5 w-3.5 mr-2" />
                  Full Eval (all ready cases)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <InfoTooltip title="Evaluate & Analyse"><p>Runs the evaluation pipeline: processes cases through the AI agent, compares findings against ground-truth, and runs pattern analysis. <strong>Quick Eval</strong> runs 20 random cases. <strong>Full Eval</strong> runs all ready cases. Runs in the background.</p></InfoTooltip>
          </CardContent>
          {activeBatch && (
            <div className="px-6 pb-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">Background evaluation in progress</span>
                <Badge variant="secondary" className="ml-auto">
                  {activeBatch.completed_cases + activeBatch.failed_cases} / {activeBatch.total_cases}
                </Badge>
              </div>
              <Progress value={activeBatch.total_cases > 0 ? ((activeBatch.completed_cases + activeBatch.failed_cases) / activeBatch.total_cases) * 100 : 0} className="h-2" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  You can navigate away — you'll receive a notification when it's complete.
                  {isBackedOff && <span className="ml-2 text-amber-600">(Polling slowed — no progress detected)</span>}
                </p>
                <Button variant="destructive" size="sm" onClick={() => setCancelConfirmOpen(true)} disabled={cancelling}>
                  {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <StopCircle className="h-3.5 w-3.5 mr-1" />}
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel evaluation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will abort the current batch. {activeBatch?.completed_cases || 0} case(s) already processed will be kept — only pending cases will be skipped.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep running</AlertDialogCancel>
                <AlertDialogAction onClick={cancelEvaluation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  Yes, cancel evaluation
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Completed batch history */}
          {!activeBatch && completedBatches.length > 0 && (
            <Collapsible>
              <div className="px-6 pb-4">
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Recent evaluations ({completedBatches.length})</span>
                  <ArrowDown className="h-3 w-3 ml-auto" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {completedBatches.map((batch: any) => (
                    <div key={batch.id} className="flex items-center gap-3 rounded-md border px-4 py-2.5 text-sm">
                      <Badge
                        variant={normalizeBatchStatus(batch.status).variant}
                        className="text-[10px] shrink-0"
                      >
                        {normalizeBatchStatus(batch.status).label}
                      </Badge>
                      <span className="text-muted-foreground">
                        {batch.completed_cases}/{batch.total_cases} cases
                        {batch.failed_cases > 0 && <span className="text-destructive ml-1">({batch.failed_cases} failed)</span>}
                      </span>
                      {batch.include_analysis && (batch.status === "complete" || batch.status === "completed") && (
                        <Badge variant="outline" className="text-[10px]">+ Pattern Analysis</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {batch.completed_at
                          ? format(new Date(batch.completed_at), "dd MMM yyyy · HH:mm")
                          : format(new Date(batch.created_at), "dd MMM yyyy · HH:mm")}
                      </span>
                    </div>
                  ))}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </Card>

        <Tabs defaultValue="cases" className="w-full">
          <TooltipProvider delayDuration={200}>
            <TabsList className="grid w-full grid-cols-7">
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="cases" className="text-xs">Cases ({filtered.length})</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>All benchmark cases (real & synthetic). Click a row to open the detail panel.</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="performance" className="text-xs">Performance</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>Aggregated Recall & Precision charts, issue-type breakdown, and real vs synthetic comparison.</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="judge" className="text-xs">Judge ({filteredComparisons.filter((c: any) => c.judge_status !== "pending").length})</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>Cross-family judge verdicts with confidence scores and evidence grounding.</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="failures" className="text-xs">Failures ({filteredFailurePatterns.length + inlineFailures.length})</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>Failure-type summary and AI-detected patterns with severity profiles and recommendations.</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="improvements" className="text-xs">Improvements</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>AI-generated improvement recommendations linked to failure patterns and prompt patches.</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="regression" className="text-xs">Regression ({filteredRegressionRuns.length})</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>Regression tests to ensure prompt changes don't break existing behaviour.</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><TabsTrigger value="deployment" className="text-xs">Deployment</TabsTrigger></TooltipTrigger><TooltipContent side="bottom" className="max-w-52 text-center"><p>Per-agent readiness checklist — deployed version, open failures, pending patches, and go/no-go status.</p></TooltipContent></Tooltip>
            </TabsList>
          </TooltipProvider>

          {/* Cases Tab */}
          <TabsContent value="cases" className="space-y-3">
            {/* Batch action bar */}
            {selectedIds.size > 0 && !batchRunning && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
                <span className="text-sm font-medium">{selectedIds.size} case{selectedIds.size > 1 ? "s" : ""} selected</span>
                {readyIds.size > selectedIds.size && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedIds(new Set(readyIds))}>
                    Select all {readyIds.size} ready
                  </Button>
                )}
                <div className="flex-1" />
                <Button size="sm" onClick={handleBatchCompare}>
                  <PlayCircle className="h-4 w-4 mr-1" /> Run Comparisons
                </Button>
              </div>
            )}

            {/* Batch progress */}
            {batchRunning && (
              <TimedProgressBar
                status={`Comparing ${batchProgress.done}/${batchProgress.total} cases…`}
                overallProgress={(batchProgress.done / batchProgress.total) * 100}
                startTime={batchStartTime}
                onCancel={handleCancelBatch}
              />
            )}

            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={readyIds.size > 0 && [...readyIds].every((id) => selectedIds.has(id))}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all ready cases"
                          />
                        </TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Judge</TableHead>
                        <TableHead className="text-right">Date</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {casesLoading && (
                        <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                      )}
                      {!casesLoading && filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            <div className="space-y-2">
                              <p>No benchmark cases match filters.</p>
                              {(sourceFilter !== "all" || agentFilter !== "all" || statusFilter !== "all") && (
                                <Button size="sm" variant="outline" onClick={resetCaseFilters}>Reset filters</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {filtered.map((c: any) => {
                        const latestComp = comparisons.find((comp: any) => comp.benchmark_case_id === c.id);
                        const js = latestComp?.judge_status;
                        const isReady = c.status === "ready";
                        return (
                          <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCaseId(c.id)}>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(c.id)}
                                onCheckedChange={() => toggleSelect(c.id)}
                                disabled={!isReady}
                                aria-label={`Select ${c.title}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium text-sm max-w-[180px] truncate">{c.title}</TableCell>
                            <TableCell>
                              <Badge variant={c.source_type === "synthetic" ? "secondary" : "outline"} className="text-[10px]">
                                {c.source_type === "synthetic" ? "Syn" : "Real"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{AGENT_TYPES.find(a => a.value === c.agent_type)?.label ?? c.agent_type}</TableCell>
                            <TableCell>
                              <Badge variant={c.status === "ready" ? "default" : c.status === "archived" ? "secondary" : "outline"} className="capitalize text-xs">{c.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {latestComp?.recall_score != null ? (
                                <span>R:{Math.round(latestComp.recall_score * 100)}% P:{Math.round(latestComp.precision_score * 100)}%</span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {js === "complete" ? (
                                <Badge variant="default" className="text-[10px]"><Gavel className="h-3 w-3 mr-0.5" />Done</Badge>
                              ) : js === "no_disputes" ? (
                                <span className="text-muted-foreground">✓</span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(c.created_at), "dd MMM yy, HH:mm")}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => toggleExclude(c.id, c.is_excluded)}
                                  title={c.is_excluded ? "Include case" : "Exclude case"}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteTarget({ id: c.id, title: c.title })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            {/* Daily Performance Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Daily Avg Recall & Precision</CardTitle>
                <CardDescription className="text-xs">Track day-by-day improvements across evaluations</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyTrend.length > 1 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="fill-muted-foreground" unit="%" />
                      <RechartsTooltip formatter={(value: number, name: string) => [`${value}%`, name]} labelFormatter={(label) => `Date: ${label}`} />
                      <ReferenceLine y={95} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeOpacity={0.5} label={{ value: "Recall 95%", fontSize: 9, fill: "hsl(var(--muted-foreground))", position: "insideTopRight" }} />
                      <ReferenceLine y={85} stroke="hsl(var(--accent))" strokeDasharray="6 3" strokeOpacity={0.5} label={{ value: "Precision 85%", fontSize: 9, fill: "hsl(var(--muted-foreground))", position: "insideBottomRight" }} />
                      <Line type="monotone" dataKey="recall" name="Recall (daily)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="precision" name="Precision (daily)" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="cumRecall" name="Recall (cumulative)" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                      <Line type="monotone" dataKey="cumPrecision" name="Precision (cumulative)" stroke="hsl(var(--accent))" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {dailyTrend.length === 1 ? "Only one day of data — trend will appear after more evaluations." : "No scored evaluations yet."}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recall & Precision by Agent</CardTitle>
                  <CardDescription className="text-xs">Average scores across all evaluations</CardDescription>
                </CardHeader>
                <CardContent>
                  {scoreByAgent.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={scoreByAgent}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="agent" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                        <RechartsTooltip />
                        <Bar dataKey="recall" name="Recall %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="precision" name="Precision %" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No evaluation data yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Issue Type Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {issueTypeDist.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={issueTypeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {issueTypeDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No comparison items yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Real vs Synthetic */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Real vs Synthetic Performance</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {["real", "synthetic"].map(src => {
                    const srcComps = filteredComparisons.filter((comp: any) => {
                      const bc = filtered.find((c: any) => c.id === comp.benchmark_case_id);
                      return bc?.source_type === src;
                    });
                    const r = srcComps.filter((c: any) => c.recall_score != null);
                    const p = srcComps.filter((c: any) => c.precision_score != null);
                    const avgR = r.length ? Math.round(r.reduce((s: number, c: any) => s + Number(c.recall_score), 0) / r.length * 100) : null;
                    const avgP = p.length ? Math.round(p.reduce((s: number, c: any) => s + Number(c.precision_score), 0) / p.length * 100) : null;
                    return (
                      <div key={src} className="border rounded-lg p-4 text-center">
                        <Badge variant={src === "synthetic" ? "secondary" : "outline"} className="mb-2">{src === "synthetic" ? "Synthetic" : "Real"}</Badge>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div><p className="text-xl font-bold">{avgR != null ? `${avgR}%` : "—"}</p><p className="text-xs text-muted-foreground">Recall</p></div>
                          <div><p className="text-xl font-bold">{avgP != null ? `${avgP}%` : "—"}</p><p className="text-xs text-muted-foreground">Precision</p></div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{srcComps.length} evaluations</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Judge Tab */}
          <TabsContent value="judge" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(judgeSummary.verdicts).map(([verdict, count]) => {
                const meta = VERDICT_META[verdict] || { label: verdict, variant: "outline" as const };
                return (
                  <Card key={verdict}>
                    <CardContent className="pt-4 pb-3 text-center">
                      <Badge variant={meta.variant} className="mb-2">{meta.label}</Badge>
                      <p className="text-2xl font-bold">{count as number}</p>
                    </CardContent>
                  </Card>
                );
              })}
              {judgeSummary.total > 0 && (
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Evidence Grounded</p>
                    <p className="text-2xl font-bold">{Math.round(judgeSummary.grounded / judgeSummary.total * 100)}%</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gavel className="h-4 w-4" /> Cross-Family Judge Verdicts
                </CardTitle>
                <CardDescription className="text-xs">GPT-5 (judge) evaluates Gemini (agent) outputs — model independence enforced</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Comparison</TableHead>
                        <TableHead>Judge Status</TableHead>
                        <TableHead>AI Correct</TableHead>
                        <TableHead>Human Correct</TableHead>
                        <TableHead>Partial</TableHead>
                        <TableHead>Grounded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredComparisons.filter((c: any) => c.judge_status !== "pending").length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No judge reviews yet.</TableCell></TableRow>
                      )}
                      {filteredComparisons.filter((c: any) => c.judge_status !== "pending").map((comp: any) => {
                        const bc = filtered.find((c: any) => c.id === comp.benchmark_case_id);
                        const js = comp.judge_summary || {};
                        return (
                          <TableRow key={comp.id}>
                            <TableCell className="text-sm">
                              <span className="font-medium">{bc?.title?.slice(0, 40) || "—"}</span>
                              <span className="block text-xs text-muted-foreground">{comp.prompt_version || "—"}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={comp.judge_status === "complete" ? "default" : comp.judge_status === "no_disputes" ? "secondary" : "destructive"} className="text-[10px] capitalize">
                                {comp.judge_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{js.ai_correct ?? "—"}</TableCell>
                            <TableCell className="font-mono text-sm">{js.human_correct ?? "—"}</TableCell>
                            <TableCell className="font-mono text-sm">{js.partially_acceptable ?? "—"}</TableCell>
                            <TableCell className="font-mono text-sm">{js.evidence_grounded ?? "—"}/{js.total_judged ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Failure Patterns Tab */}
          <TabsContent value="failures" className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Failure Type Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inlineFailures.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No failures detected.</TableCell></TableRow>
                    )}
                    {inlineFailures.map(fp => {
                      const totalNonMatch = inlineFailures.reduce((s, p) => s + p.count, 0);
                      return (
                        <TableRow key={fp.type}>
                          <TableCell className="font-medium text-sm">{fp.label}</TableCell>
                          <TableCell className="text-right font-mono">{fp.count}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{totalNonMatch > 0 ? Math.round(fp.count / totalNonMatch * 100) : 0}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4" /> AI-Detected Recurring Patterns
                    </CardTitle>
                    <CardDescription className="text-xs">Patterns are refreshed automatically after each evaluation run</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredFailurePatterns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No patterns detected yet. Run pattern analysis from the toolbar.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredFailurePatterns.map((fp: any) => (
                      <div key={fp.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="text-[10px]">{DIFF_LABELS[fp.failure_type] || fp.failure_type}</Badge>
                            {fp.issue_category && <Badge variant="outline" className="text-[10px]">{fp.issue_category}</Badge>}
                            {fp.document_type && <Badge variant="secondary" className="text-[10px]">{fp.document_type}</Badge>}
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{fp.occurrence_count}× occurrences</span>
                        </div>
                        <p className="text-sm">{fp.description}</p>
                        {fp.improvement_recommendation && (
                          <div className="flex items-start gap-2 bg-muted/50 rounded p-2.5">
                            <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs">{fp.improvement_recommendation}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Last analysed: {format(new Date(fp.updated_at || fp.detected_at), "dd MMM yy, HH:mm")}</span>
                          {fp.prompt_versions_affected?.length > 0 && (
                            <span>Versions: {fp.prompt_versions_affected.join(", ")}</span>
                          )}
                          {fp.source_types?.length > 0 && (
                            <span>Sources: {fp.source_types.join(", ")}</span>
                          )}
                          {fp.linked_prompt_patch_id && (
                            <Badge variant="outline" className="text-[10px]">Linked to patch</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Improvements Tab */}
          <TabsContent value="improvements" className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" /> Prompt Improvement Pipeline
                </CardTitle>
                <CardDescription className="text-xs">
                  Failure patterns → Improvement recommendations → Prompt patches → Regression testing → Deployment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="destructive">Failures ({inlineFailures.reduce((s, p) => s + p.count, 0)})</Badge>
                    <ArrowRight className="h-3.5 w-3.5" />
                    <Badge variant="secondary">Patterns ({filteredFailurePatterns.length})</Badge>
                    <ArrowRight className="h-3.5 w-3.5" />
                    <Badge variant="outline">Recommendations ({filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).length})</Badge>
                    <ArrowRight className="h-3.5 w-3.5" />
                    <Badge variant="default">Patches ({filteredPromptPatches.filter((p: any) => p.status === "draft" || p.status === "pending").length})</Badge>
                    <ArrowRight className="h-3.5 w-3.5" />
                    <Badge variant="outline">Regression ({filteredRegressionRuns.filter((r: any) => r.status === "complete").length})</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPatternIds.size > 0 && (
                      <Button size="sm" variant="destructive" onClick={async () => {
                        const ids = Array.from(selectedPatternIds);
                        await supabase.from("benchmark_failure_patterns").delete().in("id", ids);
                        qc.invalidateQueries({ queryKey: ["bm_dash_failure_patterns"] });
                        setSelectedPatternIds(new Set());
                        toast({ title: "Deleted", description: `${ids.length} failure pattern(s) removed.` });
                      }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected ({selectedPatternIds.size})
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => runPatternAnalysis()} disabled={analysisRunning}>
                      {analysisRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5 mr-1" />}
                      Refresh Analysis
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" onClick={generatePatches} disabled={patchGenRunning || agentFilter === "all"}>
                              {patchGenRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
                              Generate Patches{agentFilter !== "all" ? ` — ${AGENT_TYPES.find(a => a.value === agentFilter)?.label || agentFilter}` : " (select agent)"}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {agentFilter === "all" && (
                          <TooltipContent><p className="text-xs">Select a specific agent filter first</p></TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No improvement recommendations yet. Run pattern analysis to generate them.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <Checkbox
                        checked={filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).length > 0 && filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).every((p: any) => selectedPatternIds.has(p.id))}
                        onCheckedChange={(checked) => {
                          const visibleIds = filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).map((p: any) => p.id);
                          if (checked) {
                            setSelectedPatternIds(new Set([...selectedPatternIds, ...visibleIds]));
                          } else {
                            const next = new Set(selectedPatternIds);
                            visibleIds.forEach((id: string) => next.delete(id));
                            setSelectedPatternIds(next);
                          }
                        }}
                      />
                      <Label className="text-xs text-muted-foreground cursor-pointer">Select All ({filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).length})</Label>
                    </div>
                    {filteredFailurePatterns.filter((p: any) => p.improvement_recommendation).map((fp: any) => (
                      <div key={fp.id} className="border rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            className="mt-1"
                            checked={selectedPatternIds.has(fp.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedPatternIds);
                              if (checked) next.add(fp.id); else next.delete(fp.id);
                              setSelectedPatternIds(next);
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive" className="text-[10px]">{DIFF_LABELS[fp.failure_type] || fp.failure_type}</Badge>
                                <span className="text-xs font-mono">{fp.occurrence_count}× across {fp.example_case_ids?.length || 0} cases</span>
                              </div>
                              <Badge variant={fp.status === "resolved" ? "default" : fp.status === "acknowledged" ? "secondary" : "outline"} className="text-[10px] capitalize">
                                {fp.status}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium mb-2">{fp.description}</p>
                            <div className="bg-muted/50 rounded p-3 mb-2">
                              <p className="text-xs font-medium mb-1 flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Recommendation</p>
                              <p className="text-xs">{fp.improvement_recommendation}</p>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center gap-3">
                                <span>Agent: {AGENT_TYPES.find(a => a.value === fp.agent_type)?.label || fp.agent_type}</span>
                                <span>Last analysed: {format(new Date(fp.updated_at || fp.detected_at), "dd MMM yy, HH:mm")}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={async (e) => {
                                  e.stopPropagation();
                                  await supabase.from("benchmark_failure_patterns").delete().eq("id", fp.id);
                                  qc.invalidateQueries({ queryKey: ["bm_dash_failure_patterns"] });
                                  const next = new Set(selectedPatternIds); next.delete(fp.id); setSelectedPatternIds(next);
                                  toast({ title: "Deleted", description: "Failure pattern removed." });
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => navigate("/admin/prompt-management")}>
                                  {fp.linked_prompt_patch_id ? "View Linked Patch" : "Create Patch"} <ArrowRight className="h-3 w-3 ml-1" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {filteredPromptPatches.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium">Recent Prompt Patches</h3>
                      {selectedPatchIds.size > 0 && (
                        <Button size="sm" variant="destructive" onClick={async () => {
                          const ids = Array.from(selectedPatchIds);
                          await supabase.from("prompt_patches").delete().in("id", ids);
                          qc.invalidateQueries({ queryKey: ["bm_dash_prompt_patches"] });
                          setSelectedPatchIds(new Set());
                          toast({ title: "Deleted", description: `${ids.length} prompt patch(es) removed.` });
                        }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected ({selectedPatchIds.size})
                        </Button>
                      )}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">
                            <Checkbox
                              checked={filteredPromptPatches.slice(0, 10).length > 0 && filteredPromptPatches.slice(0, 10).every((p: any) => selectedPatchIds.has(p.id))}
                              onCheckedChange={(checked) => {
                                const visibleIds = filteredPromptPatches.slice(0, 10).map((p: any) => p.id);
                                if (checked) {
                                  setSelectedPatchIds(new Set([...selectedPatchIds, ...visibleIds]));
                                } else {
                                  const next = new Set(selectedPatchIds);
                                  visibleIds.forEach((id: string) => next.delete(id));
                                  setSelectedPatchIds(next);
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Agent</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Recall Δ</TableHead>
                          <TableHead className="text-center">Precision Δ</TableHead>
                          <TableHead className="text-right">Date</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPromptPatches.slice(0, 10).map((pp: any) => {
                          const patchRun = patchRunLookup[pp.id];
                          const pRecallDelta = patchRun && patchRun.proposed_avg_recall != null && patchRun.prior_avg_recall != null
                            ? Math.round((patchRun.proposed_avg_recall - patchRun.prior_avg_recall) * 100) : null;
                          const pPrecisionDelta = patchRun && patchRun.proposed_avg_precision != null && patchRun.prior_avg_precision != null
                            ? Math.round((patchRun.proposed_avg_precision - patchRun.prior_avg_precision) * 100) : null;
                          const pSummary = patchRun?.summary || {};
                          return (
                          <TableRow key={pp.id} className="cursor-pointer" onClick={() => navigate("/admin/prompt-management")}>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedPatchIds.has(pp.id)}
                                onCheckedChange={(checked) => {
                                  const next = new Set(selectedPatchIds);
                                  if (checked) next.add(pp.id); else next.delete(pp.id);
                                  setSelectedPatchIds(next);
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-sm font-medium">{pp.title}</TableCell>
                            <TableCell className="text-xs">{AGENT_TYPES.find(a => a.value === pp.agent_id)?.label || pp.agent_id}</TableCell>
                            <TableCell>
                              <Badge variant={pp.status === "approved" ? "default" : pp.status === "rejected" ? "destructive" : "outline"} className="text-[10px] capitalize">
                                {pp.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {pRecallDelta != null ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${pRecallDelta > 0 ? "text-primary" : pRecallDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                      {pRecallDelta > 0 ? <ArrowUp className="h-3 w-3" /> : pRecallDelta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                      {Math.abs(pRecallDelta)}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <p>{pSummary.total_cases || 0} cases: {pSummary.improvements || 0} improved, {pSummary.regressions || 0} regressed</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {pPrecisionDelta != null ? (
                                <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${pPrecisionDelta > 0 ? "text-primary" : pPrecisionDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                  {pPrecisionDelta > 0 ? <ArrowUp className="h-3 w-3" /> : pPrecisionDelta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                  {Math.abs(pPrecisionDelta)}%
                                </span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(pp.created_at), "dd MMM yy")}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                                      disabled={testingPatchId === pp.id}
                                      onClick={() => testSinglePatch(pp.id, pp.agent_id)}>
                                      {testingPatchId === pp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Beaker className="h-3 w-3" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">Test this patch against all benchmark cases</TooltipContent>
                                </Tooltip>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={async () => {
                                  await supabase.from("prompt_patches").delete().eq("id", pp.id);
                                  qc.invalidateQueries({ queryKey: ["bm_dash_prompt_patches"] });
                                  const next = new Set(selectedPatchIds); next.delete(pp.id); setSelectedPatchIds(next);
                                  toast({ title: "Deleted", description: "Prompt patch removed." });
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Regression Tab */}
          <TabsContent value="regression" className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitCompare className="h-4 w-4" /> Regression Test Runs
                </CardTitle>
                <CardDescription className="text-xs">
                  Compare prior vs proposed prompt versions across benchmark sets. Select a specific agent, then click "Regression Test".
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Patch</TableHead>
                        <TableHead>Prior → Proposed</TableHead>
                        <TableHead>Cases</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Recall Δ</TableHead>
                        <TableHead className="text-center">Precision Δ</TableHead>
                        <TableHead className="text-center">Regressions</TableHead>
                        <TableHead className="text-center">Improvements</TableHead>
                        <TableHead className="text-right">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRegressionRuns.length === 0 && (
                        <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No regression tests yet. Select an agent and click "Regression Test".</TableCell></TableRow>
                      )}
                      {filteredRegressionRuns.map((run: any) => {
                        const recallDelta = run.proposed_avg_recall != null && run.prior_avg_recall != null
                          ? Math.round((run.proposed_avg_recall - run.prior_avg_recall) * 100)
                          : null;
                        const precisionDelta = run.proposed_avg_precision != null && run.prior_avg_precision != null
                          ? Math.round((run.proposed_avg_precision - run.prior_avg_precision) * 100)
                          : null;
                        const summary = run.summary || {};
                        const runResults = regressionResults.filter((r: any) => r.run_id === run.id);
                        const isExpanded = expandedRegressionRun === run.id;
                        return (
                          <React.Fragment key={run.id}>
                            <TableRow
                              className={`cursor-pointer hover:bg-muted/50 ${isExpanded ? "bg-muted/30" : ""}`}
                              onClick={() => setExpandedRegressionRun(isExpanded ? null : run.id)}
                            >
                              <TableCell className="text-xs font-medium">{AGENT_TYPES.find(a => a.value === run.agent_type)?.label || run.agent_type}</TableCell>
                              <TableCell className="text-xs">
                                {run.prompt_patch_id ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="text-[10px] max-w-[100px] truncate cursor-help">
                                        {promptPatches.find((p: any) => p.id === run.prompt_patch_id)?.title?.slice(0, 20) || "Patch"}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs max-w-[250px]">
                                      {promptPatches.find((p: any) => p.id === run.prompt_patch_id)?.title || run.prompt_patch_id}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : <span className="text-muted-foreground">Full suite</span>}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {run.prior_prompt_version || "—"} → {run.proposed_prompt_version || "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {run.status === "running" ? (
                                  <div className="flex items-center gap-2">
                                    <Progress value={(run.completed_cases / run.total_cases) * 100} className="h-2 w-16" />
                                    <span>{run.completed_cases}/{run.total_cases}</span>
                                  </div>
                                ) : (
                                  <span>{run.total_cases}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={run.status === "complete" ? "default" : run.status === "running" ? "secondary" : "outline"} className="text-[10px] capitalize">
                                  {run.status === "running" && <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />}
                                  {run.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {recallDelta != null ? (
                                  <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${recallDelta > 0 ? "text-primary" : recallDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                    {recallDelta > 0 ? <ArrowUp className="h-3 w-3" /> : recallDelta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                    {Math.abs(recallDelta)}%
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {precisionDelta != null ? (
                                  <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${precisionDelta > 0 ? "text-primary" : precisionDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                    {precisionDelta > 0 ? <ArrowUp className="h-3 w-3" /> : precisionDelta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                    {Math.abs(precisionDelta)}%
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {summary.regressions > 0 ? (
                                  <Badge variant="destructive" className="text-[10px]">{summary.regressions}</Badge>
                                ) : summary.regressions === 0 ? (
                                  <span className="text-xs text-muted-foreground">0</span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {summary.improvements > 0 ? (
                                  <Badge variant="default" className="text-[10px]">{summary.improvements}</Badge>
                                ) : summary.improvements === 0 ? (
                                  <span className="text-xs text-muted-foreground">0</span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(run.created_at), "dd MMM yy, HH:mm")}</TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow>
                                <TableCell colSpan={10} className="p-0 bg-muted/20">
                                  <div className="p-4 space-y-3">
                                    <div className="flex items-center gap-4 mb-2">
                                      <h4 className="text-sm font-semibold">Per-Case Breakdown</h4>
                                      <div className="flex gap-2 text-[10px]">
                                        {[
                                          { label: "Regressions", filter: "regression", color: "bg-destructive text-destructive-foreground" },
                                          { label: "Improvements", filter: "improvement", color: "bg-primary text-primary-foreground" },
                                          { label: "No Change", filter: "none", color: "bg-muted text-muted-foreground" },
                                        ].map(f => (
                                          <Badge
                                            key={f.filter}
                                            variant="outline"
                                            className={`cursor-pointer text-[10px] ${regressionCaseFilter === f.filter ? f.color : ""}`}
                                            onClick={(e) => { e.stopPropagation(); setRegressionCaseFilter(regressionCaseFilter === f.filter ? "all" : f.filter); }}
                                          >
                                            {f.label} ({f.filter === "regression" ? runResults.filter((r: any) => r.regression_detected).length : f.filter === "improvement" ? runResults.filter((r: any) => r.improvement_detected).length : runResults.filter((r: any) => !r.regression_detected && !r.improvement_detected).length})
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    <ScrollArea className="h-[350px]">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Case</TableHead>
                                            <TableHead className="text-xs text-center">Status</TableHead>
                                            <TableHead className="text-xs text-center">Prior Recall</TableHead>
                                            <TableHead className="text-xs text-center">Proposed Recall</TableHead>
                                            <TableHead className="text-xs text-center">Recall Δ</TableHead>
                                            <TableHead className="text-xs text-center">Prior Precision</TableHead>
                                            <TableHead className="text-xs text-center">Proposed Precision</TableHead>
                                            <TableHead className="text-xs text-center">Precision Δ</TableHead>
                                            <TableHead className="text-xs">Notes</TableHead>
                                            <TableHead className="text-xs">Reason</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {runResults
                                            .filter((r: any) => {
                                              if (regressionCaseFilter === "regression") return r.regression_detected;
                                              if (regressionCaseFilter === "improvement") return r.improvement_detected;
                                              if (regressionCaseFilter === "none") return !r.regression_detected && !r.improvement_detected;
                                              return true;
                                            })
                                            .sort((a: any, b: any) => {
                                              // Regressions first, then by recall delta ascending
                                              if (a.regression_detected && !b.regression_detected) return -1;
                                              if (!a.regression_detected && b.regression_detected) return 1;
                                              return (a.recall_delta ?? 0) - (b.recall_delta ?? 0);
                                            })
                                            .map((result: any) => {
                                              const benchCase = cases.find((c: any) => c.id === result.benchmark_case_id);
                                              const rDelta = result.recall_delta != null ? Math.round(result.recall_delta * 100) : null;
                                              const pDelta = result.precision_delta != null ? Math.round(result.precision_delta * 100) : null;
                                              return (
                                                <TableRow key={result.id} className={result.regression_detected ? "bg-destructive/5" : result.improvement_detected ? "bg-primary/5" : ""}>
                                                  <TableCell className="text-xs max-w-[200px]">
                                                    <button
                                                      className="text-left hover:underline text-xs font-medium"
                                                      onClick={(e) => { e.stopPropagation(); setSelectedCaseId(benchCase?.id || null); }}
                                                    >
                                                      {benchCase?.title || result.benchmark_case_id.slice(0, 8)}
                                                    </button>
                                                    {benchCase?.property_address && (
                                                      <p className="text-[10px] text-muted-foreground truncate">{benchCase.property_address}</p>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-center">
                                                    {result.regression_detected ? (
                                                      <Badge variant="destructive" className="text-[10px]">Regressed</Badge>
                                                    ) : result.improvement_detected ? (
                                                      <Badge variant="default" className="text-[10px]">Improved</Badge>
                                                    ) : (
                                                      <Badge variant="outline" className="text-[10px]">No Change</Badge>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-center text-xs font-mono">{result.prior_recall != null ? `${Math.round(result.prior_recall * 100)}%` : "—"}</TableCell>
                                                  <TableCell className="text-center text-xs font-mono">{result.proposed_recall != null ? `${Math.round(result.proposed_recall * 100)}%` : "—"}</TableCell>
                                                  <TableCell className="text-center">
                                                    {rDelta != null ? (
                                                      <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${rDelta > 0 ? "text-primary" : rDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                                        {rDelta > 0 ? "+" : ""}{rDelta}%
                                                      </span>
                                                    ) : "—"}
                                                  </TableCell>
                                                  <TableCell className="text-center text-xs font-mono">{result.prior_precision != null ? `${Math.round(result.prior_precision * 100)}%` : "—"}</TableCell>
                                                  <TableCell className="text-center text-xs font-mono">{result.proposed_precision != null ? `${Math.round(result.proposed_precision * 100)}%` : "—"}</TableCell>
                                                  <TableCell className="text-center">
                                                    {pDelta != null ? (
                                                      <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${pDelta > 0 ? "text-primary" : pDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                                        {pDelta > 0 ? "+" : ""}{pDelta}%
                                                      </span>
                                                    ) : "—"}
                                                  </TableCell>
                                                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{result.notes || "—"}</TableCell>
                                                  <TableCell className="text-xs max-w-[180px]">
                                                    {result.regression_detected && result.proposed_comparison_id && regressionReasonMap[result.proposed_comparison_id]
                                                      ? <span className="text-destructive">{regressionReasonMap[result.proposed_comparison_id]}</span>
                                                      : <span className="text-muted-foreground">—</span>}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          {runResults.length === 0 && (
                                            <TableRow><TableCell colSpan={10} className="text-center py-4 text-xs text-muted-foreground">No per-case results found for this run.</TableCell></TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </ScrollArea>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Version comparison chart */}
            {filteredRegressionRuns.filter((r: any) => r.status === "complete").length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Version Performance Comparison</CardTitle>
                  <CardDescription className="text-xs">Prior vs Proposed average scores per regression run</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={filteredRegressionRuns.filter((r: any) => r.status === "complete").slice(0, 10).map((r: any) => ({
                      label: `${(AGENT_TYPES.find(a => a.value === r.agent_type)?.label || r.agent_type).slice(0, 12)} ${r.prior_prompt_version || ""}`,
                      priorRecall: r.prior_avg_recall != null ? Math.round(r.prior_avg_recall * 100) : 0,
                      proposedRecall: r.proposed_avg_recall != null ? Math.round(r.proposed_avg_recall * 100) : 0,
                      priorPrecision: r.prior_avg_precision != null ? Math.round(r.prior_avg_precision * 100) : 0,
                      proposedPrecision: r.proposed_avg_precision != null ? Math.round(r.proposed_avg_precision * 100) : 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} className="fill-muted-foreground" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <RechartsTooltip />
                      <Bar dataKey="priorRecall" name="Prior Recall" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="proposedRecall" name="Proposed Recall" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="priorPrecision" name="Prior Precision" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} opacity={0.5} />
                      <Bar dataKey="proposedPrecision" name="Proposed Precision" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Deployment Tab */}
          <TabsContent value="deployment" className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" /> Deployment Readiness Report
                </CardTitle>
                <CardDescription className="text-xs">
                  Per-agent readiness assessment based on regression results, open failure patterns, and pending patches.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {deploymentReadiness.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No agents with benchmark cases found.</p>
                ) : (
                  <div className="space-y-4">
                    {deploymentReadiness.map(dr => (
                      <div key={dr.agent} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-3 w-3 rounded-full ${dr.readiness === "Ready for Live" ? "bg-primary" : dr.readiness === "caution" ? "bg-accent" : "bg-destructive"}`} />
                            <div>
                              <p className="text-sm font-medium">{dr.agentLabel}</p>
                              <p className="text-xs text-muted-foreground">Deployed: {dr.deployedVersion}{dr.pendingVersion ? ` → Pending: ${dr.pendingVersion}` : ""}</p>
                            </div>
                          </div>
                          <Badge
                            variant={dr.readiness === "Ready for Live" ? "default" : dr.readiness === "caution" ? "secondary" : "destructive"}
                            className="text-xs capitalize"
                          >
                            {dr.readiness === "Ready for Live" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {dr.readiness === "blocked" && <XOctagon className="h-3 w-3 mr-1" />}
                            {dr.readiness === "caution" && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {dr.readiness}
                          </Badge>
                        </div>

                        {/* Metrics row */}
                        <div className="grid grid-cols-5 gap-3 mb-3">
                          {dr.latestRun && (
                            <>
                              <div className="bg-muted/50 rounded p-2 text-center">
                                <p className="text-lg font-bold">{dr.latestRun.total_cases}</p>
                                <p className="text-[10px] text-muted-foreground">Cases Tested</p>
                              </div>
                              <div className="bg-muted/50 rounded p-2 text-center">
                                <p className="text-lg font-bold">{dr.latestRun.summary?.regressions ?? "—"}</p>
                                <p className="text-[10px] text-muted-foreground">Regressions</p>
                              </div>
                              <div className="bg-muted/50 rounded p-2 text-center">
                                <p className="text-lg font-bold">{dr.latestRun.summary?.improvements ?? "—"}</p>
                                <p className="text-[10px] text-muted-foreground">Improvements</p>
                              </div>
                            </>
                          )}
                          <div className="bg-muted/50 rounded p-2 text-center">
                            <p className={`text-lg font-bold ${dr.agentAvgRecall != null ? (dr.agentAvgRecall >= READINESS_RECALL_TARGET ? "text-green-600" : "text-destructive") : ""}`}>
                              {dr.agentAvgRecall != null ? `${Math.round(dr.agentAvgRecall * 100)}%` : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Avg Recall (≥{Math.round(READINESS_RECALL_TARGET * 100)}%)</p>
                          </div>
                          <div className="bg-muted/50 rounded p-2 text-center">
                            <p className={`text-lg font-bold ${dr.agentAvgPrecision != null ? (dr.agentAvgPrecision >= READINESS_PRECISION_TARGET ? "text-green-600" : "text-destructive") : ""}`}>
                              {dr.agentAvgPrecision != null ? `${Math.round(dr.agentAvgPrecision * 100)}%` : "—"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Avg Precision (≥{Math.round(READINESS_PRECISION_TARGET * 100)}%)</p>
                          </div>
                        </div>

                        {/* Blockers */}
                        {dr.blockers.length > 0 && (
                          <div className="space-y-1">
                            {dr.blockers.map((b, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                {dr.readiness === "blocked" ? (
                                  <XOctagon className="h-3 w-3 text-destructive shrink-0" />
                                ) : (
                                  <AlertTriangle className="h-3 w-3 text-accent shrink-0" />
                                )}
                                <span className="text-muted-foreground">{b}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {dr.readiness === "Ready for Live" && dr.blockers.length === 0 && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-primary flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> All checks passed. Ready for deployment review.
                            </p>
                            <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => navigate("/admin/prompt-management")}>
                              <Rocket className="h-3 w-3 mr-1" /> Deploy via Prompt Management
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Auto-Deploy Settings */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" /> Auto-Deploy Settings
                  <InfoTooltip title="Auto-Deploy Settings"><p>When enabled, the system will automatically deploy a new prompt version after a regression test passes all configured thresholds (minimum recall improvement, precision improvement, and zero regressions). This removes the need for manual deployment approval.</p></InfoTooltip>
                </CardTitle>
                <CardDescription className="text-xs">
                  When enabled, prompt versions are automatically deployed after a regression test passes all thresholds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {AGENT_TYPES.map(agent => (
                    <div key={agent.value} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{agent.label}</p>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`ad-${agent.value}`} className="text-xs text-muted-foreground">
                            {getAutoDeployValue(agent.value, "enabled", false) ? "Enabled" : "Disabled"}
                          </Label>
                          <Switch
                            id={`ad-${agent.value}`}
                            checked={getAutoDeployValue(agent.value, "enabled", false)}
                            onCheckedChange={(v) => setAutoDeployField(agent.value, "enabled", v)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Min Recall Improvement</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="h-8 text-xs"
                            value={getAutoDeployValue(agent.value, "min_recall_improvement", 0.05)}
                            onChange={(e) => setAutoDeployField(agent.value, "min_recall_improvement", parseFloat(e.target.value) || 0)}
                          />
                          <p className="text-[10px] text-muted-foreground">{Math.round(getAutoDeployValue(agent.value, "min_recall_improvement", 0.05) * 100)}% improvement required</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Min Precision Improvement</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="h-8 text-xs"
                            value={getAutoDeployValue(agent.value, "min_precision_improvement", 0.05)}
                            onChange={(e) => setAutoDeployField(agent.value, "min_precision_improvement", parseFloat(e.target.value) || 0)}
                          />
                          <p className="text-[10px] text-muted-foreground">{Math.round(getAutoDeployValue(agent.value, "min_precision_improvement", 0.05) * 100)}% improvement required</p>
                        </div>
                        <div className="space-y-1 flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`zr-${agent.value}`}
                              checked={getAutoDeployValue(agent.value, "require_zero_regressions", true)}
                              onCheckedChange={(v) => setAutoDeployField(agent.value, "require_zero_regressions", !!v)}
                            />
                            <Label htmlFor={`zr-${agent.value}`} className="text-xs">Require zero regressions</Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {Object.keys(autoDeployEdits).length > 0 && (
                    <div className="flex justify-end">
                      <Button size="sm" onClick={saveAutoDeploySettings} disabled={savingAutoDeploy}>
                        {savingAutoDeploy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                        Save Auto-Deploy Settings
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Prompt version history */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Prompt Version History</CardTitle>
                <CardDescription className="text-xs">Track which versions were tested and deployed</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Benchmark Runs</TableHead>
                        <TableHead className="text-right">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promptVersions.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No prompt versions found.</TableCell></TableRow>
                      )}
                      {promptVersions.map((pv: any) => {
                        const benchRunsForVersion = filteredComparisons.filter((c: any) => c.prompt_version === `v${pv.version}`).length;
                        return (
                          <TableRow key={pv.id}>
                            <TableCell className="text-xs">{AGENT_TYPES.find(a => a.value === pv.agent_id)?.label || pv.agent_id}</TableCell>
                            <TableCell className="font-mono text-sm font-medium">v{pv.version}</TableCell>
                            <TableCell>
                              <Badge variant={pv.status === "deployed" ? "default" : pv.status === "archived" ? "secondary" : "outline"} className="text-[10px] capitalize">
                                {pv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{benchRunsForVersion} runs</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(pv.created_at), "dd MMM yy")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Case detail slide-out ── */}
        <Sheet open={!!selectedCaseId} onOpenChange={(open) => { if (!open) setSelectedCaseId(null); }}>
          <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
            {selectedCaseId && (
              <BenchmarkCaseDetail
                caseId={selectedCaseId}
                onClose={() => setSelectedCaseId(null)}
                insideDashboard
              />
            )}
          </SheetContent>
        </Sheet>

        <NewBenchmarkCaseDialog open={showNewDialog} onOpenChange={setShowNewDialog} onSubmit={(f) => createCase.mutate(f)} isPending={createCase.isPending} />

        {/* ── Delete confirmation ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete benchmark case?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>"{deleteTarget?.title}"</strong> and all related documents, outputs, comparisons, and judge reviews. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCase} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Deleting…" : "Delete Case"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Single Case Evaluation Picker ── */}
        <AlertDialog open={showSingleCasePicker} onOpenChange={(open) => { if (!open) { setShowSingleCasePicker(false); setSingleCaseSearch(""); } }}>
          <AlertDialogContent className="sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" /> Evaluate Single Case
              </AlertDialogTitle>
              <AlertDialogDescription>
                Choose a case from the list below to run evaluation on.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 my-2">
              <Input
                placeholder="Search by title or address…"
                value={singleCaseSearch}
                onChange={(e) => setSingleCaseSearch(e.target.value)}
                className="h-9 text-sm"
              />
              <ScrollArea className="max-h-72 border rounded-md">
                {(() => {
                  const readyCases = filtered.filter((c: any) => c.status === "ready");
                  const searchLower = singleCaseSearch.toLowerCase();
                  const matchedCases = readyCases.filter((c: any) =>
                    (c.title || "").toLowerCase().includes(searchLower) ||
                    (c.property_address || "").toLowerCase().includes(searchLower)
                  );
                  if (matchedCases.length === 0) {
                    return <p className="text-sm text-muted-foreground text-center py-6">No ready cases match your search.</p>;
                  }
                  return matchedCases.map((c: any) => {
                    const hasEval = evaluatedCaseIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => runSingleCaseEvaluation(c)}
                        className="w-full text-left p-3 border-b border-border last:border-b-0 hover:bg-accent/5 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.property_address}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px]">{c.agent_type}</Badge>
                            <Badge variant="outline" className="text-[10px]">{c.source_type}</Badge>
                            {hasEval && <Badge variant="default" className="text-[10px]">Evaluated</Badge>}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  });
                })()}
              </ScrollArea>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

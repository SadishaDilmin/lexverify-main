import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError, friendlyEdgeFunctionError } from "@/lib/edgeFunctionErrors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dna, Play, History, BookOpen, Loader2, ExternalLink, AlertTriangle,
  BarChart3, CheckCircle2, XCircle, AlertCircle, Minus, Trash2, ArrowUpDown,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import InfoTooltip from "@/components/InfoTooltip";

// ── Types ──
interface Scenario {
  id: string;
  category: string;
  scenario_type: string;
  description: string;
  associated_doc_types: string[];
  expected_risks: any[];
  difficulty: string;
  is_active: boolean;
}

interface GenerationJob {
  id: string;
  title: string;
  config: any;
  status: string;
  total_cases: number;
  completed_cases: number;
  failed_cases: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_log: string | null;
}

interface GeneratedCase {
  id: string;
  job_id: string;
  benchmark_case_id: string;
  scenarios_used: string[];
  gold_standard: any[];
  generation_metadata: any;
  created_at: string;
}

interface BenchmarkComparison {
  id: string;
  benchmark_case_id: string;
  status: string;
  recall_score: number | null;
  precision_score: number | null;
  extraction_accuracy: number | null;
  reasoning_quality: number | null;
  evidence_grounding: number | null;
  judge_status: string;
  judge_summary: any;
  summary_stats: any;
  created_at: string;
}

const CATEGORIES = [
  { value: "title_issues", label: "Title Issues", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "leasehold_risks", label: "Leasehold Risks", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "building_safety", label: "Building Safety", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { value: "seller_fraud", label: "Seller Fraud", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { value: "source_of_wealth", label: "Source of Wealth", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  { value: "search_risks", label: "Search Report Issues", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  { value: "planning_issues", label: "Planning & Building Control", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { value: "environmental_hazards", label: "Environmental Hazards", color: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200" },
  { value: "exchange_compliance", label: "Exchange Compliance", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  { value: "missing_documents", label: "Missing Documentation", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
];

const AGENT_RELEVANT_CATEGORIES: Record<string, string[]> = {
  "source-of-wealth": ["source_of_wealth", "seller_fraud"],
};

const categoryColor = (cat: string) => CATEGORIES.find((c) => c.value === cat)?.color ?? "bg-muted text-muted-foreground";
const categoryLabel = (cat: string) => CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

const difficultyColor = (d: string) => {
  if (d === "basic") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (d === "advanced") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
};

const statusColor = (s: string) => {
  if (s === "completed") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (s === "generating") return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  if (s === "failed") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-muted text-muted-foreground";
};

function ScoreCell({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="text-center">
      <span className={`font-mono font-bold ${color}`}>{pct}%</span>
      {label && <span className="text-xs text-muted-foreground block">{label}</span>}
    </div>
  );
}

function JudgeStatusBadge({ status, summary }: { status: string; summary: any }) {
  if (status === "complete") {
    const aiCorrect = summary?.ai_correct ?? 0;
    const total = summary?.total_judged ?? 0;
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle2 size={12} className="text-green-600" />
        {aiCorrect}/{total} AI correct
      </Badge>
    );
  }
  if (status === "no_disputes") return <Badge variant="outline" className="gap-1"><CheckCircle2 size={12} className="text-green-600" /> All matched</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle size={12} /> Failed</Badge>;
  return <Badge variant="outline" className="gap-1"><Minus size={12} /> Pending</Badge>;
}

// ── Scenario Library Tab ──
function ScenarioLibraryTab() {
  const [catFilter, setCatFilter] = useState("all");

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["synthetic_scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synthetic_scenarios" as any)
        .select("*")
        .order("category")
        .order("scenario_type");
      if (error) throw error;
      return (data ?? []) as unknown as Scenario[];
    },
  });

  const filtered = catFilter === "all" ? scenarios : scenarios.filter((s) => s.category === catFilter);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen size={20} /> Scenario Library</CardTitle>
        <CardDescription>Pre-built conveyancing risk scenarios used to generate synthetic cases.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Badge variant={catFilter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setCatFilter("all")}>All ({scenarios.length})</Badge>
          {CATEGORIES.map((c) => {
            const count = scenarios.filter((s) => s.category === c.value).length;
            return (
              <Badge key={c.value} variant={catFilter === c.value ? "default" : "outline"} className="cursor-pointer" onClick={() => setCatFilter(c.value)}>
                {c.label} ({count})
              </Badge>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Risks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell><Badge className={categoryColor(s.category)}>{categoryLabel(s.category)}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{s.scenario_type}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{s.description}</TableCell>
                    <TableCell><Badge className={difficultyColor(s.difficulty)}>{s.difficulty}</Badge></TableCell>
                    <TableCell className="text-xs">{s.associated_doc_types.join(", ")}</TableCell>
                    <TableCell><Badge variant="outline">{s.expected_risks.length}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Generate Cases Tab ──
function GenerateCasesTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [totalCases, setTotalCases] = useState(10);
  const [mix, setMix] = useState<Record<string, number>>({ title_issues: 30, leasehold_risks: 30, building_safety: 10, seller_fraud: 15, source_of_wealth: 15, search_risks: 0, planning_issues: 0, environmental_hazards: 0, exchange_compliance: 0, missing_documents: 0 });
  const [difficultyMix, setDifficultyMix] = useState({ basic: 30, intermediate: 50, advanced: 20 });
  const [issuesMin, setIssuesMin] = useState(1);
  const [issuesMax, setIssuesMax] = useState(3);
  const [agentOverride, setAgentOverride] = useState<string>("auto");
  const [transactionType, setTransactionType] = useState<string>("Purchase");
  const [tenureOverride, setTenureOverride] = useState<string>("auto");

  // Auto-zero irrelevant categories when agent changes
  useEffect(() => {
    if (agentOverride === "auto") return;
    const relevant = AGENT_RELEVANT_CATEGORIES[agentOverride] ?? [];
    if (relevant.length === 0) return;
    const equalShare = Math.floor(100 / relevant.length);
    setMix((prev) => {
      const next: Record<string, number> = {};
      for (const cat of CATEGORIES) {
        next[cat.value] = relevant.includes(cat.value) ? equalShare : 0;
      }
      return next;
    });
  }, [agentOverride]);
  const [generating, setGenerating] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ agent: string; agentIdx: number; totalAgents: number; completed: number; failed: number; total: number } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, failed: 0, total: 0 });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["synthetic_scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("synthetic_scenarios" as any).select("*").eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as Scenario[];
    },
  });

  const [caseSteps, setCaseSteps] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!activeJobId) return;
    const interval = setInterval(async () => {
      const [jobRes, stepsRes] = await Promise.all([
        supabase
          .from("synthetic_generation_jobs" as any)
          .select("completed_cases, failed_cases, total_cases, status")
          .eq("id", activeJobId)
          .single(),
        supabase
          .from("synthetic_generated_cases" as any)
          .select("current_step")
          .eq("job_id", activeJobId),
      ]);
      if (jobRes.data) {
        const job = jobRes.data as any;
        setProgress({ completed: job.completed_cases, failed: job.failed_cases, total: job.total_cases });
        if (job.status === "completed" || job.status === "failed") {
          setGenerating(false);
          setActiveJobId(null);
          setCaseSteps({});
          queryClient.invalidateQueries({ queryKey: ["synthetic_jobs"] });
          queryClient.invalidateQueries({ queryKey: ["generated_cases"] });
          toast({ title: job.status === "completed" ? "Generation & evaluation complete" : "Generation finished with errors", description: `${job.completed_cases} cases generated & evaluated, ${job.failed_cases} failed.` });
        }
      }
      if (stepsRes.data) {
        const counts: Record<string, number> = {};
        for (const row of stepsRes.data as any[]) {
          const step = row.current_step || "queued";
          counts[step] = (counts[step] || 0) + 1;
        }
        setCaseSteps(counts);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeJobId, queryClient, toast]);

  const pickScenarios = useCallback((count: number): Scenario[] => {
    const picked: Scenario[] = [];
    // Filter scenarios to only relevant categories when agent is overridden
    const relevantCats = agentOverride !== "auto" ? (AGENT_RELEVANT_CATEGORIES[agentOverride] ?? []) : null;
    const eligibleScenarios = relevantCats
      ? scenarios.filter((s) => relevantCats.includes(s.category))
      : scenarios;

    const byCategory = eligibleScenarios.reduce<Record<string, Scenario[]>>((acc, s) => { (acc[s.category] ??= []).push(s); return acc; }, {});

    // Only consider mix entries with pct > 0 AND that exist in eligible categories
    const cats = Object.entries(mix).filter(([cat, pct]) => pct > 0 && byCategory[cat]?.length);
    const totalPct = cats.reduce((s, [, p]) => s + p, 0) || 1;

    for (let i = 0; i < count; i++) {
      let roll = Math.random() * totalPct;
      let chosenCat = cats[0]?.[0] ?? (relevantCats?.[0] ?? "title_issues");
      for (const [cat, pct] of cats) {
        roll -= pct;
        if (roll <= 0) { chosenCat = cat; break; }
      }
      const pool = byCategory[chosenCat] ?? eligibleScenarios;
      if (pool.length > 0) picked.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return picked;
  }, [scenarios, mix, agentOverride]);

  const pickDifficulty = (): string => {
    const total = difficultyMix.basic + difficultyMix.intermediate + difficultyMix.advanced || 1;
    let roll = Math.random() * total;
    if ((roll -= difficultyMix.basic) <= 0) return "basic";
    if ((roll -= difficultyMix.intermediate) <= 0) return "intermediate";
    return "advanced";
  };

  const handleGenerate = async () => {
    if (!title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (totalCases < 1 || totalCases > 500) { toast({ title: "Cases must be 1-500", variant: "destructive" }); return; }

    setGenerating(true);
    try {
      const { data: job, error: jobErr } = await supabase
        .from("synthetic_generation_jobs" as any)
        .insert({
          title: title.trim(),
          config: { mix, difficulty_mix: difficultyMix, issues_per_case: { min: issuesMin, max: issuesMax }, agent_override: agentOverride, transaction_type: transactionType, tenure_override: tenureOverride },
          total_cases: totalCases,
          status: "generating",
          started_at: new Date().toISOString(),
          created_by: user!.id,
        } as any)
        .select("id")
        .single();

      if (jobErr || !job) throw new Error(jobErr?.message ?? "Failed to create job");

      const jobId = (job as any).id;
      setActiveJobId(jobId);
      setProgress({ completed: 0, failed: 0, total: totalCases });

      const semaphore = { count: 0, max: 5, queue: [] as (() => void)[] };
      const acquire = () => new Promise<void>((res) => {
        if (semaphore.count < semaphore.max) { semaphore.count++; res(); }
        else semaphore.queue.push(res);
      });
      const release = () => {
        semaphore.count--;
        const next = semaphore.queue.shift();
        if (next) { semaphore.count++; next(); }
      };

      const MAX_RETRIES = 2;
      const retryWithBackoff = async (fn: () => Promise<void>, retries = MAX_RETRIES): Promise<void> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            await fn();
            return;
          } catch (err: any) {
            const msg = err.message ?? "";
            // Don't retry client-side timeouts — the function is likely dead
            if (msg.includes("timed out after 3 minutes")) throw err;
            const isRetryable = attempt < retries && (
              msg.includes("timed out") ||
              msg.includes("504") ||
              msg.includes("503") ||
              msg.includes("429") ||
              msg.includes("500")
            );
            if (!isRetryable) throw err;
            const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);
            console.warn(`Retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms: ${msg}`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      };

      const CATEGORY_TO_AGENT: Record<string, string> = {
        source_of_wealth: "source-of-wealth",
        seller_fraud: "source-of-wealth",
      };

      const INVOKE_TIMEOUT_MS = 180_000; // 3 min per case max
      const withInvokeTimeout = <T,>(p: Promise<T>, label: string): Promise<T> =>
        Promise.race([
          p,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after 3 minutes`)), INVOKE_TIMEOUT_MS)
          ),
        ]);

      const tasks = Array.from({ length: totalCases }, () => async () => {
        await acquire();
        try {
          await retryWithBackoff(async () => {
            const issueCount = Math.floor(Math.random() * (issuesMax - issuesMin + 1)) + issuesMin;
            const picked = pickScenarios(issueCount);
            const difficulty = pickDifficulty();
            const requiresLeasehold = picked.some((s) => s.category === "leasehold_risks" || s.category === "building_safety");
            const tenure = tenureOverride !== "auto" ? tenureOverride : (requiresLeasehold ? "Leasehold" : "Freehold");

            let agentType: string;
            if (agentOverride !== "auto") {
              agentType = agentOverride;
            } else {
              const categoryCounts = picked.reduce<Record<string, number>>((acc, s) => { acc[s.category] = (acc[s.category] ?? 0) + 1; return acc; }, {});
              const dominantCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "source_of_wealth";
              agentType = CATEGORY_TO_AGENT[dominantCategory] ?? "source-of-wealth";
            }

            const resp = await withInvokeTimeout(
              supabase.functions.invoke("generate-synthetic-case", {
                body: {
                  scenarios: picked.map((s) => ({ scenario_type: s.scenario_type, description: s.description, expected_risks: s.expected_risks, category: s.category })),
                  property_config: { tenure, transaction_type: transactionType },
                  difficulty,
                  job_id: jobId,
                  agent_type: agentType,
                },
              }),
              `Case generation (${agentType})`,
            );
            if (resp.error) {
              const msg = await extractEdgeFunctionError(resp, "Synthetic case generation failed");
              throw new Error(msg);
            }
          });
        } finally {
          release();
        }
      });

      await Promise.allSettled(tasks.map((t) => t()));

      // Finalize job status in case the edge function didn't (e.g. all cases failed)
      try {
        const { data: finalJob } = await supabase
          .from("synthetic_generation_jobs" as any)
          .select("status, completed_cases, failed_cases, total_cases")
          .eq("id", jobId)
          .single();
        if (finalJob && (finalJob as any).status === "generating") {
          const fj = finalJob as any;
          if (fj.completed_cases + fj.failed_cases >= fj.total_cases) {
            await supabase
              .from("synthetic_generation_jobs" as any)
              .update({
                status: fj.completed_cases > 0 ? "completed" : "failed",
                completed_at: new Date().toISOString(),
              } as any)
              .eq("id", jobId);
          }
        }
      } catch { /* best-effort */ }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
      setGenerating(false);
      setActiveJobId(null);
    }
  };

  /* ── Bulk Generate: 20 cases × 4 agents ── */
  const BULK_AGENTS = [
    { id: "source-of-wealth", label: "Olimey AI", mix: { source_of_wealth: 50, seller_fraud: 50, title_issues: 0, leasehold_risks: 0, building_safety: 0, search_risks: 0, planning_issues: 0, environmental_hazards: 0, exchange_compliance: 0, missing_documents: 0 } },
  ];
  const BULK_CASES_PER_AGENT = 20;

  const handleBulkGenerate = async () => {
    setBulkGenerating(true);
    const diffMix = { basic: 25, intermediate: 50, advanced: 25 };

    for (let agentIdx = 0; agentIdx < BULK_AGENTS.length; agentIdx++) {
      const agent = BULK_AGENTS[agentIdx];
      setBulkProgress({ agent: agent.label, agentIdx: agentIdx + 1, totalAgents: BULK_AGENTS.length, completed: 0, failed: 0, total: BULK_CASES_PER_AGENT });

      try {
        const { data: job, error: jobErr } = await supabase
          .from("synthetic_generation_jobs" as any)
          .insert({
            title: `[BULK] ${agent.label} — Vault Diversity (${BULK_CASES_PER_AGENT} cases)`,
            config: { mix: agent.mix, difficulty_mix: diffMix, issues_per_case: { min: 1, max: 4 }, agent_override: agent.id, transaction_type: "Purchase", tenure_override: "auto" },
            total_cases: BULK_CASES_PER_AGENT,
            status: "generating",
            started_at: new Date().toISOString(),
            created_by: user!.id,
          } as any)
          .select("id")
          .single();

        if (jobErr || !job) throw new Error(jobErr?.message ?? "Failed to create job");
        const jobId = (job as any).id;

        // Fetch eligible scenarios for this agent
        const relevantCats = AGENT_RELEVANT_CATEGORIES[agent.id] ?? [];
        const eligibleScenarios = scenarios.filter((s: Scenario) => relevantCats.includes(s.category));

        const semaphore = { count: 0, max: 5, queue: [] as (() => void)[] };
        const acquire = () => new Promise<void>((res) => {
          if (semaphore.count < semaphore.max) { semaphore.count++; res(); }
          else semaphore.queue.push(res);
        });
        const release = () => {
          semaphore.count--;
          const next = semaphore.queue.shift();
          if (next) { semaphore.count++; next(); }
        };

        const MAX_RETRIES = 2;
        const retryWithBackoff = async (fn: () => Promise<void>, retries = MAX_RETRIES): Promise<void> => {
          for (let attempt = 0; attempt <= retries; attempt++) {
            try { await fn(); return; } catch (err: any) {
              const msg = err.message ?? "";
              if (msg.includes("timed out after 3 minutes")) throw err;
              const isRetryable = attempt < retries && (msg.includes("timed out") || msg.includes("504") || msg.includes("503") || msg.includes("429") || msg.includes("500"));
              if (!isRetryable) throw err;
              const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        };

        let bulkCompleted = 0;
        let bulkFailed = 0;

        const tasks = Array.from({ length: BULK_CASES_PER_AGENT }, () => async () => {
          await acquire();
          try {
            await retryWithBackoff(async () => {
              const issueCount = Math.floor(Math.random() * 3) + 1; // 1-3 issues
              const picked: Scenario[] = [];
              const byCategory = eligibleScenarios.reduce<Record<string, Scenario[]>>((acc, s) => { (acc[s.category] ??= []).push(s); return acc; }, {});
              const catsFiltered = Object.entries(agent.mix).filter(([cat, pct]) => pct > 0 && byCategory[cat]?.length);
              const totalPct = catsFiltered.reduce((s, [, p]) => s + p, 0) || 1;

              for (let i = 0; i < issueCount; i++) {
                let roll = Math.random() * totalPct;
                let chosenCat = catsFiltered[0]?.[0] ?? relevantCats[0];
                for (const [cat, pct] of catsFiltered) { roll -= pct; if (roll <= 0) { chosenCat = cat; break; } }
                const pool = byCategory[chosenCat] ?? eligibleScenarios;
                if (pool.length > 0) picked.push(pool[Math.floor(Math.random() * pool.length)]);
              }

              // Difficulty
              const dTotal = diffMix.basic + diffMix.intermediate + diffMix.advanced || 1;
              let dRoll = Math.random() * dTotal;
              const difficulty = (dRoll -= diffMix.basic) <= 0 ? "basic" : (dRoll -= diffMix.intermediate) <= 0 ? "intermediate" : "advanced";

              const requiresLeasehold = picked.some((s) => s.category === "leasehold_risks" || s.category === "building_safety");
              const tenure = requiresLeasehold ? "Leasehold" : "Freehold";

              const BULK_TIMEOUT_MS = 180_000;
              const bulkWithTimeout = <T,>(p: Promise<T>): Promise<T> =>
                Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Case timed out after 3 minutes")), BULK_TIMEOUT_MS))]);

              const resp = await bulkWithTimeout(supabase.functions.invoke("generate-synthetic-case", {
                body: {
                  scenarios: picked.map((s) => ({ scenario_type: s.scenario_type, description: s.description, expected_risks: s.expected_risks, category: s.category })),
                  property_config: { tenure, transaction_type: "Purchase" },
                  difficulty,
                  job_id: jobId,
                  agent_type: agent.id,
                },
              }));
              if (resp.error) {
                const msg = await extractEdgeFunctionError(resp, "Synthetic case generation failed");
                throw new Error(msg);
              }
              bulkCompleted++;
              setBulkProgress((prev) => prev ? { ...prev, completed: bulkCompleted, failed: bulkFailed } : prev);
            });
          } catch {
            bulkFailed++;
            setBulkProgress((prev) => prev ? { ...prev, completed: bulkCompleted, failed: bulkFailed } : prev);
          } finally {
            release();
          }
        });

        await Promise.allSettled(tasks.map((t) => t()));

        // Finalize job
        try {
          const { data: finalJob } = await supabase
            .from("synthetic_generation_jobs" as any)
            .select("status, completed_cases, failed_cases, total_cases")
            .eq("id", jobId)
            .single();
          if (finalJob && (finalJob as any).status === "generating") {
            const fj = finalJob as any;
            if (fj.completed_cases + fj.failed_cases >= fj.total_cases) {
              await supabase
                .from("synthetic_generation_jobs" as any)
                .update({ status: fj.completed_cases > 0 ? "completed" : "failed", completed_at: new Date().toISOString() } as any)
                .eq("id", jobId);
            }
          }
        } catch { /* best-effort */ }
      } catch (err: any) {
        toast({ title: `${agent.label} batch failed`, description: err.message, variant: "destructive" });
      }
    }

    setBulkGenerating(false);
    setBulkProgress(null);
    queryClient.invalidateQueries({ queryKey: ["synthetic_jobs"] });
    queryClient.invalidateQueries({ queryKey: ["generated_cases"] });
    toast({ title: "Bulk generation complete", description: `Generated cases for all 4 agents (${BULK_CASES_PER_AGENT} each). Check AI Performance tab for results.` });
  };

  const progressPct = progress.total > 0 ? ((progress.completed + progress.failed) / progress.total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Play size={20} /> Generate Synthetic Cases</CardTitle>
        <CardDescription>Configure and launch a batch. Each case is automatically evaluated against the gold-standard with cross-family judging.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium mb-1 block">Job Title</label>
          <Input placeholder="e.g. Leasehold stress test batch" value={title} onChange={(e) => setTitle(e.target.value)} disabled={generating} />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Total Cases to Generate</label>
          <Input type="number" min={1} max={500} value={totalCases} onChange={(e) => setTotalCases(Number(e.target.value))} disabled={generating} className="w-32" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Agent</label>
            <Select value={agentOverride} onValueChange={setAgentOverride} disabled={generating}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (from category)</SelectItem>
                <SelectItem value="source-of-wealth">Olimey AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Transaction Type</label>
            <Select value={transactionType} onValueChange={setTransactionType} disabled={generating}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Purchase">Purchase</SelectItem>
                <SelectItem value="Sale">Sale</SelectItem>
                <SelectItem value="Remortgage">Remortgage</SelectItem>
                <SelectItem value="Transfer of Equity">Transfer of Equity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Tenure</label>
            <Select value={tenureOverride} onValueChange={setTenureOverride} disabled={generating}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (from category)</SelectItem>
                <SelectItem value="Freehold">Freehold</SelectItem>
                <SelectItem value="Leasehold">Leasehold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Scenario Category Mix (%)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((c) => {
              const isLocked = agentOverride !== "auto" && !(AGENT_RELEVANT_CATEGORIES[agentOverride] ?? []).includes(c.value);
              return (
                <div key={c.value} className={`space-y-1 ${isLocked ? "opacity-40" : ""}`}>
                  <div className="flex justify-between text-sm">
                    <span>{c.label}{isLocked ? " 🔒" : ""}</span>
                    <span className="font-mono">{mix[c.value] ?? 0}%</span>
                  </div>
                  <Slider
                    min={0} max={100} step={5}
                    value={[mix[c.value] ?? 0]}
                    onValueChange={([v]) => setMix((prev) => ({ ...prev, [c.value]: v }))}
                    disabled={generating || isLocked}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Difficulty Distribution (%)</label>
          <div className="grid grid-cols-3 gap-4">
            {(["basic", "intermediate", "advanced"] as const).map((d) => (
              <div key={d} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{d}</span>
                  <span className="font-mono">{difficultyMix[d]}%</span>
                </div>
                <Slider
                  min={0} max={100} step={5}
                  value={[difficultyMix[d]]}
                  onValueChange={([v]) => setDifficultyMix((prev) => ({ ...prev, [d]: v }))}
                  disabled={generating}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Issues per Case</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Min:</span>
            <Select value={String(issuesMin)} onValueChange={(v) => setIssuesMin(Number(v))} disabled={generating}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">Max:</span>
            <Select value={String(issuesMax)} onValueChange={(v) => setIssuesMax(Number(v))} disabled={generating}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {generating && (
          <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><Loader2 className="animate-spin" size={14} /> Generating & evaluating...</span>
              <span className="font-mono">{progress.completed + progress.failed} / {progress.total}</span>
            </div>
            <Progress value={progressPct} />
            {Object.keys(caseSteps).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {[
                  { key: "generating_docs", label: "Generating Docs", icon: "📄" },
                  { key: "evaluating", label: "Evaluating", icon: "🔍" },
                  { key: "judging", label: "Judging", icon: "⚖️" },
                  { key: "complete", label: "Complete", icon: "✅" },
                  { key: "eval_failed", label: "Eval Failed", icon: "⚠️" },
                ].filter(({ key }) => (caseSteps[key] ?? 0) > 0).map(({ key, label, icon }) => (
                  <Badge key={key} variant={key === "complete" ? "default" : key === "eval_failed" ? "destructive" : "secondary"} className="text-xs gap-1">
                    <span>{icon}</span> {label}: {caseSteps[key]}
                  </Badge>
                ))}
              </div>
            )}
            {progress.failed > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={12} /> {progress.failed} failed</p>
            )}
          </div>
        )}

        <Button onClick={handleGenerate} disabled={generating || bulkGenerating} size="lg" className="w-full sm:w-auto">
          {generating ? <><Loader2 className="animate-spin mr-2" size={16} /> Generating & Evaluating...</> : <><Dna className="mr-2" size={16} /> Generate & Evaluate Cases</>}
        </Button>

        {/* ── Bulk Generate All Agents ── */}
        <div className="border-t pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 size={16} /> Bulk Generate — All Agents</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Generate {BULK_CASES_PER_AGENT} cases for each of the 4 agent types ({BULK_CASES_PER_AGENT * 4} total) with balanced category mixes and varied difficulty. Each case is evaluated and judged automatically.
            </p>
          </div>

          {bulkGenerating && bulkProgress && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={14} />
                  Agent {bulkProgress.agentIdx}/{bulkProgress.totalAgents}: <strong>{bulkProgress.agent}</strong>
                </span>
                <span className="font-mono">{bulkProgress.completed + bulkProgress.failed} / {bulkProgress.total}</span>
              </div>
              <Progress value={bulkProgress.total > 0 ? ((bulkProgress.completed + bulkProgress.failed) / bulkProgress.total) * 100 : 0} />
              <div className="flex gap-3 text-xs">
                <span className="text-primary">✓ {bulkProgress.completed} done</span>
                {bulkProgress.failed > 0 && <span className="text-destructive">✗ {bulkProgress.failed} failed</span>}
              </div>
            </div>
          )}

          <Button onClick={handleBulkGenerate} disabled={generating || bulkGenerating} size="lg" variant="secondary" className="w-full sm:w-auto">
            {bulkGenerating ? <><Loader2 className="animate-spin mr-2" size={16} /> Bulk Generating...</> : <><Dna className="mr-2" size={16} /> Generate 20 × 4 Agents (80 Cases)</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── AI Performance Tab (new) ──
function AIPerformanceTab() {
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [sortDateAsc, setSortDateAsc] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteCase = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from("synthetic_generated_cases" as any).delete().eq("benchmark_case_id", deleteTarget.id);
      const { error } = await (supabase as any).from("benchmark_cases").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["generated_cases"] });
      qc.invalidateQueries({ queryKey: ["benchmark_cases"] });
      toast({ title: "Case deleted", description: `"${deleteTarget.title}" removed.` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, qc, toast]);

  const { data: jobs = [] } = useQuery({
    queryKey: ["synthetic_jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synthetic_generation_jobs" as any)
        .select("id, title")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; title: string }[];
    },
  });

  const { data: generatedCases = [], isLoading: casesLoading } = useQuery({
    queryKey: ["generated_cases", jobFilter],
    queryFn: async () => {
      let q = supabase
        .from("synthetic_generated_cases" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (jobFilter !== "all") q = q.eq("job_id", jobFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as GeneratedCase[];
    },
  });

  const benchmarkIds = useMemo(() => generatedCases.map((c) => c.benchmark_case_id), [generatedCases]);
  const benchmarkIdsKey = useMemo(() => benchmarkIds.join(","), [benchmarkIds]);

  const { data: benchmarkCases = [] } = useQuery({
    queryKey: ["benchmark_cases_lookup", benchmarkIdsKey],
    queryFn: async () => {
      if (benchmarkIds.length === 0) return [];
      const { data, error } = await supabase
        .from("benchmark_cases")
        .select("id, title, property_address, agent_type")
        .in("id", benchmarkIds);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; property_address: string; agent_type: string }[];
    },
    enabled: benchmarkIds.length > 0,
  });

  const bcById = useMemo(() => benchmarkCases.reduce<Record<string, { title: string; property_address: string; agent_type: string }>>((acc, bc) => {
    acc[bc.id] = bc;
    return acc;
  }, {}), [benchmarkCases]);

  const { data: comparisons = [] } = useQuery({
    queryKey: ["case_comparisons", benchmarkIdsKey],
    queryFn: async () => {
      if (benchmarkIds.length === 0) return [];
      const { data, error } = await supabase
        .from("benchmark_comparisons")
        .select("*")
        .in("benchmark_case_id", benchmarkIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BenchmarkComparison[];
    },
    enabled: benchmarkIds.length > 0,
  });

  const compByCase = useMemo(() => comparisons.reduce<Record<string, BenchmarkComparison>>((acc, c) => {
    if (!acc[c.benchmark_case_id]) acc[c.benchmark_case_id] = c;
    return acc;
  }, {}), [comparisons]);

  const { evaluated, avgRecall, avgPrecision } = useMemo(() => {
    const ev = generatedCases.filter((c) => compByCase[c.benchmark_case_id]);
    return {
      evaluated: ev,
      avgRecall: ev.length > 0 ? ev.reduce((s, c) => s + (compByCase[c.benchmark_case_id]?.recall_score ?? 0), 0) / ev.length : null,
      avgPrecision: ev.length > 0 ? ev.reduce((s, c) => s + (compByCase[c.benchmark_case_id]?.precision_score ?? 0), 0) / ev.length : null,
    };
  }, [generatedCases, compByCase]);

  const sortedCases = useMemo(() => [...generatedCases].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDateAsc ? diff : -diff;
  }), [generatedCases, sortDateAsc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 size={20} /> AI Performance on Synthetic Cases</CardTitle>
        <CardDescription>
          Each generated case is automatically evaluated against its gold-standard. View per-case recall, precision, and judge verdicts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Cases</p>
            <p className="text-2xl font-bold">{generatedCases.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Evaluated</p>
            <p className="text-2xl font-bold">{evaluated.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Avg Recall</p>
            {avgRecall !== null ? <ScoreCell value={avgRecall} /> : <p className="text-muted-foreground">—</p>}
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Avg Precision</p>
            {avgPrecision !== null ? <ScoreCell value={avgPrecision} /> : <p className="text-muted-foreground">—</p>}
          </div>
        </div>

        {/* Job filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by job:</span>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-64"><SelectValue placeholder="All jobs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {casesLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
        ) : generatedCases.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No generated cases yet. Generate a batch from the Generate tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case / Address</TableHead>
                  <TableHead>Scenarios</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead className="text-center">Recall</TableHead>
                  <TableHead className="text-center">Precision</TableHead>
                  <TableHead className="text-center">Extraction</TableHead>
                  <TableHead className="text-center">Reasoning</TableHead>
                  <TableHead className="text-center">Evidence</TableHead>
                  <TableHead>Judge</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSortDateAsc(p => !p)}>
                      Generated <ArrowUpDown size={12} />
                    </Button>
                  </TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCases.map((gc) => {
                  const comp = compByCase[gc.benchmark_case_id];
                  const meta = gc.generation_metadata as any;
                  const bc = bcById[gc.benchmark_case_id];
                  return (
                    <TableRow key={gc.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{bc?.title ?? "—"}</div>
                        {bc?.property_address && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{bc.property_address}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {gc.scenarios_used.slice(0, 3).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                          {gc.scenarios_used.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{gc.scenarios_used.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={difficultyColor(meta?.difficulty ?? "intermediate")}>
                          {meta?.difficulty ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell><ScoreCell value={comp?.recall_score ?? null} /></TableCell>
                      <TableCell><ScoreCell value={comp?.precision_score ?? null} /></TableCell>
                      <TableCell><ScoreCell value={comp?.extraction_accuracy ?? null} /></TableCell>
                      <TableCell><ScoreCell value={comp?.reasoning_quality ?? null} /></TableCell>
                      <TableCell><ScoreCell value={comp?.evidence_grounding ?? null} /></TableCell>
                      <TableCell>
                        {comp ? (
                          <JudgeStatusBadge status={comp.judge_status} summary={comp.judge_summary} />
                        ) : (
                          <Badge variant="outline" className="gap-1"><AlertCircle size={12} /> No eval</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(gc.created_at), "dd MMM yy, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`/admin/benchmark-dashboard?case=${gc.benchmark_case_id}`}><ExternalLink size={14} className="mr-1" /> View</a>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget({ id: gc.benchmark_case_id, title: bc?.title ?? "Untitled" })}>
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

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete synthetic case?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>"{deleteTarget?.title}"</strong> and all related comparisons, outputs, and judge reviews.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCase} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// ── Generation History Tab ──
function GenerationHistoryTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sortJobDateAsc, setSortJobDateAsc] = useState(false);
  const [deleteJobTarget, setDeleteJobTarget] = useState<{ id: string; title: string; count: number } | null>(null);
  const [deletingJob, setDeletingJob] = useState(false);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["synthetic_jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("synthetic_generation_jobs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as GenerationJob[];
    },
    refetchInterval: 10_000,
  });

  const handleDeleteJob = useCallback(async () => {
    if (!deleteJobTarget) return;
    setDeletingJob(true);
    try {
      // Find all generated cases for this job
      const { data: genCases } = await supabase
        .from("synthetic_generated_cases" as any)
        .select("benchmark_case_id")
        .eq("job_id", deleteJobTarget.id);
      const caseIds = (genCases ?? []).map((c: any) => c.benchmark_case_id);

      if (caseIds.length > 0) {
        // Delete synthetic_generated_cases rows
        await supabase.from("synthetic_generated_cases" as any).delete().eq("job_id", deleteJobTarget.id);
        // Delete benchmark_cases (CASCADE handles related tables)
        await (supabase as any).from("benchmark_cases").delete().in("id", caseIds);
      }
      // Delete the job itself
      await supabase.from("synthetic_generation_jobs" as any).delete().eq("id", deleteJobTarget.id);

      qc.invalidateQueries({ queryKey: ["synthetic_jobs"] });
      qc.invalidateQueries({ queryKey: ["generated_cases"] });
      qc.invalidateQueries({ queryKey: ["benchmark_cases"] });
      toast({ title: "Job deleted", description: `"${deleteJobTarget.title}" and ${caseIds.length} case(s) removed.` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingJob(false);
      setDeleteJobTarget(null);
    }
  }, [deleteJobTarget, qc, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History size={20} /> Generation History</CardTitle>
        <CardDescription>Past synthetic case generation jobs.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
        ) : jobs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No generation jobs yet. Start one from the Generate tab.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSortJobDateAsc(p => !p)}>
                    Created <ArrowUpDown size={12} />
                  </Button>
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...jobs].sort((a, b) => {
                const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                return sortJobDateAsc ? diff : -diff;
              }).map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">{j.title}</TableCell>
                  <TableCell><Badge className={statusColor(j.status)}>{j.status}</Badge></TableCell>
                  <TableCell className="font-mono">{j.completed_cases}</TableCell>
                  <TableCell className="font-mono">{j.failed_cases > 0 ? <span className="text-destructive">{j.failed_cases}</span> : 0}</TableCell>
                  <TableCell className="font-mono">{j.total_cases}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(j.created_at), "dd MMM yy, HH:mm")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/admin/benchmark-dashboard?case=${j.id}`}><ExternalLink size={14} className="mr-1" /> View</a>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteJobTarget({ id: j.id, title: j.title, count: j.total_cases })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Bulk delete confirmation */}
        <AlertDialog open={!!deleteJobTarget} onOpenChange={(open) => { if (!open) setDeleteJobTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete entire generation job?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the job <strong>"{deleteJobTarget?.title}"</strong> and all <strong>{deleteJobTarget?.count}</strong> generated case(s), including their comparisons, outputs, and judge reviews.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingJob}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteJob} disabled={deletingJob} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deletingJob ? "Deleting…" : "Delete Job & Cases"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──
export default function AdminSyntheticGenerator() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Dna size={24} /> Synthetic Case Generator
            <InfoTooltip title="Synthetic Case Generator">
              <p>Generates realistic conveyancing test cases using AI. Each case includes simulated documents, a property profile, and a gold-standard set of expected findings.</p>
              <p className="mt-1">Generated cases are automatically added to the AI Learning Engine and can be evaluated immediately to measure agent accuracy. Cases run through the same AI pipeline as real cases, making them ideal for scalable regression testing.</p>
            </InfoTooltip>
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate realistic synthetic conveyancing cases with automatic AI evaluation, benchmarking, and regression testing.
          </p>
          <Badge variant="outline" className="mt-2 flex items-center gap-1 w-fit">Auto-Evaluate on Generation <InfoTooltip title="Auto-Evaluate"><p>When a synthetic case is generated, it is automatically run through the AI agent and compared against its gold-standard findings. This means Recall and Precision scores are available immediately without a separate evaluation step.</p></InfoTooltip></Badge>
        </div>

        <Tabs defaultValue="library">
          <TabsList>
            <TabsTrigger value="library" className="gap-1">Scenario Library <InfoTooltip title="Scenario Library"><p>Pre-built conveyancing risk scenarios (e.g. ground rent issues, missing searches, seller fraud) that define the types of cases that can be generated. Each scenario includes expected document types, risk categories, and difficulty levels.</p></InfoTooltip></TabsTrigger>
            <TabsTrigger value="generate" className="gap-1">Generate Cases <InfoTooltip title="Generate Cases"><p>Configure and launch bulk generation of synthetic benchmark cases. Select categories, set quantity, and the system generates cases in parallel (~40-55s each) with full document sets and gold-standard findings.</p></InfoTooltip></TabsTrigger>
            <TabsTrigger value="performance" className="gap-1">AI Performance <InfoTooltip title="AI Performance"><p>View evaluation results for generated cases — Recall, Precision, Extraction Accuracy, Reasoning Quality, and Evidence Grounding scores. Also shows the cross-family Judge assessment for each case.</p></InfoTooltip></TabsTrigger>
            <TabsTrigger value="history" className="gap-1">History <InfoTooltip title="Generation History"><p>Log of all bulk generation jobs with status tracking, completion counts, and links to the generated cases. Failed jobs show error details for debugging.</p></InfoTooltip></TabsTrigger>
          </TabsList>
          <TabsContent value="library"><ScenarioLibraryTab /></TabsContent>
          <TabsContent value="generate"><GenerateCasesTab /></TabsContent>
          <TabsContent value="performance"><AIPerformanceTab /></TabsContent>
          <TabsContent value="history"><GenerationHistoryTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

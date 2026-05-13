import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BarChart3, ArrowRight, CheckCircle2, BookOpen, Lightbulb, AlertTriangle,
  Target, Layers, Wand2, Play, TrendingUp, GitCompare, Shield, Zap,
  ChevronRight, ArrowDown, ExternalLink, Download, Plus, FlaskConical,
  Gavel, Rocket, RotateCcw, FileCode2, Database, BrainCircuit,
} from "lucide-react";

/* ── Reusable components (same pattern as AI Help Guide) ── */

function InfoBox({ variant, children }: { variant: "tip" | "warning" | "info"; children: React.ReactNode }) {
  const styles = {
    tip: "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20",
    warning: "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
    info: "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20",
  };
  const icons = {
    tip: <Lightbulb className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
    info: <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex gap-3 p-4 rounded-lg border ${styles[variant]}`}>
      {icons[variant]}
      <div className="text-sm">{children}</div>
    </div>
  );
}

function FlowDiagram() {
  const nodes = [
    { icon: Plus, label: "Create\nBenchmark Case", color: "bg-primary", desc: "Define case metadata" },
    { icon: Database, label: "Add Evidence\n& Outputs", color: "bg-purple-600", desc: "Upload docs via Vault" },
    { icon: GitCompare, label: "Evaluate\n(Human vs AI)", color: "bg-orange-600", desc: "Compare findings" },
    { icon: BrainCircuit, label: "Analyse\nPatterns", color: "bg-red-600", desc: "Identify failures" },
    { icon: RotateCcw, label: "Regression\nTest", color: "bg-blue-600", desc: "Verify no breakages" },
    { icon: Wand2, label: "Generate\nPrompt Patches", color: "bg-emerald-600", desc: "Auto-fix prompts" },
    { icon: Rocket, label: "Deployment\nReadiness", color: "bg-indigo-600", desc: "Go / No-go check" },
  ];

  return (
    <div className="py-6">
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-0 justify-between">
        {nodes.map((node, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center text-center w-28">
              <div className={`w-14 h-14 rounded-2xl ${node.color} flex items-center justify-center shadow-lg mb-2`}>
                <node.icon className="h-6 w-6 text-white" />
              </div>
              <span className="text-xs font-semibold whitespace-pre-line leading-tight">{node.label}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{node.desc}</span>
            </div>
            {i < nodes.length - 1 && (
              <ChevronRight className="h-5 w-5 text-muted-foreground hidden md:block shrink-0" />
            )}
            {i < nodes.length - 1 && (
              <ArrowDown className="h-5 w-5 text-muted-foreground md:hidden shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WhereBox({ color, children }: { color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    purple: "border-purple-400/30 bg-purple-50/30 dark:bg-purple-950/10 text-purple-700 dark:text-purple-400",
    primary: "border-primary/30 bg-primary/5 text-primary",
    blue: "border-blue-400/30 bg-blue-50/30 dark:bg-blue-950/10 text-blue-700 dark:text-blue-400",
    indigo: "border-indigo-400/30 bg-indigo-50/30 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400",
    orange: "border-orange-400/30 bg-orange-50/30 dark:bg-orange-950/10 text-orange-700 dark:text-orange-400",
    red: "border-red-400/30 bg-red-50/30 dark:bg-red-950/10 text-red-700 dark:text-red-400",
    emerald: "border-emerald-400/30 bg-emerald-50/30 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400",
  };
  return (
    <div className={`p-4 rounded-xl border-2 border-dashed ${colorMap[color] || colorMap.primary}`}>
      <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5" /> WHERE TO DO THIS
      </p>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  );
}

function StepBullet({ letter, color }: { letter: string; color: string }) {
  return (
    <div className={`w-7 h-7 rounded-full ${color} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
      {letter}
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-2 w-full justify-start">
      <Link to={to}>
        <Icon className="h-4 w-4" />
        {label}
        <ArrowRight className="h-3 w-3 ml-auto" />
      </Link>
    </Button>
  );
}

/* ── Tab descriptions ── */
const TAB_DESCRIPTIONS = [
  { name: "Cases", icon: Database, desc: "Lists all benchmark cases (real & synthetic). Filter by agent, source type, and status. Click any row to open the Vault detail panel." },
  { name: "Performance", icon: BarChart3, desc: "Aggregated Recall & Precision bar charts by agent, issue-type pie chart, and Real vs Synthetic comparison cards." },
  { name: "Judge", icon: Gavel, desc: "Cross-family judge verdicts. GPT-5 evaluates Gemini outputs for model independence. Shows verdict, reasoning, confidence, and evidence grounding." },
  { name: "Failures", icon: AlertTriangle, desc: "Inline failure-type summary table (counts & percentages), plus AI-detected failure patterns with severity profiles and improvement recommendations." },
  { name: "Improvements", icon: Lightbulb, desc: "AI-generated improvement recommendations linked to failure patterns. Shows status (new / in-progress / resolved) and linked prompt patches." },
  { name: "Regression", icon: RotateCcw, desc: "Run regression tests to ensure new prompt changes don't break existing behaviour. Shows pass/fail/regression counts per run." },
  { name: "Deployment", icon: Rocket, desc: "Per-agent readiness checklist. Shows deployed version, open failure patterns, pending patches, and regression results — green / amber / red status." },
];

/* ── Main page ── */
export default function AdminBenchmarkGuide() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isStandalone = searchParams.get("standalone") === "true";

  const handleOpenStandalone = () => {
    window.open("/admin/benchmark-guide?standalone=true", "_blank", "noopener");
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  const content = (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Hero */}
      <div className="text-center space-y-3 pt-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <BookOpen className="h-3.5 w-3.5" />
          Benchmark Dashboard Guide
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          How to Use the Benchmark Dashboard
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          A step-by-step visual guide to creating benchmark cases, evaluating AI performance,
          identifying failure patterns, and deploying prompt improvements.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2 print:hidden">
          {!isStandalone && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/admin/benchmark-dashboard")}>
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
              Back to Dashboard
            </Button>
          )}
          {!isStandalone && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleOpenStandalone}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open in New Window
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownloadPdf}>
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Quick Navigation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <QuickLink to="/admin/benchmark-dashboard" icon={BarChart3} label="Dashboard" />
            <QuickLink to="/admin/prompt-management" icon={FileCode2} label="Prompts" />
            <QuickLink to="/admin/synthetic-generator" icon={BrainCircuit} label="Synthetic Cases" />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ── Overview ── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Dashboard Workflow Overview
        </h2>
        <p className="text-sm text-muted-foreground">
          The Benchmark Dashboard is the control centre for measuring and improving AI agent accuracy.
          Follow this pipeline from case creation through to deployment readiness.
        </p>
        <FlowDiagram />
        <InfoBox variant="info">
          <strong>Iterative process:</strong> After deploying prompt improvements, create new benchmark cases
          (or re-run synthetic generation) to verify fixes and discover new edge cases.
        </InfoBox>
      </section>

      <Separator />

      {/* ── Steps Accordion ── */}
      <Accordion type="multiple" className="space-y-3">

        {/* Step 1: Creating a Benchmark Case */}
        <AccordionItem value="step-1" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">1</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Creating a Benchmark Case</p>
                <p className="text-xs text-muted-foreground">Set up a new case with metadata for evaluation.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <WhereBox color="primary">
              <strong>Benchmark Dashboard</strong> → Click the <strong>"+ New Case"</strong> button in the top-right header.
            </WhereBox>

            <div className="flex gap-3 items-start">
              <StepBullet letter="A" color="bg-primary" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Fill in the case details:</strong></p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50"><th className="text-left p-2 font-semibold">Field</th><th className="text-left p-2 font-semibold">Description</th></tr></thead>
                    <tbody className="divide-y">
                      <tr><td className="p-2 font-medium">Title</td><td className="p-2 text-muted-foreground">A descriptive name for the benchmark case, e.g. "Leasehold flat with short lease"</td></tr>
                      <tr><td className="p-2 font-medium">Agent Type</td><td className="p-2 text-muted-foreground">Which AI agent to benchmark — currently Olimey AI (Source of Wealth)</td></tr>
                      <tr><td className="p-2 font-medium">Case Type</td><td className="p-2 text-muted-foreground">The transaction type — Purchase, Sale, Remortgage, etc.</td></tr>
                      <tr><td className="p-2 font-medium">Source Type</td><td className="p-2 text-muted-foreground">Whether this is a real case or synthetically generated</td></tr>
                      <tr><td className="p-2 font-medium">Transaction Type</td><td className="p-2 text-muted-foreground">Freehold or Leasehold</td></tr>
                      <tr><td className="p-2 font-medium">Property Address</td><td className="p-2 text-muted-foreground">The address used in the benchmark scenario</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="B" color="bg-primary" />
              <div className="flex-1">
                <p className="text-sm"><strong>Click "Create Case"</strong> to save. The case appears in the Cases tab with status <Badge variant="secondary" className="text-[10px]">draft</Badge>.</p>
              </div>
            </div>

            <InfoBox variant="tip">
              <strong>Synthetic cases:</strong> If you use the Synthetic Case Generator, cases are automatically created and added to the Vault — no need to create them manually.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>

        {/* Step 2: Adding Evidence & Outputs */}
        <AccordionItem value="step-2" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">2</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Database className="h-4 w-4" /> Adding Evidence & Outputs</p>
                <p className="text-xs text-muted-foreground">Upload documents and add human/AI outputs via the Vault.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <WhereBox color="purple">
              <strong>Benchmark Dashboard</strong> → Cases tab → Click on a case row → Opens the <strong>Vault detail panel</strong> on the right.
            </WhereBox>

            <div className="flex gap-3 items-start">
              <StepBullet letter="A" color="bg-purple-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Upload evidence documents</strong> — these are the source documents the AI will analyse (title deeds, searches, SoW forms, etc.).</p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="B" color="bg-purple-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Add human ground-truth outputs</strong> — the "Gold Standard" expected findings that the AI should identify. These can be uploaded as files or typed directly.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="C" color="bg-purple-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Add AI outputs</strong> — paste or upload the AI agent's actual findings for comparison against the human ground-truth.</p>
              </div>
            </div>

            <InfoBox variant="info">
              <strong>Vault shortcut:</strong> You can also manage evidence and outputs directly from the <strong>AI Learning Engine</strong> dashboard (Cases tab).
            </InfoBox>
          </AccordionContent>
        </AccordionItem>

        {/* Step 3: Running Evaluate & Analyse */}
        <AccordionItem value="step-3" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">3</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><GitCompare className="h-4 w-4" /> Running Evaluate & Analyse</p>
                <p className="text-xs text-muted-foreground">Compare human vs AI findings and identify failure patterns.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <WhereBox color="orange">
              <strong>Benchmark Dashboard</strong> → Click the <strong>"Evaluate & Analyse"</strong> button in the dashboard header area.
            </WhereBox>

            <div className="flex gap-3 items-start">
              <StepBullet letter="A" color="bg-orange-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Phase 1 — Evaluate:</strong> The system compares each case's human ground-truth against the AI's findings. It identifies matches, missed issues, false positives, extraction errors, severity mismatches, and citation failures.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="B" color="bg-orange-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Phase 2 — Analyse:</strong> After evaluation, the system automatically analyses all comparison results to detect recurring failure patterns across cases. These patterns appear in the <strong>Failures</strong> tab.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="C" color="bg-orange-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Cross-family judging:</strong> A separate AI model (GPT-5) independently judges the Gemini-generated outputs for model independence. Results appear in the <strong>Judge</strong> tab.</p>
              </div>
            </div>

            <InfoBox variant="warning">
              <strong>Prerequisites:</strong> Cases must have both human outputs and AI outputs before evaluation can run. Cases still in "draft" status are skipped.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>

        {/* Step 4: Understanding the Tabs */}
        <AccordionItem value="step-4" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">4</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> Understanding the Dashboard Tabs</p>
                <p className="text-xs text-muted-foreground">What each tab shows and how to read the data.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-4">
            <div className="grid gap-3">
              {TAB_DESCRIPTIONS.map((tab) => (
                <div key={tab.name} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <tab.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">{tab.name}</p>
                    <p className="text-xs text-muted-foreground">{tab.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <InfoBox variant="tip">
              <strong>Key metrics to watch:</strong> Recall measures how many real issues the AI found. Precision measures how many of the AI's findings were correct. Both should trend upward over time.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>

        {/* Step 5: Running a Regression Test */}
        <AccordionItem value="step-5" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">5</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Running a Regression Test</p>
                <p className="text-xs text-muted-foreground">Verify that prompt changes haven't broken existing behaviour.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <WhereBox color="blue">
              <strong>Benchmark Dashboard</strong> → <strong>Regression</strong> tab → Click <strong>"Run Regression Test"</strong>.
            </WhereBox>

            <div className="flex gap-3 items-start">
              <StepBullet letter="A" color="bg-blue-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>When to run:</strong> After deploying a new prompt version or applying prompt patches. Regression tests re-evaluate all benchmark cases with the current prompt to check nothing has degraded.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="B" color="bg-blue-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Reading results:</strong> The test shows pass / fail / regression counts. A <Badge variant="destructive" className="text-[10px]">regression</Badge> means a case that previously passed now fails — this blocks deployment.</p>
              </div>
            </div>

            <InfoBox variant="warning">
              <strong>Regressions block deployment:</strong> If any regressions are detected, the Deployment tab will show a "blocked" status for that agent until the regressions are resolved.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>

        {/* Step 6: Generating Prompt Patches */}
        <AccordionItem value="step-6" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">6</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4" /> Generating Prompt Patches</p>
                <p className="text-xs text-muted-foreground">Auto-generate targeted prompt improvements from failure patterns.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <WhereBox color="emerald">
              <strong>Benchmark Dashboard</strong> → <strong>Improvements</strong> tab → Click <strong>"Generate Patches"</strong>.
            </WhereBox>

            <div className="flex gap-3 items-start">
              <StepBullet letter="A" color="bg-emerald-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>How it works:</strong> The system analyses all unresolved failure patterns and generates targeted prompt modifications designed to fix the specific weaknesses identified.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="B" color="bg-emerald-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Review in Prompt Management:</strong> Generated patches appear in the <strong>Prompt Management</strong> page where you can review, edit, and deploy them as new prompt versions.</p>
              </div>
            </div>

            <InfoBox variant="tip">
              <strong>Iterate:</strong> After deploying patches, run a regression test to confirm the fixes work, then generate new benchmark cases to discover further edge cases.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>

        {/* Step 7: Deployment Readiness */}
        <AccordionItem value="step-7" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">7</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Rocket className="h-4 w-4" /> Deployment Readiness</p>
                <p className="text-xs text-muted-foreground">Check the go / no-go status before deploying prompt changes.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <WhereBox color="indigo">
              <strong>Benchmark Dashboard</strong> → <strong>Deployment</strong> tab.
            </WhereBox>

            <div className="flex gap-3 items-start">
              <StepBullet letter="A" color="bg-indigo-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Per-agent checklist:</strong> Each agent shows its deployment readiness as one of:</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge className="bg-green-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Ready</Badge>
                  <Badge className="bg-amber-500 text-white text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" /> Caution</Badge>
                  <Badge className="bg-red-600 text-white text-[10px]"><Shield className="h-3 w-3 mr-1" /> Blocked</Badge>
                </div>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <StepBullet letter="B" color="bg-indigo-600" />
              <div className="flex-1 space-y-2">
                <p className="text-sm"><strong>Blockers shown:</strong> The checklist details exactly what's preventing deployment — regression failures, unresolved patterns, or pending patches.</p>
              </div>
            </div>

            <InfoBox variant="info">
              <strong>Deploy via Prompt Management:</strong> When an agent shows "Ready", navigate to <strong>Prompt Management</strong> to deploy the pending prompt version to production.
            </InfoBox>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Separator />

      {/* ── FAQ ── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Frequently Asked Questions
        </h2>

        <Accordion type="multiple" className="space-y-2">
          <AccordionItem value="faq-1" className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline text-sm font-medium">
              Should I use synthetic or real cases for benchmarking?
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground">
              <strong>Both.</strong> Synthetic cases are great for stress-testing specific risk categories at scale (e.g. 50 leasehold BSA scenarios).
              Real cases provide ground-truth from actual conveyancing work. A healthy benchmark suite uses a mix — typically 70% synthetic and 30% real cases.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-2" className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline text-sm font-medium">
              What's a good Recall score?
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground">
              <strong>Recall measures completeness</strong> — did the AI find all the real issues? A score above <strong>85%</strong> is good, above <strong>92%</strong> is excellent.
              Recall is more critical than Precision for legal compliance because missing a real issue is worse than flagging a false positive.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-3" className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline text-sm font-medium">
              What's a good Precision score?
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground">
              <strong>Precision measures accuracy</strong> — were the AI's findings actually correct? A score above <strong>80%</strong> is acceptable, above <strong>90%</strong> is excellent.
              Low precision means too many false positives, which wastes conveyancer time.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-4" className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline text-sm font-medium">
              How often should I run benchmarks?
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground">
              Run a full benchmark cycle <strong>before every prompt deployment</strong>. For ongoing monitoring, run weekly synthetic batches to catch drift.
              After any major prompt change, always run a regression test before deploying.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-5" className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline text-sm font-medium">
              What does the cross-family judge do?
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground">
              The judge uses a <strong>different AI model family</strong> (GPT-5) to independently evaluate the outputs of the primary model (Gemini).
              This ensures model independence — the AI isn't grading its own homework. The judge assesses correctness, evidence grounding, and provides a confidence score.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq-6" className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-5 py-3 hover:no-underline text-sm font-medium">
              Can I exclude a case from benchmarking?
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground">
              Yes. In the Vault detail panel for any case, toggle the <strong>"Exclude from benchmarking"</strong> switch. Excluded cases are still stored but won't be included in evaluation runs or performance metrics.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        {content}
      </div>
    );
  }

  return <AppLayout>{content}</AppLayout>;
}

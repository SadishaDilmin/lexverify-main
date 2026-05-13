import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FlaskConical, Dna, FileCode2, BarChart3, ArrowRight, CheckCircle2,
  BookOpen, Lightbulb, AlertTriangle, Target, Layers, Wand2, Play,
  TrendingUp, GitCompare, Shield, Zap, RotateCcw, ChevronRight,
  CircleDot, ArrowDown, Gauge, ExternalLink, Download, Filter,
  Loader2, Gavel, BrainCircuit, Rocket, Bell, Trash2, Database,
} from "lucide-react";

/* ── Reusable components ── */

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
    { icon: Dna, label: "Generate\nSynthetic Cases", color: "bg-purple-600", desc: "Create test data" },
    { icon: Database, label: "Review\nVault", color: "bg-violet-600", desc: "30+ cases per agent" },
    { icon: Play, label: "Evaluate\n& Analyse", color: "bg-primary", desc: "Canary + batch run" },
    { icon: BarChart3, label: "Review\nScores", color: "bg-indigo-600", desc: "Recall & Precision" },
    { icon: Wand2, label: "Generate\nPatches", color: "bg-emerald-600", desc: "Targeted fixes" },
    { icon: FileCode2, label: "Deploy\nPrompt", color: "bg-blue-600", desc: "Readiness gate" },
    { icon: Shield, label: "Auto-Verify\n& Regression", color: "bg-orange-600", desc: "Health + full test" },
    { icon: Rocket, label: "Live\n& Monitor", color: "bg-green-600", desc: "Automatic go-live" },
  ];

  return (
    <div className="py-6">
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-0 justify-between">
        {nodes.map((node, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center text-center w-24">
              <div className={`w-12 h-12 rounded-2xl ${node.color} flex items-center justify-center shadow-lg mb-2`}>
                <node.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-semibold whitespace-pre-line leading-tight">{node.label}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{node.desc}</span>
            </div>
            {i < nodes.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:block shrink-0" />
            )}
            {i < nodes.length - 1 && (
              <ArrowDown className="h-4 w-4 text-muted-foreground md:hidden shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, description }: { icon: React.ElementType; label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
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

function WhereBox({ color, children }: { color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    purple: "border-purple-400/30 bg-purple-50/30 dark:bg-purple-950/10 text-purple-700 dark:text-purple-400",
    primary: "border-primary/30 bg-primary/5 text-primary",
    blue: "border-blue-400/30 bg-blue-50/30 dark:bg-blue-950/10 text-blue-700 dark:text-blue-400",
    indigo: "border-indigo-400/30 bg-indigo-50/30 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400",
    orange: "border-orange-400/30 bg-orange-50/30 dark:bg-orange-950/10 text-orange-700 dark:text-orange-400",
    emerald: "border-emerald-400/30 bg-emerald-50/30 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400",
    red: "border-red-400/30 bg-red-50/30 dark:bg-red-950/10 text-red-700 dark:text-red-400",
  };
  return (
    <div className={`p-4 rounded-xl border-2 border-dashed ${colorMap[color]}`}>
      <p className={`text-xs font-bold mb-2 flex items-center gap-1.5`}>
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

/* ── Screenshot-style mockup of the dashboard toolbar ── */
function DashboardToolbarMockup() {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="px-2 py-1 rounded border bg-card text-[10px]">All Sources ▾</div>
        <div className="px-2 py-1 rounded border bg-primary text-primary-foreground text-[10px] font-medium">Olimey AI (SoW) ▾</div>
        <div className="px-2 py-1 rounded border bg-card text-[10px]">All Status ▾</div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-primary bg-primary" />
          <span className="text-[10px] text-muted-foreground">Skip already evaluated</span>
        </div>
        <div className="px-2 py-1 rounded border bg-card text-[10px] flex items-center gap-1"><GitCompare className="h-2.5 w-2.5" /> Regression Test</div>
        <div className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-1"><Play className="h-2.5 w-2.5" /> Evaluate & Analyse (14)</div>
      </div>
    </div>
  );
}

/* ── Screenshot-style mockup of the 7 tabs ── */
function DashboardTabsMockup({ activeTab }: { activeTab: string }) {
  const tabs = ["Cases", "Performance", "Judge", "Failures", "Improvements", "Regression", "Deployment"];
  return (
    <div className="flex gap-0.5 p-1 rounded-lg bg-muted">
      {tabs.map((t) => (
        <div key={t} className={`px-2.5 py-1.5 rounded-md text-[10px] font-medium ${t === activeTab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>{t}</div>
      ))}
    </div>
  );
}

/* ── Main page ── */
export default function AdminAIHelpGuide() {
  const [searchParams] = useSearchParams();
  const isStandalone = searchParams.get("standalone") === "true";

  const handleOpenStandalone = () => {
    window.open("/admin/ai-help-guide?standalone=true", "_blank", "noopener");
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
          Admin Help Guide
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          AI Learning & Evaluation Engine
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          A step-by-step guide to continuously improving Olimey AI's AI agents using the consolidated 
          AI Learning Engine — from synthetic benchmarking through to versioned prompt deployment.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2 print:hidden">
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <QuickLink to="/admin/synthetic-generator" icon={Dna} label="Synthetic Cases" />
            <QuickLink to="/admin/benchmark-dashboard" icon={BarChart3} label="AI Learning Engine" />
            <QuickLink to="/admin/prompt-management" icon={FileCode2} label="Prompt Management" />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ── Overview ── */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          How It Works — The Improvement Loop
        </h2>
        <p className="text-sm text-muted-foreground">
          The AI Learning Engine follows a closed-loop workflow. Each cycle generates test data, 
          evaluates the AI against gold-standard answers, identifies failure patterns, generates 
          targeted prompt patches, and verifies those fixes through regression testing before deployment.
        </p>
        <FlowDiagram />
        <InfoBox variant="info">
          <strong>Single consolidated hub:</strong> The AI Learning Engine dashboard is the central place for 
          all benchmarking, evaluation, and deployment activities. Everything from case management to 
          deployment readiness lives in the 7-tab dashboard.
        </InfoBox>
      </section>

      <Separator />

      {/* ══════════════════════════════════════════════════════════
          ALL STEPS IN ACCORDION
         ══════════════════════════════════════════════════════════ */}
      <Accordion type="multiple" className="space-y-3">

        {/* ── STEP 1: Generate Synthetic Cases ── */}
        <AccordionItem value="step-1" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">1</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Dna className="h-4 w-4" /> Generate Synthetic Cases</p>
                <p className="text-xs text-muted-foreground">Create realistic test scenarios with injected risks and gold-standard answers.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Navigate */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">1A — Navigate to the Generator</h4>
              <WhereBox color="purple">
                In the left sidebar, scroll to <strong>Administration</strong> and click <strong>"Synthetic Cases"</strong>.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-purple-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Find it in the sidebar:</strong></p>
                  <div className="rounded-lg border bg-muted/30 p-3 max-w-xs">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Administration</p>
                    <div className="space-y-1">
                      {["AI Learning Engine", "Prompt Management", "Synthetic Cases", "AI Engine Help"].map((item) => (
                        <div key={item} className={`px-3 py-1.5 rounded text-xs ${item === "Synthetic Cases" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"}`}>
                          {item === "Synthetic Cases" && "→ "}{item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm">The Synthetic Case Generator creates realistic conveyancing scenarios with injected legal risks and corresponding gold-standard expected answers.</p>
            </div>

            <Separator />

            {/* Configure */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">1B — Configure and Launch a Batch</h4>
              <WhereBox color="purple">
                <strong>Administration → Synthetic Cases</strong> → Click the <strong>"Generate Cases"</strong> tab at the top of the page.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-purple-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Fill in the generation form:</strong></p>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/50"><th className="text-left p-2 font-semibold">Setting</th><th className="text-left p-2 font-semibold">Description</th><th className="text-left p-2 font-semibold">Recommendation</th></tr></thead>
                      <tbody className="divide-y">
                        <tr><td className="p-2 font-medium">Job Title</td><td className="p-2 text-muted-foreground">Name for tracking</td><td className="p-2">Be descriptive, e.g. "Leasehold BSA stress test"</td></tr>
                        <tr><td className="p-2 font-medium">Total Cases</td><td className="p-2 text-muted-foreground">Number to generate (1–500)</td><td className="p-2">Start with 10 for first run</td></tr>
                        <tr><td className="p-2 font-medium">Category Mix</td><td className="p-2 text-muted-foreground">% allocation per scenario type</td><td className="p-2">Weight towards known weak areas</td></tr>
                        <tr><td className="p-2 font-medium">Difficulty Mix</td><td className="p-2 text-muted-foreground">Basic / Intermediate / Advanced</td><td className="p-2">30/50/20 is a good default</td></tr>
                        <tr><td className="p-2 font-medium">Issues per Case</td><td className="p-2 text-muted-foreground">Min–Max issues injected</td><td className="p-2">1–3 for realistic scenarios</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-purple-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Click "Generate &amp; Evaluate Cases" to start:</strong></p>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold">Leasehold BSA Stress Test</div>
                        <div className="text-[10px] text-muted-foreground">10 cases · 30% Basic / 50% Intermediate / 20% Advanced</div>
                      </div>
                      <div className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5">
                        <Dna className="h-3 w-3" /> Generate &amp; Evaluate Cases
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <InfoBox variant="tip">
                <strong>Auto-evaluation:</strong> Each generated case is automatically analysed by the AI agent, compared against 
                the gold-standard, and judged by a cross-family model — all in one step. Cases land in the AI Learning Engine dashboard automatically.
              </InfoBox>
            </div>

            <Separator />

            {/* Review */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">1C — Review Generation Results</h4>
              <WhereBox color="purple">
                <strong>Administration → Synthetic Cases</strong> → Click the <strong>"History"</strong> tab, or go directly to the <strong>AI Learning Engine</strong> to see all cases.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-purple-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Find your completed batch in the History tab:</strong></p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex gap-1 mb-2">
                      {["Scenario Library", "Generate Cases", "AI Performance", "History"].map((t, i) => (
                        <div key={t} className={`px-3 py-1.5 rounded-md text-xs font-medium ${i === 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{t}</div>
                      ))}
                    </div>
                    <div className="rounded border bg-card p-2.5 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold">Leasehold BSA Stress Test</div>
                        <div className="text-[10px] text-muted-foreground">10 cases · Completed 5 mins ago</div>
                      </div>
                      <Badge variant="default" className="text-[10px]">✓ Complete</Badge>
                    </div>
                  </div>
                </div>
              </div>
              <InfoBox variant="info">
                <strong>All generated cases appear automatically</strong> in the AI Learning Engine dashboard (Cases tab). 
                You don't need to manually import them — they're ready for evaluation immediately.
              </InfoBox>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 2: AI Learning Engine — Evaluate & Analyse ── */}
        <AccordionItem value="step-2" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">2</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Evaluate & Analyse in the AI Learning Engine</p>
                <p className="text-xs text-muted-foreground">Run background evaluations, review cases, and inspect comparison results.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Navigate to dashboard */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">2A — Open the AI Learning Engine</h4>
              <WhereBox color="primary">
                <strong>Administration → AI Learning Engine</strong> in the sidebar. This opens the consolidated benchmark dashboard.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-primary" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>The dashboard header shows 6 summary cards:</strong></p>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="grid grid-cols-6 gap-2">
                      {[
                        { icon: "📊", label: "Cases", value: "78" },
                        { icon: "🧪", label: "Evaluations", value: "14" },
                        { icon: "📈", label: "Avg Recall", value: "87%" },
                        { icon: "🛡️", label: "Avg Precision", value: "34%" },
                        { icon: "⚖️", label: "Judge Reviews", value: "42" },
                        { icon: "🔄", label: "Regression Runs", value: "2" },
                      ].map((m) => (
                        <div key={m.label} className="text-center p-2 rounded border bg-card">
                          <div className="text-base">{m.icon}</div>
                          <div className="text-sm font-bold">{m.value}</div>
                          <div className="text-[10px] text-muted-foreground">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Filter & Evaluate */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">2B — Filter Cases & Run Evaluation</h4>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-primary" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Use the filter toolbar</strong> to narrow down by Source, Agent, and Status:</p>
                  <DashboardToolbarMockup />
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-primary" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Click "Evaluate & Analyse"</strong> to start a background batch evaluation. The button shows the count of cases to be processed:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span className="text-xs font-medium">Background evaluation in progress</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">4 / 14</Badge>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: "29%" }} /></div>
                    <p className="text-[10px] text-muted-foreground">You can navigate away — you'll receive a notification when it's complete.</p>
                  </div>
                </div>
              </div>
              <InfoBox variant="info">
                <strong>Canary check:</strong> Before processing any cases, the system performs an instant auth probe 
                against the comparison endpoint. If a systemic issue is detected (e.g. 401/403 auth error), the 
                <strong> entire batch is aborted immediately</strong> with zero credit usage. This prevents the scenario 
                where hundreds of cases fail one-by-one and waste credits.
              </InfoBox>
              <InfoBox variant="tip">
                <strong>Bypass and discard:</strong> If an individual case fails during evaluation (e.g. document processing error), 
                that case is <strong>logged, skipped, and discarded</strong> — the batch continues with all remaining cases. 
                You'll get results from every viable case, and failed cases are clearly marked in the results.
              </InfoBox>
              <InfoBox variant="tip">
                <strong>"Skip already evaluated"</strong> checkbox (on by default) excludes cases that already have 
                comparison records. Uncheck it to re-run evaluation on all matching cases.
              </InfoBox>
              <InfoBox variant="info">
                <strong>Background processing:</strong> Evaluations run on the server in batches of 3. You can navigate 
                away from the page — a notification badge will alert you when the run completes. The dashboard auto-refreshes every 15 seconds.
              </InfoBox>
            </div>

            <Separator />

            {/* Recent evaluations */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">2C — View Recent Evaluations</h4>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-primary" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>After the batch completes</strong>, expand "Recent evaluations" to see the history:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Recent evaluations (3)</span>
                      <ArrowDown className="h-3 w-3 ml-auto" />
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { status: "Complete", cases: "14/14", failed: "0", date: "08 Mar 2026 · 17:00", analysis: true },
                        { status: "Complete", cases: "0/56", failed: "56", date: "07 Mar 2026 · 16:04", analysis: true },
                        { status: "Complete", cases: "0/98", failed: "98", date: "07 Mar 2026 · 14:22", analysis: true },
                      ].map((b, i) => (
                        <div key={i} className="flex items-center gap-2 rounded border bg-card p-2 text-[10px]">
                          <Badge variant={b.failed === "0" ? "default" : "destructive"} className="text-[10px]">{b.status}</Badge>
                          <span className="text-muted-foreground">{b.cases} cases {Number(b.failed) > 0 && <span className="text-destructive">({b.failed} failed)</span>}</span>
                          {b.analysis && <Badge variant="outline" className="text-[10px]">+ Pattern Analysis</Badge>}
                          <span className="ml-auto text-muted-foreground">{b.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Cases tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">2D — Browse the Cases Tab</h4>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-primary" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>The 7-tab layout</strong> is the heart of the dashboard. Start with the Cases tab:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <DashboardTabsMockup activeTab="Cases" />
                    <div className="rounded border bg-card overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead><tr className="bg-muted/50 border-b"><th className="p-1.5 text-left w-6">☐</th><th className="p-1.5 text-left">Title</th><th className="p-1.5">Source</th><th className="p-1.5">Agent</th><th className="p-1.5">Status</th><th className="p-1.5">Score</th><th className="p-1.5">Judge</th><th className="p-1.5 text-right">Date</th></tr></thead>
                        <tbody className="divide-y">
                          {[
                            { title: "[SYN] 14 Willow Creek Lane...", source: "Syn", agent: "Olimey AI", status: "ready", score: "R:100% P:33%", judge: "Done", date: "08 Mar" },
                            { title: "[SYN] 14 Hawthorn Lane...", source: "Syn", agent: "Olimey AI", status: "ready", score: "R:50% P:14%", judge: "Done", date: "08 Mar" },
                            { title: "[SYN] 45 Chestnut Avenue...", source: "Syn", agent: "Olimey AI", status: "ready", score: "R:100% P:33%", judge: "Done", date: "08 Mar" },
                          ].map((c, i) => (
                            <tr key={i} className={i === 0 ? "bg-primary/5" : ""}>
                              <td className="p-1.5"><div className="w-3 h-3 rounded border" /></td>
                              <td className="p-1.5 font-medium">{c.title}</td>
                              <td className="p-1.5"><Badge variant="secondary" className="text-[8px]">{c.source}</Badge></td>
                              <td className="p-1.5">{c.agent}</td>
                              <td className="p-1.5"><Badge variant="default" className="text-[8px] capitalize">{c.status}</Badge></td>
                              <td className="p-1.5 font-mono">{c.score}</td>
                              <td className="p-1.5"><Badge variant="default" className="text-[8px]"><Gavel className="h-2 w-2 mr-0.5" />{c.judge}</Badge></td>
                              <td className="p-1.5 text-right text-muted-foreground">{c.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-primary" />
                <div className="flex-1">
                  <p className="text-sm"><strong>Click any row</strong> to open the case detail panel on the right side. This shows documents, gold-standard answers, AI output, and the full comparison with scoring.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="C" color="bg-primary" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Batch actions:</strong> Select multiple cases with the checkbox, then click <strong>"Run Comparisons"</strong> to process them in parallel (concurrency of 3).</p>
                </div>
              </div>
              <InfoBox variant="tip">
                <strong>You can also add real cases.</strong> Click <strong>"+ New Case"</strong> at the top of the Cases tab to manually 
                create a benchmark case with real documents and human-written ground-truth findings.
              </InfoBox>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 3: Review Performance ── */}
        <AccordionItem value="step-3" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">3</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Review Performance & Judge Results</p>
                <p className="text-xs text-muted-foreground">Analyse Recall, Precision, and cross-family judge verdicts.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Performance tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">3A — Performance Tab</h4>
              <WhereBox color="indigo">
                <strong>Administration → AI Learning Engine</strong> → Click the <strong>"Performance"</strong> tab.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-indigo-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Daily Performance Trend</strong> shows Recall & Precision over time:</p>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <DashboardTabsMockup activeTab="Performance" />
                    <div className="mt-3 space-y-3">
                      <div className="h-32 rounded bg-muted/50 border flex items-center justify-center text-[10px] text-muted-foreground">
                        📈 Daily Avg Recall & Precision line chart — cumulative + daily lines
                        <br />Recall target: 95% · Precision target: 85%
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-20 rounded bg-muted/50 border flex items-center justify-center text-[10px] text-muted-foreground">
                          📊 Recall & Precision by Agent (bar chart)
                        </div>
                        <div className="h-20 rounded bg-muted/50 border flex items-center justify-center text-[10px] text-muted-foreground">
                          🥧 Issue Type Distribution (pie chart)
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded border bg-card text-center">
                          <Badge variant="secondary" className="text-[10px] mb-1">Synthetic</Badge>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-lg font-bold">87%</span><br /><span className="text-[10px] text-muted-foreground">Recall</span></div>
                            <div><span className="text-lg font-bold">34%</span><br /><span className="text-[10px] text-muted-foreground">Precision</span></div>
                          </div>
                        </div>
                        <div className="p-3 rounded border bg-card text-center">
                          <Badge variant="outline" className="text-[10px] mb-1">Real</Badge>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-lg font-bold">—</span><br /><span className="text-[10px] text-muted-foreground">Recall</span></div>
                            <div><span className="text-lg font-bold">—</span><br /><span className="text-[10px] text-muted-foreground">Precision</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <InfoBox variant="info">
                <strong>Production targets:</strong> Recall ≥ 95% (the AI catches every issue the human found). 
                Precision ≥ 85% (the AI's findings are genuine, not false alarms). Below 60% on Precision means the AI 
                is generating too many false alerts.
              </InfoBox>
            </div>

            <Separator />

            {/* Judge tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">3B — Judge Tab</h4>
              <WhereBox color="indigo">
                <strong>Administration → AI Learning Engine</strong> → Click the <strong>"Judge"</strong> tab.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-indigo-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Cross-family judge verdicts</strong> — GPT-5 evaluates Gemini (agent) outputs independently:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <DashboardTabsMockup activeTab="Judge" />
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "AI Correct", count: 28, variant: "default" },
                        { label: "Human Correct", count: 8, variant: "destructive" },
                        { label: "Partial", count: 18, variant: "secondary" },
                        { label: "Inconclusive", count: 2, variant: "outline" },
                      ].map((v) => (
                        <div key={v.label} className="text-center p-2 rounded border bg-card">
                          <Badge variant={v.variant as any} className="text-[10px] mb-1">{v.label}</Badge>
                          <div className="text-lg font-bold">{v.count}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded border bg-card overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead><tr className="bg-muted/50 border-b"><th className="p-1.5 text-left">Case</th><th className="p-1.5">Judge Status</th><th className="p-1.5">AI Correct</th><th className="p-1.5">Human Correct</th><th className="p-1.5">Grounded</th></tr></thead>
                        <tbody className="divide-y">
                          <tr><td className="p-1.5 font-medium">[SYN] 14 Willow Creek...</td><td className="p-1.5"><Badge variant="default" className="text-[8px]">complete</Badge></td><td className="p-1.5 font-mono">6</td><td className="p-1.5 font-mono">2</td><td className="p-1.5 font-mono">6/6</td></tr>
                          <tr><td className="p-1.5 font-medium">[SYN] 14 Hawthorn Lane...</td><td className="p-1.5"><Badge variant="default" className="text-[8px]">complete</Badge></td><td className="p-1.5 font-mono">5</td><td className="p-1.5 font-mono">2</td><td className="p-1.5 font-mono">7/7</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              <InfoBox variant="info">
                <strong>Model independence enforced:</strong> The judge model is always from a different family than the agent model, 
                preventing self-evaluation bias. Each disputed item gets an independent confidence score and evidence grounding check.
              </InfoBox>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 4: Inspect Failures & Generate Patches ── */}
        <AccordionItem value="step-4" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">4</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Inspect Failures & Generate Patches</p>
                <p className="text-xs text-muted-foreground">Identify failure patterns and create AI-generated prompt improvements.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Failures tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">4A — Failures Tab</h4>
              <WhereBox color="red">
                <strong>Administration → AI Learning Engine</strong> → Click the <strong>"Failures"</strong> tab.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-red-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Failure Type Summary</strong> shows a breakdown of all non-matching items:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <DashboardTabsMockup activeTab="Failures" />
                    <div className="rounded border bg-card overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead><tr className="bg-muted/50 border-b"><th className="p-1.5 text-left">Type</th><th className="p-1.5 text-right">Count</th><th className="p-1.5 text-right">%</th></tr></thead>
                        <tbody className="divide-y">
                          <tr><td className="p-1.5 font-medium">False Positive</td><td className="p-1.5 text-right font-mono">82</td><td className="p-1.5 text-right text-muted-foreground">78%</td></tr>
                          <tr><td className="p-1.5 font-medium">AI Missed Issue</td><td className="p-1.5 text-right font-mono">14</td><td className="p-1.5 text-right text-muted-foreground">13%</td></tr>
                          <tr><td className="p-1.5 font-medium">Severity Mismatch</td><td className="p-1.5 text-right font-mono">6</td><td className="p-1.5 text-right text-muted-foreground">6%</td></tr>
                          <tr><td className="p-1.5 font-medium">Citation Failure</td><td className="p-1.5 text-right font-mono">3</td><td className="p-1.5 text-right text-muted-foreground">3%</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-red-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>AI-Detected Recurring Patterns</strong> are shown below the summary. These are automatically refreshed after each evaluation run:</p>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="border rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-[10px]">False Positive</Badge>
                        <Badge variant="outline" className="text-[10px]">Routine Conveyancing</Badge>
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">12× occurrences</span>
                      </div>
                      <p className="text-xs">AI flagging standard conveyancing actions (insurance, boiler warranty) as material risks</p>
                      <div className="flex items-start gap-2 bg-muted/50 rounded p-2">
                        <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <p className="text-[10px]">Add exclusion criteria to prompt: distinguish between routine administrative items and substantive legal risks</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Improvements tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">4B — Improvements Tab — Generate Patches</h4>
              <WhereBox color="emerald">
                <strong>Administration → AI Learning Engine</strong> → Click the <strong>"Improvements"</strong> tab.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-emerald-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Select failure patterns</strong> using the checkboxes, then click <strong>"Generate Patches"</strong>:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <DashboardTabsMockup activeTab="Improvements" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded border bg-card">
                        <div className="w-3 h-3 rounded border-2 border-primary bg-primary" />
                        <span className="text-[10px] font-medium">Routine conveyancing false positives (12×)</span>
                        <Badge variant="destructive" className="text-[8px] ml-auto">False Positive</Badge>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded border bg-card">
                        <div className="w-3 h-3 rounded border-2 border-primary bg-primary" />
                        <span className="text-[10px] font-medium">Missing fraud-risk detection for unencumbered titles (4×)</span>
                        <Badge variant="destructive" className="text-[8px] ml-auto">AI Missed Issue</Badge>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-medium flex items-center gap-1.5">
                        <Wand2 className="h-3 w-3" /> Generate Patches (2 patterns)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-emerald-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Review generated patches</strong> — each patch includes:</p>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                      <span className="text-xs font-semibold">Example Patch Output</span>
                      <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Pending Review</Badge>
                    </div>
                    <div className="p-3 space-y-2 text-xs">
                      <div><span className="font-semibold text-muted-foreground">Title:</span> Reduce false positives on routine conveyancing items</div>
                      <div><span className="font-semibold text-muted-foreground">What failed:</span> AI flagging standard admin items as material risks (12 cases)</div>
                      <div><span className="font-semibold text-muted-foreground">Root cause:</span> Prompt doesn't distinguish between routine administrative items and substantive legal risks</div>
                      <div className="p-2 rounded bg-muted/50 border font-mono text-[11px]">
                        <span className="text-muted-foreground">Proposed instruction:</span><br />
                        "Do NOT flag routine administrative conveyancing items (e.g. arranging buildings insurance, obtaining boiler warranty certificates, standard SDLT returns) as material risks. Only flag items where there is a substantive legal, compliance, or financial risk to the client or lender."
                      </div>
                      <div><span className="font-semibold text-muted-foreground">Predicted impact:</span> <span className="text-green-600 dark:text-green-400">+15% precision improvement</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="text-xs font-semibold mb-2">📋 What happens next?</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1"><Wand2 className="h-3 w-3 text-emerald-600" /> Patches generated</div>
                  <ArrowRight className="h-3 w-3" />
                  <div className="flex items-center gap-1"><FileCode2 className="h-3 w-3 text-blue-600" /> Review in Prompt Management</div>
                  <ArrowRight className="h-3 w-3" />
                  <div className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-primary" /> Approve & deploy</div>
                  <ArrowRight className="h-3 w-3" />
                  <div className="flex items-center gap-1"><GitCompare className="h-3 w-3 text-orange-600" /> Auto-regression test</div>
                </div>
              </div>
              <InfoBox variant="warning">
                <strong>Always review patches before deploying.</strong> Generated patches are AI suggestions — a human must approve them 
                in the Prompt Management section (Step 5) before they affect live AI behaviour.
              </InfoBox>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 5: Prompt Management ── */}
        <AccordionItem value="step-5" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">5</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><FileCode2 className="h-4 w-4" /> Manage & Deploy Prompts</p>
                <p className="text-xs text-muted-foreground">Review patches, create versioned prompts, and deploy with safety checks.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Review patches */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">5A — Review Prompt Patches</h4>
              <WhereBox color="blue">
                <strong>Administration → Prompt Management</strong> in the sidebar. The <strong>"Prompt Patches"</strong> tab is shown by default.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-blue-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Find pending patches:</strong></p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex gap-1 mb-2">
                      {["Prompt Patches", "Versions"].map((t, i) => (
                        <div key={t} className={`px-3 py-1.5 rounded-md text-xs font-medium ${i === 0 ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>{t}</div>
                      ))}
                    </div>
                    {[
                      { title: "Reduce false positives on routine items", status: "Pending Review", agent: "SoW" },
                      { title: "Add unencumbered title fraud detection", status: "Approved", agent: "SoW" },
                    ].map((patch) => (
                      <div key={patch.title} className="rounded border bg-card p-2.5 flex items-center justify-between">
                        <div><div className="text-xs font-semibold">{patch.title}</div><div className="text-[10px] text-muted-foreground">Agent: {patch.agent}</div></div>
                        <Badge className={`text-[10px] ${patch.status === "Pending Review" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"}`}>{patch.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-blue-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Approve or reject</strong> each patch:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Patch: "Reduce false positives on routine items"</span>
                    <div className="flex gap-1.5">
                      <div className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium">✓ Approve</div>
                      <div className="px-3 py-1 rounded border text-xs font-medium text-muted-foreground">✗ Reject</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Deploy */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">5B — Deploy with Safety Pipeline</h4>
              <WhereBox color="blue">
                <strong>Administration → Prompt Management</strong> → <strong>"Versions"</strong> tab → Select a version → <strong>"Deploy"</strong>.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-blue-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>The 3-stage deployment safety pipeline:</strong></p>
                  <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30 flex-wrap">
                    <div className="text-center"><Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30">Deploy</Badge><p className="text-[10px] text-muted-foreground mt-1">Click deploy</p></div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <div className="text-center"><Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950/30">Auto-Verify</Badge><p className="text-[10px] text-muted-foreground mt-1">Health check</p></div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <div className="text-center"><Badge className="text-xs bg-green-600">Auto-Regression</Badge><p className="text-[10px] text-muted-foreground mt-1">Full test suite</p></div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-blue-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Advisory readiness gate</strong> checks performance targets before deployment:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded border bg-card"><div className="font-bold">Recall</div><div className="text-lg font-bold text-primary">87%</div><div className="text-[10px] text-muted-foreground">Target: ≥ 95%</div></div>
                      <div className="p-2 rounded border bg-card"><div className="font-bold">Precision</div><div className="text-lg font-bold text-amber-600">34%</div><div className="text-[10px] text-muted-foreground">Target: ≥ 85%</div></div>
                      <div className="p-2 rounded border bg-card"><div className="font-bold">Regressions</div><div className="text-lg font-bold text-green-600">0</div><div className="text-[10px] text-muted-foreground">Target: 0</div></div>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded border bg-amber-50/50 dark:bg-amber-950/20">
                      <span className="text-xs text-amber-700 dark:text-amber-400">⚠ Targets not met — deployment will proceed with override</span>
                      <div className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium">Deploy Anyway</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="C" color="bg-blue-600" />
                <div className="flex-1">
                  <p className="text-sm"><strong>After deployment:</strong> An automated health check runs a synthetic scenario to verify the prompt is functional (response length, risk keywords, latency under 120s). If the health check passes, a full regression test is automatically triggered.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="D" color="bg-blue-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Prompt changes go live automatically.</strong> Edge functions fetch the deployed version from the database at runtime — no manual publishing step is required. The new prompt takes effect immediately for all new case analyses.</p>
                  <InfoBox variant="info">
                    <strong>No preview deployment needed:</strong> Unlike frontend code changes, prompt deployments are backend changes that deploy automatically and immediately. There is no separate "publish" step.
                  </InfoBox>
                </div>
              </div>
              <InfoBox variant="info">
                <strong>Safe rollback:</strong> If you notice issues after deployment, you can instantly revert to any previous version from the Prompt Versions list.
              </InfoBox>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 6: Regression & Deployment Readiness ── */}
        <AccordionItem value="step-6" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shrink-0">
                <span className="text-lg font-bold">6</span>
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><GitCompare className="h-4 w-4" /> Regression Testing & Deployment Readiness</p>
                <p className="text-xs text-muted-foreground">Verify prompt changes don't break existing behaviour and check go-live status.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Regression tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">6A — Regression Tab</h4>
              <WhereBox color="orange">
                <strong>Administration → AI Learning Engine</strong> → Click the <strong>"Regression"</strong> tab. Or click <strong>"Regression Test"</strong> in the toolbar.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-orange-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Regression test results</strong> show the impact of prompt changes on existing cases:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <DashboardTabsMockup activeTab="Regression" />
                    <div className="rounded border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Regression Test — v4 → v5</span>
                        <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Passed ✓</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded border bg-muted/30"><div className="font-bold text-green-600">+4%</div><div className="text-[10px] text-muted-foreground">Recall</div></div>
                        <div className="p-2 rounded border bg-muted/30"><div className="font-bold text-green-600">+12%</div><div className="text-[10px] text-muted-foreground">Precision</div></div>
                        <div className="p-2 rounded border bg-muted/30"><div className="font-bold text-muted-foreground">0</div><div className="text-[10px] text-muted-foreground">Regressions</div></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <InfoBox variant="warning">
                <strong>"Regression failed"</strong> specifically means an execution failure (e.g. timeout), not a performance 
                regression. A performance regression is shown as a non-zero regressions count.
              </InfoBox>
            </div>

            <Separator />

            {/* Deployment tab */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">6B — Deployment Readiness Tab</h4>
              <WhereBox color="orange">
                <strong>Administration → AI Learning Engine</strong> → Click the <strong>"Deployment"</strong> tab.
              </WhereBox>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-orange-600" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm"><strong>Per-agent readiness checklist</strong> — deployed version, open failures, pending patches, and go/no-go:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <DashboardTabsMockup activeTab="Deployment" />
                    <div className="space-y-2">
                      {[
                        { agent: "Olimey AI (SoW)", status: "Caution", scores: "R:87% P:34%", color: "bg-amber-500", version: "v4" },
                      ].map((a) => (
                        <div key={a.agent} className="rounded border bg-card p-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${a.color}`} /><span className="text-xs font-semibold">{a.agent}</span></div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-[10px]">{a.version}</Badge>
                            <span className="text-[10px] text-muted-foreground font-mono">{a.scores}</span>
                            <Badge className={`text-[10px] ${a.status === "Ready" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}`}>{a.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border text-center border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
                  <div className="w-8 h-8 rounded-full bg-green-500 mx-auto mb-1 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-white" /></div>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400">Ready</p>
                  <p className="text-[10px] text-muted-foreground">R ≥ 95%, P ≥ 85%</p>
                </div>
                <div className="p-3 rounded-lg border text-center border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="w-8 h-8 rounded-full bg-amber-500 mx-auto mb-1 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-white" /></div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Caution</p>
                  <p className="text-[10px] text-muted-foreground">Below targets</p>
                </div>
                <div className="p-3 rounded-lg border text-center border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20">
                  <div className="w-8 h-8 rounded-full bg-red-500 mx-auto mb-1 flex items-center justify-center"><Shield className="h-4 w-4 text-white" /></div>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">Blocked</p>
                  <p className="text-[10px] text-muted-foreground">Critical failures</p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 7: Verify Live & Monitor ── */}
        <AccordionItem value="step-7" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white shrink-0">
                <Rocket className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><Rocket className="h-4 w-4" /> Verify Live & Monitor</p>
                <p className="text-xs text-muted-foreground">Confirm the deployed prompt is working in production and establish ongoing monitoring.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">7A — Confirm Live Integration</h4>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-green-600" />
                <div className="flex-1">
                  <p className="text-sm">The deployed prompt is <strong>automatically live</strong> — edge functions fetch the deployed version from the database at runtime. No manual publishing step is needed.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-green-600" />
                <div className="flex-1">
                  <p className="text-sm"><strong>Confirm by running a real case</strong> through the relevant agent and checking the output quality matches expectations from the regression test results.</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">7B — Ongoing Monitoring</h4>
              <div className="flex gap-3 items-start">
                <StepBullet letter="A" color="bg-green-600" />
                <div className="flex-1">
                  <p className="text-sm">Check the <strong>Recent Evaluations</strong> history for any anomalies in subsequent runs.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="B" color="bg-green-600" />
                <div className="flex-1">
                  <p className="text-sm">Periodically re-run <strong>Evaluate & Analyse</strong> (Step 3) to track precision/recall trends over time.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <StepBullet letter="C" color="bg-green-600" />
                <div className="flex-1">
                  <p className="text-sm">If new failure patterns emerge, repeat from <strong>Step 4</strong> (Generate Patches).</p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── STEP 8: Repeat ── */}
        <AccordionItem value="step-8" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Repeat — Continuous Improvement Cycle</p>
                <p className="text-xs text-muted-foreground">Best practices and the ongoing improvement loop.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> After Deploying Improvements</h3>
                    <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                      <li>Generate a <strong>new batch</strong> of synthetic cases targeting the same weakness areas</li>
                      <li>Ensure <strong>30+ cases per agent</strong> (mix of manual and synthetic) for meaningful results</li>
                      <li>Run <strong>"Evaluate & Analyse"</strong> — canary check runs automatically</li>
                      <li>Verify scores have <strong>improved</strong> on the Performance tab</li>
                      <li>Look for <strong>new failure patterns</strong> on the Failures tab</li>
                      <li>Address any <strong>regressions</strong> immediately</li>
                      <li>Check <strong>Deployment readiness</strong> for each agent</li>
                    </ol>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> Best Practices</h3>
                    <ul className="text-sm space-y-2 text-muted-foreground">
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Start with 10 cases per batch when exploring new issues</li>
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Weight the category mix towards known weak areas</li>
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Always let the regression test complete before deploying</li>
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Use Quick Test (15-20 cases) for fast iteration, Full Run for final validation</li>
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Use "Skip already evaluated" to avoid re-processing old cases</li>
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Focus on Precision if false positives are high; Recall if issues are missed</li>
                      <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-1" /> Failed cases are bypassed automatically — review them after the batch completes</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        {/* ── FAQ ── */}
        <AccordionItem value="faq" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-base font-semibold">Frequently Asked Questions</p>
                <p className="text-xs text-muted-foreground">Common questions about the AI Learning Engine.</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5">
            <div className="space-y-3">
              {[
                { q: "How many synthetic cases should I generate?", a: "Start with 10 cases per batch for initial exploration. Once you've identified specific weaknesses, generate 20–50 focused cases. Aim for 30+ cases per agent (mixing manual and synthetic) for meaningful evaluation results." },
                { q: "What's the difference between real and synthetic cases?", a: "Real cases use actual property documents uploaded manually via '+ New Case'. Synthetic cases use AI-generated documents with injected risks. Both are valid — synthetic cases offer scale and control, while real cases test with authentic document formats." },
                { q: "How does the cross-family judge work?", a: "When the comparison engine finds a discrepancy between the gold-standard and AI output, it sends the disputed item to a different AI model family (GPT-5 judges Gemini outputs) for independent adjudication. This prevents model-family bias." },
                { q: "What does 'Skip already evaluated' do?", a: "When checked (default), the 'Evaluate & Analyse' button excludes cases that already have comparison records, so only new/unevaluated cases are processed. Uncheck it to re-run evaluation on all matching cases." },
                { q: "What is the canary check?", a: "Before processing any cases, the system performs an instant auth probe against the comparison endpoint. If a systemic issue is detected (e.g. 401/403 auth error), the entire batch is aborted immediately with zero credit usage. This prevents wasting credits on batches that would fail entirely." },
                { q: "What happens if an individual case fails during evaluation?", a: "Failed cases are bypassed and discarded — the batch continues with all remaining cases. You'll get results from every viable case, and failed cases are clearly marked in the evaluation history. This replaces the previous behaviour where consecutive failures would stop the entire batch." },
                { q: "What happens during background evaluation?", a: "A canary check runs first, then cases are processed on the server in batches of 3 with automatic pattern analysis upon completion. You can navigate away — a notification bell icon alerts you when the run finishes. The dashboard auto-refreshes every 15 seconds." },
                { q: "What happens if a regression test fails?", a: "'Regression failed' means an execution failure (e.g. timeout), not a performance regression. Performance regressions are shown as a non-zero regressions count. Either way, review the results before deploying." },
                { q: "What is the deployment safety pipeline?", a: "When you deploy a prompt version: 1) An automated health check verifies the prompt works (response length, risk keywords, latency < 120s). 2) If the health check passes, a full regression test is automatically triggered against all benchmark cases. 3) The prompt goes live automatically — no separate publish step is needed." },
                { q: "Do I need to publish prompt changes?", a: "No. Prompt deployments are backend changes that take effect immediately and automatically. Edge functions fetch the deployed version from the database at runtime. There is no separate 'publish' step required." },
                { q: "Can I override the readiness gate?", a: "Yes. If performance targets aren't met, you can click 'Deploy Anyway' to override. Use this carefully — it's intended for urgent fixes or when you've manually verified the changes are acceptable." },
              ].map((faq, i) => (
                <Card key={i}>
                  <CardContent className="py-4 px-5">
                    <p className="text-sm font-semibold mb-1">{faq.q}</p>
                    <p className="text-sm text-muted-foreground">{faq.a}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Footer CTA */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6 text-center space-y-3">
          <h3 className="text-lg font-bold">Ready to improve your AI agents?</h3>
          <p className="text-sm text-muted-foreground">Start by generating your first batch of synthetic cases, then evaluate on the AI Learning Engine.</p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild className="gap-2">
              <Link to="/admin/synthetic-generator">
                <Dna className="h-4 w-4" />
                Generate Synthetic Cases
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/admin/benchmark-dashboard">
                <BarChart3 className="h-4 w-4" />
                Open AI Learning Engine
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (isStandalone) {
    return <div className="min-h-screen bg-background p-6 md:p-10">{content}</div>;
  }

  return <AppLayout>{content}</AppLayout>;
}

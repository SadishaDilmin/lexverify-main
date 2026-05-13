/**
 * Admin SoW Validation Workflow
 *
 * Allows admins to run selected cases through the SoF pipeline,
 * capture outputs, enter reviewer benchmarks, and compare results.
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Play, CheckCircle2, XCircle, AlertTriangle, FileText, Plus, Trash2,
  ArrowRight, Clock, BarChart3, Shield, Eye,
} from "lucide-react";
import { EXCEPTION_TYPES } from "@/lib/armalytix/exceptionEngine";
import { ENQUIRY_CATEGORIES } from "@/lib/armalytix/enquiryGenerator";
import { ISSUE_TYPE_LABELS } from "@/lib/armalytix/reviewerPolicyEngine";
import {
  FEEDBACK_TYPES,
  FEEDBACK_LABELS,
  PATHWAY_LABELS,
  type ValidationPathway,
  type ReviewerBenchmark,
  type BenchmarkIssue,
  type BenchmarkEnquiry,
  type FeedbackItem,
  type ValidationComparison,
  type ValidationFundingOverview,
  type PathwayCheck,
  emptyBenchmark,
  buildValidationComparison,
  buildFundingOverview,
  buildPathwayChecks,
  detectDataSources,
  type FeedbackType,
} from "@/lib/armalytix/validationEngine";
import type { FullAnalysisResult } from "@/lib/armalytix/contradictionDetector";
import type { AcceptedItem, UnresolvedItem } from "@/lib/armalytix/reviewerOutputBuilder";
import type { DraftEnquiry } from "@/lib/armalytix/enquiryGenerator";
import type { GovernanceOutput, SignOffDecisionSupport } from "@/lib/armalytix/reviewerPolicyEngine";

// ── Types ────────────────────────────────────────────────────────

interface CaseOption {
  id: string;
  case_reference: string;
  property_address: string;
}

interface ValidationRun {
  id: string;
  case_id: string;
  case_reference: string;
  pathway: ValidationPathway;
  status: string;
  created_at: string;
  funding_overview: ValidationFundingOverview | null;
  supported_items: AcceptedItem[];
  unresolved_items: UnresolvedItem[];
  draft_enquiries: DraftEnquiry[];
  governance_output: GovernanceOutput | null;
  sign_off_support: SignOffDecisionSupport | null;
  full_pipeline_result: FullAnalysisResult | null;
  benchmark_expected_issues: BenchmarkIssue[];
  benchmark_expected_enquiries: BenchmarkEnquiry[];
  benchmark_expected_blockers: string[];
  benchmark_adequately_supported: string[];
  benchmark_notes: string;
  comparison_result: ValidationComparison | null;
  feedback_items: FeedbackItem[];
  overall_useful: boolean | null;
  data_sources_used: string[];
}

function mapRunFromDb(row: Record<string, unknown>): ValidationRun {
  return {
    id: row.id as string,
    case_id: row.case_id as string,
    case_reference: row.case_reference as string,
    pathway: row.pathway as ValidationPathway,
    status: row.status as string,
    created_at: row.created_at as string,
    funding_overview: (row.funding_overview ?? null) as ValidationFundingOverview | null,
    supported_items: (row.supported_items ?? []) as AcceptedItem[],
    unresolved_items: (row.unresolved_items ?? []) as UnresolvedItem[],
    draft_enquiries: (row.draft_enquiries ?? []) as DraftEnquiry[],
    governance_output: (row.governance_output ?? null) as GovernanceOutput | null,
    sign_off_support: (row.sign_off_support ?? null) as SignOffDecisionSupport | null,
    full_pipeline_result: (row.full_pipeline_result ?? null) as FullAnalysisResult | null,
    benchmark_expected_issues: (row.benchmark_expected_issues ?? []) as BenchmarkIssue[],
    benchmark_expected_enquiries: (row.benchmark_expected_enquiries ?? []) as BenchmarkEnquiry[],
    benchmark_expected_blockers: (row.benchmark_expected_blockers ?? []) as string[],
    benchmark_adequately_supported: (row.benchmark_adequately_supported ?? []) as string[],
    benchmark_notes: (row.benchmark_notes ?? "") as string,
    comparison_result: (row.comparison_result ?? null) as ValidationComparison | null,
    feedback_items: (row.feedback_items ?? []) as FeedbackItem[],
    overall_useful: row.overall_useful as boolean | null,
    data_sources_used: (row.data_sources_used ?? []) as string[],
  };
}

// ── Pipeline runner helper ───────────────────────────────────────

async function fetchAndRunPipeline(caseId: string) {
  // Fetch all related data in parallel
  const [txRes, fsRes, accRes, partiesRes, balRes, evRes, incRes, reportRes] = await Promise.all([
    supabase.from("sow_transactions").select("*").eq("case_id", caseId),
    supabase.from("sow_fund_sources").select("*").eq("case_id", caseId),
    supabase.from("sow_connected_accounts").select("*").eq("case_id", caseId),
    supabase.from("case_parties").select("*").eq("case_id", caseId),
    supabase.from("sow_manual_balances").select("*").eq("case_id", caseId),
    supabase.from("sow_evidence_items").select("*").eq("case_id", caseId),
    supabase.from("sow_income_verification").select("*").eq("case_id", caseId),
    supabase.from("armalytix_reports").select("*").eq("case_id", caseId).limit(1),
  ]);

  const { runFullAnalysis } = await import("@/lib/armalytix/contradictionDetector");

  const transactions = txRes.data ?? [];
  const fundSources = fsRes.data ?? [];
  const accounts = accRes.data ?? [];
  const parties = partiesRes.data ?? [];
  const manualBalances = balRes.data ?? [];
  const evidence = evRes.data ?? [];
  const incomeVerification = incRes.data ?? [];
  const rh = (reportRes.data?.[0] ?? {}) as Record<string, unknown>;

  // Build pipeline inputs — cast at boundary since DB rows match expected shapes
  const result: FullAnalysisResult = runFullAnalysis({
    transactions: transactions.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      case_id: t.case_id as string,
      tx_date: t.tx_date as string | null,
      amount: t.amount as number | null,
      description: (t.description ?? "") as string,
      direction: (t.tx_type ?? "credit") as string,
      account_id: t.connected_account_id as string | null,
      balance_after: t.balance_after as number | null,
      counterparty: t.counterparty as string | null,
      linked_fund_source_id: t.linked_fund_source_id as string | null,
      explanation_status: t.explanation_status as string | null,
    })),
    classificationContext: {
      accounts: accounts.map((a: Record<string, unknown>) => ({
        id: a.id as string,
        account_holder_name: a.account_holder_name as string | null,
        account_currency: a.account_currency as string | null,
      })),
      parties: parties.map((p: Record<string, unknown>) => ({
        id: p.id as string,
        case_id: p.case_id as string,
        role: p.role as string | null,
        full_name: p.full_name as string | null,
        employer_name: null,
      })),
      fundSources: fundSources.map((fs: Record<string, unknown>) => ({
        id: fs.id as string,
        case_id: fs.case_id as string,
        source_category: fs.source_category as string | null,
        employer_name: fs.employer_name as string | null,
        linked_account_ids: fs.linked_account_ids as string[] | null,
      })),
    },
    matchableFundSources: fundSources.map((fs: Record<string, unknown>) => ({
      id: fs.id as string,
      case_id: fs.case_id as string,
      source_category: fs.source_category as string | null,
      employer_name: fs.employer_name as string | null,
      linked_account_ids: fs.linked_account_ids as string[] | null,
      declared_amount: fs.declared_amount as number | null,
      date_received: fs.date_received as string | null,
      donor_name: null,
    })),
    reconciliationInputs: {
      fundSources: fundSources as any[],
      manualBalances: manualBalances as any[],
      evidenceItems: evidence.map((e: Record<string, unknown>) => ({
        id: e.id as string,
        ref_table: e.ref_table as string,
        ref_id: e.ref_id as string,
        verification_status: e.verification_status as string | null,
      })),
      incomeVerifications: incomeVerification.map((iv: Record<string, unknown>) => ({
        id: iv.id as string,
        avg_salary_credit: iv.avg_salary_credit as number | null,
        salary_matched_to_bank: iv.salary_matched_to_bank as boolean | null,
        net_pay_on_payslip: iv.net_pay_on_payslip as number | null,
      })),
      parties: parties.map((p: Record<string, unknown>) => ({
        id: p.id as string,
        case_id: p.case_id as string,
        role: p.role as string | null,
        full_name: p.full_name as string | null,
        contribution_amount: p.contribution_amount as number | null,
      })),
      reportHeader: {
        mortgage_amount: (rh.mortgage_amount ?? null) as number | null,
        mortgage_lender: (rh.mortgage_lender ?? null) as string | null,
        mortgage_offer_in_place: (rh.mortgage_offer_in_place ?? null) as boolean | null,
        amount_to_prove: (rh.amount_to_prove ?? 0) as number,
        purchase_price: (rh.purchase_price ?? 0) as number,
        total_balance_available: (rh.total_balance_available ?? null) as number | null,
        excess_shortfall: (rh.excess_shortfall ?? null) as number | null,
      },
    },
    materialityContext: {
      purchasePrice: (rh.purchase_price ?? 0) as number,
      amountToProve: (rh.amount_to_prove ?? 0) as number,
      totalDeclaredFunds: fundSources.reduce(
        (sum: number, fs: Record<string, unknown>) =>
          sum + ((fs.declared_amount as number) ?? 0),
        0
      ),
    },
    contradictionCheckInputs: {
      fundSources: fundSources as any[],
      evidenceItems: evidence as any[],
      transactions: transactions as any[],
      manualBalances: manualBalances as any[],
      parties: parties as any[],
      incomeVerifications: incomeVerification as any[],
      accounts: accounts as any[],
      reportHeader: Object.keys(rh).length > 0 ? (rh as any) : null,
    },
  });

  return result;
}

// ── Main Component ───────────────────────────────────────────────

export default function AdminSoWValidation() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [pathway, setPathway] = useState<ValidationPathway>("armalytix");
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<ValidationRun[]>([]);
  const [activeRun, setActiveRun] = useState<ValidationRun | null>(null);
  const [activeTab, setActiveTab] = useState("run");
  const [benchmark, setBenchmark] = useState<ReviewerBenchmark>(emptyBenchmark());
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [overallUseful, setOverallUseful] = useState<boolean | null>(null);

  useEffect(() => {
    loadCases();
    loadRuns();
  }, []);

  async function loadCases() {
    const { data } = await supabase
      .from("cases")
      .select("id, case_reference, property_address")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setCases(data);
  }

  async function loadRuns() {
    const { data } = await supabase
      .from("sow_validation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setRuns((data as Record<string, unknown>[]).map(mapRunFromDb));
  }

  async function handleRunPipeline() {
    if (!selectedCaseId || !user) return;
    setRunning(true);
    try {
      const selectedCase = cases.find((c) => c.id === selectedCaseId);
      if (!selectedCase) throw new Error("Case not found");

      const result = await fetchAndRunPipeline(selectedCaseId);
      const fundingOverview = buildFundingOverview(result.fundingChain, result.sourceReconciliations);
      const dataSources = detectDataSources(result);

      const { data: inserted, error } = await supabase
        .from("sow_validation_runs")
        .insert({
          case_id: selectedCaseId,
          case_reference: selectedCase.case_reference,
          created_by: user.id,
          pathway,
          data_sources_used: dataSources,
          status: "completed",
          funding_overview: fundingOverview as any,
          supported_items: result.reviewerSummary.accepted as any,
          unresolved_items: result.reviewerSummary.unresolved as any,
          draft_enquiries: result.draftEnquiries as any,
          governance_output: result.decisionSupport.governance as any,
          sign_off_support: result.decisionSupport.signOff as any,
          full_pipeline_result: result as any,
        })
        .select()
        .single();

      if (error) throw error;

      const run = mapRunFromDb(inserted as Record<string, unknown>);
      setRuns((prev) => [run, ...prev]);
      setActiveRun(run);
      setActiveTab("pack");
      setBenchmark(emptyBenchmark());
      setFeedbackItems([]);
      setOverallUseful(null);
      toast.success("Validation pipeline completed successfully");
    } catch (err: unknown) {
      toast.error(`Pipeline failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleSaveBenchmark() {
    if (!activeRun) return;
    let comparison: ValidationComparison | null = null;
    if (activeRun.full_pipeline_result && benchmark.expectedIssues.length > 0) {
      comparison = buildValidationComparison(
        benchmark,
        activeRun.full_pipeline_result.exceptions ?? [],
        activeRun.draft_enquiries,
        activeRun.governance_output!
      );
    }

    const { error } = await supabase
      .from("sow_validation_runs")
      .update({
        benchmark_expected_issues: benchmark.expectedIssues as any,
        benchmark_expected_enquiries: benchmark.expectedEnquiries as any,
        benchmark_expected_blockers: benchmark.expectedBlockers as any,
        benchmark_adequately_supported: benchmark.adequatelySupported as any,
        benchmark_notes: benchmark.notes,
        comparison_result: comparison as any,
        feedback_items: feedbackItems as any,
        overall_useful: overallUseful,
      })
      .eq("id", activeRun.id);

    if (error) { toast.error("Failed to save benchmark"); return; }

    setActiveRun((prev) =>
      prev ? { ...prev, comparison_result: comparison, feedback_items: feedbackItems, overall_useful: overallUseful } : null
    );
    toast.success("Benchmark and comparison saved");
  }

  function handleSelectRun(run: ValidationRun) {
    setActiveRun(run);
    setBenchmark({
      expectedIssues: run.benchmark_expected_issues,
      expectedEnquiries: run.benchmark_expected_enquiries,
      expectedBlockers: run.benchmark_expected_blockers,
      adequatelySupported: run.benchmark_adequately_supported,
      notes: run.benchmark_notes,
    });
    setFeedbackItems(run.feedback_items);
    setOverallUseful(run.overall_useful);
    setActiveTab("pack");
  }

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">SoW Validation Workflow</h1>
            <p className="text-muted-foreground mt-1">
              Run cases through the Source of Funds pipeline and compare against reviewer expectations
            </p>
          </div>
          <Badge variant="outline" className="text-xs">Admin Only</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* History sidebar */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Validation History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {runs.length === 0 && (
                  <p className="text-xs text-muted-foreground p-4">No validation runs yet</p>
                )}
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => handleSelectRun(run)}
                    className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${activeRun?.id === run.id ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate max-w-[160px]">{run.case_reference}</span>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{PATHWAY_LABELS[run.pathway]}</Badge>
                      <span>{new Date(run.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Main content */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="run"><Play className="h-3.5 w-3.5 mr-1.5" />Run Validation</TabsTrigger>
              <TabsTrigger value="pack" disabled={!activeRun}><FileText className="h-3.5 w-3.5 mr-1.5" />Validation Pack</TabsTrigger>
              <TabsTrigger value="benchmark" disabled={!activeRun}><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Benchmark &amp; Compare</TabsTrigger>
            </TabsList>

            <TabsContent value="run">
              <Card>
                <CardHeader>
                  <CardTitle>Run Validation Pipeline</CardTitle>
                  <CardDescription>Select a case and pathway to run the full SoF analysis pipeline in validation mode</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Select Case</Label>
                      <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                        <SelectTrigger><SelectValue placeholder="Choose a case..." /></SelectTrigger>
                        <SelectContent>
                          {cases.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.case_reference} — {c.property_address}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pathway</Label>
                      <Select value={pathway} onValueChange={(v) => setPathway(v as ValidationPathway)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="armalytix">Armalytix-led</SelectItem>
                          <SelectItem value="hybrid">Mixed evidence (hybrid)</SelectItem>
                          <SelectItem value="non_armalytix">Non-Armalytix</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleRunPipeline} disabled={!selectedCaseId || running} className="w-full md:w-auto">
                    {running ? (<><Clock className="h-4 w-4 mr-2 animate-spin" />Running pipeline...</>) : (<><Play className="h-4 w-4 mr-2" />Run Validation Pipeline</>)}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pack">{activeRun && <ValidationPackView run={activeRun} />}</TabsContent>
            <TabsContent value="benchmark">
              {activeRun && (
                <BenchmarkCompareView
                  run={activeRun}
                  benchmark={benchmark}
                  setBenchmark={setBenchmark}
                  feedbackItems={feedbackItems}
                  setFeedbackItems={setFeedbackItems}
                  overallUseful={overallUseful}
                  setOverallUseful={setOverallUseful}
                  onSave={handleSaveBenchmark}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const v: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default", running: "secondary", failed: "destructive", pending: "outline",
  };
  return <Badge variant={v[status] ?? "outline"} className="text-[10px]">{status}</Badge>;
}

function MetricBox({ label, value, variant }: { label: string; value: string; variant?: "destructive" }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className={`font-semibold text-sm ${variant === "destructive" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function ValidationPackView({ run }: { run: ValidationRun }) {
  const fo = run.funding_overview;
  const gov = run.governance_output;
  const signOff = run.sign_off_support;
  const pathwayChecks: PathwayCheck[] = run.full_pipeline_result
    ? buildPathwayChecks(run.pathway, run.full_pipeline_result)
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Case Metadata</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Reference</span><p className="font-medium">{run.case_reference}</p></div>
            <div><span className="text-muted-foreground">Pathway</span><p className="font-medium">{PATHWAY_LABELS[run.pathway]}</p></div>
            <div><span className="text-muted-foreground">Run Date</span><p className="font-medium">{new Date(run.created_at).toLocaleString()}</p></div>
            <div>
              <span className="text-muted-foreground">Data Sources</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {run.data_sources_used.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {fo && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Funding Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <MetricBox label="Amount to Prove" value={`£${fo.amountToProve.toLocaleString()}`} />
              <MetricBox label="Total Evidenced" value={`£${fo.totalEvidenced.toLocaleString()}`} />
              <MetricBox label="Partially Supported" value={`£${fo.totalPartiallySupported.toLocaleString()}`} />
              <MetricBox label="Unsupported" value={`£${fo.totalUnsupported.toLocaleString()}`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
              {fo.hasShortfall && <MetricBox label="Shortfall" value={`£${fo.shortfallAmount.toLocaleString()}`} variant="destructive" />}
              {fo.hasExcess && <MetricBox label="Excess" value={`£${fo.excessAmount.toLocaleString()}`} />}
              <MetricBox label="Confidence" value={fo.overallConfidence} />
              <MetricBox label="Sources" value={String(fo.sourceCount)} />
            </div>
            <p className="text-xs text-muted-foreground mt-3">{fo.fundingChainSummary}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />Supported Items ({run.supported_items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {run.supported_items.length === 0
            ? <p className="text-sm text-muted-foreground">No items assessed as adequately supported</p>
            : <div className="space-y-2">{run.supported_items.map((item, i) => (
                <div key={i} className="text-sm p-2 rounded bg-accent/30 border border-border">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.basis}</p>
                </div>
              ))}</div>
          }
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />Unresolved Items ({run.unresolved_items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {run.unresolved_items.length === 0
            ? <p className="text-sm text-muted-foreground">No unresolved items</p>
            : <div className="space-y-2">{run.unresolved_items.map((item, i) => (
                <div key={i} className="text-sm p-2 rounded bg-destructive/5 border border-border">
                  <div className="flex items-center gap-2">
                    <p className="font-medium flex-1">{item.label}</p>
                    <Badge variant="outline" className="text-[10px]">{item.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.issueType}</p>
                </div>
              ))}</div>
          }
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Draft Enquiries ({run.draft_enquiries.length})</CardTitle></CardHeader>
        <CardContent>
          {run.draft_enquiries.length === 0
            ? <p className="text-sm text-muted-foreground">No enquiries generated</p>
            : <div className="space-y-3">{run.draft_enquiries.map((eq, i) => (
                <div key={eq.id || i} className="p-3 rounded border border-border space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={eq.mandatory === "mandatory" ? "destructive" : "secondary"} className="text-[10px]">{eq.mandatory}</Badge>
                    <Badge variant="outline" className="text-[10px]">{eq.priority}</Badge>
                    <span className="text-xs text-muted-foreground">{eq.enquiryCategory}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{eq.userFacingEnquiryText}</p>
                  {eq.suggestedEvidenceTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {eq.suggestedEvidenceTypes.map((e, j) => <Badge key={j} variant="secondary" className="text-[10px]">{e}</Badge>)}
                    </div>
                  )}
                </div>
              ))}</div>
          }
        </CardContent>
      </Card>

      {gov && signOff && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Governance &amp; Sign-off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <MetricBox label="Blocker Status" value={gov.blockerStatus} variant={gov.blockerStatus === "blocked" ? "destructive" : undefined} />
              <MetricBox label="Sign-off Position" value={signOff.position.replace(/_/g, " ")} />
              <MetricBox label="Mandatory Enquiries" value={String(signOff.mandatoryEnquiryCount)} />
              <MetricBox label="Blocker Count" value={String(signOff.blockerCount)} />
            </div>
            <p className="text-xs text-muted-foreground">{signOff.positionBasis}</p>
            {gov.blockerReasonList.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Blocker Reasons:</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                  {gov.blockerReasonList.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {pathwayChecks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />Pathway Validation Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pathwayChecks.map((check, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded border border-border">
                  {check.passed
                    ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                  <div>
                    <p className="font-medium">{check.check}</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BenchmarkCompareView({
  run, benchmark, setBenchmark, feedbackItems, setFeedbackItems, overallUseful, setOverallUseful, onSave,
}: {
  run: ValidationRun;
  benchmark: ReviewerBenchmark;
  setBenchmark: (b: ReviewerBenchmark) => void;
  feedbackItems: FeedbackItem[];
  setFeedbackItems: (f: FeedbackItem[]) => void;
  overallUseful: boolean | null;
  setOverallUseful: (v: boolean | null) => void;
  onSave: () => void;
}) {
  function addExpectedIssue() {
    setBenchmark({ ...benchmark, expectedIssues: [...benchmark.expectedIssues, { issueType: EXCEPTION_TYPES[0], severity: "medium" }] });
  }
  function removeExpectedIssue(idx: number) {
    setBenchmark({ ...benchmark, expectedIssues: benchmark.expectedIssues.filter((_, i) => i !== idx) });
  }
  function updateExpectedIssue(idx: number, field: keyof BenchmarkIssue, value: string) {
    const u = [...benchmark.expectedIssues]; u[idx] = { ...u[idx], [field]: value }; setBenchmark({ ...benchmark, expectedIssues: u });
  }
  function addExpectedEnquiry() {
    setBenchmark({ ...benchmark, expectedEnquiries: [...benchmark.expectedEnquiries, { category: ENQUIRY_CATEGORIES[0], mandatory: "mandatory" }] });
  }
  function removeExpectedEnquiry(idx: number) {
    setBenchmark({ ...benchmark, expectedEnquiries: benchmark.expectedEnquiries.filter((_, i) => i !== idx) });
  }
  function updateExpectedEnquiry(idx: number, field: keyof BenchmarkEnquiry, value: string) {
    const u = [...benchmark.expectedEnquiries]; u[idx] = { ...u[idx], [field]: value }; setBenchmark({ ...benchmark, expectedEnquiries: u });
  }
  function addExpectedBlocker() {
    setBenchmark({ ...benchmark, expectedBlockers: [...benchmark.expectedBlockers, EXCEPTION_TYPES[0]] });
  }
  function removeExpectedBlocker(idx: number) {
    setBenchmark({ ...benchmark, expectedBlockers: benchmark.expectedBlockers.filter((_, i) => i !== idx) });
  }
  function addFeedback() {
    setFeedbackItems([...feedbackItems, { id: crypto.randomUUID(), targetRef: "", targetType: "issue", feedbackType: "enquiry_correct", notes: "" }]);
  }
  function removeFeedback(idx: number) {
    setFeedbackItems(feedbackItems.filter((_, i) => i !== idx));
  }
  function updateFeedback(idx: number, field: keyof FeedbackItem, value: string) {
    const u = [...feedbackItems]; u[idx] = { ...u[idx], [field]: value } as FeedbackItem; setFeedbackItems(u);
  }

  const comparison = run.comparison_result;

  return (
    <div className="space-y-4">
      {/* Expected Issues */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Expected Issues</CardTitle>
            <Button variant="outline" size="sm" onClick={addExpectedIssue}><Plus className="h-3.5 w-3.5 mr-1" />Add Issue</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {benchmark.expectedIssues.map((issue, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={issue.issueType} onValueChange={(v) => updateExpectedIssue(i, "issueType", v)}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{EXCEPTION_TYPES.map((t) => <SelectItem key={t} value={t}>{ISSUE_TYPE_LABELS[t] ?? t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={issue.severity} onValueChange={(v) => updateExpectedIssue(i, "severity", v)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeExpectedIssue(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Expected Enquiries */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Expected Enquiries</CardTitle>
            <Button variant="outline" size="sm" onClick={addExpectedEnquiry}><Plus className="h-3.5 w-3.5 mr-1" />Add Enquiry</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {benchmark.expectedEnquiries.map((eq, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={eq.category} onValueChange={(v) => updateExpectedEnquiry(i, "category", v)}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ENQUIRY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={eq.mandatory} onValueChange={(v) => updateExpectedEnquiry(i, "mandatory", v)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">Mandatory</SelectItem>
                  <SelectItem value="discretionary">Discretionary</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeExpectedEnquiry(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Expected Blockers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Expected Blockers</CardTitle>
            <Button variant="outline" size="sm" onClick={addExpectedBlocker}><Plus className="h-3.5 w-3.5 mr-1" />Add Blocker</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {benchmark.expectedBlockers.map((blocker, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={blocker} onValueChange={(v) => { const u = [...benchmark.expectedBlockers]; u[i] = v; setBenchmark({ ...benchmark, expectedBlockers: u }); }}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{EXCEPTION_TYPES.map((t) => <SelectItem key={t} value={t}>{ISSUE_TYPE_LABELS[t] ?? t}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeExpectedBlocker(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reviewer Notes */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Reviewer Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={benchmark.notes} onChange={(e) => setBenchmark({ ...benchmark, notes: e.target.value })} placeholder="Free-text observations on tone, clarity, practical usefulness..." rows={3} />
        </CardContent>
      </Card>

      {/* Structured Feedback */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Structured Feedback</CardTitle>
            <Button variant="outline" size="sm" onClick={addFeedback}><Plus className="h-3.5 w-3.5 mr-1" />Add Feedback</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {feedbackItems.map((fb, i) => (
            <div key={fb.id} className="p-3 border border-border rounded space-y-2">
              <div className="flex items-center gap-2">
                <Select value={fb.targetType} onValueChange={(v) => updateFeedback(i, "targetType", v)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="enquiry">Enquiry</SelectItem>
                    <SelectItem value="blocker">Blocker</SelectItem>
                    <SelectItem value="overall">Overall</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={fb.feedbackType} onValueChange={(v) => updateFeedback(i, "feedbackType", v)}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FEEDBACK_TYPES.map((ft) => <SelectItem key={ft} value={ft}>{FEEDBACK_LABELS[ft]}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeFeedback(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <Input value={fb.targetRef} onChange={(e) => updateFeedback(i, "targetRef", e.target.value)} placeholder="Target reference (issue type or enquiry category)" className="text-sm" />
              <Textarea value={fb.notes} onChange={(e) => updateFeedback(i, "notes", e.target.value)} placeholder="Notes..." rows={2} className="text-sm" />
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Label className="text-sm">Overall output useful?</Label>
            <div className="flex items-center gap-2">
              <Button variant={overallUseful === true ? "default" : "outline"} size="sm" onClick={() => setOverallUseful(true)}>Yes</Button>
              <Button variant={overallUseful === false ? "destructive" : "outline"} size="sm" onClick={() => setOverallUseful(false)}>No</Button>
              {overallUseful !== null && <Button variant="ghost" size="sm" onClick={() => setOverallUseful(null)}>Clear</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={onSave} className="w-full">Save Benchmark &amp; Run Comparison</Button>

      {comparison && <ComparisonResultsView comparison={comparison} />}
    </div>
  );
}

function ComparisonResultsView({ comparison }: { comparison: ValidationComparison }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Comparison Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <MetricBox label="Match Rate" value={`${(comparison.matchRate * 100).toFixed(0)}%`} />
          <MetricBox label="Miss Rate" value={`${(comparison.missRate * 100).toFixed(0)}%`} variant={comparison.missRate > 0.2 ? "destructive" : undefined} />
          <MetricBox label="Over-call Rate" value={`${(comparison.overCallRate * 100).toFixed(0)}%`} />
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-2">Issues — {comparison.issueMatches.length} matches, {comparison.issueMisses.length} misses, {comparison.issueOverCalls.length} over-calls</h4>
          {comparison.issueMisses.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-destructive mb-1">Missed Issues:</p>
              {comparison.issueMisses.map((m, i) => <Badge key={i} variant="destructive" className="mr-1 mb-1 text-[10px]">{ISSUE_TYPE_LABELS[m.type] ?? m.type}</Badge>)}
            </div>
          )}
          {comparison.issueOverCalls.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Over-called Issues:</p>
              {comparison.issueOverCalls.map((m, i) => <Badge key={i} variant="outline" className="mr-1 mb-1 text-[10px]">{ISSUE_TYPE_LABELS[m.type] ?? m.type}</Badge>)}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-2">Enquiries — {comparison.enquiryMatches.length} matches, {comparison.enquiryMisses.length} misses, {comparison.enquiryOverCalls.length} over-calls</h4>
          {comparison.enquiryMisses.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-destructive mb-1">Missed Enquiries:</p>
              {comparison.enquiryMisses.map((m, i) => <Badge key={i} variant="destructive" className="mr-1 mb-1 text-[10px]">{m.type.replace(/_/g, " ")}</Badge>)}
            </div>
          )}
        </div>

        <Separator />

        {comparison.treatmentMismatches.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Treatment Mismatches ({comparison.treatmentMismatches.length})</h4>
            <div className="space-y-1">
              {comparison.treatmentMismatches.map((m, i) => (
                <div key={i} className="text-xs flex items-center gap-2">
                  <span className="font-medium">{m.issueType.replace(/_/g, " ")}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Expected: <strong>{m.humanExpected}</strong>, Got: <strong>{m.systemActual}</strong></span>
                </div>
              ))}
            </div>
            <Separator className="mt-3" />
          </div>
        )}

        <div>
          <h4 className="text-sm font-medium mb-2">Blockers — {comparison.blockerMatches.length} matches, {comparison.blockerMisses.length} misses, {comparison.blockerOverCalls.length} over-calls</h4>
          {comparison.blockerMisses.length > 0 && (
            <p className="text-xs font-medium text-destructive">Missed Blockers: {comparison.blockerMisses.map((b) => ISSUE_TYPE_LABELS[b] ?? b).join(", ")}</p>
          )}
          {comparison.blockerOverCalls.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground mt-1">Over-called Blockers: {comparison.blockerOverCalls.map((b) => ISSUE_TYPE_LABELS[b] ?? b).join(", ")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

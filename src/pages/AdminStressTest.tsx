import React, { useState, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, FlaskConical, BarChart3, Bug, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import stressTestCases from "@/data/wealthverify_uk_stress_test.json";

type Finding = {
  issue_type: string;
  severity: string;
  evidence: string;
  conclusion: string;
};

type Assessment = {
  risk_level: string;
  uk_legal_justification: string;
  findings: Finding[];
  funding_gap_check?: {
    total_required: number;
    total_declared: number;
    shortfall: number;
    notes: string;
  };
  funds_ledger?: Record<string, number>;
  ledger_match?: {
    match: boolean;
    score: number;
    mismatches: string[];
  };
  self_correction?: {
    initial_assessment: string;
    lsag_aligned: boolean;
    correction_reasoning: string;
    final_assessment: string;
  };
  requires_human_review?: boolean;
  raw_response?: string;
  stage1_used_fallback?: boolean;
  processing_stages?: {
    stage1_success: boolean;
    stage2_success: boolean;
  };
};

type CaseResult = {
  case_id: string;
  title: string;
  correct_assessment: string;
  agent_assessment: Assessment | null;
  match: boolean | null;
  status: "pending" | "running" | "success" | "error";
  error?: string;
  failure_types: string[];
};

type FailureGroup = {
  type: string;
  cases: { case_id: string; title: string; detail: string }[];
};

function classifyFailures(correct: any, agent: Assessment): string[] {
  const types: string[] = [];
  const correctRisk = correct.correct_assessment?.toLowerCase();
  const agentRisk = agent.risk_level?.toLowerCase();

  if (correctRisk !== agentRisk) {
    const gap = agent.funding_gap_check;
    if (gap && typeof gap.total_required === "number") {
      const expectedRequired = (correct.purchase_price || 0) + (correct.sdlt || 0) + (correct.legal_fees || 0) - (correct.mortgage_amount || 0);
      const diff = Math.abs(gap.total_required - expectedRequired);
      if (diff > 500) types.push("Math Failure");
    }

    const hasOcrInDocs = (correct.documents || []).some((d: any) =>
      /[EA3&][\d,.]/.test(d.content) || /£l/.test(d.content) || /\d\.\d{3},\d{2}/.test(d.content)
    );
    const agentDetectedOcr = (agent.findings || []).some((f: Finding) =>
      /ocr|scan|symbol|format/i.test(f.issue_type) || /ocr|scan|symbol/i.test(f.conclusion)
    );
    if (hasOcrInDocs && !agentDetectedOcr) types.push("OCR/Symbol Failure");

    const legalRegPatterns = /tax\s*avoidance|tax\s*evasion|sdlt\s*scheme|artificial\s*arrangement|sub.?sale\s*relief|criminal\s*finances\s*act|facilitat/i;
    const allFindings = (agent.findings || []).map((f: Finding) => `${f.issue_type} ${f.evidence} ${f.conclusion}`).join(" ");
    const correctGold = JSON.stringify(correct.gold_standard || correct.regulations_violated || []);
    if (legalRegPatterns.test(correctGold) && !legalRegPatterns.test(allFindings)) {
      types.push("Legal & Regulatory Risk");
    }

    const regulations = correct.regulations_violated || [];
    if (regulations.length > 0) {
      const agentJustification = (agent.uk_legal_justification || "").toLowerCase();
      const agentFindingsText = (agent.findings || []).map((f: Finding) => `${f.issue_type} ${f.conclusion}`).join(" ").toLowerCase();
      const allAgentText = agentJustification + " " + agentFindingsText;
      const missedRegs = regulations.filter((r: string) => {
        const regKey = r.split("—")[0]?.trim().toLowerCase() || r.toLowerCase();
        if (legalRegPatterns.test(r)) return false;
        return !allAgentText.includes(regKey.slice(0, 15).toLowerCase());
      });
      if (missedRegs.length > 0) types.push("UK Law Misinterpretation");
    }

    if (types.length === 0) types.push("Risk Classification Error");
  }

  return types;
}

function riskBadgeVariant(risk: string): "default" | "secondary" | "destructive" | "outline" {
  const r = risk?.toLowerCase() || "";
  if (r.includes("high")) return "destructive";
  if (r.includes("medium")) return "secondary";
  if (r.includes("low")) return "default";
  return "outline";
}

export default function AdminStressTest() {
  const { toast } = useToast();
  const [results, setResults] = useState<CaseResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const runStressTest = useCallback(async () => {
    setRunning(true);
    setProgress(0);

    const initialResults: CaseResult[] = stressTestCases.map((c: any) => ({
      case_id: c.case_id,
      title: c.title,
      correct_assessment: c.correct_assessment,
      agent_assessment: null,
      match: null,
      status: "pending" as const,
      failure_types: [],
    }));
    setResults(initialResults);

    const updated = [...initialResults];

    for (let i = 0; i < stressTestCases.length; i++) {
      const testCase = stressTestCases[i] as any;
      updated[i] = { ...updated[i], status: "running" };
      setResults([...updated]);

      try {
        const { correct_assessment, regulations_violated, gold_standard, difficulty, ...blindCase } = testCase;

        const { data, error } = await supabase.functions.invoke("stress-test-sow", {
          body: blindCase,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const assessment: Assessment = data.assessment;
        const correctRisk = testCase.correct_assessment?.toLowerCase()?.trim();
        const agentRisk = assessment.risk_level?.toLowerCase()?.trim();
        const isMatch = correctRisk === agentRisk;
        const failureTypes = isMatch ? [] : classifyFailures(testCase, assessment);

        updated[i] = {
          ...updated[i],
          status: "success",
          agent_assessment: assessment,
          match: isMatch,
          failure_types: failureTypes,
        };
      } catch (err: any) {
        updated[i] = {
          ...updated[i],
          status: "error",
          error: err.message || "Unknown error",
          match: false,
          failure_types: ["Execution Error"],
        };
      }

      setResults([...updated]);
      setProgress(((i + 1) / stressTestCases.length) * 100);

      if (i < stressTestCases.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setRunning(false);
    toast({ title: "Stress Test Complete", description: "All 10 cases evaluated (2-stage pipeline)." });
  }, [toast]);

  const completed = results.filter((r) => r.status === "success" || r.status === "error");
  const matches = results.filter((r) => r.match === true).length;
  const precision = completed.length > 0 ? matches / completed.length : 0;

  const failureGroups: FailureGroup[] = [];
  const failureMap = new Map<string, { case_id: string; title: string; detail: string }[]>();
  results.forEach((r) => {
    r.failure_types.forEach((ft) => {
      if (!failureMap.has(ft)) failureMap.set(ft, []);
      failureMap.get(ft)!.push({
        case_id: r.case_id,
        title: r.title,
        detail: r.agent_assessment?.uk_legal_justification || r.error || "—",
      });
    });
  });
  failureMap.forEach((cases, type) => failureGroups.push({ type, cases }));

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              Olimey AI Stress Test
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cycle 5 — Two-stage pipeline: Data Extractor → Risk Assessor (10 adversarial UK cases)
            </p>
          </div>
          <Button onClick={runStressTest} disabled={running} size="lg" className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : "Execute Blind Test"}
          </Button>
        </div>

        {/* Progress */}
        {running && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Progress value={progress} className="flex-1" />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {Math.round(progress)}% — {completed.length}/{stressTestCases.length}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scorecard */}
        {completed.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Precision Score</CardDescription>
                <CardTitle className="text-3xl">
                  {matches}/{completed.length}
                  <span className="text-lg text-muted-foreground ml-2">
                    ({(precision * 100).toFixed(0)}%)
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Correct Matches</CardDescription>
                <CardTitle className="text-3xl text-primary flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6" /> {matches}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Mismatches</CardDescription>
                <CardTitle className="text-3xl text-destructive flex items-center gap-2">
                  <XCircle className="h-6 w-6" /> {completed.length - matches}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Failure Categories</CardDescription>
                <CardTitle className="text-3xl text-accent-foreground flex items-center gap-2">
                  <Bug className="h-6 w-6" /> {failureGroups.length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> Case-by-Case Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Case ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="w-28">Expected</TableHead>
                      <TableHead className="w-28">Agent</TableHead>
                      <TableHead className="w-24">Result</TableHead>
                      <TableHead className="w-28">Ledger Match</TableHead>
                      <TableHead className="w-24">Pipeline</TableHead>
                      <TableHead>Failure Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <Collapsible key={r.case_id} asChild open={expandedCase === r.case_id} onOpenChange={(open) => setExpandedCase(open ? r.case_id : null)}>
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow className="cursor-pointer hover:bg-muted/50">
                              <TableCell className="font-mono text-xs">{r.case_id}</TableCell>
                              <TableCell className="font-medium text-sm max-w-[200px] truncate">{r.title}</TableCell>
                              <TableCell>
                                <Badge variant={riskBadgeVariant(r.correct_assessment)}>{r.correct_assessment}</Badge>
                              </TableCell>
                              <TableCell>
                                {r.status === "running" ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : r.status === "pending" ? (
                                  <span className="text-muted-foreground text-xs">—</span>
                                ) : r.agent_assessment ? (
                                  <Badge variant={riskBadgeVariant(r.agent_assessment.risk_level)}>
                                    {r.agent_assessment.risk_level}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Error</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {r.match === true && <CheckCircle2 className="h-5 w-5 text-primary" />}
                                {r.match === false && <XCircle className="h-5 w-5 text-destructive" />}
                                {r.match === null && <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell>
                                {r.agent_assessment?.ledger_match ? (
                                  <Badge variant={r.agent_assessment.ledger_match.match ? "default" : "destructive"} className="text-xs">
                                    {r.agent_assessment.ledger_match.score}%
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {r.agent_assessment?.processing_stages ? (
                                  <div className="flex items-center gap-1">
                                    <Layers className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs">
                                      {r.agent_assessment.processing_stages.stage1_success ? "✓" : "✗"}
                                      {r.agent_assessment.processing_stages.stage2_success ? "✓" : "✗"}
                                    </span>
                                  </div>
                                ) : r.status === "running" ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  {r.failure_types.map((ft) => (
                                    <Badge key={ft} variant="outline" className="text-xs">
                                      {ft}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          <CollapsibleContent asChild>
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30 p-4">
                                {r.agent_assessment ? (
                                  <div className="space-y-3">
                                    {r.agent_assessment.stage1_used_fallback && (
                                      <div className="bg-accent/20 border border-accent/40 rounded p-2 text-sm text-accent-foreground flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" /> Stage 1 used deterministic fallback (AI extraction failed)
                                      </div>
                                    )}
                                    {r.agent_assessment.requires_human_review && (
                                      <div className="bg-destructive/10 border border-destructive/30 rounded p-2 text-sm font-medium text-destructive flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" /> Flagged for Human Review
                                      </div>
                                    )}
                                    {r.agent_assessment.self_correction && (
                                      <div>
                                        <h4 className="font-semibold text-sm mb-1">CoT Self-Correction</h4>
                                        <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/20">
                                          <div>Initial: <Badge variant={riskBadgeVariant(r.agent_assessment.self_correction.initial_assessment)} className="text-xs">{r.agent_assessment.self_correction.initial_assessment}</Badge> → Final: <Badge variant={riskBadgeVariant(r.agent_assessment.self_correction.final_assessment)} className="text-xs">{r.agent_assessment.self_correction.final_assessment}</Badge></div>
                                          <div className="mt-1">LSAG Aligned: {r.agent_assessment.self_correction.lsag_aligned ? "✓ Yes" : "✗ No"}</div>
                                          <p className="mt-1">{r.agent_assessment.self_correction.correction_reasoning}</p>
                                        </div>
                                      </div>
                                    )}
                                    {/* AI Ledger */}
                                    {r.agent_assessment.funds_ledger && (
                                      <div>
                                        <h4 className="font-semibold text-sm mb-1">AI-Extracted Ledger</h4>
                                        <div className="grid grid-cols-4 gap-2 text-xs border rounded p-2 bg-muted/20">
                                          {Object.entries(r.agent_assessment.funds_ledger).map(([k, v]) => (
                                            <div key={k}>
                                              <span className="text-muted-foreground">{k}:</span> £{(v as number)?.toLocaleString() || 0}
                                            </div>
                                          ))}
                                        </div>
                                        {r.agent_assessment.ledger_match?.mismatches?.length > 0 && (
                                          <div className="mt-1 text-xs text-destructive">
                                            Mismatches: {r.agent_assessment.ledger_match.mismatches.join("; ")}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="font-semibold text-sm mb-1">UK Legal Justification</h4>
                                      <p className="text-sm text-muted-foreground">{r.agent_assessment.uk_legal_justification}</p>
                                    </div>
                                    {r.agent_assessment.funding_gap_check && (
                                      <div>
                                        <h4 className="font-semibold text-sm mb-1">Funding Gap Check</h4>
                                        <div className="grid grid-cols-3 gap-2 text-sm">
                                          <div>Required: £{r.agent_assessment.funding_gap_check.total_required?.toLocaleString()}</div>
                                          <div>Declared: £{r.agent_assessment.funding_gap_check.total_declared?.toLocaleString()}</div>
                                          <div>Shortfall: £{r.agent_assessment.funding_gap_check.shortfall?.toLocaleString()}</div>
                                        </div>
                                        {r.agent_assessment.funding_gap_check.notes && (
                                          <p className="text-xs text-muted-foreground mt-1">{r.agent_assessment.funding_gap_check.notes}</p>
                                        )}
                                      </div>
                                    )}
                                    {r.agent_assessment.findings?.length > 0 && (
                                      <div>
                                        <h4 className="font-semibold text-sm mb-1">Findings ({r.agent_assessment.findings.length})</h4>
                                        <div className="space-y-2">
                                          {r.agent_assessment.findings.map((f, idx) => (
                                            <div key={idx} className="border rounded p-2 text-sm">
                                              <div className="flex items-center gap-2 mb-1">
                                                <Badge variant={riskBadgeVariant(f.severity)} className="text-xs">{f.severity}</Badge>
                                                <span className="font-medium">{f.issue_type}</span>
                                              </div>
                                              <p className="text-muted-foreground text-xs">{f.conclusion}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : r.error ? (
                                  <p className="text-sm text-destructive">{r.error}</p>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Failure Log */}
        {failureGroups.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Failure Log — Grouped by Type
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {failureGroups.map((group) => (
                <div key={group.type} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="destructive">{group.type}</Badge>
                    <span className="text-sm text-muted-foreground">{group.cases.length} case(s)</span>
                  </div>
                  <div className="space-y-2">
                    {group.cases.map((c) => (
                      <div key={c.case_id} className="flex items-start gap-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{c.case_id}</span>
                        <div>
                          <span className="font-medium">{c.title}</span>
                          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{c.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {results.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold text-lg mb-1">Ready to Stress Test</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Cycle 5: Two-stage pipeline with JSON repair and deterministic override.
                Click "Execute Blind Test" to run all 10 adversarial cases.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * AdminSoWFlowTest — diagnostics-only page that exercises the SoW end-to-end
 * flow (RAG + streaming + consolidation) without spending credits or writing
 * any production data. Admin-only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Loader2, Play, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CaseOption {
  id: string;
  case_reference: string | null;
  property_address: string | null;
}

interface StageResult {
  ok: boolean;
  durationMs: number;
  details: Record<string, unknown>;
  error?: string;
}

interface ProbeReport {
  caseId: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  passed: boolean;
  stages: {
    rag: StageResult;
    stream: StageResult;
    consolidation: StageResult;
  };
}

const AdminSoWFlowTest = () => {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [casesLoading, setCasesLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ProbeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCasesLoading(true);
      const { data, error: err } = await supabase
        .from("cases")
        .select("id, case_reference, property_address")
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (err) {
        toast({
          title: "Failed to load cases",
          description: err.message,
          variant: "destructive",
        });
      } else {
        setCases((data as CaseOption[]) ?? []);
      }
      setCasesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const runProbe = async () => {
    if (!selectedCaseId) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "sow-flow-probe",
        { body: { caseId: selectedCaseId } },
      );
      if (invokeErr) {
        throw new Error(invokeErr.message);
      }
      if (!data || typeof data !== "object" || !("stages" in data)) {
        throw new Error("Probe returned an unexpected payload");
      }
      setReport(data as ProbeReport);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast({
        title: "Probe failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const copyJson = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast({ title: "Copied", description: "Report JSON copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const selectedLabel = useMemo(() => {
    const c = cases.find((x) => x.id === selectedCaseId);
    if (!c) return "";
    return c.case_reference ?? c.property_address ?? c.id;
  }, [cases, selectedCaseId]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to admin
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            SoW Flow Diagnostics
          </h1>
          <p className="mt-2 text-muted-foreground">
            Exercises the real RAG, streaming, and consolidation paths for the
            Source of Wealth agent. Does not deduct credits, does not write
            reports, does not invoke chunk workers.
          </p>
        </header>

        <Card className="mb-6 border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Admin only.</span>{" "}
              This probe makes one short Flash-Lite call and one Pro
              consolidation-style call. It is rate-limited to one run per 30
              seconds. Use it to time the consolidation window, not to validate
              report quality.
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Run probe</CardTitle>
            <CardDescription>
              Pick a case, then run the three-stage diagnostic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={selectedCaseId}
                onValueChange={setSelectedCaseId}
                disabled={casesLoading || running}
              >
                <SelectTrigger className="sm:w-[420px]">
                  <SelectValue
                    placeholder={
                      casesLoading ? "Loading cases…" : "Select a case"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.case_reference ?? "(no ref)"} —{" "}
                      {c.property_address ?? "Unspecified property"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={runProbe}
                disabled={!selectedCaseId || running}
                className="gap-2"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run E2E Flow Test
                  </>
                )}
              </Button>
            </div>
            {selectedLabel && (
              <p className="text-xs text-muted-foreground">
                Target: <span className="font-mono">{selectedLabel}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            <Card className="mb-6">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Result
                    <Badge
                      variant={report.passed ? "default" : "destructive"}
                      className="uppercase"
                    >
                      {report.passed ? "passed" : "failed"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Total {report.totalDurationMs.toLocaleString()} ms ·{" "}
                    {new Date(report.startedAt).toLocaleTimeString()} →{" "}
                    {new Date(report.completedAt).toLocaleTimeString()}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyJson}
                  className="gap-1.5"
                >
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <StageRow name="RAG retrieval" stage={report.stages.rag} />
                <StageRow name="Streaming (Flash-Lite)" stage={report.stages.stream} />
                <StageRow
                  name="Consolidation (Pro)"
                  stage={report.stages.consolidation}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw report</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/40 p-4 text-xs">
                  {JSON.stringify(report, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

const StageRow = ({ name, stage }: { name: string; stage: StageResult }) => (
  <div className="rounded-md border p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium">{name}</span>
        <Badge variant={stage.ok ? "secondary" : "destructive"}>
          {stage.ok ? "ok" : "fail"}
        </Badge>
      </div>
      <span className="font-mono text-sm text-muted-foreground">
        {stage.durationMs.toLocaleString()} ms
      </span>
    </div>
    {stage.error && (
      <p className="mt-2 text-sm text-destructive">{stage.error}</p>
    )}
    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
      {Object.entries(stage.details).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-dashed py-1">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-mono">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  </div>
);

const formatValue = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return v.toLocaleString();
  if (Array.isArray(v)) return v.length === 0 ? "[]" : JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default AdminSoWFlowTest;

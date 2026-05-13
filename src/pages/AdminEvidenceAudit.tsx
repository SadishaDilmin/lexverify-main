/**
 * Admin "Evidence capture audit" panel.
 *
 * Diagnostic surface that shows, per recent ai_report, whether the agent run
 * persisted any per-item evidence_references. Built in response to the
 * ceaee15d-… case where the LSAG drilldown was empty because no citations had
 * been written, with no way to spot the gap from the admin side.
 *
 * Read-only. Does NOT retry runs, regenerate reports, or back-fill evidence.
 * Joins ai_reports → cases → evidence_references via Supabase, then enriches
 * with optional sow_assessment_completed audit events and operational run
 * snapshots keyed on ai_run_id.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Info, ExternalLink, Copy, FileText, Activity,
  AlertTriangle, CheckCircle2, ShieldAlert, Loader2,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────────────────── */

type EvidenceStatus = "empty" | "low" | "healthy";

interface ReportRow {
  id: string;
  case_id: string;
  ai_run_id: string | null;
  version: number;
  created_at: string;
  modified_at: string | null;
  modification_count: number | null;
  internal_report: string | null;
  client_report: string | null;
  draft_email: string | null;
  case_reference: string;
  property_address: string | null;
  evidence_count: number;
  evidence_status: EvidenceStatus;
  has_lsag_section: boolean;
  internal_len: number;
}

interface AuditEventLite {
  id: string;
  event_type: string;
  created_at: string;
  metadata: any;
  case_reference: string;
}

interface RunSnapshotLite {
  id: string;
  ai_run_id: string;
  readiness_state: string | null;
  blocking_issues: any;
  findings_summary: any;
  created_at: string;
}

interface EvidenceRefLite {
  id: string;
  section_heading: string;
  item_label: string | null;
  document_name: string | null;
  page_number: number | null;
  relationship_type: string | null;
  confidence_score: number | null;
  created_at: string;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const WINDOW_HOURS: Record<string, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

function statusForCount(n: number): EvidenceStatus {
  if (n === 0) return "empty";
  if (n < 5) return "low";
  return "healthy";
}

const STATUS_META: Record<EvidenceStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  empty:   { label: "Empty",   cls: "border-destructive/40 bg-destructive/10 text-destructive",   icon: ShieldAlert },
  low:     { label: "Low",     cls: "border-risk-amber/40 bg-risk-amber/10 text-risk-amber",       icon: AlertTriangle },
  healthy: { label: "Healthy", cls: "border-risk-green/40 bg-risk-green/10 text-risk-green",       icon: CheckCircle2 },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function AdminEvidenceAudit() {
  const { role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin" || role === "super_admin";

  const [windowKey, setWindowKey] = useState<keyof typeof WINDOW_HOURS>("7d");
  const [statusFilter, setStatusFilter] = useState<"all" | EvidenceStatus>("all");
  const [search, setSearch] = useState("");
  const [activeRow, setActiveRow] = useState<ReportRow | null>(null);

  const windowStartIso = useMemo(() => {
    const d = new Date(Date.now() - WINDOW_HOURS[windowKey] * 60 * 60 * 1000);
    return d.toISOString();
  }, [windowKey]);

  /* ----- Main query: ai_reports + cases + evidence_references ids ----- */

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["evidence-audit", windowStartIso],
    enabled: isAdmin,
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from("ai_reports")
        .select(`
          id, case_id, ai_run_id, version, created_at, modified_at, modification_count,
          internal_report, client_report, draft_email,
          cases:cases!inner ( case_reference, property_address ),
          evidence_references ( id )
        `)
        .gte("created_at", windowStartIso)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).map((r: any) => {
        const evCount = Array.isArray(r.evidence_references) ? r.evidence_references.length : 0;
        const ir: string = r.internal_report || "";
        return {
          id: r.id,
          case_id: r.case_id,
          ai_run_id: r.ai_run_id,
          version: r.version,
          created_at: r.created_at,
          modified_at: r.modified_at,
          modification_count: r.modification_count,
          internal_report: r.internal_report,
          client_report: r.client_report,
          draft_email: r.draft_email,
          case_reference: r.cases?.case_reference ?? "—",
          property_address: r.cases?.property_address ?? null,
          evidence_count: evCount,
          evidence_status: statusForCount(evCount),
          has_lsag_section: /lsag/i.test(ir),
          internal_len: ir.length,
        };
      });
    },
  });

  /* ----- Page-scoped enrichment queries (one each, not per row) ----- */

  const caseRefs = useMemo(
    () => Array.from(new Set(rows.map((r) => r.case_reference).filter((x) => x !== "—"))),
    [rows],
  );
  const aiRunIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ai_run_id).filter((x): x is string => !!x))),
    [rows],
  );

  const { data: auditEvents = [] } = useQuery({
    queryKey: ["evidence-audit-events", caseRefs.sort().join(",")],
    enabled: isAdmin && caseRefs.length > 0,
    queryFn: async (): Promise<AuditEventLite[]> => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, event_type, created_at, metadata, case_reference")
        .in("case_reference", caseRefs)
        .eq("event_type", "sow_assessment_completed")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as AuditEventLite[];
    },
  });

  const { data: runSnapshots = [] } = useQuery({
    queryKey: ["evidence-audit-snapshots", aiRunIds.sort().join(",")],
    enabled: isAdmin && aiRunIds.length > 0,
    queryFn: async (): Promise<RunSnapshotLite[]> => {
      const { data, error } = await supabase
        .from("operational_run_snapshots")
        .select("id, ai_run_id, readiness_state, blocking_issues, findings_summary, created_at")
        .in("ai_run_id", aiRunIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as RunSnapshotLite[];
    },
  });

  const lastEventByCaseRef = useMemo(() => {
    const m = new Map<string, AuditEventLite>();
    for (const ev of auditEvents) {
      if (!m.has(ev.case_reference)) m.set(ev.case_reference, ev);
    }
    return m;
  }, [auditEvents]);

  const snapshotByRunId = useMemo(() => {
    const m = new Map<string, RunSnapshotLite>();
    for (const s of runSnapshots) {
      if (s.ai_run_id && !m.has(s.ai_run_id)) m.set(s.ai_run_id, s);
    }
    return m;
  }, [runSnapshots]);

  /* ----- Filtering & summary stats ----- */

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.evidence_status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.case_reference.toLowerCase().includes(q) ||
        r.case_id.toLowerCase().includes(q) ||
        (r.property_address || "").toLowerCase().includes(q) ||
        (r.ai_run_id || "").toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const empty = rows.filter((r) => r.evidence_status === "empty").length;
    const low = rows.filter((r) => r.evidence_status === "low").length;
    const healthy = rows.filter((r) => r.evidence_status === "healthy").length;
    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
    return { total, empty, low, healthy, emptyPct: pct(empty), lowPct: pct(low), healthyPct: pct(healthy) };
  }, [rows]);

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Admin access required.
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Activity size={18} className="text-accent" />
              Evidence capture audit
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per-report diagnostic showing which agent runs persisted evidence_references and which did not.
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Info size={14} /> How to read this
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[420px] text-xs space-y-2 p-4">
              <p className="font-semibold text-sm">Reading the panel</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li><span className="text-foreground font-medium">Empty</span> — agent run did not persist any citations. Per-item LSAG drilldown will be blank for this case.</li>
                <li><span className="text-foreground font-medium">Low</span> — fewer than 5 evidence rows captured. Likely a partial run or thin source documents.</li>
                <li><span className="text-foreground font-medium">Healthy</span> — 5+ evidence rows captured. Drilldown UI will populate.</li>
              </ul>
              <p className="text-muted-foreground italic pt-1">
                This panel surfaces persisted state. It does not confirm whether the agent had documents to cite or whether persistence failed silently. Use the run snapshot + audit event in the drawer plus the <code className="text-foreground">ai_run_id</code> against edge function logs to distinguish.
              </p>
            </PopoverContent>
          </Popover>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Reports in window" value={stats.total} />
          <SummaryCard label="Empty" value={`${stats.empty} (${stats.emptyPct}%)`} tone="empty" />
          <SummaryCard label="Low" value={`${stats.low} (${stats.lowPct}%)`} tone="low" />
          <SummaryCard label="Healthy" value={`${stats.healthy} (${stats.healthyPct}%)`} tone="healthy" />
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <Select value={windowKey} onValueChange={(v) => setWindowKey(v as any)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="empty">Empty only</SelectItem>
                <SelectItem value="low">Low only</SelectItem>
                <SelectItem value="healthy">Healthy only</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search case ref, case id, address, run id…"
                className="pl-8 h-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              Reports ({filteredRows.length}{filteredRows.length !== rows.length ? ` of ${rows.length}` : ""})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading reports…
              </div>
            ) : isError ? (
              <div className="p-8 text-center text-sm text-destructive">
                Failed to load: {(error as Error)?.message || "unknown error"}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No reports match the current filters.
              </div>
            ) : (
              <ScrollArea className="max-h-[calc(100vh-380px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Case</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead className="w-[110px]">Generated</TableHead>
                      <TableHead className="w-[80px]">Ver</TableHead>
                      <TableHead className="w-[110px]">Body length</TableHead>
                      <TableHead className="w-[120px]">Evidence</TableHead>
                      <TableHead className="w-[100px]">LSAG?</TableHead>
                      <TableHead className="w-[90px]">Edits</TableHead>
                      <TableHead className="w-[90px]">Audit</TableHead>
                      <TableHead className="w-[160px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r) => {
                      const meta = STATUS_META[r.evidence_status];
                      const StatusIcon = meta.icon;
                      const ev = lastEventByCaseRef.get(r.case_reference);
                      return (
                        <TableRow key={r.id} className="text-xs">
                          <TableCell className="font-mono">{r.case_reference}</TableCell>
                          <TableCell className="text-muted-foreground truncate max-w-[260px]">
                            {r.property_address || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                          <TableCell>v{r.version}</TableCell>
                          <TableCell className="text-muted-foreground">{r.internal_len.toLocaleString()} ch</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                              <StatusIcon size={10} />
                              {r.evidence_count} · {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {r.has_lsag_section
                              ? <Badge variant="outline" className="text-[10px]">Yes</Badge>
                              : <Badge variant="outline" className="text-[10px] border-dashed text-muted-foreground">No</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.modification_count ?? 0}</TableCell>
                          <TableCell className="text-muted-foreground">{ev ? "✓" : "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <Button
                                variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs"
                                onClick={() => setActiveRow(r)}
                              >
                                <FileText size={11} /> View
                              </Button>
                              <Button
                                variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs"
                                asChild
                              >
                                <Link to={`/agent/source-of-wealth?caseId=${r.case_id}`}>
                                  <ExternalLink size={11} />
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail drawer */}
      <DetailDrawer
        row={activeRow}
        onOpenChange={(open) => { if (!open) setActiveRow(null); }}
        auditEvent={activeRow ? lastEventByCaseRef.get(activeRow.case_reference) : undefined}
        runSnapshot={activeRow?.ai_run_id ? snapshotByRunId.get(activeRow.ai_run_id) : undefined}
        onCopy={copy}
      />
    </AppLayout>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function SummaryCard({
  label, value, tone,
}: { label: string; value: string | number; tone?: EvidenceStatus }) {
  const cls = tone ? STATUS_META[tone].cls : "border-border bg-muted/30 text-foreground";
  return (
    <Card className={`border ${cls}`}>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
        <p className="text-lg font-semibold mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}

interface DetailDrawerProps {
  row: ReportRow | null;
  onOpenChange: (open: boolean) => void;
  auditEvent?: AuditEventLite;
  runSnapshot?: RunSnapshotLite;
  onCopy: (text: string, label?: string) => void;
}

function DetailDrawer({ row, onOpenChange, auditEvent, runSnapshot, onCopy }: DetailDrawerProps) {
  const open = !!row;

  /* Per-row evidence_references fetch — only when drawer is open. */
  const { data: evidenceRefs = [], isLoading: refsLoading } = useQuery({
    queryKey: ["evidence-audit-refs", row?.id],
    enabled: !!row,
    queryFn: async (): Promise<EvidenceRefLite[]> => {
      const { data, error } = await supabase
        .from("evidence_references")
        .select("id, section_heading, item_label, document_name, page_number, relationship_type, confidence_score, created_at")
        .eq("ai_report_id", row!.id)
        .order("section_heading")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as EvidenceRefLite[];
    },
  });

  if (!row) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const meta = STATUS_META[row.evidence_status];
  const bundle = JSON.stringify({
    case_id: row.case_id,
    case_reference: row.case_reference,
    ai_report_id: row.id,
    ai_run_id: row.ai_run_id,
    version: row.version,
    evidence_count: row.evidence_count,
    evidence_status: row.evidence_status,
    has_lsag_section: row.has_lsag_section,
    audit_event_id: auditEvent?.id ?? null,
    run_snapshot_id: runSnapshot?.id ?? null,
    generated_at: row.created_at,
  }, null, 2);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <SheetTitle className="text-base font-mono">{row.case_reference}</SheetTitle>
              <SheetDescription className="text-xs">
                {row.property_address || "—"}
              </SheetDescription>
            </div>
            <Badge variant="outline" className={meta.cls}>
              {row.evidence_count} · {meta.label}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
              onClick={() => onCopy(row.id, "ai_report_id copied")}>
              <Copy size={11} /> ai_report_id
            </Button>
            {row.ai_run_id && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                onClick={() => onCopy(row.ai_run_id!, "ai_run_id copied")}>
                <Copy size={11} /> ai_run_id
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
              onClick={() => onCopy(bundle, "Diagnostic bundle copied")}>
              <Copy size={11} /> Diagnostic bundle
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
              <Link to={`/agent/source-of-wealth?caseId=${row.case_id}`}>
                <ExternalLink size={11} /> Open case
              </Link>
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-4">
          <Tabs defaultValue="run">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="run" className="text-xs">Run inputs/outputs</TabsTrigger>
              <TabsTrigger value="internal" className="text-xs">Internal</TabsTrigger>
              <TabsTrigger value="client" className="text-xs">Client</TabsTrigger>
              <TabsTrigger value="email" className="text-xs">Email</TabsTrigger>
            </TabsList>

            <TabsContent value="run" className="space-y-3 mt-3">
              <Section title="Audit event (sow_assessment_completed)">
                {auditEvent ? (
                  <KeyValueBlock
                    rows={[
                      ["Event ID", auditEvent.id],
                      ["Recorded at", formatDate(auditEvent.created_at)],
                      ["Case reference", auditEvent.case_reference],
                    ]}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    No <code>sow_assessment_completed</code> event found for this case in the loaded window.
                  </p>
                )}
                {auditEvent?.metadata && (
                  <pre className="mt-2 text-[10px] bg-muted/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(auditEvent.metadata, null, 2)}
                  </pre>
                )}
              </Section>

              <Section title="Operational run snapshot">
                {runSnapshot ? (
                  <>
                    <KeyValueBlock
                      rows={[
                        ["Snapshot ID", runSnapshot.id],
                        ["Recorded at", formatDate(runSnapshot.created_at)],
                        ["Readiness state", runSnapshot.readiness_state || "—"],
                      ]}
                    />
                    {runSnapshot.blocking_issues && (
                      <details className="mt-2">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer">Blocking issues</summary>
                        <pre className="mt-1 text-[10px] bg-muted/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(runSnapshot.blocking_issues, null, 2)}
                        </pre>
                      </details>
                    )}
                    {runSnapshot.findings_summary && (
                      <details className="mt-2">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer">Findings summary</summary>
                        <pre className="mt-1 text-[10px] bg-muted/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(runSnapshot.findings_summary, null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    No <code>operational_run_snapshots</code> row keyed on this <code>ai_run_id</code>.
                  </p>
                )}
              </Section>

              <Section title={`Persisted evidence_references (${evidenceRefs.length})`}>
                {refsLoading ? (
                  <p className="text-[11px] text-muted-foreground italic">Loading…</p>
                ) : evidenceRefs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    No evidence rows persisted for this report. The drilldown UI in the case workspace will be empty for every LSAG tile.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[260px] overflow-y-auto">
                    {evidenceRefs.map((e) => (
                      <div key={e.id} className="text-[11px] border border-border rounded-md p-2 bg-card">
                        <p className="font-medium text-foreground truncate">{e.section_heading}</p>
                        <p className="text-muted-foreground">
                          {e.item_label || "—"} {e.document_name ? `· ${e.document_name}` : ""}
                          {e.page_number != null ? ` · p.${e.page_number}` : ""}
                          {e.confidence_score != null ? ` · ${Math.round(e.confidence_score * 100)}%` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="internal" className="mt-3">
              <ReportTextBlock text={row.internal_report} />
            </TabsContent>
            <TabsContent value="client" className="mt-3">
              <ReportTextBlock text={row.client_report} />
            </TabsContent>
            <TabsContent value="email" className="mt-3">
              <ReportTextBlock text={row.draft_email} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function KeyValueBlock({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] space-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{k}</span>
          <span className="text-foreground font-medium font-mono truncate ml-3">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ReportTextBlock({ text }: { text: string | null }) {
  if (!text) {
    return (
      <p className="text-[11px] text-muted-foreground italic p-3 border border-dashed border-border rounded-md">
        No content stored for this field.
      </p>
    );
  }
  return (
    <pre className="text-[11px] leading-relaxed bg-muted/30 rounded-md p-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}

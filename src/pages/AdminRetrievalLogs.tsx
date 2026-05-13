import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { Search, Database, Clock, AlertTriangle, Layers, Activity, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface RetrievalLog {
  id: string;
  agent_id: string;
  query_text: string;
  knowledge_bases_queried: string[];
  retrieval_tier: number;
  total_chunks_scanned: number;
  top_similarity: number | null;
  latency_ms: number | null;
  fallback_used: boolean;
  documents_retrieved: any;
  case_id: string | null;
  user_id: string | null;
  metadata: any;
  created_at: string;
}

export default function AdminRetrievalLogs() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<RetrievalLog | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["retrieval-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retrieval_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as RetrievalLog[];
    },
    enabled: role === "admin",
  });

  const filteredLogs = logs.filter((log) => {
    if (agentFilter !== "all" && log.agent_id !== agentFilter) return false;
    if (tierFilter !== "all" && String(log.retrieval_tier) !== tierFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.agent_id.toLowerCase().includes(q) ||
        log.query_text.toLowerCase().includes(q) ||
        log.knowledge_bases_queried.some((kb) => kb.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const uniqueAgents = [...new Set(logs.map((l) => l.agent_id))].sort();

  // Stats
  const avgLatency = logs.length
    ? Math.round(logs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / logs.length)
    : 0;
  const fallbackCount = logs.filter((l) => l.fallback_used).length;
  const logsWithSim = logs
    .map((l) => (l.top_similarity != null ? Number(l.top_similarity) : NaN))
    .filter((v) => !isNaN(v));
  const avgSimilarity = logsWithSim.length
    ? (logsWithSim.reduce((sum, v) => sum + v, 0) / logsWithSim.length).toFixed(3)
    : "—";

  const { toast } = useToast();

  const exportCsv = () => {
    if (filteredLogs.length === 0) {
      toast({ title: "No data", description: "No logs to export.", variant: "destructive" });
      return;
    }
    const headers = ["Timestamp","Agent","Query","Knowledge Bases","Tier","Chunks Scanned","Top Similarity","Latency (ms)","Fallback Used","Case ID","User ID","Documents Retrieved"];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filteredLogs.map((l) => [
      format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss"),
      l.agent_id,
      escape(l.query_text),
      l.knowledge_bases_queried.join("; "),
      l.retrieval_tier,
      l.total_chunks_scanned,
      l.top_similarity != null ? Number(l.top_similarity).toFixed(4) : "",
      l.latency_ms ?? "",
      l.fallback_used ? "Yes" : "No",
      l.case_id ?? "",
      l.user_id ?? "",
      escape(JSON.stringify(l.documents_retrieved)),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `retrieval-logs-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filteredLogs.length} logs exported to CSV.` });
  };

  if (role !== "admin") {
    return (
      <AppLayout>
        <p className="text-muted-foreground">Admin access required.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity size={24} className="text-primary" />
              Retrieval Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              RAG audit trail — every knowledge retrieval is logged for insurer-defensibility.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download size={14} />
            Export CSV
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Database} label="Total Retrievals" value={logs.length} />
          <StatCard icon={Clock} label="Avg Latency" value={`${avgLatency}ms`} />
          <StatCard icon={AlertTriangle} label="Fallback Used" value={fallbackCount} highlight={fallbackCount > 0} />
          <StatCard icon={Layers} label="Avg Similarity" value={avgSimilarity} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search query text, agent, or KB…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {uniqueAgents.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="1">Tier 1</SelectItem>
              <SelectItem value="2">Tier 2</SelectItem>
              <SelectItem value="3">Tier 3</SelectItem>
              <SelectItem value="4">Tier 4 (Fallback)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Knowledge Bases</TableHead>
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-center">Chunks</TableHead>
                  <TableHead className="text-center">Top Sim</TableHead>
                  <TableHead className="text-center">Latency</TableHead>
                  <TableHead className="text-center">Fallback</TableHead>
                  <TableHead className="text-center">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      No retrieval logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">{log.agent_id}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {log.knowledge_bases_queried.map((kb) => (
                            <Badge key={kb} variant="secondary" className="text-[10px]">{kb}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <TierBadge tier={log.retrieval_tier} />
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">{log.total_chunks_scanned}</TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {log.top_similarity != null ? Number(log.top_similarity).toFixed(3) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <LatencyBadge ms={log.latency_ms} />
                      </TableCell>
                      <TableCell className="text-center">
                        {log.fallback_used ? (
                          <Badge variant="destructive" className="text-[10px]">Yes</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedLog(log)}>
                          <Eye size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail dialog */}
        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity size={18} className="text-primary" />
                Retrieval Log Detail
              </DialogTitle>
            </DialogHeader>
            {selectedLog && (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 text-sm">
                  <DetailRow label="Timestamp" value={format(new Date(selectedLog.created_at), "dd MMM yyyy HH:mm:ss")} />
                  <DetailRow label="Agent" value={selectedLog.agent_id} />
                  <DetailRow label="Query" value={selectedLog.query_text || "(empty)"} />
                  <DetailRow label="Knowledge Bases" value={selectedLog.knowledge_bases_queried.join(", ") || "None"} />
                  <DetailRow label="Retrieval Tier" value={`Tier ${selectedLog.retrieval_tier}`} />
                  <DetailRow label="Chunks Scanned" value={String(selectedLog.total_chunks_scanned)} />
                  <DetailRow label="Top Similarity" value={selectedLog.top_similarity != null ? Number(selectedLog.top_similarity).toFixed(4) : "—"} />
                  <DetailRow label="Latency" value={selectedLog.latency_ms != null ? `${selectedLog.latency_ms}ms` : "—"} />
                  <DetailRow label="Fallback Used" value={selectedLog.fallback_used ? "Yes" : "No"} />
                  <DetailRow label="Case ID" value={selectedLog.case_id ?? "—"} />
                  <DetailRow label="User ID" value={selectedLog.user_id ?? "—"} />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Documents Retrieved (JSON)</p>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.documents_retrieved, null, 2)}
                    </pre>
                  </div>
                  {selectedLog.metadata && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Metadata</p>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-destructive/50 bg-destructive/5" : ""}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${highlight ? "bg-destructive/10" : "bg-primary/10"}`}>
          <Icon size={18} className={highlight ? "text-destructive" : "text-primary"} />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TierBadge({ tier }: { tier: number }) {
  const colors: Record<number, string> = {
    1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    2: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
    3: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    4: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${colors[tier] || colors[4]}`}>
      T{tier}
    </span>
  );
}

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = ms < 500 ? "text-emerald-600" : ms < 1000 ? "text-amber-600" : "text-destructive";
  return <span className={`text-xs font-mono tabular-nums ${color}`}>{ms}ms</span>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs font-medium text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}

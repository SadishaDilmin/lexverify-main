import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldAlert, Clock, CheckCircle2, Ban, Eye, AlertTriangle, Filter } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import BenchmarkCaseDetail from "@/components/benchmark/BenchmarkCaseDetail";

const AGENTS = [
  { id: "source-of-wealth", name: "Olimey AI" },
];

const SLA_MINUTES = 60; // 1-hour SLA target

export default function OversightQueue() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending_review");

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["oversight-queue", agentFilter, statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("benchmark_cases")
        .select("*")
        .eq("source_type", "dms_proactive")
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("oversight_status", statusFilter);
      }
      if (agentFilter !== "all") {
        query = query.eq("agent_type", agentFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const stats = useMemo(() => {
    const pending = cases.filter((c: any) => c.oversight_status === "pending_review").length;
    const verified = cases.filter((c: any) => c.oversight_status === "human_verified").length;
    const overridden = cases.filter((c: any) => c.oversight_status === "overridden").length;
    const breached = cases.filter((c: any) => {
      if (c.oversight_status !== "pending_review") return false;
      return differenceInMinutes(new Date(), new Date(c.created_at)) > SLA_MINUTES;
    }).length;
    return { pending, verified, overridden, breached };
  }, [cases]);

  const agentName = (id: string) => AGENTS.find((a) => a.id === id)?.name || id;

  const slaStatus = (createdAt: string, status: string) => {
    if (status !== "pending_review") return null;
    const mins = differenceInMinutes(new Date(), new Date(createdAt));
    const remaining = SLA_MINUTES - mins;
    if (remaining <= 0) return { label: `SLA BREACHED (${Math.abs(remaining)}m over)`, variant: "destructive" as const };
    if (remaining <= 15) return { label: `${remaining}m remaining`, variant: "default" as const };
    return { label: `${remaining}m remaining`, variant: "secondary" as const };
  };

  if (selectedCaseId) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedCaseId(null)}>← Back to Queue</Button>
          <BenchmarkCaseDetail caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} insideDashboard />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert size={22} /> Human Oversight Queue
          </h1>
          <p className="text-muted-foreground mt-1">EU AI Act Art. 14 — Review all proactive AI results requiring human verification.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-primary">{stats.verified}</p>
              <p className="text-xs text-muted-foreground">Human Verified</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-destructive">{stats.overridden}</p>
              <p className="text-xs text-muted-foreground">Overridden</p>
            </CardContent>
          </Card>
          <Card className={stats.breached > 0 ? "border-destructive/50" : ""}>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-destructive">{stats.breached}</p>
              <p className="text-xs text-muted-foreground">SLA Breached</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Filter size={14} className="text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="human_verified">Human Verified</SelectItem>
              <SelectItem value="overridden">Overridden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {AGENTS.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Queue Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Oversight</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Verified By</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {isLoading ? "Loading…" : "No cases match current filters."}
                    </TableCell>
                  </TableRow>
                )}
                {cases.map((c: any) => {
                  const sla = slaStatus(c.created_at, c.oversight_status || "pending_review");
                  return (
                    <TableRow key={c.id} className={c.oversight_status === "pending_review" && sla?.variant === "destructive" ? "bg-destructive/5" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), "dd MMM yyyy HH:mm")}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{agentName(c.agent_type)}</TableCell>
                      <TableCell>
                        <Badge variant={c.confidence_level === "high" ? "default" : c.confidence_level === "medium" ? "secondary" : "destructive"} className="capitalize text-[10px]">
                          {c.confidence_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={c.oversight_status === "human_verified" ? "default" : c.oversight_status === "overridden" ? "destructive" : "secondary"}
                          className="capitalize text-[10px]"
                        >
                          {(c.oversight_status || "pending_review").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sla ? (
                          <div className="flex items-center gap-1">
                            <Clock size={12} className={sla.variant === "destructive" ? "text-destructive" : "text-muted-foreground"} />
                            <span className={`text-xs ${sla.variant === "destructive" ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              {sla.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.oversight_by || "—"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setSelectedCaseId(c.id)}>
                          <Eye size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

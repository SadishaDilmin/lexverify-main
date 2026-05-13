import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plug, Plus, Trash2, ShieldCheck, Zap, FolderSync, Landmark, Save, Database, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { agents } from "@/config/agents";
import { useMutation as useM2 } from "@tanstack/react-query";
import { useIngestionStats } from "@/hooks/useIngestionStatus";

const DMS_PROVIDERS = ["iManage", "NetDocuments", "SharePoint"] as const;

const AVAILABLE_AGENTS = agents
  .filter((a) => a.available && a.interactionType === "case-review")
  .map((a) => ({ id: a.id, name: a.name }));

export default function AdminIntegrations() {
  const qc = useQueryClient();
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ workspace_id: "", agent_id: "", priority: "med" as string, label: "", dms_integration_id: "" });

  // ── Integrations ──
  const { data: integrations = [], isLoading: loadingInt } = useQuery({
    queryKey: ["dms_integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dms_integrations").select("*").order("provider");
      if (error) throw error;
      return data || [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("dms_integrations").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dms_integrations"] }); toast.success("Integration updated"); },
  });

  const upsertIntegration = useMutation({
    mutationFn: async (provider: string) => {
      const exists = integrations.find((i: any) => i.provider === provider);
      if (exists) return;
      const { error } = await supabase.from("dms_integrations").insert({ provider, webhook_secret: crypto.randomUUID(), is_active: false });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dms_integrations"] }); toast.success("Integration added"); },
  });

  // ── Triage Rules ──
  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ["proactive_triage_rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proactive_triage_rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const addRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("proactive_triage_rules").insert({
        workspace_id: ruleForm.workspace_id,
        agent_id: ruleForm.agent_id,
        priority: ruleForm.priority as "low" | "med" | "high",
        label: ruleForm.label,
        dms_integration_id: ruleForm.dms_integration_id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proactive_triage_rules"] });
      toast.success("Triage rule created");
      setNewRuleOpen(false);
      setRuleForm({ workspace_id: "", agent_id: "", priority: "med", label: "", dms_integration_id: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proactive_triage_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proactive_triage_rules"] }); toast.success("Rule deleted"); },
  });

  const priorityColor = (p: string) => {
    if (p === "high") return "destructive";
    if (p === "med") return "default";
    return "secondary";
  };

  const agentName = (id: string) => AVAILABLE_AGENTS.find((a) => a.id === id)?.name || id;

  // ── SRA Number ──
  const [sraNumber, setSraNumber] = useState("");
  const [sraLoaded, setSraLoaded] = useState(false);

  const { data: sraData } = useQuery({
    queryKey: ["firm-sra-number"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("firm_settings")
        .select("setting_value")
        .eq("setting_key", "sra_number")
        .maybeSingle();
      return data?.setting_value ?? "";
    },
  });

  if (sraData != null && !sraLoaded) {
    setSraNumber(sraData);
    setSraLoaded(true);
  }

  const saveSRA = useM2({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("firm_settings")
        .update({ setting_value: sraNumber, updated_at: new Date().toISOString() })
        .eq("setting_key", "sra_number");
      if (error) throw error;
    },
    onSuccess: () => { toast.success("SRA Number saved"); qc.invalidateQueries({ queryKey: ["firm-sra-number"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Ingestion Pipeline ──
  const { data: ingestionStats } = useIngestionStats();
  const [batchRunning, setBatchRunning] = useState(false);

  const handleBatchSync = async () => {
    setBatchRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-file-to-text", {
        body: { batch_mode: true },
      });
      if (error) throw error;
      toast.success(`Batch sync complete: ${data.processed} processed, ${data.skipped} skipped, ${data.errors} errors`);
    } catch (e: any) {
      toast.error(e.message || "Batch sync failed");
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Plug size={22} /> Integration Hub
          </h1>
          <p className="text-muted-foreground mt-1">Connect your Document Management System for proactive AI processing.</p>
        </div>

        {/* ── Ingestion Pipeline ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database size={18} /> Olimey AI Ingestion Pipeline</CardTitle>
            <CardDescription>Converts all uploaded materials into searchable text for AI Agents. Process existing files or monitor ingestion status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingestionStats && (
              <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-foreground">{ingestionStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Files</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-[hsl(var(--risk-green))]">{ingestionStats.completed}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-accent">{ingestionStats.processing}</p>
                  <p className="text-xs text-muted-foreground">Processing</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{ingestionStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-destructive">{ingestionStats.error}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>
              {(ingestionStats.audioFiles > 0 || ingestionStats.videoFiles > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-2.5 rounded-lg border border-border text-center">
                    <p className="text-lg font-bold text-foreground">{ingestionStats.audioFiles}</p>
                    <p className="text-[11px] text-muted-foreground">Audio Files</p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-border text-center">
                    <p className="text-lg font-bold text-foreground">{ingestionStats.videoFiles}</p>
                    <p className="text-[11px] text-muted-foreground">Video Files</p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-border text-center">
                    <p className="text-lg font-bold text-foreground">{ingestionStats.visualSummaries}</p>
                    <p className="text-[11px] text-muted-foreground">Visual Summaries</p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-border text-center">
                    <p className="text-lg font-bold text-foreground">{ingestionStats.verifiedTranscripts}</p>
                    <p className="text-[11px] text-muted-foreground">Judge-Verified</p>
                  </div>
                </div>
              )}
              </>
            )}
            {ingestionStats && ingestionStats.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Ingestion progress</span>
                  <span>{Math.round((ingestionStats.completed / ingestionStats.total) * 100)}%</span>
                </div>
                <Progress value={(ingestionStats.completed / ingestionStats.total) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">{(ingestionStats.totalChars / 1000).toFixed(0)}k characters extracted</p>
              </div>
            )}
            <Button onClick={handleBatchSync} disabled={batchRunning} className="w-full sm:w-auto">
              {batchRunning ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Syncing Existing Knowledge Base…</>
              ) : (
                <><FolderSync size={14} className="mr-1.5" /> Sync Existing Knowledge Base</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* SRA/CLC Number */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Landmark size={18} /> Firm SRA/CLC Number</CardTitle>
            <CardDescription>Required for HMLR 2026 Contractual Control Disclosure submissions. Enter your SRA or CLC registration number — this appears on all generated Disclosure Data sheets.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <Label htmlFor="sra-number">SRA / CLC Registration Number</Label>
                <Input
                  id="sra-number"
                  placeholder="e.g. SRA 612345 or CLC 10012345"
                  value={sraNumber}
                  onChange={(e) => setSraNumber(e.target.value)}
                />
              </div>
              <Button onClick={() => saveSRA.mutate()} disabled={saveSRA.isPending}>
                <Save size={14} className="mr-1.5" />
                {saveSRA.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* DMS Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FolderSync size={18} /> DMS Connections</CardTitle>
            <CardDescription>Toggle connectivity for supported document management systems.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DMS_PROVIDERS.map((provider) => {
              const integration = integrations.find((i: any) => i.provider === provider);
              return (
                <div key={provider} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ShieldCheck size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{provider}</p>
                      {integration && (
                        <p className="text-xs text-muted-foreground font-mono">
                          Webhook: …{integration.webhook_secret?.slice(-8)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {integration ? (
                      <>
                        <Badge variant={integration.is_active ? "default" : "secondary"}>
                          {integration.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Switch
                          checked={integration.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: integration.id, is_active: checked })}
                        />
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => upsertIntegration.mutate(provider)}>
                        <Plus size={14} className="mr-1" /> Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Triage Rules */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Zap size={18} /> Triage Rules</CardTitle>
              <CardDescription>Define automatic processing rules for DMS workspaces.</CardDescription>
            </div>
            <Dialog open={newRuleOpen} onOpenChange={setNewRuleOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus size={14} className="mr-1" /> New Rule</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Triage Rule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Rule Label</Label>
                    <Input placeholder="e.g. London Real Estate Auto-Review" value={ruleForm.label} onChange={(e) => setRuleForm((p) => ({ ...p, label: e.target.value }))} />
                  </div>
                  <div>
                    <Label>DMS Workspace ID</Label>
                    <Input placeholder="Workspace/folder identifier" value={ruleForm.workspace_id} onChange={(e) => setRuleForm((p) => ({ ...p, workspace_id: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Agent</Label>
                    <Select value={ruleForm.agent_id} onValueChange={(v) => setRuleForm((p) => ({ ...p, agent_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_AGENTS.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={ruleForm.priority} onValueChange={(v) => setRuleForm((p) => ({ ...p, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="med">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {integrations.length > 0 && (
                    <div>
                      <Label>DMS Provider (optional)</Label>
                      <Select value={ruleForm.dms_integration_id} onValueChange={(v) => setRuleForm((p) => ({ ...p, dms_integration_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Any provider" /></SelectTrigger>
                        <SelectContent>
                          {integrations.map((i: any) => (
                            <SelectItem key={i.id} value={i.id}>{i.provider}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => addRule.mutate()}
                    disabled={!ruleForm.workspace_id || !ruleForm.agent_id || addRule.isPending}
                  >
                    {addRule.isPending ? "Creating…" : "Create Rule"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No triage rules configured yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.label || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.workspace_id}</TableCell>
                      <TableCell>{agentName(r.agent_id)}</TableCell>
                      <TableCell><Badge variant={priorityColor(r.priority)}>{r.priority.toUpperCase()}</Badge></TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate(r.id)}>
                          <Trash2 size={14} className="text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

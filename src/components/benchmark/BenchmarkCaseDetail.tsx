import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError, friendlyEdgeFunctionError } from "@/lib/edgeFunctionErrors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Upload, FileText, Trash2, CheckCircle2,
  GitCompare, Loader2, AlertTriangle, XCircle, Search, BarChart3, Wand2, Cpu, Eye, Gavel, ShieldAlert, Ban,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import JudgeCalibrationModal from "./JudgeCalibrationModal";

/* ──────── constants ──────── */
const CASE_TYPES = [
  { value: "freehold_purchase", label: "Freehold Purchase" },
  { value: "leasehold_purchase", label: "Leasehold Purchase" },
  { value: "seller_identity_risk", label: "Seller Identity Risk" },
  { value: "source_of_wealth", label: "Source of Wealth" },
  { value: "title_review", label: "Title Review" },
  { value: "pre_exchange_review", label: "Pre-Exchange Review" },
];

const AGENT_TYPES = [
  { value: "source-of-wealth", label: "Olimey AI (SoW)" },
];

const DOC_TYPES = [
  "title_register", "title_plan", "contract", "lease", "management_pack",
  "protocol_form", "searches", "aml_evidence", "sow_documents", "correspondence", "other",
];

const OUTPUT_LABELS = [
  "Title Report", "Enquiry List", "AML Analysis", "Risk Notes",
  "Due Diligence Findings", "Compliance Conclusions", "Olimey AI Report", "Other",
];

const BUCKET = "benchmark-documents";

const DIFF_TYPE_META: Record<string, { label: string; color: string; bgClass: string }> = {
  match: { label: "Match", color: "text-green-700 dark:text-green-400", bgClass: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
  ai_missed_material_issue: { label: "AI Missed Issue", color: "text-red-700 dark:text-red-400", bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
  ai_false_positive: { label: "AI False Positive", color: "text-orange-700 dark:text-orange-400", bgClass: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  data_extraction_error: { label: "Extraction Error", color: "text-red-700 dark:text-red-400", bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
  severity_classification_error: { label: "Severity Mismatch", color: "text-amber-700 dark:text-amber-400", bgClass: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  action_recommendation_error: { label: "Action Error", color: "text-orange-700 dark:text-orange-400", bgClass: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  evidence_citation_failure: { label: "Citation Failure", color: "text-red-700 dark:text-red-400", bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
};

const statusColor = (s: string) =>
  s === "ready" ? "default" : s === "archived" ? "secondary" : "outline";

/* ──────── props ──────── */
interface BenchmarkCaseDetailProps {
  caseId: string;
  onClose: () => void;
  /** Hide the "Open Benchmark Dashboard" button when rendered inside the dashboard */
  insideDashboard?: boolean;
}

export default function BenchmarkCaseDetail({ caseId, onClose, insideDashboard }: BenchmarkCaseDetailProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  /* ── queries ── */
  const { data: selectedCase } = useQuery({
    queryKey: ["benchmark_case_detail", caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_cases").select("*").eq("id", caseId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["benchmark_documents", caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_documents").select("*").eq("benchmark_case_id", caseId).order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: outputs = [] } = useQuery({
    queryKey: ["benchmark_outputs", caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_outputs").select("*").eq("benchmark_case_id", caseId).order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: comparisons = [] } = useQuery({
    queryKey: ["benchmark_comparisons", caseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_comparisons").select("*").eq("benchmark_case_id", caseId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const activeComparison = comparisons.find((c: any) => c.id === activeComparisonId);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [showJustification, setShowJustification] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const { data: comparisonItems = [] } = useQuery({
    queryKey: ["benchmark_comparison_items", activeComparisonId],
    enabled: !!activeComparisonId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("benchmark_comparison_items").select("*").eq("comparison_id", activeComparisonId).order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  /* ── audit helper ── */
  const logAudit = useCallback(async (eventType: string, metadata: Record<string, any> = {}) => {
    if (!profile) return;
    await supabase.from("audit_log").insert({
      user_id: profile.user_id,
      user_name: profile.full_name,
      user_email: profile.email,
      user_position: profile.position,
      event_type: eventType,
      metadata,
    });
  }, [profile]);

  /* ── upload evidence document ── */
  const uploadDoc = useCallback(async (files: FileList) => {
    if (!profile) return;
    for (const file of Array.from(files)) {
      const path = `${caseId}/evidence/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); continue; }
      const { error: dbErr } = await (supabase as any).from("benchmark_documents").insert({
        benchmark_case_id: caseId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        uploaded_by: profile.user_id,
      });
      if (dbErr) { toast({ title: "DB error", description: dbErr.message, variant: "destructive" }); continue; }
      await logAudit("benchmark_document_uploaded", { case_id: caseId, file_name: file.name });
    }
    qc.invalidateQueries({ queryKey: ["benchmark_documents", caseId] });
    toast({ title: "Document(s) uploaded" });
  }, [caseId, profile, qc, toast, logAudit]);

  /* ── update doc type ── */
  const updateDocType = useCallback(async (docId: string, docType: string) => {
    await (supabase as any).from("benchmark_documents").update({ doc_type: docType }).eq("id", docId);
    qc.invalidateQueries({ queryKey: ["benchmark_documents", caseId] });
  }, [caseId, qc]);

  /* ── delete doc ── */
  const deleteDoc = useCallback(async (docId: string, filePath: string) => {
    await supabase.storage.from(BUCKET).remove([filePath]);
    await (supabase as any).from("benchmark_documents").delete().eq("id", docId);
    qc.invalidateQueries({ queryKey: ["benchmark_documents", caseId] });
    toast({ title: "Document deleted" });
  }, [caseId, qc, toast]);

  /* ── add output ── */
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [outputForm, setOutputForm] = useState({ output_type: "human" as "human" | "ai", label: "", content: "" });
  const [outputFile, setOutputFile] = useState<File | null>(null);

  const addOutput = useCallback(async () => {
    if (!profile) return;
    let file_name: string | null = null;
    let file_path: string | null = null;
    if (outputFile) {
      const path = `${caseId}/outputs/${Date.now()}_${outputFile.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, outputFile);
      if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
      file_name = outputFile.name;
      file_path = path;
    }
    const { error } = await (supabase as any).from("benchmark_outputs").insert({
      benchmark_case_id: caseId,
      output_type: outputForm.output_type,
      label: outputForm.label,
      content: outputForm.content,
      file_name,
      file_path,
      uploaded_by: profile.user_id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logAudit("benchmark_output_uploaded", { case_id: caseId, output_type: outputForm.output_type, label: outputForm.label });
    qc.invalidateQueries({ queryKey: ["benchmark_outputs", caseId] });
    setShowOutputDialog(false);
    setOutputForm({ output_type: "human", label: "", content: "" });
    setOutputFile(null);
    toast({ title: "Output added" });
  }, [caseId, profile, outputForm, outputFile, qc, toast, logAudit]);

  /* ── delete output ── */
  const deleteOutput = useCallback(async (id: string, filePath: string | null) => {
    if (filePath) await supabase.storage.from(BUCKET).remove([filePath]);
    await (supabase as any).from("benchmark_outputs").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["benchmark_outputs", caseId] });
    toast({ title: "Output deleted" });
  }, [caseId, qc, toast]);

  /* ── mark ready / archive ── */
  const setStatus = useCallback(async (status: string) => {
    if (!selectedCase) return;
    if (status === "ready") {
      const isSynthetic = selectedCase.source_type === "synthetic";
      const hasDoc = isSynthetic || docs.length > 0;
      const hasHuman = outputs.some((o: any) => o.output_type === "human");
      const hasAI = outputs.some((o: any) => o.output_type === "ai");
      if (!isSynthetic && (!hasDoc || !hasHuman || !hasAI)) {
        toast({ title: "Cannot mark as ready", description: "Need at least 1 evidence document, 1 human output, and 1 AI output.", variant: "destructive" });
        return;
      }
    }
    await (supabase as any).from("benchmark_cases").update({ status }).eq("id", caseId);
    await logAudit("benchmark_case_status_changed", { case_id: caseId, status });
    qc.invalidateQueries({ queryKey: ["benchmark_cases"] });
    qc.invalidateQueries({ queryKey: ["benchmark_case_detail", caseId] });
    qc.invalidateQueries({ queryKey: ["bm_dash_cases"] });
    toast({ title: `Case marked as ${status}` });
  }, [selectedCase, docs, outputs, caseId, qc, toast, logAudit]);

  /* ── run comparison ── */
  const runComparison = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await supabase.functions.invoke("benchmark-compare", {
        body: { benchmark_case_id: caseId },
      });
      if (resp.error) {
        const msg = await extractEdgeFunctionError(resp, "Comparison failed");
        throw new Error(msg);
      }
      return resp.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["benchmark_comparisons", caseId] });
      setActiveComparisonId(data.comparison_id);
      toast({ title: "Comparison complete", description: `${data.total_items} findings analysed` });
    },
    onError: (e: any) => {
      const { title, description } = friendlyEdgeFunctionError(e.message, "Comparison failed");
      toast({ title, description, variant: "destructive" });
    },
  });

  /* ── extract & evaluate ── */
  const runExtraction = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await supabase.functions.invoke("benchmark-compare", {
        body: { benchmark_case_id: caseId, run_extraction: true },
      });
      if (resp.error) {
        const msg = await extractEdgeFunctionError(resp, "Extraction failed");
        throw new Error(msg);
      }
      return resp.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["benchmark_outputs", caseId] });
      qc.invalidateQueries({ queryKey: ["benchmark_documents", caseId] });
      toast({ title: "Extraction complete", description: `${data.documents_processed} document(s) processed. AI output saved.` });
    },
    onError: (e: any) => {
      const { title, description } = friendlyEdgeFunctionError(e.message, "Extraction failed");
      toast({ title, description, variant: "destructive" });
    },
  });

  /* ── generate prompt patches ── */
  const generatePatches = useMutation({
    mutationFn: async (comparisonId: string) => {
      const resp = await supabase.functions.invoke("generate-prompt-patches", {
        body: { comparison_id: comparisonId },
      });
      if (resp.error) {
        const msg = await extractEdgeFunctionError(resp, "Patch generation failed");
        throw new Error(msg);
      }
      return resp.data;
    },
    onSuccess: (data) => {
      toast({ title: "Patches generated", description: `${data.patches_created} improvement(s) created. View in Prompt Management.` });
    },
    onError: (e: any) => {
      const { title, description } = friendlyEdgeFunctionError(e.message, "Patch generation failed");
      toast({ title, description, variant: "destructive" });
    },
  });

  /* ── override AI result (Art. 14 Stop Button) ── */
  const OVERRIDE_REASONS = ["False Positive", "Contextual Nuance", "Incomplete Evidence", "Regulatory Interpretation Differs", "Other"];

  const handleOverride = useCallback(async () => {
    if (!profile || !overrideReason) return;
    await (supabase as any).from("benchmark_cases").update({
      oversight_status: "overridden",
      oversight_by: profile.full_name,
      oversight_at: new Date().toISOString(),
      oversight_reason: overrideReason,
    }).eq("id", caseId);
    await supabase.from("audit_log").insert({
      user_id: profile.user_id,
      user_name: profile.full_name,
      user_email: profile.email,
      user_position: profile.position,
      event_type: "benchmark_case_overridden",
      metadata: { case_id: caseId, reason: overrideReason, article: "EU AI Act Art. 14" },
    });
    qc.invalidateQueries({ queryKey: ["benchmark_case_detail", caseId] });
    toast({ title: "AI result overridden", description: `Marked as overridden: ${overrideReason}` });
    setShowOverrideDialog(false);
    setOverrideReason("");
  }, [profile, caseId, overrideReason, qc, toast]);

  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifySolicitorName, setVerifySolicitorName] = useState(profile?.full_name || "");
  const [verifySraId, setVerifySraId] = useState("");

  const handleVerify = useCallback(async () => {
    if (!profile) return;
    if (!verifySolicitorName.trim() || !verifySraId.trim()) {
      toast({ title: "Required fields", description: "Solicitor name and SRA ID are mandatory.", variant: "destructive" });
      return;
    }
    // Basic SRA ID validation (6 digits)
    if (!/^\d{5,8}$/.test(verifySraId.trim())) {
      toast({ title: "Invalid SRA ID", description: "SRA ID must be 5-8 digits.", variant: "destructive" });
      return;
    }
    await (supabase as any).from("benchmark_cases").update({
      oversight_status: "human_verified",
      oversight_by: profile.full_name,
      oversight_at: new Date().toISOString(),
      sra_solicitor_name: verifySolicitorName.trim(),
      sra_id_number: verifySraId.trim(),
    }).eq("id", caseId);
    await supabase.from("audit_log").insert({
      user_id: profile.user_id,
      user_name: profile.full_name,
      user_email: profile.email,
      user_position: profile.position,
      event_type: "benchmark_case_verified",
      metadata: { case_id: caseId, article: "EU AI Act Art. 14", sra_solicitor_name: verifySolicitorName.trim(), sra_id_number: verifySraId.trim() },
    });
    qc.invalidateQueries({ queryKey: ["benchmark_case_detail", caseId] });
    toast({ title: "Case verified", description: `Verified by ${verifySolicitorName.trim()} (SRA: ${verifySraId.trim()})` });
    setShowVerifyDialog(false);
  }, [profile, caseId, qc, toast, verifySolicitorName, verifySraId]);

  if (!selectedCase) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const triggerCtx = selectedCase.trigger_context as any;
  const isProactive = triggerCtx?.trigger_type === "proactive";
  const oversightStatus = selectedCase.oversight_status;


  /* ──────── render ──────── */
  return (
    <div className="space-y-6">
      {/* Transparency Label for proactive cases */}
      {isProactive && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <span className="text-lg">🤖</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Ambient Processing Active
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This document was analysed automatically to ensure compliance with firm standards.
                </p>
                <button
                  onClick={() => setShowJustification(!showJustification)}
                  className="text-xs text-primary underline mt-1 hover:text-primary/80"
                >
                  {showJustification ? "Hide Justification" : "View Justification"}
                </button>
                {showJustification && (
                  <div className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                    <p><span className="font-semibold text-foreground">Rule:</span> {triggerCtx.rule_name || triggerCtx.rule_id}</p>
                    <p><span className="font-semibold text-foreground">Workspace:</span> {triggerCtx.workspace_id}</p>
                    <p><span className="font-semibold text-foreground">Provider:</span> {triggerCtx.provider}</p>
                    <p><span className="font-semibold text-foreground">Triggered:</span> {triggerCtx.triggered_at ? format(new Date(triggerCtx.triggered_at), "dd MMM yyyy HH:mm") : "—"}</p>
                    <p className="pt-1 border-t border-border mt-1"><span className="font-semibold text-foreground">AI Justification:</span> {triggerCtx.ai_justification}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Art. 14 Oversight Controls */}
      {isProactive && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-destructive" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Human Oversight Required (Art. 14)</p>
                  <p className="text-xs text-muted-foreground">
                    Status: <Badge variant={oversightStatus === "human_verified" ? "default" : oversightStatus === "overridden" ? "destructive" : "secondary"} className="text-[10px] capitalize ml-1">
                      {(oversightStatus || "pending_review").replace(/_/g, " ")}
                    </Badge>
                    {selectedCase.oversight_by && (
                      <span className="ml-2">by {selectedCase.oversight_by} {selectedCase.oversight_at ? `at ${format(new Date(selectedCase.oversight_at), "dd MMM HH:mm")}` : ""}</span>
                    )}
                  </p>
                  {selectedCase.oversight_reason && (
                    <p className="text-xs text-destructive mt-0.5">Reason: {selectedCase.oversight_reason}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {oversightStatus !== "human_verified" && (
                  <Button size="sm" variant="default" onClick={() => setShowVerifyDialog(true)}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verify
                  </Button>
                )}
                {oversightStatus !== "overridden" && (
                  <Button size="sm" variant="destructive" onClick={() => setShowOverrideDialog(true)}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Override AI Result
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Override Dialog */}
      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-destructive" /> Override AI Result</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the reason for overriding this proactive AI result. This action is logged for EU AI Act Art. 14 compliance.</p>
            <Select value={overrideReason} onValueChange={setOverrideReason}>
              <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {OVERRIDE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!overrideReason} onClick={handleOverride}>
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SRA Digital Signature Verify Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Verify AI Result — SRA Accountability</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              By verifying, you confirm this AI output has been reviewed by a regulated solicitor in accordance with the SRA Code of Conduct 2026.
            </p>
            <div className="space-y-2">
              <Label>Confirmed by (Name of Solicitor) *</Label>
              <Input value={verifySolicitorName} onChange={e => setVerifySolicitorName(e.target.value)} placeholder="e.g. Jane Smith" />
            </div>
            <div className="space-y-2">
              <Label>SRA ID Number *</Label>
              <Input value={verifySraId} onChange={e => setVerifySraId(e.target.value)} placeholder="e.g. 123456" maxLength={8} />
              <p className="text-xs text-muted-foreground">5–8 digit SRA registration number</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>Cancel</Button>
            <Button disabled={!verifySolicitorName.trim() || !verifySraId.trim()} onClick={handleVerify}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-lg break-words">{selectedCase.title}</CardTitle>
              {selectedCase.property_address && (
                <p className="mt-1 text-sm text-muted-foreground">{selectedCase.property_address}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={statusColor(selectedCase.status) as any} className="capitalize">{selectedCase.status}</Badge>
              {isProactive && <Badge variant="outline" className="text-accent border-accent/40">🤖 Proactive</Badge>}
              {selectedCase.status === "draft" && (
                <Button size="sm" variant="default" onClick={() => setStatus("ready")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Ready
                </Button>
              )}
              {selectedCase.status === "ready" && (
                <Button size="sm" variant="outline" onClick={() => setStatus("archived")}>Archive</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground block text-xs">Description</span>{selectedCase.property_address || "—"}</div>
            <div><span className="text-muted-foreground block text-xs">Transaction</span>{selectedCase.transaction_type}</div>
            <div><span className="text-muted-foreground block text-xs">Case Type</span>{CASE_TYPES.find(t => t.value === selectedCase.case_type)?.label}</div>
            <div><span className="text-muted-foreground block text-xs">Agent</span>{AGENT_TYPES.find(a => a.value === selectedCase.agent_type)?.label}</div>
          </div>
          {selectedCase.notes && <p className="mt-3 text-xs text-muted-foreground border-t pt-3"><span className="font-medium">Notes:</span> {selectedCase.notes}</p>}
        </CardContent>
      </Card>

      {/* Synthetic case: Next Steps workflow banner */}
      {selectedCase.source_type === "synthetic" && comparisons.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 px-5">
            <div className="flex items-start gap-3">
              <Wand2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Auto-evaluation complete — what's next?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This synthetic case was automatically compared against its gold-standard and judged by a cross-family model.
                    Use the Benchmark Dashboard to analyse failure patterns across all cases and generate prompt improvements.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</span>
                    <span className="text-muted-foreground">Review comparison below</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">2</span>
                    <span className="text-muted-foreground">Analyse failure patterns</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">3</span>
                    <span className="text-muted-foreground">Generate prompt patches</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">4</span>
                    <span className="text-muted-foreground">Deploy &amp; re-test</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!insideDashboard && (
                    <Button size="sm" onClick={() => navigate("/admin/benchmark-dashboard")} className="gap-1.5 text-xs">
                      <BarChart3 className="h-3.5 w-3.5" /> Open Benchmark Dashboard
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate("/admin/prompt-management")} className="gap-1.5 text-xs">
                    <Wand2 className="h-3.5 w-3.5" /> Prompt Management
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="evidence" className="w-full">
        {(() => {
          const isSynthetic = selectedCase.source_type === "synthetic";
          const generatedDocs = outputs.filter((o: any) => o.output_type === "ai");
          const goldStandard = outputs.filter((o: any) => o.output_type === "human");
          const evidenceCount = isSynthetic ? generatedDocs.length : docs.length;
          return (
            <>
              <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-4">
                <TabsTrigger value="evidence" className="text-xs">
                  {isSynthetic ? "Documents" : "Evidence"} ({evidenceCount})
                </TabsTrigger>
                <TabsTrigger value="human" className="text-xs">
                  {isSynthetic ? "Gold Standard" : "Human"} ({goldStandard.length})
                </TabsTrigger>
                <TabsTrigger value="ai" className="text-xs">
                  {isSynthetic ? "Agent Output" : "AI"} ({isSynthetic ? comparisons.length : generatedDocs.length})
                </TabsTrigger>
                <TabsTrigger value="comparison" className="text-xs">
                  <GitCompare className="h-3.5 w-3.5 mr-1" /> Compare ({comparisons.length})
                </TabsTrigger>
              </TabsList>

              {/* Evidence / Documents */}
              <TabsContent value="evidence" className="space-y-4">
                {isSynthetic ? (
                  generatedDocs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No generated documents found for this synthetic case.</p>
                  ) : (
                    <div className="space-y-3">
                      {generatedDocs.map((o: any) => (
                        <Card key={o.id}>
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{o.label}</span>
                              <Badge variant="outline" className="text-[10px]">Generated</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-3">
                            <ScrollArea className="max-h-64">
                              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">{o.content}</pre>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )
                ) : (
                  <>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Click or drag files to upload evidence documents</span>
                      <input type="file" multiple className="hidden" onChange={e => e.target.files && uploadDoc(e.target.files)} />
                    </label>
                    {docs.length > 0 && (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>File</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Extraction</TableHead>
                              <TableHead className="text-right">Size</TableHead>
                              <TableHead className="w-20" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {docs.map((d: any) => (
                              <TableRow key={d.id}>
                                <TableCell className="text-xs font-medium flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{d.file_name}</TableCell>
                                <TableCell>
                                  <Select value={d.doc_type} onValueChange={v => { v && updateDocType(d.id, v); }}>
                                    <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t.replace(/_/g, " ")}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  {d.extraction_method ? (
                                    <div className="flex items-center gap-1.5">
                                      <Badge variant="outline" className="text-[10px] gap-1">
                                        {d.extraction_method === "multimodal_ocr" ? <Eye className="h-2.5 w-2.5" /> : <Cpu className="h-2.5 w-2.5" />}
                                        {d.extraction_method === "multimodal_ocr" ? "Visual OCR" : d.extraction_method === "docx_xml" ? "DOCX" : "Text"}
                                      </Badge>
                                      {d.extracted_chars != null && (
                                        <span className="text-[10px] text-muted-foreground">{(d.extracted_chars / 1000).toFixed(1)}k chars</span>
                                      )}
                                    </div>
                                  ) : d.extraction_error ? (
                                    <Badge variant="destructive" className="text-[10px]">Error</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">{(d.file_size / 1024).toFixed(0)} KB</TableCell>
                                <TableCell className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Download" onClick={async () => {
                                    const { data: signedData, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 300);
                                    if (error) { console.error("Signed URL error:", error); toast({ title: "Download failed", description: error.message, variant: "destructive" }); return; }
                                    if (signedData?.signedUrl) window.open(signedData.signedUrl, "_blank");
                                  }}><Search className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteDoc(d.id, d.file_path)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {/* Extract & Evaluate button */}
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-xs text-muted-foreground">
                            Extract text from uploaded documents and generate AI analysis for benchmarking.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runExtraction.mutate()}
                            disabled={runExtraction.isPending}
                            className="gap-1.5 shrink-0"
                          >
                            {runExtraction.isPending
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting…</>
                              : <><Cpu className="h-3.5 w-3.5" /> Extract &amp; Evaluate</>}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </TabsContent>
            </>
          );
        })()}

        {/* Human outputs */}
        <TabsContent value="human" className="space-y-4">
          <Button size="sm" onClick={() => { setOutputForm({ output_type: "human", label: "", content: "" }); setOutputFile(null); setShowOutputDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Human Output
          </Button>
          <OutputList outputs={outputs.filter((o: any) => o.output_type === "human")} onDelete={deleteOutput} />
        </TabsContent>

        {/* AI outputs */}
        <TabsContent value="ai" className="space-y-4">
          <Button size="sm" onClick={() => { setOutputForm({ output_type: "ai", label: "", content: "" }); setOutputFile(null); setShowOutputDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add AI Output
          </Button>
          <OutputList outputs={outputs.filter((o: any) => o.output_type === "ai")} onDelete={deleteOutput} />
        </TabsContent>

        {/* ── Comparison Tab ── */}
        <TabsContent value="comparison" className="space-y-4">
          {selectedCase.source_type === "synthetic" ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Comparisons were automatically generated during synthetic case creation (gold-standard vs AI agent output).
              </p>
              {!insideDashboard && (
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/benchmark-dashboard")} className="gap-1.5 shrink-0">
                  <BarChart3 className="h-3.5 w-3.5" /> Analyse on Dashboard
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Run an AI-powered comparison between human and AI outputs to identify discrepancies.
              </p>
              <Button
                size="sm"
                onClick={() => runComparison.mutate()}
                disabled={runComparison.isPending || outputs.filter((o: any) => o.output_type === "human").length === 0 || outputs.filter((o: any) => o.output_type === "ai").length === 0}
              >
                {runComparison.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analysing…</> : <><GitCompare className="h-4 w-4 mr-1" /> Run Comparison</>}
              </Button>
            </div>
          )}

          {/* Past comparisons */}
          {comparisons.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Comparison History</h3>
              {comparisons.map((comp: any) => (
                <Card
                  key={comp.id}
                  className={`cursor-pointer transition-colors ${activeComparisonId === comp.id ? "border-primary" : "hover:border-muted-foreground/30"}`}
                  onClick={() => setActiveComparisonId(comp.id)}
                >
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium">{format(new Date(comp.created_at), "dd MMM yyyy HH:mm")}</span>
                        <Badge variant={comp.status === "complete" ? "default" : "secondary"} className="ml-2 text-[10px] capitalize">{comp.status}</Badge>
                      </div>
                    </div>
                    {comp.summary_stats && (
                      <ComparisonStats stats={comp.summary_stats} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Active comparison detail */}
          {activeComparisonId && activeComparison?.status === "complete" && (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAuditModalOpen(true)}
                  className="gap-1.5"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  Audit Judge
                  {activeComparison?.is_audited && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generatePatches.mutate(activeComparisonId)}
                  disabled={generatePatches.isPending}
                >
                  {generatePatches.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…</>
                    : <><Wand2 className="h-3.5 w-3.5 mr-1" /> Generate Prompt Patches</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate("/admin/prompt-management")}>
                  View Prompt Management →
                </Button>
              </div>
              <ComparisonDetail items={comparisonItems} stats={activeComparison.summary_stats} />
              {activeComparisonId && activeComparison && (
                <JudgeCalibrationModal
                  open={auditModalOpen}
                  onOpenChange={setAuditModalOpen}
                  comparisonId={activeComparisonId}
                  comparison={activeComparison}
                />
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add output dialog ── */}
      <Dialog open={showOutputDialog} onOpenChange={setShowOutputDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {outputForm.output_type === "human" ? "Human" : "AI"} Output</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Label</Label>
              <Select value={outputForm.label} onValueChange={v => setOutputForm(p => ({ ...p, label: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select output type…" /></SelectTrigger>
                <SelectContent>{OUTPUT_LABELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Content (paste or type)</Label>
              <Textarea className="mt-1 min-h-[200px] text-xs font-mono" value={outputForm.content} onChange={e => setOutputForm(p => ({ ...p, content: e.target.value }))} placeholder="Paste the full output here…" />
            </div>
            <div>
              <Label className="text-xs">Or upload file</Label>
              <Input type="file" className="mt-1" onChange={e => setOutputFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOutputDialog(false)}>Cancel</Button>
            <Button onClick={addOutput} disabled={!outputForm.label}>Save Output</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Comparison stats badges ── */
function ComparisonStats({ stats }: { stats: any }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {stats.match > 0 && <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:text-green-400">✓ {stats.match}</Badge>}
      {stats.ai_missed_material_issue > 0 && <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 dark:text-red-400">Missed {stats.ai_missed_material_issue}</Badge>}
      {stats.ai_false_positive > 0 && <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 dark:text-orange-400">FP {stats.ai_false_positive}</Badge>}
      {(stats.data_extraction_error || 0) + (stats.severity_classification_error || 0) + (stats.action_recommendation_error || 0) + (stats.evidence_citation_failure || 0) > 0 && (
        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">
          Errors {(stats.data_extraction_error || 0) + (stats.severity_classification_error || 0) + (stats.action_recommendation_error || 0) + (stats.evidence_citation_failure || 0)}
        </Badge>
      )}
    </div>
  );
}

/* ── Comparison detail view ── */
function ComparisonDetail({ items, stats }: { items: any[]; stats: any }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? items : items.filter(i => i.difference_type === filter);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Findings" value={stats.total || 0} icon={<BarChart3 className="h-4 w-4" />} />
        <SummaryCard label="Matches" value={stats.match || 0} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} className="border-green-200 dark:border-green-800" />
        <SummaryCard label="AI Missed" value={stats.ai_missed_material_issue || 0} icon={<XCircle className="h-4 w-4 text-red-600" />} className="border-red-200 dark:border-red-800" />
        <SummaryCard label="False Positives" value={stats.ai_false_positive || 0} icon={<AlertTriangle className="h-4 w-4 text-orange-600" />} className="border-orange-200 dark:border-orange-800" />
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All findings</SelectItem>
            <SelectItem value="match" className="text-xs">Matches only</SelectItem>
            <SelectItem value="ai_missed_material_issue" className="text-xs">AI Missed Issues</SelectItem>
            <SelectItem value="ai_false_positive" className="text-xs">AI False Positives</SelectItem>
            <SelectItem value="data_extraction_error" className="text-xs">Extraction Errors</SelectItem>
            <SelectItem value="severity_classification_error" className="text-xs">Severity Mismatches</SelectItem>
            <SelectItem value="action_recommendation_error" className="text-xs">Action Errors</SelectItem>
            <SelectItem value="evidence_citation_failure" className="text-xs">Citation Failures</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} of {items.length}</span>
      </div>

      <ScrollArea className="max-h-[600px]">
        <div className="space-y-2">
          {filtered.map((item: any) => {
            const meta = DIFF_TYPE_META[item.difference_type] || DIFF_TYPE_META.match;
            return (
              <Card key={item.id} className={`border ${meta.bgClass}`}>
                <CardContent className="py-3 px-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
                      <span className="text-xs font-medium">{item.issue_type}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{item.document_source}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Human Finding</span>
                      <p className="text-xs">{item.human_finding || <span className="italic text-muted-foreground">Not identified</span>}</p>
                      {item.human_severity && <Badge variant="outline" className="text-[10px]">Severity: {item.human_severity}</Badge>}
                      {item.human_action && <p className="text-[10px] text-muted-foreground"><strong>Action:</strong> {item.human_action}</p>}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI Finding</span>
                      <p className="text-xs">{item.ai_finding || <span className="italic text-muted-foreground">Not identified</span>}</p>
                      {item.ai_severity && <Badge variant="outline" className="text-[10px]">Severity: {item.ai_severity}</Badge>}
                      {item.ai_action && <p className="text-[10px] text-muted-foreground"><strong>Action:</strong> {item.ai_action}</p>}
                    </div>
                  </div>

                  {item.evidence_citation && (
                    <div className="border-t pt-2 mt-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Evidence</span>
                      <p className="text-xs italic text-muted-foreground">"{item.evidence_citation}"</p>
                    </div>
                  )}
                  {item.notes && (
                    <p className="text-[10px] text-muted-foreground border-t pt-1"><strong>Notes:</strong> {item.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No findings match the current filter.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SummaryCard({ label, value, icon, className = "" }: { label: string; value: number; icon: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="py-3 px-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function OutputList({ outputs, onDelete }: { outputs: any[]; onDelete: (id: string, fp: string | null) => void }) {
  if (outputs.length === 0) return <p className="text-sm text-muted-foreground py-4">No outputs yet.</p>;
  return (
    <div className="space-y-3">
      {outputs.map((o: any) => (
        <Card key={o.id}>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{o.label}</span>
              {o.file_name && <Badge variant="outline" className="text-[10px]">{o.file_name}</Badge>}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(o.id, o.file_path)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </CardHeader>
          {o.content && (
            <CardContent className="px-4 pb-3">
              <ScrollArea className="max-h-48">
                <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">{o.content.slice(0, 2000)}{o.content.length > 2000 ? "…" : ""}</pre>
              </ScrollArea>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

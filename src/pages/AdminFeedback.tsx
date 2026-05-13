import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PromoteToEnhancementDialog from "@/components/PromoteToEnhancementDialog";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Lightbulb, BarChart3, Download, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, XCircle, Clock, Copy, Wand2, ArrowUpRight, EyeOff, Trash2
} from "lucide-react";
import FeedbackDismissDialog from "@/components/FeedbackDismissDialog";
import { toast } from "sonner";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-risk-red-bg text-risk-red border-risk-red/20",
  major: "bg-risk-amber-bg text-risk-amber border-risk-amber/20",
  minor: "bg-muted text-muted-foreground border-border",
};

const ASSESSMENT_COLORS: Record<string, string> = {
  valid: "text-risk-green",
  partially_valid: "text-risk-amber",
  not_supported: "text-risk-red",
};

const AdminFeedback = () => {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [expandedEnhancement, setExpandedEnhancement] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dismissTarget, setDismissTarget] = useState<{ id: string; caseRef: string; action: "ignore" | "delete" } | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const queryClient = useQueryClient();

  const updateEnhancementStatus = useCallback(async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("enhancement_backlog")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    toast.success(`Status updated to ${newStatus.replace(/_/g, " ")}`);
    queryClient.invalidateQueries({ queryKey: ["enhancement_backlog"] });
  }, [queryClient]);

  const generateImplementationPrompt = useCallback((enh: any) => {
    const prompt = `## Enhancement Implementation Request

**Title:** ${enh.title}
**Priority:** ${enh.priority}
**Category:** ${enh.category}

### Problem Statement
${enh.problem_statement}

### Proposed Change
${enh.proposed_change}

### Acceptance Criteria
${enh.acceptance_criteria}

### Risk Rationale
${enh.risk_rationale}

### Linked Feedback IDs
${(enh.feedback_ids || []).join(", ") || "None"}

---
Please implement this enhancement. Do not change any other functionality. After implementation, update enhancement backlog item ${enh.id} status to "resolved".`;

    navigator.clipboard.writeText(prompt).then(() => {
      toast.success("Implementation prompt copied to clipboard! Paste it into Lovable chat.");
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  }, []);
  const generateFeedbackPrompt = useCallback((fb: any) => {
    const prompt = `## Agent Error Correction Request

**Case Reference:** ${fb.case_reference}
**Feedback Type:** ${fb.feedback_type || fb.mode}
**Severity:** ${fb.severity || "unset"}
**Agent Assessment:** ${fb.agent_assessment || "N/A"}

### User-Reported Issue
${fb.user_message}

### Agent Response (at time of report)
${fb.agent_response || "N/A"}

### Evidence References
${fb.evidence_references || "None provided"}

### Proposed Correction
${fb.proposed_correction || "None provided"}

### Enhancement Summary
${fb.enhancement_summary || "None provided"}

---
Please investigate and fix this issue in the agent's logic or prompts. Do not change any other functionality.
Feedback ID: ${fb.id}`;

    navigator.clipboard.writeText(prompt).then(() => {
      toast.success("Lovable prompt copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  }, []);

  const handleDismissFeedback = useCallback(async (feedbackId: string, action: "ignore" | "delete", reason: string) => {
    const { error } = await supabase
      .from("agent_feedback")
      .update({
        review_status: action === "ignore" ? "ignored" : "deleted",
        review_reason: reason,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      } as any)
      .eq("id", feedbackId);
    if (error) {
      toast.error(`Failed to ${action} feedback`);
      return;
    }
    toast.success(`Feedback ${action === "ignore" ? "ignored" : "deleted"} successfully`);
    queryClient.invalidateQueries({ queryKey: ["admin_feedback"] });
  }, [queryClient]);

  // Fetch feedback records
  const { data: feedbackRecords = [] } = useQuery({
    queryKey: ["admin_feedback", severityFilter, showDismissed],
    queryFn: async () => {
      let query = supabase
        .from("agent_feedback")
        .select("*")
        .eq("logged_as_feedback", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (severityFilter !== "all") {
        query = query.eq("severity", severityFilter);
      }
      if (!showDismissed) {
        query = query.is("review_status" as any, null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch enhancement backlog
  const { data: enhancements = [] } = useQuery({
    queryKey: ["enhancement_backlog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enhancement_backlog")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Metrics
  const totalFeedback = feedbackRecords.length;
  const criticalCount = feedbackRecords.filter((f: any) => f.severity === "critical").length;
  const majorCount = feedbackRecords.filter((f: any) => f.severity === "major").length;
  const minorCount = feedbackRecords.filter((f: any) => f.severity === "minor").length;
  const omissionCount = feedbackRecords.filter((f: any) => f.feedback_type === "omission").length;
  const topCategories = feedbackRecords.reduce((acc: Record<string, number>, f: any) => {
    const t = f.feedback_type || "unknown";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const promotableRecords = feedbackRecords.filter((f: any) => !f.enhancement_id);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === promotableRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(promotableRecords.map((f: any) => f.id)));
    }
  };
  const selectedFeedbackItems = feedbackRecords.filter((f: any) => selectedIds.has(f.id));


  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row: any) =>
        headers.map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent Feedback & Enhancements</h1>
            <p className="text-sm text-muted-foreground">Review training feedback and the developer enhancement backlog.</p>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total Feedback", value: totalFeedback, icon: MessageSquare },
            { label: "Omissions", value: omissionCount, icon: AlertTriangle },
            { label: "Critical", value: criticalCount, icon: XCircle },
            { label: "Major", value: majorCount, icon: AlertTriangle },
            { label: "Minor", value: minorCount, icon: CheckCircle2 },
          ].map((m) => (
            <Card key={m.label} className="border-border">
              <CardContent className="p-3 text-center">
                <m.icon size={16} className="mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold font-mono text-foreground">{m.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="feedback" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="feedback" className="gap-1.5 text-xs">
              <MessageSquare size={14} /> Feedback Records
            </TabsTrigger>
            <TabsTrigger value="enhancements" className="gap-1.5 text-xs">
              <Lightbulb size={14} /> Enhancement Backlog
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-1.5 text-xs">
              <BarChart3 size={14} /> Metrics
            </TabsTrigger>
          </TabsList>

          {/* Feedback Records */}
          <TabsContent value="feedback">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Feedback Records</CardTitle>
                <div className="flex gap-2">
                   <Select value={severityFilter} onValueChange={setSeverityFilter}>
                     <SelectTrigger className="w-[140px] text-xs">
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All Severity</SelectItem>
                       <SelectItem value="critical">Critical</SelectItem>
                       <SelectItem value="major">Major</SelectItem>
                       <SelectItem value="minor">Minor</SelectItem>
                     </SelectContent>
                   </Select>
                   <Button
                     variant={showDismissed ? "secondary" : "outline"}
                     size="sm"
                     className="gap-1.5 text-xs"
                     onClick={() => setShowDismissed(!showDismissed)}
                   >
                     <EyeOff size={14} /> {showDismissed ? "Hide Dismissed" : "Show Dismissed"}
                   </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => exportCSV(feedbackRecords, "feedback_records.csv")}>
                    <Download size={14} /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 p-2 bg-accent/10 border border-accent/20 rounded-lg mb-2">
                  <span className="text-xs font-medium text-foreground">{selectedIds.size} selected</span>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setPromoteTarget(selectedFeedbackItems)}
                  >
                    <ArrowUpRight size={14} /> Bulk Promote to Enhancement
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              )}
              {feedbackRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No feedback records yet.</p>
              ) : (
                <div className="space-y-2">
                  {/* Select all */}
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <Checkbox
                      checked={promotableRecords.length > 0 && selectedIds.size === promotableRecords.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-[10px] text-muted-foreground">Select all promotable ({promotableRecords.length})</span>
                  </div>
                    {feedbackRecords.map((fb: any) => (
                      <div
                        key={fb.id}
                        className={`border rounded-lg p-3 hover:bg-muted/20 transition-colors cursor-pointer ${fb.review_status === "ignored" ? "border-muted-foreground/30 opacity-60" : fb.review_status === "deleted" ? "border-destructive/30 opacity-40" : "border-border"}`}
                        onClick={() => setExpandedFeedback(expandedFeedback === fb.id ? null : fb.id)}
                      >
                        <div className="flex items-start gap-2">
                          {!fb.enhancement_id && (
                            <Checkbox
                              checked={selectedIds.has(fb.id)}
                              onCheckedChange={() => toggleSelect(fb.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-mono text-muted-foreground">{fb.case_reference}</span>
                                  <Badge variant="outline" className={SEVERITY_COLORS[fb.severity] || ""}>{fb.severity || "—"}</Badge>
                                  <Badge variant="outline" className="text-xs">{fb.feedback_type || fb.mode}</Badge>
                                   {fb.is_enhancement_candidate && (
                                     <Badge variant="outline" className="text-xs border-accent text-accent">Enhancement ✓</Badge>
                                   )}
                                   {fb.review_status === "ignored" && (
                                     <Badge variant="outline" className="text-xs border-muted-foreground text-muted-foreground">Ignored</Badge>
                                   )}
                                   {fb.review_status === "deleted" && (
                                     <Badge variant="outline" className="text-xs border-destructive text-destructive">Deleted</Badge>
                                   )}
                                </div>
                                <p className="text-sm text-foreground line-clamp-2">{fb.user_message}</p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {fb.user_name} · {new Date(fb.created_at).toLocaleString("en-GB")}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {fb.agent_assessment && (
                                  <span className={`text-xs font-medium ${ASSESSMENT_COLORS[fb.agent_assessment] || ""}`}>
                                    {fb.agent_assessment === "valid" ? "Valid" : fb.agent_assessment === "partially_valid" ? "Partial" : "Not Supported"}
                                  </span>
                                )}
                                {expandedFeedback === fb.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                            </div>
                            {expandedFeedback === fb.id && (
                              <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground">User Message:</span>
                                  <p className="text-xs mt-1 whitespace-pre-wrap">{fb.user_message}</p>
                                </div>
                                {fb.agent_response && (
                                  <div>
                                    <span className="text-xs font-medium text-muted-foreground">Agent Response:</span>
                                    <div className="mt-1 text-xs bg-muted/30 rounded p-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                                      {fb.agent_response}
                                    </div>
                                  </div>
                                )}
                                {fb.evidence_references && (
                                  <div>
                                    <span className="text-xs font-medium text-muted-foreground">Evidence:</span>
                                    <p className="text-xs mt-1">{fb.evidence_references}</p>
                                  </div>
                                )}
                                {fb.proposed_correction && (
                                  <div>
                                    <span className="text-xs font-medium text-muted-foreground">Proposed Correction:</span>
                                    <p className="text-xs mt-1">{fb.proposed_correction}</p>
                                  </div>
                                )}
                                {fb.enhancement_summary && (
                                  <div>
                                    <span className="text-xs font-medium text-muted-foreground">Enhancement Summary:</span>
                                    <p className="text-xs mt-1">{fb.enhancement_summary}</p>
                                  </div>
                                )}
                                {fb.review_status && fb.review_reason && (
                                  <div className="bg-muted/30 rounded p-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {fb.review_status === "ignored" ? "Ignored" : "Deleted"} reason:
                                    </span>
                                    <p className="text-xs mt-0.5">{fb.review_reason}</p>
                                    {fb.reviewed_at && (
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        {new Date(fb.reviewed_at).toLocaleString("en-GB")}
                                      </p>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                                   {!fb.enhancement_id && !fb.review_status && (
                                     <Button
                                       variant="outline"
                                       size="sm"
                                       className="gap-1.5 text-xs"
                                       onClick={(e) => { e.stopPropagation(); setPromoteTarget([fb]); }}
                                     >
                                       <ArrowUpRight size={14} /> Promote to Enhancement
                                     </Button>
                                   )}
                                   {fb.enhancement_id && (
                                     <span className="text-[10px] text-muted-foreground">Already promoted · {fb.enhancement_id.substring(0, 8)}</span>
                                   )}
                                   {!fb.review_status && (
                                     <>
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         className="gap-1.5 text-xs"
                                         onClick={(e) => { e.stopPropagation(); setDismissTarget({ id: fb.id, caseRef: fb.case_reference, action: "ignore" }); }}
                                       >
                                         <EyeOff size={14} /> Ignore
                                       </Button>
                                       <Button
                                         variant="outline"
                                         size="sm"
                                         className="gap-1.5 text-xs text-destructive hover:text-destructive"
                                         onClick={(e) => { e.stopPropagation(); setDismissTarget({ id: fb.id, caseRef: fb.case_reference, action: "delete" }); }}
                                       >
                                         <Trash2 size={14} /> Delete
                                       </Button>
                                     </>
                                   )}
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     className="gap-1.5 text-xs ml-auto"
                                     onClick={(e) => { e.stopPropagation(); generateFeedbackPrompt(fb); }}
                                   >
                                     <Wand2 size={14} /> Generate Lovable Prompt
                                   </Button>
                                 </div>
                                <p className="text-[10px] text-muted-foreground font-mono">ID: {fb.id}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Enhancement Backlog */}
          <TabsContent value="enhancements">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Developer Enhancement Backlog</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => exportCSV(enhancements, "enhancement_backlog.csv")}>
                  <Download size={14} /> Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                {enhancements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No enhancement items yet.</p>
                ) : (
                  <div className="space-y-2">
                    {enhancements.map((enh: any) => (
                      <div
                        key={enh.id}
                        className="border border-border rounded-lg p-3 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setExpandedEnhancement(expandedEnhancement === enh.id ? null : enh.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={
                                enh.priority === "P1" ? "border-risk-red text-risk-red" :
                                enh.priority === "P2" ? "border-risk-amber text-risk-amber" :
                                "border-muted-foreground text-muted-foreground"
                              }>{enh.priority}</Badge>
                              <Badge variant="outline" className="text-xs">{enh.category}</Badge>
                              <Badge variant="outline" className={
                                enh.status === "open" ? "border-accent text-accent" :
                                enh.status === "resolved" ? "border-risk-green text-risk-green" :
                                enh.status === "rejected" ? "border-risk-red text-risk-red" :
                                "border-risk-amber text-risk-amber"
                              }>{enh.status}</Badge>
                            </div>
                            <p className="text-sm font-medium text-foreground">{enh.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {enh.feedback_ids?.length || 0} feedback record(s) · {new Date(enh.created_at).toLocaleString("en-GB")}
                            </p>
                          </div>
                          {expandedEnhancement === enh.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                        {expandedEnhancement === enh.id && (
                          <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
                            <div><span className="text-xs font-medium text-muted-foreground">Problem:</span><p className="text-xs mt-1">{enh.problem_statement}</p></div>
                            <div><span className="text-xs font-medium text-muted-foreground">Proposed Change:</span><p className="text-xs mt-1">{enh.proposed_change}</p></div>
                            <div><span className="text-xs font-medium text-muted-foreground">Acceptance Criteria:</span><p className="text-xs mt-1">{enh.acceptance_criteria}</p></div>
                            <div><span className="text-xs font-medium text-muted-foreground">Risk Rationale:</span><p className="text-xs mt-1">{enh.risk_rationale}</p></div>
                            {enh.feedback_ids?.length > 0 && (
                              <div>
                                <span className="text-xs font-medium text-muted-foreground">Linked Feedback IDs:</span>
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {enh.feedback_ids.map((fid: string) => (
                                    <span key={fid} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{fid.substring(0, 8)}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-2 border-t border-border">
                              <span className="text-xs font-medium text-muted-foreground">Status:</span>
                              <Select
                                value={enh.status}
                                onValueChange={(val) => updateEnhancementStatus(enh.id, val)}
                              >
                                <SelectTrigger className="w-[140px] h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="resolved">Resolved</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs ml-auto"
                                onClick={(e) => { e.stopPropagation(); generateImplementationPrompt(enh); }}
                              >
                                <Wand2 size={14} /> Generate Lovable Prompt
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono">ID: {enh.id}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Metrics */}
          <TabsContent value="metrics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Feedback by Category</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(topCategories).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, count]) => (
                    <div key={cat} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <span className="text-sm capitalize">{cat.replace(/_/g, " ")}</span>
                      <span className="font-mono text-sm font-medium">{count as number}</span>
                    </div>
                  ))}
                  {Object.keys(topCategories).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Enhancement Summary</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {["open", "in_progress", "resolved", "rejected"].map((status) => {
                    const count = enhancements.filter((e: any) => e.status === status).length;
                    return (
                      <div key={status} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <span className="text-sm capitalize">{status.replace(/_/g, " ")}</span>
                        <span className="font-mono text-sm font-medium">{count}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
        {promoteTarget && (
          <PromoteToEnhancementDialog
            open={!!promoteTarget}
            onOpenChange={(open) => { if (!open) { setPromoteTarget(null); setSelectedIds(new Set()); } }}
            feedbackItems={Array.isArray(promoteTarget) ? promoteTarget : [promoteTarget]}
          />
        )}
        {dismissTarget && (
          <FeedbackDismissDialog
            open={!!dismissTarget}
            onOpenChange={(open) => { if (!open) setDismissTarget(null); }}
            action={dismissTarget.action}
            feedbackId={dismissTarget.id}
            caseReference={dismissTarget.caseRef}
            onConfirm={handleDismissFeedback}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default AdminFeedback;

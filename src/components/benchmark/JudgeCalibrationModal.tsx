import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Gavel, ShieldAlert, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface JudgeCalibrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparisonId: string;
  comparison: any;
}

export default function JudgeCalibrationModal({ open, onOpenChange, comparisonId, comparison }: JudgeCalibrationModalProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [verdict, setVerdict] = useState<"agree" | "disagree">("agree");
  const [notes, setNotes] = useState("");
  const [correctedPrecision, setCorrectedPrecision] = useState<string>(
    comparison?.precision_score != null ? String(Math.round(comparison.precision_score * 100)) : ""
  );
  const [correctedRecall, setCorrectedRecall] = useState<string>(
    comparison?.recall_score != null ? String(Math.round(comparison.recall_score * 100)) : ""
  );
  const [submitting, setSubmitting] = useState(false);

  // Fetch comparison items for this comparison
  const { data: compItems = [] } = useQuery({
    queryKey: ["audit_comp_items", comparisonId],
    enabled: open && !!comparisonId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_comparison_items")
        .select("*")
        .eq("comparison_id", comparisonId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch judge reviews for this comparison
  const { data: judgeReviews = [] } = useQuery({
    queryKey: ["audit_judge_reviews", comparisonId],
    enabled: open && !!comparisonId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_judge_reviews")
        .select("*")
        .eq("comparison_id", comparisonId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch existing calibration
  const { data: existingCalibration } = useQuery({
    queryKey: ["audit_calibration", comparisonId],
    enabled: open && !!comparisonId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_judge_calibration")
        .select("*")
        .eq("comparison_id", comparisonId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });

  // Fetch outputs for context
  const { data: outputs = [] } = useQuery({
    queryKey: ["audit_outputs", comparison?.benchmark_case_id],
    enabled: open && !!comparison?.benchmark_case_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("benchmark_outputs")
        .select("*")
        .eq("benchmark_case_id", comparison.benchmark_case_id)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const humanOutputs = outputs.filter((o: any) => o.output_type === "human");
  const aiOutputs = outputs.filter((o: any) => o.output_type === "ai");

  const handleSubmit = useCallback(async () => {
    if (!profile) return;

    // Art. 14 Anti-Automation Bias check for proactive cases
    // Fetch the benchmark case to check if it's proactive
    if (comparison?.benchmark_case_id && verdict === "agree") {
      const { data: benchCase } = await (supabase as any)
        .from("benchmark_cases")
        .select("trigger_context, source_type")
        .eq("id", comparison.benchmark_case_id)
        .maybeSingle();

      const isProactive = benchCase?.source_type === "dms_proactive" ||
        (benchCase?.trigger_context as any)?.trigger_type === "proactive";

      if (isProactive) {
        // Find a specific clause from comparison items for the warning
        const specificItem = compItems.find((ci: any) =>
          ci.difference_type !== "match" && ci.human_finding
        );
        const clauseRef = specificItem
          ? `"${specificItem.human_finding.slice(0, 80)}…"`
          : "all extracted findings";

        const confirmed = window.confirm(
          `⚠️ Article 14 Notice — Anti-Automation Bias Warning\n\n` +
          `Please independently verify the extraction of ${clauseRef} to prevent automation bias.\n\n` +
          `By proceeding, you confirm you have independently reviewed the AI's analysis and are not solely relying on the automated assessment.\n\n` +
          `Click OK to proceed or Cancel to review further.`
        );
        if (!confirmed) return;
      }
    }

    setSubmitting(true);
    try {
      const precisionFloat = verdict === "disagree" && correctedPrecision
        ? parseFloat(correctedPrecision) / 100
        : null;
      const recallFloat = verdict === "disagree" && correctedRecall
        ? parseFloat(correctedRecall) / 100
        : null;

      // Insert calibration record
      const { error: calErr } = await (supabase as any)
        .from("benchmark_judge_calibration")
        .insert({
          comparison_id: comparisonId,
          human_verdict: verdict,
          human_notes: notes || null,
          corrected_precision_score: precisionFloat,
          corrected_recall_score: recallFloat,
          audited_by: profile.user_id,
        });
      if (calErr) throw calErr;

      // If disagreeing, update the main comparison scores
      if (verdict === "disagree") {
        const updates: Record<string, any> = { is_audited: true };
        if (precisionFloat != null) updates.precision_score = Math.round(precisionFloat * 100) / 100;
        if (recallFloat != null) updates.recall_score = Math.round(recallFloat * 100) / 100;

        const { error: upErr } = await (supabase as any)
          .from("benchmark_comparisons")
          .update(updates)
          .eq("id", comparisonId);
        if (upErr) throw upErr;
      } else {
        // Mark as audited (agreed)
        await (supabase as any)
          .from("benchmark_comparisons")
          .update({ is_audited: true })
          .eq("id", comparisonId);
      }

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: profile.user_id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position,
        event_type: "benchmark_judge_calibrated",
        metadata: {
          comparison_id: comparisonId,
          verdict,
          corrected_precision: precisionFloat,
          corrected_recall: recallFloat,
        },
      });

      // Invalidate caches
      qc.invalidateQueries({ queryKey: ["benchmark_comparisons"] });
      qc.invalidateQueries({ queryKey: ["bm_dash_comparisons"] });
      qc.invalidateQueries({ queryKey: ["audit_calibration", comparisonId] });

      toast({ title: "Judge calibration saved", description: verdict === "disagree" ? "Scores corrected and comparison marked as audited." : "Comparison confirmed and marked as audited." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [profile, comparisonId, verdict, notes, correctedPrecision, correctedRecall, qc, toast, onOpenChange]);

  const DIFF_META: Record<string, { label: string; color: string }> = {
    match: { label: "Match", color: "text-green-700 dark:text-green-400" },
    ai_missed_material_issue: { label: "AI Missed", color: "text-red-700 dark:text-red-400" },
    ai_false_positive: { label: "False Positive", color: "text-orange-700 dark:text-orange-400" },
    data_extraction_error: { label: "Extraction Error", color: "text-red-700 dark:text-red-400" },
    severity_classification_error: { label: "Severity Mismatch", color: "text-amber-700 dark:text-amber-400" },
    action_recommendation_error: { label: "Action Error", color: "text-orange-700 dark:text-orange-400" },
    evidence_citation_failure: { label: "Citation Failure", color: "text-red-700 dark:text-red-400" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" />
            Audit Judge Decision
          </DialogTitle>
          <DialogDescription>
            Review the LLM Judge's reasoning against the human gold standard. Override scores if the judge hallucinated.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-5">
            {/* Current scores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Recall</p>
                  <p className="text-xl font-bold">{comparison?.recall_score != null ? `${Math.round(comparison.recall_score * 100)}%` : "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Precision</p>
                  <p className="text-xl font-bold">{comparison?.precision_score != null ? `${Math.round(comparison.precision_score * 100)}%` : "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Judge Status</p>
                  <Badge variant={comparison?.judge_status === "complete" ? "default" : "secondary"} className="text-[10px] capitalize mt-1">
                    {comparison?.judge_status || "—"}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Audited</p>
                  {comparison?.is_audited ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mt-1" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground mx-auto mt-1" />
                  )}
                </CardContent>
              </Card>
            </div>

            {existingCalibration && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Previously audited — verdict: <Badge variant="outline" className="text-[10px] capitalize">{existingCalibration.human_verdict}</Badge>
                  </p>
                  {existingCalibration.human_notes && <p className="text-xs text-muted-foreground mt-1">{existingCalibration.human_notes}</p>}
                </CardContent>
              </Card>
            )}

            {/* Side-by-side: Gold Standard vs AI Output */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Source Material</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Human Gold Standard</p>
                    <ScrollArea className="max-h-40">
                      {humanOutputs.length > 0 ? (
                        <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                          {humanOutputs.map((o: any) => o.content).join("\n\n---\n\n").slice(0, 3000)}
                        </pre>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No human output available</p>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">AI Agent Output</p>
                    <ScrollArea className="max-h-40">
                      {aiOutputs.length > 0 ? (
                        <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                          {aiOutputs.map((o: any) => o.content).join("\n\n---\n\n").slice(0, 3000)}
                        </pre>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No AI output available</p>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Judge Reasoning */}
            {judgeReviews.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">LLM Judge Reasoning ({judgeReviews.length} items)</h3>
                <div className="space-y-2">
                  {judgeReviews.map((jr: any, i: number) => {
                    const linkedItem = compItems.find((ci: any) => ci.id === jr.comparison_item_id);
                    const diffMeta = DIFF_META[linkedItem?.difference_type] || { label: "Unknown", color: "text-muted-foreground" };
                    return (
                      <Card key={jr.id}>
                        <CardContent className="py-3 px-4 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
                            <Badge variant={jr.judge_verdict === "ai_correct" ? "default" : jr.judge_verdict === "human_correct" ? "destructive" : "secondary"} className="text-[10px] capitalize">
                              {jr.judge_verdict?.replace(/_/g, " ")}
                            </Badge>
                            {linkedItem && <Badge variant="outline" className={`text-[10px] ${diffMeta.color}`}>{diffMeta.label}</Badge>}
                            {jr.confidence_score != null && (
                              <span className="text-[10px] text-muted-foreground">Confidence: {Math.round(jr.confidence_score * 100)}%</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{jr.judge_reasoning}</p>
                          {linkedItem && (
                            <div className="grid grid-cols-2 gap-2 mt-1 border-t pt-1.5">
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium">Human:</p>
                                <p className="text-[10px]">{linkedItem.human_finding || "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground font-medium">AI:</p>
                                <p className="text-[10px]">{linkedItem.ai_finding || "—"}</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Audit Verdict */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Your Audit Verdict</h3>

              <RadioGroup value={verdict} onValueChange={(v) => setVerdict(v as "agree" | "disagree")} className="flex gap-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="agree" id="agree" />
                  <Label htmlFor="agree" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> Agree with Judge
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="disagree" id="disagree" />
                  <Label htmlFor="disagree" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-destructive" /> Disagree — Correct Scores
                  </Label>
                </div>
              </RadioGroup>

              {verdict === "disagree" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Corrected Recall (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={correctedRecall}
                      onChange={(e) => setCorrectedRecall(e.target.value)}
                      className="mt-1"
                      placeholder="e.g. 85"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Corrected Precision (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={correctedPrecision}
                      onChange={(e) => setCorrectedPrecision(e.target.value)}
                      className="mt-1"
                      placeholder="e.g. 72"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Audit Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 min-h-[80px]"
                  placeholder="Explain your reasoning for agreeing or disagreeing with the judge's decision…"
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : <><Gavel className="h-4 w-4 mr-1" /> Submit Audit</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

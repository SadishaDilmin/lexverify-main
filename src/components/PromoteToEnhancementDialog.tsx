import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = [
  "prompt", "knowledge_base", "ui", "workflow",
  "risk_scoring", "document_intake", "lender_handbook",
];

const SEVERITY_TO_PRIORITY: Record<string, string> = {
  critical: "P1",
  major: "P2",
  minor: "P3",
};

interface FeedbackRecord {
  id: string;
  user_message: string;
  severity?: string | null;
  proposed_correction?: string | null;
  enhancement_summary?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedbackItems: FeedbackRecord[];
}

const PromoteToEnhancementDialog = ({ open, onOpenChange, feedbackItems }: Props) => {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const first = feedbackItems[0];
  const isBulk = feedbackItems.length > 1;

  const deriveTitle = () => {
    if (isBulk) return `Grouped feedback (${feedbackItems.length} items)`;
    return first.user_message.substring(0, 80);
  };

  const derivePriority = () => {
    const severities = feedbackItems.map((f) => f.severity || "");
    if (severities.includes("critical")) return "P1";
    if (severities.includes("major")) return "P2";
    return "P3";
  };

  const deriveProblem = () => {
    if (isBulk) {
      return feedbackItems
        .map((f, i) => `${i + 1}. ${f.user_message.substring(0, 120)}`)
        .join("\n");
    }
    return first.user_message;
  };

  const deriveProposed = () => {
    if (isBulk) {
      const items = feedbackItems
        .filter((f) => f.proposed_correction || f.enhancement_summary)
        .map((f) => f.proposed_correction || f.enhancement_summary);
      return items.length > 0 ? items.join("\n\n") : "";
    }
    return first.proposed_correction || first.enhancement_summary || "";
  };

  const [title, setTitle] = useState(deriveTitle);
  const [category, setCategory] = useState("prompt");
  const [priority, setPriority] = useState(derivePriority);
  const [problemStatement, setProblemStatement] = useState(deriveProblem);
  const [proposedChange, setProposedChange] = useState(deriveProposed);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [riskRationale, setRiskRationale] = useState("");

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const feedbackIds = feedbackItems.map((f) => f.id);

      const { data: enhancement, error: insertError } = await supabase
        .from("enhancement_backlog")
        .insert({
          title,
          category,
          priority,
          problem_statement: problemStatement,
          proposed_change: proposedChange,
          acceptance_criteria: acceptanceCriteria,
          risk_rationale: riskRationale,
          feedback_ids: feedbackIds,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Update all feedback records to link to this enhancement
      for (const fb of feedbackItems) {
        await supabase
          .from("agent_feedback")
          .update({
            is_enhancement_candidate: true,
            enhancement_id: enhancement.id,
          })
          .eq("id", fb.id);
      }

      toast.success(
        isBulk
          ? `${feedbackItems.length} feedback records promoted to enhancement backlog`
          : "Feedback promoted to enhancement backlog"
      );
      queryClient.invalidateQueries({ queryKey: ["admin_feedback"] });
      queryClient.invalidateQueries({ queryKey: ["enhancement_backlog"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to promote feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isBulk
              ? `Promote ${feedbackItems.length} Records to Enhancement`
              : "Promote to Enhancement"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs capitalize">
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 – Critical</SelectItem>
                  <SelectItem value="P2">P2 – Major</SelectItem>
                  <SelectItem value="P3">P3 – Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Problem Statement</Label>
            <Textarea value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} className="text-xs min-h-[60px]" />
          </div>
          <div>
            <Label className="text-xs">Proposed Change</Label>
            <Textarea value={proposedChange} onChange={(e) => setProposedChange(e.target.value)} className="text-xs min-h-[60px]" />
          </div>
          <div>
            <Label className="text-xs">Acceptance Criteria</Label>
            <Textarea value={acceptanceCriteria} onChange={(e) => setAcceptanceCriteria(e.target.value)} className="text-xs min-h-[60px]" placeholder="What must be true for this to be resolved?" />
          </div>
          <div>
            <Label className="text-xs">Risk Rationale</Label>
            <Textarea value={riskRationale} onChange={(e) => setRiskRationale(e.target.value)} className="text-xs min-h-[60px]" placeholder="Why does this matter / what's the risk?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? "Promoting…" : isBulk ? `Promote ${feedbackItems.length} Items` : "Promote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromoteToEnhancementDialog;

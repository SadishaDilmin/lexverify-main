import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, EyeOff, Trash2 } from "lucide-react";

interface FeedbackDismissDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "ignore" | "delete";
  feedbackId: string;
  caseReference: string;
  onConfirm: (feedbackId: string, action: "ignore" | "delete", reason: string) => Promise<void>;
}

const FeedbackDismissDialog = ({
  open, onOpenChange, action, feedbackId, caseReference, onConfirm,
}: FeedbackDismissDialogProps) => {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(feedbackId, action, reason.trim());
      setReason("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isIgnore = action === "ignore";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIgnore ? <EyeOff size={18} /> : <Trash2 size={18} />}
            {isIgnore ? "Ignore Feedback" : "Delete Feedback"}
          </DialogTitle>
          <DialogDescription>
            {isIgnore
              ? `This will mark feedback for case ${caseReference} as ignored. It will be hidden from the default view but retained for audit.`
              : `This will permanently mark feedback for case ${caseReference} as deleted. It will no longer appear in any view.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Reason <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isIgnore ? "Why is this feedback being ignored?" : "Why is this feedback being deleted?"}
            className="min-h-[80px] text-sm"
            maxLength={500}
          />
          <p className="text-[10px] text-muted-foreground">{reason.length}/500 characters</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isIgnore ? "secondary" : "destructive"}
            size="sm"
            onClick={handleConfirm}
            disabled={!reason.trim() || submitting}
            className="gap-1.5"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : isIgnore ? <EyeOff size={14} /> : <Trash2 size={14} />}
            {isIgnore ? "Ignore" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDismissDialog;

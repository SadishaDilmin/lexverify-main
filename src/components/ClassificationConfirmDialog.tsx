import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface ClassificationConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  documentCount: number;
  agentName: string;
}

export default function ClassificationConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  documentCount,
  agentName,
}: ClassificationConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
            Verify AI Classifications
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed space-y-2">
            <span className="block">
              {agentName} has automatically classified <strong className="text-foreground">{documentCount} document{documentCount !== 1 ? "s" : ""}</strong>.
            </span>
            <span className="block font-medium text-foreground">
              Please check that each document has been categorised correctly before proceeding.
            </span>
            <span className="block">
              Incorrect classifications may affect the accuracy of the AI analysis. You can override any label before confirming.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back &amp; Review</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            I've Checked — Proceed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

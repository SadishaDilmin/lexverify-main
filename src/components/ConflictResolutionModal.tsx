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

interface ConflictResolutionModalProps {
  open: boolean;
  onKeepMine: () => void;
  onUseServer: () => void;
  entityName?: string;
}

/**
 * ConflictResolutionModal — shown when useOptimisticSave detects a 409 conflict.
 * Provides two clear actions: force-save the client version or reload the server version.
 */
const ConflictResolutionModal = ({
  open,
  onKeepMine,
  onUseServer,
  entityName = "record",
}: ConflictResolutionModalProps) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-lg">Data Conflict Detected</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm leading-relaxed">
            This {entityName} has been modified by another user or in another tab since you
            started editing. Your changes conflict with the latest server version.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Keep My Version</strong> — overwrites the server with your local changes. The other user's edits will be lost.</p>
          <p><strong className="text-foreground">Use Server Version</strong> — discards your unsaved changes and reloads the latest data from the server.</p>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel
            onClick={onUseServer}
            className="border-border"
          >
            Use Server Version
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onKeepMine}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Keep My Version
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConflictResolutionModal;

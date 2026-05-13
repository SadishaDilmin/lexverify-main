import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UserX, Shield, Download, Loader2, AlertTriangle, CheckCircle2, XCircle, RotateCcw,
} from "lucide-react";
import type { UserStatus } from "./UserStatusBadge";
import type { ActionType } from "./UserActionDialogs";
import { type AppRole, ROLE_LABELS, assignableRoles } from "@/lib/roleHierarchy";

type BulkAction = "deactivate" | "suspend" | "activate" | "revoke_sessions" | "assign_role" | "export";

interface BulkActionToolbarProps {
  selectedIds: string[];
  selectedProfiles: Array<{ user_id: string; full_name: string; email: string; status?: string; active?: boolean }>;
  currentUserId: string;
  actorRole: string;
  onExecuteBulk: (action: ActionType, targetUserIds: string[]) => Promise<{ succeeded: number; failed: number }>;
  onAssignRoleBulk: (targetUserIds: string[], role: AppRole) => Promise<{ succeeded: number; failed: number }>;
  onExport: () => void;
  onClearSelection: () => void;
}

const BulkActionToolbar = ({
  selectedIds,
  selectedProfiles,
  currentUserId,
  actorRole,
  onExecuteBulk,
  onAssignRoleBulk,
  onExport,
  onClearSelection,
}: BulkActionToolbarProps) => {
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkRole, setBulkRole] = useState<AppRole>("user");
  const [result, setResult] = useState<{ succeeded: number; failed: number } | null>(null);

  if (selectedIds.length === 0) return null;

  // Filter out self from destructive actions
  const eligibleForDestructive = selectedProfiles.filter((p) => p.user_id !== currentUserId);
  const activeEligible = eligibleForDestructive.filter(
    (p) => (p as any).status === "active" || ((p as any).status === undefined && p.active)
  );

  const handleConfirm = async () => {
    setLoading(true);
    setResult(null);
    try {
      let res: { succeeded: number; failed: number };

      switch (confirmAction) {
        case "deactivate":
          res = await onExecuteBulk("deactivate", activeEligible.map((p) => p.user_id));
          break;
        case "suspend":
          res = await onExecuteBulk("suspend", eligibleForDestructive.map((p) => p.user_id));
          break;
        case "activate":
          res = await onExecuteBulk("activate", selectedProfiles.map((p) => p.user_id));
          break;
        case "revoke_sessions":
          res = await onExecuteBulk("revoke_sessions", selectedProfiles.map((p) => p.user_id));
          break;
        case "assign_role":
          res = await onAssignRoleBulk(selectedProfiles.map((p) => p.user_id), bulkRole);
          break;
        default:
          res = { succeeded: 0, failed: 0 };
      }

      setResult(res);
    } catch {
      setResult({ succeeded: 0, failed: selectedIds.length });
    } finally {
      setLoading(false);
    }
  };

  const closeConfirm = () => {
    setConfirmAction(null);
    setResult(null);
    if (result && result.succeeded > 0) {
      onClearSelection();
    }
  };

  const actionLabels: Record<BulkAction, { label: string; description: string }> = {
    deactivate: {
      label: "Deactivate Selected",
      description: `Deactivate ${activeEligible.length} eligible user(s). They will lose access but data is preserved.`,
    },
    suspend: {
      label: "Suspend Selected",
      description: `Suspend ${eligibleForDestructive.length} eligible user(s). They will be blocked immediately.`,
    },
    activate: {
      label: "Activate Selected",
      description: `Activate ${selectedIds.length} user(s). They will regain full platform access.`,
    },
    revoke_sessions: {
      label: "Revoke Sessions",
      description: `Revoke all active sessions for ${selectedIds.length} user(s). They will need to log in again.`,
    },
    assign_role: {
      label: "Assign Role",
      description: `Change the role of ${selectedIds.length} user(s).`,
    },
    export: {
      label: "Export Selected",
      description: "",
    },
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/5 border border-accent/20 rounded-lg">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <CheckCircle2 size={14} className="text-accent" />
          {selectedIds.length} selected
        </div>

        <div className="h-4 w-px bg-border mx-1" />

        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmAction("activate")}>
          <RotateCcw size={12} /> Activate
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmAction("deactivate")}>
          <UserX size={12} /> Deactivate
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-[hsl(var(--risk-amber))]" onClick={() => setConfirmAction("suspend")}>
          <Shield size={12} /> Suspend
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmAction("assign_role")}>
          Assign Role
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmAction("revoke_sessions")}>
          Revoke Sessions
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onExport}>
          <Download size={12} /> Export
        </Button>

        <div className="ml-auto">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onClearSelection}>
            <XCircle size={12} /> Clear
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && closeConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-[hsl(var(--risk-amber))]" />
              {confirmAction && actionLabels[confirmAction].label}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {confirmAction && actionLabels[confirmAction].description}
              {confirmAction === "deactivate" && eligibleForDestructive.length < selectedIds.length && (
                <span className="block mt-2 text-[hsl(var(--risk-amber))]">
                  Note: Your own account and admin accounts are excluded from this action.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmAction === "assign_role" && (
            <div className="py-2">
              <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as AppRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles(actorRole).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-[hsl(var(--risk-green))]" />
                <span>{result.succeeded} succeeded</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <XCircle size={14} className="text-destructive" />
                  <span>{result.failed} failed</span>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {result ? (
              <AlertDialogAction onClick={closeConfirm}>Done</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirm} disabled={loading}>
                  {loading ? <><Loader2 size={14} className="animate-spin mr-1" /> Processing…</> : "Confirm"}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BulkActionToolbar;

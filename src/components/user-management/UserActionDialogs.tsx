import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Trash2, Shield, Lock, UserX, KeyRound, LogOut, RotateCcw } from "lucide-react";
import type { UserStatus } from "./UserStatusBadge";

type ActionType =
  | "activate" | "deactivate" | "suspend" | "reinstate"
  | "lock" | "unlock" | "soft_delete" | "restore"
  | "permanent_delete" | "send_password_reset"
  | "force_password_reset" | "revoke_sessions";

interface UserActionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  action: ActionType;
  userName: string;
  userEmail: string;
  loading?: boolean;
}

const actionConfig: Record<ActionType, {
  title: string;
  description: (name: string) => string;
  confirmLabel: string;
  variant: "default" | "destructive" | "warning";
  icon: React.ElementType;
  requireReason?: boolean;
  requireTypedConfirmation?: boolean;
}> = {
  activate: {
    title: "Activate User",
    description: (n) => `This will restore full access for ${n}. They will be able to log in and use the platform.`,
    confirmLabel: "Activate",
    variant: "default",
    icon: RotateCcw,
  },
  deactivate: {
    title: "Deactivate User",
    description: (n) => `${n} will no longer be able to log in. Their data will be preserved. You can reactivate them at any time.`,
    confirmLabel: "Deactivate",
    variant: "warning",
    icon: UserX,
  },
  suspend: {
    title: "Suspend User",
    description: (n) => `${n} will be immediately blocked from accessing the platform. This is typically used for policy violations or investigations. A reason is required.`,
    confirmLabel: "Suspend User",
    variant: "destructive",
    icon: Shield,
    requireReason: true,
  },
  reinstate: {
    title: "Reinstate User",
    description: (n) => `This will lift the suspension on ${n}'s account and restore active access.`,
    confirmLabel: "Reinstate",
    variant: "default",
    icon: RotateCcw,
  },
  lock: {
    title: "Lock Account",
    description: (n) => `${n}'s account will be locked, preventing all login attempts. Use this for security concerns.`,
    confirmLabel: "Lock Account",
    variant: "destructive",
    icon: Lock,
  },
  unlock: {
    title: "Unlock Account",
    description: (n) => `This will unlock ${n}'s account and reset their failed login counter. They will be able to log in again.`,
    confirmLabel: "Unlock",
    variant: "default",
    icon: RotateCcw,
  },
  soft_delete: {
    title: "Archive User",
    description: (n) => `${n} will be archived and hidden from the active user list. Their data, audit history, and case associations will be preserved. You can restore them later.`,
    confirmLabel: "Archive User",
    variant: "destructive",
    icon: Trash2,
    requireReason: true,
  },
  restore: {
    title: "Restore User",
    description: (n) => `This will restore ${n} from the archive and reactivate their account.`,
    confirmLabel: "Restore User",
    variant: "default",
    icon: RotateCcw,
  },
  permanent_delete: {
    title: "Permanently Delete User",
    description: (n) => `⚠️ This action is IRREVERSIBLE. ${n}'s authentication account, profile, and all directly owned data will be permanently destroyed. Audit log entries will be retained for compliance. Cases and documents associated with this user will remain but will lose the owner reference.`,
    confirmLabel: "Delete Permanently",
    variant: "destructive",
    icon: Trash2,
    requireTypedConfirmation: true,
  },
  send_password_reset: {
    title: "Send Password Reset",
    description: (n) => `A password reset link will be generated for ${n}. This does not immediately change their password.`,
    confirmLabel: "Send Reset Link",
    variant: "default",
    icon: KeyRound,
  },
  force_password_reset: {
    title: "Force Password Reset",
    description: (n) => `${n} will be required to change their password on their next login. Their current sessions will remain active.`,
    confirmLabel: "Force Reset",
    variant: "warning",
    icon: KeyRound,
  },
  revoke_sessions: {
    title: "Revoke All Sessions",
    description: (n) => `All active sessions for ${n} will be terminated immediately. They will need to log in again on all devices.`,
    confirmLabel: "Revoke Sessions",
    variant: "destructive",
    icon: LogOut,
  },
};

const UserActionDialog = ({ open, onClose, onConfirm, action, userName, userEmail, loading }: UserActionDialogProps) => {
  const [reason, setReason] = useState("");
  const [typedConfirmation, setTypedConfirmation] = useState("");

  const config = actionConfig[action];
  const Icon = config.icon;

  const needsReason = config.requireReason;
  const needsTyped = config.requireTypedConfirmation;
  const typedTarget = userEmail;

  const canConfirm = (!needsReason || reason.trim().length >= 3)
    && (!needsTyped || typedConfirmation === typedTarget);

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
    setReason("");
    setTypedConfirmation("");
  };

  const handleClose = () => {
    setReason("");
    setTypedConfirmation("");
    onClose();
  };

  const variantClasses = {
    default: "",
    warning: "bg-[hsl(var(--risk-amber))] hover:bg-[hsl(var(--risk-amber))]/90 text-white border-0",
    destructive: "",
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {config.variant === "destructive" && <AlertTriangle size={18} className="text-destructive" />}
            {config.variant === "warning" && <AlertTriangle size={18} className="text-[hsl(var(--risk-amber))]" />}
            <Icon size={18} />
            {config.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {config.description(userName)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {needsReason && (
          <div className="space-y-1.5 py-2">
            <Label htmlFor="action-reason" className="text-xs font-medium">Reason *</Label>
            <Textarea
              id="action-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide a reason for this action…"
              className="min-h-[80px] text-sm"
            />
            {reason.length > 0 && reason.trim().length < 3 && (
              <p className="text-[11px] text-destructive">Reason must be at least 3 characters.</p>
            )}
          </div>
        )}

        {needsTyped && (
          <div className="space-y-1.5 py-2">
            <Label htmlFor="typed-confirm" className="text-xs font-medium">
              Type <span className="font-mono text-destructive">{typedTarget}</span> to confirm
            </Label>
            <Input
              id="typed-confirm"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              placeholder={typedTarget}
              className="font-mono text-sm"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={config.variant === "warning" ? variantClasses.warning : config.variant === "destructive" ? "" : ""}
          >
            {loading ? "Processing…" : config.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export type { ActionType };
export default UserActionDialog;

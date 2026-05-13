import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Ban, Lock, Mail } from "lucide-react";

export type UserStatus = "active" | "inactive" | "suspended" | "locked" | "pending_invite";

const statusConfig: Record<UserStatus, { label: string; className: string; icon: React.ElementType }> = {
  active: {
    label: "Active",
    className: "bg-[hsl(var(--risk-green-bg))] text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]",
    icon: CheckCircle2,
  },
  inactive: {
    label: "Inactive",
    className: "bg-muted text-muted-foreground border-border",
    icon: XCircle,
  },
  suspended: {
    label: "Suspended",
    className: "bg-[hsl(var(--risk-amber-bg))] text-[hsl(var(--risk-amber))] border-[hsl(var(--risk-amber))]",
    icon: Ban,
  },
  locked: {
    label: "Locked",
    className: "bg-[hsl(var(--risk-red-bg))] text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]",
    icon: Lock,
  },
  pending_invite: {
    label: "Pending Invite",
    className: "bg-[hsl(var(--risk-amber-bg))] text-[hsl(var(--risk-amber))] border-[hsl(var(--risk-amber))]",
    icon: Mail,
  },
};

interface UserStatusBadgeProps {
  status: UserStatus;
  className?: string;
}

const UserStatusBadge = ({ status, className }: UserStatusBadgeProps) => {
  const config = statusConfig[status] || statusConfig.inactive;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`text-[10px] h-5 gap-1 font-medium ${config.className} ${className ?? ""}`}>
      <Icon size={10} />
      {config.label}
    </Badge>
  );
};

export default UserStatusBadge;

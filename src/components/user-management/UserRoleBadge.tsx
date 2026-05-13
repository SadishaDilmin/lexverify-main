import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, Eye, HeadsetIcon, User } from "lucide-react";

export type AppRole = "super_admin" | "admin" | "support_admin" | "auditor" | "user";

const roleConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  super_admin: {
    label: "Super Admin",
    className: "border-[hsl(var(--warm))] text-[hsl(var(--warm))] bg-[hsl(var(--warm)/0.08)]",
    icon: ShieldCheck,
  },
  admin: {
    label: "Admin",
    className: "border-accent text-accent",
    icon: Shield,
  },
  support_admin: {
    label: "Support",
    className: "border-[hsl(var(--sage))] text-[hsl(var(--sage))]",
    icon: HeadsetIcon,
  },
  auditor: {
    label: "Auditor",
    className: "border-[hsl(var(--warm))] text-[hsl(var(--warm))]",
    icon: Eye,
  },
  user: {
    label: "User",
    className: "border-muted-foreground text-muted-foreground",
    icon: User,
  },
};

interface UserRoleBadgeProps {
  role: string;
  className?: string;
}

const UserRoleBadge = ({ role, className }: UserRoleBadgeProps) => {
  const config = roleConfig[role] || roleConfig.user;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`text-[10px] h-5 gap-1 font-medium ${config.className} ${className ?? ""}`}>
      <Icon size={10} />
      {config.label}
    </Badge>
  );
};

export default UserRoleBadge;

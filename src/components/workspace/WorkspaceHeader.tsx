import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface WorkspaceHeaderProps {
  agentName: string;
  agentIcon: LucideIcon;
  caseReference: string;
  propertyAddress: string;
  /** Extra context like tenure, transaction type */
  subtitle?: string;
  /** Right-side actions (badges, buttons) */
  actions?: ReactNode;
}

export default function WorkspaceHeader({
  agentName,
  agentIcon: Icon,
  caseReference,
  propertyAddress,
  subtitle,
  actions,
}: WorkspaceHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <Icon size={20} className="text-accent shrink-0" />
          <h1 className="text-xl font-bold font-mono text-foreground truncate">
            {caseReference}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {agentName} · {propertyAddress}
          {subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
      {actions && (
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

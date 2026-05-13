import { cn } from "@/lib/utils";
import type { CaseStatus } from "@/types";

const statusConfig: Record<CaseStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-secondary text-secondary-foreground" },
  documents_pending: { label: "Docs Pending", className: "bg-risk-amber-bg text-risk-amber" },
  review_ready: { label: "Review Ready", className: "bg-accent/10 text-accent" },
  review_complete: { label: "Review Complete", className: "bg-risk-green-bg text-risk-green" },
  completed: { label: "Completed", className: "bg-accent/10 text-accent font-semibold" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

const StatusBadge = ({ status }: { status: CaseStatus }) => {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
};

export default StatusBadge;

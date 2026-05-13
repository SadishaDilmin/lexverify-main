import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export interface InfoItem {
  label: string;
  value: string | ReactNode;
  onClick?: () => void;
}

interface WorkspaceInfoBarProps {
  items: InfoItem[];
  /** Agent-specific status card rendered at the end */
  statusCard?: ReactNode;
}

export default function WorkspaceInfoBar({ items, statusCard }: WorkspaceInfoBarProps) {
  const totalSlots = items.length + (statusCard ? 1 : 0);
  // Use responsive grid: 2 cols on mobile, adapt based on total slots
  const gridClass =
    totalSlots <= 4
      ? "grid-cols-2 sm:grid-cols-4"
      : totalSlots <= 6
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";

  return (
    <div className={`grid ${gridClass} gap-3`}>
      {items.map((item) => (
        <Card
          key={item.label}
          className={`border-border ${item.onClick ? "cursor-pointer hover:border-accent/40 transition-colors" : ""}`}
          onClick={item.onClick}
        >
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              {item.label}
            </div>
            <div className="text-sm font-medium text-foreground">{item.value}</div>
          </CardContent>
        </Card>
      ))}
      {statusCard}
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types";

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  size?: "sm" | "md";
}

const RiskBadge = ({ level, score, size = "md" }: RiskBadgeProps) => {
  const badgeClass = {
    green: "bg-risk-green-bg text-risk-green border-risk-green/20",
    amber: "bg-risk-amber-bg text-risk-amber border-risk-amber/20",
    red: "bg-risk-red-bg text-risk-red border-risk-red/20",
  }[level];

  const label = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        badgeClass
      )}
    >
      <span
        className={cn(
          "rounded-full",
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          level === "green" && "bg-risk-green",
          level === "amber" && "bg-risk-amber",
          level === "red" && "bg-risk-red"
        )}
      />
      {label}
      {score !== undefined && <span className="font-mono">({score})</span>}
    </span>
  );
};

export default RiskBadge;

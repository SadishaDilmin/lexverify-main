import { Link } from "react-router-dom";
import { Coins, Loader2 } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";

/**
 * Compact credit balance indicator for AI workspace pages.
 * Shows current balance with contextual colour and links to pricing.
 */
export default function CreditBadge() {
  const { data: credits, isLoading } = useCredits();

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/50 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        <span>Credits</span>
      </div>
    );
  }

  const balance = credits?.balance ?? 0;
  const isTrial = credits?.is_free_trial ?? false;
  const isCritical = balance <= 5;
  const isLow = balance <= 15;

  return (
    <Link
      to="/buy-credits"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors hover:opacity-80 ${
        isCritical
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : isLow
          ? "border-risk-amber/30 bg-risk-amber/10 text-risk-amber"
          : "border-accent/30 bg-accent/10 text-accent"
      }`}
      title="View credit balance"
    >
      <Coins size={12} />
      <span>{balance} credits</span>
      {isTrial && (
        <span className="ml-0.5 text-[9px] px-1 py-0.5 rounded bg-accent/20 font-semibold">Trial</span>
      )}
    </Link>
  );
}

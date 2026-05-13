import { Link } from "react-router-dom";
import { Gift, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FreeTrialBannerProps {
  variant?: "inline" | "compact" | "hero";
  className?: string;
}

const FreeTrialBanner = ({ variant = "inline", className = "" }: FreeTrialBannerProps) => {
  if (variant === "compact") {
    return (
      <Link
        to="/signup"
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium hover:bg-accent/20 transition-colors ${className}`}
      >
        <Gift size={14} />
        Try free — 100 credits
        <ArrowRight size={14} />
      </Link>
    );
  }

  if (variant === "hero") {
    return (
      <div className={`rounded-xl border border-accent/20 bg-accent/5 p-6 sm:p-8 text-center space-y-3 ${className}`}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium">
          <Gift size={15} />
          Free Trial
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-foreground">
          Try Olimey AI with 100 free credits
        </h3>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Experience AI-powered case review on real cases — no commitment, no credit card required.
        </p>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 mt-1">
          <Link to="/signup">
            <Gift size={16} /> Start Free Trial <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
    );
  }

  // Default inline
  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Gift size={20} className="text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Try Olimey AI free</p>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Get 100 free credits — enough for multiple full AI case reviews. No card required.
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5">
        <Link to="/signup" className="shrink-0">
          <Gift size={14} /> Start Free Trial
        </Link>
      </Button>
    </div>
  );
};

export default FreeTrialBanner;

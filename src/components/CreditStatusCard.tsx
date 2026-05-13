import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Coins, Sparkles, AlertTriangle, ArrowRight, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UserCredits } from "@/hooks/useCredits";

interface CreditStatusCardProps {
  credits: UserCredits;
}

const CreditStatusCard = ({ credits }: CreditStatusCardProps) => {
  const { balance, is_free_trial, trial_credits_granted } = credits;
  const pct = trial_credits_granted > 0 ? Math.round((balance / trial_credits_granted) * 100) : 0;
  const isLow = balance <= 15;
  const isCritical = balance <= 5;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <Card className={`border ${isCritical ? "border-destructive/40 bg-destructive/5" : isLow ? "border-risk-amber/40 bg-risk-amber/5" : "border-accent/20 bg-accent/5"}`}>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isCritical ? "bg-destructive/15" : isLow ? "bg-risk-amber/15" : "bg-accent/15"
              }`}>
                <Coins size={18} className={isCritical ? "text-destructive" : isLow ? "text-risk-amber" : "text-accent"} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-foreground">{balance}</span>
                  <span className="text-sm text-muted-foreground">credits remaining</span>
                </div>
                {is_free_trial && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Sparkles size={12} className="text-accent" />
                    <span className="text-xs font-medium text-accent">Free Trial</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground gap-1.5">
                <Link to="/transactions">
                  <History size={14} /> History
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-accent/30 text-accent hover:bg-accent/10 gap-1.5">
                <Link to="/pricing">
                  Buy Credits <ArrowRight size={14} />
                </Link>
              </Button>
            </div>
          </div>

          {is_free_trial && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Trial usage</span>
                <span>{trial_credits_granted - balance} / {trial_credits_granted} used</span>
              </div>
              <Progress value={100 - pct} className="h-1.5" />
            </div>
          )}

          {isLow && (
            <div className={`flex items-start gap-2 p-2.5 rounded-lg ${isCritical ? "bg-destructive/10" : "bg-risk-amber/10"}`}>
              <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${isCritical ? "text-destructive" : "text-risk-amber"}`} />
              <p className="text-xs text-muted-foreground">
                {isCritical
                  ? "You may not have enough credits to run an AI review on a new case. A standard review costs 5 credits."
                  : "Your credits are running low. Consider purchasing more before submitting complex cases."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default CreditStatusCard;

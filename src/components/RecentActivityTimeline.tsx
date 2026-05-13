import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  FileText,
  UserPlus,
  ShieldCheck,
  AlertTriangle,
  Brain,
  Upload,
  CreditCard,
  Pencil,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

const EVENT_META: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  case_created:            { icon: FileText,     label: "Case created",          color: "text-accent" },
  ai_review_started:       { icon: Brain,        label: "AI review started",     color: "text-accent" },
  ai_review_completed:     { icon: ShieldCheck,  label: "AI review completed",   color: "text-risk-green" },
  ai_report_modified:      { icon: Pencil,       label: "Report edited",         color: "text-accent" },
  document_uploaded:       { icon: Upload,        label: "Document uploaded",     color: "text-accent" },
  credits_purchased:       { icon: CreditCard,    label: "Credits purchased",     color: "text-risk-green" },
  fraud_alert_acknowledged:{ icon: AlertTriangle, label: "Fraud alert reviewed",  color: "text-risk-amber" },
  fraud_alert_unacknowledged:{ icon: AlertTriangle, label: "Fraud alert unreviewd", color: "text-risk-red" },
  exchange_guard_review_completed: { icon: ShieldCheck, label: "ExchangeGuard™ complete", color: "text-risk-green" },
  user_login:              { icon: UserPlus,      label: "Logged in",             color: "text-muted-foreground" },
};

const fallbackMeta = { icon: Activity, label: "Activity", color: "text-muted-foreground" };

const RecentActivityTimeline = memo(function RecentActivityTimeline() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, event_type, case_reference, user_name, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No recent activity yet — actions will appear here as you work.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-0">
            {events.map((evt, i) => {
              const meta = EVENT_META[evt.event_type] || { ...fallbackMeta, label: evt.event_type.replace(/_/g, " ") };
              const Icon = meta.icon;
              const timeAgo = formatDistanceToNow(new Date(evt.created_at), { addSuffix: true });

              return (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-start gap-3 py-2.5 relative"
                >
                  {/* Dot */}
                  <div className={`w-[30px] h-[30px] rounded-full bg-muted flex items-center justify-center shrink-0 z-10 ${meta.color}`}>
                    <Icon size={14} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-foreground leading-snug">
                      <span className="font-medium">{meta.label}</span>
                      {evt.case_reference && (
                        <>
                          {" — "}
                          <span className="font-mono text-accent text-xs">{evt.case_reference}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {evt.user_name} · {timeAgo}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <Link
          to="/audit-log"
          className="block text-center text-xs text-accent hover:underline mt-3 pt-3 border-t border-border"
        >
          View full audit log →
        </Link>
      </CardContent>
    </Card>
  );
});

export default RecentActivityTimeline;

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In Progress",
  review_complete: "Review Complete",
  completed: "Completed",
  closed: "Closed",
  uploading: "Uploading",
};

/**
 * Subscribes to real-time case status changes for the current user
 * and shows toast notifications when a case is updated.
 */
export function useCaseRealtimeToasts() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("case-status-toasts")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cases",
          filter: `conveyancer_id=eq.${user.id}`,
        },
        (payload) => {
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          const caseRef = (payload.new as any)?.case_reference;

          if (oldStatus && newStatus && oldStatus !== newStatus) {
            toast({
              title: `Case ${caseRef || ""} updated`,
              description: `Status changed to ${STATUS_LABELS[newStatus] || newStatus}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}

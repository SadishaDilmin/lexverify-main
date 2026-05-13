import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  collapsed?: boolean;
}

export default function ProactiveFeed({ collapsed = false }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["proactive_notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("proactive_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("proactive_notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proactive_notifications"] }),
  });

  const unread = notifications.filter((n: any) => !n.is_read).length;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent/50 transition-colors cursor-default">
            <Zap size={16} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground px-1">
                {unread}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{unread} AI Insights</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="border-t border-sidebar-border pt-2 mt-2">
      <div className="flex items-center gap-2 px-3 py-1">
        <Zap size={13} className="text-accent" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-sidebar-foreground/50">
          Recent AI Insights
        </span>
        {unread > 0 && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{unread}</Badge>
        )}
      </div>
      <ScrollArea className="max-h-40">
        <div className="px-2 space-y-1">
          {notifications.length === 0 ? (
            <p className="text-[11px] text-sidebar-foreground/40 px-2 py-2">No insights yet.</p>
          ) : (
            notifications.slice(0, 5).map((n: any) => (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-md text-xs cursor-pointer transition-colors",
                  n.is_read
                    ? "text-sidebar-foreground/50"
                    : "text-sidebar-foreground bg-sidebar-accent/30"
                )}
                onClick={() => !n.is_read && markRead.mutate(n.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{n.title}</p>
                  <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!n.is_read && <Check size={12} className="shrink-0 mt-0.5 text-accent" />}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

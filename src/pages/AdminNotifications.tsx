import { useState, useCallback, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, CheckCheck, Trash2, Filter } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const EVENT_TYPE_LABELS: Record<string, string> = {
  regression_test_complete: "Regression Test",
  auto_deploy_prompt_version: "Auto-Deploy",
  benchmark_evaluation: "Benchmark Evaluation",
  batch_evaluation_complete: "Batch Evaluation",
  sow_flow_probe_failure: "SoW Flow Probe",
  all: "All Types",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  regression_test_complete: "bg-primary/10 text-primary",
  auto_deploy_prompt_version: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  benchmark_evaluation: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  batch_evaluation_complete: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  sow_flow_probe_failure: "bg-destructive/10 text-destructive",
};

export default function AdminNotifications() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [eventFilter, setEventFilter] = useState("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["admin_notifications_all", eventFilter, readFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (eventFilter !== "all") {
        query = query.eq("event_type", eventFilter);
      }
      if (readFilter === "unread") {
        query = query.eq("read", false);
      } else if (readFilter === "read") {
        query = query.eq("read", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("admin-notifs-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const markAsRead = useCallback(async (id: string) => {
    await (supabase as any).from("admin_notifications").update({ read: true }).eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["bm_dash_notifications"] });
  }, [refetch, qc]);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n: any) => !n.read).map((n: any) => n.id);
    if (unreadIds.length === 0) return;
    await (supabase as any).from("admin_notifications").update({ read: true }).in("id", unreadIds);
    refetch();
    qc.invalidateQueries({ queryKey: ["bm_dash_notifications"] });
    toast({ title: `${unreadIds.length} notification(s) marked as read` });
  }, [notifications, refetch, qc, toast]);

  // Get unique event types for the filter
  const eventTypes = [...new Set(notifications.map((n: any) => n.event_type))];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {eventTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {EVENT_TYPE_LABELS[type] || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={readFilter} onValueChange={(v) => setReadFilter(v as any)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto">
            {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Notification list */}
        <Card>
          <ScrollArea className="max-h-[70vh]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Bell className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No notifications found</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n: any) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markAsRead(n.id)}
                    className={`w-full text-left px-5 py-4 hover:bg-muted/50 transition-colors ${
                      !n.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read && (
                        <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                      )}
                      <div className={!n.read ? "" : "ml-[22px]"}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{n.title}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              EVENT_TYPE_COLORS[n.event_type] || ""
                            }`}
                          >
                            {EVENT_TYPE_LABELS[n.event_type] || n.event_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {format(new Date(n.created_at), "dd MMM yyyy · HH:mm")}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </AppLayout>
  );
}

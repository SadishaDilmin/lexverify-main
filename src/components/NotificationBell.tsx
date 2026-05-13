import { useState, useEffect, useCallback } from "react";
import { Bell, Check, X, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  event_type: string;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("admin_notifications")
      .select("id, title, message, event_type, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notif-bell")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 20));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    await supabase.from("admin_notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("admin_notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-muted/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-muted-foreground" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground px-1"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={markAllRead}>
                      <Check size={12} className="mr-1" /> Mark all read
                    </Button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 hover:bg-muted rounded">
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors",
                        !n.read && "bg-accent/5"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />
                        )}
                        <div className={cn("flex-1 min-w-0", n.read && "ml-4")}>
                          <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                          <span className="text-[10px] text-muted-foreground/60 mt-1 block">{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

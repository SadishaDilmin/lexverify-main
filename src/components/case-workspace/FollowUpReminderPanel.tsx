import { useState, useCallback } from "react";
import { Bell, Clock, Plus, Trash2, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FollowUpReminderPanelProps {
  caseId: string;
  userId: string;
}

export default function FollowUpReminderPanel({ caseId, userId }: FollowUpReminderPanelProps) {
  const [threshold, setThreshold] = useState("7");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["follow_up_reminders", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_up_reminders")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!caseId,
  });

  const createReminder = useCallback(async () => {
    setCreating(true);
    try {
      const days = parseInt(threshold);
      const nextReminder = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await supabase.from("follow_up_reminders").insert({
        case_id: caseId,
        threshold_days: days,
        next_reminder_at: nextReminder,
        created_by: userId,
      });
      if (error) throw error;
      toast({ title: "Reminder set", description: `Follow-up reminder set for ${days} days.` });
      queryClient.invalidateQueries({ queryKey: ["follow_up_reminders", caseId] });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [caseId, threshold, userId, queryClient, toast]);

  const deleteReminder = async (id: string) => {
    await supabase.from("follow_up_reminders").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["follow_up_reminders", caseId] });
  };

  const activeReminders = reminders.filter((r: any) => r.is_active);
  const overdueReminders = activeReminders.filter((r: any) => new Date(r.next_reminder_at) < new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell size={14} className="text-accent" />
          Follow-Up Reminders
          {overdueReminders.length > 0 && (
            <Badge className="text-[9px] h-4 bg-[hsl(var(--risk-red))]/10 text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]/20">
              {overdueReminders.length} overdue
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Create new reminder */}
        <div className="flex items-center gap-2">
          <Select value={threshold} onValueChange={setThreshold}>
            <SelectTrigger className="h-7 text-[10px] w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 days</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="text-[10px] h-7 gap-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={createReminder} disabled={creating}>
            {creating ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
            Add Reminder
          </Button>
        </div>

        {/* Reminder list */}
        {reminders.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-1">No reminders set for this case.</p>
        ) : (
          <div className="space-y-1.5">
            {reminders.map((r: any) => {
              const isOverdue = r.is_active && new Date(r.next_reminder_at) < new Date();
              const isDone = !r.is_active || r.send_count >= r.max_sends;
              return (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] ${
                  isOverdue ? "border-[hsl(var(--risk-red))]/20 bg-[hsl(var(--risk-red))]/5" :
                  isDone ? "border-border/50 bg-muted/20 opacity-60" :
                  "border-border bg-background"
                }`}>
                  {isOverdue ? (
                    <AlertTriangle size={12} className="text-[hsl(var(--risk-red))] shrink-0" />
                  ) : isDone ? (
                    <CheckCircle2 size={12} className="text-[hsl(var(--risk-green))] shrink-0" />
                  ) : (
                    <Clock size={12} className="text-accent shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">
                      {r.threshold_days}-day follow-up
                    </span>
                    <p className="text-[9px] text-muted-foreground">
                      {isOverdue ? "Overdue — " : "Due "}
                      {new Date(r.next_reminder_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {r.send_count > 0 && ` · Sent ${r.send_count}/${r.max_sends}`}
                    </p>
                  </div>
                  {r.is_active && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive/60 hover:text-destructive" onClick={() => deleteReminder(r.id)}>
                      <Trash2 size={10} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, Briefcase, Building2, Calendar, Clock, ShieldAlert,
  Lock, Activity, History, User as UserIcon, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import UserStatusBadge, { type UserStatus } from "./UserStatusBadge";
import UserRoleBadge from "./UserRoleBadge";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  position: string;
  firm_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  status?: UserStatus;
  last_login_at?: string | null;
  failed_login_attempts?: number;
  locked_at?: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  created_by?: string | null;
  deleted_at?: string | null;
  department?: string | null;
}

interface UserDetailPanelProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  userRole: string;
  onEdit: () => void;
}

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2">
    <Icon size={14} className="text-muted-foreground mt-0.5 shrink-0" />
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground mt-0.5">{value || "—"}</div>
    </div>
  </div>
);

const UserDetailPanel = ({ open, onClose, profile, userRole, onEdit }: UserDetailPanelProps) => {
  if (!profile) return null;

  const userStatus: UserStatus = (profile as any).status ?? (profile.active ? "active" : "inactive");

  // Fetch audit log entries for this user
  const { data: auditEntries = [], isLoading: auditLoading } = useQuery({
    queryKey: ["user_audit_log", profile.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: open && !!profile.user_id,
  });

  // Fetch status history
  const { data: statusHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["user_status_history", profile.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_status_history")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: open && !!profile.user_id,
  });

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[520px] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${userStatus === "active" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
                {profile.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <SheetTitle className="text-lg">{profile.full_name}</SheetTitle>
                <SheetDescription className="text-sm">{profile.email}</SheetDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
              <Pencil size={12} /> Edit
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <UserStatusBadge status={userStatus} />
            <UserRoleBadge role={userRole} />
          </div>
        </SheetHeader>

        <Tabs defaultValue="profile" className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-transparent border-b border-border rounded-none px-6 justify-start h-10">
            <TabsTrigger value="profile" className="gap-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none">
              <UserIcon size={12} /> Profile
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none">
              <Activity size={12} /> Activity
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:shadow-none">
              <History size={12} /> Status History
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            {/* Profile Tab */}
            <TabsContent value="profile" className="px-6 py-4 mt-0 space-y-1">
              <InfoRow icon={Mail} label="Email" value={profile.email} />
              <InfoRow icon={Briefcase} label="Position" value={profile.position} />
              <InfoRow icon={Building2} label="Firm" value={profile.firm_name} />
              <InfoRow icon={Building2} label="Department" value={(profile as any).department} />

              <Separator className="my-3" />

              <InfoRow icon={Calendar} label="Created" value={formatDate(profile.created_at)} />
              <InfoRow icon={Calendar} label="Last Updated" value={formatDate(profile.updated_at)} />
              <InfoRow icon={Clock} label="Last Login" value={formatDate((profile as any).last_login_at)} />

              <Separator className="my-3" />

              <InfoRow icon={ShieldAlert} label="Failed Login Attempts" value={String((profile as any).failed_login_attempts ?? 0)} />
              {(profile as any).locked_at && (
                <InfoRow icon={Lock} label="Locked At" value={formatDate((profile as any).locked_at)} />
              )}
              {(profile as any).suspended_at && (
                <>
                  <InfoRow icon={Lock} label="Suspended At" value={formatDate((profile as any).suspended_at)} />
                  <InfoRow icon={Lock} label="Suspend Reason" value={(profile as any).suspended_reason} />
                </>
              )}
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="px-6 py-4 mt-0">
              {auditLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))}
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No activity recorded yet</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {auditEntries.map((entry, i) => (
                    <div key={entry.id} className="relative pl-6 pb-4">
                      {/* Timeline line */}
                      {i < auditEntries.length - 1 && (
                        <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
                      )}
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-accent bg-background" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDate(entry.created_at)}
                        </div>
                        <div className="text-sm text-foreground font-medium mt-0.5">
                          {entry.event_type.replace(/_/g, " ")}
                        </div>
                        {entry.case_reference && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Case: {entry.case_reference}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Status History Tab */}
            <TabsContent value="history" className="px-6 py-4 mt-0">
              {historyLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  ))}
                </div>
              ) : statusHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No status changes recorded</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {statusHistory.map((entry: any, i: number) => (
                    <div key={entry.id} className="relative pl-6 pb-4">
                      {i < statusHistory.length - 1 && (
                        <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
                      )}
                      <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-[hsl(var(--warm))] bg-background" />
                      <div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDate(entry.created_at)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {entry.old_status && (
                            <UserStatusBadge status={entry.old_status} />
                          )}
                          <span className="text-xs text-muted-foreground">→</span>
                          <UserStatusBadge status={entry.new_status} />
                        </div>
                        {entry.reason && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Reason: {entry.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default UserDetailPanel;

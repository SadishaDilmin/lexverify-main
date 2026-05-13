import { useState, useMemo, useCallback } from "react";
import {
  Users, UserCheck, UserX, Clock, Shield, Mail, Search,
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2,
  CheckCircle2, XCircle, MoreHorizontal, UserPlus, Eye, Pencil,
  Trash2, KeyRound, LogOut, Lock, RotateCcw, Archive, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import UserStatusBadge, { type UserStatus } from "@/components/user-management/UserStatusBadge";
import UserRoleBadge from "@/components/user-management/UserRoleBadge";
import UserDetailPanel from "@/components/user-management/UserDetailPanel";
import CreateUserDialog from "@/components/user-management/CreateUserDialog";
import EditUserForm from "@/components/user-management/EditUserForm";
import UserActionDialog, { type ActionType } from "@/components/user-management/UserActionDialogs";
import BulkActionToolbar from "@/components/user-management/BulkActionToolbar";
import { getPermissions, type AppRole } from "@/lib/roleHierarchy";

type SortField = "full_name" | "email" | "created_at" | "last_login_at" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const AdminUsers = () => {
  const { role, user: authUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const perms = getPermissions(role ?? "user");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Panel states
  const [detailProfile, setDetailProfile] = useState<any | null>(null);
  const [editProfile, setEditProfile] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    action: ActionType;
    profile: any;
  } | null>(null);

  // Bulk selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Fetch profiles
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["admin_profiles", showArchived],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (showArchived) {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: perms.canViewUsers,
  });

  // Fetch all user roles
  const { data: userRoles = [] } = useQuery({
    queryKey: ["admin_user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
    enabled: perms.canViewUsers,
  });

  // Fetch pending access requests
  const { data: accessRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["access_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: perms.canViewUsers,
  });

  // Fetch invitations
  const { data: invitations = [] } = useQuery({
    queryKey: ["admin_invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_invitations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: perms.canViewUsers,
  });

  const roleMap = useMemo(() => {
    const m: Record<string, string> = {};
    userRoles.forEach((r) => { m[r.user_id] = r.role; });
    return m;
  }, [userRoles]);

  const getUserRole = (userId: string) => roleMap[userId] ?? "user";

  // Filter + search + sort
  const filtered = useMemo(() => {
    let list = profiles.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.full_name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q) && !(p.firm_name ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter !== "all") {
        const pStatus = (p as any).status ?? (p.active ? "active" : "inactive");
        if (pStatus !== statusFilter) return false;
      }
      if (roleFilter !== "all" && getUserRole(p.user_id) !== roleFilter) return false;
      return true;
    });

    list.sort((a, b) => {
      let av: any, bv: any;
      if (sortField === "full_name") { av = a.full_name.toLowerCase(); bv = b.full_name.toLowerCase(); }
      else if (sortField === "email") { av = a.email.toLowerCase(); bv = b.email.toLowerCase(); }
      else if (sortField === "created_at") { av = a.created_at; bv = b.created_at; }
      else if (sortField === "last_login_at") { av = (a as any).last_login_at ?? ""; bv = (b as any).last_login_at ?? ""; }
      else if (sortField === "status") {
        av = (a as any).status ?? (a.active ? "active" : "inactive");
        bv = (b as any).status ?? (b.active ? "active" : "inactive");
      }
      else { av = ""; bv = ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [profiles, search, statusFilter, roleFilter, sortField, sortDir, roleMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const setSearchAndReset = (v: string) => { setSearch(v); setPage(0); };
  const setStatusAndReset = (v: string) => { setStatusFilter(v); setPage(0); };
  const setRoleAndReset = (v: string) => { setRoleFilter(v); setPage(0); };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown size={12} className="text-muted-foreground/50" />;
    return sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // Selection helpers
  const toggleSelect = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === paginated.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(paginated.map((p) => p.user_id)));
    }
  };

  const selectedProfiles = useMemo(
    () => profiles.filter((p) => selectedUserIds.has(p.user_id)),
    [profiles, selectedUserIds]
  );

  // Edge function action handler
  const executeAction = async (action: ActionType, targetUserId: string, reason?: string) => {
    setActionLoading(targetUserId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-actions", {
        body: { action, target_user_id: targetUserId, reason },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const labels: Record<string, string> = {
        activate: "User activated",
        deactivate: "User deactivated",
        suspend: "User suspended",
        reinstate: "User reinstated",
        lock: "Account locked",
        unlock: "Account unlocked",
        soft_delete: "User archived",
        restore: "User restored",
        permanent_delete: "User permanently deleted",
        send_password_reset: "Password reset link sent",
        force_password_reset: "Password reset enforced on next login",
        revoke_sessions: "All sessions revoked",
      };

      toast({ title: labels[action] ?? "Action completed", description: "The action was performed successfully." });
      queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin_user_roles"] });
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
      setActionDialog(null);
    }
  };

  // Bulk action handler
  const executeBulkAction = useCallback(async (action: ActionType, targetUserIds: string[]): Promise<{ succeeded: number; failed: number }> => {
    let succeeded = 0;
    let failed = 0;

    for (const uid of targetUserIds) {
      try {
        const { data, error } = await supabase.functions.invoke("admin-user-actions", {
          body: { action, target_user_id: uid, reason: `Bulk action: ${action}` },
        });
        if (error || data?.error) { failed++; } else { succeeded++; }
      } catch {
        failed++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
    queryClient.invalidateQueries({ queryKey: ["admin_user_roles"] });

    if (succeeded > 0) {
      toast({ title: "Bulk action complete", description: `${succeeded} succeeded, ${failed} failed.` });
    }

    return { succeeded, failed };
  }, [queryClient, toast]);

  // Bulk role assignment
  const assignRoleBulk = useCallback(async (targetUserIds: string[], newRole: AppRole): Promise<{ succeeded: number; failed: number }> => {
    let succeeded = 0;
    let failed = 0;

    for (const uid of targetUserIds) {
      try {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole as any })
          .eq("user_id", uid);
        if (error) { failed++; } else { succeeded++; }
      } catch {
        failed++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["admin_user_roles"] });
    if (succeeded > 0) {
      toast({ title: "Roles updated", description: `${succeeded} user(s) updated to ${newRole}.` });
    }

    return { succeeded, failed };
  }, [queryClient, toast]);

  // CSV Export
  const exportUsersCsv = useCallback(() => {
    const dataToExport = selectedUserIds.size > 0 ? selectedProfiles : filtered;
    const headers = ["Full Name", "Email", "Role", "Status", "Firm", "Position", "Department", "Last Login", "Created"];
    const rows = dataToExport.map((p) => [
      p.full_name,
      p.email,
      getUserRole(p.user_id),
      (p as any).status ?? (p.active ? "active" : "inactive"),
      p.firm_name ?? "",
      p.position ?? "",
      (p as any).department ?? "",
      (p as any).last_login_at ? new Date((p as any).last_login_at).toISOString() : "",
      new Date(p.created_at).toISOString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export complete", description: `${dataToExport.length} user(s) exported to CSV.` });
  }, [filtered, selectedProfiles, selectedUserIds, getUserRole, toast]);

  const openAction = (action: ActionType, profile: any) => {
    setActionDialog({ action, profile });
  };

  const handleRequestAction = async (requestId: string, action: "approved" | "rejected") => {
    setActionLoading(requestId);
    try {
      const { error } = await supabase
        .from("access_requests")
        .update({ status: action, reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
      toast({
        title: action === "approved" ? "Request approved" : "Request rejected",
        description: action === "approved"
          ? "The user has been notified. They can now create an account."
          : "The access request has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["access_requests"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    setActionLoading(inviteId);
    try {
      const { error } = await supabase
        .from("user_invitations")
        .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", inviteId);
      if (error) throw error;
      toast({ title: "Invitation resent", description: "The invitation expiry has been extended." });
      queryClient.invalidateQueries({ queryKey: ["admin_invitations"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setActionLoading(inviteId);
    try {
      const { error } = await supabase
        .from("user_invitations")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", inviteId);
      if (error) throw error;
      toast({ title: "Invitation cancelled", description: "The invitation has been revoked." });
      queryClient.invalidateQueries({ queryKey: ["admin_invitations"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // Counts
  const pendingRequests = accessRequests.filter((r) => r.status === "pending");
  const activeCount = profiles.filter((p) => (p as any).status === "active" || ((p as any).status === undefined && p.active)).length;
  const inactiveCount = profiles.filter((p) => (p as any).status === "inactive" || ((p as any).status === undefined && !p.active)).length;
  const suspendedCount = profiles.filter((p) => (p as any).status === "suspended").length;
  const pendingInviteCount = invitations.filter((i) => i.status === "pending").length;

  if (!perms.canViewUsers) {
    return (
      <AppLayout>
        <div className="text-center py-24 text-muted-foreground">
          <Shield size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Access Denied</p>
          <p className="text-sm">You need administrator privileges to view this page.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage users, roles, and access requests</p>
          </div>
          <div className="flex items-center gap-2">
            {perms.canExportUsers && (
              <Button variant="outline" onClick={exportUsersCsv} className="gap-1.5">
                <Download size={14} /> Export
              </Button>
            )}
            {perms.canCreateUsers && (
              <Button onClick={() => setShowCreate(true)} className="gap-1.5">
                <UserPlus size={14} /> Add User
              </Button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total Users", value: profiles.length, icon: Users, color: "text-accent" },
            { label: "Active", value: activeCount, icon: UserCheck, color: "text-[hsl(var(--risk-green))]" },
            { label: "Inactive", value: inactiveCount, icon: UserX, color: "text-muted-foreground" },
            { label: "Suspended", value: suspendedCount, icon: Shield, color: "text-[hsl(var(--risk-amber))]" },
            { label: "Pending Invites", value: pendingInviteCount, icon: Mail, color: "text-[hsl(var(--risk-amber))]" },
          ].map((item) => (
            <Card key={item.label} className="border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <item.icon size={20} className={item.color} />
                <div>
                  <div className="text-2xl font-bold text-foreground">{item.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="users" className="gap-1.5">
              <Users size={14} /> Users
            </TabsTrigger>
            <TabsTrigger value="invitations" className="gap-1.5">
              <Mail size={14} /> Invitations
              {pendingInviteCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {pendingInviteCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">
              <Clock size={14} /> Access Requests
              {pendingRequests.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-3">
            {/* Bulk action toolbar */}
            {perms.canBulkActions && (
              <BulkActionToolbar
                selectedIds={Array.from(selectedUserIds)}
                selectedProfiles={selectedProfiles}
                currentUserId={authUser?.id ?? ""}
                actorRole={role ?? "user"}
                onExecuteBulk={executeBulkAction}
                onAssignRoleBulk={assignRoleBulk}
                onExport={exportUsersCsv}
                onClearSelection={() => setSelectedUserIds(new Set())}
              />
            )}

            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {showArchived ? (
                      <>
                        <Archive size={16} className="text-muted-foreground" />
                        Archived Users
                      </>
                    ) : (
                      "Registered Users"
                    )}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search name, email, firm…"
                        value={search}
                        onChange={(e) => setSearchAndReset(e.target.value)}
                        className="pl-8 h-8 w-[200px] text-sm"
                      />
                    </div>
                    {!showArchived && (
                      <>
                        <Select value={statusFilter} onValueChange={setStatusAndReset}>
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="locked">Locked</SelectItem>
                            <SelectItem value="pending_invite">Pending Invite</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={roleFilter} onValueChange={setRoleAndReset}>
                          <SelectTrigger className="h-8 w-[110px] text-xs">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="support_admin">Support</SelectItem>
                            <SelectItem value="auditor">Auditor</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    <Button
                      variant={showArchived ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => { setShowArchived(!showArchived); setPage(0); setSelectedUserIds(new Set()); }}
                    >
                      <Archive size={12} />
                      {showArchived ? "View Active" : "Archived"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {profilesLoading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton className="h-4 w-[180px]" />
                          <Skeleton className="h-3 w-[250px]" />
                        </div>
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-14" />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    {showArchived ? (
                      <>
                        <Archive size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No archived users</p>
                        <p className="text-xs mt-1">Users you archive will appear here.</p>
                      </>
                    ) : (
                      <>
                        <Users size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No users match your filters</p>
                        <p className="text-xs mt-1">Try adjusting your search or filter criteria.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            {perms.canBulkActions && !showArchived && (
                              <TableHead className="w-[40px]">
                                <Checkbox
                                  checked={paginated.length > 0 && selectedUserIds.size === paginated.length}
                                  onCheckedChange={toggleSelectAll}
                                  aria-label="Select all users on this page"
                                />
                              </TableHead>
                            )}
                            <TableHead className="w-[260px]">
                              <button onClick={() => toggleSort("full_name")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Name <SortIcon field="full_name" />
                              </button>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">
                              <button onClick={() => toggleSort("email")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Email <SortIcon field="email" />
                              </button>
                            </TableHead>
                            <TableHead className="w-[90px]">Role</TableHead>
                            <TableHead className="w-[120px]">
                              <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Status <SortIcon field="status" />
                              </button>
                            </TableHead>
                            <TableHead className="hidden lg:table-cell w-[140px]">Firm</TableHead>
                            <TableHead className="hidden xl:table-cell w-[130px]">
                              <button onClick={() => toggleSort("last_login_at")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Last Login <SortIcon field="last_login_at" />
                              </button>
                            </TableHead>
                            <TableHead className="hidden lg:table-cell w-[110px]">
                              <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Created <SortIcon field="created_at" />
                              </button>
                            </TableHead>
                            <TableHead className="w-[60px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginated.map((p) => {
                            const uRole = getUserRole(p.user_id);
                            const userStatus: UserStatus = (p as any).status ?? (p.active ? "active" : "inactive");
                            const lastLogin = (p as any).last_login_at;
                            const isArchived = !!(p as any).deleted_at;
                            const isSelf = p.user_id === authUser?.id;
                            const isSelected = selectedUserIds.has(p.user_id);

                            return (
                              <TableRow
                                key={p.id}
                                className={`cursor-pointer ${isSelected ? "bg-accent/5" : ""}`}
                                onClick={() => setDetailProfile(p)}
                              >
                                {perms.canBulkActions && !showArchived && (
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSelect(p.user_id)}
                                      aria-label={`Select ${p.full_name}`}
                                    />
                                  </TableCell>
                                )}
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isArchived ? "bg-muted text-muted-foreground opacity-50" : userStatus === "active" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
                                      {p.full_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <span className={`text-sm font-medium truncate block ${isArchived ? "text-muted-foreground line-through" : "text-foreground"}`}>{p.full_name}</span>
                                      <span className="text-xs text-muted-foreground md:hidden truncate block">{p.email}</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <span className="text-sm text-muted-foreground">{p.email}</span>
                                </TableCell>
                                <TableCell>
                                  <UserRoleBadge role={uRole} />
                                </TableCell>
                                <TableCell>
                                  {isArchived ? (
                                    <Badge variant="outline" className="text-[10px] h-5 font-medium bg-muted text-muted-foreground border-border">
                                      Archived
                                    </Badge>
                                  ) : (
                                    <UserStatusBadge status={userStatus} />
                                  )}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <span className="text-xs text-muted-foreground">{p.firm_name || "—"}</span>
                                </TableCell>
                                <TableCell className="hidden xl:table-cell">
                                  <span className="text-xs text-muted-foreground">
                                    {lastLogin ? new Date(lastLogin).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "Never"}
                                  </span>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        disabled={actionLoading === p.user_id}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {actionLoading === p.user_id ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[200px]" onClick={(e) => e.stopPropagation()}>
                                      {/* View / Edit */}
                                      <DropdownMenuItem onClick={() => setDetailProfile(p)}>
                                        <Eye size={14} className="mr-2" /> View Details
                                      </DropdownMenuItem>
                                      {!isArchived && perms.canEditUsers && (
                                        <DropdownMenuItem onClick={() => setEditProfile(p)}>
                                          <Pencil size={14} className="mr-2" /> Edit User
                                        </DropdownMenuItem>
                                      )}

                                      {/* Archived: restore / permanent delete */}
                                      {isArchived && (
                                        <>
                                          <DropdownMenuSeparator />
                                          {perms.canDeleteUsers && (
                                            <DropdownMenuItem onClick={() => openAction("restore", p)}>
                                              <RotateCcw size={14} className="mr-2" /> Restore User
                                            </DropdownMenuItem>
                                          )}
                                          {perms.canPermanentDelete && (
                                            <DropdownMenuItem
                                              onClick={() => openAction("permanent_delete", p)}
                                              className="text-destructive focus:text-destructive"
                                            >
                                              <Trash2 size={14} className="mr-2" /> Delete Permanently
                                            </DropdownMenuItem>
                                          )}
                                        </>
                                      )}

                                      {/* Active user lifecycle */}
                                      {!isArchived && perms.canEditUsers && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                                            Lifecycle
                                          </DropdownMenuLabel>

                                          {userStatus !== "active" && userStatus !== "pending_invite" && (
                                            <DropdownMenuItem onClick={() => openAction(userStatus === "suspended" ? "reinstate" : "activate", p)}>
                                              <CheckCircle2 size={14} className="mr-2" /> {userStatus === "suspended" ? "Reinstate" : "Activate"}
                                            </DropdownMenuItem>
                                          )}
                                          {userStatus === "active" && !isSelf && (
                                            <DropdownMenuItem onClick={() => openAction("deactivate", p)}>
                                              <UserX size={14} className="mr-2" /> Deactivate
                                            </DropdownMenuItem>
                                          )}
                                          {userStatus !== "suspended" && userStatus !== "locked" && !isSelf && (
                                            <DropdownMenuItem
                                              onClick={() => openAction("suspend", p)}
                                              className="text-[hsl(var(--risk-amber))] focus:text-[hsl(var(--risk-amber))]"
                                            >
                                              <Shield size={14} className="mr-2" /> Suspend
                                            </DropdownMenuItem>
                                          )}
                                          {userStatus === "locked" && (
                                            <DropdownMenuItem onClick={() => openAction("unlock", p)}>
                                              <RotateCcw size={14} className="mr-2" /> Unlock Account
                                            </DropdownMenuItem>
                                          )}
                                          {userStatus !== "locked" && !isSelf && (
                                            <DropdownMenuItem onClick={() => openAction("lock", p)}>
                                              <Lock size={14} className="mr-2" /> Lock Account
                                            </DropdownMenuItem>
                                          )}
                                        </>
                                      )}

                                      {/* Credentials */}
                                      {!isArchived && perms.canResetCredentials && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                                            Credentials
                                          </DropdownMenuLabel>

                                          <DropdownMenuItem onClick={() => openAction("send_password_reset", p)}>
                                            <KeyRound size={14} className="mr-2" /> Send Password Reset
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => openAction("force_password_reset", p)}>
                                            <KeyRound size={14} className="mr-2" /> Force Password Reset
                                          </DropdownMenuItem>
                                          {perms.canRevokeSession && (
                                            <DropdownMenuItem onClick={() => openAction("revoke_sessions", p)}>
                                              <LogOut size={14} className="mr-2" /> Revoke Sessions
                                            </DropdownMenuItem>
                                          )}
                                        </>
                                      )}

                                      {/* Archive */}
                                      {!isArchived && !isSelf && perms.canDeleteUsers && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => openAction("soft_delete", p)}
                                            className="text-destructive focus:text-destructive"
                                          >
                                            <Trash2 size={14} className="mr-2" /> Archive User
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                        </span>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>
                            Previous
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invitations">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Invitations</CardTitle>
              </CardHeader>
              <CardContent>
                {invitations.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Mail size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No invitations sent yet</p>
                    <p className="text-xs mt-1">Use the "Add User" button to invite users.</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Email</TableHead>
                          <TableHead className="w-[90px]">Role</TableHead>
                          <TableHead className="w-[110px]">Status</TableHead>
                          <TableHead className="hidden md:table-cell w-[130px]">Expires</TableHead>
                          <TableHead className="hidden md:table-cell w-[110px]">Sent</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invitations.map((inv) => {
                          const isExpired = inv.status === "pending" && new Date(inv.expires_at) < new Date();
                          const displayStatus = isExpired ? "expired" : inv.status;

                          return (
                            <TableRow key={inv.id}>
                              <TableCell>
                                <span className="text-sm">{inv.email}</span>
                              </TableCell>
                              <TableCell>
                                <UserRoleBadge role={inv.role} />
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] h-5 font-medium ${
                                    displayStatus === "pending"
                                      ? "border-[hsl(var(--risk-amber))] text-[hsl(var(--risk-amber))]"
                                      : displayStatus === "accepted"
                                      ? "border-[hsl(var(--risk-green))] text-[hsl(var(--risk-green))]"
                                      : displayStatus === "expired"
                                      ? "border-destructive text-destructive"
                                      : "border-muted-foreground text-muted-foreground"
                                  }`}
                                >
                                  {displayStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(inv.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                                </span>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(inv.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                                </span>
                              </TableCell>
                              <TableCell>
                                {(displayStatus === "pending" || displayStatus === "expired") && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] px-2"
                                      disabled={actionLoading === inv.id}
                                      onClick={() => handleResendInvite(inv.id)}
                                    >
                                      Resend
                                    </Button>
                                    {displayStatus === "pending" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] px-2 text-destructive"
                                        disabled={actionLoading === inv.id}
                                        onClick={() => handleCancelInvite(inv.id)}
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Access Requests Tab */}
          <TabsContent value="requests">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Access Requests</CardTitle>
              </CardHeader>
              <CardContent>
                {requestsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="p-4 bg-muted/30 rounded-lg space-y-2">
                        <Skeleton className="h-4 w-[200px]" />
                        <Skeleton className="h-3 w-[300px]" />
                      </div>
                    ))}
                  </div>
                ) : accessRequests.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Mail size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No access requests yet</p>
                    <p className="text-xs mt-1">Requests will appear here when users apply for access.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accessRequests.map((req) => (
                      <div key={req.id} className="p-4 bg-muted/30 rounded-lg space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">{req.full_name}</span>
                              <Badge
                                variant={req.status === "pending" ? "outline" : req.status === "approved" ? "default" : "secondary"}
                                className={`text-[10px] h-4 ${
                                  req.status === "pending"
                                    ? "border-[hsl(var(--risk-amber))] text-[hsl(var(--risk-amber))]"
                                    : req.status === "approved"
                                    ? "bg-[hsl(var(--risk-green))] text-white"
                                    : ""
                                }`}
                              >
                                {req.status}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              <div className="flex items-center gap-1"><Mail size={10} />{req.email}</div>
                              <div>Position: {req.position}</div>
                              {req.team && <div>Team: {req.team}</div>}
                              {req.reason && <div>Reason: {req.reason}</div>}
                              <div>Submitted: {new Date(req.created_at).toLocaleString("en-GB")}</div>
                            </div>
                          </div>
                          {req.status === "pending" && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="bg-[hsl(var(--risk-green))] hover:bg-[hsl(var(--risk-green))]/90 text-white"
                                disabled={actionLoading === req.id}
                                onClick={() => handleRequestAction(req.id, "approved")}
                              >
                                {actionLoading === req.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <><CheckCircle2 size={14} className="mr-1" /> Approve</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading === req.id}
                                onClick={() => handleRequestAction(req.id, "rejected")}
                              >
                                <XCircle size={14} className="mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Panel */}
      <UserDetailPanel
        open={!!detailProfile}
        onClose={() => setDetailProfile(null)}
        profile={detailProfile}
        userRole={detailProfile ? getUserRole(detailProfile.user_id) : "user"}
        onEdit={() => {
          if (perms.canEditUsers) {
            setEditProfile(detailProfile);
            setDetailProfile(null);
          }
        }}
      />

      {/* Edit Form */}
      {perms.canEditUsers && (
        <EditUserForm
          open={!!editProfile}
          onClose={() => setEditProfile(null)}
          profile={editProfile}
          userRole={editProfile ? getUserRole(editProfile.user_id) : "user"}
        />
      )}

      {/* Create Dialog */}
      {perms.canCreateUsers && (
        <CreateUserDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Action Confirmation Dialog */}
      {actionDialog && (
        <UserActionDialog
          open={!!actionDialog}
          onClose={() => setActionDialog(null)}
          onConfirm={(reason) => executeAction(actionDialog.action, actionDialog.profile.user_id, reason)}
          action={actionDialog.action}
          userName={actionDialog.profile.full_name}
          userEmail={actionDialog.profile.email}
          loading={actionLoading === actionDialog.profile.user_id}
        />
      )}
    </AppLayout>
  );
};

export default AdminUsers;

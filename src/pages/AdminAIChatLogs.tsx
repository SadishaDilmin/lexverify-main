import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search, CalendarIcon, X, Bot, User, AlertTriangle, Check, XCircle } from "lucide-react";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Navigate } from "react-router-dom";

type AuditEntry = {
  id: string;
  created_at: string;
  event_type: string;
  user_name: string;
  user_email: string;
  user_id: string | null;
  case_reference: string | null;
  user_position: string;
  metadata: Record<string, unknown> | null;
};

const AI_CHAT_EVENT_TYPES = [
  "ai_chat",
  "sow_ai_chat",
  "draft_review_ai_chat",
  "exchange_guard_ai_chat",
  "sow_ai_note_added",
  "sow_form_edit_applied",
  "sow_form_edit_dismissed",
];

const AdminAIChatLogs = () => {
  const { role } = useAuth();

  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [caseRefFilter, setCaseRefFilter] = useState("");
  const [editActionFilter, setEditActionFilter] = useState<string>("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin_ai_chat_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .in("event_type", AI_CHAT_EVENT_TYPES)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as AuditEntry[];
    },
    enabled: role === "admin",
  });

  const users = useMemo(
    () => [...new Set(logs.map((e) => e.user_name))].filter(Boolean).sort(),
    [logs]
  );

  const caseRefs = useMemo(
    () => [...new Set(logs.map((e) => e.case_reference).filter(Boolean))].sort() as string[],
    [logs]
  );

  const filtered = useMemo(() => {
    return logs.filter((entry) => {
      if (userFilter !== "all" && entry.user_name !== userFilter) return false;

      if (caseRefFilter && !(entry.case_reference ?? "").toLowerCase().includes(caseRefFilter.toLowerCase())) return false;

      if (editActionFilter === "applied" && entry.event_type !== "sow_form_edit_applied") return false;
      if (editActionFilter === "dismissed" && entry.event_type !== "sow_form_edit_dismissed") return false;
      if (editActionFilter === "notes" && entry.event_type !== "sow_ai_note_added") return false;
      if (editActionFilter === "chat_only" && !entry.event_type.includes("_chat") && entry.event_type !== "ai_chat") return false;

      if (workspaceFilter !== "all") {
        if (workspaceFilter === "sow" && !entry.event_type.startsWith("sow_") && entry.event_type !== "ai_chat") return false;
        if (workspaceFilter === "draft" && !entry.event_type.startsWith("draft_review_")) return false;
        if (workspaceFilter === "exchange" && !entry.event_type.startsWith("exchange_guard_")) return false;
      }

      if (search) {
        const q = search.toLowerCase();
        const meta = entry.metadata ? JSON.stringify(entry.metadata).toLowerCase() : "";
        const matches =
          entry.user_name.toLowerCase().includes(q) ||
          entry.user_email.toLowerCase().includes(q) ||
          (entry.case_reference ?? "").toLowerCase().includes(q) ||
          entry.event_type.toLowerCase().includes(q) ||
          meta.includes(q);
        if (!matches) return false;
      }

      const ts = new Date(entry.created_at);
      if (dateFrom && isBefore(ts, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(ts, endOfDay(dateTo))) return false;

      return true;
    });
  }, [logs, userFilter, caseRefFilter, editActionFilter, workspaceFilter, search, dateFrom, dateTo]);

  const hasFilters = search || userFilter !== "all" || caseRefFilter || editActionFilter !== "all" || workspaceFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch("");
    setUserFilter("all");
    setCaseRefFilter("");
    setEditActionFilter("all");
    setWorkspaceFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  if (role !== "admin") return <Navigate to="/dashboard" replace />;

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case "sow_form_edit_applied":
        return <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-300 text-xs"><Check className="w-3 h-3 mr-1" />Edit Applied</Badge>;
      case "sow_form_edit_dismissed":
        return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Edit Dismissed</Badge>;
      case "sow_ai_note_added":
        return <Badge className="bg-amber-500/20 text-amber-700 border-amber-300 text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Note Added</Badge>;
      case "draft_review_ai_chat":
        return <Badge className="bg-blue-500/20 text-blue-700 border-blue-300 text-xs">Draft Review</Badge>;
      case "exchange_guard_ai_chat":
        return <Badge className="bg-purple-500/20 text-purple-700 border-purple-300 text-xs">ExchangeGuard</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs"><Bot className="w-3 h-3 mr-1" />Chat</Badge>;
    }
  };

  const extractMessage = (entry: AuditEntry) => {
    const meta = entry.metadata as Record<string, unknown> | null;
    if (!meta) return null;
    return (meta.user_message as string) || (meta.message as string) || (meta.field as string) || null;
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-primary" />
              AI Chat Audit Logs
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review all AI assistant interactions, applied edits, and dismissed suggestions
            </p>
          </div>
          <Badge variant="outline" className="text-sm">{filtered.length} entries</Badge>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages, users, cases…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger><SelectValue placeholder="All Users" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
                <SelectTrigger><SelectValue placeholder="All Workspaces" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workspaces</SelectItem>
                  <SelectItem value="sow">Source of Wealth</SelectItem>
                  <SelectItem value="draft">Draft Review</SelectItem>
                  <SelectItem value="exchange">ExchangeGuard</SelectItem>
                </SelectContent>
              </Select>

              <Select value={editActionFilter} onValueChange={setEditActionFilter}>
                <SelectTrigger><SelectValue placeholder="All Actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="chat_only">Chat Messages</SelectItem>
                  <SelectItem value="applied">Edits Applied</SelectItem>
                  <SelectItem value="dismissed">Edits Dismissed</SelectItem>
                  <SelectItem value="notes">Notes Added</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("flex-1 text-xs", dateFrom && "text-foreground")}>
                      <CalendarIcon className="w-3 h-3 mr-1" />
                      {dateFrom ? format(dateFrom, "dd/MM") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} /></PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("flex-1 text-xs", dateTo && "text-foreground")}>
                      <CalendarIcon className="w-3 h-3 mr-1" />
                      {dateTo ? format(dateTo, "dd/MM") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} /></PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Case reference search */}
            <div className="flex gap-3 items-center">
              <Input
                placeholder="Filter by case reference…"
                value={caseRefFilter}
                onChange={(e) => setCaseRefFilter(e.target.value)}
                className="max-w-xs"
              />
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" /> Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Interaction Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading AI chat logs…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No AI chat audit entries found.</div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filtered.map((entry) => {
                  const message = extractMessage(entry);
                  return (
                    <div key={entry.id} className="border border-border rounded-lg p-4 space-y-2 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{entry.user_name}</span>
                          <span className="text-xs text-muted-foreground">({entry.user_email})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getEventBadge(entry.event_type)}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm:ss")}
                          </span>
                        </div>
                      </div>

                      {entry.case_reference && (
                        <div className="text-xs text-muted-foreground">
                          Case: <span className="font-mono text-foreground">{entry.case_reference}</span>
                        </div>
                      )}

                      {message && (
                        <div className="bg-muted/50 rounded p-2 text-sm text-foreground/80 line-clamp-3">
                          {message}
                        </div>
                      )}

                      {entry.metadata && (entry.metadata as Record<string, unknown>).agent_id && (
                        <div className="text-xs text-muted-foreground">
                          Agent: <span className="font-mono">{(entry.metadata as Record<string, unknown>).agent_id as string}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminAIChatLogs;

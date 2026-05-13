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
import { Clock, Search, CalendarIcon, X } from "lucide-react";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

const AuditLog = () => {
  const { profile } = useAuth();

  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: auditLog = [], isLoading } = useQuery({
    queryKey: ["audit_log_global"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const eventTypes = useMemo(
    () => [...new Set(auditLog.map((e) => e.event_type))].filter(Boolean).sort(),
    [auditLog]
  );

  const users = useMemo(
    () => [...new Set(auditLog.map((e) => e.user_name))].filter(Boolean).sort(),
    [auditLog]
  );

  const filtered = useMemo(() => {
    return auditLog.filter((entry) => {
      if (eventTypeFilter !== "all" && entry.event_type !== eventTypeFilter) return false;
      if (userFilter !== "all" && entry.user_name !== userFilter) return false;

      if (search) {
        const q = search.toLowerCase();
        const matches =
          entry.event_type.toLowerCase().includes(q) ||
          entry.user_name.toLowerCase().includes(q) ||
          entry.user_email.toLowerCase().includes(q) ||
          (entry.case_reference ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }

      const ts = new Date(entry.created_at);
      if (dateFrom && isBefore(ts, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(ts, endOfDay(dateTo))) return false;

      return true;
    });
  }, [auditLog, eventTypeFilter, userFilter, search, dateFrom, dateTo]);

  const hasFilters = search || eventTypeFilter !== "all" || userFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch("");
    setEventTypeFilter("all");
    setUserFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="text-muted-foreground">Activity trail across all cases</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by case ref, user, email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full sm:w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full sm:w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X size={14} /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Activity</span>
              <span className="text-xs font-normal text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
                {hasFilters ? ` (filtered from ${auditLog.length})` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {hasFilters ? "No entries match your filters." : "No audit log entries yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    <Clock size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{entry.event_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.user_name} ({entry.user_position}) · {entry.case_reference ?? "—"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AuditLog;

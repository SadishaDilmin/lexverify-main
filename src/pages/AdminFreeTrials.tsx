import { useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Mail, Building2, Phone, Clock, CheckCircle2, XCircle, Download,
  Gift, Users, Briefcase, Shield, BarChart3, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-risk-amber text-risk-amber",
  approved: "border-risk-green text-risk-green",
  rejected: "border-risk-red text-risk-red",
  converted: "border-accent text-accent",
};

const AdminFreeTrials = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["free_trial_requests", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("free_trial_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: role === "admin",
  });

  const filteredSubmissions = submissions.filter((sub: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (sub.full_name || "").toLowerCase().includes(q) ||
      (sub.email || "").toLowerCase().includes(q) ||
      (sub.firm_name || "").toLowerCase().includes(q)
    );
  });

  const updateStatus = async (id: string, newStatus: string) => {
    setActionLoading(id);
    try {
      const { error } = await supabase
        .from("free_trial_requests")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Status updated", description: `Request marked as ${newStatus}.` });
      queryClient.invalidateQueries({ queryKey: ["free_trial_requests"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const exportCSV = () => {
    if (filteredSubmissions.length === 0) return;
    const headers = [
      "full_name", "email", "firm_name", "position", "firm_size",
      "monthly_cases", "current_tools", "referral_source", "phone", "status", "created_at",
    ];
    const csv = [
      headers.join(","),
      ...filteredSubmissions.map((row: any) =>
        headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "free_trial_requests.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const approvedCount = submissions.filter((s) => s.status === "approved").length;
  const convertedCount = submissions.filter((s) => s.status === "converted").length;
  const conversionRate = submissions.length > 0
    ? Math.round((convertedCount / submissions.length) * 100)
    : 0;

  if (role !== "admin") {
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Free Trial Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review trial applications, approve access, and track conversions
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Requests", value: submissions.length, icon: Gift, color: "text-accent" },
            { label: "Pending", value: pendingCount, icon: Clock, color: "text-risk-amber" },
            { label: "Approved", value: approvedCount, icon: CheckCircle2, color: "text-risk-green" },
            { label: "Conversion Rate", value: `${conversionRate}%`, icon: BarChart3, color: "text-accent" },
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Submissions</CardTitle>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCSV}>
                <Download size={14} /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or firm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {submissions.length === 0 ? "No free trial requests found." : "No results match your search."}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredSubmissions.map((sub, i) => (
                  <motion.div
                    key={sub.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="p-4 bg-muted/30 rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-foreground">{sub.full_name}</span>
                          <Badge variant="outline" className={`text-[10px] h-4 ${STATUS_STYLES[sub.status] || ""}`}>
                            {sub.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Mail size={10} /> {sub.email}
                          </div>
                          {sub.firm_name && (
                            <div className="flex items-center gap-1">
                              <Building2 size={10} /> {sub.firm_name}
                            </div>
                          )}
                          {sub.position && (
                            <div className="flex items-center gap-1">
                              <Briefcase size={10} /> {sub.position}
                            </div>
                          )}
                          {sub.phone && (
                            <div className="flex items-center gap-1">
                              <Phone size={10} /> {sub.phone}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                            {sub.firm_size && (
                              <span className="flex items-center gap-1">
                                <Users size={10} /> Firm size: {sub.firm_size}
                              </span>
                            )}
                            {sub.monthly_cases && (
                              <span>Monthly cases: {sub.monthly_cases}</span>
                            )}
                          </div>
                          {sub.current_tools && (
                            <div className="mt-0.5">Current tools: {sub.current_tools}</div>
                          )}
                          {sub.referral_source && (
                            <div>Referral: {sub.referral_source}</div>
                          )}
                          <div className="text-[10px] mt-1">
                            Submitted: {new Date(sub.created_at).toLocaleString("en-GB")}
                            {sub.reviewed_at && (
                              <> · Reviewed: {new Date(sub.reviewed_at).toLocaleString("en-GB")}</>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Select
                          value={sub.status}
                          onValueChange={(val) => updateStatus(sub.id, val)}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs" disabled={actionLoading === sub.id}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminFreeTrials;

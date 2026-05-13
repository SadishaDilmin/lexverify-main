import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Users, Gift, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Referral {
  id: string;
  referrer_id: string;
  referee_full_name: string;
  referee_email: string;
  referee_firm_name: string;
  referee_phone: string | null;
  status: string;
  credits_granted: boolean;
  credited_at: string | null;
  created_at: string;
}

interface ReferralWithProfile extends Referral {
  referrer_name: string;
  referrer_email: string;
}

const AdminReferrals = () => {
  const [search, setSearch] = useState("");

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch referrer profiles
      const referrerIds = [...new Set((data || []).map((r: Referral) => r.referrer_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", referrerIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      return (data || []).map((r: Referral): ReferralWithProfile => {
        const profile = profileMap.get(r.referrer_id);
        return {
          ...r,
          referrer_name: profile?.full_name || "Unknown",
          referrer_email: profile?.email || "",
        };
      });
    },
  });

  const filtered = referrals.filter(
    (r) =>
      r.referee_full_name.toLowerCase().includes(search.toLowerCase()) ||
      r.referee_email.toLowerCase().includes(search.toLowerCase()) ||
      r.referrer_name.toLowerCase().includes(search.toLowerCase()) ||
      r.referrer_email.toLowerCase().includes(search.toLowerCase())
  );

  const totalReferrals = referrals.length;
  const joined = referrals.filter((r) => r.status === "registered").length;
  const creditsAwarded = referrals.filter((r) => r.credits_granted).length * 25 * 2;

  const exportCSV = () => {
    const headers = ["Referrer Name", "Referrer Email", "Referee Name", "Referee Email", "Firm", "Status", "Credits Granted", "Date"];
    const rows = filtered.map((r) => [
      r.referrer_name,
      r.referrer_email,
      r.referee_full_name,
      r.referee_email,
      r.referee_firm_name || "",
      r.status === "registered" ? "Joined" : "Pending",
      r.credits_granted ? "Yes" : "No",
      format(new Date(r.created_at), "yyyy-MM-dd"),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referrals-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Referral Tracking</h1>
            <p className="text-sm text-muted-foreground">All referrals across users</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Users size={20} className="text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{totalReferrals}</p>
                <p className="text-xs text-muted-foreground">Total Referrals</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Users size={20} className="text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{joined}</p>
                <p className="text-xs text-muted-foreground">Converted (Joined)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Gift size={20} className="text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">£{creditsAwarded}</p>
                <p className="text-xs text-muted-foreground">Credits Awarded</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0} className="gap-1.5 shrink-0">
            <Download size={14} /> Export CSV
          </Button>
        </div>

        <Card className="border-border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referee</TableHead>
                  <TableHead>Firm</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No referrals found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium text-foreground text-sm">{r.referrer_name}</p>
                        <p className="text-xs text-muted-foreground">{r.referrer_email}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground text-sm">{r.referee_full_name}</p>
                        <p className="text-xs text-muted-foreground">{r.referee_email}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.referee_firm_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "registered" ? "default" : "secondary"}>
                          {r.status === "registered" ? "Joined" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.credits_granted ? (
                          <Badge variant="outline" className="text-accent border-accent/30">
                            £50 awarded
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminReferrals;

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useCredits } from "@/hooks/useCredits";
import { format } from "date-fns";
import { ArrowDownCircle, ArrowUpCircle, Search, X, Coins, TrendingUp, TrendingDown, Receipt } from "lucide-react";
import { motion } from "framer-motion";

type Transaction = {
  id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  description: string;
  created_at: string;
  case_id: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  trial_grant: "Trial Grant",
  purchase: "Purchase",
  ai_review: "AI Review",
  draft_review: "Draft Review",
  agent_query: "Agent Query",
  refund: "Refund",
};

const TransactionHistory = () => {
  const { user } = useAuth();
  const { data: credits } = useCredits();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-transactions", user?.id],
    queryFn: async (): Promise<Transaction[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, amount, balance_after, transaction_type, description, created_at, case_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const uniqueTypes = useMemo(
    () => [...new Set(transactions.map((t) => t.transaction_type))],
    [transactions]
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== "all" && t.transaction_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.description.toLowerCase().includes(q) ||
          t.transaction_type.toLowerCase().includes(q) ||
          (t.case_id && t.case_id.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [transactions, typeFilter, search]);

  const totalAdded = useMemo(
    () => transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const totalUsed = useMemo(
    () => transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [transactions]
  );

  const isCredit = (amount: number) => amount > 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
          <p className="text-muted-foreground">View your credit deductions and top-ups</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full p-2 bg-primary/10">
                <Coins size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Balance</p>
                <p className="text-xl font-bold text-foreground">{credits?.balance ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full p-2 bg-green-500/10">
                <TrendingUp size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Added</p>
                <p className="text-xl font-bold text-foreground">+{totalAdded}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full p-2 bg-destructive/10">
                <TrendingDown size={20} className="text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Used</p>
                <p className="text-xl font-bold text-foreground">-{totalUsed}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt size={18} /> Transactions
                </CardTitle>
                <CardDescription>{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</CardDescription>
              </div>
              {(search || typeFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(""); setTypeFilter("all"); }}
                  className="gap-1"
                >
                  <X size={14} /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search transactions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {uniqueTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading transactions…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No transactions found.</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((t, i) => (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b transition-colors hover:bg-muted/50"
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.created_at), "dd MMM yyyy, HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-normal">
                            {TYPE_LABELS[t.transaction_type] ?? t.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{t.description}</TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center gap-1 text-sm font-medium ${isCredit(t.amount) ? "text-green-600" : "text-destructive"}`}>
                            {isCredit(t.amount) ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                            {isCredit(t.amount) ? "+" : ""}{t.amount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{t.balance_after}</TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default TransactionHistory;

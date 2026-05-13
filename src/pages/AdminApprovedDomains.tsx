import { useState } from "react";
import { Globe, Plus, Trash2, Loader2, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AdminApprovedDomains = () => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDomain, setNewDomain] = useState("");
  const [newFirmName, setNewFirmName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["approved_domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approved_domains")
        .select("*")
        .order("domain", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const handleAdd = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      toast({ title: "Invalid domain", description: "Please enter a valid domain (e.g. jones-partners.co.uk)", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("approved_domains").insert({
      domain,
      firm_name: newFirmName.trim(),
      added_by: user?.id,
    });
    setAdding(false);
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "This domain is already approved." : error.message, variant: "destructive" });
    } else {
      toast({ title: "Domain added", description: `${domain} is now an approved domain.` });
      setNewDomain("");
      setNewFirmName("");
      queryClient.invalidateQueries({ queryKey: ["approved_domains"] });
    }
  };

  const handleDelete = async (id: string, domain: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("approved_domains").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Domain removed", description: `${domain} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["approved_domains"] });
    }
  };

  if (role !== "admin") {
    return (
      <AppLayout>
        <div className="text-center py-24 text-muted-foreground">
          <Shield size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Access Denied</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approved Domains</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage which email domains are automatically approved for registration. Users from unrecognised domains will require admin approval.
          </p>
        </div>

        {/* Add domain form */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus size={16} />
              Add approved domain
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="domain" className="text-xs">Domain</Label>
                <Input
                  id="domain"
                  placeholder="e.g. jones-partners.co.uk"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value.toLowerCase())}
                  maxLength={255}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="firmName" className="text-xs">Firm name (optional)</Label>
                <Input
                  id="firmName"
                  placeholder="e.g. Jones & Partners LLP"
                  value={newFirmName}
                  onChange={(e) => setNewFirmName(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAdd} disabled={adding || !newDomain.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} className="mr-1" />}
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Domain list */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe size={16} />
              Approved domains ({domains.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : domains.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No approved domains yet. All new registrations will require admin approval.
              </p>
            ) : (
              <div className="space-y-2">
                {domains.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="min-w-0">
                      <span className="text-sm font-mono font-medium text-foreground">{d.domain}</span>
                      {d.firm_name && (
                        <span className="text-xs text-muted-foreground ml-2">— {d.firm_name}</span>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        Added {new Date(d.created_at).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" disabled={deletingId === d.id}>
                          {deletingId === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} className="text-destructive" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {d.domain}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            New users from this domain will require admin approval. Existing users are unaffected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(d.id, d.domain)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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

export default AdminApprovedDomains;

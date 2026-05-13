import { useState, useCallback } from "react";
import { Link2, Copy, Trash2, Plus, ExternalLink, Loader2, CheckCircle2, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ClientPortalManagerProps {
  caseId: string;
  caseReference: string;
  userId: string;
}

export default function ClientPortalManager({ caseId, caseReference, userId }: ClientPortalManagerProps) {
  const [creating, setCreating] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["portal_tokens", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_portal_tokens")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!caseId,
  });

  const createToken = useCallback(async () => {
    if (!clientName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("client_portal_tokens").insert({
        case_id: caseId,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        created_by: userId,
      });
      if (error) throw error;
      toast({ title: "Portal link created", description: `Access link generated for ${clientName}.` });
      setClientName("");
      setClientEmail("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["portal_tokens", caseId] });
    } catch (e: any) {
      toast({ title: "Failed to create link", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [caseId, clientName, clientEmail, userId, queryClient, toast]);

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Client portal link copied to clipboard." });
  };

  const deactivate = async (id: string) => {
    await supabase.from("client_portal_tokens").update({ is_active: false }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["portal_tokens", caseId] });
    toast({ title: "Link deactivated" });
  };

  const activeTokens = tokens.filter((t: any) => t.is_active && new Date(t.expires_at) > new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 size={14} className="text-accent" />
            Client Portal Links
            {activeTokens.length > 0 && (
              <Badge variant="secondary" className="text-[9px] h-4">{activeTokens.length} active</Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" className="text-[10px] h-6 gap-1" onClick={() => setShowForm(!showForm)}>
            <Plus size={10} />
            New Link
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {showForm && (
          <div className="space-y-2 p-3 rounded-lg border border-accent/20 bg-accent/5">
            <div className="space-y-1">
              <Label className="text-[10px]">Client Name *</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., John Smith"
                className="h-7 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Client Email (optional)</Label>
              <Input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="john@example.com"
                className="h-7 text-[11px]"
                type="email"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="text-[10px] h-6 gap-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={createToken} disabled={creating || !clientName.trim()}>
                {creating ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
                Generate Link
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {tokens.length === 0 && !showForm ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            No client portal links yet. Create one to share a read-only case view with your client.
          </p>
        ) : (
          <div className="space-y-1.5">
            {tokens.map((t: any) => {
              const isExpired = new Date(t.expires_at) < new Date();
              const isActive = t.is_active && !isExpired;
              return (
                <div key={t.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] ${isActive ? "border-border bg-background" : "border-border/50 bg-muted/20 opacity-60"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground">{t.client_name}</span>
                      {isActive ? (
                        <Badge className="text-[8px] h-3.5 bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/20">Active</Badge>
                      ) : isExpired ? (
                        <Badge variant="secondary" className="text-[8px] h-3.5">Expired</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[8px] h-3.5">Deactivated</Badge>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      Expires {new Date(t.expires_at).toLocaleDateString("en-GB")}
                      {t.last_accessed_at && ` · Last viewed ${new Date(t.last_accessed_at).toLocaleDateString("en-GB")}`}
                    </p>
                  </div>
                  {isActive && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyLink(t.token)} title="Copy link">
                        <Copy size={10} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive" onClick={() => deactivate(t.id)} title="Deactivate">
                        <Trash2 size={10} />
                      </Button>
                    </div>
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

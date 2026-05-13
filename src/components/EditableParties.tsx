import { useState } from "react";
import { Users, Pencil, Check, X, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const BUYER_LABELS: Record<string, string> = {
  standard: "Standard",
  first_time_buyer: "First-Time Buyer",
  additional_dwelling: "Additional Dwelling",
  non_uk_resident: "Non-UK Resident",
  company: "Company",
};

const PEP_LABELS: Record<string, string> = {
  unknown: "Unknown",
  not_pep: "Clear",
  pep: "PEP",
  pep_family: "PEP Family",
  pep_associate: "PEP Associate",
};

const ROLE_LABELS: Record<string, string> = {
  purchaser: "Purchaser",
  seller: "Seller",
  giftor: "Giftor",
};

interface Party {
  id: string;
  full_name: string;
  role: string;
  buyer_type: string | null;
  email: string | null;
  pep_status: string;
}

interface Props {
  caseId: string;
  parties: Party[];
}

export default function EditableParties({ caseId, parties }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Party>>({});
  const [adding, setAdding] = useState(false);
  const [newParty, setNewParty] = useState({ full_name: "", role: "purchaser", buyer_type: "standard", pep_status: "unknown" });

  const startEdit = (party: Party) => {
    setEditingId(party.id);
    setDraft({ full_name: party.full_name, buyer_type: party.buyer_type, pep_status: party.pep_status });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };

  const saveEdit = async () => {
    if (!editingId || !draft.full_name?.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("case_parties")
        .update({
          full_name: draft.full_name!.trim(),
          buyer_type: draft.buyer_type || "standard",
          pep_status: draft.pep_status || "unknown",
        })
        .eq("id", editingId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["case_parties", caseId] });
      toast({ title: "Party updated" });
      setEditingId(null);
      setDraft({});
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newParty.full_name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("case_parties")
        .insert({
          case_id: caseId,
          full_name: newParty.full_name.trim(),
          role: newParty.role,
          buyer_type: newParty.role === "purchaser" ? newParty.buyer_type : null,
          pep_status: newParty.pep_status,
        });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["case_parties", caseId] });
      toast({ title: "Party added" });
      setAdding(false);
      setNewParty({ full_name: "", role: "purchaser", buyer_type: "standard", pep_status: "unknown" });
    } catch (err: any) {
      toast({ title: "Add failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (partyId: string) => {
    setDeleting(partyId);
    try {
      const { error } = await supabase
        .from("case_parties")
        .delete()
        .eq("id", partyId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["case_parties", caseId] });
      toast({ title: "Party removed" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Parties</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto"
            onClick={() => setAdding(true)}
            disabled={adding || !!editingId}
            title="Add party"
          >
            <Plus size={12} className="text-muted-foreground" />
          </Button>
        </div>

        <div className="grid gap-1.5">
          {parties.map((party) => {
            const isEditing = editingId === party.id;

            if (isEditing) {
              return (
                <div key={party.id} className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/40 border border-accent/20">
                  <Input
                    value={draft.full_name || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                    className="h-7 text-sm w-40"
                    placeholder="Full name"
                    maxLength={200}
                  />
                  <span className="text-xs text-muted-foreground capitalize">({party.role})</span>

                  {party.role === "purchaser" && (
                    <Select value={draft.buyer_type || "standard"} onValueChange={(v) => setDraft((d) => ({ ...d, buyer_type: v }))}>
                      <SelectTrigger className="h-7 w-[150px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(BUYER_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={draft.pep_status || "unknown"} onValueChange={(v) => setDraft((d) => ({ ...d, pep_status: v }))}>
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PEP_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1 ml-auto">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveEdit} disabled={saving || !draft.full_name?.trim()}>
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-risk-green" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit} disabled={saving}>
                      <X size={12} className="text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div key={party.id} className="flex items-center gap-2 text-sm group">
                <span className="font-medium text-foreground">{party.full_name}</span>
                <span className="text-muted-foreground capitalize">({party.role})</span>
                {party.role === "purchaser" && party.buyer_type && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-accent/10 text-accent border border-accent/20">
                    {BUYER_LABELS[party.buyer_type] ?? party.buyer_type}
                  </span>
                )}
                {party.pep_status && party.pep_status !== "unknown" && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                    party.pep_status === "pep" || party.pep_status === "pep_family" || party.pep_status === "pep_associate"
                      ? "bg-risk-red/10 text-risk-red border-risk-red/20"
                      : "bg-risk-green/10 text-risk-green border-risk-green/20"
                  }`}>
                    PEP: {PEP_LABELS[party.pep_status] ?? party.pep_status}
                  </span>
                )}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ml-auto">
                  <button
                    onClick={() => startEdit(party)}
                    className="p-0.5 rounded hover:bg-muted"
                    title="Edit party"
                  >
                    <Pencil size={12} className="text-muted-foreground" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="p-0.5 rounded hover:bg-destructive/10"
                        title="Remove party"
                        disabled={deleting === party.id}
                      >
                        {deleting === party.id
                          ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                          : <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />}
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove party?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove <strong>{party.full_name}</strong> ({party.role}) from this case? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(party.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}

          {/* Add party inline form */}
          {adding && (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/40 border border-accent/20">
              <Input
                value={newParty.full_name}
                onChange={(e) => setNewParty((p) => ({ ...p, full_name: e.target.value }))}
                className="h-7 text-sm w-40"
                placeholder="Full name"
                maxLength={200}
                autoFocus
              />

              <Select value={newParty.role} onValueChange={(v) => setNewParty((p) => ({ ...p, role: v }))}>
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {newParty.role === "purchaser" && (
                <Select value={newParty.buyer_type} onValueChange={(v) => setNewParty((p) => ({ ...p, buyer_type: v }))}>
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BUYER_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={newParty.pep_status} onValueChange={(v) => setNewParty((p) => ({ ...p, pep_status: v }))}>
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PEP_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAdd} disabled={saving || !newParty.full_name.trim()}>
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-risk-green" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAdding(false); setNewParty({ full_name: "", role: "purchaser", buyer_type: "standard", pep_status: "unknown" }); }} disabled={saving}>
                  <X size={12} className="text-muted-foreground" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

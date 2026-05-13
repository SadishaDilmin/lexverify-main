import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Plus, Pencil, Trash2, Loader2, Download, Upload } from "lucide-react";

const AGENT_TYPES = [
  { value: "sow", label: "Source of Wealth" },
  { value: "all", label: "All Agents" },
];

const TRANSACTION_TYPES = [
  { value: "all", label: "All" },
  { value: "purchase", label: "Purchase" },
  { value: "sale", label: "Sale" },
];

const TENURE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Freehold", label: "Freehold" },
  { value: "Leasehold", label: "Leasehold" },
  { value: "Commonhold", label: "Commonhold" },
  { value: "New Build", label: "New Build" },
];

interface ChecklistRow {
  id: string;
  doc_name: string;
  doc_slot_id: string;
  agent_type: string;
  transaction_type: string;
  tenure: string;
  required: boolean;
  reason: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  doc_name: "",
  doc_slot_id: "",
  agent_type: "all",
  transaction_type: "all",
  tenure: "all",
  required: true,
  reason: "",
  sort_order: 0,
};

export default function AdminDocumentChecklists() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [filterAgent, setFilterAgent] = useState("all_filter");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-document-checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_checklists" as any)
        .select("*")
        .order("agent_type")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ChecklistRow[];
    },
  });

  // ── CSV Export ────────────────────────────────────────────────────────
  const CSV_HEADERS = ["doc_name", "doc_slot_id", "agent_type", "transaction_type", "tenure", "required", "reason", "sort_order", "is_active"] as const;

  const escCsv = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const handleExport = () => {
    const source = filterAgent === "all_filter" ? rows : rows.filter((r) => r.agent_type === filterAgent);
    const lines = [
      CSV_HEADERS.join(","),
      ...source.map((r) =>
        CSV_HEADERS.map((h) => escCsv(String(r[h as keyof ChecklistRow] ?? ""))).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `document-checklists-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${source.length} items exported to CSV.` });
  };

  // ── CSV Import ────────────────────────────────────────────────────────
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { result.push(current); current = ""; }
        else current += ch;
      }
    }
    result.push(current);
    return result;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

      const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const nameIdx = headers.indexOf("doc_name");
      const slotIdx = headers.indexOf("doc_slot_id");
      if (nameIdx === -1 || slotIdx === -1) throw new Error("CSV must contain doc_name and doc_slot_id columns.");

      const agentIdx = headers.indexOf("agent_type");
      const txIdx = headers.indexOf("transaction_type");
      const tenureIdx = headers.indexOf("tenure");
      const reqIdx = headers.indexOf("required");
      const reasonIdx = headers.indexOf("reason");
      const sortIdx = headers.indexOf("sort_order");
      const activeIdx = headers.indexOf("is_active");

      const toInsert: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const doc_name = cols[nameIdx]?.trim();
        const doc_slot_id = cols[slotIdx]?.trim();
        if (!doc_name || !doc_slot_id) continue;

        toInsert.push({
          doc_name,
          doc_slot_id,
          agent_type: agentIdx >= 0 ? (cols[agentIdx]?.trim() || "all") : "all",
          transaction_type: txIdx >= 0 ? (cols[txIdx]?.trim() || "all") : "all",
          tenure: tenureIdx >= 0 ? (cols[tenureIdx]?.trim() || "all") : "all",
          required: reqIdx >= 0 ? cols[reqIdx]?.trim().toLowerCase() !== "false" : true,
          reason: reasonIdx >= 0 ? (cols[reasonIdx]?.trim() || "") : "",
          sort_order: sortIdx >= 0 ? (parseInt(cols[sortIdx]?.trim()) || 0) : 0,
          is_active: activeIdx >= 0 ? cols[activeIdx]?.trim().toLowerCase() !== "false" : true,
          created_by: user?.id,
        });
      }

      if (toInsert.length === 0) throw new Error("No valid rows found in CSV.");

      const { error } = await supabase
        .from("document_checklists" as any)
        .insert(toInsert);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["admin-document-checklists"] });
      qc.invalidateQueries({ queryKey: ["document-checklists"] });
      toast({ title: "Imported", description: `${toInsert.length} items imported from CSV.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase
          .from("document_checklists" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("document_checklists" as any)
          .insert({ ...rest, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-document-checklists"] });
      qc.invalidateQueries({ queryKey: ["document-checklists"] });
      toast({ title: editingId ? "Updated" : "Created" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("document_checklists" as any)
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-document-checklists"] });
      qc.invalidateQueries({ queryKey: ["document-checklists"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("document_checklists" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-document-checklists"] });
      qc.invalidateQueries({ queryKey: ["document-checklists"] });
      toast({ title: "Deleted" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: ChecklistRow) => {
    setEditingId(row.id);
    setForm({
      doc_name: row.doc_name,
      doc_slot_id: row.doc_slot_id,
      agent_type: row.agent_type,
      transaction_type: row.transaction_type,
      tenure: row.tenure,
      required: row.required,
      reason: row.reason || "",
      sort_order: row.sort_order,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (!form.doc_name.trim() || !form.doc_slot_id.trim()) {
      toast({ title: "Missing fields", description: "Name and Slot ID are required.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(editingId ? { ...form, id: editingId } : form);
  };

  const filtered = filterAgent === "all_filter"
    ? rows
    : rows.filter((r) => r.agent_type === filterAgent);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck size={24} className="text-accent" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Document Checklists</h1>
              <p className="text-sm text-muted-foreground">Manage required documents per agent, tenure & transaction type</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImport}
            />
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download size={14} /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => csvInputRef.current?.click()}
              disabled={importing}
              className="gap-1.5"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Import CSV
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus size={14} /> Add Item
            </Button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Label className="text-sm">Filter by agent:</Label>
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_filter">All Agents</SelectItem>
              {AGENT_TYPES.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} items</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document Name</TableHead>
                  <TableHead>Slot ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className={!row.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{row.doc_name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.doc_slot_id}</code></TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {AGENT_TYPES.find((a) => a.value === row.agent_type)?.label || row.agent_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.tenure}</TableCell>
                    <TableCell className="text-sm">{row.transaction_type}</TableCell>
                    <TableCell>{row.required ? "✓" : "–"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: row.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.sort_order}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(row.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No checklist items found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Checklist Item" : "Add Checklist Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Document Name *</Label>
              <Input value={form.doc_name} onChange={(e) => setForm({ ...form, doc_name: e.target.value })} placeholder="e.g. Draft Contract" />
            </div>
            <div className="grid gap-2">
              <Label>Slot ID *</Label>
              <Input value={form.doc_slot_id} onChange={(e) => setForm({ ...form, doc_slot_id: e.target.value })} placeholder="e.g. draft_contract" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Agent Type</Label>
                <Select value={form.agent_type} onValueChange={(v) => setForm({ ...form, agent_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tenure</Label>
                <Select value={form.tenure} onValueChange={(v) => setForm({ ...form, tenure: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TENURE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Transaction Type</Label>
                <Select value={form.transaction_type} onValueChange={(v) => setForm({ ...form, transaction_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why is this document needed?" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="required"
                checked={form.required}
                onCheckedChange={(checked) => setForm({ ...form, required: !!checked })}
              />
              <Label htmlFor="required">Required document</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete checklist item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this document requirement. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

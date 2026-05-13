import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  XCircle,
  History,
  Search,
  BookOpen,
  Filter,
} from "lucide-react";

interface GlossaryTerm {
  id: string;
  term: string;
  slug: string;
  letter: string;
  definition: string;
  why_it_matters: string;
  legislation: string | null;
  applies: string;
  related_term_slugs: string[];
  status: string;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_for_review_at: string | null;
  submitted_for_review_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
}

interface TermVersion {
  id: string;
  term_id: string;
  version: number;
  term: string;
  slug: string;
  letter: string;
  definition: string;
  why_it_matters: string;
  legislation: string | null;
  applies: string;
  related_term_slugs: string[];
  status: string;
  change_summary: string | null;
  changed_by: string | null;
  changed_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  archived: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const emptyForm = {
  term: "",
  slug: "",
  definition: "",
  why_it_matters: "",
  legislation: "",
  applies: "both" as string,
  related_term_slugs: "",
};

const AdminGlossary = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [changeSummary, setChangeSummary] = useState("");
  const [historyTermId, setHistoryTermId] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<GlossaryTerm | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // Fetch all terms (admin sees all statuses)
  const { data: terms = [], isLoading } = useQuery({
    queryKey: ["admin-glossary-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("glossary_terms")
        .select("*")
        .order("term");
      if (error) throw error;
      return data as GlossaryTerm[];
    },
  });

  // Fetch version history for a term
  const { data: versions = [] } = useQuery({
    queryKey: ["glossary-versions", historyTermId],
    queryFn: async () => {
      if (!historyTermId) return [];
      const { data, error } = await supabase
        .from("glossary_term_versions")
        .select("*")
        .eq("term_id", historyTermId)
        .order("version", { ascending: false });
      if (error) throw error;
      return data as TermVersion[];
    },
    enabled: !!historyTermId,
  });

  // Save version snapshot
  const saveVersion = async (term: GlossaryTerm, summary: string) => {
    await supabase.from("glossary_term_versions").insert({
      term_id: term.id,
      version: term.version,
      term: term.term,
      slug: term.slug,
      letter: term.letter,
      definition: term.definition,
      why_it_matters: term.why_it_matters,
      legislation: term.legislation,
      applies: term.applies,
      related_term_slugs: term.related_term_slugs,
      status: term.status,
      change_summary: summary,
      changed_by: user?.id,
    });
  };

  // Create / Update mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const slug = form.slug || slugify(form.term);
      const letter = form.term.charAt(0).toUpperCase();
      const relatedSlugs = form.related_term_slugs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (editingId) {
        // Get current term for version snapshot
        const existing = terms.find((t) => t.id === editingId);
        if (existing) {
          await saveVersion(existing, changeSummary || "Manual edit");
        }

        const { error } = await supabase
          .from("glossary_terms")
          .update({
            term: form.term,
            slug,
            letter,
            definition: form.definition,
            why_it_matters: form.why_it_matters,
            legislation: form.legislation || null,
            applies: form.applies,
            related_term_slugs: relatedSlugs,
            version: (existing?.version ?? 0) + 1,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("glossary_terms").insert({
          term: form.term,
          slug,
          letter,
          definition: form.definition,
          why_it_matters: form.why_it_matters,
          legislation: form.legislation || null,
          applies: form.applies,
          related_term_slugs: relatedSlugs,
          status: "draft",
          created_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Term updated" : "Term created");
      qc.invalidateQueries({ queryKey: ["admin-glossary-terms"] });
      closeForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("glossary_terms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Term deleted");
      qc.invalidateQueries({ queryKey: ["admin-glossary-terms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Submit for review
  const submitForReview = useMutation({
    mutationFn: async (term: GlossaryTerm) => {
      await saveVersion(term, "Submitted for review");
      const { error } = await supabase
        .from("glossary_terms")
        .update({
          status: "review",
          submitted_for_review_at: new Date().toISOString(),
          submitted_for_review_by: user?.id,
          version: term.version + 1,
        })
        .eq("id", term.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submitted for review");
      qc.invalidateQueries({ queryKey: ["admin-glossary-terms"] });
    },
  });

  // Approve / Reject
  const reviewMutation = useMutation({
    mutationFn: async ({ term, approve }: { term: GlossaryTerm; approve: boolean }) => {
      await saveVersion(term, approve ? "Approved and published" : `Rejected: ${reviewNotes}`);
      const { error } = await supabase
        .from("glossary_terms")
        .update({
          status: approve ? "published" : "draft",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
          review_notes: reviewNotes || null,
          version: term.version + 1,
        })
        .eq("id", term.id);
      if (error) throw error;
    },
    onSuccess: (_, { approve }) => {
      toast.success(approve ? "Term published" : "Term sent back to draft");
      setReviewDialog(null);
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: ["admin-glossary-terms"] });
    },
  });

  // Filter
  const filtered = useMemo(() => {
    let items = terms;
    if (statusFilter !== "all") items = items.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) => t.term.toLowerCase().includes(q) || t.slug.includes(q)
      );
    }
    return items;
  }, [terms, statusFilter, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setChangeSummary("");
    setFormOpen(true);
  };

  const openEdit = (t: GlossaryTerm) => {
    setEditingId(t.id);
    setForm({
      term: t.term,
      slug: t.slug,
      definition: t.definition,
      why_it_matters: t.why_it_matters,
      legislation: t.legislation ?? "",
      applies: t.applies,
      related_term_slugs: t.related_term_slugs.join(", "),
    });
    setChangeSummary("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setChangeSummary("");
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: terms.length, draft: 0, review: 0, published: 0, archived: 0 };
    terms.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }, [terms]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen size={24} /> Glossary Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create, edit, review and publish glossary terms with full version history.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} /> Add Term
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search terms…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {(["all", "draft", "review", "published", "archived"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="text-xs capitalize"
              >
                {s} ({statusCounts[s] || 0})
              </Button>
            ))}
          </div>
        </div>

        {/* Terms table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead className="hidden md:table-cell">Applies</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Version</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No terms found.</TableCell></TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-foreground">{t.term}</span>
                        <span className="ml-2 text-xs text-muted-foreground">({t.slug})</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize text-sm">{t.applies}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[t.status]}>{t.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">v{t.version}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {new Date(t.updated_at).toLocaleDateString("en-GB")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit">
                          <Pencil size={14} />
                        </Button>
                        {t.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => submitForReview.mutate(t)}
                            title="Submit for review"
                          >
                            <Send size={14} />
                          </Button>
                        )}
                        {t.status === "review" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setReviewDialog(t); setReviewNotes(""); }}
                            title="Review"
                            className="text-yellow-600"
                          >
                            <CheckCircle size={14} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryTermId(t.id)}
                          title="Version history"
                        >
                          <History size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete "${t.term}"?`)) deleteMutation.mutate(t.id);
                          }}
                          title="Delete"
                          className="text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create / Edit dialog */}
        <Dialog open={formOpen} onOpenChange={(o) => !o && closeForm()}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Term" : "Add New Term"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Term *</label>
                  <Input
                    value={form.term}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        term: e.target.value,
                        slug: editingId ? f.slug : slugify(e.target.value),
                      }));
                    }}
                    placeholder="Exchange of Contracts"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Slug</label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="exchange-of-contracts"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Definition *</label>
                <Textarea
                  value={form.definition}
                  onChange={(e) => setForm((f) => ({ ...f, definition: e.target.value }))}
                  rows={4}
                  placeholder="Plain-English definition…"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Why it matters</label>
                <Textarea
                  value={form.why_it_matters}
                  onChange={(e) => setForm((f) => ({ ...f, why_it_matters: e.target.value }))}
                  rows={3}
                  placeholder="Why this term matters in conveyancing…"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Legislation</label>
                  <Input
                    value={form.legislation}
                    onChange={(e) => setForm((f) => ({ ...f, legislation: e.target.value }))}
                    placeholder="Law of Property Act 1925, s.44"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Applies to</label>
                  <Select value={form.applies} onValueChange={(v) => setForm((f) => ({ ...f, applies: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Freehold & Leasehold</SelectItem>
                      <SelectItem value="freehold">Freehold</SelectItem>
                      <SelectItem value="leasehold">Leasehold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Related term slugs (comma-separated)</label>
                <Input
                  value={form.related_term_slugs}
                  onChange={(e) => setForm((f) => ({ ...f, related_term_slugs: e.target.value }))}
                  placeholder="completion, deposit, contract-for-sale"
                />
              </div>
              {editingId && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Change summary *</label>
                  <Input
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="What was changed and why"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeForm}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.term.trim() || !form.definition.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving…" : editingId ? "Save Changes" : "Create Term"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review dialog */}
        <Dialog open={!!reviewDialog} onOpenChange={(o) => !o && setReviewDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review: {reviewDialog?.term}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Definition</h4>
                <p className="text-sm text-foreground mt-1">{reviewDialog?.definition}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Why it matters</h4>
                <p className="text-sm text-foreground mt-1">{reviewDialog?.why_it_matters}</p>
              </div>
              {reviewDialog?.legislation && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Legislation</h4>
                  <p className="text-sm text-foreground mt-1">{reviewDialog.legislation}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Review notes (optional)</label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes for the author…"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                className="text-destructive border-destructive/30"
                onClick={() => reviewDialog && reviewMutation.mutate({ term: reviewDialog, approve: false })}
                disabled={reviewMutation.isPending}
              >
                <XCircle size={14} className="mr-1" /> Reject
              </Button>
              <Button
                onClick={() => reviewDialog && reviewMutation.mutate({ term: reviewDialog, approve: true })}
                disabled={reviewMutation.isPending}
              >
                <CheckCircle size={14} className="mr-1" /> Approve & Publish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Version history dialog */}
        <Dialog open={!!historyTermId} onOpenChange={(o) => !o && setHistoryTermId(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History size={18} /> Version History
              </DialogTitle>
            </DialogHeader>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No version history yet.</p>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {versions.map((v) => (
                  <AccordionItem key={v.id} value={v.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="text-sm">
                      <div className="flex items-center gap-3 flex-1">
                        <Badge variant="outline" className="text-[10px]">v{v.version}</Badge>
                        <span className="font-medium">{v.term}</span>
                        <Badge variant="outline" className={STATUS_COLORS[v.status] + " text-[10px]"}>{v.status}</Badge>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(v.changed_at).toLocaleString("en-GB")}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 text-sm">
                        {v.change_summary && (
                          <p className="text-accent font-medium text-xs">Change: {v.change_summary}</p>
                        )}
                        <p><strong>Definition:</strong> {v.definition}</p>
                        <p><strong>Why it matters:</strong> {v.why_it_matters}</p>
                        {v.legislation && <p><strong>Legislation:</strong> {v.legislation}</p>}
                        <p><strong>Applies:</strong> {v.applies}</p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default AdminGlossary;

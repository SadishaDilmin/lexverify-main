import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BookOpen, Plus, Upload, Check, X, Loader2, FileText,
  Brain, Trash2, Search, AlertCircle, Globe, AlertTriangle, Link2, RefreshCw, FileUp, Eye, Sparkles, CheckCircle2, FolderOpen, Pencil, Download,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractFilesFromDrop, processUploadedFiles } from "@/lib/folderUpload";
import { extractDocxText, extractLegacyDocText, isOLE2Format, isGarbledText } from "@/lib/docxTextExtract";
import { detectProtectedFile } from "@/lib/protectedFileDetection";
import { format } from "date-fns";

const KB_ACCEPTED_EXT = /\.(txt|md|csv|pdf|doc|docx|jpg|jpeg|png|webp|tiff|bmp|gif|mp3|wav|m4a|ogg|flac|aac|mp4|webm|mov|avi|mkv)$/i;
const filterKBFiles = (files: File[]) => files.filter((f) => KB_ACCEPTED_EXT.test(f.name));
const MEDIA_EXTENSIONS = /\.(jpg|jpeg|png|webp|tiff|bmp|gif|mp3|wav|m4a|ogg|flac|aac|mp4|webm|mov|avi|mkv)$/i;
const AUDIO_VIDEO_EXTENSIONS = /\.(mp3|wav|m4a|ogg|flac|aac|mp4|webm|mov|avi|mkv)$/i;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|tiff|bmp|gif)$/i;

const CATEGORIES = [
  { value: "regulatory", label: "Regulatory Guidance" },
  { value: "firm_policy", label: "Firm-Specific Policy" },
  { value: "case_law", label: "Case Law & Precedent" },
  { value: "training", label: "Training Material" },
];

const TENURE_OPTIONS = [
  { value: "freehold", label: "Freehold" },
  { value: "leasehold", label: "Leasehold" },
  { value: "commonhold", label: "Commonhold" },
  { value: "new-build", label: "New Build" },
];

const DOC_TYPE_TAGS = [
  { value: "general", label: "General" },
  { value: "regulatory", label: "Regulatory" },
  { value: "guidance", label: "Guidance" },
  { value: "policy", label: "Policy" },
  { value: "checklist", label: "Checklist" },
  { value: "template", label: "Template" },
  { value: "case_law", label: "Case Law" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const EMBED_KNOWLEDGE_FUNCTION = "embed-knowledge";

// ── Types for AI classification ───────────────────────────────────────
interface ClassifiedDoc {
  documentId: string;
  title: string;
  description: string;
  category: string;
  knowledgeBaseIds: string[];
  tenureTypes: string[];
  docTypeTag: string;
  judgeOverridden: boolean;
  judgeNotes?: string;
  error?: string;
}

export default function AdminKnowledgeBase() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [kbFilter, setKbFilter] = useState<string>("all");
  const [pageDragOver, setPageDragOver] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [viewContentDoc, setViewContentDoc] = useState<any>(null);
  const [editDoc, setEditDoc] = useState<any>(null);
  const [reEmbedAll, setReEmbedAll] = useState<{
    running: boolean;
    total: number;
    current: number;
    currentTitle: string;
    chunkProgress: string;
  } | null>(null);

  // AI Classification state
  const [classifyDialogOpen, setClassifyDialogOpen] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState<{ current: number; total: number } | null>(null);
  const [classifiedDocs, setClassifiedDocs] = useState<ClassifiedDoc[]>([]);
  const [savingClassified, setSavingClassified] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  const invokeEmbedKnowledge = useCallback(async (payload: Record<string, any>) => {
    console.info("[KB Process] invoking function", {
      functionName: EMBED_KNOWLEDGE_FUNCTION,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      payload,
    });

    const resp = await supabase.functions.invoke(EMBED_KNOWLEDGE_FUNCTION, { body: payload });

    if (resp.error) {
      console.error("[KB Process] function error", {
        functionName: EMBED_KNOWLEDGE_FUNCTION,
        payload,
        message: resp.error?.message,
        name: (resp.error as any)?.name,
        details: (resp.error as any),
      });
    } else {
      console.info("[KB Process] function response", {
        functionName: EMBED_KNOWLEDGE_FUNCTION,
        payload,
        data: resp.data,
      });
    }

    return resp;
  }, []);

  // Fetch knowledge bases
  const { data: knowledgeBases = [] } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_bases")
        .select("*")
        .order("label");
      if (error) throw error;
      return data || [];
    },
  });

  const handlePageDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setPageDragOver(false);
    const { files: allFiles } = await extractFilesFromDrop(e);
    const supported = filterKBFiles(allFiles);
    const rejected = allFiles.filter((f) => !KB_ACCEPTED_EXT.test(f.name));

    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).slice(0, 10).join(", ");
      const extra = rejected.length > 10 ? ` and ${rejected.length - 10} more` : "";
      toast({
        title: `${rejected.length} unsupported file${rejected.length !== 1 ? "s" : ""} skipped`,
        description: `${names}${extra}. Supported: documents, images, audio & video files.`,
        variant: "destructive",
      });
    }

    if (supported.length > 0) {
      setDroppedFiles(supported);
      setDialogOpen(true);
    } else if (rejected.length === 0) {
      toast({ title: "No supported files found", description: "Supported: .txt, .md, .csv, .pdf, .doc, .docx, images, audio & video files.", variant: "destructive" });
    }
  }, [toast]);

  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setPageDragOver(true);
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setPageDragOver(false);
  }, []);

  // Fetch documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["knowledge-documents", tab],
    queryFn: async () => {
      let query = supabase
        .from("knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (tab !== "all") {
        query = query.eq("status", tab);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Filter by search and KB
  const filtered = documents.filter((d: any) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !d.title.toLowerCase().includes(q) &&
        !d.description.toLowerCase().includes(q) &&
        !d.category.toLowerCase().includes(q)
      ) return false;
    }
    if (kbFilter !== "all" && !(d.knowledge_base_ids || []).includes(kbFilter)) return false;
    return true;
  });

  // Count processing docs
  const processingDocs = documents.filter((d: any) => d.status === "processing" && d.content_text);

  // Chunked embed progress state
  const [embedProgress, setEmbedProgress] = useState<{
    documentId: string;
    totalChunks: number;
    embedded: number;
    status: "chunking" | "embedding" | "done" | "error";
  } | null>(null);

  // Process (chunk + embed) using client-side batched calls
  const processMutation = useMutation({
    mutationFn: async (documentId: string) => {
      setEmbedProgress({ documentId, totalChunks: 0, embedded: 0, status: "chunking" });

      const { data: chunkData, error: chunkErr } = await invokeEmbedKnowledge({ action: "chunk-only", documentId });
      if (chunkErr) throw chunkErr;
      if (!chunkData?.success) throw new Error("Chunking failed");

      const totalChunks = chunkData.totalChunks;
      setEmbedProgress({ documentId, totalChunks, embedded: 0, status: "embedding" });

      const BATCH_SIZE = 1;
      let totalEmbedded = 0;

      while (true) {
        const { data: batchData, error: batchErr } = await invokeEmbedKnowledge({
          action: "embed-batch",
          documentId,
          batchSize: BATCH_SIZE,
        });
        if (batchErr) throw batchErr;

        totalEmbedded = batchData.totalEmbedded || 0;
        setEmbedProgress({ documentId, totalChunks, embedded: totalEmbedded, status: "embedding" });

        if (batchData.done) break;
        await new Promise((r) => setTimeout(r, 300));
      }

      setEmbedProgress({ documentId, totalChunks, embedded: totalEmbedded, status: "done" });
      return { chunks: totalEmbedded, total: totalChunks };
    },
    onSuccess: (data) => {
      toast({ title: "Processing complete", description: `${data.chunks}/${data.total} chunks embedded.` });
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
      setTimeout(() => setEmbedProgress(null), 3000);
    },
    onError: (e: any) => {
      console.error("[KB Process] processing failed", {
        message: e?.message,
        name: e?.name,
        stack: e?.stack,
        error: e,
      });
      toast({ title: "Processing failed", description: e.message, variant: "destructive" });
      setEmbedProgress((prev) => prev ? { ...prev, status: "error" } : null);
      setTimeout(() => setEmbedProgress(null), 5000);
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke("embed-knowledge", {
        body: { action: "approve", documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Document approved" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: (e: any) => {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke("embed-knowledge", {
        body: { action: "reject", documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Document rejected" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: (e: any) => {
      toast({ title: "Rejection failed", description: e.message, variant: "destructive" });
    },
  });

  // Retry fetch mutation
  const retryFetchMutation = useMutation({
    mutationFn: async (doc: any) => {
      const { data, error } = await supabase.functions.invoke("embed-knowledge", {
        body: {
          action: "fetch-url",
          sourceUrl: doc.source_url,
          title: doc.title,
          description: doc.description,
          category: doc.category,
          agentId: doc.agent_id,
          retryDocumentId: doc.id,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({ title: "Fetch succeeded", description: `${data.chars} characters extracted.` });
      } else {
        toast({ title: "Fetch failed again", description: data?.error || "Unknown error", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: (e: any) => {
      toast({ title: "Retry failed", description: e.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.from("knowledge_documents").delete().eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Document deleted" });
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const handleReEmbedAll = async () => {
    const approvedDocs = documents.filter((d: any) => d.status === "approved" && d.content_text);
    if (approvedDocs.length === 0) {
      toast({ title: "No approved documents", description: "There are no approved documents with content to re-embed.", variant: "destructive" });
      return;
    }
    if (!confirm(`Re-embed all ${approvedDocs.length} approved documents? This will delete existing chunks and regenerate embeddings.`)) return;

    await bulkChunkAndEmbed(approvedDocs, "Re-embed complete");
  };

  const handleBulkChunkApprove = async () => {
    const pendingDocs = documents.filter((d: any) => d.status === "pending" && d.content_text && (d.chunk_count === 0 || !d.chunk_count));
    const approvedUnchunked = documents.filter((d: any) => d.status === "approved" && d.content_text && (d.chunk_count === 0 || !d.chunk_count));
    const totalEligible = pendingDocs.length + approvedUnchunked.length;

    if (totalEligible === 0) {
      toast({ title: "No documents to process", description: "There are no pending or approved-but-unchunked documents ready to process.", variant: "destructive" });
      return;
    }

    const parts: string[] = [];
    if (pendingDocs.length > 0) parts.push(`${pendingDocs.length} pending (will be approved)`);
    if (approvedUnchunked.length > 0) parts.push(`${approvedUnchunked.length} approved with 0 chunks`);
    if (!confirm(`Process ${totalEligible} documents?\n\n${parts.join("\n")}`)) return;

    // Approve pending docs first
    for (const doc of pendingDocs) {
      try {
        await supabase.functions.invoke("embed-knowledge", {
          body: { action: "approve", documentId: doc.id },
        });
      } catch (err) {
        console.error(`Approve failed for ${doc.title}:`, err);
      }
    }

    // Chunk + embed both sets
    const toEmbed = [...pendingDocs, ...approvedUnchunked];
    await bulkChunkAndEmbed(toEmbed, "Bulk processing complete");
  };

  const bulkChunkAndEmbed = async (docs: any[], successMessage: string) => {
    setReEmbedAll({ running: true, total: docs.length, current: 0, currentTitle: "", chunkProgress: "" });

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      setReEmbedAll({ running: true, total: docs.length, current: i + 1, currentTitle: doc.title, chunkProgress: "Chunking…" });

      try {
        const { data: chunkData, error: chunkErr } = await supabase.functions.invoke("embed-knowledge", {
          body: { action: "chunk-only", documentId: doc.id },
        });
        if (chunkErr || !chunkData?.success) {
          console.error(`Chunking failed for ${doc.title}:`, chunkErr || chunkData);
          continue;
        }

        const totalChunks = chunkData.totalChunks;
        setReEmbedAll({ running: true, total: docs.length, current: i + 1, currentTitle: doc.title, chunkProgress: `0/${totalChunks}` });

        const BATCH_SIZE = 3;
        while (true) {
          const { data: batchData, error: batchErr } = await supabase.functions.invoke("embed-knowledge", {
            body: { action: "embed-batch", documentId: doc.id, batchSize: BATCH_SIZE },
          });
          if (batchErr) { console.error(`Embed batch failed for ${doc.title}:`, batchErr); break; }

          setReEmbedAll({ running: true, total: docs.length, current: i + 1, currentTitle: doc.title, chunkProgress: `${batchData.totalEmbedded || 0}/${totalChunks}` });

          if (batchData.done) break;
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (err) {
        console.error(`Processing failed for ${doc.title}:`, err);
      }
    }

    setReEmbedAll(null);
    queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    toast({ title: successMessage, description: `Processed ${docs.length} documents.` });
  };

  // ── AI Classification handler ──────────────────────────────────────
  const handleClassifyWithAI = async () => {
    if (processingDocs.length === 0) {
      toast({ title: "No documents to classify", description: "Upload documents first — only documents with 'processing' status and extracted content can be classified.", variant: "destructive" });
      return;
    }

    setClassifyDialogOpen(true);
    setClassifying(true);
    setClassifiedDocs([]);

    try {
      // Send in batches of 5 to edge function
      const allDocs = processingDocs.map((d: any) => ({
        documentId: d.id,
        contentText: d.content_text || "",
        fileName: d.file_name || d.title,
      }));

      const BATCH_SIZE = 5;
      const allResults: ClassifiedDoc[] = [];

      for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
        const batch = allDocs.slice(i, i + BATCH_SIZE);
        setClassifyProgress({ current: Math.min(i + BATCH_SIZE, allDocs.length), total: allDocs.length });

        const { data, error } = await supabase.functions.invoke("classify-knowledge-docs", {
          body: {
            documents: batch,
            knowledgeBases: knowledgeBases.map((kb: any) => ({
              id: kb.id,
              label: kb.label,
              description: kb.description,
            })),
          },
        });

        if (error) {
          console.error("Classification batch error:", error);
          toast({ title: "Classification error", description: error.message, variant: "destructive" });
          break;
        }

        if (data?.classifications) {
          allResults.push(...data.classifications);
        }
      }

      setClassifiedDocs(allResults);
    } catch (err: any) {
      toast({ title: "Classification failed", description: err.message, variant: "destructive" });
    } finally {
      setClassifying(false);
      setClassifyProgress(null);
    }
  };

  // ── Save classified docs ───────────────────────────────────────────
  const handleSaveClassified = async () => {
    if (classifiedDocs.length === 0) return;
    setSavingClassified(true);

    try {
      let successCount = 0;
      for (const doc of classifiedDocs) {
        const { error } = await supabase
          .from("knowledge_documents")
          .update({
            title: doc.title,
            description: doc.description,
            category: doc.category,
            knowledge_base_ids: doc.knowledgeBaseIds,
            agent_id: doc.knowledgeBaseIds[0] || "source-of-wealth",
            tenure_types: doc.tenureTypes,
            doc_type_tag: doc.docTypeTag,
            status: "pending",
          })
          .eq("id", doc.documentId);

        if (error) {
          console.error(`Failed to update ${doc.documentId}:`, error);
        } else {
          successCount++;
        }
      }

      toast({
        title: "Documents updated",
        description: `${successCount}/${classifiedDocs.length} documents classified and set to pending review.`,
      });
      setClassifyDialogOpen(false);
      setClassifiedDocs([]);
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingClassified(false);
    }
  };

  // ── Update a single classified doc field ───────────────────────────
  const updateClassifiedDoc = (documentId: string, updates: Partial<ClassifiedDoc>) => {
    setClassifiedDocs(prev =>
      prev.map(d => d.documentId === documentId ? { ...d, ...updates } : d)
    );
  };

  // ── Bulk selection helpers ────────────────────────────────────────
  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDocIds.size === classifiedDocs.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(classifiedDocs.map(d => d.documentId)));
    }
  };

  const applyBulkCategory = (category: string) => {
    setClassifiedDocs(prev =>
      prev.map(d => selectedDocIds.has(d.documentId) ? { ...d, category } : d)
    );
  };

  const applyBulkKnowledgeBase = (kbId: string) => {
    setClassifiedDocs(prev =>
      prev.map(d => {
        if (!selectedDocIds.has(d.documentId)) return d;
        const ids = d.knowledgeBaseIds.includes(kbId) ? d.knowledgeBaseIds : [...d.knowledgeBaseIds, kbId];
        return { ...d, knowledgeBaseIds: ids };
      })
    );
  };

  const removeBulkKnowledgeBase = (kbId: string) => {
    setClassifiedDocs(prev =>
      prev.map(d => {
        if (!selectedDocIds.has(d.documentId)) return d;
        const ids = d.knowledgeBaseIds.filter(id => id !== kbId);
        return { ...d, knowledgeBaseIds: ids.length > 0 ? ids : d.knowledgeBaseIds };
      })
    );
  };

  return (
    <AppLayout>
      <div
        className={`space-y-6 p-4 md:p-8 max-w-7xl mx-auto relative transition-colors ${pageDragOver ? "ring-2 ring-primary/40 ring-inset rounded-xl bg-primary/5" : ""}`}
        onDrop={handlePageDrop}
        onDragOver={handlePageDragOver}
        onDragLeave={handlePageDragLeave}
      >
        {/* Page-level drag overlay */}
        {pageDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 animate-bounce">
              <FolderOpen size={40} className="text-primary" />
              <p className="text-sm font-medium text-primary">Drop files or folders to add to Knowledge Base</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen size={24} className="text-primary" />
              Knowledge Base
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage segmented knowledge bases — assign documents to specific agents, tenures, and domains for targeted RAG retrieval.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {processingDocs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClassifyWithAI}
                disabled={classifying || reEmbedAll?.running}
                className="gap-1.5"
              >
                <Sparkles size={14} />
                Classify with AI ({processingDocs.length})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkChunkApprove}
              disabled={reEmbedAll?.running || processMutation.isPending}
              className="gap-1.5"
            >
              {reEmbedAll?.running ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs tabular-nums">
                    Doc {reEmbedAll.current}/{reEmbedAll.total} — {reEmbedAll.chunkProgress}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Process All Unchunked
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReEmbedAll}
              disabled={reEmbedAll?.running || processMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw size={14} />
              Re-embed All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) { toast({ title: "Not authenticated", variant: "destructive" }); return; }
                  const res = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-knowledge-csv`,
                    { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
                  );
                  if (!res.ok) throw new Error(await res.text());
                  const blob = await res.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `knowledge_documents_${format(new Date(), "yyyy-MM-dd")}.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  toast({ title: "CSV exported successfully" });
                } catch (e: any) {
                  toast({ title: "Export failed", description: e.message, variant: "destructive" });
                }
              }}
            >
              <Download size={14} />
              Export CSV
            </Button>
            <AddDocumentDialog
              open={dialogOpen}
              onOpenChange={(v) => { setDialogOpen(v); if (!v) setDroppedFiles([]); }}
              droppedFiles={droppedFiles}
              knowledgeBases={knowledgeBases}
              onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] }); setDroppedFiles([]); }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard label="Total Documents" value={documents.length} icon={FileText} />
          <StatCard
            label="Approved"
            value={documents.filter((d: any) => d.status === "approved").length}
            icon={Check}
          />
          <StatCard
            label="Pending Review"
            value={documents.filter((d: any) => d.status === "pending").length}
            icon={AlertCircle}
          />
          <StatCard
            label="Processing"
            value={processingDocs.length}
            icon={Sparkles}
            highlight={processingDocs.length > 0}
          />
          <StatCard
            label="Fetch Errors"
            value={documents.filter((d: any) => d.fetch_error).length}
            icon={AlertTriangle}
            highlight={documents.some((d: any) => d.fetch_error)}
          />
          <StatCard
            label="Total Chunks"
            value={documents.reduce((sum: number, d: any) => sum + (d.chunk_count || 0), 0)}
            icon={Brain}
          />
          <StatCard
            label="Firecrawl"
            value={documents.filter((d: any) => d.fetch_method === "firecrawl").length}
            icon={Globe}
          />
        </div>

        {/* Search + Tabs */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={kbFilter} onValueChange={setKbFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Knowledge Bases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Knowledge Bases</SelectItem>
              {knowledgeBases.map((kb: any) => (
                <SelectItem key={kb.id} value={kb.id}>{kb.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Documents Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BookOpen size={40} className="mb-3 opacity-40" />
                <p className="text-sm">No knowledge documents found.</p>
              </div>
            ) : (
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Title</TableHead>
                    <TableHead className="w-[15%]">Knowledge Base</TableHead>
                    <TableHead className="w-[12%]">Category</TableHead>
                    <TableHead className="w-[8%]">Status</TableHead>
                    <TableHead className="w-[7%] text-center">Chunks</TableHead>
                    <TableHead className="w-[10%]">Added</TableHead>
                    <TableHead className="w-[18%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((doc: any) => (
                    <TableRow key={doc.id}>
                      <TableCell className="overflow-hidden">
                        <div
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setViewContentDoc(doc)}
                          title="Click to view content"
                        >
                          <p className="font-medium text-xs flex items-center gap-1.5 text-primary underline-offset-2 hover:underline break-words whitespace-normal leading-snug">
                            {doc.source_url && <Globe size={12} className="text-muted-foreground shrink-0" />}
                            {doc.title}
                            {doc.fetch_method === "firecrawl" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                                🔥 Firecrawl
                              </Badge>
                            )}
                            {doc.fetch_method === "raw_fetch" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                                Raw fetch
                              </Badge>
                            )}
                            {doc.fetch_method === "pdf_gemini" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                📄 PDF
                              </Badge>
                            )}
                          </p>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{doc.description}</p>
                          )}
                          {doc.fetch_error && (
                            <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={11} className="shrink-0" />
                              Fetch error: {doc.fetch_error}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {(doc.knowledge_base_ids || []).map((kbId: string) => (
                            <Badge key={kbId} variant="secondary" className="text-[10px] w-fit">
                              {knowledgeBases.find((kb: any) => kb.id === kbId)?.label || kbId}
                            </Badge>
                          ))}
                          {(!doc.knowledge_base_ids || doc.knowledge_base_ids.length === 0) && (
                            <Badge variant="secondary" className="text-[10px] w-fit">Unassigned</Badge>
                          )}
                          {doc.tenure_types?.length > 0 && (
                            <div className="flex gap-0.5 flex-wrap">
                              {doc.tenure_types.map((t: string) => (
                                <Badge key={t} variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] || ""}`}>
                          {doc.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums">{doc.chunk_count || 0}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(doc.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          {doc.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-risk-green"
                                onClick={() => approveMutation.mutate(doc.id)}
                                disabled={approveMutation.isPending}
                              >
                                <Check size={14} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-destructive"
                                onClick={() => rejectMutation.mutate(doc.id)}
                                disabled={rejectMutation.isPending}
                              >
                                <X size={14} />
                              </Button>
                            </>
                          )}
                          {doc.fetch_error && doc.source_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-amber-600"
                              onClick={() => retryFetchMutation.mutate(doc)}
                              disabled={retryFetchMutation.isPending}
                              title="Retry fetch"
                            >
                              {retryFetchMutation.isPending ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RefreshCw size={14} />
                              )}
                            </Button>
                          )}
                          {doc.chunk_count === 0 && doc.content_text && (
                            embedProgress?.documentId === doc.id ? (
                              <div className="flex items-center gap-1.5 text-xs text-primary">
                                <Loader2 size={14} className="animate-spin" />
                                <span className="tabular-nums">
                                  {embedProgress.status === "chunking"
                                    ? "Chunking…"
                                    : embedProgress.status === "error"
                                    ? "Error"
                                    : `${embedProgress.embedded}/${embedProgress.totalChunks}`}
                                </span>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-primary"
                                onClick={() => processMutation.mutate(doc.id)}
                                disabled={processMutation.isPending}
                              >
                                <Brain size={14} />
                              </Button>
                            )
                          )}
                          {doc.content_text && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-muted-foreground"
                              onClick={() => setViewContentDoc(doc)}
                              title="View content"
                            >
                              <Eye size={14} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground"
                            onClick={() => setEditDoc({ ...doc })}
                            title="Edit classification"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            onClick={() => {
                              if (confirm("Delete this knowledge document?")) {
                                deleteMutation.mutate(doc.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View Content Dialog */}
        <Dialog open={!!viewContentDoc} onOpenChange={(open) => { if (!open) setViewContentDoc(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText size={18} className="text-primary" />
                {viewContentDoc?.title}
              </DialogTitle>
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="outline" className="text-xs">
                  {CATEGORIES.find((c) => c.value === viewContentDoc?.category)?.label || viewContentDoc?.category}
                </Badge>
                {viewContentDoc?.fetch_method && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {viewContentDoc.fetch_method}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {viewContentDoc?.content_text?.length?.toLocaleString()} characters
                </span>
              </div>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0 max-h-[60vh] border rounded-md">
              <pre className="p-4 text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
                {viewContentDoc?.content_text || "No content available."}
              </pre>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Classification Dialog */}
        <Dialog open={!!editDoc} onOpenChange={(open) => { if (!open) setEditDoc(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Pencil size={16} className="text-primary" />
                Edit Classification
              </DialogTitle>
              <p className="text-xs text-muted-foreground line-clamp-2 pt-1">{editDoc?.title}</p>
            </DialogHeader>
            {editDoc && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={editDoc.category} onValueChange={(v) => setEditDoc((prev: any) => ({ ...prev, category: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Knowledge Base(s)</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                    {knowledgeBases.map((kb: any) => (
                      <label key={kb.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={(editDoc.knowledge_base_ids || []).includes(kb.id)}
                          onCheckedChange={(checked) => {
                            setEditDoc((prev: any) => {
                              const ids = prev.knowledge_base_ids || [];
                              return { ...prev, knowledge_base_ids: checked ? [...ids, kb.id] : ids.filter((id: string) => id !== kb.id) };
                            });
                          }}
                        />
                        {kb.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tenure Types</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                    {TENURE_OPTIONS.map((t) => (
                      <label key={t.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={(editDoc.tenure_types || []).includes(t.value)}
                          onCheckedChange={(checked) => {
                            setEditDoc((prev: any) => {
                              const types = prev.tenure_types || [];
                              return { ...prev, tenure_types: checked ? [...types, t.value] : types.filter((v: string) => v !== t.value) };
                            });
                          }}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Doc Type Tag</Label>
                  <Select value={editDoc.doc_type_tag || "general"} onValueChange={(v) => setEditDoc((prev: any) => ({ ...prev, doc_type_tag: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPE_TAGS.map((d) => (
                        <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={editDoc.status} onValueChange={(v) => setEditDoc((prev: any) => ({ ...prev, status: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_COLORS).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <Button size="sm" onClick={async () => {
                if (!editDoc) return;
                const { error } = await supabase
                  .from("knowledge_documents")
                  .update({
                    category: editDoc.category,
                    knowledge_base_ids: editDoc.knowledge_base_ids || [],
                    tenure_types: editDoc.tenure_types || [],
                    doc_type_tag: editDoc.doc_type_tag || "general",
                    status: editDoc.status,
                  })
                  .eq("id", editDoc.id);
                if (error) {
                  toast({ title: "Update failed", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Classification updated" });
                  queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
                  setEditDoc(null);
                }
              }}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <Dialog open={classifyDialogOpen} onOpenChange={(open) => { if (!open && !classifying) { setClassifyDialogOpen(false); setClassifiedDocs([]); } }}>
          <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles size={18} className="text-primary" />
                AI Classification Review
              </DialogTitle>
              {classifying && classifyProgress && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Classifying documents… {classifyProgress.current}/{classifyProgress.total}
                </p>
              )}
              {!classifying && classifiedDocs.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Review and edit the AI classifications below. Documents marked with{" "}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                    Judge corrected
                  </Badge>
                  {" "}were modified by the verification stage.
                </p>
              )}
            </DialogHeader>

            {classifying ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Running AI classification + judge verification…
                  </p>
                  {classifyProgress && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {classifyProgress.current} of {classifyProgress.total} documents
                    </p>
                  )}
                </div>
              </div>
            ) : classifiedDocs.length > 0 ? (
              <>
                {/* Bulk action bar */}
                {selectedDocIds.size > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border rounded-md mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {selectedDocIds.size} selected
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Set category:</span>
                      <Select onValueChange={applyBulkCategory}>
                        <SelectTrigger className="h-7 w-[140px] text-xs">
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Set KB:</span>
                      <Select onValueChange={applyBulkKnowledgeBase}>
                        <SelectTrigger className="h-7 w-[160px] text-xs">
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          {knowledgeBases.map((kb: any) => (
                            <SelectItem key={kb.id} value={kb.id} className="text-xs">{kb.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs ml-auto"
                      onClick={() => setSelectedDocIds(new Set())}
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
                <ScrollArea className="flex-1 min-h-0 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={classifiedDocs.length > 0 && selectedDocIds.size === classifiedDocs.length}
                            onCheckedChange={toggleSelectAll}
                            className="h-3.5 w-3.5"
                          />
                        </TableHead>
                        <TableHead className="w-[180px]">File</TableHead>
                        <TableHead className="w-[200px]">Title</TableHead>
                        <TableHead className="w-[200px]">Description</TableHead>
                        <TableHead className="w-[130px]">Category</TableHead>
                        <TableHead className="w-[160px]">Knowledge Base</TableHead>
                        <TableHead className="w-[130px]">Doc Type</TableHead>
                        <TableHead className="w-[160px]">Tenure</TableHead>
                        <TableHead className="w-[60px]">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classifiedDocs.map((doc) => {
                        const sourceDoc = documents.find((d: any) => d.id === doc.documentId);
                        return (
                          <TableRow key={doc.documentId} data-state={selectedDocIds.has(doc.documentId) ? "selected" : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={selectedDocIds.has(doc.documentId)}
                                onCheckedChange={() => toggleDocSelection(doc.documentId)}
                                className="h-3.5 w-3.5"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="text-xs font-medium truncate max-w-[170px]" title={sourceDoc?.file_name}>
                                  {sourceDoc?.file_name || "Unknown"}
                                </p>
                                {doc.judgeOverridden && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                                    Judge corrected
                                  </Badge>
                                )}
                                {doc.error && (
                                  <p className="text-[10px] text-destructive">{doc.error}</p>
                                )}
                                {doc.judgeNotes && (
                                  <p className="text-[10px] text-muted-foreground italic">{doc.judgeNotes}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={doc.title}
                                onChange={(e) => updateClassifiedDoc(doc.documentId, { title: e.target.value })}
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={doc.description}
                                onChange={(e) => updateClassifiedDoc(doc.documentId, { description: e.target.value })}
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={doc.category}
                                onValueChange={(v) => updateClassifiedDoc(doc.documentId, { category: v })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORIES.map((c) => (
                                    <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {knowledgeBases.map((kb: any) => (
                                  <label key={kb.id} className="flex items-center gap-0.5 text-[10px] cursor-pointer">
                                    <Checkbox
                                      checked={doc.knowledgeBaseIds.includes(kb.id)}
                                      onCheckedChange={(checked) => {
                                        const newKBs = checked
                                          ? [...doc.knowledgeBaseIds, kb.id]
                                          : doc.knowledgeBaseIds.filter((id: string) => id !== kb.id);
                                        updateClassifiedDoc(doc.documentId, {
                                          knowledgeBaseIds: newKBs.length > 0 ? newKBs : doc.knowledgeBaseIds,
                                        });
                                      }}
                                      className="h-3 w-3"
                                    />
                                    {kb.label}
                                  </label>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={doc.docTypeTag}
                                onValueChange={(v) => updateClassifiedDoc(doc.documentId, { docTypeTag: v })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DOC_TYPE_TAGS.map((t) => (
                                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {TENURE_OPTIONS.map((t) => (
                                  <label key={t.value} className="flex items-center gap-0.5 text-[10px] cursor-pointer">
                                    <Checkbox
                                      checked={doc.tenureTypes.includes(t.value)}
                                      onCheckedChange={(checked) => {
                                        const newTenures = checked
                                          ? [...doc.tenureTypes, t.value]
                                          : doc.tenureTypes.filter(v => v !== t.value);
                                        updateClassifiedDoc(doc.documentId, { tenureTypes: newTenures });
                                      }}
                                      className="h-3 w-3"
                                    />
                                    {t.label}
                                  </label>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              {sourceDoc?.content_text && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => { setViewContentDoc(sourceDoc); }}
                                  title="View content"
                                >
                                  <Eye size={14} />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No classification results available.</p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setClassifyDialogOpen(false); setClassifiedDocs([]); setSelectedDocIds(new Set()); }}
                disabled={classifying || savingClassified}
              >
                Cancel
              </Button>
              {classifiedDocs.length > 0 && (
                <Button
                  onClick={handleSaveClassified}
                  disabled={savingClassified || classifying}
                  className="gap-1.5"
                >
                  {savingClassified ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Confirm & Save ({classifiedDocs.length})
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: any; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-400 bg-amber-50/50 dark:bg-amber-900/10" : ""}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${highlight ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"}`}>
          <Icon size={18} className={highlight ? "text-amber-600" : "text-primary"} />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const PDF_MAX_SIZE_MB = 20;
const PDF_MAX_SIZE_BYTES = PDF_MAX_SIZE_MB * 1024 * 1024;
const MEDIA_MAX_SIZE_MB = 50;
const MEDIA_MAX_SIZE_BYTES = MEDIA_MAX_SIZE_MB * 1024 * 1024;

// ── Add Document Dialog ────────────────────────────────────────────────
function AddDocumentDialog({ onSuccess, open, onOpenChange, droppedFiles, knowledgeBases }: {
  onSuccess: () => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  droppedFiles: File[];
  knowledgeBases: any[];
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"text" | "url" | "file">("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("regulatory");
  const [selectedKBs, setSelectedKBs] = useState<string[]>(["source-of-wealth"]);
  const [selectedTenures, setSelectedTenures] = useState<string[]>([]);
  const [lenderRelevance, setLenderRelevance] = useState(false);
  const [contentText, setContentText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [duplicateDoc, setDuplicateDoc] = useState<{ id: string; title: string; status: string } | null>(null);
  type UploadResultItem = {
    fileName: string;
    status: "queued" | "uploading" | "success" | "failed";
    error?: string;
    file: File;
    documentId?: string;
  };
  const [uploadResults, setUploadResults] = useState<UploadResultItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duplicate file detection state
  type DuplicateFileItem = {
    fileIndex: number;
    file: File;
    existingDocId: string;
    existingTitle: string;
    existingStatus: string;
    resolution: "pending" | "rename" | "skip";
    newName?: string;
  };
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFileItem[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // When dropped files arrive from page-level drop, merge them once into dialog selection
  useEffect(() => {
    if (droppedFiles.length === 0) return;

    setMode("file");
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const incoming = droppedFiles.filter((f) => !seen.has(`${f.name}:${f.size}:${f.lastModified}`));
      return incoming.length > 0 ? [...prev, ...incoming] : prev;
    });
  }, [droppedFiles]);

  // For file mode with bulk upload, title is optional (auto-generated per file)
  const canSubmitText = title.trim() !== "" && contentText.trim() !== "";
  const canSubmitUrl = title.trim() !== "" && sourceUrl.trim() !== "";
  const canSubmitFile = selectedFiles.length > 0;
  const canSubmit = mode === "text" ? canSubmitText : mode === "url" ? canSubmitUrl : canSubmitFile;

  // Check for duplicate title before submitting (only for text/url modes)
  const checkAndSubmit = async (replaceExisting = false) => {
    if (!canSubmit || !profile) return;

    // For file mode, scan for protected/IRM files first, then check duplicates
    if (mode === "file") {
      const protectedFiles: string[] = [];
      for (const f of selectedFiles) {
        const result = await detectProtectedFile(f);
        if (result.isProtected) {
          protectedFiles.push(`${f.name}: ${result.reason}`);
        }
      }
      if (protectedFiles.length > 0) {
        toast({
          title: `${protectedFiles.length} protected file${protectedFiles.length > 1 ? "s" : ""} detected`,
          description: protectedFiles.slice(0, 5).join("\n"),
          variant: "destructive",
          duration: 12000,
        });
        // Remove protected files from selection
        const protectedNames = new Set(protectedFiles.map((p) => p.split(":")[0]));
        setSelectedFiles((prev) => prev.filter((f) => !protectedNames.has(f.name)));
        if (protectedFiles.length === selectedFiles.length) return; // all files were protected
      }

      const fileNames = selectedFiles.filter((f) => !protectedFiles.some((p) => p.startsWith(f.name + ":"))).map((f) => f.name);
      const { data: existingDocs } = await supabase
        .from("knowledge_documents")
        .select("id, title, status, file_name")
        .in("file_name", fileNames);

      if (existingDocs && existingDocs.length > 0) {
        const dupes: DuplicateFileItem[] = [];
        existingDocs.forEach((existing) => {
          const fileIdx = selectedFiles.findIndex((f) => f.name === existing.file_name);
          if (fileIdx >= 0) {
            dupes.push({
              fileIndex: fileIdx,
              file: selectedFiles[fileIdx],
              existingDocId: existing.id,
              existingTitle: existing.title,
              existingStatus: existing.status,
              resolution: "pending",
            });
          }
        });
        if (dupes.length > 0) {
          setDuplicateFiles(dupes);
          setShowDuplicateDialog(true);
          return;
        }
      }
      await performSubmit();
      return;
    }

    if (!replaceExisting) {
      const { data: existing } = await supabase
        .from("knowledge_documents")
        .select("id, title, status")
        .eq("title", title.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        setDuplicateDoc({ id: existing[0].id, title: existing[0].title, status: existing[0].status });
        return;
      }
    }

    if (replaceExisting && duplicateDoc) {
      await supabase.from("knowledge_documents").delete().eq("id", duplicateDoc.id);
      await supabase.from("knowledge_chunks").delete().eq("document_id", duplicateDoc.id);
      setDuplicateDoc(null);
    }

    await performSubmit();
  };

  const handleSubmit = () => checkAndSubmit(false);
  const handleReplace = () => checkAndSubmit(true);

  // Handle duplicate resolution: apply renames/skips and proceed with upload
  const handleDuplicateResolution = async () => {
    const unresolved = duplicateFiles.filter((d) => d.resolution === "pending");
    if (unresolved.length > 0) {
      toast({ title: "Resolve all duplicates", description: "Please choose Rename or Skip for each duplicate file.", variant: "destructive" });
      return;
    }

    // Remove skipped files from selectedFiles
    const skippedIndices = new Set(duplicateFiles.filter((d) => d.resolution === "skip").map((d) => d.fileIndex));
    const renamedMap = new Map<number, string>();
    duplicateFiles.filter((d) => d.resolution === "rename" && d.newName).forEach((d) => {
      renamedMap.set(d.fileIndex, d.newName!);
    });

    // Build new file list: skip some, rename others
    const newFiles: File[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      if (skippedIndices.has(i)) continue;
      if (renamedMap.has(i)) {
        const originalFile = selectedFiles[i];
        const newName = renamedMap.get(i)!;
        const renamedFile = new File([originalFile], newName, { type: originalFile.type, lastModified: originalFile.lastModified });
        newFiles.push(renamedFile);
      } else {
        newFiles.push(selectedFiles[i]);
      }
    }

    setSelectedFiles(newFiles);
    setDuplicateFiles([]);
    setShowDuplicateDialog(false);

    if (newFiles.length === 0) {
      toast({ title: "All files skipped", description: "No files to upload.", variant: "default" });
      return;
    }

    // Pass files directly to avoid stale closure
    await performSubmit(newFiles);
  };

  const performSubmit = async (overrideFiles?: File[]) => {
    const filesToUse = overrideFiles || selectedFiles;
    if (mode === "file" && filesToUse.length === 0) return;
    if (!profile) return;
    if (mode !== "file" && !canSubmit) return;
    setSaving(true);
    try {
      if (mode === "url") {
        const { data, error } = await supabase.functions.invoke("embed-knowledge", {
          body: {
            action: "fetch-url",
            sourceUrl: sourceUrl.trim(),
            title: title.trim(),
            description: description.trim(),
            category,
            agentId: selectedKBs[0] || "source-of-wealth",
            knowledgeBaseIds: selectedKBs,
            tenureTypes: selectedTenures,
            lenderRelevance,
          },
        });

        if (error) throw error;

        if (data?.success) {
          toast({ title: "URL fetched successfully", description: `${data.chars} characters extracted. Document is pending review.` });
        } else {
          toast({
            title: "URL added with fetch error",
            description: data?.error || "The URL could not be fetched.",
            variant: "destructive",
          });
        }
      } else if (mode === "file") {
        // Bulk upload: create records first, then parse each file independently
        const filesToProcess = Array.from(filesToUse);
        const totalFiles = filesToProcess.length;
        const createFailures: string[] = [];
        const processingFailures: string[] = [];
        let createdCount = 0;

        // Initialize upload results with all files as "queued"
        const initialResults = filesToProcess.map((f) => ({
          fileName: f.name,
          status: "queued" as const,
          file: f,
        }));
        setUploadResults(initialResults);
        setShowResults(true);

        const updateFileStatus = (index: number, update: Partial<UploadResultItem>) => {
          setUploadResults((prev) => prev.map((r, i) => i === index ? { ...r, ...update } : r));
        };

        const createDocumentRecord = async (fileName: string, initialFetchMethod?: string) => {
          const autoTitle = fileName.replace(/\.[^.]+$/, "");
          const { data: newDoc, error } = await supabase
            .from("knowledge_documents")
            .insert({
              title: autoTitle,
              description: "",
              category: "regulatory",
              agent_id: "source-of-wealth",
              knowledge_base_ids: ["source-of-wealth"],
              tenure_types: [],
              lender_relevance: false,
              content_text: "",
              uploaded_by: profile.user_id,
              status: "processing",
              file_name: fileName,
              fetch_method: initialFetchMethod ?? null,
              fetch_error: null,
            })
            .select("id")
            .single();

          if (error || !newDoc?.id) {
            throw new Error(error?.message || `Failed to create record for ${fileName}`);
          }

          return newDoc.id as string;
        };

        const setDocumentContent = async (
          documentId: string,
          extractedText: string,
          fetchMethod: string
        ) => {
          const { error } = await supabase
            .from("knowledge_documents")
            .update({
              content_text: extractedText,
              status: "processing",
              fetch_method: fetchMethod,
              fetch_error: null,
            })
            .eq("id", documentId);

          if (error) {
            throw new Error(error.message || "Failed to update extracted content");
          }
        };

        const setDocumentError = async (documentId: string, errorMessage: string) => {
          await supabase
            .from("knowledge_documents")
            .update({
              fetch_error: errorMessage,
              status: "processing",
            })
            .eq("id", documentId);
        };

        const parsePdfFile = async (documentId: string, binFile: File) => {
          // Read file bytes eagerly to avoid stale File handles
          const bytes = new Uint8Array(await binFile.arrayBuffer());
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const base64 = btoa(binary);

          // Edge functions have a ~6MB payload limit; base64 adds ~33% overhead
          const MAX_PDF_BYTES = 4_500_000; // ~4.5MB raw → ~6MB base64
          if (bytes.length > MAX_PDF_BYTES) {
            throw new Error(`File "${binFile.name}" is too large (${(bytes.length / 1_000_000).toFixed(1)} MB). Maximum supported size is ~4.5 MB.`);
          }

          // Retry up to 2 times with delay — Gemini can return 400 "no pages"
          // transiently when hit with rapid sequential requests
          const MAX_RETRIES = 2;
          let lastError: Error | null = null;

          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
              console.log(`[KB Upload] Retry ${attempt}/${MAX_RETRIES} for ${binFile.name}`);
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }

            const { data, error: parseErr } = await supabase.functions.invoke("embed-knowledge", {
              body: { action: "parse-pdf", documentId, pdfBase64: base64, fileName: binFile.name },
            });

            if (parseErr) {
              lastError = new Error(parseErr.message || "PDF parsing request failed");
              continue;
            }

            if (!data?.success) {
              lastError = new Error(data?.error || "PDF parsing failed");
              // Only retry on transient-looking errors (400s from Gemini)
              if (data?.error?.includes("HTTP 400") || data?.error?.includes("no pages")) {
                continue;
              }
              throw lastError;
            }

            // Success
            return;
          }

          throw lastError || new Error("PDF parsing failed after retries");
        };

        // Small delay helper to space out Gemini API calls
        const delayBetweenPdfs = () => new Promise((r) => setTimeout(r, 1500));

        for (let idx = 0; idx < totalFiles; idx++) {
          const file = filesToProcess[idx];
          const lowerName = file.name.toLowerCase();
          const isPdfFile = /\.pdf$/i.test(lowerName);
          setParsingProgress({ current: idx + 1, total: totalFiles, fileName: file.name });
          updateFileStatus(idx, { status: "uploading" });

          let createdDocId: string | null = null;

          try {
            if (/\.(txt|md|csv)$/i.test(lowerName)) {
              createdDocId = await createDocumentRecord(file.name);
              createdCount++;
              const text = await file.text();
              await setDocumentContent(createdDocId, text, "text_upload");
              updateFileStatus(idx, { status: "success", documentId: createdDocId });
              continue;
            }

            if (/\.docx$/i.test(lowerName)) {
              createdDocId = await createDocumentRecord(file.name);
              createdCount++;

              try {
                const ab = await file.arrayBuffer();
                if (isOLE2Format(ab)) {
                  // OLE2 .docx — try legacy extraction, check quality, fallback to Gemini
                  try {
                    const legacyText = await extractLegacyDocText(file);
                    if (!isGarbledText(legacyText)) {
                      await setDocumentContent(createdDocId, legacyText, "doc_legacy_fallback");
                      updateFileStatus(idx, { status: "success", documentId: createdDocId });
                      continue;
                    }
                  } catch { /* fall through to Gemini */ }
                  // Garbled or failed — use Gemini multimodal
                  console.log(`[KB Upload] ${file.name}: legacy extraction produced garbled text, falling back to Gemini`);
                  if (idx > 0) await delayBetweenPdfs();
                  await parsePdfFile(createdDocId, file);
                  updateFileStatus(idx, { status: "success", documentId: createdDocId });
                  continue;
                }

                const extractedText = await extractDocxText(file);
                if (!isGarbledText(extractedText)) {
                  await setDocumentContent(createdDocId, extractedText, "docx_client");
                  updateFileStatus(idx, { status: "success", documentId: createdDocId });
                  continue;
                }
                // Garbled DOCX text — try Gemini
                console.log(`[KB Upload] ${file.name}: DOCX extraction produced garbled text, falling back to Gemini`);
                if (idx > 0) await delayBetweenPdfs();
                await parsePdfFile(createdDocId, file);
                updateFileStatus(idx, { status: "success", documentId: createdDocId });
                continue;
              } catch {
                // All client-side extraction failed — try Gemini as last resort
                try {
                  console.log(`[KB Upload] ${file.name}: client extraction failed, falling back to Gemini`);
                  if (idx > 0) await delayBetweenPdfs();
                  await parsePdfFile(createdDocId, file);
                  updateFileStatus(idx, { status: "success", documentId: createdDocId });
                  continue;
                } catch {
                  // Gemini also failed — try legacy as absolute last resort
                  try {
                    const legacyText = await extractLegacyDocText(file);
                    await setDocumentContent(createdDocId, legacyText, "docx_legacy_fallback");
                    updateFileStatus(idx, { status: "success", documentId: createdDocId, error: "⚠️ Text may be garbled — consider re-saving as PDF" });
                  } catch (legacyErr: any) {
                    await setDocumentError(createdDocId, "Could not extract text from this file. Please re-save as .docx or PDF.");
                    updateFileStatus(idx, { status: "failed", error: "Unreadable file — re-save as PDF", documentId: createdDocId });
                  }
                  continue;
                }
              }
            }

            if (/\.doc$/i.test(lowerName)) {
              createdDocId = await createDocumentRecord(file.name);
              createdCount++;

              // Try legacy extraction first, check quality
              let legacyText = "";
              try {
                legacyText = await extractLegacyDocText(file);
              } catch { /* empty */ }

              if (legacyText && !isGarbledText(legacyText)) {
                await setDocumentContent(createdDocId, legacyText, "doc_client_best_effort");
                updateFileStatus(idx, { status: "success", documentId: createdDocId });
                continue;
              }

              // Garbled or empty — fall back to Gemini multimodal
              console.log(`[KB Upload] ${file.name}: .doc extraction garbled, falling back to Gemini`);
              try {
                if (idx > 0) await delayBetweenPdfs();
                await parsePdfFile(createdDocId, file);
                updateFileStatus(idx, { status: "success", documentId: createdDocId });
              } catch {
                // Gemini also failed — store whatever we have with a warning
                if (legacyText) {
                  await setDocumentContent(createdDocId, legacyText, "doc_client_garbled");
                  updateFileStatus(idx, { status: "success", documentId: createdDocId, error: "⚠️ Text may be garbled — consider re-saving as PDF" });
                } else {
                  await setDocumentError(createdDocId, "Could not extract text. Please re-save as .docx or PDF.");
                  updateFileStatus(idx, { status: "failed", error: "Unreadable file — re-save as PDF", documentId: createdDocId });
                }
              }
              continue;
            }

            if (isPdfFile) {
              createdDocId = await createDocumentRecord(file.name);
              createdCount++;
              // Add delay before PDF parsing to avoid Gemini 400 errors in batch
              if (idx > 0) await delayBetweenPdfs();
              await parsePdfFile(createdDocId, file);
              updateFileStatus(idx, { status: "success", documentId: createdDocId });
              continue;
            }

            // Audio/Video files — upload to storage, transcribe via edge function with LLM judge
            if (AUDIO_VIDEO_EXTENSIONS.test(lowerName)) {
              if (file.size > MEDIA_MAX_SIZE_BYTES) {
                updateFileStatus(idx, { status: "failed", error: `Exceeds ${MEDIA_MAX_SIZE_MB}MB limit` });
                createFailures.push(`${file.name} (exceeds ${MEDIA_MAX_SIZE_MB}MB limit)`);
                continue;
              }
              createdDocId = await createDocumentRecord(file.name, "media_transcription");
              createdCount++;
              try {
                // Upload to storage first
                const storagePath = `knowledge-media/${createdDocId}/${file.name}`;
                const { error: uploadErr } = await supabase.storage.from("case-documents").upload(storagePath, file);
                if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

                // Call edge function to transcribe + judge verify
                const { data: txData, error: txErr } = await supabase.functions.invoke("ingest-file-to-text", {
                  body: { bucket: "case-documents", file_path: storagePath, judge_verify: true },
                });
                if (txErr) throw new Error(txErr.message || "Transcription failed");
                if (txData?.status === "error") throw new Error(txData?.error_message || "Transcription produced no text");

                // Save transcript to knowledge_documents
                const transcript = txData?.transcript || txData?.raw_text || "";
                const judgeResult = txData?.judge_result;
                const fetchMethod = judgeResult?.verified ? "media_transcription_verified" : "media_transcription";
                await setDocumentContent(createdDocId, transcript, fetchMethod);
                
                if (judgeResult && !judgeResult.verified) {
                  updateFileStatus(idx, { status: "success", documentId: createdDocId, error: `⚠️ Judge flagged: ${judgeResult.notes || "low confidence"}` });
                } else {
                  updateFileStatus(idx, { status: "success", documentId: createdDocId });
                }
                if (idx > 0) await delayBetweenPdfs();
              } catch (mediaErr: any) {
                await setDocumentError(createdDocId, mediaErr.message);
                updateFileStatus(idx, { status: "failed", error: mediaErr.message, documentId: createdDocId });
                processingFailures.push(`${file.name} (${mediaErr.message})`);
              }
              continue;
            }

            // Image files — OCR via Gemini
            if (IMAGE_EXTENSIONS.test(lowerName)) {
              createdDocId = await createDocumentRecord(file.name, "image_ocr");
              createdCount++;
              try {
                if (idx > 0) await delayBetweenPdfs();
                await parsePdfFile(createdDocId, file); // reuses Gemini multimodal extraction
                updateFileStatus(idx, { status: "success", documentId: createdDocId });
              } catch (imgErr: any) {
                await setDocumentError(createdDocId, imgErr.message);
                updateFileStatus(idx, { status: "failed", error: imgErr.message, documentId: createdDocId });
                processingFailures.push(`${file.name} (${imgErr.message})`);
              }
              continue;
            }

            updateFileStatus(idx, { status: "failed", error: "Unsupported file type" });
            createFailures.push(`${file.name} (unsupported file type)`);
          } catch (err: any) {
            const message = err?.message || "upload failed";
            updateFileStatus(idx, { status: "failed", error: message, documentId: createdDocId ?? undefined });

            if (createdDocId) {
              processingFailures.push(`${file.name} (${message})`);
              if (!isPdfFile) {
                await setDocumentError(createdDocId, message).catch(() => undefined);
              }
            } else {
              createFailures.push(`${file.name} (${message})`);
            }
          }
        }

        setParsingProgress(null);

        // Show results
        const allIssues = [...createFailures, ...processingFailures];
        if (allIssues.length > 0) {
          const failedNames = allIssues.slice(0, 8).join("\n• ");
          const extra = allIssues.length > 8 ? `\n…and ${allIssues.length - 8} more` : "";
          toast({
            title: `${createdCount} created, ${allIssues.length} issue${allIssues.length !== 1 ? "s" : ""}`,
            description: `Issues:\n• ${failedNames}${extra}`,
            variant: createdCount === 0 ? "destructive" : "default",
            duration: 15000,
          });
        } else {
          toast({
            title: "Documents uploaded",
            description: `${createdCount} file(s) uploaded. Use "Classify with AI" to auto-categorise them.`,
          });
        }
      } else {
        const { error } = await supabase.from("knowledge_documents").insert({
          title: title.trim(),
          description: description.trim(),
          category,
          agent_id: selectedKBs[0] || "source-of-wealth",
          knowledge_base_ids: selectedKBs,
          tenure_types: selectedTenures,
          lender_relevance: lenderRelevance,
          content_text: contentText.trim(),
          uploaded_by: profile.user_id,
          status: "pending",
        });

        if (error) throw error;
        toast({ title: "Document submitted", description: "It will be available after admin approval and embedding." });
      }

      // Only close dialog and reset if no failures
      const hasFailures = uploadResults.some((r) => r.status === "failed");
      setTitle("");
      setDescription("");
      setContentText("");
      setSourceUrl("");
      if (!hasFailures) {
        setSelectedFiles([]);
        setUploadResults([]);
        setShowResults(false);
        setDuplicateDoc(null);
        onOpenChange(false);
      }
      setCategory("regulatory");
      setMode("file");
      onSuccess();
    } catch (e: any) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const retryFailedFile = async (resultIndex: number) => {
    const item = uploadResults[resultIndex];
    if (!item || item.status !== "failed") return;

    const file = item.file;
    const lowerName = file.name.toLowerCase();
    const isPdf = /\.pdf$/i.test(lowerName);

    setUploadResults((prev) => prev.map((r, i) => i === resultIndex ? { ...r, status: "uploading" as const, error: undefined } : r));

    try {
      // If a document record already exists, just retry the parse
      if (item.documentId && isPdf) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);

        const MAX_PDF_BYTES = 4_500_000;
        if (bytes.length > MAX_PDF_BYTES) {
          throw new Error(`File "${file.name}" is too large (${(bytes.length / 1_000_000).toFixed(1)} MB). Maximum supported size is ~4.5 MB.`);
        }

        const { data, error: parseErr } = await supabase.functions.invoke("embed-knowledge", {
          body: { action: "parse-pdf", documentId: item.documentId, pdfBase64: base64, fileName: file.name },
        });

        if (parseErr) throw new Error(parseErr.message || "Retry failed");
        if (!data?.success) throw new Error(data?.error || "Retry failed");

        setUploadResults((prev) => prev.map((r, i) => i === resultIndex ? { ...r, status: "success" as const } : r));
        toast({ title: "Retry successful", description: `${file.name} processed successfully.` });
        onSuccess();
        return;
      }

      // For non-PDF or no existing record, show message
      toast({ title: "Cannot retry", description: "Please remove this file and re-upload it.", variant: "destructive" });
      setUploadResults((prev) => prev.map((r, i) => i === resultIndex ? { ...r, status: "failed" as const, error: item.error } : r));
    } catch (err: any) {
      const message = err?.message || "Retry failed";
      setUploadResults((prev) => prev.map((r, i) => i === resultIndex ? { ...r, status: "failed" as const, error: message } : r));
      toast({ title: "Retry failed", description: message, variant: "destructive" });
    }
  };

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { files: allFiles, zipErrors } = await extractFilesFromDrop(e);
    const supported = filterKBFiles(allFiles);
    const rejected = allFiles.filter((f) => !KB_ACCEPTED_EXT.test(f.name));

    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).slice(0, 10).join(", ");
      const extra = rejected.length > 10 ? ` and ${rejected.length - 10} more` : "";
      toast({
        title: `${rejected.length} unsupported file${rejected.length !== 1 ? "s" : ""} skipped`,
        description: `${names}${extra}. Supported: documents, images, audio & video files.`,
        variant: "destructive",
      });
    }

    if (supported.length === 0 && rejected.length === 0) {
      const desc = zipErrors.length ? zipErrors.join("; ") : "Supported: documents, images, audio & video files.";
      toast({ title: "No supported files found", description: desc, variant: "destructive" });
      return;
    }

    const oversizedPdf = supported.filter((f) => f.name.toLowerCase().endsWith(".pdf") && f.size > PDF_MAX_SIZE_BYTES);
    const oversizedMedia = supported.filter((f) => MEDIA_EXTENSIONS.test(f.name) && f.size > MEDIA_MAX_SIZE_BYTES);
    const oversized = [...oversizedPdf, ...oversizedMedia];
    const oversizedNames = new Set(oversized.map((f) => f.name));
    const valid = supported.filter((f) => !oversizedNames.has(f.name));
    if (oversized.length > 0) {
      toast({ title: "File(s) too large", description: `${oversized.map((f) => f.name).join(", ")} exceed size limits.`, variant: "destructive" });
    }
    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  }, [toast]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const result = await processUploadedFiles(e.target.files);
    e.target.value = ""; // allow re-selecting same files
    const allFiles = result.files;
    const supported = filterKBFiles(allFiles);
    const rejected = allFiles.filter((f) => !KB_ACCEPTED_EXT.test(f.name));

    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).slice(0, 10).join(", ");
      const extra = rejected.length > 10 ? ` and ${rejected.length - 10} more` : "";
      toast({
        title: `${rejected.length} unsupported file${rejected.length !== 1 ? "s" : ""} skipped`,
        description: `${names}${extra}. Supported: documents, images, audio & video files.`,
        variant: "destructive",
      });
    }

    if (supported.length === 0 && rejected.length === 0) {
      const desc = result.zipErrors.length ? result.zipErrors.join("; ") : "Supported: documents, images, audio & video files.";
      toast({ title: "No supported files found", description: desc, variant: "destructive" });
      return;
    }

    const oversizedPdf = supported.filter((f) => f.name.toLowerCase().endsWith(".pdf") && f.size > PDF_MAX_SIZE_BYTES);
    const oversizedMedia = supported.filter((f) => MEDIA_EXTENSIONS.test(f.name) && f.size > MEDIA_MAX_SIZE_BYTES);
    const oversized = [...oversizedPdf, ...oversizedMedia];
    const oversizedNames = new Set(oversized.map((f) => f.name));
    const valid = supported.filter((f) => !oversizedNames.has(f.name));
    if (oversized.length > 0) {
      toast({ title: "File(s) too large", description: `${oversized.map((f) => f.name).join(", ")} exceed size limits.`, variant: "destructive" });
    }
    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  }, [toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus size={16} />
          Add Documents
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Knowledge Documents</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
          {/* Mode Toggle */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "url" | "file")}>
            <TabsList className="w-full">
              <TabsTrigger value="file" className="flex-1 gap-1.5">
                <FileUp size={14} />
                Upload Files
              </TabsTrigger>
              <TabsTrigger value="text" className="flex-1 gap-1.5">
                <FileText size={14} />
                Paste Text
              </TabsTrigger>
              <TabsTrigger value="url" className="flex-1 gap-1.5">
                <Globe size={14} />
                From URL
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "file" ? (
            <>
              <div className="rounded-lg border border-dashed p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Sparkles size={12} className="text-primary shrink-0" />
                  Upload files now — then use <strong>"Classify with AI"</strong> to auto-categorise them with AI + judge verification.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>File(s)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5"
                  onDrop={handleFileDrop}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                   <input
                     ref={fileInputRef}
                     type="file"
                     accept=".txt,.md,.csv,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.tiff,.bmp,.gif,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv"
                     multiple
                     className="hidden"
                     onChange={handleFileSelect}
                   />
                   <FolderOpen size={24} className="mx-auto text-muted-foreground mb-2" />
                   <p className="text-sm text-muted-foreground">
                     Drag & drop <span className="font-medium text-foreground">files or folders</span> — or click to select
                   </p>
                   <p className="text-xs text-muted-foreground mt-1">
                     Documents: .txt, .md, .csv, .pdf, .doc, .docx · Images: .jpg, .png, .webp · Audio/Video: .mp3, .wav, .mp4, .mov
                   </p>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="space-y-1">
                    {selectedFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                        <span className="truncate">
                          {f.name} ({(f.size / 1024).toFixed(1)} KB)
                          {f.name.toLowerCase().endsWith(".pdf") && f.size > PDF_MAX_SIZE_BYTES && (
                            <span className="text-destructive ml-1">⚠ exceeds {PDF_MAX_SIZE_MB}MB limit</span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-destructive"
                          onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <X size={12} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setDuplicateDoc(null); }}
                  placeholder="e.g. MLR 2017 Source of Wealth Guidance"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Knowledge Base(s)</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                    {knowledgeBases.map((kb: any) => (
                      <label key={kb.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedKBs.includes(kb.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedKBs(prev => [...prev, kb.id]);
                            else setSelectedKBs(prev => prev.filter(id => id !== kb.id));
                          }}
                          className="h-3.5 w-3.5"
                        />
                        {kb.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tenure Tags (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {TENURE_OPTIONS.map((t) => (
                    <label key={t.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTenures.includes(t.value)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTenures(prev => [...prev, t.value]);
                          else setSelectedTenures(prev => prev.filter(v => v !== t.value));
                        }}
                        className="rounded border-input"
                      />
                      {t.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-2">
                    <input
                      type="checkbox"
                      checked={lenderRelevance}
                      onChange={(e) => setLenderRelevance(e.target.checked)}
                      className="rounded border-input"
                    />
                    Lender Relevant
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the content"
                />
              </div>

              {mode === "text" ? (
                <div className="space-y-1.5">
                  <Label>Content</Label>
                  <Textarea
                    value={contentText}
                    onChange={(e) => setContentText(e.target.value)}
                    placeholder="Paste the document text here..."
                    rows={10}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the full text content. It will be automatically chunked and embedded for retrieval.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Source URL</Label>
                  <div className="flex items-center gap-2">
                    <Link2 size={16} className="text-muted-foreground shrink-0" />
                    <Input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://example.com/guidance-document"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The page content will be fetched and extracted automatically.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        {/* Duplicate file resolution dialog */}
        {showDuplicateDialog && duplicateFiles.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {duplicateFiles.length} duplicate file{duplicateFiles.length !== 1 ? "s" : ""} found
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  The following files already exist in the Knowledge Base. Rename or skip each one.
                </p>
              </div>
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {duplicateFiles.map((dup, i) => (
                  <div key={dup.fileIndex} className="rounded border bg-background p-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <FileText size={12} className="text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{dup.file.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {dup.existingStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 ml-5">
                      <Button
                        size="sm"
                        variant={dup.resolution === "rename" ? "default" : "outline"}
                        className="h-6 text-xs gap-1 px-2"
                        onClick={() => {
                          const ext = dup.file.name.match(/\.[^.]+$/)?.[0] || "";
                          const baseName = dup.file.name.replace(/\.[^.]+$/, "");
                          const suggestedName = `${baseName}_copy${ext}`;
                          setDuplicateFiles((prev) =>
                            prev.map((d, idx) =>
                              idx === i ? { ...d, resolution: "rename", newName: d.newName || suggestedName } : d
                            )
                          );
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant={dup.resolution === "skip" ? "default" : "outline"}
                        className="h-6 text-xs gap-1 px-2"
                        onClick={() => {
                          setDuplicateFiles((prev) =>
                            prev.map((d, idx) => (idx === i ? { ...d, resolution: "skip" } : d))
                          );
                        }}
                      >
                        Skip
                      </Button>
                    </div>
                    {dup.resolution === "rename" && (
                      <div className="ml-5">
                        <Input
                          value={dup.newName || ""}
                          onChange={(e) =>
                            setDuplicateFiles((prev) =>
                              prev.map((d, idx) => (idx === i ? { ...d, newName: e.target.value } : d))
                            )
                          }
                          placeholder="Enter new file name"
                          className="h-7 text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setDuplicateFiles([]);
                  setShowDuplicateDialog(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  // Skip all: remove all duplicate files from selection and proceed
                  const dupIndices = new Set(duplicateFiles.map((d) => d.fileIndex));
                  const remaining = selectedFiles.filter((_, idx) => !dupIndices.has(idx));
                  setSelectedFiles(remaining);
                  setDuplicateFiles([]);
                  setShowDuplicateDialog(false);
                  if (remaining.length > 0) {
                    performSubmit(remaining);
                  } else {
                    toast({ title: "All files skipped", description: "No files to upload.", variant: "default" });
                  }
                }}
              >
                <X size={12} />
                Skip All
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleDuplicateResolution}
                disabled={duplicateFiles.some((d) => d.resolution === "pending")}
              >
                <Check size={12} />
                Continue Upload
              </Button>
            </div>
          </div>
        )}
        {/* Duplicate warning banner */}
        {duplicateDoc && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  A document titled "{duplicateDoc.title}" already exists
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Status: <span className="font-medium">{duplicateDoc.status}</span>. Would you like to replace it?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-6">
              <Button size="sm" variant="destructive" onClick={handleReplace} disabled={saving} className="h-7 text-xs gap-1">
                <RefreshCw size={12} />
                Replace Existing
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDuplicateDoc(null)} disabled={saving} className="h-7 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        )}
        {/* Upload Results Panel */}
        {showResults && uploadResults.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
              <span className="text-xs font-medium text-foreground">
                Upload Results — {uploadResults.filter((r) => r.status === "success").length}/{uploadResults.length} successful
              </span>
              {!saving && uploadResults.every((r) => r.status === "success") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => {
                    setShowResults(false);
                    setUploadResults([]);
                    setSelectedFiles([]);
                    onOpenChange(false);
                  }}
                >
                  <X size={12} /> Close
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-48">
              <div className="divide-y">
                {uploadResults.map((result, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    {result.status === "queued" && (
                      <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    )}
                    {result.status === "uploading" && (
                      <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                    )}
                    {result.status === "success" && (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    )}
                    {result.status === "failed" && (
                      <AlertCircle size={14} className="text-destructive shrink-0" />
                    )}
                    <span className="truncate flex-1 text-foreground">{result.fileName}</span>
                    {result.status === "failed" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-destructive truncate max-w-[120px]" title={result.error}>
                          {result.error?.slice(0, 30)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-1.5 text-xs gap-0.5"
                          onClick={() => retryFailedFile(i)}
                          disabled={saving}
                        >
                          <RefreshCw size={10} /> Retry
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {parsingProgress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              <Loader2 size={14} className="animate-spin" />
              <span>Parsing file {parsingProgress.current}/{parsingProgress.total}: {parsingProgress.fileName}</span>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={saving || !canSubmit || !!duplicateDoc || showDuplicateDialog}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : mode === "url" ? <Globe size={14} className="mr-1" /> : mode === "file" ? <Upload size={14} className="mr-1" /> : <Upload size={14} className="mr-1" />}
            {mode === "url" ? "Fetch & Add" : mode === "file" ? `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? "s" : ""}` : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

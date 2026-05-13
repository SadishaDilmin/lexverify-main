import { useState, useRef, useCallback, useEffect } from "react";
import { withRetry } from "@/lib/retryUpload";
import { sha256, validateBatch, deduplicateFiles, parallelUpload, MAX_UPLOAD_FILE_SIZE } from "@/lib/uploadUtils";
import { Upload, FileText, Loader2, CheckCircle2, X, Landmark, Droplets, TreePine, Zap, Plus, AlertTriangle, FileStack, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DOC_TYPE_TO_FOLDER } from "@/lib/caseFolders";
import { useDocumentChecklist } from "@/hooks/useDocumentChecklist";
import { motion, AnimatePresence } from "framer-motion";

const ICON_MAP: Record<string, React.ElementType> = {
  local_authority: Landmark,
  drainage_water: Droplets,
  environmental: TreePine,
  epc: Zap,
  management_pack: FileStack,
  licence_to_alter: ScrollText,
};

const STATIC_CORE_DOC_TYPES = [
  { value: "local_authority", label: "Local Authority Search", icon: Landmark },
  { value: "drainage_water", label: "Drainage & Water Search", icon: Droplets },
  { value: "environmental", label: "Environmental Search", icon: TreePine },
  { value: "epc", label: "EPC", icon: Zap },
];

const ADDON_DOC_TYPES = [
  { value: "management_pack", label: "Management Pack / LPE1", icon: FileStack },
  { value: "licence_to_alter", label: "Licence to Alter", icon: ScrollText },
];

interface QueuedFile {
  id: string;
  file: File;
  docType: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface DocumentUploadProps {
  caseId: string;
  existingDocTypes: string[];
  /** Add-on document IDs enabled for this case (e.g. ["management-pack"]) */
  enabledAddOns?: string[];
  /** Agent type for document checklist lookup (defaults to static core types) */
  checklistAgentType?: string;
}

const DocumentUpload = ({ caseId, existingDocTypes, enabledAddOns = [], checklistAgentType }: DocumentUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch core doc types from DB if an agent type is specified, otherwise use static defaults
  const { data: checklistItems } = useDocumentChecklist(checklistAgentType || "");
  const CORE_DOC_TYPES = (checklistAgentType && checklistItems)
    ? checklistItems.map((item) => ({
        value: item.doc_slot_id,
        label: item.doc_name,
        icon: ICON_MAP[item.doc_slot_id] || FileText,
      }))
    : STATIC_CORE_DOC_TYPES;

  // Build allowed doc types: core + enabled add-ons
  const addonDocTypeMap: Record<string, string> = {
    "management-pack": "management_pack",
    "licence-to-alter": "licence_to_alter",
  };
  const enabledAddonDocTypes = ADDON_DOC_TYPES.filter((dt) =>
    enabledAddOns.some((a) => addonDocTypeMap[a] === dt.value)
  );
  const DOC_TYPES = [...CORE_DOC_TYPES, ...enabledAddonDocTypes];

  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const usedDocTypes = [
    ...existingDocTypes,
    ...queue.filter((q) => q.status !== "error").map((q) => q.docType),
  ];

  const availableDocTypes = DOC_TYPES.filter(
    (dt) => !usedDocTypes.includes(dt.value)
  );

  // Track hashes of already-uploaded docs for dedup
  const [uploadedHashes, setUploadedHashes] = useState<Set<string>>(new Set());

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);

    // Validate batch
    const { valid, rejected } = validateBatch(arr);
    if (rejected.length > 0) {
      toast({
        title: `${rejected.length} file(s) rejected`,
        description: rejected.slice(0, 3).map((r) => `${r.file.name}: ${r.reason}`).join("; "),
        variant: "destructive",
      });
    }

    // Deduplicate against existing uploads
    const { unique, duplicates } = await deduplicateFiles(valid, uploadedHashes);
    if (duplicates.length > 0) {
      toast({
        title: `${duplicates.length} duplicate(s) skipped`,
        description: duplicates.slice(0, 3).map((f) => f.name).join(", "),
      });
    }

    // Track new hashes
    const newHashes = new Set(uploadedHashes);
    for (const file of unique) {
      try {
        const hash = await sha256(file);
        newHashes.add(hash);
      } catch { /* ignore */ }
    }
    setUploadedHashes(newHashes);

    const newItems: QueuedFile[] = [];
    const available = DOC_TYPES.filter(
      (dt) => !usedDocTypes.includes(dt.value) && !newItems.some((n) => n.docType === dt.value)
    );

    for (const file of unique) {
      const autoType = available.shift();
      newItems.push({
        id: crypto.randomUUID(),
        file,
        docType: autoType?.value ?? "",
        status: "pending",
        progress: 0,
      });
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  }, [usedDocTypes, toast, uploadedHashes]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateQueueItem = (id: string, updates: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const uploadSingleFile = async (item: QueuedFile) => {
    if (!user) throw new Error("Not authenticated");

    const filePath = `${caseId}/${item.docType}/${item.file.name}`;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          updateQueueItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed with status ${xhr.status}`));
      });
      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.open("POST", `${supabaseUrl}/storage/v1/object/case-documents/${filePath}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.send(item.file);
    });

    const { error: dbError } = await supabase.from("documents").insert({
      case_id: caseId,
      doc_type: item.docType,
      file_name: item.file.name,
      file_path: filePath,
      uploaded_by: user.id,
      appears_complete: true,
    });
    if (dbError) throw dbError;

    // Also copy file into the mapped case folder so it appears in Case Files
    const targetFolder = DOC_TYPE_TO_FOLDER[item.docType];
    if (targetFolder) {
      const folderPath = `${caseId}/${targetFolder}/${item.file.name}`;
      await supabase.storage
        .from("case-documents")
        .upload(folderPath, item.file, { upsert: true });
    }
  };

  const handleUploadAll = async () => {
    const pending = queue.filter((q) => q.status === "pending" && q.docType);
    if (pending.length === 0) return;

    setUploading(true);

    // Mark all as uploading
    for (const item of pending) {
      updateQueueItem(item.id, { status: "uploading", progress: 0 });
    }

    const results = await parallelUpload(pending, async (item) => {
      try {
        setRetryInfo(null);
        await withRetry(() => uploadSingleFile(item), {
          onRetry: (attempt, max) => setRetryInfo(`Retrying upload (attempt ${attempt}/${max})…`),
        });
        updateQueueItem(item.id, { status: "done", progress: 100 });
        setRetryInfo(null);
      } catch (err: any) {
        setRetryInfo(null);
        updateQueueItem(item.id, { status: "error", error: err.message });
        throw err;
      }
    }, 5);

    const successCount = results.filter((r) => r.status === "fulfilled").length;

    queryClient.invalidateQueries({ queryKey: ["documents", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
    setUploading(false);

    if (successCount > 0) {
      toast({
        title: `${successCount} document${successCount > 1 ? "s" : ""} uploaded`,
        description: successCount === pending.length ? "All files uploaded successfully." : `${pending.length - successCount} failed.`,
      });
    }

    // Clear completed items after a short delay
    setTimeout(() => {
      setQueue((prev) => prev.filter((q) => q.status !== "done"));
    }, 1500);
  };

  const pendingCount = queue.filter((q) => q.status === "pending" && q.docType).length;
  const allTypesUsed = availableDocTypes.length === 0 && queue.length === 0;

  if (allTypesUsed) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
        <CheckCircle2 size={16} className="text-risk-green" />
        All document types have been uploaded.
      </div>
    );
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-5 transition-all duration-300 ${
        isDragging
          ? "border-accent bg-accent/10 scale-[1.01]"
          : "border-border hover:border-muted-foreground/40"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-accent/15 backdrop-blur-[2px]"
          >
            <Upload size={36} className="text-accent animate-bounce" />
            <span className="text-sm font-medium text-accent">Drop files here</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state / drop target */}
      {queue.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
            <Upload size={20} className="text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Drag & drop documents here</p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse · PDF, DOC, DOCX, TXT, PNG, JPG, XLS, XLSX · Max 100MB
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={14} className="mr-2" />
            Choose files
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              <Upload size={16} className="text-accent" />
              {queue.length} file{queue.length > 1 ? "s" : ""} queued
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || availableDocTypes.length === 0}
            >
              <Plus size={14} className="mr-1" />
              Add more
            </Button>
          </div>

          {/* File queue */}
          <div className="space-y-2">
            <AnimatePresence>
              {queue.map((item) => {
                const TypeIcon = DOC_TYPES.find((d) => d.value === item.docType)?.icon;
                const assignableTypes = DOC_TYPES.filter(
                  (dt) =>
                    dt.value === item.docType ||
                    !existingDocTypes.includes(dt.value)
                );

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {/* File info */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText size={14} className="text-accent shrink-0" />
                        <span className="text-sm truncate">{item.file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({(item.file.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>

                      {/* Doc type selector */}
                      {item.status === "pending" && (
                        <Select
                          value={item.docType}
                          onValueChange={(val) => {
                            setQueue((prev) =>
                              prev.map((q) => {
                                if (q.id === item.id) return { ...q, docType: val };
                                if (q.docType === val && q.status === "pending") return { ...q, docType: "" };
                                return q;
                              })
                            );
                          }}
                        >
                          <SelectTrigger className="w-[200px] h-8 text-xs">
                            <div className="flex items-center gap-2">
                              {TypeIcon && <TypeIcon size={12} className="text-accent shrink-0" />}
                              <SelectValue placeholder="Select type" />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {assignableTypes.map((dt) => (
                              <SelectItem key={dt.value} value={dt.value}>
                                <div className="flex items-center gap-2">
                                  <dt.icon size={12} className="text-muted-foreground" />
                                  {dt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Status indicators */}
                      {item.status === "done" && (
                        <CheckCircle2 size={16} className="text-risk-green shrink-0" />
                      )}
                      {item.status === "error" && (
                        <span className="text-xs text-destructive shrink-0">Failed</span>
                      )}

                      {/* Remove button */}
                      {(item.status === "pending" || item.status === "error") && (
                        <button
                          onClick={() => removeFromQueue(item.id)}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Progress bar & retry info */}
                    {item.status === "uploading" && (
                      <div className="space-y-1">
                        <Progress value={item.progress} className="h-1.5" />
                        {retryInfo && (
                          <p className="text-xs text-risk-amber animate-pulse">{retryInfo}</p>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Bulk upload warning */}
          {queue.filter(q => q.status === "pending").length > 1 && (
            <Alert className="border-risk-amber/30 bg-risk-amber/5">
              <AlertTriangle size={14} className="text-risk-amber" />
              <AlertDescription className="text-xs text-muted-foreground ml-2">
                <strong className="text-foreground">Bulk upload notice:</strong> Uploading multiple documents at once may affect AI review accuracy. For best results, upload one document per type and verify each is correctly categorised.
              </AlertDescription>
            </Alert>
          )}

          {/* Upload all button */}
          <Button
            onClick={handleUploadAll}
            disabled={pendingCount === 0 || uploading}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {uploading ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Upload size={14} className="mr-2" />
            )}
            {uploading
              ? "Uploading…"
              : `Upload ${pendingCount} document${pendingCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

export default DocumentUpload;

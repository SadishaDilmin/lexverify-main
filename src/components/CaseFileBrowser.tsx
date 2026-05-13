import { useState, useCallback, useRef, memo } from "react";
import JSZip from "jszip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder, FileText, Upload, Trash2, Download, Loader2, ChevronRight,
  FolderOpen, Plus, ArrowLeft, AlertTriangle, GripVertical, Eye, Info, X,
  Sparkles, Check, Pencil, Search, ScanSearch, FolderInput, CheckSquare,
} from "lucide-react";
import DocumentViewerDialog, { canPreview } from "@/components/DocumentViewerDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  listCaseFolders, listFolderFiles, getFolderLabel, countAllFolderFiles,
  CASE_FOLDERS, ADDON_FOLDERS, DOC_TYPE_TO_FOLDER,
} from "@/lib/caseFolders";
import { motion, AnimatePresence } from "framer-motion";
import DocumentUpload from "@/components/DocumentUpload";
import { usePostUploadClassification } from "@/hooks/usePostUploadClassification";
import ClassificationSuggestionBanner from "@/components/ClassificationSuggestionBanner";
import { useExistingFileClassification } from "@/hooks/useExistingFileClassification";
import ReclassifyFilesDialog from "@/components/ReclassifyFilesDialog";

interface CaseFileBrowserProps {
  caseId: string;
  enabledAddOns?: string[];
  /** Existing doc types from the documents table (for search upload integration) */
  existingDocTypes?: string[];
  /** If set, shows a "Sync from Hoowla" button */
  hoowlaMatterId?: string | null;
}

interface StorageFile {
  name: string;
  id: string | null;
  size: number;
  createdAt: string;
}

const CaseFileBrowser = ({ caseId, enabledAddOns = [], existingDocTypes = [], hoowlaMatterId }: CaseFileBrowserProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState({ current: 0, total: 0 });
  const [viewerFile, setViewerFile] = useState<{ name: string; path: string } | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameApproval, setRenameApproval] = useState<{
    originalName: string;
    suggestedName: string;
    ext: string;
  } | null>(null);
  const [editedName, setEditedName] = useState("");
  const [applyingRename, setApplyingRename] = useState(false);
  const [hoowlaSyncing, setHoowlaSyncing] = useState(false);
  // Multi-select & move state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingFiles, setMovingFiles] = useState(false);
  const hoowlaSyncNoticeKey = `hoowla-sync-notice-${caseId}`;
  const [hoowlaSyncNotice, setHoowlaSyncNotice] = useState<string | null>(() => {
    try { return sessionStorage.getItem(hoowlaSyncNoticeKey); } catch { return null; }
  });

  // Post-upload smart classification
  const {
    suggestions: classificationSuggestions,
    classifying: isClassifying,
    classifyUploadedFile,
    acceptSuggestion,
    dismissSuggestion,
  } = usePostUploadClassification(caseId);

  // Existing-file reclassification
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const {
    suggestions: reclassSuggestions,
    progress: reclassProgress,
    scanExistingFiles,
    moveSelected: moveReclassSelected,
    dismissSuggestion: dismissReclassSuggestion,
    dismissAll: dismissAllReclass,
    toggleSelection: toggleReclassSelection,
    toggleSelectAll: toggleReclassSelectAll,
    reset: resetReclass,
  } = useExistingFileClassification(caseId);

  const updateHoowlaSyncNotice = useCallback((value: string | null) => {
    setHoowlaSyncNotice(value);
    try {
      if (value) sessionStorage.setItem(hoowlaSyncNoticeKey, value);
      else sessionStorage.removeItem(hoowlaSyncNoticeKey);
    } catch {}
  }, [hoowlaSyncNoticeKey]);

  const handleHoowlaSync = useCallback(async () => {
    if (!hoowlaMatterId || hoowlaSyncing) return;
    setHoowlaSyncing(true);
    updateHoowlaSyncNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-hoowla-docs", {
        body: { matter_id: hoowlaMatterId, case_id: caseId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Build detailed notice for skipped/failed files
      const problemDetails: string[] = [];
      if (data?.skipped_files?.length) {
        problemDetails.push(
          ...data.skipped_files.map((f: { name: string; reason: string }) => `⚠ ${f.name}: ${f.reason}`)
        );
      }
      if (data?.errors?.length) {
        problemDetails.push(
          ...data.errors.map((e: string) => `✗ ${e}`)
        );
      }

      if (data?.message && (data?.synced ?? 0) === 0) {
        updateHoowlaSyncNotice(data.message + (problemDetails.length ? "\n\n" + problemDetails.join("\n") : ""));
        toast({
          title: "Hoowla documents",
          description: data.message,
        });
      } else if ((data?.synced ?? 0) === 0 && (data?.failed ?? 0) === 0 && (data?.skipped ?? 0) > 0) {
        updateHoowlaSyncNotice(problemDetails.length ? problemDetails.join("\n") : null);
        toast({
          title: "Hoowla up to date",
          description: `${data.skipped} documents are already imported`,
        });
      } else {
        const failedCount = data?.failed ?? 0;
        const skippedFileCount = data?.skipped_files?.length ?? 0;
        updateHoowlaSyncNotice(problemDetails.length ? problemDetails.join("\n") : null);
        toast({
          title: "Hoowla sync complete",
          description: `${data.synced ?? 0} synced, ${data.skipped ?? 0} unchanged, ${failedCount} failed` +
            (skippedFileCount > 0 ? ` (${skippedFileCount} file${skippedFileCount > 1 ? "s" : ""} could not be imported)` : ""),
          variant: failedCount > 0 || skippedFileCount > 0 ? "destructive" : "default",
        });
      }
      // Notify about Hoowla data conflicts
      if (data?.conflicts?.length > 0) {
        toast({
          title: "Hoowla data conflicts",
          description: `${data.conflicts.length} field${data.conflicts.length > 1 ? "s differ" : " differs"} between Hoowla and this case. Review the banner at the top of the workspace.`,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["case-folders", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
      // Refresh case data so Hoowla conflict banner updates
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case_parties", caseId] });

      // Also sync notes & alerts from Hoowla
      supabase.functions
        .invoke("sync-hoowla-notes", {
          body: { matter_id: hoowlaMatterId, case_id: caseId },
        })
        .then(({ data: notesData }) => {
          if (notesData?.synced > 0) {
            toast({
              title: "Hoowla notes synced",
              description: `${notesData.synced} note(s)/alert(s) imported.`,
            });
            queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId] });
            queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
          }
        })
        .catch((err) => console.warn("Hoowla notes sync failed:", err));
    } catch (e: any) {
      toast({ title: "Hoowla sync failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setHoowlaSyncing(false);
    }
  }, [hoowlaMatterId, caseId, hoowlaSyncing, toast, queryClient, updateHoowlaSyncNotice]);

  // Fetch folders
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["case-folders", caseId],
    queryFn: () => listCaseFolders(caseId),
    enabled: !!caseId,
  });

  // Fetch files in active folder
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["case-folder-files", caseId, activeFolder],
    queryFn: () => listFolderFiles(caseId, activeFolder!),
    enabled: !!caseId && !!activeFolder,
  });


  // Fetch file counts per folder
  const { data: folderCounts = {} } = useQuery({
    queryKey: ["case-folder-counts", caseId, folders],
    queryFn: () => countAllFolderFiles(caseId, folders),
    enabled: !!caseId && folders.length > 0,
  });

  // Fetch ALL files across all folders for cross-folder search
  const { data: allFolderFiles = [] } = useQuery({
    queryKey: ["case-all-files", caseId, folders],
    queryFn: async () => {
      const results: Array<{ name: string; folder: string }> = [];
      const fetches = await Promise.all(
        folders.map(async (folder) => {
          const files = await listFolderFiles(caseId, folder);
          return files.map((f) => ({ name: f.name, folder }));
        }),
      );
      for (const group of fetches) results.push(...group);
      return results;
    },
    enabled: !!caseId && folders.length > 0,
    staleTime: 30_000,
  });

  // Build the expected folder list from config
  const allExpectedFolders = [
    ...CASE_FOLDERS.map((f) => f.key),
    ...enabledAddOns.filter((a) => ADDON_FOLDERS[a]).map((a) => ADDON_FOLDERS[a].key),
  ];

  // Doc-type keys that are sub-types routed into "searches" – hide as standalone folders
  const searchSubTypes = new Set(
    Object.entries(DOC_TYPE_TO_FOLDER)
      .filter(([, folder]) => folder === "searches")
      .map(([docType]) => docType),
  );

  // Merge: show configured folders + any extra ones found in storage (except search sub-types)
  const displayFolders = [
    ...allExpectedFolders,
    ...folders.filter((f) => !allExpectedFolders.includes(f) && !searchSubTypes.has(f)),
  ];

  // Detect non-descriptive filenames (e.g. IMG_1234.jpeg, DSC_001.png, Screenshot_...)
  const isNonDescriptive = useCallback((name: string) => {
    return /^(IMG|DSC|DCIM|Screenshot|Screen Shot|Photo|image|scan|doc|file|document|unnamed|untitled)[_\s\-]?\d*/i.test(name);
  }, []);

  const handleAIRename = useCallback(async (fileName: string) => {
    if (!activeFolder || renamingFile) return;
    setRenamingFile(fileName);
    try {
      const { data, error } = await supabase.functions.invoke("rename-document", {
        body: { case_id: caseId, folder: activeFolder, file_name: fileName, mode: "suggest" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.suggestion) {
        const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
        setRenameApproval({
          originalName: fileName,
          suggestedName: data.suggested_name,
          ext,
        });
        setEditedName(data.suggested_name);
      } else if (data?.renamed === false) {
        toast({
          title: "No rename needed",
          description: data?.message || "File already has a descriptive name",
        });
      }
    } catch (e: any) {
      toast({ title: "AI rename failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setRenamingFile(null);
    }
  }, [activeFolder, caseId, renamingFile, toast]);

  const handleApplyRename = useCallback(async () => {
    if (!renameApproval || !activeFolder || applyingRename) return;
    setApplyingRename(true);
    try {
      const { data, error } = await supabase.functions.invoke("rename-document", {
        body: {
          case_id: caseId,
          folder: activeFolder,
          file_name: renameApproval.originalName,
          mode: "apply",
          approved_name: editedName,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.renamed) {
        toast({
          title: "File renamed",
          description: `"${renameApproval.originalName}" → "${data.new_name}"`,
        });
        queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId, activeFolder] });
        queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
      }
    } catch (e: any) {
      toast({ title: "Rename failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setApplyingRename(false);
      setRenameApproval(null);
    }
  }, [renameApproval, activeFolder, caseId, editedName, applyingRename, toast, queryClient]);

  const uploadFile = useCallback(async (file: File, folder: string) => {
    if (!user) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: `${file.name} exceeds 20MB limit.`, variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const filePath = `${caseId}/${folder}/${file.name}`;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("POST", `${supabaseUrl}/storage/v1/object/case-documents/${filePath}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.send(file);
      });

      toast({ title: "File uploaded", description: `${file.name} added to ${getFolderLabel(folder)}` });
      queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId, folder] });
      queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });

      // Post-upload smart classification (fire-and-forget, never blocks)
      if (user?.id) {
        classifyUploadedFile(file, folder, user.id).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });

      // Auto-suggest rename for non-descriptive files (shows approval dialog)
      if (isNonDescriptive(file.name)) {
        const triggerRename = async () => {
          setRenamingFile(file.name);
          try {
            const { data, error } = await supabase.functions.invoke("rename-document", {
              body: { case_id: caseId, folder, file_name: file.name, mode: "suggest" },
            });
            if (error) {
              console.error("[auto-rename] Edge function error:", error);
              toast({ title: "AI rename unavailable", description: error.message || "Could not generate a suggestion", variant: "destructive" });
              return;
            }
            if (data?.error) {
              console.error("[auto-rename] Function returned error:", data.error);
              toast({ title: "AI rename unavailable", description: data.error, variant: "destructive" });
              return;
            }
            if (data?.suggestion) {
              const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : "";
              setRenameApproval({ originalName: file.name, suggestedName: data.suggested_name, ext });
              setEditedName(data.suggested_name);
            } else if (data?.renamed === false) {
              toast({ title: "No rename needed", description: data?.message || "File already has a descriptive name" });
            }
          } catch (err: any) {
            console.error("[auto-rename] Unexpected error:", err);
            toast({ title: "AI rename failed", description: err.message || "Unexpected error", variant: "destructive" });
          } finally {
            setRenamingFile(null);
          }
        };
        // Small delay to let the upload toast show first
        setTimeout(triggerRename, 600);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [caseId, user, toast, queryClient, isNonDescriptive, classifyUploadedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeFolder || !e.target.files) return;
    Array.from(e.target.files).forEach((f) => uploadFile(f, activeFolder));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!activeFolder || !e.dataTransfer.files.length) return;
    Array.from(e.dataTransfer.files).forEach((f) => uploadFile(f, activeFolder));
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!activeFolder) return;
    const filePath = `${caseId}/${activeFolder}/${fileName}`;
    const { error } = await supabase.storage.from("case-documents").remove([filePath]);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "File deleted", description: fileName });
      queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId, activeFolder] });
      queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
    }
  };

  const handleDownloadFile = async (fileName: string) => {
    if (!activeFolder) return;
    const filePath = `${caseId}/${activeFolder}/${fileName}`;
    const { data, error } = await supabase.storage.from("case-documents").download(filePath);
    if (error || !data) {
      toast({ title: "Download failed", description: error?.message || "Unknown error", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = useCallback(async () => {
    if (!activeFolder || downloadingAll || files.length === 0) return;
    setDownloadingAll(true);
    setDownloadAllProgress({ current: 0, total: files.length });

    const zip = new JSZip();
    const failed: string[] = [];
    let downloaded = 0;

    const BATCH = 5;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const filePath = `${caseId}/${activeFolder}/${file.name}`;
          const { data, error } = await supabase.storage.from("case-documents").download(filePath);
          if (error || !data) throw new Error(error?.message || "Download failed");
          zip.file(file.name, data);
        }),
      );
      for (let j = 0; j < results.length; j++) {
        downloaded++;
        setDownloadAllProgress({ current: downloaded, total: files.length });
        if (results[j].status === "rejected") {
          failed.push(batch[j].name);
        }
      }
    }

    if (Object.keys(zip.files).length === 0) {
      toast({ title: "Download failed", description: "No files could be downloaded.", variant: "destructive" });
      setDownloadingAll(false);
      return;
    }

    try {
      const blob = await zip.generateAsync({ type: "blob" });
      const folderLabel = getFolderLabel(activeFolder).replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-");
      const zipName = `${caseId.slice(0, 8)}-${folderLabel}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);

      if (failed.length > 0) {
        toast({
          title: `Downloaded ${files.length - failed.length} of ${files.length} files`,
          description: `Skipped: ${failed.join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Download complete", description: `${files.length} file${files.length !== 1 ? "s" : ""} downloaded as ZIP` });
      }
    } catch (e: any) {
      toast({ title: "ZIP creation failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setDownloadingAll(false);
    }
  }, [activeFolder, downloadingAll, files, caseId, toast]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Multi-select helpers ──
  const toggleFileSelect = useCallback((fileName: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const visibleFiles = files.filter((f) => !searchQuery.trim() || f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    setSelectedFiles((prev) => {
      if (prev.size === visibleFiles.length && visibleFiles.every((f) => prev.has(f.name))) {
        return new Set();
      }
      return new Set(visibleFiles.map((f) => f.name));
    });
  }, [files, searchQuery]);

  const handleMoveFiles = useCallback(async (destFolder: string) => {
    if (!activeFolder || selectedFiles.size === 0 || movingFiles) return;
    setMovingFiles(true);
    let moved = 0;
    let failed = 0;
    const filesToMove = Array.from(selectedFiles);

    const BATCH = 3;
    for (let i = 0; i < filesToMove.length; i += BATCH) {
      const batch = filesToMove.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (fileName) => {
          const srcPath = `${caseId}/${activeFolder}/${fileName}`;
          const destPath = `${caseId}/${destFolder}/${fileName}`;
          const { data: blob, error: dlErr } = await supabase.storage.from("case-documents").download(srcPath);
          if (dlErr || !blob) throw dlErr || new Error("Download failed");
          const { error: upErr } = await supabase.storage.from("case-documents").upload(destPath, blob, { upsert: true });
          if (upErr) throw upErr;
          const { error: delErr } = await supabase.storage.from("case-documents").remove([srcPath]);
          if (delErr) console.warn(`[moveFile] Delete of source failed: ${delErr.message}`);
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") moved++;
        else { failed++; console.warn("[moveFiles] Failed:", r.reason); }
      }
    }

    setMovingFiles(false);
    setMoveDialogOpen(false);
    setSelectedFiles(new Set());

    if (failed > 0) {
      toast({
        title: `Moved ${moved} of ${moved + failed} files`,
        description: `${failed} file(s) failed to move.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Files moved",
        description: `${moved} file${moved !== 1 ? "s" : ""} moved to ${getFolderLabel(destFolder)}`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-all-files", caseId] });
  }, [activeFolder, selectedFiles, movingFiles, caseId, toast, queryClient]);

  // Clear selection when changing folders
  const handleSetActiveFolder = useCallback((folder: string | null) => {
    setSelectedFiles(new Set());
    setSearchQuery("");
    setActiveFolder(folder);
  }, []);

  // ── Folder list view ──
  if (!activeFolder) {
    return (
      <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Folder size={18} className="text-accent" />
              Case Files
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { resetReclass(); setReclassifyOpen(true); }}
                className="gap-1.5 text-xs"
              >
                <ScanSearch size={14} />
                Review Files
              </Button>
              {hoowlaMatterId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleHoowlaSync}
                  disabled={hoowlaSyncing}
                  className="gap-1.5 text-xs"
                >
                  {hoowlaSyncing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {hoowlaSyncing ? "Syncing…" : "Sync from Hoowla"}
                </Button>
              )}
            </div>
          </div>
          {hoowlaSyncNotice && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              <Info size={14} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1">
                <span className="font-medium">Hoowla sync notice — </span>
                {hoowlaSyncNotice.split("\n").map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
                {!hoowlaSyncNotice.includes("⚠") && !hoowlaSyncNotice.includes("✗") && (
                  <> You can upload documents manually using the folders below.</>
                )}
              </div>
              <button
                onClick={() => updateHoowlaSyncNotice(null)}
                className="shrink-0 rounded p-0.5 hover:bg-amber-200/50 dark:hover:bg-amber-800/30 transition-colors"
                aria-label="Dismiss notice"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Search bar */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search folders & files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          {foldersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {displayFolders.filter((folder) => {
                  if (!searchQuery.trim()) return true;
                  const label = getFolderLabel(folder);
                  const desc = [...CASE_FOLDERS, ...Object.values(ADDON_FOLDERS)]
                    .find((f) => f.key === folder)?.description || "";
                  const q = searchQuery.toLowerCase();
                  return label.toLowerCase().includes(q) || folder.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
                }).map((folder) => {
                  const label = getFolderLabel(folder);
                  const desc = [...CASE_FOLDERS, ...Object.values(ADDON_FOLDERS)]
                    .find((f) => f.key === folder)?.description;
                  const exists = folders.includes(folder);

                  return (
                    <button
                      key={folder}
                      onClick={() => handleSetActiveFolder(folder)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                        <Folder size={20} className="text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{label}</span>
                          {(folderCounts[folder] ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 min-w-[20px] justify-center font-semibold">
                              {folderCounts[folder]}
                            </Badge>
                          )}
                        </div>
                        {desc && <div className="text-[11px] text-muted-foreground truncate">{desc}</div>}
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0 group-hover:text-accent transition-colors" />
                    </button>
                  );
                })}
              </div>

              {/* Cross-folder file search results */}
              {searchQuery.trim().length >= 2 && (() => {
                const q = searchQuery.toLowerCase();
                const matchingFiles = allFolderFiles.filter((f) =>
                  f.name.toLowerCase().includes(q)
                );
                if (matchingFiles.length === 0) return (
                  <p className="text-xs text-muted-foreground mt-3 text-center">No files matching "{searchQuery}"</p>
                );
                return (
                  <div className="mt-3 space-y-1">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1.5">
                      {matchingFiles.length} file{matchingFiles.length !== 1 ? "s" : ""} found
                    </p>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
                      {matchingFiles.map((file, i) => (
                        <button
                          key={`${file.folder}-${file.name}-${i}`}
                          onClick={() => handleSetActiveFolder(file.folder)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-left text-xs"
                        >
                          <FileText size={14} className="text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-foreground font-medium">{file.name}</span>
                          <Badge variant="outline" className="text-[9px] shrink-0">{getFolderLabel(file.folder)}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reclassify existing files dialog */}
      <ReclassifyFilesDialog
        open={reclassifyOpen}
        onOpenChange={setReclassifyOpen}
        suggestions={reclassSuggestions}
        progress={reclassProgress}
        onScan={(includeAll) => {
          if (user?.id) scanExistingFiles(user.id, includeAll);
        }}
        onMoveSelected={moveReclassSelected}
        onDismiss={dismissReclassSuggestion}
        onDismissAll={dismissAllReclass}
        onToggle={toggleReclassSelection}
        onToggleAll={toggleReclassSelectAll}
        onMoveComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId] });
          queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
          queryClient.invalidateQueries({ queryKey: ["case-all-files", caseId] });
        }}
      />
    </>
    );
  }

  // ── File list view (inside a folder) ──
  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <button
              onClick={() => handleSetActiveFolder(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <FolderOpen size={18} className="text-accent" />
            {getFolderLabel(activeFolder)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="gap-1.5 text-xs"
                >
                  <CheckSquare size={14} />
                  {selectedFiles.size > 0 && files.length > 0 && selectedFiles.size === files.filter((f) => !searchQuery.trim() || f.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                    ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAll}
                  disabled={downloadingAll || filesLoading}
                  className="gap-1.5"
                >
                  {downloadingAll ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {downloadAllProgress.current}/{downloadAllProgress.total}
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Download All
                    </>
                  )}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Plus size={14} className="mr-1" />
              Upload
            </Button>
          </div>
        </div>
        {/* Selection toolbar */}
        {selectedFiles.size > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
            <span className="text-sm font-medium text-foreground">
              {selectedFiles.size} file{selectedFiles.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedFiles(new Set())}
              className="gap-1.5 text-xs"
            >
              <X size={14} />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setMoveDialogOpen(true)}
              className="gap-1.5 text-xs"
            >
              <FolderInput size={14} />
              Move to Folder
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Search bar */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search files…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div
          className={`relative space-y-2 min-h-[120px] rounded-lg transition-all ${
            isDragging ? "ring-2 ring-accent bg-accent/5" : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-accent/10 backdrop-blur-[2px]"
              >
                <Upload size={28} className="text-accent animate-bounce" />
                <span className="text-sm font-medium text-accent">Drop files here</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload progress */}
          {uploading && (
            <div className="p-3 bg-accent/5 rounded-lg border border-accent/20 space-y-1">
              <div className="flex items-center gap-2 text-sm text-accent">
                <Loader2 size={14} className="animate-spin" />
                Uploading…
              </div>
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
          )}

          {/* Smart classification suggestions */}
          <ClassificationSuggestionBanner
            suggestions={classificationSuggestions.filter((s) => s.originalFolder === activeFolder)}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
            onMoveComplete={(fileName, newFolder) => {
              toast({
                title: "File moved",
                description: `"${fileName}" moved to ${getFolderLabel(newFolder)}`,
              });
              queryClient.invalidateQueries({ queryKey: ["case-folder-files", caseId] });
              queryClient.invalidateQueries({ queryKey: ["case-folder-counts", caseId] });
            }}
          />

          {/* Classifying indicator */}
          {isClassifying && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
              <Loader2 size={12} className="animate-spin" />
              Analysing document…
            </div>
          )}

          {filesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                <Upload size={20} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No files yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag & drop files or click Upload
                </p>
              </div>
            </div>
          ) : (
            <AnimatePresence>
              {files.filter((file) => !searchQuery.trim() || file.name.toLowerCase().includes(searchQuery.toLowerCase())).map((file) => (
                <motion.div
                  key={file.name}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors group ${selectedFiles.has(file.name) ? "bg-accent/10 ring-1 ring-accent/30" : "bg-muted/30 hover:bg-muted/50"}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={selectedFiles.has(file.name)}
                      onCheckedChange={() => toggleFileSelect(file.name)}
                      aria-label={`Select ${file.name}`}
                      className="shrink-0"
                    />
                    <FileText size={16} className="text-accent shrink-0" />
                    <div className="min-w-0">
                      <button
                        className={`text-sm font-medium truncate text-left ${canPreview(file.name) ? "text-foreground hover:text-accent hover:underline cursor-pointer" : "text-foreground cursor-default"}`}
                        onClick={() => {
                          if (canPreview(file.name) && activeFolder) {
                            setViewerFile({ name: file.name, path: `${caseId}/${activeFolder}/${file.name}` });
                          }
                        }}
                        title={canPreview(file.name) ? "Click to preview" : file.name}
                      >
                        {file.name}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        {formatSize(file.size)}
                        {file.createdAt && ` · ${new Date(file.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {/* Case files are processed directly by Olimey AI — no knowledge_base indexing needed */}
                    <Badge variant="outline" className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                      Ready for Review
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Manual Rename button */}
                    <button
                      onClick={() => {
                        const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : "";
                        const nameWithoutExt = ext ? file.name.slice(0, -ext.length) : file.name;
                        setRenameApproval({ originalName: file.name, suggestedName: nameWithoutExt, ext });
                        setEditedName(nameWithoutExt);
                      }}
                      className="p-1.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                      title="Rename file"
                    >
                      <Pencil size={14} />
                    </button>
                    {/* Move to folder button */}
                    <button
                      onClick={() => {
                        setSelectedFiles(new Set([file.name]));
                        setMoveDialogOpen(true);
                      }}
                      className="p-1.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                      title="Move to folder"
                    >
                      <FolderInput size={14} />
                    </button>
                    {/* AI Rename button */}
                    <button
                      onClick={() => handleAIRename(file.name)}
                      disabled={renamingFile === file.name}
                      className="p-1.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50"
                      title="Rename with AI"
                    >
                      {renamingFile === file.name ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                    </button>
                    {canPreview(file.name) && (
                      <button
                        onClick={() => {
                          if (activeFolder) {
                            setViewerFile({ name: file.name, path: `${caseId}/${activeFolder}/${file.name}` });
                          }
                        }}
                        className="p-1.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadFile(file.name)}
                      className="p-1.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete file?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete <strong>{file.name}</strong> from {getFolderLabel(activeFolder)}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDeleteFile(file.name)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.tiff,.heic,.xlsx,.xls,.csv"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Categorised search document upload — shown only inside "searches" folder */}
        {activeFolder === "searches" && (
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3">Upload Categorised Search Documents</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Use this to upload and categorise search documents for AI review (Local Authority, Drainage &amp; Water, Environmental, EPC).
            </p>
            <DocumentUpload
              caseId={caseId}
              existingDocTypes={existingDocTypes}
              enabledAddOns={enabledAddOns}
            />
          </div>
        )}
      </CardContent>
    </Card>

    {/* Document Viewer Dialog */}
    <DocumentViewerDialog
      open={!!viewerFile}
      onOpenChange={(open) => { if (!open) setViewerFile(null); }}
      bucket="case-documents"
      filePath={viewerFile?.path || ""}
      fileName={viewerFile?.name || ""}
    />

    {/* AI Rename Approval Dialog */}
    <Dialog open={!!renameApproval} onOpenChange={(open) => { if (!open) setRenameApproval(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            Approve AI Rename
          </DialogTitle>
          <DialogDescription>
            Review the suggested filename below. You can edit it before applying.
          </DialogDescription>
        </DialogHeader>
        {renameApproval && (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Original filename</p>
              <p className="text-sm font-mono bg-muted/50 rounded px-2.5 py-1.5 truncate">
                {renameApproval.originalName}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Suggested filename</p>
              <div className="flex items-center gap-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="font-mono text-sm"
                />
                <span className="text-sm text-muted-foreground shrink-0">{renameApproval.ext}</span>
              </div>
              {editedName !== renameApproval.suggestedName && (
                <button
                  onClick={() => setEditedName(renameApproval.suggestedName)}
                  className="text-[11px] text-accent hover:underline"
                >
                  Reset to AI suggestion
                </button>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setRenameApproval(null)} disabled={applyingRename}>
            Skip
          </Button>
          <Button
            onClick={handleApplyRename}
            disabled={applyingRename || !editedName || editedName.length < 3}
            className="gap-1.5"
          >
            {applyingRename ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Apply Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Move Files Destination Dialog */}
    <Dialog open={moveDialogOpen} onOpenChange={(open) => { if (!open && !movingFiles) setMoveDialogOpen(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput size={18} className="text-accent" />
            Move {selectedFiles.size} file{selectedFiles.size !== 1 ? "s" : ""} to…
          </DialogTitle>
          <DialogDescription>
            Choose the destination folder. Files will be moved from <strong>{activeFolder ? getFolderLabel(activeFolder) : ""}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-[300px] overflow-y-auto py-2">
          {displayFolders.filter((f) => f !== activeFolder).map((folder) => {
            const label = getFolderLabel(folder);
            return (
              <button
                key={folder}
                onClick={() => handleMoveFiles(folder)}
                disabled={movingFiles}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-left disabled:opacity-50"
              >
                <Folder size={16} className="text-accent shrink-0" />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </button>
            );
          })}
        </div>
        {movingFiles && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" />
            Moving files…
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setMoveDialogOpen(false)} disabled={movingFiles}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};

export default memo(CaseFileBrowser);

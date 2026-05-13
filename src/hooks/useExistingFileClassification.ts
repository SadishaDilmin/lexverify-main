/**
 * Hook for scanning existing case files and suggesting reclassification.
 * User-invoked only — never runs automatically.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listCaseFolders, listFolderFiles, downloadFolderFiles } from "@/lib/caseFolders";
import { CATEGORY_TO_FOLDER, type ClassificationConfidence } from "@/lib/classificationMapping";

export interface ExistingFileSuggestion {
  logId: string | null;
  fileName: string;
  filePath: string;
  currentFolder: string;
  suggestedFolder: string;
  category: string;
  confidence: ClassificationConfidence;
  description: string;
  selected: boolean;
}

export interface ScanProgress {
  phase: "idle" | "listing" | "downloading" | "classifying" | "done" | "error";
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  errorMessage?: string;
}

/** Files to skip during scanning */
const SKIP_EXTENSIONS = new Set([".keep"]);
const SKIP_FOLDERS = new Set(["reports", "hoowla-notes"]);

export function useExistingFileClassification(caseId: string) {
  const [suggestions, setSuggestions] = useState<ExistingFileSuggestion[]>([]);
  const [progress, setProgress] = useState<ScanProgress>({ phase: "idle", totalFiles: 0, processedFiles: 0 });
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(`classification-dismissed-${caseId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const saveDismissed = useCallback((keys: Set<string>) => {
    setDismissedKeys(keys);
    try {
      sessionStorage.setItem(`classification-dismissed-${caseId}`, JSON.stringify([...keys]));
    } catch {}
  }, [caseId]);

  /**
   * Scan all folders, classify files, produce suggestions.
   * @param includeAllFiles - if true, re-scans previously dismissed files too
   */
  const scanExistingFiles = useCallback(async (userId: string, includeAllFiles = false) => {
    setSuggestions([]);
    setProgress({ phase: "listing", totalFiles: 0, processedFiles: 0 });

    try {
      // 1. List all folders and files
      const folders = await listCaseFolders(caseId);
      const scanFolders = folders.filter((f) => !SKIP_FOLDERS.has(f));

      const allFiles: Array<{ name: string; folder: string }> = [];
      for (const folder of scanFolders) {
        const files = await listFolderFiles(caseId, folder);
        for (const f of files) {
          if (SKIP_EXTENSIONS.has(f.name) || f.name === ".keep") continue;
          const key = `${folder}/${f.name}`;
          if (!includeAllFiles && dismissedKeys.has(key)) continue;
          allFiles.push({ name: f.name, folder });
        }
      }

      if (allFiles.length === 0) {
        setProgress({ phase: "done", totalFiles: 0, processedFiles: 0 });
        return;
      }

      setProgress({ phase: "downloading", totalFiles: allFiles.length, processedFiles: 0 });

      // 2. Download and classify in batches per folder
      const results: ExistingFileSuggestion[] = [];
      const BATCH_SIZE = 5;

      // Group by folder for efficient downloading
      const byFolder = new Map<string, string[]>();
      for (const f of allFiles) {
        if (!byFolder.has(f.folder)) byFolder.set(f.folder, []);
        byFolder.get(f.folder)!.push(f.name);
      }

      let processed = 0;

      for (const [folder, fileNames] of byFolder) {
        // Download files from this folder
        const includePattern = new RegExp(
          `^(${fileNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`
        );

        let downloaded: Array<{ name: string; base64: string; mimeType: string }>;
        try {
          downloaded = await downloadFolderFiles(caseId, folder, undefined, includePattern);
        } catch (err) {
          console.warn(`[ExistingFileClassification] Failed to download from ${folder}:`, err);
          processed += fileNames.length;
          setProgress((p) => ({ ...p, processedFiles: processed }));
          continue;
        }

        // Classify in batches
        for (let i = 0; i < downloaded.length; i += BATCH_SIZE) {
          const batch = downloaded.slice(i, i + BATCH_SIZE);

          setProgress((p) => ({
            ...p,
            phase: "classifying",
            processedFiles: processed,
            currentFile: batch.map((b) => b.name).join(", "),
          }));

          try {
            const classifyPayload = batch.map((f) => ({
              id: crypto.randomUUID(),
              name: f.name,
              base64: f.base64,
              mimeType: f.mimeType,
            }));

            const { data, error } = await supabase.functions.invoke("classify-aml-docs", {
              body: { files: classifyPayload, existingFiles: [] },
            });

            if (error || !data?.classifications) {
              console.warn("[ExistingFileClassification] Classification failed for batch:", error);
              processed += batch.length;
              setProgress((p) => ({ ...p, processedFiles: processed }));
              // Log failures
              for (const f of batch) {
                await logClassificationEvent({
                  caseId, fileName: f.name, filePath: `${caseId}/${folder}/${f.name}`,
                  originalFolder: folder, suggestedFolder: null, category: null,
                  confidence: null, description: null, userAction: "classification_failed",
                  finalFolder: folder, wasAutoMoved: false,
                  errorMessage: error?.message || "Classification returned no data",
                  userId, scanType: "existing_file_review",
                });
              }
              continue;
            }

            for (const result of data.classifications) {
              const matchedFile = batch.find((b) => b.name === result.fileName);
              if (!matchedFile) continue;

              const suggestedFolder = CATEGORY_TO_FOLDER[result.category] || "";
              const confidence: ClassificationConfidence = result.confidence || "low";

              // Only suggest if the file should be in a different folder
              if (!suggestedFolder || suggestedFolder === folder || result.category === "Other / Unknown") {
                await logClassificationEvent({
                  caseId, fileName: matchedFile.name,
                  filePath: `${caseId}/${folder}/${matchedFile.name}`,
                  originalFolder: folder, suggestedFolder: suggestedFolder || folder,
                  category: result.category, confidence, description: result.description,
                  userAction: "no_move_needed", finalFolder: folder,
                  wasAutoMoved: false, errorMessage: null, userId,
                  scanType: "existing_file_review",
                });
                continue;
              }

              // Skip low-confidence results
              if (confidence === "low") {
                await logClassificationEvent({
                  caseId, fileName: matchedFile.name,
                  filePath: `${caseId}/${folder}/${matchedFile.name}`,
                  originalFolder: folder, suggestedFolder, category: result.category,
                  confidence, description: result.description,
                  userAction: "low_confidence_skipped", finalFolder: folder,
                  wasAutoMoved: false, errorMessage: null, userId,
                  scanType: "existing_file_review",
                });
                continue;
              }

              // Log as pending suggestion
              const logId = await logClassificationEvent({
                caseId, fileName: matchedFile.name,
                filePath: `${caseId}/${folder}/${matchedFile.name}`,
                originalFolder: folder, suggestedFolder, category: result.category,
                confidence, description: result.description,
                userAction: "pending", finalFolder: folder,
                wasAutoMoved: false, errorMessage: null, userId,
                scanType: "existing_file_review",
              });

              results.push({
                logId,
                fileName: matchedFile.name,
                filePath: `${caseId}/${folder}/${matchedFile.name}`,
                currentFolder: folder,
                suggestedFolder,
                category: result.category,
                confidence,
                description: result.description,
                selected: confidence === "high",
              });
            }
          } catch (err) {
            console.warn("[ExistingFileClassification] Batch classification error:", err);
          }

          processed += batch.length;
          setProgress((p) => ({ ...p, processedFiles: processed }));
        }
      }

      // Sort: high confidence first, then medium
      results.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.confidence] - order[b.confidence];
      });

      setSuggestions(results);
      setProgress({ phase: "done", totalFiles: allFiles.length, processedFiles: allFiles.length });
    } catch (err: any) {
      console.error("[ExistingFileClassification] Scan failed:", err);
      setProgress((p) => ({ ...p, phase: "error", errorMessage: err.message }));
    }
  }, [caseId, dismissedKeys]);

  /** Move a single file to its suggested folder */
  const moveFile = useCallback(async (suggestion: ExistingFileSuggestion) => {
    try {
      const destPath = `${caseId}/${suggestion.suggestedFolder}/${suggestion.fileName}`;

      const { data: blob, error: dlError } = await supabase.storage
        .from("case-documents")
        .download(suggestion.filePath);
      if (dlError || !blob) throw dlError || new Error("Download failed");

      const { error: upError } = await supabase.storage
        .from("case-documents")
        .upload(destPath, blob, { upsert: true });
      if (upError) throw upError;

      await supabase.storage.from("case-documents").remove([suggestion.filePath]);

      // Update log
      if (suggestion.logId) {
        await supabase
          .from("document_classification_log" as any)
          .update({
            user_action: "accepted",
            final_folder: suggestion.suggestedFolder,
            acted_at: new Date().toISOString(),
          } as any)
          .eq("id", suggestion.logId);
      }

      return true;
    } catch (err) {
      console.error("[ExistingFileClassification] Move failed:", err);
      return false;
    }
  }, [caseId]);

  /** Move all selected suggestions */
  const moveSelected = useCallback(async () => {
    const selected = suggestions.filter((s) => s.selected);
    const results: boolean[] = [];
    for (const s of selected) {
      results.push(await moveFile(s));
    }
    const moved = results.filter(Boolean).length;
    const remaining = suggestions.filter((s) => !s.selected || !results[suggestions.filter((x) => x.selected).indexOf(s)]);

    // Remove successfully moved from suggestions
    const movedNames = new Set(selected.filter((_, i) => results[i]).map((s) => `${s.currentFolder}/${s.fileName}`));
    setSuggestions((prev) => prev.filter((s) => !movedNames.has(`${s.currentFolder}/${s.fileName}`)));

    return moved;
  }, [suggestions, moveFile]);

  /** Dismiss a suggestion (remember for this session) */
  const dismissSuggestion = useCallback(async (suggestion: ExistingFileSuggestion) => {
    const key = `${suggestion.currentFolder}/${suggestion.fileName}`;
    const newDismissed = new Set(dismissedKeys);
    newDismissed.add(key);
    saveDismissed(newDismissed);

    if (suggestion.logId) {
      await supabase
        .from("document_classification_log" as any)
        .update({
          user_action: "dismissed",
          final_folder: suggestion.currentFolder,
          acted_at: new Date().toISOString(),
        } as any)
        .eq("id", suggestion.logId);
    }

    setSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }, [dismissedKeys, saveDismissed]);

  /** Dismiss all remaining suggestions */
  const dismissAll = useCallback(async () => {
    const newDismissed = new Set(dismissedKeys);
    for (const s of suggestions) {
      newDismissed.add(`${s.currentFolder}/${s.fileName}`);
      if (s.logId) {
        supabase
          .from("document_classification_log" as any)
          .update({ user_action: "dismissed", final_folder: s.currentFolder, acted_at: new Date().toISOString() } as any)
          .eq("id", s.logId)
          .then(() => {});
      }
    }
    saveDismissed(newDismissed);
    setSuggestions([]);
  }, [suggestions, dismissedKeys, saveDismissed]);

  /** Toggle selection of a suggestion */
  const toggleSelection = useCallback((index: number) => {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  }, []);

  /** Select/deselect all */
  const toggleSelectAll = useCallback((selected: boolean) => {
    setSuggestions((prev) => prev.map((s) => ({ ...s, selected })));
  }, []);

  const reset = useCallback(() => {
    setSuggestions([]);
    setProgress({ phase: "idle", totalFiles: 0, processedFiles: 0 });
  }, []);

  return {
    suggestions,
    progress,
    scanExistingFiles,
    moveFile,
    moveSelected,
    dismissSuggestion,
    dismissAll,
    toggleSelection,
    toggleSelectAll,
    reset,
  };
}

// ── Helper: insert audit log ──────────────────────────────────────────
async function logClassificationEvent(params: {
  caseId: string;
  fileName: string;
  filePath: string;
  originalFolder: string;
  suggestedFolder: string | null;
  category: string | null;
  confidence: string | null;
  description: string | null;
  userAction: string;
  finalFolder: string;
  wasAutoMoved: boolean;
  errorMessage: string | null;
  userId: string;
  scanType: string;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("document_classification_log" as any)
      .insert({
        case_id: params.caseId,
        file_name: params.fileName,
        file_path: params.filePath,
        original_folder: params.originalFolder,
        suggested_folder: params.suggestedFolder,
        classification_category: params.category,
        classification_confidence: params.confidence,
        classification_description: params.description,
        user_action: params.userAction,
        final_folder: params.finalFolder,
        was_auto_moved: params.wasAutoMoved,
        error_message: params.errorMessage,
        user_id: params.userId,
      } as any)
      .select("id")
      .single();
    if (error) {
      console.warn("[ClassificationLog] Insert failed:", error.message);
      return null;
    }
    return (data as any)?.id || null;
  } catch (e) {
    console.warn("[ClassificationLog] Insert error:", e);
    return null;
  }
}

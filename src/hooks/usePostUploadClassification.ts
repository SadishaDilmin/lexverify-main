/**
 * Post-upload AI classification hook for CaseFileBrowser.
 * After a file is uploaded, runs classification and surfaces a folder suggestion.
 * Classification failure never blocks or loses files.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fileToBase64 } from "@/lib/uploadUtils";
import { CATEGORY_TO_FOLDER, type ClassificationConfidence } from "@/lib/classificationMapping";

// ── Confidence thresholds (easy to tune later) ────────────────────────
const CONFIDENCE_THRESHOLDS = {
  /** Show strong suggestion */
  high: 0.8,
  /** Show mild suggestion */
  medium: 0.5,
  /** Below this, no suggestion */
  low: 0,
};

export interface ClassificationSuggestion {
  id: string; // log row id
  fileName: string;
  filePath: string;
  originalFolder: string;
  suggestedFolder: string;
  category: string;
  confidence: "high" | "medium" | "low";
  description: string;
}

export function usePostUploadClassification(caseId: string) {
  const [suggestions, setSuggestions] = useState<ClassificationSuggestion[]>([]);
  const [classifying, setClassifying] = useState(false);

  /**
   * Run classification on a freshly-uploaded file.
   * Fire-and-forget — never throws to the caller.
   */
  const classifyUploadedFile = useCallback(
    async (file: File, uploadedFolder: string, userId: string) => {
      const filePath = `${caseId}/${uploadedFolder}/${file.name}`;

      // Quick pre-check: determine mime type
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
        png: "image/png", tif: "image/tiff", tiff: "image/tiff",
        bmp: "image/bmp", webp: "image/webp", heic: "image/heic",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        csv: "text/csv", txt: "text/plain", eml: "message/rfc822",
        msg: "application/vnd.ms-outlook", rtf: "application/rtf", md: "text/markdown",
      };
      const mimeType = mimeMap[ext] || file.type || "application/octet-stream";

      setClassifying(true);
      try {
        // Convert file to base64
        const base64 = await fileToBase64(file);
        const fileId = crypto.randomUUID();

        // Call existing classify-aml-docs with a single file
        const { data, error } = await supabase.functions.invoke("classify-aml-docs", {
          body: {
            files: [{ id: fileId, name: file.name, base64, mimeType }],
            existingFiles: [],
          },
        });

        if (error || !data?.classifications?.length) {
          // Log the failure but don't bother the user
          await logClassification({
            caseId, fileName: file.name, filePath, originalFolder: uploadedFolder,
            suggestedFolder: null, category: null, confidence: null, description: null,
            userAction: "classification_failed", finalFolder: uploadedFolder,
            wasAutoMoved: false, errorMessage: error?.message || "No classification returned",
            userId,
          });
          return;
        }

        const result = data.classifications[0];
        const suggestedFolder = CATEGORY_TO_FOLDER[result.category] || "";
        const confidence: "high" | "medium" | "low" = result.confidence || "low";

        // If the file is already in the right folder, or no folder mapping, skip
        if (!suggestedFolder || suggestedFolder === uploadedFolder || result.category === "Other / Unknown") {
          await logClassification({
            caseId, fileName: file.name, filePath, originalFolder: uploadedFolder,
            suggestedFolder: suggestedFolder || uploadedFolder,
            category: result.category, confidence,
            description: result.description,
            userAction: "no_move_needed", finalFolder: uploadedFolder,
            wasAutoMoved: false, errorMessage: null, userId,
          });
          return;
        }

        // Only show suggestion for medium/high confidence
        if (confidence === "low") {
          await logClassification({
            caseId, fileName: file.name, filePath, originalFolder: uploadedFolder,
            suggestedFolder, category: result.category, confidence,
            description: result.description,
            userAction: "low_confidence_skipped", finalFolder: uploadedFolder,
            wasAutoMoved: false, errorMessage: null, userId,
          });
          return;
        }

        // Insert log row and get the id
        const logId = await logClassification({
          caseId, fileName: file.name, filePath, originalFolder: uploadedFolder,
          suggestedFolder, category: result.category, confidence,
          description: result.description,
          userAction: "pending", finalFolder: uploadedFolder,
          wasAutoMoved: false, errorMessage: null, userId,
        });

        if (logId) {
          setSuggestions((prev) => [
            ...prev,
            {
              id: logId,
              fileName: file.name,
              filePath,
              originalFolder: uploadedFolder,
              suggestedFolder,
              category: result.category,
              confidence,
              description: result.description,
            },
          ]);
        }
      } catch (err) {
        console.warn("[PostUploadClassification] Classification failed silently:", err);
      } finally {
        setClassifying(false);
      }
    },
    [caseId],
  );

  /** Accept suggestion: move file to suggested folder */
  const acceptSuggestion = useCallback(
    async (suggestion: ClassificationSuggestion) => {
      try {
        const sourcePath = suggestion.filePath;
        const destPath = `${caseId}/${suggestion.suggestedFolder}/${suggestion.fileName}`;

        // Download then re-upload (Supabase Storage has no move/rename across prefixes)
        const { data: blob, error: dlError } = await supabase.storage
          .from("case-documents")
          .download(sourcePath);
        if (dlError || !blob) throw dlError || new Error("Download failed");

        const { error: upError } = await supabase.storage
          .from("case-documents")
          .upload(destPath, blob, { upsert: true });
        if (upError) throw upError;

        // Delete from original location
        await supabase.storage.from("case-documents").remove([sourcePath]);

        // Update log
        await supabase
          .from("document_classification_log" as any)
          .update({
            user_action: "accepted",
            final_folder: suggestion.suggestedFolder,
            acted_at: new Date().toISOString(),
          } as any)
          .eq("id", suggestion.id);

        setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
        return { success: true, newFolder: suggestion.suggestedFolder };
      } catch (err: any) {
        console.error("[PostUploadClassification] Move failed:", err);
        return { success: false, error: err.message };
      }
    },
    [caseId],
  );

  /** Dismiss suggestion: keep file where it is */
  const dismissSuggestion = useCallback(
    async (suggestion: ClassificationSuggestion) => {
      await supabase
        .from("document_classification_log" as any)
        .update({
          user_action: "dismissed",
          final_folder: suggestion.originalFolder,
          acted_at: new Date().toISOString(),
        } as any)
        .eq("id", suggestion.id);

      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    },
    [],
  );

  return { suggestions, classifying, classifyUploadedFile, acceptSuggestion, dismissSuggestion };
}

// ── Helper: insert log row ────────────────────────────────────────────
async function logClassification(params: {
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

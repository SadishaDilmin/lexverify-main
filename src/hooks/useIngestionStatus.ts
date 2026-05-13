import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type IngestionRecord = {
  id: string;
  file_path: string;
  bucket: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "error";
  char_count: number;
  error_message: string | null;
  processed_at: string | null;
  file_type?: string;
  visual_summary?: string;
  transcription_verified?: boolean;
  judge_notes?: string;
  media_duration_seconds?: number;
};

export type IngestionStatusMap = Record<string, {
  status: string;
  char_count: number;
  error_message: string | null;
  file_type?: string;
  visual_summary?: string;
  transcription_verified?: boolean;
  judge_notes?: string;
}>;

/**
 * Fetch ingestion status for a list of file paths in a given bucket.
 * Now includes media-specific fields for video visual summaries and judge verification.
 */
export function useIngestionStatuses(bucket: string, filePaths: string[]) {
  return useQuery<IngestionStatusMap>({
    queryKey: ["ingestion-status", bucket, filePaths],
    queryFn: async () => {
      if (!filePaths.length) return {};
      const { data, error } = await (supabase as any)
        .from("knowledge_base_content")
        .select("file_path, status, char_count, error_message, processed_at, file_type, visual_summary, transcription_verified, judge_notes")
        .eq("bucket", bucket)
        .in("file_path", filePaths);

      if (error) throw error;

      const map: IngestionStatusMap = {};
      for (const row of data ?? []) {
        map[row.file_path] = {
          status: row.status,
          char_count: row.char_count,
          error_message: row.error_message,
          file_type: row.file_type,
          visual_summary: row.visual_summary,
          transcription_verified: row.transcription_verified,
          judge_notes: row.judge_notes,
        };
      }
      return map;
    },
    enabled: filePaths.length > 0,
    refetchInterval: 10_000,
  });
}

/**
 * Fetch aggregate ingestion stats for admin dashboard.
 * Enhanced with media file counts.
 */
export function useIngestionStats() {
  return useQuery({
    queryKey: ["ingestion-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("knowledge_base_content")
        .select("status, char_count, file_type, visual_summary, transcription_verified");

      if (error) throw error;

      const stats = {
        total: 0, completed: 0, processing: 0, pending: 0, error: 0, totalChars: 0,
        audioFiles: 0, videoFiles: 0, visualSummaries: 0, verifiedTranscripts: 0,
      };
      for (const row of data ?? []) {
        stats.total++;
        if (row.status === "completed") {
          stats.completed++;
          stats.totalChars += row.char_count ?? 0;
        } else if (row.status === "processing") stats.processing++;
        else if (row.status === "pending") stats.pending++;
        else if (row.status === "error") stats.error++;

        if (row.file_type === "audio") stats.audioFiles++;
        if (row.file_type === "video") stats.videoFiles++;
        if (row.visual_summary) stats.visualSummaries++;
        if (row.transcription_verified) stats.verifiedTranscripts++;
      }
      return stats;
    },
    refetchInterval: 15_000,
  });
}

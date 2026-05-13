import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Audit metadata for an AI report — surfaces report-level edit history plus
 * any audit_log rows that reference this report. Read-only; no writes.
 */
export interface ReportAuditEvent {
  id: string;
  event_type: string;
  user_name: string;
  user_email: string;
  user_position: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ReportAuditSummary {
  created_at: string | null;
  modified_at: string | null;
  modified_by: string | null;
  modified_by_name: string | null;
  modification_count: number;
  version: number;
  events: ReportAuditEvent[];
}

export function useReportAudit(aiReportId: string | undefined) {
  return useQuery({
    queryKey: ["report_audit", aiReportId],
    enabled: !!aiReportId,
    queryFn: async (): Promise<ReportAuditSummary> => {
      const { data: report, error: repErr } = await supabase
        .from("ai_reports")
        .select("created_at, modified_at, modified_by, modification_count, version, case_id")
        .eq("id", aiReportId!)
        .maybeSingle();
      if (repErr) throw repErr;

      // Resolve the modifier's display name from profiles, if available.
      let modifiedByName: string | null = null;
      if (report?.modified_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", report.modified_by)
          .maybeSingle();
        modifiedByName = (profile as any)?.full_name || (profile as any)?.email || null;
      }

      // Resolve case_reference for audit_log filtering.
      let caseReference: string | null = null;
      if (report?.case_id) {
        const { data: caseRow } = await supabase
          .from("cases")
          .select("case_reference")
          .eq("id", report.case_id)
          .maybeSingle();
        caseReference = caseRow?.case_reference || null;
      }

      // Pull modification events from audit_log. We filter by case_reference
      // when known, then narrow client-side to rows referencing this report.
      let events: ReportAuditEvent[] = [];
      if (caseReference) {
        const { data: logs } = await supabase
          .from("audit_log")
          .select("id, event_type, user_name, user_email, user_position, created_at, metadata")
          .eq("case_reference", caseReference)
          .in("event_type", ["ai_report_modified", "ai_field_extraction"])
          .order("created_at", { ascending: false })
          .limit(50);
        events = ((logs || []) as any[]).filter((l) => {
          const meta = (l.metadata as Record<string, unknown> | null) || {};
          // Either no report-id discriminator (legacy) or it matches.
          const refId = meta["ai_report_id"] || meta["report_id"];
          return !refId || refId === aiReportId;
        }) as ReportAuditEvent[];
      }

      return {
        created_at: report?.created_at || null,
        modified_at: report?.modified_at || null,
        modified_by: report?.modified_by || null,
        modified_by_name: modifiedByName,
        modification_count: report?.modification_count ?? 0,
        version: report?.version ?? 1,
        events,
      };
    },
    staleTime: 60 * 1000,
  });
}

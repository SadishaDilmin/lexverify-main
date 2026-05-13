/**
 * Client wrapper for the `sow-finding-resolution` edge function.
 * Resolves SectionCompliance findings (dismiss / accept / promote / AI-address /
 * undo) and returns the updated compliance payload.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  SectionCompliancePayload,
  SectionResolution,
  SectionResolutionAction,
} from "@/lib/sowSectionValidator";

export interface ResolveFindingInput {
  aiReportId: string;
  findingId: string;
  action: SectionResolutionAction;
  note?: string;
  /** Required when action === "reverted". The id of the resolution being undone. */
  revertsResolutionId?: string;
  /** Optional explicit source resolution to merge from. Defaults to the latest non-reverted ai_addressed for this finding. */
  sourceResolutionId?: string;
}

export interface ResolveFindingResult {
  resolution: SectionResolution;
  compliance: SectionCompliancePayload;
  /**
   * Updated report-field values when the action mutated the report (auto-merge,
   * or revert of a previous auto-merge). Caller should mirror these into local
   * state to avoid a refetch round-trip.
   */
  reportFields?: {
    internal_report?: string | null;
    client_report?: string | null;
    draft_email?: string | null;
  } | null;
}

export async function resolveFinding(
  input: ResolveFindingInput,
): Promise<ResolveFindingResult> {
  const { data, error } = await supabase.functions.invoke("sow-finding-resolution", {
    body: {
      ai_report_id: input.aiReportId,
      finding_id: input.findingId,
      action: input.action,
      note: input.note ?? null,
      reverts_resolution_id: input.revertsResolutionId ?? null,
      source_resolution_id: input.sourceResolutionId ?? null,
    },
  });

  if (error) {
    throw new Error(error.message || "Failed to resolve finding");
  }
  if (!data?.ok) {
    throw new Error(data?.error || "Resolution rejected");
  }
  return {
    resolution: data.resolution as SectionResolution,
    compliance: data.compliance as SectionCompliancePayload,
    reportFields: (data.report_fields ?? null) as ResolveFindingResult["reportFields"],
  };
}

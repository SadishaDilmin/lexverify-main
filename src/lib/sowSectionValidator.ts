/**
 * Post-generation mandatory section validator for Olimey AI reports.
 *
 * After the report is streamed, this validator calls a lightweight edge function
 * that checks whether all mandatory prompt enhancements were evaluated.
 *
 * When an `aiReportId` is supplied, the edge function persists findings (with
 * stable, deterministic IDs) and any reviewer-supplied resolutions into the
 * `ai_reports.section_compliance` JSONB column so they survive page refreshes.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SectionFinding {
  /** Deterministic id = sha256(section_id + reason). Stable across re-runs. */
  id: string;
  section: string;
  /** Stable section identifier (e.g. "completion_readiness_check"). */
  section_id?: string;
  severity: "critical" | "high" | "medium";
  reason: string;
  expectedBehaviour: string;
  /** First time this finding appeared (preserved across re-runs). */
  first_seen_at?: string;
}

export type SectionResolutionAction =
  | "dismissed"
  | "accepted_as_is"
  | "promoted"
  | "ai_addressed"
  | "ai_merged"
  | "reverted";

export interface SectionResolution {
  id: string;
  finding_id: string;
  action: SectionResolutionAction;
  reverts_resolution_id?: string | null;
  note?: string | null;
  ai_output?: unknown;
  resolved_by: string;
  resolved_by_name?: string | null;
  resolved_at: string;
}

export interface SectionCompliancePayload {
  findings: SectionFinding[];
  resolutions: SectionResolution[];
  last_validated_at?: string;
}

export interface SectionValidationResult {
  passed: boolean;
  /** Findings as returned by the validator (deterministic IDs included). */
  omissions: SectionFinding[];
  /** Full persisted payload (including resolutions) when available. */
  compliance?: SectionCompliancePayload;
  checkedAt: string;
}

/**
 * Validates a completed SoW report against mandatory section requirements.
 * Runs asynchronously after report generation — does NOT block streaming.
 *
 * @param reportText       Full report markdown.
 * @param documentNames    Names of documents the agent reviewed.
 * @param aiReportId       Optional ai_reports.id to persist findings against.
 * @param expectedPersons  Person names that MUST appear as ### Personal
 *                         Profile rows in the deterministic Section 5C table.
 *                         Empty / omitted disables the per-person check.
 */
export async function validateMandatorySections(
  reportText: string,
  documentNames: string[],
  aiReportId?: string,
  expectedPersons?: string[],
): Promise<SectionValidationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("sow-section-validator", {
      body: { reportText, documentNames, aiReportId, expectedPersons: expectedPersons ?? [] },
    });

    if (error) {
      console.error("[section-validator] Edge function error:", error);
      return { passed: true, omissions: [], checkedAt: new Date().toISOString() };
    }

    return {
      passed: data?.passed ?? true,
      omissions: data?.omissions ?? [],
      compliance: data?.compliance,
      checkedAt: data?.checkedAt ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error("[section-validator] Error:", err);
    return { passed: true, omissions: [], checkedAt: new Date().toISOString() };
  }
}

/**
 * Hydrate validation result from a previously-persisted ai_reports row.
 * Used on workspace mount so resolved findings survive refresh.
 */
export function hydrateFromPersisted(
  payload: SectionCompliancePayload | null | undefined,
): SectionValidationResult | null {
  if (!payload || !Array.isArray(payload.findings)) return null;
  return {
    passed: payload.findings.length === 0,
    omissions: payload.findings,
    compliance: payload,
    checkedAt: payload.last_validated_at ?? new Date().toISOString(),
  };
}

/**
 * Walk a finding's resolution chain. The latest non-reverted action wins.
 * Returns null if the finding is currently unresolved (open or fully reverted).
 */
export function currentResolution(
  findingId: string,
  resolutions: SectionResolution[],
): SectionResolution | null {
  const chain = resolutions.filter((r) => r.finding_id === findingId);
  if (chain.length === 0) return null;
  // Sort by resolved_at ASC then walk; reverted actions cancel the most recent
  // non-reverted entry referenced by reverts_resolution_id.
  const sorted = [...chain].sort((a, b) => a.resolved_at.localeCompare(b.resolved_at));
  const cancelled = new Set<string>();
  for (const r of sorted) {
    if (r.action === "reverted" && r.reverts_resolution_id) {
      cancelled.add(r.reverts_resolution_id);
    }
  }
  // Latest non-reverted, non-cancelled action
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i];
    if (r.action === "reverted") continue;
    if (cancelled.has(r.id)) continue;
    return r;
  }
  return null;
}

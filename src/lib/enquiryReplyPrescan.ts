/**
 * Client helper for the enquiry-reply-prescan edge function.
 *
 * Runs a lightweight Gemini Flash classification per uploaded reply file to
 * propose which currently-open enquiries each file likely answers. The user
 * confirms or corrects the proposal in EnquiryTrackerPanel before the heavier
 * `ingest-replies` analysis runs.
 *
 * Failure mode: returns a `prescan_failed` proposal (empty matches) so the UI
 * can fall back to manual selection. Network errors surface to the caller.
 */

import { supabase } from "@/integrations/supabase/client";

export type PrescanConfidence = "high" | "medium" | "low";

export interface PrescanMatch {
  enquiry_id: string;
  enquiry_number: string;
  confidence: PrescanConfidence;
  reasoning_snippet: string;
}

export interface PrescanResult {
  auto_note: string;
  suggested_classification: string;
  matches: PrescanMatch[];
  prescan_failed?: boolean;
}

export async function prescanReplyFile(params: {
  case_id: string;
  agent_type: "sow";
  file_path: string;
  file_name: string;
}): Promise<PrescanResult> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) {
    throw new Error("You must be signed in to pre-scan reply files.");
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enquiry-reply-prescan`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    if (resp.status === 429) throw new Error("AI rate limit exceeded — please try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted — top up to continue.");
    throw new Error(body?.error || `Pre-scan failed (${resp.status})`);
  }

  return (await resp.json()) as PrescanResult;
}

/**
 * Friendly labels for SectionId values returned by the backend in
 * `affected_sections`. Mirrors `_shared/enquirySectionMap.ts::SECTION_LABELS`.
 * Kept in sync manually — backend remains the source of truth for routing.
 */
export const SECTION_LABELS: Record<string, string> = {
  "identity": "Identity Verification",
  "source_of_wealth.savings": "Source of Wealth — Savings",
  "source_of_wealth.income": "Source of Wealth — Income",
  "source_of_wealth.investments": "Source of Wealth — Investments",
  "source_of_wealth.property": "Source of Wealth — Property",
  "source_of_wealth.inheritance": "Source of Wealth — Inheritance",
  "source_of_wealth.gift": "Source of Wealth — Gift",
  "source_of_wealth.business": "Source of Wealth — Business",
  "source_of_funds.deposit": "Source of Funds — Deposit",
  "source_of_funds.mortgage": "Source of Funds — Mortgage",
  "source_of_funds.completion": "Source of Funds — Completion",
  "personal_profile": "Personal Profile",
  "external_profile": "External Profile",
  "lender_consideration": "Lender Consideration",
  "decision_log_only": "Decision Log",
};

export function sectionLabel(sectionId: string): string {
  return SECTION_LABELS[sectionId] || sectionId;
}

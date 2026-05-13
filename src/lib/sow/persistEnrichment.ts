/**
 * Persists per-person enrichment evidence to external_profile_checks /
 * external_profile_signals. Restores the Wave 7 audit trail that was
 * previously only living inside the prompt as transient markdown.
 *
 * Idempotent on (case_id, ai_run_id, party_name): re-running a SoW
 * submission will overwrite, not duplicate.
 *
 * Failure-safe: never throws — persistence is best-effort. Logs issues
 * and returns counts. The SoW pipeline must continue even if this fails.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  CompaniesHouseResultPerson,
  FcaResultFirm,
  OfsiResultParty,
  ProfileResultPerson,
} from "./personalProfileBuilder";

export interface PersistEnrichmentInputs {
  caseId: string;
  aiRunId: string;
  persons: Array<{ id: string; fullName: string; occupation?: string; employer?: string }>;
  profileResult: { profiles?: ProfileResultPerson[] } | null;
  chResult: { results?: CompaniesHouseResultPerson[] } | null;
  ofsiResult: { results?: OfsiResultParty[] } | null;
  fcaResult: { results?: FcaResultFirm[] } | null;
}

export interface PersistEnrichmentResult {
  checksWritten: number;
  signalsWritten: number;
  errors: string[];
}

/**
 * Severity-rank the per-person checks down to a single overall_outcome.
 * Mirrors the labels expected by external_profile_checks.overall_outcome.
 */
function deriveOverallOutcome(args: {
  ofsiStatus?: string;
  chStatus?: string;
  hasAdverseMedia: boolean;
  hasAnySignal: boolean;
}): { outcome: string; requiresReview: boolean; hasDiscrepancy: boolean; summary: string } {
  if (args.ofsiStatus === "strong_match") {
    return {
      outcome: "sanctions_strong_match",
      requiresReview: true,
      hasDiscrepancy: true,
      summary: "OFSI strong sanctions match — escalate to Compliance Officer immediately.",
    };
  }
  if (args.ofsiStatus === "potential_match") {
    return {
      outcome: "sanctions_potential_match",
      requiresReview: true,
      hasDiscrepancy: true,
      summary: "Potential OFSI sanctions match — manual review recommended.",
    };
  }
  if (args.hasAdverseMedia) {
    return {
      outcome: "adverse_media_review",
      requiresReview: true,
      hasDiscrepancy: false,
      summary: "Adverse media references identified — manual review recommended.",
    };
  }
  if (args.chStatus === "verified" || args.chStatus === "not_verified") {
    return {
      outcome: "external_signal_present",
      requiresReview: false,
      hasDiscrepancy: false,
      summary: "External profile evidence collected (Companies House and/or open-source).",
    };
  }
  if (args.hasAnySignal) {
    return {
      outcome: "external_signal_present",
      requiresReview: false,
      hasDiscrepancy: false,
      summary: "External profile evidence collected.",
    };
  }
  return {
    outcome: "no_relevant_external_signal",
    requiresReview: false,
    hasDiscrepancy: false,
    summary: "External enrichment ran; no relevant public signals found for this person.",
  };
}

const ADVERSE_KEYWORDS_RE =
  /\b(arrest|charged|convicted|fraud|sanction|launder|investigation|allegation|tribunal|struck off|prohibited|disqualified|bankrupt)\b/i;

export async function persistEnrichmentForCase(
  inputs: PersistEnrichmentInputs,
): Promise<PersistEnrichmentResult> {
  const result: PersistEnrichmentResult = { checksWritten: 0, signalsWritten: 0, errors: [] };
  if (!inputs.caseId || !inputs.aiRunId) {
    result.errors.push("missing caseId or aiRunId");
    return result;
  }

  const profileByName = new Map<string, ProfileResultPerson>();
  for (const p of inputs.profileResult?.profiles || []) profileByName.set(p.fullName.toLowerCase(), p);

  const chByName = new Map<string, CompaniesHouseResultPerson>();
  for (const c of inputs.chResult?.results || []) chByName.set(c.fullName.toLowerCase(), c);

  const ofsiByName = new Map<string, OfsiResultParty>();
  for (const o of inputs.ofsiResult?.results || []) ofsiByName.set(o.partyName.toLowerCase(), o);

  for (const person of inputs.persons) {
    const profile = profileByName.get(person.fullName.toLowerCase());
    const ch = chByName.get(person.fullName.toLowerCase());
    const ofsi = ofsiByName.get(person.fullName.toLowerCase());

    const sources = profile?.sources || [];
    const hasAdverse = sources.some(
      (s) =>
        s.identityMatch &&
        (s.confidenceLevel === "High" || s.confidenceLevel === "Medium") &&
        ADVERSE_KEYWORDS_RE.test(s.extractedInformation || ""),
    );

    const checks: Array<{ source: string; status: string; detail: string }> = [];
    if (profile) checks.push({ source: "firecrawl_profile", status: profile.structuredRow?.professionalStatus || "not_checked", detail: profile.structuredRow?.professionalDetail || "" });
    if (ch) checks.push({ source: "companies_house", status: ch.verificationStatus, detail: ch.verificationSummary });
    if (ofsi) checks.push({ source: "ofsi", status: ofsi.status, detail: `${ofsi.matches?.length || 0} match(es)` });
    if (inputs.fcaResult?.results?.length) {
      const empNorm = (person.employer || "").trim().toLowerCase();
      const match = inputs.fcaResult.results.find((f) => (f.firmName || "").trim().toLowerCase() === empNorm);
      if (match) checks.push({ source: "fca_register", status: match.statusCategory, detail: match.status });
    }

    const overall = deriveOverallOutcome({
      ofsiStatus: ofsi?.status,
      chStatus: ch?.verificationStatus,
      hasAdverseMedia: hasAdverse,
      hasAnySignal: sources.length > 0 || (ch?.companiesFound?.length || 0) > 0,
    });

    const noSignalRatio = checks.length === 0
      ? 1
      : checks.filter((c) => c.status === "not_found" || c.status === "no_signal" || c.status === "not_checked" || c.status === "clear").length / checks.length;

    // Upsert the parent check row. We delete prior rows for this case+run+party
    // first because the table doesn't have a unique constraint on that triple
    // and Supabase upsert needs one.
    try {
      await supabase
        .from("external_profile_checks")
        .delete()
        .eq("case_id", inputs.caseId)
        .eq("ai_run_id", inputs.aiRunId)
        .eq("party_name", person.fullName);

      const { data: insertedCheck, error: insertErr } = await supabase
        .from("external_profile_checks")
        .insert({
          case_id: inputs.caseId,
          ai_run_id: inputs.aiRunId,
          party_id: person.id || person.fullName,
          party_name: person.fullName,
          declared_occupation: person.occupation || null,
          overall_outcome: overall.outcome,
          overall_summary: overall.summary,
          requires_review: overall.requiresReview,
          has_discrepancy: overall.hasDiscrepancy,
          no_signal_ratio: Number(noSignalRatio.toFixed(2)),
          checks: checks as never,
          enriched_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr || !insertedCheck) {
        result.errors.push(`check insert failed for ${person.fullName}: ${insertErr?.message || "no row"}`);
        continue;
      }
      result.checksWritten++;

      // Write per-source signals
      const signalRows = sources.map((s) => ({
        profile_check_id: insertedCheck.id,
        source_type: detectSourceType(s.sourceUrl),
        source_name: s.sourceTitle || "Unknown source",
        source_url: s.sourceUrl || null,
        subject_match_confidence: confidenceToNumber(s.confidenceLevel),
        relevance: "informational",
        sentiment: ADVERSE_KEYWORDS_RE.test(s.extractedInformation || "") ? "negative" : "neutral",
        signal_date: null,
        is_stale: false,
        summary: (s.extractedInformation || "").slice(0, 1000),
        snippet: (s.extractedInformation || "").slice(0, 400),
        is_corroborated: s.identityMatch && s.confidenceLevel === "High",
        should_affect_findings: s.identityMatch && (s.confidenceLevel === "High" || s.confidenceLevel === "Medium"),
        requires_review: ADVERSE_KEYWORDS_RE.test(s.extractedInformation || ""),
      }));

      // Also append CH companies as structured signals (so audit reads see them)
      for (const c of ch?.companiesFound || []) {
        signalRows.push({
          profile_check_id: insertedCheck.id,
          source_type: "companies_house",
          source_name: `${c.companyName} (${c.companyNumber})`,
          source_url: `https://find-and-update.company-information.service.gov.uk/company/${c.companyNumber}`,
          subject_match_confidence: c.verificationComplete ? 0.95 : 0.7,
          relevance: "directorship",
          sentiment: "neutral",
          signal_date: null,
          is_stale: false,
          summary: `${c.role} of ${c.companyName} (${c.companyNumber}). Verification ${c.verificationComplete ? "complete" : "not confirmed"}.`,
          snippet: `${c.role} — ${c.companyName}`,
          is_corroborated: !!c.verificationComplete,
          should_affect_findings: true,
          requires_review: !c.verificationComplete,
        });
      }

      if (signalRows.length > 0) {
        const { error: sigErr } = await supabase.from("external_profile_signals").insert(signalRows);
        if (sigErr) {
          result.errors.push(`signals insert failed for ${person.fullName}: ${sigErr.message}`);
        } else {
          result.signalsWritten += signalRows.length;
        }
      }
    } catch (err) {
      result.errors.push(`unexpected error for ${person.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[persistEnrichment] case=${inputs.caseId} run=${inputs.aiRunId} ` +
      `checks=${result.checksWritten} signals=${result.signalsWritten} errors=${result.errors.length}`,
  );
  if (result.errors.length > 0) console.warn("[persistEnrichment] errors:", result.errors);
  return result;
}

function detectSourceType(url: string | undefined): string {
  if (!url) return "other";
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("company-information.service.gov.uk")) return "companies_house";
  if (u.includes("gov.uk")) return "gov_uk";
  return "web";
}

function confidenceToNumber(level: string): number {
  if (level === "High") return 0.9;
  if (level === "Medium") return 0.65;
  if (level === "Low") return 0.35;
  return 0.5;
}

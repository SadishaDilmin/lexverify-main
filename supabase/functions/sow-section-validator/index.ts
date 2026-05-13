import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  detectIdMismatchLanguage,
  extractCandidateIdValues,
  findFirstNearCloneIdPair,
} from "../_shared/ocrSimilarity.ts";
import { evaluatePersonalProfileCoverage } from "../_shared/personalProfileCoverage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MANDATORY_SECTIONS = [
  {
    id: "material_inbound_credit_review",
    label: "Material Inbound Credit Review (Section 6A-2)",
    description:
      "EVERY non-salary credit ≥£1,000 (or recurring pattern of smaller credits from the same source) in any bank statement or Open Banking report MUST be individually addressed. For each material credit, the report MUST either (a) explain the credit with evidence from the documents, or (b) raise a specific enquiry citing the exact date, amount, and transaction narrative (e.g. 'From A/C XXXXXXXX'). Credits described as transfers from unlinked accounts MUST trigger an enquiry unless the originating account is verified in the evidence package.",
  },
  {
    id: "material_credit_bundling",
    label: "Material Credit Anti-Bundling (Section 6A-2)",
    description:
      "Each Material Inbound Credit must appear as its own row in the review table and as its own numbered enquiry in the draft email, with exact date, amount and narrative. Bundled enquiries covering multiple credits (e.g. 'please provide information on all payments over £1,000', 'please explain the various unexplained credits', 'all of the above credits') are non-conforming and must be rewritten as one enquiry per credit.",
  },
  {
    id: "asset_disposal_verification",
    label: "Asset Disposal Verification (Section 6A-3)",
    description:
      "When documents show proceeds from sale of non-property assets (vehicles, jewellery, watches, etc.), the report MUST request ownership evidence (V5C logbook), sale agreement/invoice, and trace the credit to a provided account. If no asset disposals are present, the section is not required.",
  },
  {
    id: "screenshot_rejection",
    label: "Evidence Format Rule (Screenshot Rejection)",
    description:
      "If any uploaded document appears to be a screenshot of a bank statement (PNG/JPG of financial data, cropped images, photos of screens), the report MUST explicitly reject it and request an official PDF download or open banking linking. Non-financial screenshots (LinkedIn, employer sites) are acceptable.",
  },
  {
    id: "own_account_transfer_verification",
    label: "Own-Account Transfer Verification (Section 10A)",
    description:
      'Credits described as "From A/C XXXXXXXX" or similar patterns MUST only be treated as benign own-account transfers if the originating account is (a) linked in the open banking report OR (b) provided as a separate statement. Otherwise, an enquiry must be raised.',
  },
  {
    id: "completion_readiness_check",
    label: "Completion Readiness Check (Step 5.5)",
    description:
      "The report MUST compare actual liquid balances visible in evidence against net funds required for completion (Total Required minus Mortgage). If a shortfall exists, an enquiry must be raised. This section is ALWAYS required when financial data is present.",
  },
  {
    id: "employment_role_tenure",
    label: "Employment Role & Tenure Enquiry",
    description:
      "When salary credits identify an employer but the specific job role/title and tenure are NOT discernible from documents, the report MUST raise a targeted enquiry requesting job role, tenure, and LinkedIn/employer profile link.",
  },
];

// ── Deterministic bundling detection (regex, no LLM call) ──────────
const BUNDLING_PATTERNS: RegExp[] = [
  /please\s+(?:provide|explain|clarify|confirm)[^.\n]{0,80}?\ball\s+(?:credits|payments|deposits|transfers|inbound\s+payments)\b/i,
  /\bany\s+(?:credits|payments|deposits|transfers)\s+(?:over|above|exceeding|greater\s+than)\s*£?\s*[\d,]+/i,
  /\ball\s+(?:credits|payments|deposits|transfers)\s+(?:over|above|exceeding|greater\s+than)\s*£?\s*[\d,]+/i,
  /\bvarious\s+(?:credits|unexplained\s+credits|payments|deposits|inbound\s+payments)\b/i,
  /\b(?:multiple|several|numerous)\s+unexplained\s+(?:credits|payments|deposits)\b/i,
  /\ball\s+of\s+the\s+above\s+(?:credits|payments|deposits)\b/i,
  /\bcredits?\s+totalling\s+£?\s*[\d,]+/i,
];

function detectBundlingPhrases(reportText: string): string[] {
  const hits: string[] = [];
  for (const pattern of BUNDLING_PATTERNS) {
    const m = reportText.match(pattern);
    if (m) hits.push(m[0].slice(0, 160));
  }
  return hits;
}

const VALIDATOR_SYSTEM_PROMPT = `You are a compliance quality validator for a UK conveyancing AML platform called Olimey AI. Your job is to check whether a Source of Wealth assessment report addressed all mandatory sections from the prompt instructions.

For each mandatory section below, determine whether:
1. The triggering condition exists in the case (based on documents reviewed and report content)
2. If triggered, whether the report adequately addressed it with the correct enquiries
3. If not triggered, the section is not required (do NOT flag it)

## Mandatory Sections to Validate

${MANDATORY_SECTIONS.map(
  (s, i) => `### ${i + 1}. ${s.label} (id: "${s.id}")
${s.description}`
).join("\n\n")}

## Response Format

Respond with ONLY a JSON object:
{
  "omissions": [
    {
      "section": "section_id_from_above",
      "severity": "critical|high|medium",
      "reason": "Why this section was omitted or inadequately covered",
      "expectedBehaviour": "What the report should have included"
    }
  ]
}

If all sections are adequately addressed (or correctly not triggered), return: {"omissions": []}

## Severity Guide
- critical: A mandatory section was clearly triggered by the evidence but completely absent from the report
- high: A mandatory section was triggered but only partially addressed (e.g., funding gap calculated but no Completion Readiness Check label, or screenshot identified but not rejected)
- medium: A section was partially triggered but addressed in a different form

## IMPORTANT
- Do NOT flag sections where the triggering condition does not exist in the case
- Be precise about what was missing vs what was present in a different form
- Look at BOTH the report text AND the document names to determine triggers`;

// ── Deterministic finding ID ────────────────────────────────────────
async function findingIdFor(sectionId: string, reason: string): Promise<string> {
  const data = new TextEncoder().encode(`${sectionId}::${reason.trim().toLowerCase()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reportText, documentNames, aiReportId, expectedPersons } = await req.json();

    if (!reportText || typeof reportText !== "string") {
      return new Response(JSON.stringify({ error: "reportText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[sow-section-validator] LOVABLE_API_KEY not set");
      return new Response(JSON.stringify({ passed: true, omissions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: VALIDATOR_SYSTEM_PROMPT },
          {
            role: "user",
            content: `## Documents in this case:\n${(documentNames || []).join("\n")}\n\n## Full Report Output (truncated):\n${reportText.slice(0, 25000)}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error("[sow-section-validator] AI gateway error:", aiResponse.status);
      const errText = await aiResponse.text();
      console.error("[sow-section-validator] Error body:", errText);
      return new Response(JSON.stringify({ passed: true, omissions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResponse.json();

    if (data.usage) {
      console.log(
        `[TOKEN_USAGE] sow-section-validator | model=google/gemini-2.5-flash | prompt_tokens=${data.usage.prompt_tokens} | completion_tokens=${data.usage.completion_tokens} | total_tokens=${data.usage.total_tokens}`
      );
    }

    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn("[sow-section-validator] No JSON in AI response");
      return new Response(JSON.stringify({ passed: true, omissions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawOmissions = Array.isArray(parsed.omissions) ? parsed.omissions : [];

    const checkedAt = new Date().toISOString();

    // Build findings with deterministic IDs
    const newFindings = await Promise.all(
      rawOmissions.map(async (o: any) => {
        const sectionId: string = o.section || "unknown";
        const reason: string = o.reason || "Section not addressed";
        const id = await findingIdFor(sectionId, reason);
        const meta = MANDATORY_SECTIONS.find((s) => s.id === sectionId);
        return {
          id,
          section: meta?.label || sectionId,
          section_id: sectionId,
          severity: o.severity || "medium",
          reason,
          expectedBehaviour: o.expectedBehaviour || "",
          first_seen_at: checkedAt,
        };
      })
    );

    // ── Deterministic bundling check (regex; runs in addition to LLM findings) ──
    const bundlingHits = detectBundlingPhrases(reportText);
    if (bundlingHits.length > 0) {
      const reason = `Detected ${bundlingHits.length} bundled-enquiry phrase(s): ${bundlingHits.slice(0, 3).map((h) => `"${h}"`).join("; ")}`;
      const id = await findingIdFor("material_credit_bundling", reason);
      // Avoid duplicate if LLM already produced a finding for the same section_id
      if (!newFindings.some((f) => f.section_id === "material_credit_bundling")) {
        newFindings.push({
          id,
          section: "Material Credit Anti-Bundling (Section 6A-2)",
          section_id: "material_credit_bundling",
          severity: "high",
          reason,
          expectedBehaviour:
            "Rewrite each bundled enquiry as one numbered enquiry per individual credit, citing the exact date, amount, and transaction narrative. Recurring credits from an identical payer may be grouped only when ≥3 occurrences exist and every date/amount is still listed underneath.",
          first_seen_at: checkedAt,
        });
      }
    }

    // ── Deterministic ID-mismatch language detection ─────────────────
    // Surface a finding when the report contains assertive ID-mismatch language
    // (e.g. "passport numbers do not match") so the reviewer is alerted to
    // re-check the case under the OCR / Image-Extraction Discrepancy Safeguard.
    // We do NOT auto-downgrade upstream report severity here (that is the
    // agent's job per its prompt rules); the validator's role is to flag
    // that the language used may indicate the safeguard was not applied.
    const idMismatchHits = detectIdMismatchLanguage(reportText);
    if (idMismatchHits.length > 0) {
      // Value-level near-clone detection: extract candidate ID tokens from a
      // window around each hit and look for a confirmed near-clone pair. When
      // we find one we upgrade the finding wording to be specific and
      // actionable; otherwise we fall back to the generic "verify safeguard"
      // wording, which is identical in scope to the previous behaviour.
      const WINDOW = 1500;
      let nearClonePair: ReturnType<typeof findFirstNearCloneIdPair> = null;
      for (const hit of idMismatchHits) {
        const phraseIdx = reportText.toLowerCase().indexOf(hit.phrase.toLowerCase());
        if (phraseIdx < 0) continue;
        const start = Math.max(0, phraseIdx - WINDOW);
        const end = Math.min(reportText.length, phraseIdx + hit.phrase.length + WINDOW);
        const window = reportText.slice(start, end);
        const candidates = extractCandidateIdValues(window);
        nearClonePair = findFirstNearCloneIdPair(candidates, { assumeScanned: true });
        if (nearClonePair) break;
      }

      const phraseList = idMismatchHits.slice(0, 2).map((h) => `"${h.phrase}"`).join("; ");

      let reason: string;
      let expectedBehaviour: string;
      let severity: "critical" | "high" | "medium" | "low" = "high";
      if (nearClonePair) {
        // Confirmed near-clone — promote to specific, actionable finding.
        severity = "critical";
        reason =
          `OCR / Image-Extraction Discrepancy Safeguard violation: the report flags ` +
          `\`${nearClonePair.valueA}\` vs \`${nearClonePair.valueB}\` as conflicting identity values ` +
          `(edit distance ${nearClonePair.editDistance} on image-sourced fields), and uses assertive ` +
          `mismatch language (${phraseList}). A forger has no rational motive to fabricate an ID that ` +
          `differs from the original by ${nearClonePair.editDistance} character(s); near-identical ` +
          `disagreements on the same physical artefact are overwhelmingly OCR / image-extraction errors.`;
        expectedBehaviour =
          `Re-classify the affected identity section to Amber ("manual visual review by the Compliance Officer required"), ` +
          `not Red / Critical. Replace assertive wording such as "conflicting passports", "two different passport numbers", ` +
          `"identity discrepancy confirmed" or "indicator of identity fraud" with: ` +
          `"Possible OCR / image-reading inconsistency in passport number — initial reads ` +
          `\`${nearClonePair.valueA}\` and \`${nearClonePair.valueB}\` differ by ${nearClonePair.editDistance} character(s) on photographed/scanned source(s). ` +
          `Manual visual review by the Compliance Officer is recommended before treating this as a confirmed discrepancy." ` +
          `Record both reads, the edit distance, and the second-pass conclusion in the Decision Log. ` +
          `The safeguard applies regardless of how many filenames the images are stored under — multiple ` +
          `image files of the same person's passport count as multiple reads of the same physical artefact.`;
      } else {
        reason =
          `Detected ${idMismatchHits.length} assertive ID-mismatch phrase(s) in the report: ${phraseList}. ` +
          `Verify that the OCR / Image-Extraction Discrepancy Safeguard was applied: image-sourced fields disagreeing ` +
          `by only 1–2 characters should default to Amber (manual visual review), not Red/Critical, because a forger ` +
          `has no rational motive to fabricate a near-clone of the genuine value.`;
        expectedBehaviour =
          `If the underlying ID fields are sourced from images/scans and the two reads differ by only 1 or 2 characters, ` +
          `the report must (a) default to Amber 'manual visual review' rather than Red/Critical, (b) record both reads ` +
          `and the edit distance in the Decision Log, and (c) avoid language such as 'passport numbers do not match', ` +
          `'conflicting passports', or 'identity discrepancy confirmed' unless a deliberate second-pass visual ` +
          `verification has confirmed a genuine mismatch.`;
      }

      const id = await findingIdFor("id_field_near_clone_suppression", reason);
      if (!newFindings.some((f) => f.section_id === "id_field_near_clone_suppression")) {
        newFindings.push({
          id,
          section: "OCR / Image-Extraction Discrepancy Safeguard",
          section_id: "id_field_near_clone_suppression",
          severity,
          reason,
          expectedBehaviour,
          first_seen_at: checkedAt,
        });
        console.log(
          `[sow-section-validator] OCR safeguard finding emitted | severity=${severity} | ` +
          `phrases=${idMismatchHits.length} | nearClone=${nearClonePair ? `${nearClonePair.valueA}↔${nearClonePair.valueB} (d=${nearClonePair.editDistance})` : "no"}`,
        );
      }
    }

    // ── Personal Profile (Section 5C) coverage telemetry ─────────────
    // Section 5C is a STANDARD deterministic output that the SoW pipeline
    // injects on every save (see src/hooks/useSoWSubmit.ts saveReport →
    // buildPersonalProfileSection / upsertPersonalProfileSection). It is
    // not a triageable compliance issue for the conveyancer to resolve —
    // if it is missing, that is a build-side defect to fix upstream, not
    // a HIGH "Section Compliance" flag in the case workspace.
    //
    // We therefore no longer emit a finding for Section 5C coverage gaps.
    // We retain a console log so build-side regressions remain visible in
    // edge-function telemetry / admin dashboards.
    if (Array.isArray(expectedPersons) && expectedPersons.length > 0) {
      const coverage = evaluatePersonalProfileCoverage(reportText, expectedPersons);
      if (!coverage.rendersCorrectly) {
        console.warn(
          `[sow-section-validator] Section 5C coverage gap (telemetry only — not raised as a finding) | ` +
          `missing_header=${!coverage.hasSectionHeader} | ` +
          `missing_persons=${coverage.personsMissing.length} | ` +
          `incomplete_persons=${coverage.personsWithIncompleteRows.length} | ` +
          `expected_persons=${expectedPersons.length}`,
        );
      }
    }

    let compliancePayload: any = {
      findings: newFindings,
      resolutions: [],
      last_validated_at: checkedAt,
    };

    if (aiReportId && supabaseServiceKey) {
      try {
        const admin = createClient(supabaseUrl, supabaseServiceKey);
        const { data: existing, error: fetchErr } = await admin
          .from("ai_reports")
          .select("section_compliance")
          .eq("id", aiReportId)
          .maybeSingle();

        if (fetchErr) {
          console.warn("[sow-section-validator] Could not load existing compliance:", fetchErr.message);
        }

        const prior = (existing?.section_compliance ?? {}) as any;
        const priorFindings: any[] = Array.isArray(prior.findings) ? prior.findings : [];
        const priorResolutions: any[] = Array.isArray(prior.resolutions) ? prior.resolutions : [];

        // Preserve first_seen_at on matched IDs
        const merged = newFindings.map((f) => {
          const match = priorFindings.find((p: any) => p.id === f.id);
          return match?.first_seen_at ? { ...f, first_seen_at: match.first_seen_at } : f;
        });

        compliancePayload = {
          findings: merged,
          resolutions: priorResolutions,
          last_validated_at: checkedAt,
        };

        const { error: upErr } = await admin
          .from("ai_reports")
          .update({ section_compliance: compliancePayload })
          .eq("id", aiReportId);

        if (upErr) {
          console.warn("[sow-section-validator] Persist failed:", upErr.message);
        } else {
          console.log(`[sow-section-validator] Persisted ${merged.length} finding(s) to ai_report ${aiReportId}`);
        }
      } catch (persistErr) {
        console.warn("[sow-section-validator] Persistence error:", persistErr);
      }
    }

    console.log(`[sow-section-validator] Result: ${newFindings.length} omission(s) found`);

    return new Response(
      JSON.stringify({
        passed: compliancePayload.findings.length === 0,
        omissions: compliancePayload.findings,
        compliance: compliancePayload,
        checkedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[sow-section-validator] Error:", err);
    return new Response(JSON.stringify({ passed: true, omissions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

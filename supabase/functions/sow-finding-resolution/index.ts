/**
 * sow-finding-resolution — append-only resolution log for SectionCompliance findings.
 *
 * Writes one resolution row into `ai_reports.section_compliance.resolutions`
 * (JSONB) and emits one matching `audit_log` event of type
 * `section_finding_resolved`. The row is the single source of truth — the UI
 * derives current state by walking the resolution chain.
 *
 * Actions:
 *   dismissed       — reviewer judges finding non-applicable
 *   accepted_as_is  — reviewer accepts the report as-is despite the finding
 *   promoted        — reviewer promotes the finding into the enquiry list (note carries the drafted text)
 *   ai_addressed    — Lovable AI drafts a proposed correction; stored in ai_output for reviewer to merge
 *   ai_merged       — reviewer auto-merges a previously AI-drafted proposal into the report
 *                     (writes to internal_report / client_report / draft_email, snapshots prior text)
 *   reverted        — undoes a prior resolution (must reference reverts_resolution_id);
 *                     for ai_merged this restores the snapshot
 *
 * Auth: requires JWT. Reviewer must be the case owner OR have the `admin` role.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { stripAiMergeMarkers } from "../_shared/draftEmailEnquiryParser.ts";
import {
  buildCaseEvidenceCorpus,
  validateAgainstEvidence,
} from "../_shared/groundedOutputValidator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Action = "dismissed" | "accepted_as_is" | "promoted" | "ai_addressed" | "ai_merged" | "reverted";

const VALID_ACTIONS: Action[] = [
  "dismissed",
  "accepted_as_is",
  "promoted",
  "ai_addressed",
  "ai_merged",
  "reverted",
];

interface RequestBody {
  ai_report_id: string;
  finding_id: string;
  action: Action;
  note?: string | null;
  reverts_resolution_id?: string | null;
  /** Optional explicit source resolution to merge from (defaults to latest non-reverted ai_addressed). */
  source_resolution_id?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Walk the resolution chain for a finding and return the latest non-reverted
 * resolution, mirroring the client-side `currentResolution` helper. Used by
 * `ai_merged` to locate the AI draft to merge.
 */
function latestActiveResolution(findingId: string, resolutions: any[]): any | null {
  const chain = resolutions.filter((r) => r.finding_id === findingId);
  if (chain.length === 0) return null;
  const sorted = [...chain].sort((a, b) =>
    String(a.resolved_at).localeCompare(String(b.resolved_at)),
  );
  const cancelled = new Set<string>();
  for (const r of sorted) {
    if (r.action === "reverted" && r.reverts_resolution_id) {
      cancelled.add(r.reverts_resolution_id);
    }
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i];
    if (r.action === "reverted") continue;
    if (cancelled.has(r.id)) continue;
    return r;
  }
  return null;
}

async function callAiAddress(
  reportText: string,
  finding: { section: string; reason: string; expectedBehaviour: string },
  evidenceCorpus: string,
  caseId: string,
): Promise<unknown> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return { error: "LOVABLE_API_KEY not configured" };
  }

  const systemPrompt = `You are a senior UK conveyancing AML reviewer addressing a specific gap flagged in a Olimey AI Source of Wealth report.

Your job is to draft the missing content. The reviewer will manually merge it. You MUST NOT speculate beyond what the report's evidence supports.

Output ONLY a JSON object of this exact shape:
{
  "added_enquiry": "Draft enquiry text in UK English, suitable for a client letter, addressing the gap. Empty string if no enquiry needed.",
  "decision_log_entry": "One-sentence supervisory note explaining the rationale and which evidence triggered it.",
  "report_amendment": "Markdown snippet (≤200 words) the reviewer can paste into the report to address the gap. Empty string if a new enquiry alone is sufficient."
}

Rules:
- UK English only.
- Use evidence-proportional language. Never overstate suspicion.
- Do not invent facts not present in the report.
- Reference the exact section label in your decision_log_entry.

ABSOLUTE DATA-ISOLATION RULES (highest priority — violations are reported as a confidentiality breach):
- The ONLY permitted sources of fact are (a) the "Report excerpt" block and (b) the "Case evidence corpus" block in this prompt. Both belong to case ${caseId} only.
- You MUST NOT quote any client name, payer name, account holder name, account number, sort code, transaction date, transaction amount, or transaction narrative unless that exact value appears verbatim in one of those two blocks.
- You have NO MEMORY of any other case, client, or session. If you find yourself recalling a name, amount, date, or narrative that is not in the provided blocks, treat that recollection as hallucinated and DO NOT use it.
- If the provided evidence does not contain the specific transactions needed to draft a verbatim enquiry, return "added_enquiry": "" and use the "decision_log_entry" to record that further evidence (e.g. specific bank statement extracts) is required before the enquiry can be drafted. Returning an empty enquiry in this case is the correct, compliant behaviour.

CREDIT / TRANSACTION ENQUIRIES — STRICT ANTI-BUNDLING RULE:
When the gap concerns one or more inbound credits, deposits, transfers, debits or other specific transactions, the "added_enquiry" field MUST list each transaction as its OWN numbered enquiry line citing the verbatim values from the evidence — exact date, exact amount, and the transaction narrative/payer string as it appears in the evidence. Produce ONE numbered line per credit. Bundled phrasing such as "We note recurring credits from A, B, C and D — please provide details for each", "various unexplained credits totalling [amount]" or any aggregate request covering multiple credits in a single sentence is FORBIDDEN. Recurring entries from an identical payer string may be grouped under one numbered heading ONLY when (a) the payer string is identical across occurrences, (b) at least 3 occurrences exist, and (c) every individual date and amount is still listed underneath the heading.

NO PLACEHOLDER ECHOING and NO FABRICATION: Never emit bracketed placeholders such as [date], [amount], [source], [account]. Never substitute a fabricated value where a real one is missing. If a verbatim value is genuinely missing from the provided evidence, return an empty "added_enquiry" and explain in the decision_log_entry that further evidence is needed. Inventing names, amounts, dates, or payer strings is a critical compliance failure.`;

  const userPrompt = `## Finding to address (case ${caseId})
Section: ${finding.section}
Reason: ${finding.reason}
Expected behaviour: ${finding.expectedBehaviour}

## Report excerpt (truncated) — case ${caseId}
${reportText.slice(0, 12000)}

## Case evidence corpus (truncated) — case ${caseId}
The following is the ONLY transactional evidence you may quote verbatim. If a transaction you would want to cite is not in this block, do not invent it.

${evidenceCorpus.slice(0, 18000)}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return { error: `ai_gateway_${r.status}`, detail: errText.slice(0, 300) };
    }

    const data = await r.json();
    if (data.usage) {
      console.log(
        `[TOKEN_USAGE] sow-finding-resolution | model=google/gemini-2.5-flash | prompt_tokens=${data.usage.prompt_tokens} | completion_tokens=${data.usage.completion_tokens} | total_tokens=${data.usage.total_tokens}`,
      );
    }
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { raw: content };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { raw: content };
    }
  } catch (err) {
    return { error: "ai_call_failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * SHA-256 hex of a normalised string. Used to dedupe addendum content across
 * findings — if a different finding produces an identical merged block we
 * skip the second insert rather than appending a near-duplicate.
 */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.replace(/\s+/g, " ").trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Idempotent upsert of an AI-drafted snippet into a report field.
 *
 * Uses an HTML-comment marker `<!-- ai-merge: finding=<id> ... -->` to locate
 * any prior block for the same finding and REPLACE it in-place. If no prior
 * block exists, appends to the end. Also deduplicates by content hash so a
 * different finding writing the same body twice is a no-op.
 *
 * Returns null when the snippet is empty (caller should skip the field).
 */
async function upsertSnippet(
  existing: string | null,
  snippet: string,
  header: string,
  markerKey: string,        // e.g. `finding=<id>` or `enquiry-for=<id>`
  contentHashes: Set<string>,
): Promise<string | null> {
  const trimmed = (snippet || "").trim();
  if (!trimmed) return null;

  const block = `${header}\n\n${trimmed}\n`;
  const blockHash = await sha256Hex(trimmed);
  if (contentHashes.has(blockHash)) {
    // Already present somewhere in this field — skip silent duplicate.
    return null;
  }
  contentHashes.add(blockHash);

  const base = existing ?? "";

  // Find an existing block carrying the same markerKey and replace it in place.
  // The block ends at the next `<!-- ai-merge:` marker OR end of document.
  const escaped = markerKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRegex = new RegExp(
    `<!--\\s*ai-merge:[^>]*${escaped}[^>]*-->[\\s\\S]*?(?=\\n*<!--\\s*ai-merge:|$)`,
    "m",
  );

  if (blockRegex.test(base)) {
    return base.replace(blockRegex, `${block}\n`).trimEnd() + "\n";
  }

  const sep = base.trimEnd().length > 0 ? "\n\n" : "";
  return `${base.trimEnd()}${sep}${block}`;
}

/**
 * Pre-compute the content hashes already present in a report field by walking
 * its existing `<!-- ai-merge: ... -->` blocks. Lets `upsertSnippet` reject
 * cross-finding duplicates without re-scanning the full document each call.
 */
async function collectExistingHashes(text: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  if (!text) return out;
  const re = /<!--\s*ai-merge:[^>]*-->\s*\n([\s\S]*?)(?=\n*<!--\s*ai-merge:|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const body = (m[1] || "").trim();
    if (body) out.add(await sha256Hex(body));
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { ai_report_id, finding_id, action, note, reverts_resolution_id, source_resolution_id } = body;

    if (!ai_report_id || typeof ai_report_id !== "string") {
      return jsonResponse({ error: "ai_report_id is required" }, 400);
    }
    if (!finding_id || typeof finding_id !== "string") {
      return jsonResponse({ error: "finding_id is required" }, 400);
    }
    if (!VALID_ACTIONS.includes(action)) {
      return jsonResponse({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }, 400);
    }
    if (action === "reverted" && !reverts_resolution_id) {
      return jsonResponse({ error: "reverts_resolution_id is required when action=reverted" }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Load the report row + check ownership
    const { data: report, error: repErr } = await admin
      .from("ai_reports")
      .select("id, case_id, internal_report, client_report, draft_email, section_compliance")
      .eq("id", ai_report_id)
      .maybeSingle();

    if (repErr || !report) {
      return jsonResponse({ error: "ai_report not found" }, 404);
    }

    const { data: caseRow, error: caseErr } = await admin
      .from("cases")
      .select("id, conveyancer_id, case_reference")
      .eq("id", report.case_id)
      .maybeSingle();

    if (caseErr || !caseRow) {
      return jsonResponse({ error: "Case not found" }, 404);
    }

    // Check authorisation: case owner OR admin role
    let authorised = caseRow.conveyancer_id === user.id;
    if (!authorised) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      authorised = !!roleRow;
    }
    if (!authorised) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const compliance = (report.section_compliance ?? {}) as any;
    const findings: any[] = Array.isArray(compliance.findings) ? compliance.findings : [];
    const resolutions: any[] = Array.isArray(compliance.resolutions) ? compliance.resolutions : [];

    const finding = findings.find((f) => f.id === finding_id);
    if (!finding) {
      return jsonResponse({ error: "finding_id not present on this report" }, 404);
    }

    if (action === "reverted") {
      const target = resolutions.find((r) => r.id === reverts_resolution_id);
      if (!target) {
        return jsonResponse({ error: "reverts_resolution_id not found in chain" }, 404);
      }
      if (target.finding_id !== finding_id) {
        return jsonResponse({ error: "reverts_resolution_id belongs to a different finding" }, 400);
      }
    }

    // Reviewer profile (for audit_log enrichment)
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, position")
      .eq("user_id", user.id)
      .maybeSingle();

    // ── Action-specific work (AI draft, auto-merge, revert restoration) ───────
    let aiOutput: unknown = null;
    let mergedFields: string[] = [];
    let mergeSourceResolutionId: string | null = null;
    let priorState: { internal_report: string | null; client_report: string | null; draft_email: string | null } | null = null;
    let reportFieldUpdates: Record<string, string | null> | null = null;
    /** Tracker side-effects produced by `promoted` / `reverted`-of-`promoted`. */
    let createdEnquiryItemId: string | null = null;
    let withdrewEnquiryItemId: string | null = null;
    let promotionSkippedReason: string | null = null;
    let promotionRoundNumber: number | null = null;

    if (action === "ai_addressed") {
      const reportText = report.internal_report || report.client_report || "";

      // Build a strictly case-scoped evidence corpus. This serves two purposes:
      //  (1) the model receives real transactions to quote verbatim instead of
      //      being pressured to invent them by the anti-bundling rule, and
      //  (2) the same corpus is used to validate the model's output below so
      //      any quoted name/date/amount that is NOT in this case's evidence
      //      is quarantined before it can be merged.
      const evidenceCorpus = await buildCaseEvidenceCorpus(admin, report.case_id);

      const draft = await callAiAddress(
        reportText,
        {
          section: finding.section || finding.section_id || "Unknown",
          reason: finding.reason || "",
          expectedBehaviour: finding.expectedBehaviour || "",
        },
        evidenceCorpus,
        report.case_id,
      ) as Record<string, unknown>;

      // Validate the drafted enquiry against the combined corpus + the
      // report excerpt the model was shown. Any unverified token (name,
      // date, amount) means the model has either hallucinated or carried
      // data over from another case — both are unsafe to merge.
      const draftEnquiry = typeof draft?.added_enquiry === "string" ? draft.added_enquiry : "";
      const draftAmendment = typeof draft?.report_amendment === "string" ? draft.report_amendment : "";
      const combinedDraft = `${draftEnquiry}\n${draftAmendment}`;
      const combinedEvidence = `${evidenceCorpus}\n${reportText}`;

      const validation = combinedDraft.trim()
        ? validateAgainstEvidence(combinedDraft, combinedEvidence)
        : { ok: true, unverifiedAmounts: [], unverifiedDates: [], unverifiedProperNouns: [] };

      if (!validation.ok) {
        console.warn(
          `[sow-finding-resolution] QUARANTINED ungrounded output for case=${report.case_id} finding=${finding_id}`,
          {
            unverified_names: validation.unverifiedProperNouns,
            unverified_amounts: validation.unverifiedAmounts,
            unverified_dates: validation.unverifiedDates,
          },
        );
        // Replace the drafted content with safe placeholders and attach a
        // quarantine record. The reviewer sees an honest "blocked — request
        // further evidence" outcome instead of fabricated transaction text.
        aiOutput = {
          added_enquiry: "",
          report_amendment: "",
          decision_log_entry:
            "AI draft was quarantined: it contained names, dates or amounts that could not be verified against this case's evidence. Further bank statement extraction is required before a verbatim enquiry can be drafted.",
          quarantine: {
            status: "ungrounded_output",
            reason: validation.reason,
            unverified_names: validation.unverifiedProperNouns,
            unverified_amounts: validation.unverifiedAmounts,
            unverified_dates: validation.unverifiedDates,
            original_added_enquiry: draftEnquiry,
            original_report_amendment: draftAmendment,
          },
        };
      } else {
        aiOutput = draft;
      }
    }

    if (action === "ai_merged") {
      // Locate the source AI draft. Use explicit source_resolution_id if provided,
      // otherwise use the latest non-reverted ai_addressed for this finding.
      let source: any | null = null;
      if (source_resolution_id) {
        source = resolutions.find(
          (r) => r.id === source_resolution_id && r.finding_id === finding_id && r.action === "ai_addressed",
        ) ?? null;
        if (!source) {
          return jsonResponse({ error: "source_resolution_id not found or not an ai_addressed resolution for this finding" }, 400);
        }
      } else {
        const latest = latestActiveResolution(finding_id, resolutions);
        if (!latest || latest.action !== "ai_addressed") {
          return jsonResponse({
            error: "No active ai_addressed draft to merge for this finding. Run 'Ask AI' first.",
          }, 409);
        }
        source = latest;
      }

      const draft = (source.ai_output ?? {}) as Record<string, unknown>;
      if (typeof draft.error === "string" && draft.error) {
        return jsonResponse({ error: `Source AI draft has an error and cannot be merged: ${draft.error}` }, 409);
      }
      // Refuse to merge a draft that was previously quarantined as ungrounded.
      if (draft.quarantine && typeof draft.quarantine === "object") {
        return jsonResponse({
          error:
            "This AI draft was quarantined as ungrounded against the case evidence and cannot be merged. Run 'Ask AI' again after additional evidence has been ingested.",
          quarantine: draft.quarantine,
        }, 409);
      }

      const reportAmend = typeof draft.report_amendment === "string" ? draft.report_amendment : "";
      const addedEnquiry = typeof draft.added_enquiry === "string" ? draft.added_enquiry : "";
      const sectionLabel = finding.section || finding.section_id || "Unknown section";

      // Defence-in-depth: re-validate the draft against the case evidence
      // corpus at merge time. This catches drafts created before the
      // grounded-output validator was deployed AND any drift between draft
      // creation and merge.
      const mergeCorpus = await buildCaseEvidenceCorpus(admin, report.case_id);
      const mergeReportText = (report.internal_report as string | null) || (report.client_report as string | null) || "";
      const mergeValidation = validateAgainstEvidence(
        `${addedEnquiry}\n${reportAmend}`,
        `${mergeCorpus}\n${mergeReportText}`,
      );
      if (!mergeValidation.ok) {
        console.warn(
          `[sow-finding-resolution] BLOCKED merge of ungrounded draft for case=${report.case_id} finding=${finding_id}`,
          {
            unverified_names: mergeValidation.unverifiedProperNouns,
            unverified_amounts: mergeValidation.unverifiedAmounts,
            unverified_dates: mergeValidation.unverifiedDates,
          },
        );
        return jsonResponse({
          error:
            "Merge blocked: the AI draft contains names, dates or amounts that are not present in this case's evidence. This is a confidentiality safeguard.",
          quarantine: {
            status: "ungrounded_output",
            reason: mergeValidation.reason,
            unverified_names: mergeValidation.unverifiedProperNouns,
            unverified_amounts: mergeValidation.unverifiedAmounts,
            unverified_dates: mergeValidation.unverifiedDates,
          },
        }, 409);
      }

      if (!reportAmend.trim() && !addedEnquiry.trim()) {
        return jsonResponse({ error: "AI draft contains no content to merge." }, 409);
      }

      // Snapshot prior text BEFORE mutating, so revert is deterministic.
      priorState = {
        internal_report: (report.internal_report as string | null) ?? null,
        client_report: (report.client_report as string | null) ?? null,
        draft_email: (report.draft_email as string | null) ?? null,
      };

      const updates: Record<string, string | null> = {};
      // Marker keys identify the *finding* — re-merging the same finding replaces
      // the previous block in place rather than appending a duplicate.
      const reportMarkerKey = `finding=${finding_id}`;
      const enquiryMarkerKey = `enquiry-for=${finding_id}`;
      const header = `<!-- ai-merge: ${reportMarkerKey} section="${sectionLabel.replace(/"/g, "'")}" -->\n## Addendum — ${sectionLabel}`;
      const enquiryHeader = `<!-- ai-merge: ${enquiryMarkerKey} section="${sectionLabel.replace(/"/g, "'")}" -->\n### Additional enquiry — ${sectionLabel}`;

      const internalHashes = await collectExistingHashes(priorState.internal_report);
      const clientHashes = await collectExistingHashes(priorState.client_report);
      const emailHashes = await collectExistingHashes(priorState.draft_email);

      const newInternal = await upsertSnippet(priorState.internal_report, reportAmend, header, reportMarkerKey, internalHashes);
      if (newInternal !== null) {
        updates.internal_report = newInternal;
        mergedFields.push("internal_report");
      }
      const newClient = await upsertSnippet(priorState.client_report, reportAmend, header, reportMarkerKey, clientHashes);
      if (newClient !== null) {
        updates.client_report = newClient;
        mergedFields.push("client_report");
      }
      const newEmail = await upsertSnippet(priorState.draft_email, addedEnquiry, enquiryHeader, enquiryMarkerKey, emailHashes);
      if (newEmail !== null) {
        updates.draft_email = newEmail;
        mergedFields.push("draft_email");
      }

      if (mergedFields.length === 0) {
        return jsonResponse({ error: "Nothing to merge — all target fields rejected the snippet." }, 409);
      }

      reportFieldUpdates = updates;
      mergeSourceResolutionId = source.id;
    }

    // Allocate the resolution id early so we can reference it from any
    // tracker rows we create as a side-effect of `promoted`.
    const resolutionId = crypto.randomUUID();
    const resolvedAt = new Date().toISOString();

    // ── Tracker side-effect: insert/refresh an enquiry_items row ──────────────
    // Used by both `promoted` and `ai_merged`. Idempotent on
    // (case_id, agent_type, source_finding_id): if an active row already exists
    // for this finding it is refreshed in place (text/category/evidence) so a
    // re-merge or re-promote never creates duplicates and never overwrites
    // reviewer-touched fields (status, replies, evidence).
    const upsertTrackerItem = async (params: {
      sourceTag: "promoted_finding" | "merged_finding";
      draftedText: string;
    }): Promise<{ itemId: string; roundNumber: number; refreshed: boolean }> => {
      const { categoryToSection, SECTION_LABELS } = await import("../_shared/enquirySectionMap.ts");

      const sectionLabel =
        (finding.section as string) || (finding.section_id as string) || "Unknown section";
      const sectionId = categoryToSection(sectionLabel);
      const category = SECTION_LABELS[sectionId] || sectionLabel;

      // Decision-Log-only findings are supervisory artefacts (Section 6 of
      // the internal report). They MUST NOT be seeded as client-facing
      // enquiries in the tracker. Caller treats this as a no-op refresh.
      if (sectionId === "decision_log_only") {
        return { itemId: "", roundNumber: 0, refreshed: false, skipped: true } as any;
      }
      const issueSummary = (finding.reason as string) || sectionLabel;
      // Section Compliance findings carry `expectedBehaviour` (what the report
      // should have included). Use it as the tracker's "Evidence Required" so
      // promoted/merged rows show the reviewer what to ask the client for.
      // Always sanitise: strip internal `<!-- ai-merge: ... -->` plumbing
      // markers (they leak in when draftedText was lifted from a merged email
      // block) and guarantee a non-empty value so the UI block renders for
      // every enquiry.
      const cleanedDraftedText = stripAiMergeMarkers(params.draftedText);
      const expectedEvidence =
        ((finding as any).expected_evidence as string | undefined)?.trim() ||
        ((finding as any).expectedBehaviour as string | undefined)?.trim() ||
        "";
      const evidenceRequired =
        stripAiMergeMarkers(expectedEvidence) ||
        cleanedDraftedText ||
        issueSummary;

      // Look for an existing active row for this finding.
      const { data: existingItems } = await admin
        .from("enquiry_items")
        .select("id, round_id")
        .eq("case_id", report.case_id)
        .eq("agent_type", "sow")
        .eq("source_finding_id", finding_id)
        .neq("status", "not_applicable")
        .limit(1);

      if (existingItems && existingItems.length > 0) {
        // Refresh-in-place. Never touch reviewer-managed fields.
        const existing = existingItems[0];
        const { data: roundRow } = await admin
          .from("enquiry_rounds")
          .select("round_number")
          .eq("id", existing.round_id)
          .maybeSingle();
        await admin
          .from("enquiry_items")
          .update({
            original_enquiry_text: cleanedDraftedText,
            issue_summary: issueSummary,
            category,
            evidence_required: evidenceRequired,
            source_resolution_id: resolutionId,
            date_last_updated: new Date().toISOString(),
          })
          .eq("id", existing.id);
        return {
          itemId: existing.id,
          roundNumber: roundRow?.round_number ?? 1,
          refreshed: true,
        };
      }

      // Find or create the target round.
      const { data: rounds } = await admin
        .from("enquiry_rounds")
        .select("id, round_number")
        .eq("case_id", report.case_id)
        .eq("agent_type", "sow")
        .order("round_number", { ascending: false })
        .limit(1);

      let targetRoundId: string | null = rounds?.[0]?.id ?? null;
      let targetRoundNumber: number = rounds?.[0]?.round_number ?? 1;

      if (!targetRoundId) {
        const { data: newRound, error: rndErr } = await admin
          .from("enquiry_rounds")
          .insert({
            case_id: report.case_id,
            agent_type: "sow",
            round_number: 1,
            status: "open",
            ai_run_id: (report as any).ai_run_id ?? null,
            draft_email: report.draft_email ?? null,
            internal_report: report.internal_report ?? null,
            outstanding_summary:
              params.sourceTag === "merged_finding"
                ? "Round 1 created from a merged compliance finding."
                : "Round 1 created from a promoted compliance finding.",
            created_by: user.id,
          })
          .select("id, round_number")
          .single();
        if (rndErr || !newRound) {
          throw new Error(`Failed to create round: ${rndErr?.message ?? "unknown"}`);
        }
        targetRoundId = newRound.id;
        targetRoundNumber = newRound.round_number;
      }

      // Compute next enquiry_number within this round.
      const { data: existingNums } = await admin
        .from("enquiry_items")
        .select("enquiry_number")
        .eq("case_id", report.case_id)
        .eq("agent_type", "sow")
        .eq("round_id", targetRoundId);
      const maxNum = (existingNums ?? []).reduce((m, r) => {
        const n = parseInt(String(r.enquiry_number).replace(/\D/g, ""), 10);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      const nextNum = String(maxNum + 1);

      const newItemId = crypto.randomUUID();
      const { error: insErr } = await admin
        .from("enquiry_items")
        .insert({
          id: newItemId,
          case_id: report.case_id,
          round_id: targetRoundId,
          agent_type: "sow",
          enquiry_number: nextNum,
          category,
          issue_summary: issueSummary,
          original_enquiry_text: cleanedDraftedText,
          evidence_required: evidenceRequired,
          status: "open",
          next_action: "raise_further",
          source: params.sourceTag,
          source_finding_id: finding_id,
          source_resolution_id: resolutionId,
        });
      if (insErr) {
        throw new Error(`Failed to create enquiry item: ${insErr.message}`);
      }
      return { itemId: newItemId, roundNumber: targetRoundNumber, refreshed: false };
    };

    // ── Promote a finding into the Enquiry Tracker ────────────────────────────
    if (action === "promoted") {
      const sectionLabel =
        (finding.section as string) || (finding.section_id as string) || "Unknown section";
      const draftedText = (note && note.trim().length > 0)
        ? note.trim()
        : `${finding.expectedBehaviour || ""}\n\n${finding.reason || ""}`.trim()
          || `Promoted from compliance finding in section: ${sectionLabel}`;

      try {
        const tracker = await upsertTrackerItem({
          sourceTag: "promoted_finding",
          draftedText,
        });
        if ((tracker as any).skipped) {
          // Decision-Log-only finding — no tracker row created by design.
          promotionSkippedReason = "decision_log_only";
        } else {
          createdEnquiryItemId = tracker.itemId;
          promotionRoundNumber = tracker.roundNumber;
          if (tracker.refreshed) {
            // Existing row was refreshed rather than newly created — flag for UI.
            promotionSkippedReason = "already_promoted";
          }
        }
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }

    // ── Merge → also create/refresh tracker row when there's an enquiry to ask ─
    // Mirrors the Promote flow so reviewers don't have to click two buttons.
    // Skipped silently when the AI draft has no `added_enquiry` (report-only fix).
    if (action === "ai_merged") {
      const addedEnquiryForTracker = mergedFields.includes("draft_email")
        ? // The merged email block came from the AI draft's `added_enquiry`.
          (() => {
            const sourceRes = resolutions.find((r) => r.id === mergeSourceResolutionId);
            const draft = (sourceRes?.ai_output ?? {}) as Record<string, unknown>;
            const t = typeof draft.added_enquiry === "string" ? draft.added_enquiry.trim() : "";
            return t;
          })()
        : "";

      if (addedEnquiryForTracker.length > 0) {
        try {
          const tracker = await upsertTrackerItem({
            sourceTag: "merged_finding",
            draftedText: addedEnquiryForTracker,
          });
          if ((tracker as any).skipped) {
            promotionSkippedReason = "decision_log_only";
          } else {
            createdEnquiryItemId = tracker.itemId;
            promotionRoundNumber = tracker.roundNumber;
          }
        } catch (e) {
          // Non-fatal: the report-text merge already succeeded. Surface a soft
          // warning rather than failing the whole resolution.
          console.warn(
            "[sow-finding-resolution] tracker upsert failed for ai_merged:",
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    }

    if (action === "reverted") {
      const target = resolutions.find((r) => r.id === reverts_resolution_id);
      if (target?.action === "ai_merged" && target.prior_state) {
        const prior = target.prior_state as Record<string, unknown>;
        // Only restore fields that were captured (skip nulls so we don't accidentally null an unrelated field).
        const restore: Record<string, string | null> = {};
        if ("internal_report" in prior) restore.internal_report = (prior.internal_report as string | null) ?? null;
        if ("client_report" in prior) restore.client_report = (prior.client_report as string | null) ?? null;
        if ("draft_email" in prior) restore.draft_email = (prior.draft_email as string | null) ?? null;
        if (Object.keys(restore).length > 0) {
          reportFieldUpdates = restore;
        }
      }
      // Reverting a `promoted` OR `ai_merged` resolution: soft-cancel the linked
      // tracker item unless the reviewer has already touched it (reply / evidence /
      // status change). For ai_merged this runs in addition to restoring the
      // report-text snapshot above, so the report and the tracker stay in sync.
      if (target?.action === "promoted" || target?.action === "ai_merged") {
        const { data: linkedItems } = await admin
          .from("enquiry_items")
          .select("id, status, reply_summary, evidence_received, who_replied")
          .eq("case_id", report.case_id)
          .eq("agent_type", "sow")
          .eq("source_resolution_id", target.id)
          .limit(1);
        const item = linkedItems?.[0];
        if (item) {
          const userTouched = !!(item.reply_summary || item.evidence_received || item.who_replied)
            || (item.status && item.status !== "open");
          if (!userTouched) {
            await admin
              .from("enquiry_items")
              .update({ status: "not_applicable", date_last_updated: new Date().toISOString() })
              .eq("id", item.id);
            withdrewEnquiryItemId = item.id;
          }
        }
      }
    }

    const newResolution: Record<string, unknown> = {
      id: resolutionId,
      finding_id,
      action,
      reverts_resolution_id: action === "reverted" ? reverts_resolution_id : null,
      note: note ?? null,
      ai_output: aiOutput,
      resolved_by: user.id,
      resolved_by_name: profile?.full_name ?? null,
      resolved_at: resolvedAt,
    };

    if (createdEnquiryItemId) newResolution.enquiry_item_id = createdEnquiryItemId;
    if (promotionRoundNumber !== null) newResolution.enquiry_round_number = promotionRoundNumber;
    if (promotionSkippedReason) newResolution.promotion_skipped_reason = promotionSkippedReason;
    if (withdrewEnquiryItemId) newResolution.withdrew_enquiry_item_id = withdrewEnquiryItemId;


    if (action === "ai_merged") {
      newResolution.merge_source_resolution_id = mergeSourceResolutionId;
      newResolution.merged_fields = mergedFields;
      newResolution.prior_state = priorState;
    }

    const updatedCompliance = {
      ...compliance,
      findings,
      resolutions: [...resolutions, newResolution],
    };

    // Single UPDATE for compliance + (optionally) report fields. The
    // log_ai_report_modification trigger will fire and emit ai_report_modified.
    const updatePayload: Record<string, unknown> = { section_compliance: updatedCompliance };
    if (reportFieldUpdates) {
      Object.assign(updatePayload, reportFieldUpdates);
    }

    const { error: updErr } = await admin
      .from("ai_reports")
      .update(updatePayload)
      .eq("id", ai_report_id);

    if (updErr) {
      console.error("[sow-finding-resolution] Update failed:", updErr.message);
      return jsonResponse({ error: "Failed to persist resolution" }, 500);
    }

    // Append finding-scoped audit_log row. The DB trigger separately logs the
    // generic ai_report_modified event when report fields change.
    const eventType = action === "ai_merged"
      ? "section_finding_ai_merged"
      : "section_finding_resolved";

    const { error: auditErr } = await admin.from("audit_log").insert({
      case_reference: caseRow.case_reference || null,
      user_id: user.id,
      user_name: profile?.full_name ?? user.email ?? "Unknown",
      user_email: profile?.email ?? user.email ?? "",
      user_position: profile?.position ?? "",
      event_type: eventType,
      metadata: {
        ai_report_id,
        case_id: report.case_id,
        finding_id,
        section_id: finding.section_id ?? null,
        section: finding.section ?? null,
        severity: finding.severity ?? null,
        action,
        resolution_id: resolutionId,
        reverts_resolution_id: action === "reverted" ? reverts_resolution_id : null,
        merge_source_resolution_id: mergeSourceResolutionId,
        merged_fields: mergedFields.length > 0 ? mergedFields : null,
        report_fields_restored: action === "reverted" && reportFieldUpdates
          ? Object.keys(reportFieldUpdates)
          : null,
        note: note ?? null,
        ai_output_present: !!aiOutput,
        enquiry_item_id: createdEnquiryItemId,
        enquiry_round_number: promotionRoundNumber,
        promotion_skipped_reason: promotionSkippedReason,
        withdrew_enquiry_item_id: withdrewEnquiryItemId,
      },
    });

    if (auditErr) {
      console.warn("[sow-finding-resolution] audit_log insert failed:", auditErr.message);
      // Resolution still persisted — surface a soft warning but do not fail the call.
    }

    // Return the updated report fields so the client can refresh its in-memory
    // view without a full refetch round-trip.
    let updatedReportFields: Record<string, string | null> | null = null;
    if (reportFieldUpdates) {
      updatedReportFields = {};
      if ("internal_report" in reportFieldUpdates) updatedReportFields.internal_report = reportFieldUpdates.internal_report;
      if ("client_report" in reportFieldUpdates) updatedReportFields.client_report = reportFieldUpdates.client_report;
      if ("draft_email" in reportFieldUpdates) updatedReportFields.draft_email = reportFieldUpdates.draft_email;
    }

    return jsonResponse({
      ok: true,
      resolution: newResolution,
      compliance: updatedCompliance,
      report_fields: updatedReportFields,
    });
  } catch (err) {
    console.error("[sow-finding-resolution] Error:", err);
    return jsonResponse({ error: "Internal error", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});

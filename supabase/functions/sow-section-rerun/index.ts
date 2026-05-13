/**
 * sow-section-rerun
 *
 * Targeted partial re-analysis of a Olimey AI report. For each affected
 * report section (computed from the categories of resolved enquiries in a
 * round), this function:
 *   1. Loads the latest ai_reports row for the case.
 *   2. Verifies it is still latest (Stale Guard) — aborts if a full re-run
 *      has happened in parallel.
 *   3. For each section: extracts the current section text, asks the AI to
 *      rewrite ONLY that section in light of the new evidence, and splices
 *      the rewritten section back into internal_report and client_report.
 *   4. Appends a Decision Log entry per refreshed section citing the
 *      triggering reply files.
 *   5. Writes back to ai_reports and emits an audit log entry.
 *
 * Token budget per section: ~5–8K input vs ~80–150K for a full re-run.
 *
 * Triggered asynchronously by ingest-replies via EdgeRuntime.waitUntil — the
 * caller does NOT block on this function. Errors are logged but do not fail
 * the enquiry-reply ingestion.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { extractSection, replaceSection, appendDecisionLogEntry } from "../_shared/sectionSplicer.ts";
import { SectionId, SECTION_LABELS } from "../_shared/enquirySectionMap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({
  case_id: z.string().uuid(),
  agent_type: z.enum(["sow"]),
  ai_report_id: z.string().uuid(),
  round_id: z.string().uuid(),
  round_number: z.number().int().positive(),
  affected_sections: z.array(z.string()).min(1),
  // Triggering reply files (used only for the Decision Log citation)
  reply_files: z.array(z.object({
    file_name: z.string(),
    enquiry_numbers: z.array(z.string()),
    auto_note: z.string().optional(),
  })),
});

const MAX_SECTION_INPUT_CHARS = 8_000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return jsonResponse({ error: "AI gateway not configured" }, 500);
    }

    // Service-role client only — this function runs in the background and is
    // triggered by another edge function, so it does not enforce user JWT here.
    // The Stale Guard plus audit logging provides the integrity backstop.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const rawBody = await req.json();
    const parseResult = requestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return jsonResponse(
        { error: `Invalid input: ${parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")}` },
        400,
      );
    }

    const { case_id, agent_type, ai_report_id, round_id, round_number, affected_sections, reply_files } = parseResult.data;

    // ── Stale Guard: confirm this ai_report is still the latest for the case.
    const { data: latestReport, error: latestErr } = await adminClient
      .from("ai_reports")
      .select("id, internal_report, client_report, modification_count, created_at")
      .eq("case_id", case_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestErr || !latestReport) {
      console.error("[section-rerun] could not load latest ai_report:", latestErr);
      return jsonResponse({ error: "No ai_report found for case" }, 404);
    }

    if (latestReport.id !== ai_report_id) {
      console.log(`[section-rerun] STALE_GUARD: ai_report ${ai_report_id} is no longer latest (latest is ${latestReport.id}). Aborting splice.`);
      return jsonResponse({
        success: false,
        reason: "stale_report",
        message: "A newer report has been generated; section refresh skipped.",
      });
    }

    let internalReport: string = latestReport.internal_report || "";
    let clientReport: string = latestReport.client_report || "";

    if (!internalReport.trim() && !clientReport.trim()) {
      return jsonResponse({ error: "Latest ai_report has no body to refresh" }, 400);
    }

    // Fetch the resolved enquiry items for this round so the AI sees the new
    // evidence summaries when rewriting each section.
    const { data: roundItems, error: itemsErr } = await adminClient
      .from("enquiry_items")
      .select("enquiry_number, category, issue_summary, evidence_received, reply_summary, status, who_replied")
      .eq("case_id", case_id)
      .eq("agent_type", agent_type)
      .eq("round_id", round_id);

    if (itemsErr) {
      console.error("[section-rerun] failed to fetch round items:", itemsErr);
      return jsonResponse({ error: "Failed to load round items" }, 500);
    }

    const refreshedSections: SectionId[] = [];
    const skippedSections: SectionId[] = [];
    const decisionLogEntries: string[] = [];

    for (const sectionRaw of affected_sections) {
      const sectionId = sectionRaw as SectionId;
      const label = SECTION_LABELS[sectionId] || sectionId;

      const internalExtract = extractSection(internalReport, sectionId);
      if (!internalExtract) {
        console.log(`[section-rerun] section "${sectionId}" not found in internal_report — skipping`);
        skippedSections.push(sectionId);
        continue;
      }

      const clientExtract = extractSection(clientReport, sectionId);

      const evidenceContext = (roundItems || [])
        .map((it: any) =>
          `- [${it.enquiry_number}] ${it.issue_summary}\n` +
          `  Status now: ${it.status}\n` +
          `  Reply: ${it.reply_summary || "(none)"}\n` +
          `  Evidence received: ${it.evidence_received || "(none)"}\n` +
          `  Who replied: ${it.who_replied || "(unspecified)"}`,
        )
        .join("\n\n");

      const filesContext = reply_files
        .map(f => `- ${f.file_name}${f.auto_note ? ` — ${f.auto_note}` : ""} (mapped to enquiries ${f.enquiry_numbers.join(", ")})`)
        .join("\n");

      const systemPrompt = `You are a senior UK conveyancing compliance reviewer refreshing a single named section of a Olimey AI report.

CRITICAL RULES:
1. Rewrite ONLY the body of the named section. Do NOT include the section heading in your output — the system will preserve the original heading.
2. Preserve the section's structure (sub-headings, tables, bullet structure) where it remains relevant.
3. Update only what the new evidence actually changes. Do not invent new findings unrelated to the new evidence.
4. Maintain UK English, the existing professional tone, and proportionate evidential language. Avoid prosecutorial wording.
5. If a previous concern is now resolved, state so explicitly with a citation to the reply file (e.g. "Resolved by Gift_Letter_Adebayo.pdf").
6. If a previous concern is partially resolved, mark it Amber and explain what remains outstanding.
7. Do NOT touch other sections of the report — your output replaces only this section's body.
8. Do not produce a Decision Log entry — that is added by the system.

DOMAIN CONTEXT:
- Section being refreshed: ${label}
- Trigger: Enquiry Round ${round_number} — new replies received and confirmed.`;

      const userPrompt = `EXISTING SECTION BODY (to be rewritten):
---
${internalExtract.body.slice(0, MAX_SECTION_INPUT_CHARS)}
---

NEW EVIDENCE FROM ENQUIRY ROUND ${round_number}:
${evidenceContext || "(no new evidence summaries available)"}

REPLY FILES RELIED ON:
${filesContext || "(no files listed)"}

Rewrite the section body in light of the new evidence. Output the rewritten body only — no heading, no Decision Log entry.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
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

      if (!aiResponse.ok) {
        const errBody = await aiResponse.text().catch(() => "");
        console.error(`[section-rerun] AI error for section ${sectionId}:`, aiResponse.status, errBody.slice(0, 300));
        skippedSections.push(sectionId);
        continue;
      }

      const aiData = await aiResponse.json();
      if (aiData.usage) {
        console.log(
          `[TOKEN_USAGE] sow-section-rerun | case=${case_id} | section=${sectionId} | ` +
          `prompt_tokens=${aiData.usage.prompt_tokens} | completion_tokens=${aiData.usage.completion_tokens} | total_tokens=${aiData.usage.total_tokens}`,
        );
      }

      const newBody: string | undefined = aiData.choices?.[0]?.message?.content;
      if (!newBody || !newBody.trim()) {
        console.warn(`[section-rerun] empty rewrite for section ${sectionId} — skipping`);
        skippedSections.push(sectionId);
        continue;
      }

      // Splice the rewritten body back into internal_report.
      const updatedInternal = replaceSection(internalReport, sectionId, newBody);
      if (!updatedInternal) {
        console.warn(`[section-rerun] splice failed for section ${sectionId} (heading no longer locatable) — skipping`);
        skippedSections.push(sectionId);
        continue;
      }
      internalReport = updatedInternal;

      // Mirror the splice into client_report if that section also exists there.
      if (clientExtract) {
        const updatedClient = replaceSection(clientReport, sectionId, newBody);
        if (updatedClient) {
          clientReport = updatedClient;
        }
      }

      refreshedSections.push(sectionId);

      // Build the Decision Log entry for this section.
      const fileCitations = reply_files
        .filter(f => f.enquiry_numbers.length > 0)
        .map(f => `${f.file_name} (enquiries ${f.enquiry_numbers.join(", ")})`)
        .join("; ");

      decisionLogEntries.push(
        `**${new Date().toISOString().slice(0, 10)} — ${label} refreshed** ` +
        `(Enquiry Round ${round_number}). ` +
        `Evidence relied on: ${fileCitations || "(see round items)"}. ` +
        `Mechanism: targeted section re-analysis (sow-section-rerun).`,
      );
    }

    // Append all Decision Log entries in a single splice.
    if (decisionLogEntries.length > 0) {
      const combined = decisionLogEntries.join("\n\n");
      internalReport = appendDecisionLogEntry(internalReport, combined);
    }

    // ── Re-check Stale Guard immediately before write ──
    const { data: recheck } = await adminClient
      .from("ai_reports")
      .select("id, modification_count")
      .eq("id", ai_report_id)
      .single();

    if (!recheck) {
      console.warn("[section-rerun] STALE_GUARD: report disappeared between read and write — aborting");
      return jsonResponse({ success: false, reason: "report_disappeared" });
    }

    if (recheck.modification_count !== latestReport.modification_count) {
      console.warn(
        `[section-rerun] STALE_GUARD: modification_count changed from ${latestReport.modification_count} to ${recheck.modification_count} — aborting to avoid overwriting a concurrent change`,
      );
      return jsonResponse({ success: false, reason: "concurrent_modification" });
    }

    if (refreshedSections.length === 0) {
      console.log("[section-rerun] no sections successfully refreshed; nothing to write");
      return jsonResponse({
        success: true,
        refreshed_sections: [],
        skipped_sections: skippedSections,
      });
    }

    const { error: updateError } = await adminClient
      .from("ai_reports")
      .update({
        internal_report: internalReport,
        client_report: clientReport,
        modification_count: (latestReport.modification_count || 0) + 1,
        modified_at: new Date().toISOString(),
      })
      .eq("id", ai_report_id)
      .eq("modification_count", latestReport.modification_count); // optimistic lock

    if (updateError) {
      console.error("[section-rerun] failed to write updated report:", updateError);
      return jsonResponse({ error: "Failed to persist refreshed sections" }, 500);
    }

    // ── Audit log ──
    const { data: caseRow } = await adminClient
      .from("cases")
      .select("case_reference, conveyancer_id")
      .eq("id", case_id)
      .single();

    const { data: profile } = caseRow?.conveyancer_id
      ? await adminClient
          .from("profiles")
          .select("full_name, email, position")
          .eq("user_id", caseRow.conveyancer_id)
          .single()
      : { data: null };

    await adminClient.from("audit_log").insert({
      case_reference: caseRow?.case_reference || null,
      user_id: caseRow?.conveyancer_id || null,
      user_name: profile?.full_name || "system",
      user_email: profile?.email || "system",
      user_position: profile?.position || "",
      event_type: "ai_report_section_refreshed",
      metadata: {
        agent_type,
        ai_report_id,
        round_id,
        round_number,
        refreshed_sections: refreshedSections,
        skipped_sections: skippedSections,
        reply_files: reply_files.map(f => f.file_name),
      },
    });

    console.log(`[section-rerun] DONE case=${case_id} refreshed=${refreshedSections.length} skipped=${skippedSections.length}`);

    return jsonResponse({
      success: true,
      refreshed_sections: refreshedSections,
      skipped_sections: skippedSections,
    });
  } catch (e) {
    console.error("[section-rerun] unhandled error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

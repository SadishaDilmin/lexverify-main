/**
 * seed-enquiries-from-report
 *
 * Seeds Round 1 of the Enquiry Tracker from a finalised Olimey AI report's
 * `draft_email`. Idempotent — if Round 1 already exists for the case+agent,
 * the function is a no-op and returns the existing round summary.
 *
 * Triggered by:
 *   - The Enquiries panel when a user opens a case that has a completed AI
 *     report but an empty tracker (one-click backfill).
 *   - The post-finalisation flow in `useSoWSubmit` (auto-seed once a fresh
 *     report lands).
 *
 * Auth: requires a logged-in user with access to the case (verified through the
 * user-scoped Supabase client). All writes use the service role to bypass RLS
 * once authorisation is established.
 *
 * Behaviour:
 *   1. Verify case access via the user client.
 *   2. Find the latest `ai_reports` row (or the one referenced by ai_report_id).
 *   3. Refuse to seed if `finalisation_status` is not in {fully_consolidated,
 *      completed} — partial reports must not produce phantom enquiries.
 *   4. If `enquiry_rounds` already has any rows for this case+agent, return
 *      the existing latest round (no-op).
 *   5. Parse `draft_email` into structured items; abort gracefully if zero
 *      items found (returns `seeded: false, reason: "no_enquiries_in_draft"`).
 *   6. Insert one `enquiry_rounds` row (round_number = 1, status = "open",
 *      ai_run_id linked back) and one `enquiry_items` row per parsed item.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { parseDraftEmailEnquiries, stripAiMergeMarkers } from "../_shared/draftEmailEnquiryParser.ts";
import { categoryToSection } from "../_shared/enquirySectionMap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const bodySchema = z.object({
  case_id: z.string().uuid(),
  agent_type: z.enum(["sow"]).default("sow"),
  ai_report_id: z.string().uuid().optional(),
  /** When true, ignore any existing rounds and add a fresh round (used after
   *  a user explicitly re-runs Olimey AI and wants the new enquiries
   *  tracked separately). Defaults to false (idempotent). */
  force_new_round: z.boolean().optional(),
  /** Reconcile-only mode: do NOT create a new round; instead, add any items
   *  from the latest report that are missing from the latest open round
   *  (matched by `enquiry_number`). User-modified items are never touched. */
  mode: z.enum(["seed", "reconcile"]).optional(),
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorised" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Validate JWT and extract userId
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      const payloadPart = token.split(".")[1];
      if (payloadPart) {
        const padded = payloadPart
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
        const payload = JSON.parse(atob(padded)) as { sub?: string; exp?: number };
        const now = Math.floor(Date.now() / 1000);
        if (payload.sub && (!payload.exp || payload.exp > now)) userId = payload.sub;
      }
    } catch {
      // ignore
    }
    if (!userId) return jsonResponse({ error: "Unauthorised" }, 401);

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse(
        { error: `Invalid input: ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}` },
        400,
      );
    }
    const { case_id, agent_type, ai_report_id, force_new_round, mode } = parsed.data;
    const effectiveMode = mode ?? (force_new_round ? "seed" : "seed");

    // Authorisation: confirm the caller can read this case (RLS-enforced).
    const { data: caseRow, error: caseErr } = await userClient
      .from("cases")
      .select("id, case_reference")
      .eq("id", case_id)
      .maybeSingle();
    if (caseErr || !caseRow) {
      return jsonResponse({ error: "Case not found or access denied" }, 403);
    }

    const { data: existingRounds, error: roundsErr } = await adminClient
      .from("enquiry_rounds")
      .select("id, round_number, ai_run_id, created_at")
      .eq("case_id", case_id)
      .eq("agent_type", agent_type)
      .order("round_number", { ascending: false });
    if (roundsErr) return jsonResponse({ error: roundsErr.message }, 500);

    // In default seed mode, refuse to re-seed if rounds already exist (idempotent).
    // Reconcile mode is the explicit "add missing items to the latest round" path.
    if (effectiveMode === "seed" && !force_new_round && (existingRounds?.length ?? 0) > 0) {
      return jsonResponse({
        seeded: false,
        reason: "rounds_already_exist",
        latest_round: existingRounds![0],
      });
    }
    if (effectiveMode === "reconcile" && (existingRounds?.length ?? 0) === 0) {
      // Nothing to reconcile against — fall back to a normal seed.
      // (The client typically only invokes reconcile from the panel when a round exists.)
    }

    // Locate the report whose draft_email we will parse.
    const reportQuery = adminClient
      .from("ai_reports")
      .select("id, ai_run_id, draft_email, internal_report, finalisation_status, created_at")
      .eq("case_id", case_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: latestReports, error: reportErr } = ai_report_id
      ? await adminClient
          .from("ai_reports")
          .select("id, ai_run_id, draft_email, internal_report, finalisation_status, created_at")
          .eq("id", ai_report_id)
          .eq("case_id", case_id)
          .limit(1)
      : await reportQuery;
    if (reportErr) return jsonResponse({ error: reportErr.message }, 500);

    const report = latestReports?.[0];
    if (!report) {
      return jsonResponse({ seeded: false, reason: "no_ai_report_found" });
    }

    const acceptableStatus = ["fully_consolidated", "completed"];
    if (!acceptableStatus.includes(report.finalisation_status ?? "")) {
      return jsonResponse({
        seeded: false,
        reason: "report_not_finalised",
        finalisation_status: report.finalisation_status,
      });
    }

    if (!report.draft_email || report.draft_email.trim().length < 50) {
      return jsonResponse({ seeded: false, reason: "no_draft_email" });
    }

    const items = parseDraftEmailEnquiries(report.draft_email).filter((item) => {
      const sectionId = categoryToSection(item.category);
      if (sectionId === "decision_log_only") return false;
      if (/\b(decision\s*log|completion\s*readiness|quality\s*review|judge\s*finding|supervisory\s*review|evidence\s*map)\b/i.test(item.issue_summary)) {
        return false;
      }
      return true;
    });
    if (items.length === 0) {
      return jsonResponse({ seeded: false, reason: "no_enquiries_in_draft" });
    }

    // ── Reconcile mode ────────────────────────────────────────────────
    // Add only items missing from the latest round, matched by enquiry_number.
    // Existing rows (with any user-modified status, reply, evidence) are left
    // untouched. If no round exists yet, fall through to seed mode below.
    if (effectiveMode === "reconcile" && (existingRounds?.length ?? 0) > 0) {
      const targetRound = existingRounds![0];
      const { data: existingItems, error: itemsErr } = await adminClient
        .from("enquiry_items")
        .select("id, enquiry_number")
        .eq("case_id", case_id)
        .eq("agent_type", agent_type)
        .eq("round_id", targetRound.id);
      if (itemsErr) return jsonResponse({ error: itemsErr.message }, 500);

      const existingNumbers = new Set((existingItems ?? []).map((r) => String(r.enquiry_number)));
      const missing = items.filter((it) => !existingNumbers.has(String(it.enquiry_number)));

      if (missing.length === 0) {
        return jsonResponse({
          seeded: false,
          reason: "nothing_to_reconcile",
          round_id: targetRound.id,
          round_number: targetRound.round_number,
          checked: items.length,
        });
      }

      const reconcileNow = new Date().toISOString();
      const newRows = missing.map((it) => {
        // Final defensive scrub: ai-merge markers must never reach the tracker.
        const cleanOriginal = stripAiMergeMarkers(it.original_enquiry_text) || it.original_enquiry_text;
        const cleanEvidence = stripAiMergeMarkers(it.evidence_required || "");
        return {
          case_id,
          round_id: targetRound.id,
          agent_type,
          enquiry_number: it.enquiry_number,
          category: it.category,
          issue_summary: it.issue_summary,
          original_enquiry_text: cleanOriginal,
          // Always populate evidence_required so the UI block renders consistently.
          evidence_required: cleanEvidence || it.issue_summary,
          who_replied: it.who_addressed || null,
          status: "open",
          next_action: "raise_further",
          date_raised: reconcileNow,
          date_last_updated: reconcileNow,
        };
      });

      const { error: insErr } = await adminClient.from("enquiry_items").insert(newRows);
      if (insErr) return jsonResponse({ error: insErr.message }, 500);

      return jsonResponse({
        seeded: true,
        mode: "reconcile",
        round_id: targetRound.id,
        round_number: targetRound.round_number,
        items_inserted: newRows.length,
        items_skipped_existing: items.length - newRows.length,
        ai_report_id: report.id,
      });
    }

    // ── Seed mode (Round 1 or forced new round) ───────────────────────
    const nextRoundNumber = force_new_round && existingRounds?.length
      ? (existingRounds[0].round_number ?? 0) + 1
      : 1;

    // Create the round.
    const { data: roundRow, error: insertRoundErr } = await adminClient
      .from("enquiry_rounds")
      .insert({
        case_id,
        agent_type,
        round_number: nextRoundNumber,
        status: "open",
        ai_run_id: report.ai_run_id,
        draft_email: report.draft_email,
        internal_report: report.internal_report,
        outstanding_summary: `Round ${nextRoundNumber} seeded from Olimey AI report (${items.length} enquiries).`,
        created_by: userId,
      })
      .select("id, round_number")
      .single();
    if (insertRoundErr || !roundRow) {
      return jsonResponse({ error: insertRoundErr?.message ?? "Failed to create round" }, 500);
    }

    // Insert enquiry items in batch.
    const now = new Date().toISOString();
    const itemRows = items.map((it) => {
      const cleanOriginal = stripAiMergeMarkers(it.original_enquiry_text) || it.original_enquiry_text;
      const cleanEvidence = stripAiMergeMarkers(it.evidence_required || "");
      return {
        case_id,
        round_id: roundRow.id,
        agent_type,
        enquiry_number: it.enquiry_number,
        category: it.category,
        issue_summary: it.issue_summary,
        original_enquiry_text: cleanOriginal,
        // Always populate evidence_required so the UI block renders consistently.
        evidence_required: cleanEvidence || it.issue_summary,
        who_replied: it.who_addressed || null,
        status: "open",
        next_action: "raise_further",
        date_raised: now,
        date_last_updated: now,
      };
    });

    const { error: insertItemsErr } = await adminClient
      .from("enquiry_items")
      .insert(itemRows);
    if (insertItemsErr) {
      // Roll back the round so the panel doesn't show an empty round.
      await adminClient.from("enquiry_rounds").delete().eq("id", roundRow.id);
      return jsonResponse({ error: insertItemsErr.message }, 500);
    }

    return jsonResponse({
      seeded: true,
      round_id: roundRow.id,
      round_number: roundRow.round_number,
      items_inserted: itemRows.length,
      ai_report_id: report.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, 500);
  }
});

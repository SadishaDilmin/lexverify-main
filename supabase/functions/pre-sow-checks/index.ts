/**
 * pre-sow-checks/index.ts
 *
 * Wave 15.1 Pre-AI Sufficiency Gate — edge function.
 *
 * Accepts declared funding figures from the SoW form, runs deterministic
 * arithmetic via computeFundingSufficiency, writes a non-blocking
 * observability event, and returns the SufficiencyResult.
 *
 * Constraints:
 *  - No AI calls, no AI gateway routing, no model inference.
 *  - No bank-statement or payslip reconciliation (Phase 15.2 / 15.3).
 *  - No per-firm thresholds — binary declared-vs-required comparison only.
 *  - No new tables. Writes to existing observability_events (insert-only).
 *  - No UPDATE or DELETE on any table.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  computeFundingSufficiency,
  type SufficiencyInput,
  type SufficiencyResult,
} from "../_shared/financialReconciliation.ts";

// ---------------------------------------------------------------------------
// CORS — mirrors resolve-sow-context pattern exactly
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------------------------------------------------------------------------
// Request / Response shapes
// ---------------------------------------------------------------------------

interface PreSowChecksRequest {
  /** Supabase case UUID (optional — used for observability metadata only) */
  case_id?: string;
  /** The funding figures to reconcile */
  sufficiency_input: SufficiencyInput;
}

interface PreSowChecksResponse {
  data: SufficiencyResult;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Auth check ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate JWT by resolving the calling user
    const supabaseUser = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    const body: PreSowChecksRequest = await req.json();
    const { case_id, sufficiency_input } = body;

    if (!sufficiency_input) {
      return new Response(
        JSON.stringify({ error: "Missing required field: sufficiency_input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Deterministic arithmetic ──────────────────────────────────────────
    const result: SufficiencyResult = computeFundingSufficiency(sufficiency_input);

    // ── Observability event (non-blocking, insert-only) ───────────────────
    // Fire-and-forget: failure must not block the gate result being returned.
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    (async () => {
      try {
        await supabaseAdmin.from("observability_events").insert({
          event_type: "sow.sufficiency.checked",
          severity: "info",
          metadata: {
            user_id: user.id,
            case_id: case_id ?? null,
            status: result.status,
            funds_required: result.funds_required,
            declared_total: result.declared_total,
            shortfall: result.shortfall,
            overstatement: result.overstatement,
          },
        });
      } catch (obsErr) {
        // Non-blocking — log but do not surface to caller
        console.error("[pre-sow-checks] observability insert failed:", obsErr);
      }
    })();

    // ── Return result ─────────────────────────────────────────────────────
    const response: PreSowChecksResponse = { data: result };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[pre-sow-checks] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

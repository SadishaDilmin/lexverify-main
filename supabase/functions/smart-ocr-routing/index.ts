/**
 * Smart OCR Routing – Self-Healing Logic Layer
 * ──────────────────────────────────────────────
 * Pre-extraction hook that queries the Memory Layer to decide:
 *   A) Whether to trigger Dual-Engine Extraction
 *   B) Whether to apply a High-Sensitivity pre-processing filter
 *
 * Decision criteria (per document_type):
 *   • Average confidence_score < 0.75 in document_correction_signals
 *   • High frequency of engine_mismatch in extraction_failure_logs
 *   • Active confidence_suppression record
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RoutingDecision {
  document_type: string;
  dual_engine: boolean;
  high_sensitivity: boolean;
  suppression_active: boolean;
  suppression_factor: number | null;
  avg_confidence: number | null;
  mismatch_rate: number | null;
  reasoning: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { document_type, case_id } = await req.json();

    if (!document_type) {
      return new Response(
        JSON.stringify({ error: "document_type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const reasoning: string[] = [];
    let dualEngine = false;
    let highSensitivity = false;

    // 1. Query average confidence from correction signals for this doc type
    const { data: correctionStats } = await supabase
      .from("document_correction_signals")
      .select("confidence_score")
      .eq("document_type", document_type);

    let avgConfidence: number | null = null;
    if (correctionStats && correctionStats.length > 0) {
      const sum = correctionStats.reduce(
        (acc: number, r: { confidence_score: number }) => acc + Number(r.confidence_score),
        0,
      );
      avgConfidence = sum / correctionStats.length;

      if (avgConfidence < 0.75) {
        dualEngine = true;
        highSensitivity = true;
        reasoning.push(
          `Average confidence for '${document_type}' is ${avgConfidence.toFixed(3)} (< 0.75 threshold). Triggering dual-engine + high-sensitivity.`,
        );
      }
    }

    // 2. Query engine_mismatch frequency from extraction_failure_logs
    const { data: allFailures } = await supabase
      .from("extraction_failure_logs")
      .select("failure_type")
      .eq("is_resolved", false)
      .or(
        case_id
          ? `case_id.eq.${case_id}`
          : "id.not.is.null",
      );

    let mismatchRate: number | null = null;
    if (allFailures && allFailures.length > 0) {
      const mismatches = allFailures.filter(
        (f: { failure_type: string }) => f.failure_type === "engine_mismatch",
      ).length;
      mismatchRate = mismatches / allFailures.length;

      if (mismatchRate > 0.3) {
        dualEngine = true;
        reasoning.push(
          `Engine mismatch rate is ${(mismatchRate * 100).toFixed(1)}% (> 30% threshold). Forcing dual-engine extraction.`,
        );
      }
    }

    // 3. Check for active confidence suppression
    const { data: suppression } = await supabase
      .from("confidence_suppressions")
      .select("suppression_factor, reason")
      .eq("document_type", document_type)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const suppressionActive = !!suppression;
    if (suppressionActive) {
      highSensitivity = true;
      reasoning.push(
        `Active confidence suppression (factor: ${suppression.suppression_factor}): ${suppression.reason}`,
      );
    }

    if (reasoning.length === 0) {
      reasoning.push("No anomalies detected. Standard single-engine extraction.");
    }

    const decision: RoutingDecision = {
      document_type,
      dual_engine: dualEngine,
      high_sensitivity: highSensitivity,
      suppression_active: suppressionActive,
      suppression_factor: suppression?.suppression_factor ?? null,
      avg_confidence: avgConfidence,
      mismatch_rate: mismatchRate,
      reasoning,
    };

    return new Response(JSON.stringify(decision), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

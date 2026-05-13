/**
 * Confidence Recalibration – Self-Healing Logic Layer
 * ────────────────────────────────────────────────────
 * Compares original_text vs corrected_text in document_correction_signals.
 *
 * Rule: If original confidence > 0.9 AND human correction changed > 15%
 *       of characters ⇒ FLAG FOR RECALIBRATION.
 *
 * Outcome: Upserts a confidence_suppressions record so future docs of
 *          that type have their confidence artificially reduced,
 *          forcing human review.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Levenshtein distance for character-level diff measurement */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two-row optimisation for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

interface RecalibrationResult {
  signals_analysed: number;
  flagged_count: number;
  suppressions_created: string[];
  details: Array<{
    signal_id: string;
    document_type: string;
    original_confidence: number;
    change_pct: number;
    flagged: boolean;
  }>;
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

    // Optional: scope to a specific document_type
    let body: { document_type?: string } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine – process all
    }

    // Fetch correction signals with high original confidence
    let query = supabase
      .from("document_correction_signals")
      .select("id, original_text, corrected_text, document_type, ocr_engine, confidence_score")
      .gte("confidence_score", 0.9);

    if (body.document_type) {
      query = query.eq("document_type", body.document_type);
    }

    const { data: signals, error: fetchErr } = await query;
    if (fetchErr) throw new Error(fetchErr.message);

    const details: RecalibrationResult["details"] = [];
    // Group flagged signals by document_type for suppression
    const flaggedByType: Record<string, string[]> = {};

    for (const signal of signals ?? []) {
      const origLen = Math.max(signal.original_text.length, 1);
      const dist = levenshtein(signal.original_text, signal.corrected_text);
      const changePct = dist / origLen;
      const flagged = changePct > 0.15;

      details.push({
        signal_id: signal.id,
        document_type: signal.document_type,
        original_confidence: Number(signal.confidence_score),
        change_pct: Math.round(changePct * 1000) / 10, // e.g. 18.3%
        flagged,
      });

      if (flagged) {
        if (!flaggedByType[signal.document_type]) {
          flaggedByType[signal.document_type] = [];
        }
        flaggedByType[signal.document_type].push(signal.id);
      }
    }

    // Create / update suppression records for flagged types
    const suppressionsCreated: string[] = [];

    for (const [docType, signalIds] of Object.entries(flaggedByType)) {
      const { error: upsertErr } = await supabase
        .from("confidence_suppressions")
        .upsert(
          {
            document_type: docType,
            ocr_engine: "default",
            suppression_factor: 0.65,
            reason: `Auto-recalibration: ${signalIds.length} correction(s) showed >15% character change despite >0.9 confidence.`,
            correction_signal_ids: signalIds,
            is_active: true,
          },
          { onConflict: "document_type,ocr_engine" },
        );

      if (upsertErr) {
        console.error(`Suppression upsert failed for ${docType}:`, upsertErr.message);
      } else {
        suppressionsCreated.push(docType);
      }
    }

    const result: RecalibrationResult = {
      signals_analysed: details.length,
      flagged_count: Object.values(flaggedByType).flat().length,
      suppressions_created: suppressionsCreated,
      details,
    };

    return new Response(JSON.stringify(result), {
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

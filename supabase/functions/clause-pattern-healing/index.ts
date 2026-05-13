/**
 * Clause Pattern Healing – Self-Healing Logic Layer
 * ──────────────────────────────────────────────────
 * When a new document is processed, compares extracted clause text
 * against clause_pattern_memory.
 *
 * If a clause matches a known pattern_hash with high occurrence_count
 * but the extracted text contains OCR noise, the function:
 *   1. Proposes a healed version based on the standard_wording_sample
 *   2. Saves it as proposed_healed_text on the document record
 *   3. Does NOT overwrite raw OCR – preserves original for Phase 3 audit
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Simple hash of normalised text for pattern matching */
async function hashText(text: string): Promise<string> {
  const normalised = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const data = new TextEncoder().encode(normalised);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Detect OCR noise: excessive special chars, digit substitutions, etc. */
function detectNoise(text: string): { noisy: boolean; score: number } {
  if (!text || text.length === 0) return { noisy: false, score: 0 };

  let noiseChars = 0;
  for (const ch of text) {
    // Common OCR artefacts: |, \, ~, ^, `, ¬, «, »
    if (/[|\\~^`¬«»§¶†‡•°±×÷]/.test(ch)) noiseChars++;
    // Unusual digit-letter substitutions (e.g. 0 for O in middle of word)
    if (/\d/.test(ch) && text.indexOf(ch) > 0 && text.indexOf(ch) < text.length - 1) {
      const prev = text[text.indexOf(ch) - 1];
      const next = text[text.indexOf(ch) + 1];
      if (/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next)) noiseChars++;
    }
  }

  const score = noiseChars / text.length;
  return { noisy: score > 0.03, score }; // >3% noise threshold
}

/** Simple similarity: 1 – (edit-like ratio). Uses bigram overlap for speed. */
function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const lower = s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const set = new Set<string>();
    for (let i = 0; i < lower.length - 1; i++) set.add(lower.slice(i, i + 2));
    return set;
  };

  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;

  return (2 * intersection) / (setA.size + setB.size);
}

interface HealingResult {
  document_id: string;
  clauses_checked: number;
  healed: boolean;
  proposed_healed_text: string | null;
  matched_clause_type: string | null;
  noise_score: number | null;
  similarity: number | null;
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

    const { document_id, extracted_clauses } = await req.json() as {
      document_id: string;
      extracted_clauses: Array<{ clause_type: string; text: string }>;
    };

    if (!document_id || !extracted_clauses?.length) {
      return new Response(
        JSON.stringify({ error: "document_id and extracted_clauses[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch all patterns with meaningful occurrence counts
    const { data: patterns } = await supabase
      .from("clause_pattern_memory")
      .select("id, clause_type, pattern_hash, standard_wording_sample, occurrence_count")
      .gte("occurrence_count", 3);

    const healedSections: string[] = [];
    let matchedClauseType: string | null = null;
    let bestNoiseScore: number | null = null;
    let bestSimilarity: number | null = null;

    for (const clause of extracted_clauses) {
      const noise = detectNoise(clause.text);
      if (!noise.noisy) continue; // Skip clean text

      const clauseHash = await hashText(clause.text);

      // Find matching patterns by clause_type, then by similarity
      const typePatterns = (patterns ?? []).filter(
        (p) => p.clause_type === clause.clause_type,
      );

      for (const pattern of typePatterns) {
        const sim = bigramSimilarity(clause.text, pattern.standard_wording_sample);

        // High similarity despite noise ⇒ we can heal
        if (sim > 0.6) {
          healedSections.push(
            `[${clause.clause_type}]\n${pattern.standard_wording_sample}`,
          );
          matchedClauseType = clause.clause_type;
          bestNoiseScore = noise.score;
          bestSimilarity = sim;

          // Bump occurrence count
          await supabase
            .from("clause_pattern_memory")
            .update({ occurrence_count: pattern.occurrence_count + 1 })
            .eq("id", pattern.id);

          break;
        }
      }

      // If no type match, try hash-based lookup across all patterns
      if (healedSections.length === 0) {
        const hashMatch = (patterns ?? []).find(
          (p) => bigramSimilarity(clauseHash, p.pattern_hash) > 0.8,
        );
        if (hashMatch) {
          healedSections.push(
            `[${hashMatch.clause_type}]\n${hashMatch.standard_wording_sample}`,
          );
          matchedClauseType = hashMatch.clause_type;
          bestNoiseScore = noise.score;
          bestSimilarity = bigramSimilarity(clause.text, hashMatch.standard_wording_sample);
        }
      }
    }

    const proposedHealedText = healedSections.length > 0
      ? healedSections.join("\n\n---\n\n")
      : null;

    // Save proposed_healed_text to the document (non-destructive)
    if (proposedHealedText) {
      const { error: updateErr } = await supabase
        .from("documents")
        .update({ proposed_healed_text: proposedHealedText })
        .eq("id", document_id);

      if (updateErr) {
        console.error("Failed to save proposed_healed_text:", updateErr.message);
      }
    }

    const result: HealingResult = {
      document_id,
      clauses_checked: extracted_clauses.length,
      healed: !!proposedHealedText,
      proposed_healed_text: proposedHealedText,
      matched_clause_type: matchedClauseType,
      noise_score: bestNoiseScore,
      similarity: bestSimilarity,
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

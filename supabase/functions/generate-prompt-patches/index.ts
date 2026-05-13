import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

import { chat, extractContent } from "../_shared/aiGateway.ts";

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const resp = await chat({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  }, "generate-prompt-patches");
  return extractContent(resp);
}

const PATCH_SYSTEM = `You are a legal AI prompt engineering expert. You analyse failure patterns from benchmark comparisons and generate TARGETED, SMALL prompt patches to improve AI agent performance.

You must generate specific, actionable prompt improvement instructions. Each patch should:
- Address a specific failure pattern (e.g. missed lease risks, incorrect severity classification)
- Be a SMALL addition or modification to the existing prompt, NOT a full rewrite
- Include the exact text to add/modify in the prompt
- Reference the specific failure case as evidence

CRITICAL — Negative Constraints:
You will be provided with a list of "Failed Fixes" — previous patches or failure patterns that have REGRESSED or not improved performance. You MUST:
1. NOT repeat any approach that has already failed or caused regressions
2. Explicitly include Negative Constraints in your patches for issues that have regressed in previous iterations (e.g., "Do NOT change the definition of X to fix Y", "Do NOT broaden the scope of Z classification")
3. If a failure pattern has a linked prompt patch that was ineffective, acknowledge it and propose an alternative strategy
4. Reference the failed fix in your change_reason to show awareness

Return a JSON array of patch objects:
[{
  "title": "Short descriptive title of the improvement",
  "patch_instruction": "The exact prompt text to add or modify. Be specific about WHERE in the prompt this should go.",
  "failure_example": "Brief description of the failure case that motivated this patch",
  "change_reason": "Why this change will improve performance. Reference any failed fixes you are avoiding.",
  "predicted_impact": "Expected improvement (e.g. 'Reduce missed lease restriction rate by ~30%')",
  "negative_constraints": ["List of things this patch explicitly must NOT do, based on failed fix history"]
}]

Rules:
- Generate 1-5 patches per analysis
- Each patch must be independent and testable
- Focus on the most impactful improvements first
- Be extremely specific in patch_instruction - include exact wording
- Return ONLY valid JSON array, no markdown`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { comparison_id, agent_type } = await req.json();

    if (!comparison_id && !agent_type) {
      return new Response(JSON.stringify({ error: "comparison_id or agent_type required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let comparisons: any[] = [];

    if (comparison_id) {
      const { data: comp } = await supabase
        .from("benchmark_comparisons")
        .select("*")
        .eq("id", comparison_id)
        .single();
      if (!comp) {
        return new Response(JSON.stringify({ error: "Comparison not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      comparisons = [comp];
    } else {
      const { data: cases } = await supabase
        .from("benchmark_cases")
        .select("id")
        .eq("agent_type", agent_type)
        .eq("is_excluded", false);

      if (!cases || cases.length === 0) {
        return new Response(JSON.stringify({ error: "No benchmark cases found for this agent" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const caseIds = cases.map((c: any) => c.id);
      const { data: comps } = await supabase
        .from("benchmark_comparisons")
        .select("*")
        .in("benchmark_case_id", caseIds)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(10);

      comparisons = comps || [];
      if (comparisons.length === 0) {
        return new Response(JSON.stringify({ error: "No completed comparisons found for this agent. Run comparisons first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Gather all failures across selected comparisons
    const compIds = comparisons.map((c: any) => c.id);
    const { data: items } = await supabase
      .from("benchmark_comparison_items")
      .select("*")
      .in("comparison_id", compIds);

    const failures = (items || []).filter((i: any) => i.difference_type !== "match");
    if (failures.length === 0) {
      return new Response(JSON.stringify({ error: "No failures found — no patches needed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get benchmark case info for context
    const caseIds = [...new Set(comparisons.map((c: any) => c.benchmark_case_id))];
    const { data: benchCases } = await supabase
      .from("benchmark_cases")
      .select("*")
      .in("id", caseIds);

    const resolvedAgentType = agent_type || benchCases?.[0]?.agent_type || "unknown";

    // ── Negative Constraint Memory: Fetch failed/regressed failure patterns ──
    const { data: failedPatterns } = await supabase
      .from("benchmark_failure_patterns")
      .select("id, failure_type, description, issue_category, document_type, improvement_recommendation, status, linked_prompt_patch_id, occurrence_count, severity_profile")
      .eq("agent_type", resolvedAgentType)
      .in("status", ["open", "regressed", "wont_fix"])
      .order("occurrence_count", { ascending: false })
      .limit(20);

    // Fetch linked patches for failed patterns to show what was already tried
    const linkedPatchIds = (failedPatterns || [])
      .map((p: any) => p.linked_prompt_patch_id)
      .filter(Boolean);
    
    let linkedPatches: any[] = [];
    if (linkedPatchIds.length > 0) {
      const { data: lp } = await supabase
        .from("prompt_patches")
        .select("id, title, patch_instruction, status")
        .in("id", linkedPatchIds);
      linkedPatches = lp || [];
    }

    const failedFixesSection = (failedPatterns && failedPatterns.length > 0)
      ? `\n\n⚠️ FAILED FIXES & NEGATIVE CONSTRAINTS (DO NOT REPEAT THESE APPROACHES):
${(failedPatterns as any[]).map((fp: any) => {
  const linkedPatch = linkedPatches.find((lp: any) => lp.id === fp.linked_prompt_patch_id);
  return `- [${fp.status.toUpperCase()}] ${fp.failure_type}: ${fp.description}
  Category: ${fp.issue_category} | Doc type: ${fp.document_type} | Occurrences: ${fp.occurrence_count}
  ${fp.improvement_recommendation ? `Previous recommendation: ${fp.improvement_recommendation}` : ""}
  ${linkedPatch ? `Previously attempted patch: "${linkedPatch.title}" — "${linkedPatch.patch_instruction?.slice(0, 200)}" (Status: ${linkedPatch.status})` : "No prior patch attempted"}`;
}).join("\n\n")}`
      : "";

    const prompt = `Analyse these AI failures from ${comparisons.length} benchmark comparison(s) and generate targeted prompt patches.

BENCHMARK CASES:
${(benchCases || []).map((bc: any) => `- ${bc.title} (${bc.case_type}, ${bc.agent_type}, ${bc.transaction_type})`).join("\n")}

FAILURES (${failures.length} items across ${comparisons.length} comparison(s)):
${JSON.stringify(failures.map((f: any) => ({
  type: f.difference_type,
  issue: f.issue_type,
  source: f.document_source,
  human: f.human_finding,
  ai: f.ai_finding,
  severity_h: f.human_severity,
  severity_ai: f.ai_severity,
  notes: f.notes,
})), null, 2)}
${failedFixesSection}

Generate targeted prompt patches to address these specific failures. Remember to include negative_constraints referencing any failed fixes above.`;

    const raw = await callAI(PATCH_SYSTEM, prompt);
    let patches: any[] = [];
    try { patches = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); } catch { patches = []; }

    // Insert patches
    const inserted: string[] = [];
    for (const patch of patches) {
      const { data, error } = await supabase.from("prompt_patches").insert({
        agent_id: resolvedAgentType,
        comparison_id: comparison_id || compIds[0],
        benchmark_case_id: comparisons[0].benchmark_case_id,
        title: patch.title || "Untitled patch",
        patch_instruction: patch.patch_instruction || "",
        failure_example: patch.failure_example || "",
        change_reason: patch.change_reason || "",
        predicted_impact: patch.predicted_impact || "",
        created_by: user.id,
      }).select("id").single();
      if (!error && data) inserted.push(data.id);
    }

    // Audit
    await supabase.from("audit_log").insert({
      user_id: user.id,
      user_name: "",
      user_email: user.email || "",
      event_type: "prompt_patches_generated",
      metadata: {
        comparison_id: comparison_id || "bulk",
        agent_type: resolvedAgentType,
        patches_count: inserted.length,
        comparisons_used: compIds.length,
        failed_patterns_fed: (failedPatterns || []).length,
      },
    });

    return new Response(JSON.stringify({ patches_created: inserted.length, patch_ids: inserted, negative_constraints_fed: (failedPatterns || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-prompt-patches error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

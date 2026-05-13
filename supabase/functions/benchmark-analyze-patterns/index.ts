import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

import { chat as aiGatewayChat, extractContent as aiExtractContent } from "../_shared/aiGateway.ts";

async function callAI(model: string, systemPrompt: string, userPrompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await aiGatewayChat({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(model.startsWith("openai/") ? {} : { temperature: 0.15 }),
      }, `benchmark-analyze-patterns`);
      return aiExtractContent(resp);
    } catch (err: any) {
      const status = err?.status;
      if ((status === 502 || status === 503 || status === 429) && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`AI call attempt ${attempt + 1} failed (${status}), retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("AI call failed after retries");
}

function parseJSON(raw: string): any[] {
  try {
    const parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const PATTERN_SYSTEM = `You are a legal AI quality analyst specialising in UK conveyancing. Analyse the provided benchmark comparison data and identify recurring failure patterns.

Each item includes an "agent_type" field indicating which agent it belongs to. Group patterns by their actual agent_type — do NOT mix items from different agents into the same pattern.

## Important Domain Context — Document Relevance by Agent

You MUST only reference documents that are genuinely relevant to each agent's domain:

- **source-of-wealth** (Olimey AI / AML): Bank statements, payslips, tax returns, gift letters, open banking reports, AML/ID verification reports, source of funds declarations, mortgage offers. Do NOT reference TA6, TA7, TA10, title registers, leases, search results, or contracts — these are property documents unrelated to AML/source of wealth.

The TA6 is a Property Information Form completed by the seller — it is NOT a financial document and has no relevance to source of wealth or AML checks. Never reference it in source-of-wealth patterns.

For each pattern, return:
{
  "failure_type": string (one of: ai_missed_material_issue, ai_false_positive, data_extraction_error, severity_classification_error, action_recommendation_error, evidence_citation_failure),
  "agent_type": string (must be "source-of-wealth"),
  "issue_category": string (e.g. "title_restriction", "lease_term", "aml_risk", "building_safety"),
  "document_type": string (e.g. "title_register", "lease", "search_results", "contract" — must be relevant to the agent_type per the rules above),
  "description": string (clear description of the recurring problem — only reference documents relevant to the agent),
  "severity_profile": { "critical": number, "high": number, "medium": number, "low": number },
  "improvement_recommendation": string (specific suggestion for prompt improvement to fix this pattern — only reference documents relevant to the agent)
}

Only include patterns that appear 2+ times. Return a JSON array. No markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("[analyze-patterns] Starting pattern analysis...");
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = SUPABASE_URL;
    const serviceKey = SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const isServiceRole = token === serviceKey;
    let callerId = "system";

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const adminCheck = createClient(supabaseUrl, serviceKey);
      const { data: roleRow } = await adminCheck
        .from("user_roles").select("role")
        .eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
      if (!roleRow) throw new Error("Admin access required");
      callerId = user.id;
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { agent_type, source_type } = body;

    // Fetch all non-match comparison items with pagination to avoid the 1000-row default limit
    let allItems: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page, error: pageErr } = await admin
        .from("benchmark_comparison_items")
        .select("*, benchmark_comparisons!inner(benchmark_case_id, prompt_version, recall_score, precision_score)")
        .neq("difference_type", "match")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (pageErr) throw pageErr;
      if (!page || page.length === 0) break;
      allItems = allItems.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    const items = allItems;
    console.log(`[analyze-patterns] Fetched ${allItems.length} non-match comparison items`);

    if (!items || items.length === 0) {
      console.log("[analyze-patterns] No failure items found, returning empty");
      return new Response(JSON.stringify({ patterns: [], message: "No failure items to analyse" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch benchmark cases for filtering (chunked to avoid oversized .in() queries)
    const caseIds = [...new Set(items.map((i: any) => i.benchmark_comparisons?.benchmark_case_id).filter(Boolean))] as string[];

    if (caseIds.length === 0) {
      console.log("[analyze-patterns] No benchmark case IDs found on comparison items");
      return new Response(JSON.stringify({ patterns: [], message: "No benchmark cases found for failure items" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CASE_ID_CHUNK_SIZE = 250;
    const caseMap = new Map<string, { id: string; agent_type: string; source_type: string }>();

    for (let i = 0; i < caseIds.length; i += CASE_ID_CHUNK_SIZE) {
      const idChunk = caseIds.slice(i, i + CASE_ID_CHUNK_SIZE);
      const { data: caseChunk, error: caseErr } = await admin
        .from("benchmark_cases")
        .select("id, agent_type, source_type")
        .in("id", idChunk);

      if (caseErr) {
        console.error("[analyze-patterns] Failed to fetch benchmark case metadata chunk:", caseErr);
        throw caseErr;
      }

      for (const c of caseChunk || []) {
        caseMap.set(c.id, c);
      }
    }

    console.log(`[analyze-patterns] Loaded ${caseMap.size} benchmark case metadata row(s)`);

    // Filter by agent_type and source_type if provided
    const filteredItems = items.filter((item: any) => {
      const bc = caseMap.get(item.benchmark_comparisons?.benchmark_case_id);
      if (!bc) return false;
      if (agent_type && agent_type !== "all" && bc.agent_type !== agent_type) return false;
      if (source_type && source_type !== "all" && bc.source_type !== source_type) return false;
      return true;
    });

    if (filteredItems.length === 0) {
      console.warn(`[analyze-patterns] No failure items matched filters (agent_type=${agent_type ?? "all"}, source_type=${source_type ?? "all"}, caseMapSize=${caseMap.size})`);
      return new Response(JSON.stringify({ patterns: [], message: "No failure items match filters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group items by agent_type from their actual benchmark case
    const itemsByAgent: Record<string, any[]> = {};
    for (const item of filteredItems) {
      const bc = caseMap.get(item.benchmark_comparisons?.benchmark_case_id);
      const at = bc?.agent_type ?? "unknown";
      if (at === "unknown") continue;
      if (!itemsByAgent[at]) itemsByAgent[at] = [];
      itemsByAgent[at].push(item);
    }

    // Analyse each agent separately to prevent cross-contamination
    const enrichedPatterns: any[] = [];
    const scopedAgents = Object.keys(itemsByAgent);
    const MAX_ITEMS_PER_AGENT = 120;
    const MAX_GROUPS_PER_AGENT = 60;

    for (const [agentKey, agentItemsAll] of Object.entries(itemsByAgent)) {
      if (agentItemsAll.length < 2) continue; // need 2+ to form a pattern

      // Keep request bounded so the function can finish within edge runtime limits
      const agentItems = agentItemsAll.slice(0, MAX_ITEMS_PER_AGENT);

      // Pre-aggregate repeated signals before sending to AI (smaller payload, faster calls)
      const grouped = new Map<string, any>();
      for (const item of agentItems) {
        const key = [
          item.difference_type || "unknown",
          item.issue_type || "unknown",
          item.document_source || "unknown",
          item.human_severity || "unknown",
          item.ai_severity || "unknown",
        ].join("|");

        const existing = grouped.get(key) || {
          dt: item.difference_type || "unknown",
          it: item.issue_type || "unknown",
          ds: item.document_source || "unknown",
          hs: item.human_severity || "unknown",
          as: item.ai_severity || "unknown",
          cnt: 0,
          notes: [] as string[],
          case_ids: new Set<string>(),
          prompt_versions: new Set<string>(),
        };

        existing.cnt += 1;
        if (item.notes && existing.notes.length < 2) {
          existing.notes.push(String(item.notes).slice(0, 120));
        }

        const caseId = item.benchmark_comparisons?.benchmark_case_id;
        const promptVersion = item.benchmark_comparisons?.prompt_version;
        if (caseId) existing.case_ids.add(caseId);
        if (promptVersion) existing.prompt_versions.add(promptVersion);

        grouped.set(key, existing);
      }

      const groupedSummary = [...grouped.values()]
        .sort((a, b) => b.cnt - a.cnt)
        .slice(0, MAX_GROUPS_PER_AGENT)
        .map((g) => ({
          dt: g.dt,
          it: g.it,
          ds: g.ds,
          hs: g.hs,
          as: g.as,
          cnt: g.cnt,
          notes: g.notes,
          case_ids: [...g.case_ids].slice(0, 8),
          prompt_versions: [...g.prompt_versions].slice(0, 8),
        }));

      if (groupedSummary.length === 0) continue;

      const patternPrompt = `Analyse these grouped benchmark failure signals for the "${agentKey}" agent. Each row has a frequency field "cnt". Prioritise recurring clusters and only output patterns backed by repeated evidence (2+ occurrences).
\n${JSON.stringify(groupedSummary)}`;

      let mergedPatterns: any[] = [];
      try {
        const patternRaw = await callAI("openai/gpt-5-nano", PATTERN_SYSTEM, patternPrompt, 1);
        mergedPatterns = parseJSON(patternRaw);
      } catch (aiErr: any) {
        console.warn(`Pattern AI fallback for ${agentKey}:`, aiErr?.message || aiErr);
        mergedPatterns = groupedSummary
          .filter((g) => g.cnt >= 2)
          .slice(0, 8)
          .map((g) => {
            const hs = String(g.hs || "").toLowerCase();
            const severityProfile = {
              critical: hs === "critical" ? g.cnt : 0,
              high: hs === "high" ? g.cnt : 0,
              medium: hs === "medium" ? g.cnt : 0,
              low: hs === "low" ? g.cnt : 0,
            };

            return {
              failure_type: g.dt || "ai_missed_material_issue",
              issue_category: String(g.it || "general_issue").toLowerCase().replace(/\s+/g, "_").slice(0, 50),
              document_type: String(g.ds || "unknown"),
              description: `Recurring ${g.dt || "failure"} signals in ${g.ds || "unknown documents"} (${g.cnt} occurrences).`,
              severity_profile: severityProfile,
              improvement_recommendation: `Refine prompt instructions for ${g.ds || "this document type"} to reduce ${String(g.dt || "errors").replace(/_/g, " ")}.`,
            };
          });
      }

      for (const p of mergedPatterns) {
        const matchingItems = agentItemsAll.filter((i: any) => {
          const typeMatch = i.difference_type === p.failure_type;
          const catMatch = p.issue_category && i.issue_type?.toLowerCase().includes(String(p.issue_category).toLowerCase());
          return typeMatch || catMatch;
        });

        const effectiveItems = matchingItems.length > 0
          ? matchingItems
          : agentItemsAll.filter((i: any) => i.difference_type === p.failure_type);

        const exampleCaseIds = [...new Set(effectiveItems.map((i: any) => i.benchmark_comparisons?.benchmark_case_id).filter(Boolean))].slice(0, 10);
        const promptVersions = [...new Set(effectiveItems.map((i: any) => i.benchmark_comparisons?.prompt_version).filter(Boolean))];
        const sourceTypes = [...new Set(exampleCaseIds.map(id => caseMap.get(id)?.source_type).filter(Boolean))];

        enrichedPatterns.push({
          agent_type: agentKey,
          failure_type: p.failure_type || "ai_missed_material_issue",
          issue_category: p.issue_category || "",
          document_type: p.document_type || "",
          description: p.description || "",
          occurrence_count: effectiveItems.length || (p.occurrence_count ?? 2),
          severity_profile: p.severity_profile || {},
          example_case_ids: exampleCaseIds,
          prompt_versions_affected: promptVersions,
          source_types: sourceTypes,
          improvement_recommendation: p.improvement_recommendation || null,
          status: "detected",
        });
      }
    }

    // Clear old patterns for all scoped agents and re-insert fresh results
    console.log(`[analyze-patterns] Replacing patterns for agents: ${scopedAgents.join(", ")} (${enrichedPatterns.length} new patterns)`);
    for (const agent of scopedAgents) {
      await admin.from("benchmark_failure_patterns").delete().eq("agent_type", agent);
    }

    if (enrichedPatterns.length > 0) {
      const { error: insertErr } = await admin.from("benchmark_failure_patterns").insert(enrichedPatterns);
      if (insertErr) {
        console.error("[analyze-patterns] Insert error:", insertErr);
        throw insertErr;
      }
      console.log(`[analyze-patterns] Successfully inserted ${enrichedPatterns.length} patterns`);
    }

    // Audit log
    if (callerId !== "system") {
      const { data: profile } = await admin.from("profiles").select("full_name, email, position").eq("user_id", callerId).single();
      if (profile) {
        await admin.from("audit_log").insert({
          user_id: callerId,
          user_name: profile.full_name,
          user_email: profile.email,
          user_position: profile.position || "",
          event_type: "benchmark_failure_analysis",
          metadata: { agent_types: scopedAgents, patterns_found: enrichedPatterns.length, items_analysed: filteredItems.length },
        });
      }
    }

    console.log(`[analyze-patterns] Complete: ${enrichedPatterns.length} patterns from ${filteredItems.length} items`);
    return new Response(JSON.stringify({
      patterns: enrichedPatterns.length,
      items_analysed: filteredItems.length,
      message: `Detected ${enrichedPatterns.length} recurring failure pattern(s)`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("benchmark-analyze-patterns error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message.includes("Unauthorized") ? 401 : err.message.includes("Admin") ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

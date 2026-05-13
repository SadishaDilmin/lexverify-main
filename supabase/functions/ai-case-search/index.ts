import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");

    // Auth
    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch user's cases (respecting ownership)
    const { data: cases, error: casesError } = await supabase
      .from("cases")
      .select("id, case_reference, property_address, status, risk_level, risk_score, tenure, transaction_type, conveyancer_name, lender, created_at, updated_at, property_type, case_flags")
      .eq("conveyancer_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (casesError) throw casesError;
    if (!cases || cases.length === 0) {
      return new Response(JSON.stringify({ results: [], summary: "No cases found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build case summaries for AI context
    const caseSummaries = cases.map((c: any) =>
      `ID:${c.id}|Ref:${c.case_reference}|Addr:${c.property_address}|Status:${c.status}|Risk:${c.risk_level || "none"}(${c.risk_score ?? "n/a"})|Tenure:${c.tenure}|Type:${c.transaction_type}|Lender:${c.lender || "none"}|Property:${c.property_type}|Updated:${c.updated_at?.slice(0, 10)}`
    ).join("\n");

    const systemPrompt = `You are a legal case search assistant. Given a natural language query and a list of conveyancing cases, identify the most relevant cases.

For each matching case, explain why it matches the query. Score relevance from 0 to 1.

Return results ordered by relevance. Maximum 10 results. Only include genuinely relevant cases.

Respond using the provided tool.`;

    const userPrompt = `Query: "${query}"

Cases:
${caseSummaries}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_search_results",
            description: "Return search results matching the query",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      case_id: { type: "string" },
                      relevance_reason: { type: "string" },
                      match_score: { type: "number" },
                    },
                    required: ["case_id", "relevance_reason", "match_score"],
                  },
                },
                summary: { type: "string" },
              },
              required: ["results", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_search_results" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI search failed");
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    let parsed = { results: [] as any[], summary: "No results." };

    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse AI search results");
      }
    }

    // Enrich results with case data
    const caseMap = new Map(cases.map((c: any) => [c.id, c]));
    const enriched = parsed.results
      .filter((r: any) => caseMap.has(r.case_id))
      .map((r: any) => {
        const c = caseMap.get(r.case_id)!;
        return {
          case_id: r.case_id,
          case_reference: c.case_reference,
          property_address: c.property_address,
          status: c.status,
          risk_level: c.risk_level,
          risk_score: c.risk_score,
          relevance_reason: r.relevance_reason,
          match_score: r.match_score,
        };
      });

    return new Response(JSON.stringify({ results: enriched, summary: parsed.summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-case-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { generateEmbedding, EMBED_DIM } from "../_shared/generateEmbedding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Agent → Knowledge Base routing map ────────────────────────────────
const AGENT_KB_ROUTING: Record<string, string[]> = {
  "source-of-wealth": ["source-of-wealth", "regulatory-aml", "fraud-risk"],
};

// ── Tenure → Knowledge Base routing map ───────────────────────────────
const TENURE_KB_MAP: Record<string, string[]> = {
  freehold: ["freehold"],
  leasehold: ["leasehold-management"],
  commonhold: ["commonhold"],
  "new-build": ["new-build"],
  "new build": ["new-build"],
};

// ── Tiered retrieval with metadata filtering and audit logging ─────────
interface TieredResult {
  results: any[];
  tier: number;
  knowledgeBasesQueried: string[];
  fallbackUsed: boolean;
  keywordFallbackUsed: boolean;
  latencyMs: number;
}

// ── Keyword search helper ─────────────────────────────────────────────
async function keywordSearch(
  supabase: any,
  query: string,
  agentId: string,
  limit: number,
  knowledgeBaseIds?: string[] | null,
  tenureType?: string | null,
): Promise<any[]> {
  const { data, error } = await supabase.rpc("search_knowledge_chunks_keyword", {
    search_query: query,
    match_agent_id: agentId,
    match_count: limit,
    match_knowledge_base_ids: knowledgeBaseIds || null,
    match_tenure_type: tenureType || null,
  });
  if (error) {
    console.warn("[keyword-search] RPC error:", error);
    return [];
  }
  return data || [];
}

// ── Deduplicate and merge results by chunk_id ─────────────────────────
function mergeResults(vectorResults: any[], keywordResults: any[]): any[] {
  const seen = new Set(vectorResults.map((r: any) => r.chunk_id));
  const merged = [...vectorResults];
  for (const kr of keywordResults) {
    if (!seen.has(kr.chunk_id)) {
      seen.add(kr.chunk_id);
      merged.push(kr);
    }
  }
  return merged;
}

async function tieredRetrieval(
  supabase: any,
  embeddingStr: string,
  queryText: string,
  agentId: string,
  tenure?: string,
  lenderInvolved?: boolean,
  threshold = 0.5,
  limit = 5,
): Promise<TieredResult> {
  // Lower threshold for regulatory KBs to improve recall of specialised documents
  const regulatoryKBs = ["regulatory-aml", "fraud-risk"];
  const effectiveThreshold = (kb: string[]) =>
    kb.some(k => regulatoryKBs.includes(k)) ? Math.min(threshold, 0.3) : threshold;
  const startTime = Date.now();
  const allQueried: string[] = [];
  let tier = 1;
  let fallbackUsed = false;
  let keywordFallbackUsed = false;

  // Tier 1: Tenure-specific KB (if tenure provided)
  if (tenure) {
    const tenureKBs = TENURE_KB_MAP[tenure.toLowerCase()] || [];
    if (tenureKBs.length > 0) {
      allQueried.push(...tenureKBs);
      const { data: t1Results } = await supabase.rpc("search_knowledge_chunks", {
        query_embedding_text: embeddingStr,
        match_agent_id: agentId,
        match_threshold: effectiveThreshold(tenureKBs),
        match_count: limit,
        match_knowledge_base_ids: tenureKBs,
        match_tenure_type: tenure.toLowerCase(),
      });
      if (t1Results && t1Results.length >= 2) {
        return { results: t1Results, tier: 1, knowledgeBasesQueried: allQueried, fallbackUsed: false, keywordFallbackUsed: false, latencyMs: Date.now() - startTime };
      }
    }
  }

  // Tier 2: Lender-specific KB (if lender involved)
  if (lenderInvolved) {
    tier = 2;
    const lenderKBs = ["lender-compliance"];
    allQueried.push(...lenderKBs);
    const { data: t2Results } = await supabase.rpc("search_knowledge_chunks", {
      query_embedding_text: embeddingStr,
      match_agent_id: agentId,
      match_threshold: effectiveThreshold(lenderKBs),
      match_count: limit,
      match_knowledge_base_ids: lenderKBs,
    });
    if (t2Results && t2Results.length > 0) {
      return { results: t2Results, tier: 2, knowledgeBasesQueried: allQueried, fallbackUsed: false, keywordFallbackUsed: false, latencyMs: Date.now() - startTime };
    }
  }

  // Tier 3: Agent-specific KBs
  tier = 3;
  const agentKBs = AGENT_KB_ROUTING[agentId] || [];
  if (agentKBs.length > 0) {
    const newKBs = agentKBs.filter(kb => !allQueried.includes(kb));
    if (newKBs.length > 0) {
      allQueried.push(...newKBs);
      const { data: t3Results } = await supabase.rpc("search_knowledge_chunks", {
        query_embedding_text: embeddingStr,
        match_agent_id: agentId,
        match_threshold: effectiveThreshold([...new Set([...agentKBs])]),
        match_count: limit,
        match_knowledge_base_ids: [...new Set([...agentKBs])],
        match_tenure_type: tenure?.toLowerCase() || null,
      });
      if (t3Results && t3Results.length > 0) {
        return { results: t3Results, tier: 3, knowledgeBasesQueried: allQueried, fallbackUsed: false, keywordFallbackUsed: false, latencyMs: Date.now() - startTime };
      }
    }
  }

  // Tier 4: Global vector fallback (agent_id-based, no KB filter)
  tier = 4;
  fallbackUsed = true;
  allQueried.push("global-fallback");
  const { data: t4Results, error } = await supabase.rpc("search_knowledge_chunks", {
    query_embedding_text: embeddingStr,
    match_agent_id: agentId,
    match_threshold: threshold,
    match_count: limit,
    match_knowledge_base_ids: null,
    match_tenure_type: null,
  });

  if (error) throw error;

  // Tier 5: Keyword fallback — if vector search returned < 2 results,
  // supplement with full-text search
  const vectorResults = t4Results || [];
  if (vectorResults.length < 2) {
    console.log(`[hybrid-search] Vector returned ${vectorResults.length} results, trying keyword fallback`);
    keywordFallbackUsed = true;
    allQueried.push("keyword-fallback");

    // Search across agent KBs first, then global
    const kbsToSearch = agentKBs.length > 0 ? agentKBs : null;
    const kwResults = await keywordSearch(
      supabase,
      queryText,
      agentId,
      limit,
      kbsToSearch,
      tenure?.toLowerCase(),
    );

    const merged = mergeResults(vectorResults, kwResults);
    console.log(`[hybrid-search] Keyword returned ${kwResults.length} results, merged total: ${merged.length}`);
    return { results: merged.slice(0, limit), tier: 5, knowledgeBasesQueried: allQueried, fallbackUsed, keywordFallbackUsed, latencyMs: Date.now() - startTime };
  }

  return { results: vectorResults, tier: 4, knowledgeBasesQueried: allQueried, fallbackUsed, keywordFallbackUsed: false, latencyMs: Date.now() - startTime };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !LOVABLE_API_KEY) throw new Error("Server config missing");

    // ── Auth guard ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // Allow service-role key for internal batch calls (embed-knowledge, benchmark-worker)
    const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
    let verifiedUserId: string | null = null;

    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      verifiedUserId = user.id;
    }

    const {
      query,
      agentId = "source-of-wealth",
      threshold = 0.5,
      limit = 5,
      tenure,
      lenderInvolved,
      caseId,
    } = await req.json();

    // Use verified userId; for service-role calls fall back to nil UUID
    const userId = verifiedUserId ?? "00000000-0000-0000-0000-000000000000";

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embedding for the query
    const embedding = await generateEmbedding(LOVABLE_API_KEY, query);
    const embeddingStr = `[${embedding.join(",")}]`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Tiered retrieval
    const retrieval = await tieredRetrieval(
      supabase,
      embeddingStr,
      query,
      agentId,
      tenure,
      lenderInvolved,
      threshold,
      limit,
    );

    // Log retrieval for audit
    try {
      await supabase.from("retrieval_logs").insert({
        agent_id: agentId,
        user_id: userId || null,
        case_id: caseId || null,
        query_text: query.slice(0, 500),
        knowledge_bases_queried: retrieval.knowledgeBasesQueried,
        documents_retrieved: retrieval.results.map((r: any) => ({
          chunk_id: r.chunk_id,
          document_id: r.chunk_document_id,
          title: r.document_title,
          similarity: r.similarity,
          knowledge_base_id: r.knowledge_base_id,
        })),
        retrieval_tier: retrieval.tier,
        fallback_used: retrieval.fallbackUsed,
        total_chunks_scanned: retrieval.results.length,
        top_similarity: retrieval.results[0]?.similarity || null,
        latency_ms: retrieval.latencyMs,
        metadata: { tenure, lenderInvolved, keywordFallbackUsed: retrieval.keywordFallbackUsed },
      });
    } catch (logErr) {
      console.error("Retrieval log insert error (non-fatal):", logErr);
    }

    return new Response(
      JSON.stringify({
        results: retrieval.results || [],
        tier: retrieval.tier,
        fallbackUsed: retrieval.fallbackUsed,
        keywordFallbackUsed: retrieval.keywordFallbackUsed,
        latencyMs: retrieval.latencyMs,
        knowledgeBasesQueried: retrieval.knowledgeBasesQueried,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("search-knowledge error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

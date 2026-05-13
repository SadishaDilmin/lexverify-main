import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, case_id, bucket, top_k = 5, threshold = 0.4 } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Query must be at least 3 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // 1. Embed the query
    const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-004", input: query.trim(), dimensions: 768 }),
    });

    if (!embResp.ok) {
      const errText = await embResp.text();
      console.error(`[search-kb] Embedding failed [${embResp.status}]:`, errText);
      throw new Error("Failed to generate query embedding");
    }

    const embJson = await embResp.json();
    const queryEmbedding = embJson.data?.[0]?.embedding;
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new Error("Invalid embedding response");
    }

    // 2. Semantic search via DB function
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: results, error: searchErr } = await supabase.rpc("search_knowledge_base_semantic", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: top_k,
      match_threshold: threshold,
      filter_bucket: bucket || null,
      filter_case_id: case_id || null,
    });

    if (searchErr) {
      console.error("[search-kb] RPC error:", searchErr);
      throw new Error(`Search failed: ${searchErr.message}`);
    }

    // 3. Generate a summary answer using the top results as context
    let summary: string | null = null;
    if (results && results.length > 0) {
      const context = results.map((r: any, i: number) =>
        `[Source ${i + 1}: ${r.file_name} (chunk ${r.chunk_index})]:\n${r.raw_text?.slice(0, 2000) ?? ""}`
      ).join("\n\n---\n\n");

      const { chat: aiChat, extractContent: ec } = await import("../_shared/aiGateway.ts");

      try {
        const answerResp = await aiChat({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a legal research assistant. Answer the user's question using ONLY the provided document extracts. Cite source numbers [Source X] for every claim. If the documents don't contain enough information, say so clearly. Be concise and precise." },
            { role: "user", content: `Question: ${query}\n\nDocument Extracts:\n${context}` },
          ],
          max_tokens: 2000,
        }, "search-knowledge-base-answer");

        summary = ec(answerResp) || null;
      } catch (err) {
        console.error("[search-kb] Answer generation failed:", err);
      }
    }

    return new Response(JSON.stringify({
      results: (results || []).map((r: any) => ({
        id: r.id,
        file_name: r.file_name,
        file_path: r.file_path,
        bucket: r.bucket,
        chunk_index: r.chunk_index,
        similarity: Math.round(r.similarity * 100) / 100,
        snippet: r.raw_text?.slice(0, 500) ?? "",
        metadata: r.metadata,
      })),
      summary,
      total: results?.length ?? 0,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[search-kb] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

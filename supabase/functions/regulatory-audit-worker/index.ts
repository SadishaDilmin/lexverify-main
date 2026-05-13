import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HMLR_KEYWORDS = [
  "option agreement",
  "pre-emption",
  "pre emption",
  "promotion agreement",
  "contractual control",
  "right of pre-emption",
  "overage agreement",
  "clawback agreement",
];

const CUTOFF_DATE = "2021-04-06"; // Agreements dated after this date

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    console.log("[regulatory-audit] Starting retrospective HMLR audit scan...");

    // 1. Scan knowledge_base_content for keyword matches
    const { data: allContent, error: fetchErr } = await supabase
      .from("knowledge_base_content")
      .select("id, file_path, bucket, file_name, raw_text, metadata, file_type")
      .eq("status", "completed")
      .not("raw_text", "is", null);

    if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);

    const findings: any[] = [];
    const now = new Date().toISOString().slice(0, 10);

    for (const doc of allContent ?? []) {
      if (!doc.raw_text) continue;
      const textLower = doc.raw_text.toLowerCase();

      // Check for keyword matches
      const matchedKeywords = HMLR_KEYWORDS.filter((kw) => textLower.includes(kw));
      if (matchedKeywords.length === 0) continue;

      // Determine agreement type
      let agreementType = "unknown";
      if (textLower.includes("option agreement")) agreementType = "option_agreement";
      else if (textLower.includes("pre-emption") || textLower.includes("pre emption")) agreementType = "pre_emption";
      else if (textLower.includes("promotion agreement")) agreementType = "promotion_agreement";
      else if (textLower.includes("overage")) agreementType = "overage_agreement";
      else if (textLower.includes("clawback")) agreementType = "clawback_agreement";

      // Try to extract a date from the document
      const dateRegex = /(?:dated|date[d]?)\s*[:.]?\s*(\d{1,2}[\s/.-]\w{3,9}[\s/.-]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})/gi;
      let detectedDate: string | null = null;
      const dateMatch = dateRegex.exec(doc.raw_text);
      if (dateMatch) {
        try {
          const parsed = new Date(dateMatch[1]);
          if (!isNaN(parsed.getTime())) {
            detectedDate = parsed.toISOString().slice(0, 10);
          }
        } catch { /* ignore parse failures */ }
      }

      // Filter: Only agreements dated after April 6, 2021, and before today
      if (detectedDate && (detectedDate < CUTOFF_DATE || detectedDate > now)) continue;

      // Extract case_id from file_path (usually first segment is the case UUID)
      const pathParts = doc.file_path.split("/");
      const possibleCaseId = pathParts[0]?.match(/^[0-9a-f-]{36}$/i) ? pathParts[0] : null;

      // Get snippet around the match
      const firstKeyword = matchedKeywords[0];
      const idx = textLower.indexOf(firstKeyword);
      const snippetStart = Math.max(0, idx - 100);
      const snippetEnd = Math.min(doc.raw_text.length, idx + firstKeyword.length + 300);
      const snippet = doc.raw_text.slice(snippetStart, snippetEnd);

      findings.push({
        file_path: doc.file_path.replace(/#chunk\d+$/, ""),
        bucket: doc.bucket,
        file_name: doc.file_name,
        case_id: possibleCaseId,
        match_type: "contractual_control",
        agreement_type: agreementType,
        detected_date: detectedDate,
        similarity_score: 1.0, // keyword match = exact
        snippet,
      });
    }

    // 2. Also do semantic search for each keyword
    for (const keyword of ["option agreement HMLR disclosure", "pre-emption right contractual control", "promotion agreement land registry"]) {
      try {
        const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-004", input: keyword, dimensions: 768 }),
        });

        if (!embResp.ok) continue;
        const embJson = await embResp.json();
        const queryEmbedding = embJson.data?.[0]?.embedding;
        if (!queryEmbedding) continue;

        const { data: semanticResults } = await supabase.rpc("search_knowledge_base_semantic", {
          query_embedding: `[${queryEmbedding.join(",")}]`,
          match_count: 10,
          match_threshold: 0.6,
        });

        for (const r of semanticResults ?? []) {
          // Avoid duplicates
          const cleanPath = r.file_path?.replace(/#chunk\d+$/, "") ?? "";
          if (findings.some((f: any) => f.file_path === cleanPath)) continue;

          const pathParts = cleanPath.split("/");
          const possibleCaseId = pathParts[0]?.match(/^[0-9a-f-]{36}$/i) ? pathParts[0] : null;

          findings.push({
            file_path: cleanPath,
            bucket: r.bucket,
            file_name: r.file_name,
            case_id: possibleCaseId,
            match_type: "contractual_control",
            agreement_type: "semantic_match",
            detected_date: null,
            similarity_score: r.similarity,
            snippet: r.raw_text?.slice(0, 400) ?? "",
          });
        }
      } catch (e) {
        console.error(`[regulatory-audit] Semantic search failed for "${keyword}":`, e);
      }
    }

    // 3. Deduplicate by file_path
    const uniqueFindings = new Map<string, any>();
    for (const f of findings) {
      if (!uniqueFindings.has(f.file_path) || f.similarity_score > (uniqueFindings.get(f.file_path)?.similarity_score ?? 0)) {
        uniqueFindings.set(f.file_path, f);
      }
    }

    // 4. Look up case references
    const caseIds = [...new Set([...uniqueFindings.values()].map((f) => f.case_id).filter(Boolean))];
    let caseRefMap = new Map<string, string>();
    if (caseIds.length > 0) {
      const { data: cases } = await supabase
        .from("cases")
        .select("id, case_reference")
        .in("id", caseIds.slice(0, 100));
      if (cases) {
        for (const c of cases) caseRefMap.set(c.id, c.case_reference);
      }
    }

    // 5. Upsert findings
    const toUpsert = [...uniqueFindings.values()].map((f) => ({
      ...f,
      case_reference: f.case_id ? caseRefMap.get(f.case_id) ?? null : null,
    }));

    if (toUpsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("regulatory_audit_findings")
        .upsert(toUpsert, { onConflict: "file_path,bucket" });
      if (insertErr) console.error("[regulatory-audit] Upsert error:", insertErr.message);
    }

    console.log(`[regulatory-audit] ✓ Found ${toUpsert.length} documents matching HMLR contractual control criteria`);

    return new Response(JSON.stringify({
      total_scanned: allContent?.length ?? 0,
      findings: toUpsert.length,
      agreement_types: {
        option_agreement: toUpsert.filter((f) => f.agreement_type === "option_agreement").length,
        pre_emption: toUpsert.filter((f) => f.agreement_type === "pre_emption").length,
        promotion_agreement: toUpsert.filter((f) => f.agreement_type === "promotion_agreement").length,
        semantic_match: toUpsert.filter((f) => f.agreement_type === "semantic_match").length,
        other: toUpsert.filter((f) => !["option_agreement", "pre_emption", "promotion_agreement", "semantic_match"].includes(f.agreement_type)).length,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[regulatory-audit] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

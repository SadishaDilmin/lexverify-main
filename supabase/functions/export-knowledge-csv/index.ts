import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin role check
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: docs, error } = await adminClient
      .from("knowledge_documents")
      .select("id, title, file_name, category, agent_id, status, jurisdiction, doc_type_tag, description, source_url, chunk_count, knowledge_base_ids, tenure_types, transaction_types, risk_categories, lender_relevance, content_text, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const escCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const s = Array.isArray(val) ? val.join(";") : String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = ["id","title","file_name","category","agent_id","status","jurisdiction","doc_type_tag","description","source_url","chunk_count","knowledge_base_ids","tenure_types","transaction_types","risk_categories","lender_relevance","content_text","created_at"];
    const csvLines = [headers.join(",")];

    for (const doc of (docs || [])) {
      const row = headers.map(h => escCsv((doc as any)[h]));
      csvLines.push(row.join(","));
    }

    const csv = csvLines.join("\n");

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=knowledge_documents.csv",
      },
    });
  } catch (e) {
    console.error("Export error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

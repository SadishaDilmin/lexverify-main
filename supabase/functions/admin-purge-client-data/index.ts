// One-shot administrative purge of client case data.
// Deletes storage objects in case-documents and case-linked DB rows.
// Preserves: profiles, user_roles, audit_log, credits.
// Auth: requires header X-Purge-Token matching service role key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-purge-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const URL = Deno.env.get("SUPABASE_URL")!;
  const token = req.headers.get("x-purge-token");
  if (!token || token !== SRK) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sb = createClient(URL, SRK);
  const result: Record<string, unknown> = {};

  // 1) Purge storage (case-documents bucket)
  const bucket = "case-documents";
  let removedFiles = 0;
  async function purgeFolder(prefix: string) {
    let offset = 0;
    while (true) {
      const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      const folders = data.filter((d) => d.id === null);
      const files = data.filter((d) => d.id !== null);
      if (files.length) {
        const paths = files.map((f) => (prefix ? `${prefix}/${f.name}` : f.name));
        const { error: de } = await sb.storage.from(bucket).remove(paths);
        if (de) throw de;
        removedFiles += paths.length;
      }
      for (const f of folders) await purgeFolder(prefix ? `${prefix}/${f.name}` : f.name);
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  await purgeFolder("");
  result.storage_objects_removed = removedFiles;

  // 2) DB tables
  const tables = [
    ["knowledge_base_content_case", async () =>
      await sb.from("knowledge_base_content").delete().eq("bucket", "case-documents")],
    ["agent_feedback", async () => await sb.from("agent_feedback").delete().not("case_id", "is", null)],
    ["ai_reports", async () => await sb.from("ai_reports").delete().not("id", "is", null)],
    ["case_notes", async () => await sb.from("case_notes").delete().not("id", "is", null)],
    ["case_parties", async () => await sb.from("case_parties").delete().not("id", "is", null)],
    ["validation_traces", async () => await sb.from("validation_traces").delete().not("id", "is", null)],
    ["review_audit_trail", async () => await sb.from("review_audit_trail").delete().not("id", "is", null)],
    ["cases", async () => await sb.from("cases").delete().not("id", "is", null)],
  ] as const;

  for (const [name, fn] of tables) {
    const { error } = await fn();
    result[name] = error ? `error: ${error.message}` : "ok";
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

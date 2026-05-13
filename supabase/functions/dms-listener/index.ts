import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dms-signature, x-dms-provider",
};

async function verifyHMAC(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature.replace(/^sha256=/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const rawBody = await req.text();
    const provider = req.headers.get("x-dms-provider") || "";
    const signature = req.headers.get("x-dms-signature") || "";

    // 1. Look up active integration for this provider
    const { data: integration, error: intErr } = await sb
      .from("dms_integrations")
      .select("*")
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ error: "No active integration for provider" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. HMAC-SHA256 signature verification
    if (!integration.webhook_secret || !signature) {
      return new Response(
        JSON.stringify({ error: "Missing webhook secret or signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const valid = await verifyHMAC(rawBody, signature, integration.webhook_secret);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Invalid HMAC signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse event
    const event = JSON.parse(rawBody);
    const eventType = event.event_type || event.type || "";
    if (eventType !== "new_document" && eventType !== "document.created") {
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Not a new_document event" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const workspaceId = event.workspace_id || event.folder_id || "";
    const documentName = event.document_name || event.file_name || "Untitled";
    const documentPath = event.document_path || event.file_path || "";

    // 4. Check triage rules
    const { data: rules } = await sb
      .from("proactive_triage_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("dms_integration_id", integration.id);

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ status: "no_matching_rule", workspace_id: workspaceId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rule = rules[0];
    const ruleName = rule.label || `Rule ${rule.id.slice(0, 8)}`;

    // 5. Generate EU AI Act justification statement
    const aiJustification = `Automated processing initiated based on Triage Rule "${ruleName}" for Workspace "${workspaceId}". Purpose: Quality assurance for ${rule.priority}-priority legal matter. Provider: ${provider}. Document: "${documentName}". Compliant with EU AI Act Art. 14 transparency requirements.`;

    const triggerContext = {
      trigger_type: "proactive",
      rule_id: rule.id,
      rule_name: ruleName,
      ai_justification: aiJustification,
      provider,
      workspace_id: workspaceId,
      document_name: documentName,
      triggered_at: new Date().toISOString(),
    };

    // 6. Create benchmark case for evaluation with trigger_context
    const { data: benchCase, error: bcErr } = await sb
      .from("benchmark_cases")
      .insert({
        title: `DMS Auto: ${documentName}`,
        created_by: "system-dms-listener",
        agent_type: rule.agent_id,
        source_type: "dms_proactive",
        property_address: workspaceId,
        status: "pending",
        notes: `Auto-created from ${provider} workspace ${workspaceId}. Priority: ${rule.priority}.`,
        trigger_context: triggerContext,
        oversight_status: "pending_review",
      })
      .select("id")
      .single();

    if (bcErr) {
      console.error("Failed to create benchmark case:", bcErr);
      return new Response(
        JSON.stringify({ error: "Failed to create benchmark case" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Trigger evaluation worker via batch
    const { data: batch } = await sb
      .from("benchmark_batches")
      .insert({
        created_by: "system-dms-listener",
        total_cases: 1,
        status: "running",
        agent_filter: rule.agent_id,
        source_filter: "dms_proactive",
      })
      .select("id")
      .single();

    if (batch) {
      await sb.from("benchmark_job_items").insert({
        batch_id: batch.id,
        benchmark_case_id: benchCase!.id,
        status: "pending",
      });
    }

    // 7. Check confidence and create triage notification if below 90%
    // The worker will process async; for immediate triage, create a proactive notification
    // that will be updated once the worker finishes.
    // For high-priority rules, always notify admins.
    if (rule.priority === "high") {
      // Get admin user IDs
      const { data: admins } = await sb
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      if (admins) {
        const notifications = admins.map((a: { user_id: string }) => ({
          user_id: a.user_id,
          title: `DMS Document: ${documentName}`,
          message: `New document detected in ${provider} workspace "${workspaceId}". Auto-evaluation started using ${rule.agent_id}. Priority: ${rule.priority}.`,
          notification_type: "dms_triage",
          severity: rule.priority === "high" ? "warning" : "info",
          agent_id: rule.agent_id,
          metadata: {
            benchmark_case_id: benchCase!.id,
            batch_id: batch?.id,
            provider,
            workspace_id: workspaceId,
            document_name: documentName,
          },
        }));
        await sb.from("proactive_notifications").insert(notifications);
      }
    }

    return new Response(
      JSON.stringify({
        status: "processed",
        benchmark_case_id: benchCase!.id,
        batch_id: batch?.id,
        agent_id: rule.agent_id,
        priority: rule.priority,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("DMS listener error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

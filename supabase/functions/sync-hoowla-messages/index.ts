import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/cmsEncryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { matter_id, case_id } = body;

    if (!matter_id || !case_id) {
      return new Response(
        JSON.stringify({ error: "matter_id and case_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify user owns the case
    const { data: caseData, error: caseErr } = await supabase
      .from("cases")
      .select("id, conveyancer_id")
      .eq("id", case_id)
      .single();

    if (caseErr || !caseData) {
      return new Response(
        JSON.stringify({ error: "Case not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { resolveActiveCmsIntegration } = await import("../_shared/resolveCmsIntegration.ts");

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, firm_name")
      .eq("user_id", userId)
      .single();

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { integration, matchType } = await resolveActiveCmsIntegration(adminClient, {
      provider: "hoowla",
      userId,
      profileEmail: profile?.email ?? userData.user.email ?? null,
      profileFirmName: profile?.firm_name ?? null,
    });

    if (matchType === "ambiguous") {
      return new Response(
        JSON.stringify({ error: "Multiple Hoowla integrations could match your account. Please ask your administrator to review the CMS integration setup." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ error: "No active Hoowla integration found for your account" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[sync-hoowla-messages] Resolved integration via ${matchType ?? "unknown"}: ${integration.id}`);

    const hoowlaBaseUrl = integration.api_base_url.replace(/\/$/, "");
    let decryptedKey: string;
    try {
      decryptedKey = await decryptApiKey(integration.api_key_encrypted);
    } catch (decryptErr) {
      console.error("Failed to decrypt API key:", decryptErr);
      return new Response(
        JSON.stringify({ error: "Failed to decrypt CMS API key. Please re-save your Hoowla integration in Admin → CMS Integrations with the current API key." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const hoowlaApiKey = decryptedKey;
    const hoowlaUserEmail = integration.provider_user_email;
    const encodedEmail = encodeURIComponent(hoowlaUserEmail);
    const encodedMatterId = encodeURIComponent(matter_id.trim());

    // Step 1: Fetch message list from Hoowla
    // GET /api/v2/cases/messages/?user={email}&case={caseid}
    const messagesUrl = `${hoowlaBaseUrl}/api/v2/cases/messages/?user=${encodedEmail}&case=${encodedMatterId}`;
    console.log(`Fetching Hoowla messages: ${messagesUrl}`);

    const messagesRes = await fetch(messagesUrl, {
      method: "GET",
      headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
    });

    if (!messagesRes.ok) {
      const errText = await messagesRes.text();
      console.error(`Hoowla messages error [${messagesRes.status}]:`, errText);

      if (messagesRes.status === 401) {
        return new Response(
          JSON.stringify({ error: "Hoowla authentication failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          synced: 0,
          skipped: 0,
          message: "Messages endpoint not available for this case",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messagesRaw = await messagesRes.json();
    const messageList = Array.isArray(messagesRaw)
      ? messagesRaw
      : messagesRaw?.results || messagesRaw?.data || messagesRaw?.items || [];

    console.log(`Hoowla message count: ${messageList.length}`);

    if (messageList.length === 0) {
      return new Response(
        JSON.stringify({ synced: 0, skipped: 0, message: "No messages found in Hoowla" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Get existing synced message IDs to avoid re-fetching content
    const { data: existingMessages } = await supabase
      .from("case_correspondence")
      .select("hoowla_message_id")
      .eq("case_id", case_id);

    const existingIds = new Set(
      (existingMessages || []).map((m: any) => String(m.hoowla_message_id)),
    );

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    // Step 3: Process each message
    for (const msg of messageList) {
      const messageId = String(msg.id || msg.message_id || "");
      if (!messageId) {
        skipped++;
        continue;
      }

      // Skip already-synced messages
      if (existingIds.has(messageId)) {
        skipped++;
        continue;
      }

      // Fetch message content
      // GET /api/v2/messages/message/content?id={message_id}
      let htmlContent: string | null = null;
      try {
        const contentRes = await fetch(
          `${hoowlaBaseUrl}/api/v2/messages/message/content?id=${encodeURIComponent(messageId)}`,
          {
            method: "GET",
            headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
          },
        );

        if (contentRes.ok) {
          const contentData = await contentRes.json();
          htmlContent = contentData?.content || contentData?.message_content || null;
        } else {
          await contentRes.text(); // consume body
          console.warn(`Failed to fetch content for message ${messageId}: ${contentRes.status}`);
        }
      } catch (e) {
        console.warn(`Error fetching content for message ${messageId}:`, e);
      }

      // Parse recipients
      const toRecipients = (msg.to || []).map((r: any) => ({
        name: r.name || r.Name || "",
        email: r.email || r.Email || "",
      }));
      const ccRecipients = (msg.cc || []).map((r: any) => ({
        name: r.name || r.Name || "",
        email: r.email || r.Email || "",
      }));
      const bccRecipients = (msg.bcc || []).map((r: any) => ({
        name: r.name || r.Name || "",
        email: r.email || r.Email || "",
      }));

      // Parse attachments
      const attachments = (msg.attachments || []).map((a: any) => ({
        title: a.title || a.name || "",
        document_id: a.document_id || null,
        content_id: a.content_id || null,
        inline: a.inline || false,
      }));

      // Parse sent date
      const sentAt = msg.date || msg.sent || msg.created || null;

      // Insert into case_correspondence
      try {
        const { error: insertErr } = await supabase
          .from("case_correspondence")
          .insert({
            case_id,
            hoowla_message_id: messageId,
            subject: msg.subject || "(No subject)",
            from_name: msg.from?.name || msg.from?.Name || null,
            from_email: msg.from?.email || msg.from?.Email || null,
            to_recipients: toRecipients,
            cc_recipients: ccRecipients,
            bcc_recipients: bccRecipients,
            attachments,
            html_content: htmlContent,
            sent_at: sentAt ? new Date(sentAt).toISOString() : null,
            synced_by: userId,
          } as any);

        if (insertErr) {
          // Unique constraint violation = already synced (race condition)
          if (insertErr.code === "23505") {
            skipped++;
          } else {
            console.error(`Insert error for message ${messageId}:`, insertErr);
            failed++;
          }
        } else {
          synced++;
          console.log(`✓ Synced message: ${msg.subject || messageId}`);
        }
      } catch (e) {
        console.error(`Error inserting message ${messageId}:`, e);
        failed++;
      }
    }

    // Audit log
    await supabase.from("audit_log").insert({
      case_reference: matter_id,
      user_id: userId,
      user_name: profile.firm_name,
      user_email: "",
      user_position: "",
      event_type: "hoowla_messages_synced",
      metadata: { case_id, synced, skipped, failed, total: messageList.length },
    });

    return new Response(
      JSON.stringify({ synced, skipped, failed, total: messageList.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-hoowla-messages error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

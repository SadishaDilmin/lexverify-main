import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/cmsEncryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Sync notes, alerts, and task updates from a Hoowla matter into the
 * case's "hoowla-notes" folder in Olimey AI storage.
 *
 * Each note/alert is saved as a Markdown file with metadata header.
 * Deduplication is handled via filename matching.
 */
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

    console.log(`[sync-hoowla-notes] Resolved integration via ${matchType ?? "unknown"}: ${integration.id}`);

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

    // ── Fetch notes, alerts, and tasks from multiple Hoowla endpoints ──
    interface HoowlaNote {
      id: string;
      type: "note" | "alert" | "task" | "update";
      title: string;
      content: string;
      createdAt: string;
      createdBy: string;
      status?: string;
      priority?: string;
    }

    const allNotes: HoowlaNote[] = [];

    // Try multiple Hoowla API endpoint patterns for notes, alerts, tasks
    const noteEndpoints = [
      { path: `/api/v2/cases/notes?case=${encodedMatterId}&user=${encodedEmail}`, type: "note" as const },
      { path: `/api/v2/cases/notes/?case=${encodedMatterId}&user=${encodedEmail}`, type: "note" as const },
      { path: `/api/v2/notes/notes?case=${encodedMatterId}&user=${encodedEmail}`, type: "note" as const },
      { path: `/api/v2/cases/alerts?case=${encodedMatterId}&user=${encodedEmail}`, type: "alert" as const },
      { path: `/api/v2/cases/alerts/?case=${encodedMatterId}&user=${encodedEmail}`, type: "alert" as const },
      { path: `/api/v2/alerts/alerts?case=${encodedMatterId}&user=${encodedEmail}`, type: "alert" as const },
      { path: `/api/v2/cases/tasks?case=${encodedMatterId}&user=${encodedEmail}`, type: "task" as const },
      { path: `/api/v2/cases/tasks/?case=${encodedMatterId}&user=${encodedEmail}`, type: "task" as const },
      { path: `/api/v2/tasks/tasks?case=${encodedMatterId}&user=${encodedEmail}`, type: "task" as const },
      { path: `/api/v2/cases/updates?case=${encodedMatterId}&user=${encodedEmail}`, type: "update" as const },
      { path: `/api/v2/cases/updates/?case=${encodedMatterId}&user=${encodedEmail}`, type: "update" as const },
      { path: `/api/v2/cases/activity?case=${encodedMatterId}&user=${encodedEmail}`, type: "update" as const },
      { path: `/api/v2/cases/milestones?case=${encodedMatterId}&user=${encodedEmail}`, type: "update" as const },
    ];

    // Track which endpoint types succeeded to avoid duplicate attempts
    const succeededTypes = new Set<string>();

    for (const endpoint of noteEndpoints) {
      if (succeededTypes.has(endpoint.type)) continue;

      const methods: Array<"GET" | "POST"> = ["GET", "POST"];
      for (const method of methods) {
        try {
          const res = await fetch(`${hoowlaBaseUrl}${endpoint.path}`, {
            method,
            headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
          });

          if (res.ok) {
            const raw = await res.json();
            const items = Array.isArray(raw) ? raw : (raw?.results || raw?.data || raw?.items || []);

            if (items.length > 0) {
              console.log(`✓ Hoowla ${endpoint.type} endpoint hit: ${endpoint.path} (${items.length} items, keys: ${Object.keys(items[0]).join(", ")})`);
              succeededTypes.add(endpoint.type);

              for (const item of items) {
                const noteId = String(item.id || item.note_id || item.alert_id || item.task_id || item.update_id || crypto.randomUUID());
                const title = item.title || item.name || item.subject || item.note_title || item.alert_title || item.task_name || "";
                const content = item.content || item.body || item.text || item.note || item.description || item.message || item.details || "";
                const createdAt = item.created_at || item.date || item.timestamp || item.created || item.updated_at || "";
                const createdBy = item.created_by || item.author || item.user || item.user_name || item.assigned_to || "";
                const status = item.status || item.state || "";
                const priority = item.priority || item.urgency || item.importance || "";

                if (!title && !content) continue;

                allNotes.push({
                  id: noteId,
                  type: endpoint.type,
                  title: title || `${endpoint.type.charAt(0).toUpperCase() + endpoint.type.slice(1)} ${noteId.slice(0, 8)}`,
                  content,
                  createdAt,
                  createdBy: typeof createdBy === "object" ? (createdBy?.name || createdBy?.email || JSON.stringify(createdBy)) : String(createdBy),
                  status: String(status),
                  priority: String(priority),
                });
              }
              break; // This method worked, skip the other method
            } else {
              await res.text(); // consume empty response
            }
          } else {
            await res.text(); // consume error body
          }
        } catch (e) {
          // Silently continue to next endpoint
        }
      }
    }

    console.log(`[sync-hoowla-notes] Found ${allNotes.length} total notes/alerts/tasks for matter ${matter_id}`);

    if (allNotes.length === 0) {
      return new Response(
        JSON.stringify({
          synced: 0,
          skipped: 0,
          message: "No notes, alerts, or tasks found in Hoowla for this case.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Ensure hoowla-notes folder exists ──
    await supabase.storage
      .from("case-documents")
      .upload(`${case_id}/hoowla-notes/.keep`, new Blob([""]), { upsert: true });

    // ── Check existing files for deduplication ──
    const { data: existingFiles } = await supabase.storage
      .from("case-documents")
      .list(`${case_id}/hoowla-notes`, { limit: 1000 });

    const existingNames = new Set(
      (existingFiles || []).map((f: any) => f.name)
    );

    let synced = 0;
    let skipped = 0;

    // Sort notes by date (oldest first so numbering is chronological)
    allNotes.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    for (const note of allNotes) {
      // Build a safe filename: type_shortId_sanitizedTitle.md
      const safeTitle = (note.title || "untitled")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 60);
      const shortId = String(note.id).slice(0, 8);
      const fileName = `${note.type}_${shortId}_${safeTitle}.md`;

      // Skip if already synced
      if (existingNames.has(fileName)) {
        skipped++;
        continue;
      }

      // Build markdown content
      const dateStr = note.createdAt
        ? new Date(note.createdAt).toLocaleString("en-GB", {
            dateStyle: "long",
            timeStyle: "short",
          })
        : "Unknown date";

      const typeLabel = note.type.charAt(0).toUpperCase() + note.type.slice(1);
      const statusLine = note.status ? `**Status:** ${note.status}` : "";
      const priorityLine = note.priority ? `**Priority:** ${note.priority}` : "";
      const authorLine = note.createdBy ? `**Author:** ${note.createdBy}` : "";

      const mdContent = [
        `# ${typeLabel}: ${note.title}`,
        "",
        `**Date:** ${dateStr}`,
        authorLine,
        statusLine,
        priorityLine,
        "",
        "---",
        "",
        note.content || "_No content_",
        "",
        "---",
        `_Synced from Hoowla on ${new Date().toISOString().slice(0, 10)}_`,
      ]
        .filter((line) => line !== "") // Remove empty metadata lines
        .join("\n");

      const storagePath = `${case_id}/hoowla-notes/${fileName}`;
      const blob = new Blob([mdContent], { type: "text/markdown" });

      const { error: uploadErr } = await supabase.storage
        .from("case-documents")
        .upload(storagePath, blob, { upsert: false });

      if (uploadErr) {
        console.warn(`[sync-hoowla-notes] Upload failed for "${fileName}":`, uploadErr.message);
        continue;
      }

      // Register in documents table
      try {
        const { data: existingDoc } = await supabase
          .from("documents")
          .select("id")
          .eq("case_id", case_id)
          .eq("file_path", storagePath)
          .maybeSingle();

        if (!existingDoc) {
          await supabase.from("documents").insert({
            case_id,
            doc_type: "hoowla_notes",
            file_name: fileName,
            file_path: storagePath,
            uploaded_by: userId,
          });
        }
      } catch (docErr: any) {
        console.warn(`[sync-hoowla-notes] Failed to register doc record:`, docErr?.message);
      }

      synced++;
      console.log(`✓ Synced ${note.type}: ${note.title}`);
    }

    // Audit log
    await supabase.from("audit_log").insert({
      case_reference: matter_id,
      user_id: userId,
      user_name: profile.firm_name,
      user_email: "",
      user_position: "",
      event_type: "hoowla_notes_synced",
      metadata: { synced, skipped, total: allNotes.length, case_id },
    });

    console.log(`[sync-hoowla-notes] Done: ${synced} synced, ${skipped} skipped`);

    return new Response(
      JSON.stringify({ synced, skipped, total: allNotes.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync-hoowla-notes] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

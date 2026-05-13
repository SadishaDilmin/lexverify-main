import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ActionRequest {
  action:
    | "activate"
    | "deactivate"
    | "suspend"
    | "reinstate"
    | "lock"
    | "unlock"
    | "soft_delete"
    | "restore"
    | "permanent_delete"
    | "send_password_reset"
    | "force_password_reset"
    | "revoke_sessions";
  target_user_id: string;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["admin", "super_admin"].includes(callerRole.role)) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ActionRequest = await req.json();
    const { action, target_user_id, reason } = body;

    if (!action || !target_user_id) {
      return new Response(JSON.stringify({ error: "Missing action or target_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller profile for audit
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("full_name, email, position")
      .eq("user_id", caller.id)
      .single();

    // Get target profile
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("*")
      .eq("user_id", target_user_id)
      .single();

    if (!targetProfile) {
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: cannot act on self for destructive actions
    const selfDestructive = ["deactivate", "suspend", "lock", "soft_delete", "permanent_delete"];
    if (caller.id === target_user_id && selfDestructive.includes(action)) {
      return new Response(JSON.stringify({ error: "Cannot perform this action on your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: protect last admin
    const destructiveForAdmin = ["deactivate", "suspend", "lock", "soft_delete", "permanent_delete"];
    if (destructiveForAdmin.includes(action)) {
      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", target_user_id)
        .single();

      if (["admin", "super_admin"].includes(targetRole?.role)) {
        const { count } = await adminClient
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .in("role", ["admin", "super_admin"]);

        if ((count ?? 0) <= 1) {
          return new Response(
            JSON.stringify({ error: "Cannot perform this action on the last administrator" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const currentStatus = targetProfile.status ?? (targetProfile.active ? "active" : "inactive");
    let newStatus: string | null = null;
    let profileUpdates: Record<string, unknown> = {};
    let auditEventType = "";
    let auditMetadata: Record<string, unknown> = { target_user_id, target_name: targetProfile.full_name, reason };

    switch (action) {
      case "activate":
        newStatus = "active";
        profileUpdates = { status: "active", active: true, suspended_at: null, locked_at: null, failed_login_attempts: 0, suspended_reason: null };
        auditEventType = "user_activated";
        break;

      case "deactivate":
        newStatus = "inactive";
        profileUpdates = { status: "inactive", active: false };
        auditEventType = "user_deactivated";
        break;

      case "suspend":
        newStatus = "suspended";
        profileUpdates = { status: "suspended", active: false, suspended_at: new Date().toISOString(), suspended_reason: reason ?? null };
        auditEventType = "user_suspended";
        break;

      case "reinstate":
        newStatus = "active";
        profileUpdates = { status: "active", active: true, suspended_at: null, suspended_reason: null };
        auditEventType = "user_reinstated";
        break;

      case "lock":
        newStatus = "locked";
        profileUpdates = { status: "locked", active: false, locked_at: new Date().toISOString() };
        auditEventType = "user_locked";
        break;

      case "unlock":
        newStatus = "active";
        profileUpdates = { status: "active", active: true, locked_at: null, failed_login_attempts: 0 };
        auditEventType = "user_unlocked";
        break;

      case "soft_delete":
        newStatus = "inactive";
        profileUpdates = { status: "inactive", active: false, deleted_at: new Date().toISOString() };
        auditEventType = "user_soft_deleted";
        break;

      case "restore":
        newStatus = "active";
        profileUpdates = { status: "active", active: true, deleted_at: null };
        auditEventType = "user_restored";
        break;

      case "permanent_delete": {
        // Delete auth user (cascades profile via FK)
        const { error: deleteErr } = await adminClient.auth.admin.deleteUser(target_user_id);
        if (deleteErr) throw deleteErr;
        auditEventType = "user_permanently_deleted";
        auditMetadata = { ...auditMetadata, deleted_email: targetProfile.email };
        // Audit log (profile may be gone, insert directly)
        await adminClient.from("audit_log").insert({
          user_id: caller.id,
          user_name: callerProfile?.full_name ?? "Admin",
          user_email: callerProfile?.email ?? "",
          user_position: callerProfile?.position ?? "",
          event_type: auditEventType,
          metadata: JSON.stringify(auditMetadata),
        });
        return new Response(JSON.stringify({ success: true, action }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send_password_reset": {
        const { error: resetErr } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: targetProfile.email,
        });
        if (resetErr) throw resetErr;
        auditEventType = "password_reset_sent";
        break;
      }

      case "force_password_reset": {
        // Update user metadata to require password change
        const { error: metaErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
          user_metadata: { force_password_reset: true },
        });
        if (metaErr) throw metaErr;
        auditEventType = "force_password_reset_set";
        break;
      }

      case "revoke_sessions": {
        // Sign out all sessions for this user
        const { error: signOutErr } = await adminClient.auth.admin.signOut(target_user_id);
        if (signOutErr) throw signOutErr;
        auditEventType = "sessions_revoked";
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Update profile if needed
    if (Object.keys(profileUpdates).length > 0) {
      const { error: updateErr } = await adminClient
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", target_user_id);
      if (updateErr) throw updateErr;
    }

    // Record status history if status changed
    if (newStatus && newStatus !== currentStatus) {
      await adminClient.from("user_status_history").insert({
        user_id: target_user_id,
        old_status: currentStatus,
        new_status: newStatus,
        changed_by: caller.id,
        reason: reason ?? null,
      });
    }

    // Audit log
    await adminClient.from("audit_log").insert({
      user_id: caller.id,
      user_name: callerProfile?.full_name ?? "Admin",
      user_email: callerProfile?.email ?? "",
      user_position: callerProfile?.position ?? "",
      event_type: auditEventType,
      metadata: JSON.stringify(auditMetadata),
    });

    return new Response(JSON.stringify({ success: true, action, new_status: newStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-user-actions error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

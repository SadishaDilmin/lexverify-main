import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptApiKey } from "../_shared/cmsEncryption.ts";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the user's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { provider, firm_name, api_base_url, api_key, provider_user_email, is_active } = body;

      if (!firm_name?.trim() || !api_base_url?.trim() || !api_key?.trim() || !provider_user_email?.trim()) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Encrypt the API key using edge function crypto
      let encResult: string;
      try {
        encResult = await encryptApiKey(api_key.trim());
      } catch (encErr) {
        console.error("Encryption error:", encErr);
        return new Response(JSON.stringify({ error: "Failed to encrypt API key: " + (encErr instanceof Error ? encErr.message : "Unknown error") }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await adminClient.from("cms_integrations").insert({
        provider: provider || "hoowla",
        firm_name: firm_name.trim(),
        api_base_url: api_base_url.trim(),
        api_key_encrypted: encResult,
        provider_user_email: provider_user_email.trim(),
        is_active: is_active ?? true,
        created_by: user.id,
      }).select("id, provider, firm_name, api_base_url, provider_user_email, is_active, created_at, updated_at").single();

      if (error) {
        const isDup = error.message?.includes("duplicate key") || error.code === "23505";
        return new Response(JSON.stringify({ error: isDup ? "An integration for this firm and provider already exists" : error.message }), {
          status: isDup ? 409 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { id, firm_name, api_base_url, api_key, provider_user_email, is_active } = body;

      if (!id) {
        return new Response(JSON.stringify({ error: "Missing integration ID" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = {
        firm_name: firm_name?.trim(),
        api_base_url: api_base_url?.trim(),
        provider_user_email: provider_user_email?.trim(),
        is_active,
      };

      // Only encrypt and update key if provided
      if (api_key?.trim()) {
        try {
          updates.api_key_encrypted = await encryptApiKey(api_key.trim());
        } catch (encErr) {
          return new Response(JSON.stringify({ error: "Failed to encrypt API key: " + (encErr instanceof Error ? encErr.message : "Unknown error") }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data, error } = await adminClient
        .from("cms_integrations")
        .update(updates)
        .eq("id", id)
        .select("id, provider, firm_name, api_base_url, provider_user_email, is_active, created_at, updated_at")
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { id } = body;
      const { error } = await adminClient.from("cms_integrations").delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle") {
      const { id, is_active } = body;
      const { error } = await adminClient
        .from("cms_integrations")
        .update({ is_active })
        .eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-cms-integration error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

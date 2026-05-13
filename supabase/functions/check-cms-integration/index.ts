import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActiveCmsIntegration } from "../_shared/resolveCmsIntegration.ts";

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === "string" && body.provider.trim() ? body.provider.trim() : "hoowla";

    const { data: profile } = await userClient
      .from("profiles")
      .select("email, firm_name")
      .eq("user_id", user.id)
      .single();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { integration, matchType } = await resolveActiveCmsIntegration(adminClient, {
      provider,
      userId: user.id,
      profileEmail: profile?.email ?? user.email ?? null,
      profileFirmName: profile?.firm_name ?? null,
    });

    return new Response(
      JSON.stringify({
        hasIntegration: Boolean(integration),
        provider,
        matchType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-cms-integration error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

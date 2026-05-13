import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { session_id } = await req.json();
    if (!session_id || typeof session_id !== "string") {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "Payment not completed", status: session.payment_status }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the session belongs to this user
    const sessionUserId = session.metadata?.user_id;
    if (sessionUserId !== user.id) {
      return new Response(JSON.stringify({ error: "Session does not belong to this user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credits = parseInt(session.metadata?.credits || "0", 10);
    if (credits <= 0) {
      return new Response(JSON.stringify({ error: "Invalid credit amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to update credits
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if already provisioned (idempotency via session_id in description)
    const { data: existingTx } = await adminClient
      .from("credit_transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("description", `Credit purchase: ${session_id}`)
      .maybeSingle();

    if (existingTx) {
      // Already provisioned
      const { data: currentCredits } = await adminClient
        .from("user_credits")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      return new Response(JSON.stringify({
        success: true,
        credits_added: credits,
        new_balance: currentCredits?.balance ?? 0,
        already_provisioned: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current balance
    const { data: creditRow } = await adminClient
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    const currentBalance = creditRow?.balance ?? 0;
    const newBalance = currentBalance + credits;

    // Update balance and mark as paid (no longer free trial)
    await adminClient
      .from("user_credits")
      .update({ balance: newBalance, is_free_trial: false })
      .eq("user_id", user.id);

    // Log the transaction
    await adminClient
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: credits,
        balance_after: newBalance,
        transaction_type: "purchase",
        description: `Credit purchase: ${session_id}`,
      });

    return new Response(JSON.stringify({
      success: true,
      credits_added: credits,
      new_balance: newBalance,
      already_provisioned: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("verify-payment error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

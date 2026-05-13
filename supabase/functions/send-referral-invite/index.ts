import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_REFERRALS = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Not authenticated");

    const body = await req.json();
    const { fullName, email, firmName, phone } = body;

    if (!fullName || !email) {
      return new Response(
        JSON.stringify({ error: "Full name and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Can't refer yourself
    if (email.toLowerCase() === user.email?.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "You cannot refer yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to check referral count (bypass RLS)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check referral limit
    const { count } = await adminClient
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id);

    if ((count ?? 0) >= MAX_REFERRALS) {
      return new Response(
        JSON.stringify({ error: `You have reached the maximum of ${MAX_REFERRALS} referrals` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check duplicate referral
    const { data: existing } = await adminClient
      .from("referrals")
      .select("id")
      .eq("referrer_id", user.id)
      .eq("referee_email", email.toLowerCase())
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ error: "You have already invited this person" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if email is already a registered user
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("email", email.toLowerCase())
      .limit(1);

    if (existingProfile && existingProfile.length > 0) {
      const firstName = (existingProfile[0].full_name || "").split(" ")[0] || "This person";
      return new Response(
        JSON.stringify({ error: "already_member", firstName }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get referrer profile for the email
    const { data: referrerProfile } = await adminClient
      .from("profiles")
      .select("full_name, firm_name")
      .eq("user_id", user.id)
      .single();

    // Insert referral using admin client (user already validated above)
    const { error: insertError } = await adminClient
      .from("referrals")
      .insert({
        referrer_id: user.id,
        referee_full_name: fullName.trim(),
        referee_email: email.toLowerCase().trim(),
        referee_firm_name: (firmName || "").trim(),
        referee_phone: (phone || "").trim(),
        status: "pending",
      });

    if (insertError) throw insertError;

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;

    if (resendKey) {
      const referrerName = referrerProfile?.full_name || "A colleague";
      const referrerFirm = referrerProfile?.firm_name || "";
      const signupUrl = `${req.headers.get("origin") || "https://lexsentinel-insight.lovable.app"}/signup`;

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e; margin-bottom: 16px;">You've been invited to Olimey AI</h2>
          <p style="color: #555; line-height: 1.6;">
            Hi ${fullName},
          </p>
          <p style="color: #555; line-height: 1.6;">
            <strong>${referrerName}</strong>${referrerFirm ? ` from ${referrerFirm}` : ""} has invited you to join 
            <strong>Olimey AI</strong> — an AI-powered platform for conveyancing professionals.
          </p>
          <p style="color: #555; line-height: 1.6;">
            When you sign up, both you and ${referrerName.split(" ")[0]} will receive <strong>£25 worth of credits</strong> to use across our AI agents.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signupUrl}" style="background-color: #1a1a2e; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Create Your Account
            </a>
          </div>
          <p style="color: #999; font-size: 12px; line-height: 1.5;">
            Olimey AI provides AI-assisted tools for conveyancing. This is not legal advice. 
            Please use the email address this was sent to when registering to claim your bonus credits.
          </p>
        </div>
      `;

      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_EMAIL") || "Olimey AI <onboarding@resend.dev>",
            to: [email],
            subject: `${referrerName} has invited you to Olimey AI`,
            html: emailHtml,
          }),
        });

        if (resendResponse.ok) {
          emailSent = true;
        } else {
          console.error("Resend error:", await resendResponse.text());
        }
      } catch (e) {
        console.error("Failed to send email:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
        message: emailSent
          ? "Invitation sent successfully"
          : "Referral recorded — email will be sent when email delivery is configured",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-referral-invite] error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

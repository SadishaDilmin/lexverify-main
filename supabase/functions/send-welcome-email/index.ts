import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
    // Auth guard: require valid JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { fullName, email } = await req.json();

    if (!fullName || !email) {
      return new Response(
        JSON.stringify({ error: "Full name and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstName = fullName.trim().split(" ")[0];

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = `
      <div style="font-family: 'Georgia', 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
        <div style="margin-bottom: 32px;">
          <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">
            <span style="color: #1a1a2e;">Lex</span><span style="color: #e8792b;">Sentinel</span>
          </span>
        </div>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 16px;">
          Hi ${firstName},
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 16px;">
          My name is Mahinan Pathmanathan — I am the CEO of Olimey AI.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 16px;">
          Thank you for signing up.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 16px;">
          We built Olimey AI because we understand the real, daily pressures that conveyancers face — regulatory risk, time constraints, lender requirements, and the constant demand for precision. Our aim is simple: to make compliance clearer, faster and more defensible, without adding complexity to your workflow.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 16px;">
          You are now part of a growing community of firms who want a smarter way to manage risk.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 16px;">
          If you have any feedback — good or bad — I would genuinely love to hear it. Your insights will help us refine and improve the platform. Please feel free to reply directly to this email. I read and respond personally.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.8; margin-bottom: 24px;">
          Thank you again for placing your trust in Olimey AI.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.6; margin-bottom: 4px;">
          Warm regards,
        </p>
        <p style="color: #1a1a2e; font-size: 15px; line-height: 1.4; margin-bottom: 2px; font-weight: 600;">
          Mahinan Pathmanathan
        </p>
        <p style="color: #777; font-size: 13px; line-height: 1.4; margin-bottom: 2px;">
          CEO
        </p>
        <p style="color: #777; font-size: 13px; line-height: 1.4;">
          Olimey AI
        </p>

        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;" />

        <p style="color: #999; font-size: 11px; line-height: 1.5;">
          Olimey AI Ltd · AI-powered risk intelligence for conveyancing professionals.
        </p>
      </div>
    `;

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Olimey AI <onboarding@resend.dev>";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Welcome to Olimey AI — from our CEO",
        html: emailHtml,
        reply_to: "mahinan@lexsentinel.co.uk",
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("Resend error:", errText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Welcome email error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

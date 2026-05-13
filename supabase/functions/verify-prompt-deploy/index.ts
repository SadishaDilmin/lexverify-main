import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getDeployedPrompt } from "../_shared/deployedPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Minimal synthetic documents per agent ── */
const AGENT_SCENARIOS: Record<string, { docs: string; expectedFields: string[] }> = {
  "source-of-wealth": {
    docs: `## Source of Wealth Declaration
Client: James Mitchell. Employment: Senior Software Engineer at TechCorp Ltd since 2018. Annual salary: £85,000.
Funding breakdown: Savings £40,000, Gift from parents £25,000, Mortgage £260,000.

## Bank Statements Summary (Last 6 months)
Current account average balance: £12,500. Regular salary credits of £5,200/month.
Large deposit: £25,000 on 15 Jan 2026 — annotated "Gift from J & M Mitchell (parents)".
No unusual patterns. Gambling transactions: none identified.

## Gift Declaration
Donors: John and Mary Mitchell (parents). Amount: £25,000. Source: Savings from pension drawdown.
Statutory declaration provided. No repayment obligation.`,
    expectedFields: ["risk_level", "risk_score"],
  },
};

/* ── AI call helper ── */
async function callAI(
  lovableKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    }),
  });
  if (!resp.ok) throw new Error(`AI call failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, version_id } = await req.json();
    if (!agent_id || !version_id) throw new Error("agent_id and version_id required");

    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    // Auth check
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!role) throw new Error("Admin access required");

    // Get deployed prompt
    const deployedPrompt = await getDeployedPrompt(agent_id);
    if (!deployedPrompt) {
      return new Response(
        JSON.stringify({ success: false, status: "no_prompt", message: "No deployed prompt found for this agent. The version may not be deployed yet." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pick scenario
    const scenario = AGENT_SCENARIOS[agent_id] ?? AGENT_SCENARIOS["source-of-wealth"];

    // Run the deployed prompt against the synthetic scenario
    const userPrompt = `Analyse these conveyancing documents and produce a structured risk assessment.

Documents:
${scenario.docs}

Transaction: Freehold Purchase, £325,000
Property: 14 Elm Grove, Bristol BS7 8TJ

Provide your full analysis including any risks, issues, and recommended actions.`;

    const startTime = Date.now();
    const response = await callAI(lovableKey, deployedPrompt, userPrompt);
    const durationMs = Date.now() - startTime;

    // Validate response
    const checks = {
      non_empty: response.trim().length > 100,
      contains_risk_language: /risk|issue|concern|flag|recommend|action/i.test(response),
      reasonable_length: response.length > 200 && response.length < 100000,
      no_error_markers: !/error|exception|failed|undefined/i.test(response.slice(0, 100)),
      response_time_ok: durationMs < 120000,
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.values(checks).length;
    const passed = passedChecks >= totalChecks - 1; // Allow 1 minor failure

    // Log to audit
    const { data: profile } = await admin.from("profiles").select("full_name, email, position").eq("user_id", user.id).single();
    if (profile) {
      await admin.from("audit_log").insert({
        user_id: user.id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position || "",
        event_type: "prompt_deploy_verified",
        metadata: {
          agent_id,
          version_id,
          passed,
          checks,
          duration_ms: durationMs,
          response_length: response.length,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: passed ? "pass" : "fail",
        checks,
        passed_count: passedChecks,
        total_checks: totalChecks,
        duration_ms: durationMs,
        response_preview: response.slice(0, 500),
        message: passed
          ? `✅ Deploy verified — prompt produced valid ${response.length}-char response in ${(durationMs / 1000).toFixed(1)}s`
          : `⚠️ Verification concerns — ${totalChecks - passedChecks} check(s) failed. Review response quality.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("verify-prompt-deploy error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

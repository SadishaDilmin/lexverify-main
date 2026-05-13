import { parallelChat, extractContent, type ChatRequest } from "../_shared/aiGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AgentPrompt {
  agentId: string;
  agentName: string;
  objective: string;
}

const AGENT_PROMPTS: AgentPrompt[] = [
  {
    agentId: "source-of-wealth",
    agentName: "Olimey AI",
    objective:
      "You are preparing context notes for a Source of Wealth AML assessment (Olimey AI). Focus on: purchase price and funding structure, party details and relationships, buyer types (company, overseas, etc.), any indicators of gifted deposits, multiple funding sources, or complex ownership structures. Highlight AML-relevant details.",
  },
];

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

    const body = await req.json();
    const { caseData } = body;

    if (!caseData) {
      return new Response(
        JSON.stringify({ error: "caseData is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a summary of the case data for the AI
    const caseSummary = buildCaseSummary(caseData);

    // Generate context for ALL agents in parallel using parallelChat
    const requests: ChatRequest[] = AGENT_PROMPTS.map((agent) => ({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `${agent.objective}

You are given structured case data imported from a case management system (Hoowla). Generate concise, actionable context notes (max 200 words) that will help the AI agent perform a better analysis. Write in professional English, using bullet points. Do NOT repeat the raw data — instead, synthesise and highlight what matters for this specific agent's objective.

If the data is insufficient to generate meaningful notes, return a brief statement noting what additional information would be helpful.`,
        },
        { role: "user", content: `Here is the case data:\n\n${caseSummary}` },
      ],
    }));

    const responses = await parallelChat(requests, {
      maxConcurrency: 4,
      logContext: "generate-agent-context",
    });

    const results: Record<string, string> = {};
    for (let i = 0; i < AGENT_PROMPTS.length; i++) {
      results[AGENT_PROMPTS[i].agentId] = extractContent(responses[i]);
    }

    return new Response(JSON.stringify({ contexts: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-agent-context error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildCaseSummary(caseData: any): string {
  const lines: string[] = [];

  if (caseData.case_reference) lines.push(`Case Reference: ${caseData.case_reference}`);
  if (caseData.property_address) lines.push(`Property Address: ${caseData.property_address}`);
  if (caseData.transaction_type) lines.push(`Transaction Type: ${caseData.transaction_type}`);
  if (caseData.tenure) lines.push(`Tenure: ${caseData.tenure}`);
  if (caseData.property_type) lines.push(`Property Type: ${caseData.property_type}`);
  if (caseData.lender) lines.push(`Lender: ${caseData.lender}`);
  if (caseData.seller_conveyancer_email) lines.push(`Seller's Conveyancer: ${caseData.seller_conveyancer_email}`);
  if (caseData.purchase_price != null) lines.push(`Purchase Price: £${Number(caseData.purchase_price).toLocaleString()}`);

  // PHASE 3 SDLT precedence resolution: form > Hoowla > absent.
  // The platform no longer computes SDLT — we surface the resolved figure plus
  // its source. If absent, we explicitly say "not provided" so downstream
  // funding-gap reasoning can flag the missing-evidence case rather than
  // silently treating SDLT as zero.
  const sdltForm = caseData.sdlt_form_value;
  const sdltHoowla = caseData.stamp_duty;
  let sdltResolved: number | null = null;
  let sdltSource: "form" | "cms" | "absent" = "absent";
  let sdltDivergenceLine: string | null = null;
  if (sdltForm != null) {
    sdltResolved = Number(sdltForm);
    sdltSource = "form";
    if (sdltHoowla != null && Number(sdltHoowla) !== sdltResolved) {
      sdltDivergenceLine = `Stamp Duty (SDLT) divergence: form value £${sdltResolved.toLocaleString()} differs from CMS value £${Number(sdltHoowla).toLocaleString()}. Manual figure used.`;
    }
  } else if (sdltHoowla != null) {
    sdltResolved = Number(sdltHoowla);
    sdltSource = "cms";
  }
  if (sdltResolved != null) {
    lines.push(`Stamp Duty (SDLT): £${sdltResolved.toLocaleString()} (source: ${sdltSource})`);
    if (sdltDivergenceLine) lines.push(sdltDivergenceLine);
  } else {
    lines.push(`Stamp Duty (SDLT): not provided by conveyancer or CMS — funding-gap reasoning must flag this dimension as MANUAL_REVIEW_REQUIRED rather than treat SDLT as zero.`);
  }

  // Surcharge AML signals (form-declared). NULL = not asserted by conveyancer.
  const surcharges: string[] = [];
  if (caseData.sdlt_form_additional_property_surcharge === true) surcharges.push("additional-property surcharge declared");
  if (caseData.sdlt_form_non_uk_resident_surcharge === true) surcharges.push("non-UK-resident surcharge declared");
  if (caseData.sdlt_form_first_time_buyer_relief === true) surcharges.push("first-time-buyer relief claimed");
  if (surcharges.length > 0) {
    lines.push(`SDLT surcharge AML signals: ${surcharges.join("; ")}`);
  }

  if (caseData.legal_fees != null) lines.push(`Legal Fees: £${Number(caseData.legal_fees).toLocaleString()}`);

  if (caseData.case_flags && caseData.case_flags.length > 0) {
    lines.push(`Case Flags: ${caseData.case_flags.join(", ")}`);
  }
  if (caseData.selected_add_ons && caseData.selected_add_ons.length > 0) {
    lines.push(`Selected Add-ons: ${caseData.selected_add_ons.join(", ")}`);
  }

  if (caseData.parties && caseData.parties.length > 0) {
    lines.push("\nParties:");
    for (const p of caseData.parties) {
      const parts = [`  - ${p.role}: ${p.full_name}`];
      if (p.email) parts.push(`(${p.email})`);
      if (p.buyer_type && p.buyer_type !== "standard") parts.push(`[${p.buyer_type}]`);
      if (p.pep_status && p.pep_status !== "unknown") parts.push(`PEP: ${p.pep_status}`);
      lines.push(parts.join(" "));
    }
  }

  if (caseData.warnings && caseData.warnings.length > 0) {
    lines.push(`\nData Warnings: ${caseData.warnings.join("; ")}`);
  }

  return lines.join("\n");
}

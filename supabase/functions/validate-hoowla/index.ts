import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { mappedData } = await req.json();
    if (!mappedData) {
      return new Response(JSON.stringify({ error: "Missing mappedData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // If no API key, return data as-is with no corrections
      console.warn("LOVABLE_API_KEY not configured, skipping LLM validation");
      return new Response(
        JSON.stringify({ validated: mappedData, corrections: [], warnings: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a data quality validator for a UK conveyancing case management system. You are reviewing data extracted from Hoowla (a CMS) before it populates a new case form.

Your job is to review the raw contributor data and the mapped output, then return corrections and warnings.

## Rules for Party Classification

Contributors from Hoowla have these fields:
- type: "user" (firm staff), "person" (external contacts), "linked" (firm's own clients)
- entity_name: describes the role group e.g. "Client", "Other Sides Client", "Other Sides Solicitor", "Estate Agent", "Source of Work"
- case_side: 0 = neutral, 1 = buyer side, 2 = seller side
- role_name: individual role like "Solicitor", "Individual", "Estate Agent"
- is_primary_client: whether this is the primary client

### Who should be a party?
- "Client" entity_name with type "linked" → purchaser (for purchase transactions) or seller (for sale transactions)
- "Other Sides Client" entity_name → the opposite party (seller for purchases, vendor for sales)
- Everyone else (solicitors, estate agents, sources of work, brokers, surveyors) should NOT be a party

### Field Validation
- transaction_type: should be "Purchase" or "Sale" based on case context
- tenure: Freehold, Leasehold, or Commonhold
- property_type: House, Flat, Maisonette, Bungalow, or Other
- seller_conveyancer_email: should be the email of the solicitor acting for the OTHER side, not the firm's own solicitor

You must respond with a JSON object (no markdown fencing) with these fields:
{
  "corrections": [
    {
      "field": "parties" | "transaction_type" | "tenure" | "property_type" | "seller_conveyancer_email" | "lender",
      "issue": "brief description of what's wrong",
      "corrected_value": <the corrected value - for parties this should be the full corrected array>
    }
  ],
  "warnings": ["any additional data quality warnings to show the user"],
  "confidence": "high" | "medium" | "low"
}

If everything looks correct, return empty corrections and warnings arrays.`;

    const userPrompt = `## Raw Hoowla Data

### Case Info
- Case name: ${mappedData._raw_case_name}
- Case type: ${mappedData._raw_case_type_name}

### Raw Contributors
${JSON.stringify(mappedData._raw_contributors, null, 2)}

## Mapped Output (rule-based extraction)
- Property Address: ${mappedData.property_address}
- Transaction Type: ${mappedData.transaction_type}
- Tenure: ${mappedData.tenure}
- Property Type: ${mappedData.property_type}
- Lender: ${mappedData.lender || "none"}
- Seller Conveyancer Email: ${mappedData.seller_conveyancer_email || "none"}
- Parties: ${JSON.stringify(mappedData.parties, null, 2)}
- Existing Warnings: ${JSON.stringify(mappedData.warnings, null, 2)}

Please validate the mapped output against the raw data and return your assessment as JSON.`;

    const { chat, extractContent: ec } = await import("../_shared/aiGateway.ts");

    let rawContent = "";
    try {
      const llmResult = await chat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }, "validate-hoowla");

      rawContent = ec(llmResult);
    } catch (err) {
      console.error("LLM validation failed:", err);
      return new Response(
        JSON.stringify({ validated: mappedData, corrections: [], warnings: ["AI validation unavailable — please review imported data manually."] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response (strip markdown fences if present)
    let parsed: { corrections?: any[]; warnings?: string[]; confidence?: string } = { corrections: [], warnings: [] };
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse LLM validation response:", parseErr, rawContent);
      return new Response(
        JSON.stringify({ validated: mappedData, corrections: [], warnings: ["AI validation returned an unparseable response — please review imported data manually."] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const corrections = parsed.corrections || [];
    const llmWarnings = parsed.warnings || [];

    // Apply corrections to create validated data
    const validated = { ...mappedData };
    const appliedCorrections: string[] = [];

    for (const correction of corrections) {
      const { field, issue, corrected_value } = correction;
      if (!field || corrected_value === undefined) continue;

      if (field === "parties" && Array.isArray(corrected_value)) {
        validated.parties = corrected_value;
        appliedCorrections.push(`Parties: ${issue}`);
      } else if (field === "transaction_type" && typeof corrected_value === "string") {
        validated.transaction_type = corrected_value;
        appliedCorrections.push(`Transaction type: ${issue}`);
      } else if (field === "tenure" && typeof corrected_value === "string") {
        validated.tenure = corrected_value;
        appliedCorrections.push(`Tenure: ${issue}`);
      } else if (field === "property_type" && typeof corrected_value === "string") {
        validated.property_type = corrected_value;
        appliedCorrections.push(`Property type: ${issue}`);
      } else if (field === "seller_conveyancer_email" && typeof corrected_value === "string") {
        validated.seller_conveyancer_email = corrected_value;
        appliedCorrections.push(`Seller conveyancer email: ${issue}`);
      } else if (field === "lender") {
        validated.lender = corrected_value;
        appliedCorrections.push(`Lender: ${issue}`);
      }
    }

    // Merge warnings
    const allWarnings = [...(validated.warnings || []), ...llmWarnings];
    validated.warnings = allWarnings;

    console.log("LLM validation result:", { corrections: appliedCorrections, warnings: llmWarnings, confidence: parsed.confidence });

    return new Response(
      JSON.stringify({
        validated,
        corrections: appliedCorrections,
        warnings: llmWarnings,
        confidence: parsed.confidence || "medium",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("validate-hoowla error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

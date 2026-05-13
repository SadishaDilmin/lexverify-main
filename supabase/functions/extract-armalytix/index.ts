import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth guard
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file } = await req.json() as {
      file: { base64: string; name: string; mimeType: string };
    };

    if (!file?.base64) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a data extraction specialist. You will receive a document that may be an Armalytix Source of Wealth / Source of Funds report, a bank statement, payslip, tax return, gift letter, or other financial document.

CRITICAL: You MUST determine the document type by reading and analysing its actual content — do NOT rely on the filename, as filenames are frequently misleading or generic (e.g. "document.pdf", "scan001.pdf"). Read the content carefully to identify what kind of document it is.

Your job is to extract structured data from it using the provided tool.

Extract ALL persons mentioned in the document (purchasers, giftors, donors). For each person extract their name, role, PRIMARY funding source, employment information, and contribution amounts where available.

CRITICAL — MORTGAGE AMOUNT: Armalytix reports almost always state the expected mortgage/lending amount (e.g., "Expected Mortgage", "Mortgage Amount", "Lending", "Borrowing"). You MUST extract this figure into the mortgageAmount field. This is essential for the funding gap calculation.

IMPORTANT: For the fundingSource field, identify the PRIMARY or largest source of funds for each person. Open Banking / Armalytix reports often list a "Primary Source of Funds" or "Main Source of Wealth" — use that value. If multiple sources are listed, pick the one with the highest value or the one explicitly labelled as primary.

Also extract the property/transaction details if present.

Rules:
- Determine the document type from its content, not the filename
- If a field is not found in the document, use an empty string
- For funding sources, map to the closest match from: Salary / Employment Income, Savings, Sale of Existing Property, Gift, Inheritance, Investment Proceeds, Pension Lump Sum, Compensation / Settlement, Business Profits, Mortgage, Other
- For employment status, map to: Employed, Self-Employed, Director / Business Owner, Retired, Not Currently Employed, Student, Other
- For relationships, map to: Parent, Grandparent, Spouse / Partner, Sibling, Other Family Member, Friend, Employer, Other
- Extract ALL persons found, even if information is partial
- In the additionalContext field, include what type of document this appears to be based on content analysis`;

    const userContent: any[] = [
      { type: "text", text: "Extract all structured data from this Armalytix report for a Source of Wealth assessment." },
    ];

    // Send as native multimodal content
    if (file.mimeType === "application/pdf") {
      userContent.push({
        type: "file",
        file: {
          filename: file.name,
          file_data: `data:application/pdf;base64,${file.base64}`,
        },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
      });
    }

    // Note: extract-armalytix uses tool calling, which routes to Lovable Gateway
    // (Vertex AI doesn't support OpenAI-style tools). The gateway handles routing.
    const { chat: aiChat, extractToolArgs } = await import("../_shared/aiGateway.ts");

    let extracted: any;
    try {
      const result = await aiChat({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_sow_data",
              description: "Extract structured Source of Wealth data from an Armalytix report",
              parameters: {
                type: "object",
                properties: {
                  propertyAddress: { type: "string", description: "Full property address" },
                  purchasePrice: { type: "string", description: "Purchase price without currency symbol, e.g. 450,000" },
                  mortgageAmount: { type: "string", description: "Mortgage amount without currency symbol" },
                  mortgageLender: { type: "string", description: "Mortgage lender name" },
                  mortgageType: { type: "string", description: "Mortgage type e.g. Repayment, Interest Only, Help to Buy" },
                  mortgageTerm: { type: "string", description: "Mortgage term e.g. 25 years" },
                  stampDuty: { type: "string", description: "Stamp duty amount if mentioned" },
                  legalFees: { type: "string", description: "Legal fees if mentioned" },
                  caseReference: { type: "string", description: "Case or matter reference" },
                  tenure: { type: "string", enum: ["Freehold", "Leasehold", "Share of Freehold", "Commonhold", "Unknown", ""] },
                  persons: {
                    type: "array",
                    description: "All persons mentioned in the report",
                    items: {
                      type: "object",
                      properties: {
                        fullName: { type: "string", description: "Full legal name" },
                        role: { type: "string", enum: ["Purchaser", "Giftor"] },
                        fundingSource: { type: "string", description: "Primary funding source" },
                        contributionAmount: { type: "string", description: "Contribution amount without currency symbol" },
                        employmentStatus: { type: "string", description: "Employment status" },
                        additionalNotes: { type: "string", description: "Any additional relevant notes from the report" },
                        relationshipToPurchaser: { type: "string", description: "Relationship to purchaser (for giftors only)" },
                      },
                      required: ["fullName", "role"],
                      additionalProperties: false,
                    },
                  },
                  documentType: { type: "string", description: "The type of document determined from its content (e.g. 'Armalytix SoW Report', 'Bank Statement', 'Payslip', 'Tax Return', 'Gift Letter', 'Mortgage Offer', 'Employment Contract', 'P60', 'Savings Statement', 'Investment Statement', 'Pension Statement', 'Other')" },
                  additionalContext: { type: "string", description: "Any other relevant information from the report not captured above" },
                },
                required: ["persons"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_sow_data" } },
      }, "extract-armalytix");

      extracted = extractToolArgs(result);
      if (!extracted) {
        return new Response(JSON.stringify({ error: "Could not extract structured data from the report. Please check the file is a valid Armalytix report." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (err: any) {
      console.error("AI gateway error:", err);

      if (err.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (err.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please top up credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Failed to extract data from report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-armalytix error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

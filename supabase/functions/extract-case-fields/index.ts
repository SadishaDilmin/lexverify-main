import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { listAllCaseFiles, getSupersededFilePaths } from "../_shared/caseFileScanner.ts";
import { processDocumentCached } from "../_shared/docCache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * extract-case-fields
 * Reads up to N case documents via AI to extract missing case fields.
 * NEVER overwrites existing (non-null/non-empty) values.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY is not configured");

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      const payloadPart = token.split(".")[1];
      if (payloadPart) {
        const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
        const payload = JSON.parse(atob(padded)) as { sub?: string; exp?: number };
        const now = Math.floor(Date.now() / 1000);
        if (payload.sub && (!payload.exp || payload.exp > now)) userId = payload.sub;
      }
    } catch {}
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current case data (user-scoped via RLS)
    const { data: caseData, error: caseErr } = await userClient
      .from("cases")
      .select("*")
      .eq("id", case_id)
      .single();

    if (caseErr || !caseData) {
      return new Response(JSON.stringify({ error: "Case not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Identify which fields are missing (null, empty string, or default)
    const missingFields: string[] = [];
    if (!caseData.purchase_price) missingFields.push("purchase_price");
    if (!caseData.lender) missingFields.push("lender");
    if (!caseData.property_type || caseData.property_type === "residential") missingFields.push("property_type");
    if (!caseData.stamp_duty) missingFields.push("stamp_duty");
    if (!caseData.legal_fees) missingFields.push("legal_fees");
    if (!caseData.seller_conveyancer_email) missingFields.push("seller_conveyancer_email");

    if (missingFields.length === 0) {
      return new Response(
        JSON.stringify({ populated: 0, message: "All case fields are already populated.", fields_updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[extract-case-fields] Case ${caseData.case_reference}: ${missingFields.length} missing fields: ${missingFields.join(", ")}`);

    // Gather documents — scan all folders, limit to 12 docs for speed
    const allFiles = await listAllCaseFiles(adminClient, case_id);
    const superseded = await getSupersededFilePaths(adminClient, case_id);
    const currentFiles = superseded.size > 0 ? allFiles.filter(f => !superseded.has(f.filePath)) : allFiles;

    // Prioritize folders likely to contain case details
    const PRIORITY_FOLDERS = ["contracts", "title", "correspondence", "aml-sow", "miscellaneous", "searches"];
    const sorted = [...currentFiles].sort((a, b) => {
      const ai = PRIORITY_FOLDERS.indexOf(a.folder);
      const bi = PRIORITY_FOLDERS.indexOf(b.folder);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    const docsToRead = sorted.slice(0, 12);

    if (docsToRead.length === 0) {
      return new Response(
        JSON.stringify({ populated: 0, message: "No documents found in case files.", fields_updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[extract-case-fields] Reading ${docsToRead.length} documents for field extraction`);

    // Extract text from documents
    const textParts: string[] = [];
    for (const doc of docsToRead) {
      const { processed } = await processDocumentCached(
        adminClient, "case-documents", doc.filePath, doc.fileName, doc.folder, { maxTextLength: 30000 }
      );
      if (processed.textContent && processed.textContent.length > 50) {
        textParts.push(`[${doc.folder}/${doc.fileName}]\n${processed.textContent.slice(0, 30000)}`);
      }
    }

    if (textParts.length === 0) {
      return new Response(
        JSON.stringify({ populated: 0, message: "Could not extract readable text from documents.", fields_updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prompt
    const fieldDescriptions: Record<string, string> = {
      purchase_price: "Purchase price of the property in GBP (number only, e.g. 350000)",
      lender: "Name of the mortgage lender (e.g. 'Nationwide', 'Halifax'). Empty string if cash purchase.",
      property_type: "Property type: one of 'residential', 'commercial', 'mixed-use', 'land'. Be specific.",
      stamp_duty: "Stamp Duty Land Tax amount in GBP (number only)",
      legal_fees: "Legal fees / conveyancing fees in GBP (number only)",
      seller_conveyancer_email: "Email address of the seller's solicitor/conveyancer",
    };

    const fieldList = missingFields
      .map(f => `- ${f}: ${fieldDescriptions[f] || f}`)
      .join("\n");

    const prompt = `You are a conveyancing data extraction assistant. Read the following case documents and extract the missing field values.

CASE CONTEXT:
- Case Reference: ${caseData.case_reference}
- Property Address: ${caseData.property_address}
- Transaction Type: ${caseData.transaction_type}
- Tenure: ${caseData.tenure}

MISSING FIELDS TO EXTRACT:
${fieldList}

RULES:
1. Only extract values you find clearly stated in the documents
2. Do NOT guess, estimate, or infer values
3. If a field value is not found in any document, return null for that field
4. For prices/amounts, return the number only (no currency symbols)
5. Be precise — use exact values from the documents

DOCUMENTS:
${textParts.join("\n\n---\n\n")}`;

    // Call AI with tool calling for structured output
    const toolProperties: Record<string, any> = {};
    for (const field of missingFields) {
      if (["purchase_price", "stamp_duty", "legal_fees"].includes(field)) {
        toolProperties[field] = { type: ["number", "null"], description: fieldDescriptions[field] };
      } else {
        toolProperties[field] = { type: ["string", "null"], description: fieldDescriptions[field] };
      }
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_fields",
              description: "Extract case field values found in documents",
              parameters: {
                type: "object",
                properties: toolProperties,
                required: missingFields,
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_fields" } },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[extract-case-fields] AI error:", resp.status, errText);
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ populated: 0, message: "AI extraction unavailable. Please try again.", fields_updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await resp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ populated: 0, message: "AI could not extract field data.", fields_updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extracted = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    console.log("[extract-case-fields] AI extracted:", JSON.stringify(extracted));

    // Build update payload — ONLY for fields that are currently missing AND AI found a value
    const updatePayload: Record<string, any> = {};
    const fieldsUpdated: string[] = [];

    for (const field of missingFields) {
      const value = extracted[field];
      if (value === null || value === undefined || value === "") continue;

      // Double-check the field is still empty in DB (race condition guard)
      const currentVal = (caseData as any)[field];
      if (currentVal !== null && currentVal !== undefined && currentVal !== "" && currentVal !== 0) {
        console.log(`[extract-case-fields] Skipping ${field} — already has value: ${currentVal}`);
        continue;
      }

      updatePayload[field] = value;
      fieldsUpdated.push(field);
    }

    if (Object.keys(updatePayload).length === 0) {
      return new Response(
        JSON.stringify({ populated: 0, message: "AI could not find values for the missing fields in the uploaded documents.", fields_updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update case — using user client to respect RLS
    const { error: updateErr } = await userClient
      .from("cases")
      .update(updatePayload)
      .eq("id", case_id);

    if (updateErr) {
      console.error("[extract-case-fields] Update failed:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to update case fields: " + updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log to audit trail
    const { data: userProfile } = await adminClient
      .from("profiles")
      .select("full_name, email, position")
      .eq("user_id", userId)
      .single();

    await adminClient.from("audit_log").insert({
      case_reference: caseData.case_reference,
      user_id: userId,
      user_name: userProfile?.full_name || "System",
      user_email: userProfile?.email || "",
      user_position: userProfile?.position || "",
      event_type: "ai_field_extraction",
      metadata: {
        fields_updated: fieldsUpdated,
        extracted_values: updatePayload,
        documents_scanned: docsToRead.length,
      },
    } as any);

    console.log(`[extract-case-fields] Updated ${fieldsUpdated.length} fields: ${fieldsUpdated.join(", ")}`);

    return new Response(
      JSON.stringify({
        populated: fieldsUpdated.length,
        fields_updated: fieldsUpdated,
        values: updatePayload,
        message: `Auto-populated ${fieldsUpdated.length} field(s) from documents: ${fieldsUpdated.join(", ")}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[extract-case-fields] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processDocument, buildMultimodalContent, type ProcessedDocument } from "../_shared/documentProcessor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ─────────────────────────────────────────────────────────────

interface ExtractedFormData {
  propertyAddress: string;
  purchasePrice: string;
  mortgageAmount: string;
  caseReference: string;
  tenure: string;
  stampDuty: string;
  legalFees: string;
  additionalContext: string;
  purchasers: ExtractedPerson[];
  giftors: ExtractedPerson[];
  hasGiftors: boolean;
}

interface ExtractedPerson {
  fullName: string;
  role: "Purchaser" | "Giftor";
  fundingSource: string;
  contributionAmount: string;
  employmentStatus: string;
  additionalNotes: string;
  relationshipToPurchaser: string;
}

// ── Prompts ───────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an expert AML compliance data extractor for UK residential conveyancing.

You will be given multiple documents uploaded for a Source of Wealth assessment. Your task is to carefully read EVERY document and extract ALL information needed to complete the assessment form.

Extract the following:

**Transaction Details:**
- Property address (full postal address)
- Purchase price (numeric, GBP)
- Expected mortgage amount (numeric, GBP) — this is almost always stated in Armalytix reports as "Expected Mortgage", "Mortgage Amount", "Lending", or similar. Also check mortgage offers, purchase instruction forms, and client questionnaires. This is a CRITICAL field — extract it whenever available.
- Case/file reference number
- Tenure (Freehold / Leasehold / Unknown)
- Stamp duty amount if mentioned
- Legal fees if mentioned

**Persons (Purchasers and Giftors):**
For each person identified across ALL documents:
- Full name (exactly as it appears on official documents)
- Role: Purchaser or Giftor
- Primary funding source (e.g., Salary, Savings, Sale of Existing Property, Gift, Inheritance, Investment Proceeds, Pension Lump Sum, Compensation, Business Profits, Mortgage)
- Contribution amount if identifiable
- Employment status (Employed, Self-Employed, Director/Business Owner, Retired, etc.)
- Any additional notes (e.g., employer name, salary figures, account details)
- For giftors: relationship to purchaser

**OPEN BANKING & PROVIDER-SPECIFIC REPORTS:**
Documents may come from open banking and verification platforms including but not limited to:
- **Armalytix** — Source of Wealth / Source of Funds reports. Look for "Primary Source of Funds", "Main Source of Wealth", salary credits, employer name, income verification, and contribution breakdowns.
- **Thirdfort** — Identity and source of funds verification reports. Look for verified employment details, income sources, bank account analysis, and risk indicators.
- **Infotrak** — AML/KYC verification reports. Look for employment verification, income evidence, and funding source declarations.
- **Xero / FreeAgent / QuickBooks** — Business accounting summaries for self-employed individuals. Extract business profits and director income.
- Other open banking aggregators (e.g., Plaid, TrueLayer, Codat) — Look for income categorisation, salary credits, and account summaries.

For these reports, pay special attention to:
1. **Funding Source**: The report's stated "Primary Source of Funds" or the largest income category (salary credits, rental income, dividends, pension payments, etc.)
2. **Employment Status**: Employer name, employment type (PAYE vs self-employed), job title, and salary figures
3. **Contribution Amount**: Total verified funds or the amount the person is contributing to the transaction
4. If the report explicitly labels a "Primary Source" or "Main Source", use that value rather than inferring from transaction patterns

**PAYSLIPS & SALARY EVIDENCE:**
- Extract employer name, gross/net salary, pay frequency, tax code, NI number
- Map to Employment Status = "Employed" and Funding Source = "Salary / Employment Income"
- Note the annual salary in additionalNotes

**BANK STATEMENTS:**
- Identify regular salary credits → extract employer name and monthly salary
- Large lump sums → note source (savings transfer, property sale, gift, inheritance)
- Map the PRIMARY income source to Funding Source

**CRITICAL RULES:**
1. Extract names EXACTLY as they appear on documents — do not guess or infer
2. If a field is not found in any document, leave it empty — NEVER fabricate data
3. Cross-reference names across documents to avoid duplicates (e.g., "John Smith" on a bank statement and "Mr J Smith" on a payslip may be the same person)
4. Extract monetary amounts as plain numbers without currency symbols
5. If you see evidence of employment (payslips, P60s), extract the employer name and salary
6. Bank statements may reveal savings, salary credits, and regular income
7. Gift letters should identify the giftor's name and relationship
8. Property valuations and mortgage offers contain property and price details
9. Open banking reports are AUTHORITATIVE sources — prioritise their stated funding source and employment data over inferences from raw bank statements`;

const JUDGE_SYSTEM_PROMPT = `You are a senior AML compliance reviewer verifying data extracted from documents.

You will receive:
1. The original documents
2. The extracted form data from a junior extractor

Your task is to VERIFY every extracted field against the source documents:

**For each field, check:**
- Is the value actually present in the documents? (no fabrication)
- Is it accurately transcribed? (no typos, correct amounts)
- Is it attributed to the correct person?
- Are there any values the extractor missed?

**Specific checks:**
- All findings are labelled as one of: Document based, Inference, Missing, or Out of scope. No unsupported assumption may be presented as fact.
- Amounts: Must match to the penny — check bank statements, payslips, valuations
- Addresses: Must be complete and match across documents
- Employment: Cross-reference payslips with bank statement salary credits
- Relationships: Only assert if explicitly stated in a gift letter or similar

If you find errors, correct them. If you find missing data, add it.
Return the COMPLETE corrected form data.`;

// ── Tool definitions ──────────────────────────────────────────────────

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_form_data",
    description: "Extract all case form data from the uploaded documents",
    parameters: {
      type: "object",
      properties: {
        property_address: { type: "string", description: "Full property address" },
        purchase_price: { type: "string", description: "Purchase price as number string (e.g., '450000')" },
        mortgage_amount: { type: "string", description: "Expected mortgage/lending amount as number string — almost always stated in Armalytix reports, mortgage offers, or client questionnaires" },
        case_reference: { type: "string", description: "Case or file reference number" },
        tenure: { type: "string", enum: ["Freehold", "Leasehold", "Unknown", ""], description: "Property tenure" },
        stamp_duty: { type: "string", description: "Stamp duty amount if found" },
        legal_fees: { type: "string", description: "Legal fees if found" },
        additional_context: { type: "string", description: "Any relevant context from documents (max 500 chars)" },
        persons: {
          type: "array",
          description: "All persons identified across documents",
          items: {
            type: "object",
            properties: {
              full_name: { type: "string", description: "Exact full name from documents" },
              role: { type: "string", enum: ["Purchaser", "Giftor"], description: "Person's role" },
              funding_source: { type: "string", description: "Primary funding source" },
              contribution_amount: { type: "string", description: "Contribution amount if known" },
              employment_status: { type: "string", description: "Employment status" },
              additional_notes: { type: "string", description: "Relevant notes (employer, salary, etc.)" },
              relationship_to_purchaser: { type: "string", description: "For giftors: relationship to purchaser" },
            },
            required: ["full_name", "role"],
            additionalProperties: false,
          },
        },
        extraction_notes: {
          type: "string",
          description: "Notes about extraction quality, missing info, or ambiguities (max 300 chars)",
        },
      },
      required: ["property_address", "purchase_price", "persons"],
      additionalProperties: false,
    },
  },
};

const JUDGE_TOOL = {
  type: "function",
  function: {
    name: "verify_form_data",
    description: "Verify and correct extracted form data",
    parameters: {
      type: "object",
      properties: {
        approved: { type: "boolean", description: "Whether all extracted data is accurate" },
        corrections_made: {
          type: "array",
          description: "List of corrections made",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Field that was corrected" },
              original: { type: "string", description: "Original incorrect value" },
              corrected: { type: "string", description: "Corrected value" },
              reason: { type: "string", description: "Why the correction was needed" },
            },
            required: ["field", "corrected", "reason"],
            additionalProperties: false,
          },
        },
        property_address: { type: "string" },
        purchase_price: { type: "string" },
        mortgage_amount: { type: "string", description: "Expected mortgage/lending amount" },
        case_reference: { type: "string" },
        tenure: { type: "string", enum: ["Freehold", "Leasehold", "Unknown", ""] },
        stamp_duty: { type: "string" },
        legal_fees: { type: "string" },
        additional_context: { type: "string" },
        persons: {
          type: "array",
          items: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              role: { type: "string", enum: ["Purchaser", "Giftor"] },
              funding_source: { type: "string" },
              contribution_amount: { type: "string" },
              employment_status: { type: "string" },
              additional_notes: { type: "string" },
              relationship_to_purchaser: { type: "string" },
            },
            required: ["full_name", "role"],
            additionalProperties: false,
          },
        },
        verification_notes: { type: "string", description: "Summary of verification findings" },
      },
      required: ["approved", "corrections_made", "persons", "property_address", "purchase_price"],
      additionalProperties: false,
    },
  },
};

// ── Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth guard ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
    authHeader.replace("Bearer ", "")
  );
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const startTime = Date.now();
    const { files, classifications } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "No files provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Cap files to avoid CPU exhaustion — prioritise text-extractable docs
    const MAX_FILES = 20;
    const cappedFiles = files.length > MAX_FILES ? files.slice(0, MAX_FILES) : files;
    if (files.length > MAX_FILES) {
      console.log(`[extract-form] Capping from ${files.length} to ${MAX_FILES} files to stay within compute limits`);
    }

    // Process documents with reduced limits for large batches
    const isLargeBatch = cappedFiles.length > 12;
    const processedDocs: ProcessedDocument[] = [];
    for (const file of cappedFiles) {
      try {
        const binaryStr = atob(file.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let j = 0; j < binaryStr.length; j++) {
          bytes[j] = binaryStr.charCodeAt(j);
        }

        const processed = await processDocument(file.name, bytes, "Document", {
          maxTextLength: isLargeBatch ? 15000 : 30000,
          maxBase64Length: isLargeBatch ? 5_000_000 : 15_000_000,
          aiApiKey: LOVABLE_API_KEY,
        });
        processedDocs.push(processed);
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
      }
    }

    if (processedDocs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents could be processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For large batches, limit multimodal (image) content to save compute
    const MAX_MULTIMODAL = 8;
    let docsForAI = processedDocs;
    const multimodalCount = processedDocs.filter(d => d.base64).length;
    if (multimodalCount > MAX_MULTIMODAL) {
      const textDocs = processedDocs.filter(d => !d.base64);
      const imageDocs = processedDocs.filter(d => d.base64).slice(0, MAX_MULTIMODAL);
      docsForAI = [...textDocs, ...imageDocs];
      console.log(`[extract-form] Capped multimodal docs from ${multimodalCount} to ${MAX_MULTIMODAL}, total for AI: ${docsForAI.length}`);
    }

    const hasTimeFor = (phase: string) => {
      const elapsed = Date.now() - startTime;
      const remaining = 150_000 - elapsed; // 150s guard
      console.log(`[extract-form] Time check for ${phase}: ${elapsed}ms elapsed, ${remaining}ms remaining`);
      return remaining > 30_000; // need at least 30s
    };

    // Build classification context if available
    let classificationContext = "";
    if (classifications && Array.isArray(classifications)) {
      classificationContext = "\n\n## Document Classifications\n" +
        classifications.map((c: any) =>
          `- **${c.fileName}**: ${c.category} (person: ${c.personName || "unknown"}, confidence: ${c.confidence})`
        ).join("\n");
    }

    // Build multimodal content with capped documents
    const textPreamble = `Extract ALL form data from these ${docsForAI.length} documents for a Source of Wealth assessment.\n\nRead every document thoroughly — each may contain different pieces of information needed to complete the form.${classificationContext}`;
    const userContent = buildMultimodalContent(textPreamble, docsForAI);

    // ── Stage 1: Initial extraction (use Flash for speed on large batches) ──
    const extractionModel = docsForAI.length > 15 ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";
    console.log(`[extract-form] Stage 1: Extracting from ${docsForAI.length} documents using ${extractionModel}`);
    const extractResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: extractionModel,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "function", function: { name: "extract_form_data" } },
      }),
    });

    if (!extractResp.ok) {
      const errText = await extractResp.text();
      console.error("Extraction AI failed:", extractResp.status, errText);
      if (extractResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (extractResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please top up your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI extraction service error");
    }

    const extractData = await extractResp.json();
    const extractToolCall = extractData.choices?.[0]?.message?.tool_calls?.[0];

    if (!extractToolCall?.function?.arguments) {
      throw new Error("AI returned no extraction result");
    }

    const extractedArgs = typeof extractToolCall.function.arguments === "string"
      ? JSON.parse(extractToolCall.function.arguments)
      : extractToolCall.function.arguments;

    console.log(`[extract-form] Stage 1 complete: ${extractedArgs.persons?.length || 0} persons found`);

    // ── Stage 2: Judge verification (skip if running low on time) ──
    let finalData: any = extractedArgs;
    let corrections: any[] = [];
    let verificationNotes = "";
    let judgeApproved = false;

    if (hasTimeFor("judge")) {
    console.log("[extract-form] Stage 2: Judge verification");

    const judgePrompt = `Verify this extracted form data against the original documents.

## Extracted Data to Verify:
- Property Address: "${extractedArgs.property_address || ""}"
- Purchase Price: "${extractedArgs.purchase_price || ""}"
- Mortgage Amount: "${extractedArgs.mortgage_amount || ""}"
- Case Reference: "${extractedArgs.case_reference || ""}"
- Tenure: "${extractedArgs.tenure || ""}"
- Stamp Duty: "${extractedArgs.stamp_duty || ""}"
- Legal Fees: "${extractedArgs.legal_fees || ""}"

## Extracted Persons:
${(extractedArgs.persons || []).map((p: any, i: number) =>
  `${i + 1}. ${p.full_name} (${p.role}) — Funding: ${p.funding_source || "?"}, Employment: ${p.employment_status || "?"}, Amount: ${p.contribution_amount || "?"}`
).join("\n")}

## Extraction Notes: ${extractedArgs.extraction_notes || "None"}

Now re-examine EVERY document below and verify each value. Correct any errors.`;

    // Use text-only for judge to save compute on large batches
    const textOnlyDocs = docsForAI.map(d => ({ ...d, base64: undefined, mimeType: undefined }));
    const judgeContent = buildMultimodalContent(judgePrompt, textOnlyDocs);

    const judgeResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: judgeContent },
        ],
        tools: [JUDGE_TOOL],
        tool_choice: { type: "function", function: { name: "verify_form_data" } },
      }),
    });

    if (judgeResp.ok) {
      const judgeData = await judgeResp.json();
      const judgeTool = judgeData.choices?.[0]?.message?.tool_calls?.[0];

      if (judgeTool?.function?.arguments) {
        const jArgs = typeof judgeTool.function.arguments === "string"
          ? JSON.parse(judgeTool.function.arguments)
          : judgeTool.function.arguments;

        judgeApproved = jArgs.approved;
        corrections = jArgs.corrections_made || [];
        verificationNotes = jArgs.verification_notes || "";

        finalData = {
          property_address: jArgs.property_address ?? extractedArgs.property_address,
          purchase_price: jArgs.purchase_price ?? extractedArgs.purchase_price,
          mortgage_amount: jArgs.mortgage_amount ?? extractedArgs.mortgage_amount,
          case_reference: jArgs.case_reference ?? extractedArgs.case_reference,
          tenure: jArgs.tenure ?? extractedArgs.tenure,
          stamp_duty: jArgs.stamp_duty ?? extractedArgs.stamp_duty,
          legal_fees: jArgs.legal_fees ?? extractedArgs.legal_fees,
          additional_context: jArgs.additional_context ?? extractedArgs.additional_context,
          persons: jArgs.persons && jArgs.persons.length > 0 ? jArgs.persons : extractedArgs.persons,
          extraction_notes: extractedArgs.extraction_notes,
        };

        if (corrections.length > 0) {
          console.log(`[extract-form] Judge made ${corrections.length} correction(s):`,
            corrections.map((c: any) => `${c.field}: "${c.original}" → "${c.corrected}"`).join("; "));
        }
      }
    } else {
      console.error("[extract-form] Judge call failed:", judgeResp.status);
      verificationNotes = "Judge verification unavailable — using initial extraction";
    }
    } else {
      console.log("[extract-form] Skipping judge — insufficient compute time remaining");
      verificationNotes = "Judge verification skipped due to compute constraints — using initial extraction";
    }

    // Build response
    const purchasers = (finalData.persons || [])
      .filter((p: any) => p.role !== "Giftor")
      .map((p: any) => ({
        fullName: p.full_name || "",
        role: "Purchaser",
        fundingSource: p.funding_source || "",
        contributionAmount: p.contribution_amount || "",
        employmentStatus: p.employment_status || "",
        additionalNotes: p.additional_notes || "",
        relationshipToPurchaser: "",
      }));

    const giftors = (finalData.persons || [])
      .filter((p: any) => p.role === "Giftor")
      .map((p: any) => ({
        fullName: p.full_name || "",
        role: "Giftor",
        fundingSource: p.funding_source || "",
        contributionAmount: p.contribution_amount || "",
        employmentStatus: p.employment_status || "",
        additionalNotes: p.additional_notes || "",
        relationshipToPurchaser: p.relationship_to_purchaser || "",
      }));

    const result: ExtractedFormData & {
      corrections: any[];
      verificationNotes: string;
      judgeApproved: boolean;
      extractionNotes: string;
    } = {
      propertyAddress: finalData.property_address || "",
      purchasePrice: finalData.purchase_price || "",
      mortgageAmount: finalData.mortgage_amount || "",
      caseReference: finalData.case_reference || "",
      tenure: finalData.tenure || "",
      stampDuty: finalData.stamp_duty || "",
      legalFees: finalData.legal_fees || "",
      additionalContext: finalData.additional_context || "",
      purchasers,
      giftors,
      hasGiftors: giftors.length > 0,
      corrections,
      verificationNotes,
      judgeApproved,
      extractionNotes: finalData.extraction_notes || "",
    };

    console.log(`[extract-form] Complete: ${purchasers.length} purchasers, ${giftors.length} giftors, ${corrections.length} corrections, approved=${judgeApproved}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("extract-form-from-docs error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

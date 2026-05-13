import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { processDocument, buildMultimodalContent } from "../_shared/documentProcessor.ts";
import { listAllCaseFiles, getSupersededFilePaths, TITLE_DEFECT_FOLDERS } from "../_shared/caseFileScanner.ts";
import { fetchLenderHandbook } from "../_shared/lenderHandbook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(apiKey: string, model: string, messages: any[], tools?: any[], toolChoice?: any) {
  const body: any = { model, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response;
}

const defectTools = [{
  type: "function",
  function: {
    name: "report_title_defects",
    description: "Report identified title defects with lender compliance issues",
    parameters: {
      type: "object",
      properties: {
        defects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["restrictive_covenant", "easement", "charge", "lease_defect", "lender_compliance", "post_completion", "missing_document", "cross_document_inconsistency", "other"] },
              severity: { type: "string", enum: ["high", "medium", "low"] },
              title: { type: "string" },
              description: { type: "string" },
              source_document: { type: "string" },
              source_clause: { type: "string", description: "Specific clause or page reference from the document" },
              recommendation: { type: "string" },
              lender_impact: { type: "string", description: "How this defect may affect lender requirements or mortgage approval" },
            },
            required: ["type", "severity", "title", "description", "recommendation"],
          },
        },
        summary: { type: "string" },
        documents_analysed: { type: "number", description: "How many documents were actually read and analysed" },
        lender_summary: { type: "string", description: "Summary of lender compliance position, or empty if no lender involved" },
      },
      required: ["defects", "summary", "documents_analysed"],
    },
  },
}];

const judgeTools = [{
  type: "function",
  function: {
    name: "judge_defect_report",
    description: "Score and critique the title defect analysis",
    parameters: {
      type: "object",
      properties: {
        score: { type: "number", description: "Quality score 1-10" },
        passed: { type: "boolean", description: "True if score >= 8" },
        issues: {
          type: "array",
          items: { type: "string" },
          description: "List of issues found in the analysis",
        },
        feedback: { type: "string", description: "Detailed feedback for improvement" },
      },
      required: ["score", "passed", "issues", "feedback"],
    },
  },
}];

// Title-related document types to prioritise for download
const TITLE_DOC_TYPES = new Set([
  "title_register", "title_plan", "lease", "official_copies", "charges_register",
  "property_register", "proprietorship_register", "restrictive_covenant",
  "easement", "transfer", "deed", "contract", "title", "conveyance",
  "land_registry", "search", "local_search", "environmental_search",
]);

function isRelevantTitleDoc(docType: string, fileName: string): boolean {
  const typeLower = (docType || "").toLowerCase().replace(/[\s_-]+/g, "_");
  if (TITLE_DOC_TYPES.has(typeLower)) return true;
  const nameLower = fileName.toLowerCase();
  const titleKeywords = ["title", "lease", "register", "covenant", "easement", "charge", "transfer", "deed", "contract", "search", "official_cop", "oc1", "oc2"];
  return titleKeywords.some(kw => nameLower.includes(kw));
}

// lenderCacheKey, LENDER_SLUG_MAP, and fetchLenderHandbook are now imported from _shared/lenderHandbook.ts


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");

    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { caseId, caseReference, propertyAddress, tenure, lender } = await req.json();
    if (!caseId) {
      return new Response(JSON.stringify({ error: "caseId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Scan Case Files folders for documents ──────────────────────
    const allCaseFiles = await listAllCaseFiles(supabase, caseId, TITLE_DEFECT_FOLDERS);
    const supersededPaths = await getSupersededFilePaths(supabase, caseId);
    const caseFiles = supersededPaths.size > 0
      ? allCaseFiles.filter(f => !supersededPaths.has(f.filePath))
      : allCaseFiles;
    if (caseFiles.length < allCaseFiles.length) {
      console.log(`[detect-title-defects] Excluded ${allCaseFiles.length - caseFiles.length} superseded file(s)`);
    }

    // Gather metadata from DB tables for context
    const { data: searchDocs } = await supabase
      .from("documents").select("doc_type, file_name, file_path, completeness_notes").eq("case_id", caseId);

    // ── Build file list from Case Files, supplemented by DB-tracked docs ──
    const allFilesToProcess: { fileName: string; filePath: string; bucket: string; label: string }[] = [];
    const seenFileNames = new Set<string>();

    // Primary: files from Case Files folders
    for (const cf of caseFiles) {
      if (isRelevantTitleDoc(cf.folder, cf.fileName)) {
        seenFileNames.add(cf.fileName.toLowerCase());
        allFilesToProcess.push({
          fileName: cf.fileName,
          filePath: cf.filePath,
          bucket: "case-documents",
          label: `Case File (${cf.folder})`,
        });
      }
    }

    // Supplement: DB-tracked docs not already found in folders
    for (const doc of (searchDocs || [])) {
      if (!seenFileNames.has(doc.file_name.toLowerCase()) && isRelevantTitleDoc(doc.doc_type, doc.file_name)) {
        seenFileNames.add(doc.file_name.toLowerCase());
        allFilesToProcess.push({
          fileName: doc.file_name,
          filePath: doc.file_path,
          bucket: "case-documents",
          label: `Case Doc (${doc.doc_type})`,
        });
      }
    }

    // Cap at 10 documents to stay within token/size limits
    const docsToProcess = allFilesToProcess.slice(0, 10);
    console.log(`[detect-title-defects] Processing ${docsToProcess.length} of ${allFilesToProcess.length} relevant title docs (${caseFiles.length} from case folders)`);

    // Cap multimodal docs at 3 to prevent payload explosion (large base64 PDFs)
    const MAX_MULTIMODAL = 3;
    const processedDocs = [];
    let multimodalCount = 0;
    for (const docInfo of docsToProcess) {
      try {
        const { data: fileData, error: dlError } = await supabase.storage
          .from(docInfo.bucket)
          .download(docInfo.filePath);

        if (dlError || !fileData) {
          console.error(`Failed to download ${docInfo.fileName}:`, dlError?.message);
          continue;
        }

        const bytes = new Uint8Array(await fileData.arrayBuffer());
        // If we've hit the multimodal cap, force text-only by setting maxBase64Length to 0
        const forceTextOnly = multimodalCount >= MAX_MULTIMODAL;
        const processed = await processDocument(docInfo.fileName, bytes, docInfo.label, {
          maxTextLength: 60000,
          maxBase64Length: forceTextOnly ? 0 : 10_000_000,
          aiApiKey: LOVABLE_API_KEY,
        });
        if (processed.isMultimodal) multimodalCount++;
        processedDocs.push(processed);
      } catch (e) {
        console.error(`Error processing ${docInfo.fileName}:`, e);
      }
    }

    console.log(`[detect-title-defects] Successfully processed ${processedDocs.length} documents (${processedDocs.filter(d => d.isMultimodal).length} multimodal, cap: ${MAX_MULTIMODAL})`);

    

    // ── Fetch lender handbook (cached or live scrape) ──────
    let lenderHandbookContent = "";
    let handbookFromCache = false;
    if (lender) {
      const hbResult = await fetchLenderHandbook(lender, supabase);
      lenderHandbookContent = hbResult.content;
      handbookFromCache = hbResult.fromCache;
      console.log(`[detect-title-defects] Lender handbook: ${lenderHandbookContent.length > 0 ? `${lenderHandbookContent.length} chars (${handbookFromCache ? "CACHED" : "LIVE"})` : "not available"}`);
    }

    // ── Build system prompt with lender compliance ──────────────────
    const lenderContext = lender
      ? `\n\nLENDER COMPLIANCE — The lender is **${lender}**.${lenderHandbookContent
          ? ` The lender's ACTUAL Part 2 requirements from the UK Finance Mortgage Lenders' Handbook have been provided below. You MUST cross-reference every title defect against these specific lender requirements and flag any non-compliance.`
          : ` Cross-check against general UK Finance Mortgage Lenders' Handbook standards:`}
- Whether the title meets the lender's requirements per the UK Finance Mortgage Lenders' Handbook (Part 2 — lender-specific requirements)
- Any conditions the lender typically requires (minimum lease term, acceptable ground rent, restrictions on property type)
- Flag any title defects that would specifically cause issues for this lender's mortgage approval
- For leasehold: most lenders require minimum 70-85 years unexpired term at completion
- Ground rent must typically not exceed 0.1% of property value or £250/year (whichever is lower) for most lenders
- Some lenders reject properties with escalating ground rents or doubling clauses`
      : "";

    const systemPrompt = `You are a specialist UK property law AI assistant performing deep analysis of actual title documents to identify defects. You have been provided with the raw content of title documents — READ THEM CAREFULLY and cite specific clauses, paragraphs, and page references.

Your task is to identify:

1. **Restrictive Covenants** — Any restrictions on use, alterations, or development. Cite the exact covenant wording where possible.
2. **Easements** — Rights of way, drainage rights, utility access, shared access. Note any that are unusual or onerous.
3. **Charges** — Mortgages, liens, or financial encumbrances registered against the title. Check if any are outstanding.
4. **Lease Defects** — For leasehold properties:
   - Short unexpired terms (<80 years), missing landlord consents
   - Onerous ground rent escalation clauses (doubling clauses, RPI-linked, percentage of property value)
   - Forfeiture provisions, re-entry rights
   - Inadequate insurance covenants, service charge disputes
   - Absent management company details, break clauses
   - Restrictions on assignment/subletting, alteration restrictions
   - Non-compliance with Leasehold Reform (Ground Rent) Act 2022
   - Whether lease term sufficient for mortgage purposes (typically >70 years)
   - Service charge recovery provisions and reasonableness
   - Rights of first refusal under Landlord and Tenant Act 1987
   - Enfranchisement eligibility under Leasehold Reform, Housing and Urban Development Act 1993
5. **Lender Compliance** — Issues that could affect mortgage approval (if lender specified)
6. **Other title defects** — Missing consents, boundary disputes, planning restrictions, chancel repair liability, defective title indemnity requirements, flying freehold, mines and minerals reservations${lenderContext}

7. **CRITICAL: Full Cross-Document Verification**
   You MUST systematically cross-check EVERY supplied document against EVERY other document. Treat this as a matrix: for each pair of documents, verify consistency of names, addresses, dates, figures, and legal references. Specific checks include:
   - **Title Register ↔ Lease**: Verify the lease term, parties, and property description in the register match the actual lease. Check that all noted covenants in the register correspond to lease clauses.
   - **Title Register ↔ TA6/TA7**: Cross-check disclosed alterations, disputes, notices, boundary issues, and planning applications against title entries and restrictions.
   - **Lease ↔ TA6/TA7**: If TA6/TA7 reveals alterations, extensions, or improvements, CROSS-CHECK against the lease's alteration covenant to determine whether prior written consent from the Lessor was required. If consent was required but not evidenced, flag as BREACH OF LEASE (type: lease_defect, severity: high) and recommend: (a) Evidence of prior written consent, (b) Retrospective consent at seller's expense, (c) Indemnity insurance as a weaker alternative.
   - **TA6/TA7 ↔ Search Results**: Verify TA6 disclosures about flooding, environmental issues, disputes, or planning match what local/environmental/drainage searches reveal. Flag contradictions.
   - **Contract ↔ Title Register**: Verify the contract's property description, title number, tenure, and incumbrances schedule match the official copies. Flag any omissions from the incumbrances schedule.
   - **Contract ↔ Lease**: For leasehold, check the contract correctly references the lease, term, ground rent, and any lease-specific conditions.
   - **Mortgage Offer ↔ Title/Contract**: If a mortgage offer or lender requirements are provided, verify purchase price, property address, borrower names, and any special conditions match the contract and title.
   - **Transfer/TR1 ↔ Title/Contract**: Verify transferor/transferee names, property description, title number, and consideration match.
   - **Management Pack ↔ Lease/TA7**: Cross-check service charge accounts, insurance details, and management company information against the lease covenants and TA7 disclosures. Flag arrears or discrepancies.
   - **ID Documents ↔ All**: Verify names on identity documents match names on the title, contract, and transfer.
   - **Any other document pairs**: If any two documents contain overlapping information (dates, amounts, names, addresses), verify consistency and flag discrepancies.

8. **Missing Documents** (type: missing_document)
   This is a MANDATORY check. You MUST compare the list of documents supplied against the documents that SHOULD exist based on the title register and other references:
   - **Title Plan**: EVERY title register references a title plan. If no title plan file is present in the supplied documents, you MUST flag this as severity: high with a recommendation to obtain the official title plan immediately and verify: (a) the red edging corresponds to the physical property, (b) inclusion of outside space, balconies, storage, or parking, (c) access ways are consistent with physical access
   - **Filed Deeds/Documents**: If the charges register or property register references specific filed documents (e.g. transfers, leases, deeds of covenant, supplemental deeds), check whether they have been supplied. If the Charges Register is blank or absent, this is normal and should NOT be flagged as a defect or missing section.
   - **Superior Freehold Title**: If this is a leasehold title, check whether the freehold register has been provided — it is needed to verify the landlord's title
   - **Lease itself**: If the title is leasehold but no copy of the actual lease has been supplied, flag this immediately
   - **Search Results**: If the analysis references local authority searches, drainage searches, environmental searches, or chancel repair searches but they are not in the document pack, flag them
   - Do NOT assume a document exists just because it is referenced — only documents actually supplied count as "provided"

9. **Post-Completion Obligations** (type: post_completion)
   You MUST read the ENTIRE lease (especially alienation, assignment, and covenant clauses) and extract EVERY post-completion obligation a post-completion team would need to action. For EACH obligation, extract: the exact clause reference, the deadline, who it must be served on/sent to, and ANY associated fees or costs stated in the lease. Obligations include but are not limited to:
   - **Notice of Assignment**: Deadline, recipient (Lessor/management company/their solicitors), prescribed form if any, and the REGISTRATION FEE or notice fee stated in the lease (e.g. "£50 + VAT", "reasonable fee")
   - **Notice of Charge/Mortgage**: If the lease requires notice of any mortgage or charge to the landlord — extract deadline, recipient, and any fee payable
   - **Deed of Covenant**: If the lease or transfer requires the buyer to enter into a deed of covenant with the management company or landlord (e.g. to observe lease covenants), flag this with the clause reference and any fee or requirement to use the landlord's solicitor
   - **Registration of Assignment**: If the landlord or management company maintains a register of leaseholders and the assignment must be registered — extract fee and deadline
   - **Licence to Assign**: If the lease requires prior consent/licence to assign, note whether this was obtained pre-completion and flag any outstanding steps
   - **SDLT / Land Registry**: Note any Land Registry registration deadlines and SDLT filing obligations
   - **Insurance**: If the buyer must notify the building insurer of the change of ownership or provide evidence of contents insurance
   - **Direct Debit / Standing Orders**: If ground rent or service charge payment methods need to be set up by the buyer
   - **Management Company Membership**: If the buyer must apply for membership of a residents' management company or become a shareholder
   - **Any other fees, costs, or actions**: Extract ALL references to fees payable on assignment (sometimes called "assignment fees", "transfer fees", or "administrative charges") — include the exact amount or formula stated in the lease
   - Even if these are "standard" administrative requirements, they MUST ALL be listed so the post-completion team has a complete checklist

IMPORTANT INSTRUCTIONS:
- **CRITICAL — Edition Date vs Official Copy Date:** The "Edition Date" printed on an Official Copy of the Register is the date HM Land Registry last amended the structural format/template of the register. It is NOT the date the register was issued or the date the entries are current to. The correct date to assess currency of the title register is the line: "This official copy shows the entries on the register of title on [DATE] at [TIME]". Do NOT flag a title register as out-of-date based on the Edition Date alone. Always use the "entries on the register of title on" date for currency assessment.
- **Staleness Threshold — 3-Month Rule:** If the "entries on the register of title on" date is more than 3 months before the date of this review, flag the title register as Amber and raise an enquiry requesting updated official copies. Explain that the copies may no longer reflect the current state of the register and updated copies are required before exchange.
- Extract and cite SPECIFIC clauses from the documents — do not make vague assertions
- Include source_clause references (e.g. "Clause 3.2 of the Lease", "Entry 3 of the Charges Register")
- For each defect, explain the practical impact on the transaction
- If a document is a lease, analyse ALL material terms including rent review, service charges, permitted use, alienation, alterations, and insurance
- Where relevant, include lender_impact explaining how this affects mortgage approval
- ALWAYS cross-reference information between documents — e.g. if TA6 says "yes" to alterations, check whether the lease required consent
- You MUST output at least one finding for categories 8 (Missing Documents) and 9 (Post-Completion) for any leasehold transaction — if you genuinely find nothing, explain why in the summary
- Post-completion items MUST include the specific deadline (e.g. "within four weeks of completion") and the responsible party
- If no defects found in other categories, that is fine — do not fabricate defects`;

    const handbookSection = lenderHandbookContent
      ? `\n\n===== ${lender?.toUpperCase()} — UK FINANCE LENDERS' HANDBOOK PART 2 (LIVE DATA) =====\n${lenderHandbookContent}\n===== END LENDER HANDBOOK =====\n`
      : "";

    const textPreamble = `Property: ${propertyAddress}
Case Reference: ${caseReference}
Tenure: ${tenure}
${lender ? `Lender: ${lender}` : "No lender specified"}

Documents analysed in detail: ${processedDocs.length}
${handbookSection}
---

ANALYSED DOCUMENT CONTENTS BELOW — Read each document carefully and identify all title defects:`;


    // --- Stage 1: Primary analysis with actual document content ---
    async function attemptAnalysis(docs: typeof processedDocs, attemptLabel: string) {
      const content = docs.length > 0
        ? buildMultimodalContent(textPreamble, docs)
        : [{ type: "text", text: textPreamble + "\n\n[No document content available for direct analysis. Base your analysis on the metadata, flags, and report excerpt above.]" }];

      console.log(`[detect-title-defects] ${attemptLabel}: sending ${docs.length} docs (${docs.filter(d => d.isMultimodal).length} multimodal)`);

      return callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash",
        [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        defectTools, { type: "function", function: { name: "report_title_defects" } }
      );
    }

    let primaryResponse = await attemptAnalysis(processedDocs, "Attempt 1");

    // If primary attempt fails with a payload/gateway error, retry with text-only
    if (!primaryResponse.ok && primaryResponse.status !== 429 && primaryResponse.status !== 402) {
      const errText = await primaryResponse.text();
      console.error(`[detect-title-defects] Attempt 1 failed (${primaryResponse.status}): ${errText.slice(0, 500)}`);

      // Fallback: strip all multimodal content and use text-only
      const textOnlyDocs = processedDocs.map(doc => {
        if (doc.isMultimodal) {
          return {
            ...doc,
            isMultimodal: false,
            multimodalContent: undefined,
            textContent: `${doc.label}\n[Document available but could not be sent for visual analysis. File: ${doc.fileName}]`,
            notes: "Downgraded to text-only due to payload size",
          };
        }
        return doc;
      });

      console.log(`[detect-title-defects] Retrying with text-only fallback (${textOnlyDocs.length} docs)`);
      primaryResponse = await attemptAnalysis(textOnlyDocs, "Attempt 2 (text-only fallback)");
    }

    if (!primaryResponse.ok) {
      if (primaryResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (primaryResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await primaryResponse.text();
      console.error(`[detect-title-defects] All attempts failed (${primaryResponse.status}): ${errText.slice(0, 500)}`);
      throw new Error(`AI analysis failed (${primaryResponse.status}). The documents may be too large — try removing some files and re-scanning.`);
    }

    const aiRawText = await primaryResponse.text();
    let aiResult: any;
    try {
      aiResult = JSON.parse(aiRawText);
    } catch {
      console.error("[detect-title-defects] Failed to parse AI response (length=" + aiRawText.length + "):", aiRawText.slice(0, 300));
      throw new Error("AI response was empty or truncated. Please retry — the analysis may have timed out at the gateway.");
    }

    let toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    // Fallback: if model returned content instead of tool_calls, extract JSON
    if (!toolCall?.function?.arguments) {
      const msgContent = aiResult.choices?.[0]?.message?.content;
      if (msgContent && typeof msgContent === "string") {
        console.warn("[detect-title-defects] No tool_calls, attempting JSON extraction from content (len=" + msgContent.length + ")");
        const jsonMatch = msgContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const fallback = JSON.parse(jsonMatch[0]);
            if (fallback.defects || fallback.summary) {
              toolCall = { function: { arguments: jsonMatch[0] } };
              console.log("[detect-title-defects] Fallback JSON extraction succeeded");
            }
          } catch { /* not valid JSON */ }
        }
      }
    }

    let parsed = { defects: [], summary: "Analysis complete.", documents_analysed: processedDocs.length, lender_summary: "" };
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch { console.error("Failed to parse primary result"); }
    }

    // ── Layer 4: Deterministic Validation (pre-deep-reasoning) ────────
    const { validateTitleDefects, logValidationResult: logL4 } = await import("../_shared/deterministicValidation.ts");
    const l4Result = validateTitleDefects(parsed);
    logL4("detect-title-defects", caseId, l4Result);

    // --- Stage 1.5: Deep Reasoning Inconsistency Evaluation ---
    // Each defect is evaluated by a reasoning-focused model to verify severity and provide precise advice
    if (parsed.defects && parsed.defects.length > 0) {
      console.log(`[detect-title-defects] Deep reasoning evaluation of ${parsed.defects.length} defect(s)`);

      const inconsistencyJudgeTools = [{
        type: "function",
        function: {
          name: "evaluate_inconsistencies",
          description: "Evaluate each title inconsistency with deep reasoning",
          parameters: {
            type: "object",
            properties: {
              evaluated_defects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    original_title: { type: "string", description: "The original defect title for matching" },
                    reasoning: { type: "string", description: "Step-by-step reasoning about why this is or isn't a genuine risk" },
                    verified: { type: "boolean", description: "True if the inconsistency is genuine and should be reported" },
                    adjusted_severity: { type: "string", enum: ["high", "medium", "low"], description: "Severity after deep analysis" },
                    adjusted_description: { type: "string", description: "Improved description with precise risk explanation" },
                    adjusted_recommendation: { type: "string", description: "Specific, actionable advice for the conveyancer" },
                    risk_rationale: { type: "string", description: "Why this severity level was assigned — cite legislation, case law, or lender requirements" },
                    false_positive_reason: { type: "string", description: "If not verified, explain why this is a false positive" },
                  },
                  required: ["original_title", "reasoning", "verified", "adjusted_severity", "adjusted_description", "adjusted_recommendation", "risk_rationale"],
                },
              },
            },
            required: ["evaluated_defects"],
          },
        },
      }];

      const deepReasoningPrompt = `You are a senior UK property law expert performing deep reasoning analysis on title inconsistencies identified by an AI assistant.

For EACH inconsistency below, you must:

1. **Reason step-by-step** about whether the inconsistency is genuine, considering:
   - The specific document clause cited
   - Relevant legislation (e.g. LPA 1925, LRA 2002, Leasehold Reform Act 2022, Building Safety Act 2022)
   - Common conveyancing practice and whether this would actually concern a reasonably competent solicitor
   - Whether the finding could be a misinterpretation or false positive

2. **Evaluate the true risk level**:
   - HIGH: Would block exchange/completion, cause lender rejection, or expose client to significant financial loss
   - MEDIUM: Requires further investigation or indemnity insurance but is manageable
   - LOW: Minor administrative issue or standard condition that is unlikely to affect the transaction

3. **Verify or reject** each finding — remove false positives where the AI has been overly cautious or speculative

4. **Provide precise, actionable advice** specific to the defect — not generic recommendations

Property: ${propertyAddress}
Tenure: ${tenure}
${lender ? `Lender: ${lender}` : "No lender specified"}

DEFECTS TO EVALUATE:
${JSON.stringify(parsed.defects, null, 2)}`;

      try {
        const deepReasonResp = await callAI(LOVABLE_API_KEY, "openai/gpt-5-mini",
          [
            { role: "system", content: "You are a senior UK property law specialist. Apply deep reasoning to evaluate each title inconsistency. Be rigorous — reject false positives and ensure severity ratings reflect genuine transactional risk." },
            { role: "user", content: deepReasoningPrompt },
          ],
          inconsistencyJudgeTools,
          { type: "function", function: { name: "evaluate_inconsistencies" } }
        );

        if (deepReasonResp.ok) {
          const deepData = await deepReasonResp.json();
          const deepCall = deepData.choices?.[0]?.message?.tool_calls?.[0];
          if (deepCall?.function?.arguments) {
            try {
              const evaluation = JSON.parse(deepCall.function.arguments);
              const evaluatedDefects = evaluation.evaluated_defects || [];

              // Apply deep reasoning results back to defects
              const verifiedDefects: typeof parsed.defects = [];
              for (const defect of parsed.defects) {
                const eval_match = evaluatedDefects.find((e: any) => e.original_title === defect.title);
                if (eval_match) {
                  if (!eval_match.verified) {
                    console.log(`[detect-title-defects] Deep reasoning REJECTED false positive: "${defect.title}" — ${eval_match.false_positive_reason || "no reason given"}`);
                    continue; // Remove false positive
                  }
                  // Apply adjusted values
                  verifiedDefects.push({
                    ...defect,
                    severity: eval_match.adjusted_severity || defect.severity,
                    description: eval_match.adjusted_description || defect.description,
                    recommendation: eval_match.adjusted_recommendation || defect.recommendation,
                    risk_rationale: eval_match.risk_rationale,
                  });
                } else {
                  verifiedDefects.push(defect); // Keep unmatched defects as-is
                }
              }

              const removed = parsed.defects.length - verifiedDefects.length;
              if (removed > 0) {
                console.log(`[detect-title-defects] Deep reasoning removed ${removed} false positive(s). ${verifiedDefects.length} verified defect(s) remain.`);
              }
              parsed.defects = verifiedDefects;
            } catch (parseErr) {
              console.error("[detect-title-defects] Failed to parse deep reasoning result:", parseErr);
            }
          }
        } else {
          console.warn(`[detect-title-defects] Deep reasoning call failed (${deepReasonResp.status}) — proceeding with original defects`);
        }
      } catch (e) {
        console.error("[detect-title-defects] Deep reasoning stage failed (non-fatal):", e);
      }
    }

    // --- Stage 2: LLM-as-a-Judge quality check ---
    const judgeSystemPrompt = `You are a quality assurance judge for UK property law title defect reports. Score the analysis 1-10 based on:
1. **Document-grounded findings** — Are defects backed by specific clause/page references from actual documents?
2. **Completeness** — Were all relevant defect categories checked (covenants, easements, charges, lease issues)?
3. **Accuracy** — Are the severity ratings appropriate? Are statutory references correct?
4. **Lease coverage** — For leasehold properties, were lease-specific issues (ground rent, term length, forfeiture, assignment restrictions) properly analysed?
5. **Lender compliance** — If a lender is specified, were lender-specific requirements checked?
6. **Actionability** — Are the recommendations specific and useful for a conveyancer?
7. **False positives** — Are any flagged defects speculative rather than evidence-based?

Score >= 8 means PASS. Below 8 means the report needs improvement.`;

    const judgeUserPrompt = `Property: ${propertyAddress}
Tenure: ${tenure}
${lender ? `Lender: ${lender}` : "No lender"}
Documents actually analysed: ${processedDocs.length}

Title Defect Report to judge:
${JSON.stringify(parsed, null, 2)}

Score this report.`;

    let judgeResult = { score: 10, passed: true, issues: [] as string[], feedback: "" };

    try {
      const judgeResponse = await callAI(LOVABLE_API_KEY, "openai/gpt-5-mini",
        [{ role: "system", content: judgeSystemPrompt }, { role: "user", content: judgeUserPrompt }],
        judgeTools, { type: "function", function: { name: "judge_defect_report" } }
      );

      if (judgeResponse.ok) {
        const judgeData = await judgeResponse.json();
        const judgeCall = judgeData.choices?.[0]?.message?.tool_calls?.[0];
        if (judgeCall?.function?.arguments) {
          try { judgeResult = JSON.parse(judgeCall.function.arguments); } catch { /* keep defaults */ }
        }
      }
    } catch (e) {
      console.error("Judge stage failed (non-fatal):", e);
    }

    // --- Stage 3: Regenerate if judge score < 8 ---
    // Use TEXT-ONLY for regeneration to avoid timeout from re-sending large multimodal payloads
    if (!judgeResult.passed && judgeResult.score < 8) {
      console.log(`Judge score ${judgeResult.score}/10 — regenerating with feedback (text-only to avoid timeout)`);

      const retryText = `${textPreamble}

IMPORTANT — A quality review of your previous analysis scored ${judgeResult.score}/10 and found these issues:
${judgeResult.issues.map((i: string) => `- ${i}`).join("\n")}

Judge feedback: ${judgeResult.feedback}

Previous analysis (for reference):
${JSON.stringify(parsed.defects?.slice(0, 10), null, 2)}

Please produce an improved analysis addressing all feedback points. Cite specific clauses and page references from the documents.`;

      // Always use text-only content for retry to stay within edge function timeout
      const retryContent = [{ type: "text", text: retryText }];

      try {
        const retryResponse = await callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash",
          [{ role: "system", content: systemPrompt }, { role: "user", content: retryContent }],
          defectTools, { type: "function", function: { name: "report_title_defects" } }
        );

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryCall = retryData.choices?.[0]?.message?.tool_calls?.[0];
          if (retryCall?.function?.arguments) {
            try { parsed = JSON.parse(retryCall.function.arguments); } catch { /* keep original */ }
          }
        }
      } catch (e) {
        console.error("Retry generation failed (non-fatal):", e);
      }
    }

    // Parse handbook into sections for transparency
    const handbookSections: { heading: string; excerpt: string; matched_defect_types: string[] }[] = [];
    if (lenderHandbookContent.length > 0) {
      const sectionRegex = /^#{1,4}\s+(.+)$/gm;
      let match;
      const headings: { heading: string; start: number }[] = [];
      while ((match = sectionRegex.exec(lenderHandbookContent)) !== null) {
        headings.push({ heading: match[1].trim(), start: match.index });
      }
      for (let i = 0; i < headings.length; i++) {
        const end = i + 1 < headings.length ? headings[i + 1].start : lenderHandbookContent.length;
        const body = lenderHandbookContent.slice(headings[i].start, end).trim();
        if (body.length < 30) continue;
        // Check which defect types reference concepts in this section
        const bodyLower = body.toLowerCase();
        const matchedTypes: string[] = [];
        const defectKeywords: Record<string, string[]> = {
          restrictive_covenant: ["covenant", "restrict", "user clause", "permitted use"],
          easement: ["easement", "right of way", "access", "drainage right"],
          charge: ["charge", "mortgage", "lien", "encumbrance"],
          lease_defect: ["lease", "ground rent", "service charge", "forfeiture", "unexpired", "term of years", "assignment"],
          lender_compliance: ["lender", "handbook", "certificate of title", "section 5", "section 6", "part 2"],
        };
        for (const [dtype, keywords] of Object.entries(defectKeywords)) {
          if (keywords.some(kw => bodyLower.includes(kw))) matchedTypes.push(dtype);
        }
        handbookSections.push({
          heading: headings[i].heading,
          excerpt: body.slice(headings[i].heading.length + 4, headings[i].heading.length + 504).trim(),
          matched_defect_types: matchedTypes,
        });
      }
      // If no markdown headings found, treat as one big section
      if (handbookSections.length === 0 && lenderHandbookContent.length > 100) {
        handbookSections.push({
          heading: `${lender} — Part 2 Requirements`,
          excerpt: lenderHandbookContent.slice(0, 500).trim(),
          matched_defect_types: ["lender_compliance"],
        });
      }
    }

    return new Response(JSON.stringify({
      ...parsed,
      quality_score: judgeResult.score,
      quality_passed: judgeResult.passed,
      documents_processed: processedDocs.length,
      multimodal_docs: processedDocs.filter(d => d.isMultimodal).length,
      lender_handbook_fetched: lenderHandbookContent.length > 0,
      lender_handbook_from_cache: handbookFromCache,
      lender_handbook_chars: lenderHandbookContent.length,
      lender_handbook_sections: handbookSections,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-title-defects error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

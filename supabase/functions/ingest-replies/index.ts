import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ingestSchema = z.object({
  case_id: z.string().uuid(),
  agent_type: z.enum(["sow"]),
  action: z.enum(["ingest_replies", "generate_final"]),
  // For ingest_replies: array of uploaded reply document metadata
  reply_files: z.array(z.object({
    file_name: z.string(),
    file_path: z.string(),
    base64: z.string().optional(),
    text_content: z.string().optional(),
    // Confirmed enquiry mapping from the AI pre-scan + user confirmation step.
    // Authoritative routing — the ingestion AI must not silently re-route.
    confirmed_enquiry_ids: z.array(z.string().uuid()).optional(),
    confirmed_enquiry_numbers: z.array(z.string()).optional(),
    auto_note: z.string().optional(),
    mapping_source: z.enum([
      "ai_auto_accepted", "ai_user_corrected", "user_added", "general_reply", "prescan_failed",
    ]).optional(),
    ai_proposed_enquiry_ids: z.array(z.string().uuid()).optional(),
    ai_confidence: z.record(z.string(), z.string()).optional(),
  })).optional(),
});

// ── Rate limiter ──
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(userId: string): { limited: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = rateLimitMap.get(userId) || [];
  timestamps = timestamps.filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    const retryAfterSecs = Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    rateLimitMap.set(userId, timestamps);
    return { limited: true, retryAfterSecs };
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return { limited: false };
}

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of rateLimitMap) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, filtered);
  }
}, 5 * 60 * 1000);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Extract userId from token
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
    } catch { /* ignore */ }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rateCheck = isRateLimited(userId);
    if (rateCheck.limited) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Please try again in ${rateCheck.retryAfterSecs} seconds.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.json();
    const parseResult = ingestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: `Invalid input: ${parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { case_id, agent_type, action, reply_files } = parseResult.data;

    // Verify case access
    const { data: caseData, error: caseError } = await userClient
      .from("cases")
      .select("*")
      .eq("id", case_id)
      .single();

    if (caseError || !caseData) {
      return new Response(JSON.stringify({ error: "Case not found or access denied" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch existing enquiry items
    const { data: existingItems } = await adminClient
      .from("enquiry_items")
      .select("*")
      .eq("case_id", case_id)
      .eq("agent_type", agent_type)
      .order("enquiry_number", { ascending: true });

    if (!existingItems || existingItems.length === 0) {
      return new Response(JSON.stringify({ error: "No enquiry items found. Run the initial review first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch existing rounds
    const { data: existingRounds } = await adminClient
      .from("enquiry_rounds")
      .select("*")
      .eq("case_id", case_id)
      .eq("agent_type", agent_type)
      .order("round_number", { ascending: true });

    const latestRound = existingRounds?.[existingRounds.length - 1];
    const nextRoundNumber = latestRound ? latestRound.round_number + 1 : 2;

    // Fetch profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, email, position, firm_name")
      .eq("user_id", userId)
      .single();

    const aiRunId = `LX-ENQ-${String(Date.now()).slice(-6)}`;

    if (action === "ingest_replies") {
      if (!reply_files || reply_files.length === 0) {
        return new Response(JSON.stringify({ error: "No reply files provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Build context for AI
      const openItems = existingItems.filter((i: any) => i.status === "open" || i.status === "partially_satisfied");
      const enquiryContext = openItems.map((item: any) =>
        `[${item.enquiry_number}] ${item.issue_summary}\n  Original: ${item.original_enquiry_text}\n  Evidence needed: ${item.evidence_required || "Not specified"}\n  Status: ${item.status}`
      ).join("\n\n");

      const replyContext = reply_files.map((f) => {
        const mappingLine = f.confirmed_enquiry_numbers && f.confirmed_enquiry_numbers.length > 0
          ? `CONFIRMED MAPPING (authoritative — do not re-route): answers enquir${f.confirmed_enquiry_numbers.length === 1 ? "y" : "ies"} ${f.confirmed_enquiry_numbers.join(", ")}.`
          : `MAPPING: general reply (no specific enquiry mapping confirmed by user).`;
        const noteLine = f.auto_note ? `Pre-scan note: ${f.auto_note}` : "";
        return `[Reply Document: ${f.file_name}]\n${mappingLine}\n${noteLine}\n${f.text_content || "(content not extracted — classify based on filename)"}`;
      }).join("\n\n---\n\n");

      const systemPrompt = `You are a Reply Ingestion Agent for Olimey AI conveyancing software.

ROLE: Analyse reply documents against outstanding enquiries and determine which enquiries are now satisfied, partially satisfied, or still open.

## MANDATORY STEP-BY-STEP ANALYSIS PROCESS

You MUST follow these steps in order for each reply document:

### Step 1: Document Identification
- Identify each reply document by filename and content type
- Classify: letter, email, certificate, plan, report, or other
- Note the sender and date

### Step 2: Evidence Extraction
- For each reply document, extract every factual statement or piece of evidence
- Record: what is stated, by whom, with what supporting evidence (if any)
- Flag any statements made without supporting documentation

### Step 3: Enquiry-by-Enquiry Cross-Check
- For EACH outstanding enquiry, check:
  a) Does any reply document directly address this enquiry?
  b) What specific evidence is provided? (cite filename)
  c) Does the evidence FULLY satisfy the enquiry, or only PARTIALLY?
  d) Is the evidence consistent with the original enquiry context?
  e) What evidence is still missing?

### Step 4: Cross-Document Consistency Check
- Compare statements across ALL reply documents for contradictions
- Compare reply statements against the original enquiry context
- Flag: mismatched names, dates, figures, or references
- Flag: statements in one document contradicted by another

### Step 5: Fraud & Inconsistency Detection
- Check for: altered documents, mismatched signatures, rapid ownership changes
- Check for: third-party replies on behalf of the seller without authority
- Check for: contradictory statements across documents
- Label findings as "Potential Inconsistency / Fraud Indicator"

### Step 6: Status Determination
- For each enquiry, assign one of: satisfied, partially_satisfied, open, escalate
- "satisfied" = evidence fully addresses the enquiry with document citation
- "partially_satisfied" = some evidence received but gaps remain
- "open" = no evidence received addressing this enquiry
- "escalate" = inconsistencies or fraud indicators detected

### INTELLIGENCE-FIRST PRINCIPLE (MANDATORY)
Before raising ANY new enquiry or marking an existing enquiry as still "open", you MUST first attempt to resolve it from the reply documents AND the existing case documents combined.

Specific requirements:
1. **Check existing evidence first** — If a reply document contains evidence that answers an open enquiry, mark it as satisfied. Do not generate a follow-up enquiry for information that is already present in the reply or in the original case documents.
2. **Cross-reference replies against case file** — If a reply states "please see the attached planning permission" and a planning permission document is already in the case file, do not raise a new enquiry requesting it again. Match reply content against all available documents before determining status.
3. **Only raise genuinely new enquiries** — A new enquiry is only justified when the reply introduces a NEW fact that creates a previously unidentified risk. Repeating an original enquiry in different words because the reply was partial is acceptable; raising an entirely new enquiry that the original case documents already answer is not.
4. **Consolidate** — If a reply partially answers two related enquiries, raise ONE follow-up covering both remaining gaps, not two separate follow-ups.

The litmus test: "Could a competent analyst resolve this from the combined reply documents and original case file?" If YES → mark as satisfied and state the finding. If NO → raise or maintain the enquiry.

### Step 7: New Enquiry Generation
- If replies introduce new facts that raise new risks, draft new enquiries
- Each new enquiry must cite the reply document that triggered it

### Step 8: Report Generation
- Internal report: what was received, what changed, what remains outstanding
- Draft follow-up email: numbered, professional, references reply content

STRICT RULES:
1. EVIDENCE-ONLY: Never assume a reply answers an enquiry if the evidence is not present. State "Not evidenced in replies provided" where missing.
2. Cite the document used (filename) for each determination.
3. Cross-check reply statements vs the original enquiry raised.
4. Cross-check attachments vs statements in reply emails.
5. Flag any inconsistencies across replies.
6. If new facts introduce new risk, raise new enquiries.
7. If replies show potential inconsistencies (contradictory statements, altered documents, mismatched names/dates), label as "Potential Inconsistency / Fraud Indicator" and recommend internal escalation.
8. Use UK English only.
9. Do not provide legal advice.

CASE CONTEXT:
- Case Reference: ${caseData.case_reference}
- Property: ${caseData.property_address}
- Tenure: ${caseData.tenure}
- Agent Type: ${agent_type}`;

      const userPrompt = `OUTSTANDING ENQUIRIES:
${enquiryContext}

---

REPLY DOCUMENTS RECEIVED:
${replyContext}

---

Follow the mandatory step-by-step analysis process in your system prompt. For each outstanding enquiry, determine:
1. Whether the reply satisfies, partially satisfies, or does not satisfy the enquiry
2. What evidence was received (cite document)
3. What is still missing (if any)
4. Whether follow-up enquiries are needed
5. Flag any inconsistencies or fraud indicators

Also classify each reply document and determine which enquiries it relates to.
Generate a follow-up draft email for any items that are not yet fully satisfied.
Generate an internal update report summarising what was received and what remains outstanding.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "process_replies",
                description: "Submit the reply analysis results",
                parameters: {
                  type: "object",
                  properties: {
                    enquiry_updates: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          enquiry_number: { type: "string" },
                          new_status: { type: "string", enum: ["open", "partially_satisfied", "satisfied", "escalate"] },
                          reply_summary: { type: "string" },
                          evidence_received: { type: "string" },
                          who_replied: { type: "string" },
                          next_action: { type: "string", enum: ["raise_further", "no_further_action", "report_to_client"] },
                          remaining_evidence: { type: "string", description: "What evidence is still missing, if any" },
                        },
                        required: ["enquiry_number", "new_status", "reply_summary", "evidence_received", "who_replied", "next_action"],
                      },
                    },
                    new_enquiries: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          enquiry_number: { type: "string" },
                          category: { type: "string" },
                          issue_summary: { type: "string" },
                          original_enquiry_text: { type: "string" },
                          evidence_required: { type: "string" },
                        },
                        required: ["enquiry_number", "category", "issue_summary", "original_enquiry_text", "evidence_required"],
                      },
                      description: "New enquiries raised by information in the replies",
                    },
                    document_classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          file_name: { type: "string" },
                          classification: { type: "string" },
                          matched_enquiry_numbers: { type: "array", items: { type: "string" } },
                        },
                        required: ["file_name", "classification", "matched_enquiry_numbers"],
                      },
                    },
                    fraud_indicators: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          description: { type: "string" },
                          evidence: { type: "string" },
                          severity: { type: "string", enum: ["low", "medium", "high"] },
                        },
                        required: ["description", "evidence", "severity"],
                      },
                    },
                    internal_report: { type: "string", description: "Internal update report covering: what replies received, enquiries now satisfied/partially satisfied/still open, further enquiries required, any escalations, updated risk assessment" },
                    draft_email: { type: "string", description: "Follow-up draft enquiry email for items not yet satisfied. Professional tone, use paragraph numbering throughout for easy referencing in communications. Main paragraphs use sequential Arabic numerals (1., 2., 3., etc.). Where a paragraph contains multiple related requests or sub-points, use sub-paragraph numbering (e.g. 1.1, 1.2, 1.3) so each item is individually trackable and can be referenced precisely in follow-up correspondence. References reply content and missing evidence. Sign off as the conveyancer." },
                    outstanding_summary: { type: "string", description: "Short bullet list of what is still open for the conveyancer" },
                  },
                  required: ["enquiry_updates", "new_enquiries", "document_classifications", "fraud_indicators", "internal_report", "draft_email", "outstanding_summary"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "process_replies" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        const body = await aiResponse.text();
        console.error("Reply ingestion AI error:", status, body);
        return new Response(JSON.stringify({ error: "AI analysis of replies failed. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiText = await aiResponse.text();
      const aiResult = JSON.parse(aiText);

      const usage = aiResult.usage;
      if (usage) {
        console.log(`[TOKEN_USAGE] ingest-replies | case=${case_id} | model=gemini-2.5-flash | prompt_tokens=${usage.prompt_tokens} | completion_tokens=${usage.completion_tokens} | total_tokens=${usage.total_tokens}`);
      }

      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return new Response(JSON.stringify({ error: "AI did not produce structured output" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const result = JSON.parse(toolCall.function.arguments);

      // ── Layer 4: Deterministic Validation ──────────────────────────────
      const { validateIngestReplies, logValidationResult } = await import("../_shared/deterministicValidation.ts");
      const l4Result = validateIngestReplies(result);
      logValidationResult("ingest-replies", aiRunId, l4Result);

      // ═══════════════════════════════════════════════════════════════════
      // LLM-AS-A-JUDGE PIPELINE (Layer 3: Independent Judge)
      // ═══════════════════════════════════════════════════════════════════
      console.log(`[JUDGE] Quality verification for ingest-replies | case=${case_id}`);

      const qualityPrompt = `You are a quality reviewer for an AI-powered conveyancing reply ingestion agent. Score the following output on a scale of 1-10 against these criteria:

1. **Evidence Grounding** (weight: 30%): Is every status change (satisfied/partially_satisfied) backed by a cited reply document? Are there any status changes without document evidence?
2. **Cross-Check Accuracy** (weight: 25%): Has the AI correctly matched reply content to the right enquiries? Are there mismatches or missed connections?
3. **Completeness** (weight: 20%): Has every outstanding enquiry been addressed? Are there enquiries that received replies but were missed in the analysis?
4. **Consistency Detection** (weight: 15%): Has the AI identified contradictions across reply documents? Has it flagged inconsistencies between replies and original enquiry context?
5. **Report Quality** (weight: 10%): Is the internal report clear and actionable? Does the draft email correctly reference remaining evidence gaps?

Respond using the quality_score tool.`;

      let qualityScore = 8;
      let qualityFeedback = "";

      try {
        const qResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5-mini",
            messages: [
              { role: "system", content: qualityPrompt },
              { role: "user", content: `## Enquiry Updates\n${JSON.stringify(result.enquiry_updates, null, 2)}\n\n## Document Classifications\n${JSON.stringify(result.document_classifications, null, 2)}\n\n## Internal Report\n${result.internal_report}\n\n## Draft Email\n${result.draft_email}\n\n## Original Enquiries Context\n${enquiryContext}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "quality_score",
                description: "Return quality assessment",
                parameters: {
                  type: "object",
                  properties: {
                    score: { type: "number", description: "Quality score 1-10" },
                    feedback: { type: "string", description: "Detailed feedback on what needs improvement" },
                    ungrounded_updates: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of enquiry numbers where status was changed without sufficient evidence",
                    },
                  },
                  required: ["score", "feedback"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "quality_score" } },
          }),
        });

        if (qResponse.ok) {
          const qData = await qResponse.json();
          if (qData.usage) {
            console.log(`[TOKEN_USAGE] ingest-replies-quality | case=${case_id} | model=openai/gpt-5-mini | prompt_tokens=${qData.usage.prompt_tokens} | completion_tokens=${qData.usage.completion_tokens} | total_tokens=${qData.usage.total_tokens}`);
          }
          const qToolCall = qData.choices?.[0]?.message?.tool_calls?.[0];
          if (qToolCall?.function?.arguments) {
            const qResult = JSON.parse(qToolCall.function.arguments);
            qualityScore = qResult.score || 8;
            qualityFeedback = qResult.feedback || "";

            // If judge identifies ungrounded status changes, revert them to "open"
            if (qResult.ungrounded_updates && Array.isArray(qResult.ungrounded_updates) && qResult.ungrounded_updates.length > 0) {
              console.warn(`[JUDGE] Reverting ${qResult.ungrounded_updates.length} ungrounded status changes: ${qResult.ungrounded_updates.join(", ")}`);
              for (const enquiryNum of qResult.ungrounded_updates) {
                const update = result.enquiry_updates.find((u: any) => u.enquiry_number === enquiryNum);
                if (update && update.new_status === "satisfied") {
                  update.new_status = "partially_satisfied";
                  update.reply_summary = `${update.reply_summary} [Judge note: Insufficient evidence for full satisfaction — reverted to partially satisfied]`;
                }
              }
            }
          }
        } else {
          console.error("[JUDGE] Quality scoring request failed:", qResponse.status);
          await qResponse.text(); // consume body
        }
      } catch (e) {
        console.error("[JUDGE] Quality judge error (non-fatal):", e);
      }

      console.log(`[JUDGE] Quality score: ${qualityScore}/10. Feedback: ${qualityFeedback.slice(0, 200)}`);
      // ═══════════════════════════════════════════════════════════════════
      // END LLM-AS-A-JUDGE PIPELINE
      // ═══════════════════════════════════════════════════════════════════

      const { enquiry_updates, new_enquiries, document_classifications, fraud_indicators, internal_report, draft_email, outstanding_summary } = result;

      // Create new round
      const { data: newRound, error: roundError } = await adminClient
        .from("enquiry_rounds")
        .insert({
          case_id,
          agent_type,
          round_number: nextRoundNumber,
          status: "open",
          internal_report,
          draft_email: draft_email || null,
          outstanding_summary,
          ai_run_id: aiRunId,
          created_by: userId,
        })
        .select("id")
        .single();

      if (roundError || !newRound) {
        console.error("Failed to create round:", roundError);
        return new Response(JSON.stringify({ error: "Failed to create enquiry round" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update existing enquiry items
      for (const update of enquiry_updates) {
        const matchingItem = existingItems.find((i: any) => i.enquiry_number === update.enquiry_number);
        if (matchingItem) {
          await adminClient.from("enquiry_items").update({
            status: update.new_status,
            reply_summary: update.reply_summary,
            evidence_received: update.evidence_received,
            who_replied: update.who_replied,
            next_action: update.next_action,
            date_last_updated: new Date().toISOString(),
          }).eq("id", matchingItem.id);
        }
      }

      // Insert new enquiries (if replies raised new issues)
      if (new_enquiries && new_enquiries.length > 0) {
        const newItems = new_enquiries.map((item: any) => ({
          case_id,
          round_id: newRound.id,
          agent_type,
          enquiry_number: item.enquiry_number,
          category: item.category,
          issue_summary: item.issue_summary,
          original_enquiry_text: item.original_enquiry_text,
          evidence_required: item.evidence_required,
          status: "open",
          next_action: "raise_further",
        }));
        await adminClient.from("enquiry_items").insert(newItems);
      }

      // Save reply document metadata + compute affected report sections
      const { affectedSectionsFor } = await import("../_shared/enquirySectionMap.ts");
      const allAffectedSections = new Set<string>();

      for (const file of reply_files) {
        const classification = document_classifications?.find((dc: any) => dc.file_name === file.file_name);

        // Authoritative mapping = user-confirmed pre-scan result if present, else AI classification fallback.
        const confirmedIds: string[] = file.confirmed_enquiry_ids && file.confirmed_enquiry_ids.length > 0
          ? file.confirmed_enquiry_ids
          : (() => {
              const ids: string[] = [];
              for (const num of classification?.matched_enquiry_numbers || []) {
                const item = existingItems.find((i: any) => i.enquiry_number === num);
                if (item) ids.push(item.id);
              }
              return ids;
            })();

        // Derive affected report sections from the categories of the confirmed enquiries.
        const confirmedCategories = confirmedIds
          .map(id => existingItems.find((i: any) => i.id === id)?.category)
          .filter(Boolean) as string[];
        const fileSections = affectedSectionsFor(confirmedCategories);
        fileSections.forEach(s => allAffectedSections.add(s));

        await adminClient.from("enquiry_reply_documents").insert({
          case_id,
          agent_type,
          round_number: nextRoundNumber,
          file_name: file.file_name,
          file_path: file.file_path,
          doc_classification: classification?.classification || null,
          matched_enquiry_ids: confirmedIds, // legacy mirror
          confirmed_enquiry_ids: confirmedIds,
          ai_proposed_enquiry_ids: file.ai_proposed_enquiry_ids || [],
          ai_confidence: file.ai_confidence || {},
          auto_note: file.auto_note || null,
          affected_sections: fileSections,
          mapping_source: file.mapping_source || (confirmedIds.length > 0 ? "ai_auto_accepted" : "general_reply"),
          uploaded_by: userId,
        });
      }

      // Audit log
      await adminClient.from("audit_log").insert({
        case_reference: caseData.case_reference,
        user_id: userId,
        user_name: profile?.full_name || "Unknown",
        user_email: profile?.email || "Unknown",
        user_position: profile?.position || "",
        event_type: "enquiry_replies_ingested",
        metadata: {
          agent_type,
          round_number: nextRoundNumber,
          ai_run_id: aiRunId,
          files_count: reply_files.length,
          updates_count: enquiry_updates.length,
          new_enquiries_count: new_enquiries?.length || 0,
          fraud_indicators_count: fraud_indicators?.length || 0,
          judge_quality_score: qualityScore,
        },
      });

      // Check if all items are now satisfied
      const allSatisfied = existingItems.every((item: any) => {
        const update = enquiry_updates.find((u: any) => u.enquiry_number === item.enquiry_number);
        const newStatus = update ? update.new_status : item.status;
        return newStatus === "satisfied" || newStatus === "not_applicable";
      }) && (!new_enquiries || new_enquiries.length === 0);

      // ── Trigger targeted section re-analysis (background, non-blocking) ──
      // Only run if at least one section is affected by confirmed mappings.
      const affectedSectionsList = Array.from(allAffectedSections);
      let sectionRerunTriggered = false;

      if (affectedSectionsList.length > 0) {
        try {
          const { data: latestReport } = await adminClient
            .from("ai_reports")
            .select("id")
            .eq("case_id", case_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestReport?.id) {
            const replyFilesForRerun = reply_files.map((f) => ({
              file_name: f.file_name,
              enquiry_numbers: f.confirmed_enquiry_numbers || [],
              auto_note: f.auto_note,
            }));

            const rerunPromise = fetch(`${supabaseUrl}/functions/v1/sow-section-rerun`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                case_id,
                agent_type,
                ai_report_id: latestReport.id,
                round_id: newRound.id,
                round_number: nextRoundNumber,
                affected_sections: affectedSectionsList,
                reply_files: replyFilesForRerun,
              }),
            }).catch((e) => {
              console.error("[ingest-replies] sow-section-rerun trigger failed:", e);
            });

            // Fire-and-forget — caller does not block
            // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime
            if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
              // @ts-ignore
              EdgeRuntime.waitUntil(rerunPromise);
            }
            sectionRerunTriggered = true;
          } else {
            console.log("[ingest-replies] no ai_report found — skipping section re-run trigger");
          }
        } catch (e) {
          console.error("[ingest-replies] failed to trigger section re-run (non-fatal):", e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        ai_run_id: aiRunId,
        round_number: nextRoundNumber,
        updates_count: enquiry_updates.length,
        new_enquiries_count: new_enquiries?.length || 0,
        fraud_indicators,
        all_satisfied: allSatisfied,
        affected_sections: affectedSectionsList,
        section_rerun_triggered: sectionRerunTriggered,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (action === "generate_final") {
      // Check all items are satisfied (or overridden)
      const openItems = existingItems.filter((i: any) =>
        i.status === "open" || i.status === "partially_satisfied" || i.status === "escalate"
      );

      // Check for override
      const { data: overrides } = await adminClient
        .from("enquiry_overrides")
        .select("*")
        .eq("case_id", case_id)
        .eq("agent_type", agent_type)
        .order("created_at", { ascending: false })
        .limit(1);

      const hasOverride = overrides && overrides.length > 0;

      if (openItems.length > 0 && !hasOverride) {
        return new Response(JSON.stringify({
          error: `Cannot generate final report: ${openItems.length} enquir${openItems.length !== 1 ? "ies" : "y"} still outstanding. Resolve all enquiries or use the Override & Finalise option.`,
          open_count: openItems.length,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const firmName = profile?.firm_name || "Not specified";

      // Build the full tracker context
      const trackerContext = existingItems.map((item: any) =>
        `[${item.enquiry_number}] Status: ${item.status}\n  Issue: ${item.issue_summary}\n  Original: ${item.original_enquiry_text}\n  Reply: ${item.reply_summary || "No reply received"}\n  Evidence: ${item.evidence_received || "None"}`
      ).join("\n\n");

      const overrideContext = hasOverride
        ? `\n\nNOTE: A finalisation override was applied. Reason: "${overrides[0].reason}". Open items at time of override: ${overrides[0].open_enquiry_ids?.length || 0}.`
        : "";

      const agentLabels: Record<string, string> = {
        sow: "Olimey AI",
      };

      const systemPrompt = `You are a Final Report Generation Agent for Olimey AI.

ROLE: Generate the Final Report to Client for ${agentLabels[agent_type]} based on the completed enquiry tracker.

STRICT RULES:
1. This is a client-facing document. Use clear, non-technical language.
2. Do not include internal risk scores, QA references, or [Doc:...] citations.
3. Do not provide legal advice. Use "consider discussing with us" for recommendations.
4. Include "Final" in the title.
5. Include date, case reference, and property address.
6. UK English only.
7. For any items that were overridden (not fully satisfied), clearly state what remains unresolved.${overrideContext}

CASE CONTEXT:
- Case Reference: ${caseData.case_reference}
- Property: ${caseData.property_address}
- Tenure: ${caseData.tenure}
- Transaction: ${caseData.transaction_type}
- Lender: ${caseData.lender || "None"}
- Firm: ${firmName}`;

      const userPrompt = `Generate the Final Client Report based on this completed enquiry tracker:

${trackerContext}

The report should cover:
- What searches were reviewed
- Headline results and material risks
- How each enquiry was resolved (evidence relied on)
- Any residual risks accepted
- "What this means for exchange" section (non-advisory tone)
- Any recommendations phrased as "consider discussing with us"

Also generate an Internal Completion Note mapping each issue to evidence received and enquiry closure status.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "produce_final_report",
                description: "Submit the final client report and internal completion note",
                parameters: {
                  type: "object",
                  properties: {
                    final_client_report: { type: "string", description: "The Final Report to Client — Searches. Plain English, professional, includes all resolved enquiries and evidence." },
                    internal_completion_note: { type: "string", description: "Internal audit note mapping each issue to evidence received and closure status." },
                  },
                  required: ["final_client_report", "internal_completion_note"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "produce_final_report" } },
        }),
      });

      if (!aiResponse.ok) {
        return new Response(JSON.stringify({ error: "AI failed to generate final report. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiText = await aiResponse.text();
      const aiResult = JSON.parse(aiText);

      const usage = aiResult.usage;
      if (usage) {
        console.log(`[TOKEN_USAGE] generate-final | case=${case_id} | model=gemini-2.5-flash | prompt_tokens=${usage.prompt_tokens} | completion_tokens=${usage.completion_tokens} | total_tokens=${usage.total_tokens}`);
      }

      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return new Response(JSON.stringify({ error: "AI did not produce structured output" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const finalResult = JSON.parse(toolCall.function.arguments);

      // Create a "final" round
      await adminClient.from("enquiry_rounds").insert({
        case_id,
        agent_type,
        round_number: nextRoundNumber,
        status: "satisfied",
        internal_report: finalResult.internal_completion_note,
        draft_email: null,
        outstanding_summary: null,
        ai_run_id: aiRunId,
        created_by: userId,
      });

      // Audit log
      await adminClient.from("audit_log").insert({
        case_reference: caseData.case_reference,
        user_id: userId,
        user_name: profile?.full_name || "Unknown",
        user_email: profile?.email || "Unknown",
        user_position: profile?.position || "",
        event_type: "final_report_generated",
        metadata: {
          agent_type,
          ai_run_id: aiRunId,
          overridden: hasOverride,
        },
      });

      return new Response(JSON.stringify({
        success: true,
        ai_run_id: aiRunId,
        final_client_report: finalResult.final_client_report,
        internal_completion_note: finalResult.internal_completion_note,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("ingest-replies error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

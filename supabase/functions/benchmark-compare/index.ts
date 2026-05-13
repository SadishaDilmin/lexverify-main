import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { processDocument, buildMultimodalContent } from "../_shared/documentProcessor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* ── Difference types as per spec ── */
const DIFFERENCE_TYPES = [
  "ai_missed_material_issue",
  "ai_false_positive",
  "data_extraction_error",
  "severity_classification_error",
  "action_recommendation_error",
  "evidence_citation_failure",
  "match",
] as const;

class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

/* ── AI call helper — supports model selection for cross-family judging ── */
async function callAI(systemPrompt: string, userPrompt: string | any[], model = "google/gemini-2.5-flash"): Promise<string> {
  const userContent = typeof userPrompt === "string" ? userPrompt : userPrompt;
  const body: any = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };
  // Only set temperature for models that support it (not OpenAI)
  if (!model.startsWith("openai/")) {
    body.temperature = 0.1;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      if (resp.status === 402) {
        throw new HttpError(
          402,
          "Lovable AI credit limit reached. Please check your Lovable plan or wait for credits to reset before running benchmarks.",
          "payment_required",
        );
      }
      if ((resp.status === 502 || resp.status === 503 || resp.status === 429) && attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`AI call attempt ${attempt + 1} failed (${resp.status}), retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`AI call failed: ${resp.status} ${text}`);
    }
    try {
      const data = JSON.parse(text);
      return data.choices?.[0]?.message?.content ?? "";
    } catch {
      if (attempt < 2) {
        console.warn(`AI response JSON parse failed (attempt ${attempt + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }
  throw new Error("AI call failed after retries");
}

function parseJSON(raw: string): any[] {
  try {
    return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return [];
  }
}

/* ── Normalisation prompt ── */
const NORMALISE_SYSTEM = `You are a legal document analysis expert. You must extract ALL distinct issues/findings from the provided output into a structured JSON array.

Each issue must be an object with these fields:
- issue_type: string (e.g. "title_restriction", "lease_risk", "aml_inconsistency", "missing_document", "data_point", "compliance_finding", "risk_flag")
- document_source: string (which document this relates to, or "General" if not document-specific)
- extracted_clause: string (the specific clause, data point, or finding text)
- risk_severity: string (one of: "critical", "high", "medium", "low", "info")
- evidence_citation: string (quote from evidence supporting this finding, or empty)
- conclusion: string (the professional's conclusion about this issue)
- recommended_action: string (what action was recommended)

Return ONLY a JSON array. No markdown, no explanation. If no issues found, return [].`;

/* ── Comparison prompt ── */
const COMPARE_SYSTEM = `You are a legal AI evaluation expert. You must compare human professional findings against AI-generated findings for the same case.

For each finding across both sets, classify the difference:
- "match": Both identified the same issue with similar severity and action
- "ai_missed_material_issue": Human found it, AI did not
- "ai_false_positive": AI flagged it, Human did not identify it as an issue
- "data_extraction_error": AI extracted incorrect data (wrong name, date, amount, clause, etc.)
- "severity_classification_error": Both found the issue but severity differs materially
- "action_recommendation_error": AI identified issue but recommended wrong next step
- "evidence_citation_failure": AI made conclusion without referencing supporting evidence

Return a JSON array of comparison items. Each item:
{
  "difference_type": one of the types above,
  "issue_type": string describing the issue category,
  "document_source": which document this relates to,
  "evidence_text": relevant evidence text,
  "human_finding": what the human found (empty if AI-only),
  "ai_finding": what the AI found (empty if human-only),
  "human_severity": human's severity rating or null,
  "ai_severity": AI's severity rating or null,
  "human_action": human's recommended action or null,
  "ai_action": AI's recommended action or null,
  "evidence_citation": supporting evidence quote,
  "notes": brief explanation of the difference
}

Return ONLY a JSON array. No markdown.`;

/* ── Judge prompt (cross-family: GPT-5 judges Gemini output) ── */
const JUDGE_SYSTEM = `You are an independent legal AI evaluation judge. You MUST be from a different AI model family than the operational agent being tested. Your role is to adjudicate disputed benchmark comparison items.

For each item, evaluate:
1. Was the AI output correct? (ai_was_correct: boolean)
2. Was the ground truth/human finding stronger? (ground_truth_stronger: boolean)
3. Was the AI conclusion partially acceptable? (partially_acceptable: boolean)
4. Was the AI finding evidence-grounded? (evidence_grounded: boolean)

Provide your reasoning for each verdict.

Return a JSON array of judge reviews:
{
  "item_index": number (0-based index of the comparison item),
  "verdict": string (one of: "ai_correct", "human_correct", "partially_correct", "inconclusive"),
  "ai_was_correct": boolean,
  "ground_truth_stronger": boolean,
  "partially_acceptable": boolean,
  "evidence_grounded": boolean,
  "reasoning": string (clear explanation of your judgment),
  "confidence": number (0.0 to 1.0)
}

Return ONLY a JSON array. No markdown.`;

/* ── Extraction agent prompt ── */
const EXTRACTION_AGENT_SYSTEM = `You are a senior legal professional reviewing conveyancing documents. Analyse the provided documents thoroughly and produce a comprehensive report identifying ALL issues, risks, findings, and data points.

For each finding, include:
- The specific issue or data point found
- Which document it appears in
- The severity (critical, high, medium, low, info)
- Your recommended action
- Any relevant evidence quotes

Be thorough and systematic. Do not miss any material issues. Structure your output clearly with numbered findings.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check — accept service role key for server-to-server (benchmark-worker) calls
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
    let callerId = "00000000-0000-0000-0000-000000000000";
    let callerEmail = "system@benchmark-worker";

    if (!isServiceRole) {
      // Verify the user is admin
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check admin role
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      callerId = user.id;
      callerEmail = user.email || "";
    }

    const { benchmark_case_id, skip_judge, run_extraction } = await req.json();
    if (!benchmark_case_id) {
      return new Response(JSON.stringify({ error: "benchmark_case_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch the benchmark case for agent_type
    const { data: benchCase, error: bcErr } = await supabase.from("benchmark_cases").select("*").eq("id", benchmark_case_id).single();
    if (bcErr || !benchCase) throw new Error("Benchmark case not found");

    /* ══════════════════════════════════════════════════════════════════
       EXTRACTION MODE: Download PDFs → processDocument → AI analysis
       ══════════════════════════════════════════════════════════════════ */
    if (run_extraction) {
      // Fetch evidence documents
      const { data: evidenceDocs, error: edErr } = await supabase
        .from("benchmark_documents")
        .select("*")
        .eq("benchmark_case_id", benchmark_case_id);
      if (edErr) throw edErr;
      if (!evidenceDocs || evidenceDocs.length === 0) {
        return new Response(JSON.stringify({ error: "No evidence documents found. Upload PDFs first." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[benchmark-compare] Extraction mode: processing ${evidenceDocs.length} documents`);

      // Download and process each document
      const processedDocs: any[] = [];
      for (const doc of evidenceDocs) {
        try {
          const { data: fileData, error: dlErr } = await supabase.storage
            .from("benchmark-documents")
            .download(doc.file_path);
          if (dlErr || !fileData) {
            console.error(`Failed to download ${doc.file_name}:`, dlErr);
            await supabase.from("benchmark_documents").update({
              extraction_error: dlErr?.message || "Download failed",
              last_extracted_at: new Date().toISOString(),
            }).eq("id", doc.id);
            continue;
          }

          const bytes = new Uint8Array(await fileData.arrayBuffer());
          const processed = await processDocument(doc.file_name, bytes, doc.doc_type || "Evidence", { aiApiKey: LOVABLE_API_KEY });

          // Determine extraction method
          let extractionMethod = "unknown";
          if (processed.isMultimodal) {
            extractionMethod = "multimodal_ocr";
          } else if (processed.notes?.includes("DOCX")) {
            extractionMethod = "docx_xml";
          } else if (processed.textContent) {
            extractionMethod = "text_parse";
          }

          const charCount = processed.textContent?.length || 0;

          // Update extraction metadata on the document row
          await supabase.from("benchmark_documents").update({
            extraction_method: extractionMethod,
            extracted_chars: charCount,
            extraction_error: null,
            last_extracted_at: new Date().toISOString(),
          }).eq("id", doc.id);

          processedDocs.push(processed);
          console.log(`[${doc.file_name}] Extracted via ${extractionMethod}: ${charCount} chars`);
        } catch (procErr: any) {
          console.error(`Error processing ${doc.file_name}:`, procErr);
          await supabase.from("benchmark_documents").update({
            extraction_error: procErr.message,
            last_extracted_at: new Date().toISOString(),
          }).eq("id", doc.id);
        }
      }

      if (processedDocs.length === 0) {
        return new Response(JSON.stringify({ error: "No documents could be processed. Check extraction errors." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch the active agent prompt
      let agentSystemPrompt = EXTRACTION_AGENT_SYSTEM;
      const { data: promptVersion } = await supabase
        .from("prompt_versions")
        .select("prompt_text, version")
        .eq("agent_id", benchCase.agent_type)
        .eq("status", "deployed")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (promptVersion?.prompt_text) {
        agentSystemPrompt = promptVersion.prompt_text;
        console.log(`Using deployed prompt v${promptVersion.version} for ${benchCase.agent_type}`);
      } else {
        console.log(`No deployed prompt found for ${benchCase.agent_type}, using default extraction prompt`);
      }

      // Build multimodal content and call AI
      const preamble = `Analyse the following ${processedDocs.length} document(s) for a ${benchCase.transaction_type} conveyancing transaction.\nProperty: ${benchCase.property_address || "Not specified"}\nCase type: ${benchCase.case_type}\n\nProvide a comprehensive analysis of all issues, risks, and findings.`;
      const content = buildMultimodalContent(preamble, processedDocs);

      console.log(`[benchmark-compare] Calling AI agent for extraction analysis...`);
      const agentOutput = await callAI(agentSystemPrompt, content, "google/gemini-2.5-flash");

      // Store as a new AI output
      await supabase.from("benchmark_outputs").insert({
        benchmark_case_id,
        output_type: "ai",
        label: `AI (PDF Extraction — ${new Date().toISOString().slice(0, 10)})`,
        content: agentOutput,
        uploaded_by: callerId,
      });

      // Audit log
      await supabase.from("audit_log").insert({
        user_id: callerId,
        user_name: "",
        user_email: callerEmail,
        event_type: "benchmark_extraction_run",
        metadata: {
          benchmark_case_id,
          documents_processed: processedDocs.length,
          total_documents: evidenceDocs.length,
          agent_type: benchCase.agent_type,
          prompt_version: promptVersion?.version || "default",
        },
      });

      return new Response(JSON.stringify({
        success: true,
        documents_processed: processedDocs.length,
        total_documents: evidenceDocs.length,
        output_chars: agentOutput.length,
        message: "Extraction complete. AI output saved. You can now run a comparison.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ══════════════════════════════════════════════════════════════════
       STANDARD COMPARISON MODE (existing flow)
       ══════════════════════════════════════════════════════════════════ */

    // Fetch outputs
    const { data: outputs, error: outErr } = await supabase
      .from("benchmark_outputs")
      .select("*")
      .eq("benchmark_case_id", benchmark_case_id);
    if (outErr) throw outErr;

    const humanOutputs = (outputs || []).filter((o: any) => o.output_type === "human");
    const aiOutputs = (outputs || []).filter((o: any) => o.output_type === "ai");

    if (humanOutputs.length === 0 || aiOutputs.length === 0) {
      return new Response(JSON.stringify({ error: "Need at least one human and one AI output" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRunId = crypto.randomUUID();

    // Create comparison record
    const { data: comparison, error: compErr } = await supabase
      .from("benchmark_comparisons")
      .insert({ benchmark_case_id, created_by: callerId, ai_run_id: aiRunId, status: "processing", judge_status: "pending" })
      .select("id")
      .single();
    if (compErr) throw compErr;

    // Combine all outputs into text blocks
    const humanText = humanOutputs.map((o: any) => `### ${o.label}\n${o.content}`).join("\n\n---\n\n");
    const aiText = aiOutputs.map((o: any) => `### ${o.label}\n${o.content}`).join("\n\n---\n\n");

    // Steps 1 & 2: Normalise human + AI outputs in parallel
    const [humanNormRaw, aiNormRaw] = await Promise.all([
      callAI(NORMALISE_SYSTEM, `Extract all issues from this HUMAN PROFESSIONAL output:\n\n${humanText}`),
      callAI(NORMALISE_SYSTEM, `Extract all issues from this AI-GENERATED output:\n\n${aiText}`),
    ]);
    const humanIssues = parseJSON(humanNormRaw);
    const aiIssues = parseJSON(aiNormRaw);

    // Step 3: Compare — use scope-aware prompt ONLY for synthetic cases with ≤2 ground truths
    // Leniency capped at max 1 "outside_ground_truth_scope" match; everything else → ai_false_positive
    const isSyntheticSparse = benchCase.source_type === "synthetic" && humanIssues.length <= 2;

    const comparePrompt = isSyntheticSparse
      ? `Compare these findings from the SAME legal case.

IMPORTANT CONTEXT: The human ground truth is extremely sparse (${humanIssues.length} findings) from a synthetic test case. Apply these rules STRICTLY:
- AI findings that match or relate to the human findings should be classified normally (match, severity_classification_error, etc.)
- You may classify AT MOST 1 AI finding that covers topics/documents OUTSIDE the scope of the human ground truth as "match" with a note "outside_ground_truth_scope"
- ALL other AI findings beyond that 1 leniency allowance that do not match the human ground truth MUST be classified as "ai_false_positive"
- Any AI finding that is genuinely WRONG or FABRICATED must always be classified as "ai_false_positive" regardless of the above

HUMAN PROFESSIONAL FINDINGS (${humanIssues.length} focused issues):
${JSON.stringify(humanIssues, null, 2)}

AI-GENERATED FINDINGS (${aiIssues.length} issues):
${JSON.stringify(aiIssues, null, 2)}

Identify all matches, missed issues, false positives, extraction errors, severity mismatches, action errors, and citation failures.`
      : `Compare these findings from the SAME legal case.

HUMAN PROFESSIONAL FINDINGS (${humanIssues.length} issues):
${JSON.stringify(humanIssues, null, 2)}

AI-GENERATED FINDINGS (${aiIssues.length} issues):
${JSON.stringify(aiIssues, null, 2)}

Identify all matches, missed issues, false positives, extraction errors, severity mismatches, action errors, and citation failures.`;

    const compareRaw = await callAI(COMPARE_SYSTEM, comparePrompt);
    const comparisonItems = parseJSON(compareRaw);

    // Insert comparison items and collect IDs
    let insertedItemIds: string[] = [];
    if (comparisonItems.length > 0) {
      const rows = comparisonItems.map((item: any) => ({
        comparison_id: comparison.id,
        difference_type: DIFFERENCE_TYPES.includes(item.difference_type) ? item.difference_type : "match",
        issue_type: item.issue_type || "",
        document_source: item.document_source || "",
        evidence_text: item.evidence_text || "",
        human_finding: item.human_finding || "",
        ai_finding: item.ai_finding || "",
        human_severity: item.human_severity || null,
        ai_severity: item.ai_severity || null,
        human_action: item.human_action || null,
        ai_action: item.ai_action || null,
        evidence_citation: item.evidence_citation || null,
        notes: item.notes || null,
      }));
      const { data: inserted } = await supabase.from("benchmark_comparison_items").insert(rows).select("id");
      insertedItemIds = (inserted || []).map((r: any) => r.id);
    }

    // Calculate summary stats
    const stats: Record<string, number> = {};
    for (const item of comparisonItems) {
      const dt = DIFFERENCE_TYPES.includes(item.difference_type) ? item.difference_type : "match";
      stats[dt] = (stats[dt] || 0) + 1;
    }

    // Calculate scoring metrics
    const total = comparisonItems.length || 1;
    const matches = stats["match"] || 0;
    const missed = stats["ai_missed_material_issue"] || 0;
    const falsePos = stats["ai_false_positive"] || 0;
    const extractionErr = stats["data_extraction_error"] || 0;
    const actionErr = stats["action_recommendation_error"] || 0;
    const citationErr = stats["evidence_citation_failure"] || 0;
    const severityErr = stats["severity_classification_error"] || 0;

    // True positives = AI found a REAL issue (match + issues where AI found it but got metadata wrong)
    // Only ai_false_positive is a false positive; only ai_missed_material_issue is a false negative
    const truePositives = matches + severityErr + actionErr + citationErr + extractionErr;
    const recall = humanIssues.length > 0 ? truePositives / (truePositives + missed) : null;
    const precision = (truePositives + falsePos) > 0 ? truePositives / (truePositives + falsePos) : null;
    const extractionAccuracy = total > 0 ? (total - extractionErr) / total : null;
    const reasoningQuality = total > 0 ? (total - actionErr - severityErr) / total : null;
    const evidenceGrounding = total > 0 ? (total - citationErr) / total : null;

    // Fetch active prompt version for the agent
    let promptVersion: string | null = null;
    const { data: pv } = await supabase.from("prompt_versions").select("version")
      .eq("agent_id", benchCase.agent_type).eq("status", "deployed")
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (pv) promptVersion = `v${pv.version}`;

    // ── Step 4: Judge Layer (cross-family: GPT-5 judges Gemini comparison) ──
    // Model Family Diversity Gate: If synthetic + Gemini-generated, force GPT-5 Nano judge
    let judgeModel = "openai/gpt-5-mini";
    if (benchCase.source_type === "synthetic") {
      // Synthetic cases are generated by Gemini — force cross-family judge
      judgeModel = "openai/gpt-5-nano";
      console.log(`[Diversity Gate] Synthetic case detected — forcing judge to ${judgeModel} to prevent model-on-model bias`);
    }

    let judgeStatus = "pending";
    let judgeSummary: any = null;

    // Only run judge on non-match items
    const disputedItems = comparisonItems
      .map((item: any, i: number) => ({ ...item, _index: i, _dbId: insertedItemIds[i] }))
      .filter((item: any) => item.difference_type !== "match");

    if (!skip_judge && disputedItems.length > 0) {
      try {
        judgeStatus = "processing";
        await supabase.from("benchmark_comparisons").update({ judge_status: "processing" }).eq("id", comparison.id);

        const judgePrompt = `Judge these ${disputedItems.length} disputed comparison items between a human professional and an AI legal agent:

${JSON.stringify(disputedItems.map((d: any, i: number) => ({
  item_index: i,
  difference_type: d.difference_type,
  issue_type: d.issue_type,
  document_source: d.document_source,
  human_finding: d.human_finding,
  ai_finding: d.ai_finding,
  human_severity: d.human_severity,
  ai_severity: d.ai_severity,
  evidence_text: d.evidence_text,
  notes: d.notes,
})), null, 2)}

For each item, provide your independent judgment.`;

        // Use the selected judge model (cross-family enforced for synthetic cases)
        const judgeRaw = await callAI(JUDGE_SYSTEM, judgePrompt, judgeModel);
        const judgeResults = parseJSON(judgeRaw);

        if (judgeResults.length > 0) {
          const judgeRows = judgeResults.map((jr: any) => {
            const disputedItem = disputedItems[jr.item_index] || disputedItems[0];
            return {
              comparison_id: comparison.id,
              comparison_item_id: disputedItem._dbId,
              judge_model: judgeModel,
              judge_verdict: jr.verdict || "inconclusive",
              ai_was_correct: jr.ai_was_correct ?? null,
              ground_truth_stronger: jr.ground_truth_stronger ?? null,
              partially_acceptable: jr.partially_acceptable ?? null,
              evidence_grounded: jr.evidence_grounded ?? null,
              judge_reasoning: jr.reasoning || "",
              confidence_score: jr.confidence ?? null,
            };
          }).filter((r: any) => r.comparison_item_id);

          if (judgeRows.length > 0) {
            await supabase.from("benchmark_judge_reviews").insert(judgeRows);
          }

          // Compute judge summary
          const aiCorrect = judgeResults.filter((r: any) => r.ai_was_correct).length;
          const humanCorrect = judgeResults.filter((r: any) => r.ground_truth_stronger).length;
          const partial = judgeResults.filter((r: any) => r.partially_acceptable).length;
          const grounded = judgeResults.filter((r: any) => r.evidence_grounded).length;

          judgeSummary = {
            total_judged: judgeResults.length,
            ai_correct: aiCorrect,
            human_correct: humanCorrect,
            partially_acceptable: partial,
            evidence_grounded: grounded,
            verdicts: judgeResults.reduce((acc: Record<string, number>, r: any) => {
              acc[r.verdict] = (acc[r.verdict] || 0) + 1;
              return acc;
            }, {}),
          };
          judgeStatus = "complete";
        } else {
          judgeStatus = "no_disputes";
        }
      } catch (judgeErr: any) {
        console.error("Judge layer error:", judgeErr);
        judgeStatus = "failed";
        judgeSummary = { error: judgeErr.message };
      }
    } else if (disputedItems.length === 0) {
      judgeStatus = "no_disputes";
    }

    // Update comparison as complete
    await supabase.from("benchmark_comparisons").update({
      status: "complete",
      is_audited: false,
      completed_at: new Date().toISOString(),
      summary_stats: { ...stats, total: comparisonItems.length, human_issues: humanIssues.length, ai_issues: aiIssues.length },
      recall_score: recall !== null ? Math.round(recall * 100) / 100 : null,
      precision_score: precision !== null ? Math.round(precision * 100) / 100 : null,
      extraction_accuracy: extractionAccuracy !== null ? Math.round(extractionAccuracy * 100) / 100 : null,
      reasoning_quality: reasoningQuality !== null ? Math.round(reasoningQuality * 100) / 100 : null,
      evidence_grounding: evidenceGrounding !== null ? Math.round(evidenceGrounding * 100) / 100 : null,
      prompt_version: promptVersion,
      judge_status: judgeStatus,
      judge_summary: judgeSummary,
    }).eq("id", comparison.id);

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: callerId,
      user_name: "",
      user_email: callerEmail,
      event_type: "benchmark_comparison_run",
      metadata: {
        benchmark_case_id,
        comparison_id: comparison.id,
        total_items: comparisonItems.length,
        judge_status: judgeStatus,
        judge_summary: judgeSummary,
      },
    });

    return new Response(JSON.stringify({
      comparison_id: comparison.id,
      total_items: comparisonItems.length,
      stats,
      judge_status: judgeStatus,
      judge_summary: judgeSummary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("benchmark-compare error:", err);
    const message = err?.message || "Internal server error";
    const isCreditLimit = err?.status === 402 || /payment_required|not enough credits|credit limit reached/i.test(message);
    const status = typeof err?.status === "number" ? err.status : (isCreditLimit ? 402 : 500);
    const payload: Record<string, string> = { error: message };
    if (status === 402) payload.code = "payment_required";
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Timeout helper ── */
function withTimeout<T>(promise: Promise<T>, ms: number, label = "AI call"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/* ── Wall-clock guard — abort everything if we're nearing edge function limit ── */
const WALL_CLOCK_LIMIT_MS = 240_000; // 240s (edge limit ~300s for Supabase)
let requestStartedAt = Date.now();
function checkWallClock(step: string) {
  const elapsed = Date.now() - requestStartedAt;
  if (elapsed > WALL_CLOCK_LIMIT_MS) {
    throw new Error(`Wall-clock limit reached at step "${step}" (${Math.round(elapsed / 1000)}s elapsed)`);
  }
}

/* ── AI call helper ── */
const FALLBACK_MODEL = "google/gemini-2.5-flash";

async function callAISingle(
  lovableKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  temperature: number,
  jsonMode: boolean,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: userPrompt },
    ],
  };
  if (!model.startsWith("openai/")) body.temperature = temperature;
  if (jsonMode) body.response_format = { type: "json_object" };

  const resp = await withTimeout(
    fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    60_000,
    `${model} call`,
  );
  const rawText = await resp.text();
  if (!resp.ok) throw new Error(`AI call failed: ${resp.status} ${rawText}`);
  if (!rawText || rawText.trim().length === 0) {
    throw new Error(`AI returned empty body (status ${resp.status}, model ${model})`);
  }
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`AI returned invalid JSON (len=${rawText.length}, start=${rawText.slice(0, 80)})`);
  }
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error(`AI returned empty content (model ${model})`);
  return content;
}

async function callAI(
  lovableKey: string,
  systemPrompt: string,
  userPrompt: string,
  model = "google/gemini-2.5-flash",
  temperature = 0.1,
  jsonMode = false,
): Promise<string> {
  try {
    return await callAISingle(lovableKey, systemPrompt, userPrompt, model, temperature, jsonMode);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    // Auto-retry with fallback model on empty body / empty content errors
    if (model !== FALLBACK_MODEL && (msg.includes("empty body") || msg.includes("empty content"))) {
      console.warn(`Primary model ${model} failed (${msg}), retrying with ${FALLBACK_MODEL}...`);
      return await callAISingle(lovableKey, systemPrompt, userPrompt, FALLBACK_MODEL, temperature, jsonMode);
    }
    throw err;
  }
}

/* ── Check if findings are already in normalized structure ── */
function isNormalizedStructure(items: unknown[]): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  const required = ["issue_type", "document_source", "risk_severity"];
  return items.every(
    (item: any) =>
      typeof item === "object" &&
      item !== null &&
      required.every((f) => typeof item[f] === "string" && item[f].length > 0),
  );
}

function parseJSON(raw: string): any[] {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : parsed.issues ?? parsed.items ?? [parsed];
  } catch {
    return [];
  }
}

/* ── Constants ── */
const DIFFERENCE_TYPES = [
  "ai_missed_material_issue", "ai_false_positive", "data_extraction_error",
  "severity_classification_error", "action_recommendation_error", "evidence_citation_failure", "match",
] as const;

const NORMALISE_SYSTEM = `You are a legal document analysis expert. Extract ALL distinct issues/findings into a structured JSON array.
Each issue: { "issue_type": string, "document_source": string, "extracted_clause": string, "risk_severity": "critical"|"high"|"medium"|"low"|"info", "evidence_citation": string, "conclusion": string, "recommended_action": string }
Return ONLY a JSON array. No markdown.`;

const COMPARE_SYSTEM = `You are a legal AI evaluation expert. Compare human professional findings against AI-generated findings.
For each finding, classify: "match", "ai_missed_material_issue", "ai_false_positive", "data_extraction_error", "severity_classification_error", "action_recommendation_error", "evidence_citation_failure".
Return a JSON array of: { "difference_type", "issue_type", "document_source", "evidence_text", "human_finding", "ai_finding", "human_severity", "ai_severity", "human_action", "ai_action", "evidence_citation", "notes" }
Return ONLY a JSON array.`;

const JUDGE_SYSTEM = `You are an independent legal AI evaluation judge from a different model family. Adjudicate disputed items.
Return a JSON array of: { "item_index": number, "verdict": "ai_correct"|"human_correct"|"partially_correct"|"inconclusive", "ai_was_correct": boolean, "ground_truth_stronger": boolean, "partially_acceptable": boolean, "evidence_grounded": boolean, "reasoning": string, "confidence": number(0-1) }
Return ONLY a JSON array.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let requestBody: any = null;
  try {
    requestStartedAt = Date.now(); // Reset wall-clock per request
    requestBody = await req.json();
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    // Verify admin (parallel: auth + role check can't be parallelized — role needs user.id)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const admin = createClient(supabaseUrl, serviceKey);

    // Parallel: role check + profile fetch (both need user.id, independent of each other)
    const [roleRes, profileRes] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle(),
      admin.from("profiles").select("full_name, email, position").eq("user_id", user.id).single(),
    ]);
    if (!roleRes.data) throw new Error("Admin access required");
    const profile = profileRes.data as { full_name: string; email: string; position: string } | null;

    const {
      scenarios, property_config, difficulty, job_id, agent_type: reqAgentType,
    }: {
      scenarios: { scenario_type: string; description: string; expected_risks: any[]; category?: string }[];
      property_config?: { tenure: string; transaction_type: string };
      difficulty: string;
      job_id: string;
      agent_type?: string;
    } = requestBody;

    const agentType = reqAgentType ?? "source-of-wealth";
    const tenure = property_config?.tenure ?? "Freehold";
    const txType = property_config?.transaction_type ?? "Purchase";

    // Step tracking helper
    let sgcId: string | null = null;
    const updateStep = (step: string) => {
      if (!sgcId) return Promise.resolve();
      return admin.from("synthetic_generated_cases").update({ current_step: step } as any).eq("id", sgcId).then(() => {});
    };

    // ── Step 1: Generate synthetic documents ──
    const scenarioBlock = scenarios
      .map((s, i) => `${i + 1}. ${s.scenario_type}: ${s.description}\n   Expected risks: ${JSON.stringify(s.expected_risks)}`)
      .join("\n");

    // Agent-specific document sets
    const AGENT_DOC_SETS: Record<string, string> = {
      "source-of-wealth": `1. **Source of Wealth Declaration** — with employment history, income details, and funding breakdown
2. **Bank Statements Summary** — showing transaction patterns and balances
3. **Property Information Form** — with standard responses plus relevant disclosures
4. **Mortgage Offer / Funding Evidence** — with lender details and conditions`,
    };

    const docSet = AGENT_DOC_SETS[agentType] ?? AGENT_DOC_SETS["source-of-wealth"];

    const docContent = await callAI(
      lovableKey, "",
      `You are a UK conveyancing document generator creating SYNTHETIC training data for AI testing.

Generate a realistic set of conveyancing documents for a ${tenure} ${txType} transaction.
Difficulty level: ${difficulty}.
Agent type: ${agentType}.

The documents MUST naturally contain the following legal issues (injected realistically into the appropriate document sections):

${scenarioBlock}

Generate the following documents as structured markdown sections:
${docSet}

Requirements:
- Use a realistic but FICTIONAL English property address
- Use realistic but FICTIONAL names and dates
- Vary clause wording — do NOT use template language
- Each issue must appear naturally within the relevant document section
- Mark nothing as synthetic in the document text itself

Return ONLY valid JSON:
{
  "property_address": "...",
  "documents": [
    { "title": "...", "content": "..." }
  ]
}`,
      "google/gemini-2.5-flash", 0.9, true,
    );

    let docs: { property_address: string; documents: { title: string; content: string }[] };
    const parseDocResponse = (raw: string) => {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      if (!cleaned) throw new Error("Empty AI response");
      return JSON.parse(cleaned);
    };

    try {
      docs = parseDocResponse(docContent);
    } catch (e) {
      console.warn("Doc parse attempt 1 failed, retrying with gemini-2.5-flash...", (e as Error).message);
      console.warn("Raw response length:", docContent.length, "first 500:", docContent.slice(0, 500));
      // Retry once with a different model
      const retryContent = await callAI(
        lovableKey, "",
        `You are a UK conveyancing document generator creating SYNTHETIC training data for AI testing.

Generate a realistic set of conveyancing documents for a ${tenure} ${txType} transaction.
Difficulty level: ${difficulty}. Agent type: ${agentType}.

The documents MUST naturally contain the following legal issues:
${scenarioBlock}

Generate the following documents as structured markdown sections:
${docSet}

Requirements:
- Use a realistic but FICTIONAL English property address
- Use realistic but FICTIONAL names and dates
- Each issue must appear naturally within the relevant document section

Return ONLY valid JSON:
{
  "property_address": "...",
  "documents": [
    { "title": "...", "content": "..." }
  ]
}`,
        "google/gemini-2.5-flash", 0.9, true,
      );
      try {
        docs = parseDocResponse(retryContent);
      } catch (e2) {
        console.error("Doc parse retry also failed. Length:", retryContent.length, "first 500:", retryContent.slice(0, 500));
        throw new Error("Failed to parse document generation response after retry");
      }
    }

    // ── Step 2: Generate gold-standard answers ──
    checkWallClock("gold-standard generation");
    const goldContent = await callAI(
      lovableKey, "",
      `You are a senior UK conveyancing solicitor reviewing synthetic case documents for AI benchmarking.

Given these documents:
${docs.documents.map((d) => `## ${d.title}\n${d.content}`).join("\n\n")}

And these injected scenarios:
${scenarioBlock}

For EACH injected issue, produce a gold-standard expected AI output.

Return ONLY valid JSON array:
[
  {
    "issue_type": "...",
    "severity": "Critical|High|Medium|Low",
    "evidence_source": "which document section",
    "evidence_text": "exact quote from the document",
    "correct_conclusion": "what the AI should conclude",
    "correct_recommended_action": "what the AI should recommend"
  }
]`,
      "google/gemini-2.5-flash", 0.3, true,
    );

    let goldStandard: any[];
    try {
      const parsed = JSON.parse(goldContent);
      goldStandard = Array.isArray(parsed) ? parsed : parsed.issues ?? parsed.gold_standard ?? [parsed];
    } catch { throw new Error("Failed to parse gold-standard response"); }

    // ── Step 3: Ingest into AI Learning Engine (parallel DB writes) ──
    checkWallClock("DB ingestion");
    const caseRef = `SYN-${Date.now().toString(36).toUpperCase()}`;

    const { data: benchmarkCase, error: bcErr } = await admin
      .from("benchmark_cases")
      .insert({
        title: `[SYNTHETIC] ${docs.property_address}`,
        property_address: docs.property_address,
        case_type: tenure.toLowerCase().includes("lease") ? "leasehold_purchase" : "freehold_purchase",
        transaction_type: txType,
        agent_type: agentType,
        status: "ready",
        source_type: "synthetic",
        notes: `[SYNTHETIC] Generated from scenarios: ${scenarios.map((s) => s.scenario_type).join(", ")}. Difficulty: ${difficulty}.`,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (bcErr) throw new Error(`Benchmark case insert failed: ${bcErr.message}`);

    // Parallel: benchmark_outputs + synthetic_generated_cases (both depend on benchmarkCase.id)
    const outputInserts = [
      ...docs.documents.map((doc) => ({
        benchmark_case_id: benchmarkCase.id,
        output_type: "ai" as const,
        label: doc.title,
        content: doc.content,
        uploaded_by: user.id,
      })),
      {
        benchmark_case_id: benchmarkCase.id,
        output_type: "human" as const,
        label: "Gold-Standard Expected Output",
        content: JSON.stringify(goldStandard, null, 2),
        uploaded_by: user.id,
      },
    ];

    const [outRes, sgcRes] = await Promise.all([
      admin.from("benchmark_outputs").insert(outputInserts),
      admin.from("synthetic_generated_cases").insert({
        job_id,
        benchmark_case_id: benchmarkCase.id,
        scenarios_used: scenarios.map((s) => s.scenario_type),
        gold_standard: goldStandard,
        current_step: "evaluating",
        generation_metadata: {
          doc_model: "google/gemini-2.5-flash",
          gold_model: "google/gemini-2.5-flash",
          difficulty, tenure,
          transaction_type: txType,
          generated_at: new Date().toISOString(),
        },
      } as any).select("id").single(),
    ]);
    if (outRes.error) throw new Error(`Benchmark outputs insert failed: ${outRes.error.message}`);
    if (sgcRes.error) throw new Error(`Synthetic case record failed: ${sgcRes.error.message}`);
    sgcId = (sgcRes.data as any)?.id ?? null;

    // ── Step 4: Auto-Evaluate (skip if wall clock is tight) ──
    let evaluationResult: any = null;
    const timeLeft = WALL_CLOCK_LIMIT_MS - (Date.now() - requestStartedAt);
    if (timeLeft < 30_000) {
      console.warn(`Skipping auto-evaluate — only ${Math.round(timeLeft / 1000)}s left`);
    } else {
    try {
      // 4a: Agent simulation
      checkWallClock("agent simulation");
      const agentRaw = await callAI(
        lovableKey, "",
        `You are a UK conveyancing AI agent analysing property transaction documents. Review ALL documents and identify every legal risk, compliance issue, missing item, and concern.

Documents to analyse:
${docs.documents.map((d) => `## ${d.title}\n${d.content}`).join("\n\n")}

Transaction: ${tenure} ${txType}

For EACH issue found, provide:
- issue_type: category of the issue
- severity: Critical, High, Medium, or Low
- evidence_source: which document and section
- evidence_text: exact quote supporting your finding
- conclusion: your professional conclusion
- recommended_action: what should be done

Return ONLY a JSON array. No markdown.`,
        "google/gemini-2.5-flash", 0.2,
      );
      const agentFindings = parseJSON(agentRaw);

      // 4b: Normalize (parallel + fast-path skip)
      let humanIssues: any[];
      let aiIssues: any[];

      const goldNorm = isNormalizedStructure(goldStandard);
      const agentNorm = isNormalizedStructure(agentFindings);

      if (goldNorm && agentNorm) {
        humanIssues = goldStandard;
        aiIssues = agentFindings;
      } else {
        const [hRaw, aRaw] = await Promise.all([
          goldNorm ? Promise.resolve("") : callAI(lovableKey, NORMALISE_SYSTEM,
            `Extract all issues from this GOLD-STANDARD output:\n\n${JSON.stringify(goldStandard)}`,
            "google/gemini-2.5-flash-lite"),
          agentNorm ? Promise.resolve("") : callAI(lovableKey, NORMALISE_SYSTEM,
            `Extract all issues from this AI-GENERATED output:\n\n${JSON.stringify(agentFindings)}`,
            "google/gemini-2.5-flash-lite"),
        ]);
        humanIssues = goldNorm ? goldStandard : parseJSON(hRaw);
        aiIssues = agentNorm ? agentFindings : parseJSON(aRaw);
      }

      // 4c: Compare
      const compareRaw = await callAI(lovableKey, COMPARE_SYSTEM,
        `Compare these findings from the SAME legal case.

GOLD-STANDARD FINDINGS (${humanIssues.length} issues):
${JSON.stringify(humanIssues)}

AI-GENERATED FINDINGS (${aiIssues.length} issues):
${JSON.stringify(aiIssues)}

Identify all matches, missed issues, false positives, extraction errors, severity mismatches, action errors, and citation failures.`);
      const comparisonItems = parseJSON(compareRaw);

      // 4d: Create comparison + insert items (sequential — items depend on comparison.id)
      const aiRunId = crypto.randomUUID();
      const { data: comparison, error: compErr } = await admin
        .from("benchmark_comparisons")
        .insert({
          benchmark_case_id: benchmarkCase.id,
          created_by: user.id,
          ai_run_id: aiRunId,
          status: "processing",
          judge_status: "pending",
        })
        .select("id")
        .single();
      if (compErr) throw compErr;

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
        const { data: inserted } = await admin.from("benchmark_comparison_items").insert(rows).select("id");
        insertedItemIds = (inserted || []).map((r: any) => r.id);
      }

      // Calculate stats
      const stats: Record<string, number> = {};
      for (const item of comparisonItems) {
        const dt = DIFFERENCE_TYPES.includes(item.difference_type) ? item.difference_type : "match";
        stats[dt] = (stats[dt] || 0) + 1;
      }

      const total = comparisonItems.length || 1;
      const matches = stats["match"] || 0;
      const missed = stats["ai_missed_material_issue"] || 0;
      const falsePos = stats["ai_false_positive"] || 0;
      const extractionErr = stats["data_extraction_error"] || 0;
      const actionErr = stats["action_recommendation_error"] || 0;
      const citationErr = stats["evidence_citation_failure"] || 0;
      const severityErr = stats["severity_classification_error"] || 0;

      const truePositives = matches;
      const recall = humanIssues.length > 0 ? truePositives / (truePositives + missed) : null;
      const precision = (truePositives + falsePos) > 0 ? truePositives / (truePositives + falsePos) : null;
      const extractionAccuracy = total > 0 ? (total - extractionErr) / total : null;
      const reasoningQuality = total > 0 ? (total - actionErr - severityErr) / total : null;
      const evidenceGrounding = total > 0 ? (total - citationErr) / total : null;

      // 4e: Judge layer
      let judgeStatus = "pending";
      let judgeSummary: any = null;

      const disputedItems = comparisonItems
        .map((item: any, i: number) => ({ ...item, _index: i, _dbId: insertedItemIds[i] }))
        .filter((item: any) => item.difference_type !== "match");

      if (disputedItems.length > 0) {
        await updateStep("judging");
        try {
          judgeStatus = "processing";
          const judgeRaw = await callAI(lovableKey, JUDGE_SYSTEM,
            `Judge these ${disputedItems.length} disputed comparison items between a gold-standard and an AI legal agent:\n\n${JSON.stringify(
              disputedItems.map((d: any, i: number) => ({
                item_index: i, difference_type: d.difference_type, issue_type: d.issue_type,
                document_source: d.document_source, human_finding: d.human_finding, ai_finding: d.ai_finding,
                human_severity: d.human_severity, ai_severity: d.ai_severity, evidence_text: d.evidence_text, notes: d.notes,
              }))
            )}\n\nFor each item, provide your independent judgment.`,
            "openai/gpt-5-mini",
          );
          const judgeResults = parseJSON(judgeRaw);

          if (judgeResults.length > 0) {
            const judgeRows = judgeResults.map((jr: any) => {
              const di = disputedItems[jr.item_index] || disputedItems[0];
              return {
                comparison_id: comparison.id,
                comparison_item_id: di._dbId,
                judge_model: "openai/gpt-5-mini",
                judge_verdict: jr.verdict || "inconclusive",
                ai_was_correct: jr.ai_was_correct ?? null,
                ground_truth_stronger: jr.ground_truth_stronger ?? null,
                partially_acceptable: jr.partially_acceptable ?? null,
                evidence_grounded: jr.evidence_grounded ?? null,
                judge_reasoning: jr.reasoning || "",
                confidence_score: jr.confidence ?? null,
              };
            }).filter((r: any) => r.comparison_item_id);

            if (judgeRows.length > 0) await admin.from("benchmark_judge_reviews").insert(judgeRows);

            judgeSummary = {
              total_judged: judgeResults.length,
              ai_correct: judgeResults.filter((r: any) => r.ai_was_correct).length,
              human_correct: judgeResults.filter((r: any) => r.ground_truth_stronger).length,
              partially_acceptable: judgeResults.filter((r: any) => r.partially_acceptable).length,
              evidence_grounded: judgeResults.filter((r: any) => r.evidence_grounded).length,
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
      } else {
        judgeStatus = "no_disputes";
      }

      // Parallel: prompt version lookup + comparison update + step update
      const [pvRes] = await Promise.all([
        admin.from("prompt_versions").select("version")
          .eq("agent_id", agentType).eq("status", "deployed")
          .order("version", { ascending: false }).limit(1).maybeSingle(),
        admin.from("benchmark_comparisons").update({
          status: "complete",
          completed_at: new Date().toISOString(),
          summary_stats: { ...stats, total: comparisonItems.length, human_issues: humanIssues.length, ai_issues: aiIssues.length },
          recall_score: recall !== null ? Math.round(recall * 100) / 100 : null,
          precision_score: precision !== null ? Math.round(precision * 100) / 100 : null,
          extraction_accuracy: extractionAccuracy !== null ? Math.round(extractionAccuracy * 100) / 100 : null,
          reasoning_quality: reasoningQuality !== null ? Math.round(reasoningQuality * 100) / 100 : null,
          evidence_grounding: evidenceGrounding !== null ? Math.round(evidenceGrounding * 100) / 100 : null,
          judge_status: judgeStatus,
          judge_summary: judgeSummary,
        }).eq("id", comparison.id),
        updateStep("complete"),
      ]);

      // Update prompt_version separately (needs pvRes result)
      if (pvRes.data) {
        await admin.from("benchmark_comparisons").update({
          prompt_version: `v${(pvRes.data as any).version}`,
        }).eq("id", comparison.id);
      }

      evaluationResult = {
        comparison_id: comparison.id,
        recall: recall !== null ? Math.round(recall * 100) : null,
        precision: precision !== null ? Math.round(precision * 100) : null,
        total_items: comparisonItems.length,
        matches, missed, false_positives: falsePos,
        judge_status: judgeStatus, judge_summary: judgeSummary,
      };
    } catch (evalErr: any) {
      console.error("Auto-evaluation error (non-fatal):", evalErr);
      evaluationResult = { error: evalErr.message };
      await updateStep("eval_failed");
    }
    } // end of else (wall-clock check)

    // Parallel: job progress update + audit log (independent operations)
    const jobUpdatePromise = admin
      .from("synthetic_generation_jobs")
      .select("completed_cases, total_cases")
      .eq("id", job_id)
      .single()
      .then(async ({ data: job }) => {
        if (!job) return;
        const newCompleted = (job.completed_cases ?? 0) + 1;
        const updates: Record<string, any> = { completed_cases: newCompleted };
        if (newCompleted >= job.total_cases) {
          updates.status = "completed";
          updates.completed_at = new Date().toISOString();
        }
        await admin.from("synthetic_generation_jobs").update(updates).eq("id", job_id);
      });

    const auditPromise = profile
      ? admin.from("audit_log").insert({
          user_id: user.id,
          user_name: profile.full_name,
          user_email: profile.email,
          user_position: profile.position || "",
          event_type: "synthetic_case_generated",
          case_reference: caseRef,
          metadata: {
            job_id,
            benchmark_case_id: benchmarkCase.id,
            scenarios_used: scenarios.map((s) => s.scenario_type),
            difficulty,
            evaluation: evaluationResult,
          },
        })
      : Promise.resolve();

    await Promise.all([jobUpdatePromise, auditPromise]);

    return new Response(
      JSON.stringify({
        success: true,
        benchmark_case_id: benchmarkCase.id,
        case_reference: caseRef,
        gold_standard_count: goldStandard.length,
        documents_count: docs.documents.length,
        evaluation: evaluationResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("generate-synthetic-case error:", err);

    try {
      if (requestBody?.job_id) {
        const adminFallback = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: job } = await adminFallback
          .from("synthetic_generation_jobs")
          .select("failed_cases, completed_cases, total_cases, error_log")
          .eq("id", requestBody.job_id)
          .single();
        if (job) {
          const newFailed = ((job as any).failed_cases ?? 0) + 1;
          const completed = (job as any).completed_cases ?? 0;
          const total = (job as any).total_cases ?? 0;
          const updates: Record<string, any> = {
            failed_cases: newFailed,
            error_log: (((job as any).error_log ?? "") + `\n${err.message}`).trim(),
          };
          // Finalize the job if all cases are now accounted for
          if (completed + newFailed >= total) {
            updates.status = completed > 0 ? "completed" : "failed";
            updates.completed_at = new Date().toISOString();
          }
          await adminFallback.from("synthetic_generation_jobs").update(updates).eq("id", requestBody.job_id);
        }
      }
    } catch { /* best-effort */ }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

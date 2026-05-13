import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getDeployedPrompt } from "../_shared/deployedPrompt.ts";
import { buildSoWQuery, type CaseSignal } from "./queryBuilder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RUNTIME_SOW_OUTPUT_OVERRIDES = `

## RUNTIME OUTPUT SAFETY OVERRIDES (NON-NEGOTIABLE)
1) **Co-purchaser vs gift classification**: If a funding provider is a named purchaser/co-purchaser/party to the transaction, their funds are NOT a third-party gift by default. Do NOT label this as "false declaration" for gifts, do NOT apply LSAG Giftor Proportionality to co-purchaser funding, and do NOT call it an undeclared gift. Frame as co-purchaser contribution / inter-buyer funding / pooled funds and request route/allocation clarification where needed.
2) **Live-to-zero caution**: Low retained balances in a salary account do NOT by themselves disprove savings. Before any adverse savings conclusion, classify outgoing debits/transfers and determine whether they are spending vs movements to savings/joint/owned accounts. If destinations are incomplete or mixed, use "partially evidenced / not fully established / requires reconciliation" wording, not fabricated/deceptive/disproved wording.
3) These constraints apply across internal report, checklist, decision log, summary, and draft client email.
`;

function appendRuntimeSowOverrides(prompt: string): string {
  if (prompt.includes("RUNTIME OUTPUT SAFETY OVERRIDES")) return prompt;
  return `${prompt}\n${RUNTIME_SOW_OUTPUT_OVERRIDES}`;
}

serve(async (req) => {
  const reqStartMs = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Auth check ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // ── Resolve all shared context in parallel ────────────────────
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { caseId, tenure, lender, sufficiencyResult, sufficiencyAcknowledgement } = body;

    const [promptResult, profileResult, kbResult, armalytixResult] = await Promise.all([
      // 1. Deployed prompt
      getDeployedPrompt("source-of-wealth").catch((err) => {
        console.error("[resolve-sow-context] Prompt fetch failed:", err);
        return null;
      }),

      // 2. User profile
      supabaseAdmin
        .from("profiles")
        .select("full_name, firm_name")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => data)
        .catch(() => null),

      // 3. Knowledge Base RAG context (simplified — returns top chunks)
      resolveKnowledgeContext(supabaseAdmin, caseId, tenure, lender),

      // 4. Armalytix data existence check
      caseId
        ? supabaseAdmin
            .from("armalytix_reports")
            .select("id")
            .eq("case_id", caseId)
            .limit(1)
            .then(({ data }) => (data?.length ?? 0) > 0)
            .catch(() => false)
        : Promise.resolve(false),
    ]);

    if (!promptResult) {
      return new Response(
        JSON.stringify({ error: "Could not resolve system prompt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fullPrompt = appendRuntimeSowOverrides(promptResult);

    // ── Build context injection ────────────────────────────────────
    const todayDateStr = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const preparedByName = profileResult?.full_name || "";
    const firmName = profileResult?.firm_name || "";

    // ── Arithmetic context block (Wave 15.1) ─────────────────────────
    // If a SufficiencyResult is supplied (from the pre-sow-checks gate), inject
    // it as an established fact so the AI does not need to recalculate it.
    let arithmeticContextBlock = "";
    if (sufficiencyResult && typeof sufficiencyResult.status === "string") {
      const formatGBP = (pence: number) =>
        new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

      if (sufficiencyResult.status === "sufficient") {
        arithmeticContextBlock = `\n\n[ARITHMETIC CONTEXT — ESTABLISHED FACT]\nFunding sufficiency check: PASSED. Declared funds (${formatGBP(sufficiencyResult.declared_total)}) cover the total buyer-funded requirement (${formatGBP(sufficiencyResult.funds_required)}). Do not caveat the arithmetic in your report.\n`;
      } else if (sufficiencyResult.status === "shortfall") {
        const rationale = sufficiencyAcknowledgement?.rationale
          ? `Solicitor's rationale: "${sufficiencyAcknowledgement.rationale}"`
          : "No rationale provided.";
        arithmeticContextBlock = `\n\n[ARITHMETIC CONTEXT — ESTABLISHED FACT — MANDATORY DISCLOSURE]\nFunding sufficiency check: SHORTFALL DETECTED.\n- Total buyer-funded requirement: ${formatGBP(sufficiencyResult.funds_required)}\n- Total declared funds: ${formatGBP(sufficiencyResult.declared_total)}\n- Shortfall: ${formatGBP(sufficiencyResult.shortfall)}\nThe solicitor acknowledged this shortfall and elected to proceed. ${rationale}\nYou MUST flag this shortfall explicitly in your report under the Funding Analysis section. Do not omit, minimise, or recharacterise it. Treat the figures above as correct — do not recalculate.\n`;
      } else if (sufficiencyResult.status === "overstatement") {
        arithmeticContextBlock = `\n\n[ARITHMETIC CONTEXT — ESTABLISHED FACT]\nFunding sufficiency check: OVERSTATEMENT DETECTED.\n- Total buyer-funded requirement: ${formatGBP(sufficiencyResult.funds_required)}\n- Total declared funds: ${formatGBP(sufficiencyResult.declared_total)}\n- Surplus: ${formatGBP(sufficiencyResult.overstatement)}\nDeclared funds exceed the requirement by ${formatGBP(sufficiencyResult.overstatement)}. Investigate and account for the surplus in your analysis. If unexplained, treat the surplus as a risk indicator.\n`;
      }
    }

    const contextInjection = `\n\nIMPORTANT: Today's date is ${todayDateStr}. Use this as the Report Date and as the reference date for all recency gap calculations.${preparedByName ? `\nThe report is being prepared by: ${preparedByName}. Use this as the "Prepared By" value in the report header.` : ""}${firmName ? `\nThe firm name is: ${firmName}. Use this as the "Firm" value in the report header.` : ""}${arithmeticContextBlock}\n`;

    const elapsedMs = Date.now() - reqStartMs;
    console.log(`[resolve-sow-context] Done | elapsed=${elapsedMs}ms | prompt=${fullPrompt.length} chars | kb=${kbResult.length} chars | armalytix=${armalytixResult}`);

    return new Response(
      JSON.stringify({
        fullPrompt,
        contextInjection,
        knowledgeContext: kbResult,
        profileName: preparedByName,
        firmName,
        hasArmalytixData: armalytixResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[resolve-sow-context] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Knowledge Base RAG resolution ────────────────────────────────────────

async function gatherCaseSignal(
  supabaseAdmin: ReturnType<typeof createClient>,
  caseId?: string,
): Promise<CaseSignal> {
  if (!caseId) return {};

  // All three reads in parallel; all are best-effort (errors → empty signal).
  const [caseRow, partyRows, fundSourceRows] = await Promise.all([
    supabaseAdmin
      .from("cases")
      .select("gifts_involved, mortgage_required, ai_context_notes")
      .eq("id", caseId)
      .maybeSingle()
      .then(({ data }) => data)
      .catch(() => null),
    supabaseAdmin
      .from("case_parties")
      .select("role, pep_status, contribution_amount, on_mortgage, relationship_to_purchaser, buyer_type")
      .eq("case_id", caseId)
      .then(({ data }) => data ?? [])
      .catch(() => []),
    supabaseAdmin
      .from("sow_fund_sources")
      .select("source_category, source_sub_category, declared_description")
      .eq("case_id", caseId)
      .then(({ data }) => data ?? [])
      .catch(() => []),
  ]);

  const purchaserParties = (partyRows as any[]).filter(
    (p) => (p.role ?? "").toLowerCase() === "purchaser",
  );
  const nonPurchaserContributors = (partyRows as any[]).filter(
    (p) => (p.role ?? "").toLowerCase() !== "purchaser"
      && (p.role ?? "").toLowerCase() !== "seller"
      && Number(p.contribution_amount ?? 0) > 0,
  );

  // Co-purchaser with separate funding: a purchaser explicitly off-mortgage
  // OR multiple purchasers with distinct contribution_amount values.
  const coPurchaserSeparateFunds =
    purchaserParties.some((p) => p.on_mortgage === false)
    || (purchaserParties.length >= 2
      && new Set(purchaserParties.map((p) => Number(p.contribution_amount ?? 0))).size > 1
      && purchaserParties.some((p) => Number(p.contribution_amount ?? 0) > 0));

  const pepFlagged = (partyRows as any[]).some(
    (p) => typeof p.pep_status === "string"
      && /pep|politically.exposed|exposed/i.test(p.pep_status)
      && !/^unknown$|^none$|^no$/i.test(p.pep_status),
  );

  // Beneficial-owner detection: any purchaser of a non-standard buyer_type
  // (e.g. corporate, trust) implies beneficial-owner analysis is required.
  const beneficialOwnerPresent = purchaserParties.some(
    (p) => typeof p.buyer_type === "string"
      && p.buyer_type.length > 0
      && !/^standard$|^individual$/i.test(p.buyer_type),
  );

  // Deposit components: prefer explicit sow_fund_sources rows when present;
  // fall back to coarse boolean signals from `cases`.
  const depositComponents: string[] = [];
  for (const row of fundSourceRows as any[]) {
    if (row.source_category) depositComponents.push(row.source_category);
    if (row.source_sub_category) depositComponents.push(row.source_sub_category);
  }
  if (depositComponents.length === 0) {
    if ((caseRow as any)?.gifts_involved === true) depositComponents.push("gift");
    if ((caseRow as any)?.mortgage_required === true) {
      // Mortgage doesn't itself signal a deposit component; do not push.
    }
  }

  // Funding narrative: prefer aggregated declared_description text; fall
  // back to the SoW slice of ai_context_notes if no structured rows exist.
  let fundingNarrative: string | null = null;
  const declaredDescriptions = (fundSourceRows as any[])
    .map((r) => (typeof r.declared_description === "string" ? r.declared_description.trim() : ""))
    .filter(Boolean);
  if (declaredDescriptions.length > 0) {
    fundingNarrative = declaredDescriptions.join(" ");
  } else {
    const ctxNotes = (caseRow as any)?.ai_context_notes;
    if (ctxNotes && typeof ctxNotes === "object") {
      const sowNote = ctxNotes["source-of-wealth"];
      if (typeof sowNote === "string" && sowNote.length > 0) {
        fundingNarrative = sowNote;
      }
    }
  }

  return {
    fundingNarrative,
    depositComponents,
    purchaserCount: purchaserParties.length,
    coPurchaserSeparateFunds,
    thirdPartyFunderPresent: nonPurchaserContributors.length > 0,
    pepFlagged,
    beneficialOwnerPresent,
  };
}

async function resolveKnowledgeContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  caseId?: string,
  tenure?: string,
  lender?: string,
): Promise<string> {
  try {
    // Get agent-specific knowledge bases.
    // Note: this table has columns (id, label, description, agent_ids, created_at).
    // There is no `is_active` column and no `name` column; the canonical display
    // field is `label`. Filtering is by `agent_ids` containment alone.
    const { data: kbLinks } = await supabaseAdmin
      .from("knowledge_bases")
      .select("id, label")
      .contains("agent_ids", ["source-of-wealth"]);

    if (!kbLinks || kbLinks.length === 0) return "";

    const kbIds = kbLinks.map((kb: any) => kb.id);

    // Build a case-aware query from the case record. Falls back cleanly to
    // the static suffix alone for empty cases (degraded_to_static=true).
    const signal = await gatherCaseSignal(supabaseAdmin, caseId);
    const built = buildSoWQuery(signal);
    const searchQuery = built.query;
    const matchCount = 8;
    const perDocumentCap = 2;

    // Search with per-document cap to prevent any single document from
    // dominating the top results (the documented AML-saturation failure).
    // Tenure filter is intentionally not applied here — firm policies do
    // not differentiate by tenure type. Lender involvement is handled
    // upstream in policy selection and is not a retrieval signal.
    const ragStartTime = Date.now();
    const { data: chunks } = await supabaseAdmin.rpc("search_knowledge_chunks_keyword", {
      search_query: searchQuery,
      match_agent_id: "source-of-wealth",
      match_count: matchCount,
      match_knowledge_base_ids: kbIds,
      match_tenure_type: null,
      per_document_cap: perDocumentCap,
    });
    const ragLatencyMs = Date.now() - ragStartTime;

    // Audit log: mirror agent-chat's retrieval_logs shape. Non-blocking.
    // Note: retrieval_logs.retrieval_tier is an integer column; the human-readable
    // tier label 'sow_orchestrator_keyword' is recorded in metadata.tier_label so
    // the SoW orchestrator path is distinguishable from agent-chat (1, 4) and
    // search-knowledge tiers without altering the schema.
    try {
      const resultChunks = chunks || [];
      await supabaseAdmin.from("retrieval_logs").insert({
        agent_id: "source-of-wealth",
        case_id: caseId || null,
        query_text: searchQuery.slice(0, 500),
        knowledge_bases_queried: kbIds,
        documents_retrieved: resultChunks.map((c: any, i: number) => ({
          chunk_id: c.chunk_id,
          document_id: c.chunk_document_id,
          title: c.document_title,
          category: c.document_category,
          similarity: c.similarity,
          knowledge_base_id: c.knowledge_base_id,
          rank: i + 1,
        })),
        retrieval_tier: 5,
        fallback_used: false,
        total_chunks_scanned: resultChunks.length,
        top_similarity: resultChunks[0]?.similarity ?? null,
        latency_ms: ragLatencyMs,
        metadata: {
          source: "resolve-sow-context",
          tier_label: "sow_orchestrator_keyword",
          tenure: tenure || null,
          lender: lender || null,
          match_count: matchCount,
          per_document_cap: perDocumentCap,
          result_count: resultChunks.length,
          query_builder: {
            degraded_to_static: built.diagnostics.degraded_to_static,
            narrative_used: built.diagnostics.narrative_used,
            narrative_chars: built.diagnostics.narrative_chars,
            deposit_components_recognised: built.diagnostics.deposit_components_recognised,
            deposit_components_unrecognised: built.diagnostics.deposit_components_unrecognised,
            party_types: built.diagnostics.party_types,
          },
          // Top-level mirror so existing analytics filters can find it.
          degraded_to_static: built.diagnostics.degraded_to_static,
        },
      });
    } catch (logErr) {
      console.warn(
        `[resolve-sow-context] retrieval_logs insert failed (non-fatal) | case_id=${caseId || "null"} | err=${logErr instanceof Error ? logErr.message : String(logErr)}`,
      );
    }

    if (!chunks || chunks.length === 0) return "";

    return (
      "\n\n## KNOWLEDGE BASE CONTEXT\n\nThe following reference material from the firm's knowledge base is relevant to this assessment. You MUST consult this guidance when determining which enquiries to raise and which to omit. Firm-specific policies on materiality thresholds, acceptable evidence, and enquiry scope override generic caution. Apply the proportionality principle accordingly.\n\nWhen your analysis relies on a proposition from these documents, EXPLICITLY NAME the governing authority in the report (e.g. 'Per LSAG AML Guidance 2025…', 'Per the firm's AML Policy…'). Priority: (1) firm-specific policies, (2) primary regulatory guidance, (3) supervisory/inspection guidance, (4) general external guidance. Target 8–15 explicit citations across the full report for major propositions only.\n\n" +
      chunks
        .map(
          (c: any, i: number) =>
            `### Reference ${i + 1}: ${c.document_title} (${c.document_category})\n${c.chunk_content}`,
        )
        .join("\n\n")
    );
  } catch (err) {
    console.error("[resolve-sow-context] KB retrieval error (non-fatal):", err);
    return "";
  }
}

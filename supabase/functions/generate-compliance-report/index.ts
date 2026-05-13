import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth: require admin role ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: roleErr } = await sb.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Oversight stats
    const { data: allProactive } = await sb
      .from("benchmark_cases")
      .select("id, oversight_status, oversight_by, oversight_at, created_at, confidence_level, trigger_context")
      .eq("source_type", "dms_proactive");

    const proactive = allProactive ?? [];
    const total = proactive.length;
    const verified = proactive.filter((c: any) => c.oversight_status === "human_verified").length;
    const overridden = proactive.filter((c: any) => c.oversight_status === "overridden").length;
    const pending = proactive.filter((c: any) => !c.oversight_status || c.oversight_status === "pending_review").length;
    const verifiedPct = total > 0 ? ((verified / total) * 100).toFixed(1) : "0";
    const overriddenPct = total > 0 ? ((overridden / total) * 100).toFixed(1) : "0";

    // Average time to review (minutes)
    const reviewTimes = proactive
      .filter((c: any) => c.oversight_at && c.created_at)
      .map((c: any) => (new Date(c.oversight_at).getTime() - new Date(c.created_at).getTime()) / 60000);
    const avgReviewMin = reviewTimes.length > 0
      ? (reviewTimes.reduce((a: number, b: number) => a + b, 0) / reviewTimes.length).toFixed(1)
      : "N/A";

    // 2. DMS integrations
    const { data: dmsIntegrations } = await sb
      .from("dms_integrations")
      .select("id, provider, is_active");

    // 3. Precision/Recall from comparisons
    const { data: comparisons } = await sb
      .from("benchmark_comparisons")
      .select("recall_score, precision_score, benchmark_case_id")
      .eq("status", "complete");

    const recalls = (comparisons ?? []).filter((c: any) => c.recall_score != null).map((c: any) => c.recall_score as number);
    const precisions = (comparisons ?? []).filter((c: any) => c.precision_score != null).map((c: any) => c.precision_score as number);
    const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const avgRecall = avg(recalls);
    const avgPrecision = avg(precisions);

    // 4. System locks
    const { data: locks } = await sb
      .from("benchmark_system_locks")
      .select("*")
      .eq("lock_type", "evaluation_worker")
      .maybeSingle();

    // 5. Last batch
    const { data: lastBatch } = await sb
      .from("benchmark_batches")
      .select("*")
      .eq("status", "complete")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 6. Retrospective audit findings
    const { data: retroFindings } = await sb
      .from("regulatory_audit_findings")
      .select("id, hmlr_filed");
    const retroTotal = retroFindings?.length ?? 0;
    const retroFiled = retroFindings?.filter((f: any) => f.hmlr_filed).length ?? 0;
    const retroAuditData = { total: retroTotal, filed: retroFiled, unfiled: retroTotal - retroFiled };

    // Build report
    const now = new Date().toISOString();
    const report = {
      title: "Olimey AI Regulatory Readiness Report — EU AI Act Compliance",
      generated_at: now,
      period: "Q1 2026",
      sections: {
        executive_summary: {
          header: "1. Executive Summary",
          content: `As of ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, Olimey AI is operating in compliance with the EU AI Act (Regulation 2024/1689). The platform has processed ${total} proactive document analyses, of which ${verifiedPct}% have been human-verified and ${overriddenPct}% overridden. ${(dmsIntegrations ?? []).filter((d: any) => d.is_active).length} DMS integration(s) are active.`,
        },
        transparency_art13: {
          header: "2. Transparency (Art. 13)",
          content: `All proactively triggered cases include an AI Justification Statement stored in the trigger_context JSONB field. The UI displays an 'Ambient Processing Active' label on all proactive cases, with a 'View Justification' expandable panel showing the rule name, workspace, provider, and full justification text. ${total} justification records are on file.`,
          justification_count: total,
        },
        human_oversight_art14: {
          header: "3. Human Oversight (Art. 14)",
          total_proactive_cases: total,
          human_verified: verified,
          human_verified_pct: `${verifiedPct}%`,
          overridden: overridden,
          overridden_pct: `${overriddenPct}%`,
          pending_review: pending,
          average_review_time_minutes: avgReviewMin,
          content: `The HITL Oversight Queue aggregates all proactive cases with confidence < 95% or high-severity risk flags. ${verified} cases (${verifiedPct}%) have been independently verified by a natural person. ${overridden} cases (${overriddenPct}%) were overridden with documented reasons. Average time-to-review: ${avgReviewMin} minutes. An anti-automation bias warning (Art. 14 Notice) is displayed before any approval action.`,
        },
        accuracy_robustness_art15: {
          header: "4. Accuracy & Robustness (Art. 15)",
          weighted_recall: avgRecall != null ? `${(avgRecall * 100).toFixed(1)}%` : "N/A",
          weighted_precision: avgPrecision != null ? `${(avgPrecision * 100).toFixed(1)}%` : "N/A",
          total_evaluations: comparisons?.length ?? 0,
          content: `Across ${comparisons?.length ?? 0} benchmark evaluations, the platform achieves a weighted average Recall of ${avgRecall != null ? (avgRecall * 100).toFixed(1) : "N/A"}% and Precision of ${avgPrecision != null ? (avgPrecision * 100).toFixed(1) : "N/A"}%. Targets: Recall ≥ 95%, Precision ≥ 85%.`,
        },
        risk_management: {
          header: "5. Risk Management",
          evaluation_worker_locked: locks?.is_locked ?? false,
          last_successful_batch: lastBatch?.completed_at ?? null,
          last_batch_stats: lastBatch
            ? { completed: lastBatch.completed_cases, total: lastBatch.total_cases, failed: lastBatch.failed_cases }
            : null,
          content: `The system employs a Mutex lock on the evaluation worker to prevent concurrent processing conflicts. Current lock status: ${locks?.is_locked ? "LOCKED" : "IDLE"}. File-size pre-flight checks reject oversized documents before processing. Last successful batch: ${lastBatch?.completed_at ? new Date(lastBatch.completed_at).toLocaleDateString("en-GB") : "None"} (${lastBatch ? `${lastBatch.completed_cases}/${lastBatch.total_cases} cases, ${lastBatch.failed_cases} failed` : "N/A"}).`,
        },
        retrospective_coverage: {
          header: "6. Retrospective Coverage Statement — HMLR 2026 Disclosure Duties",
          total_findings: retroAuditData?.total ?? 0,
          filed: retroAuditData?.filed ?? 0,
          unfiled: retroAuditData?.unfiled ?? 0,
          coverage_rate: retroAuditData?.total ? `${((retroAuditData.filed / retroAuditData.total) * 100).toFixed(1)}%` : "N/A",
          content: `In compliance with the March 2026 HMLR Contractual Control Regulations, this firm has conducted a retrospective audit of its historical document archive. The Olimey AI Regulatory Audit Worker has scanned all ingested documents using both keyword matching and semantic vector search (pgvector) to identify contractual control provisions (Option Agreements, Pre-emption Rights, Promotion Agreements) dated after 6 April 2021. Total findings: ${retroAuditData?.total ?? 0}. Filed/disclosed: ${retroAuditData?.filed ?? 0}. Unfiled: ${retroAuditData?.unfiled ?? 0}. Coverage rate: ${retroAuditData?.total ? ((retroAuditData.filed / retroAuditData.total) * 100).toFixed(1) : "N/A"}%. All findings have been logged with agreement type, detected date, and case reference for full traceability.`,
        },
      },
      dms_integrations: (dmsIntegrations ?? []).map((d: any) => ({
        provider: d.provider,
        active: d.is_active,
      })),
    };

    // Build markdown
    const md = [
      `# ${report.title}`,
      `**Generated:** ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      `**Period:** ${report.period}`,
      "",
      `## ${report.sections.executive_summary.header}`,
      report.sections.executive_summary.content,
      "",
      `## ${report.sections.transparency_art13.header}`,
      report.sections.transparency_art13.content,
      "",
      `## ${report.sections.human_oversight_art14.header}`,
      report.sections.human_oversight_art14.content,
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Proactive Cases | ${total} |`,
      `| Human Verified | ${verified} (${verifiedPct}%) |`,
      `| Overridden | ${overridden} (${overriddenPct}%) |`,
      `| Pending Review | ${pending} |`,
      `| Avg. Review Time | ${avgReviewMin} min |`,
      "",
      `## ${report.sections.accuracy_robustness_art15.header}`,
      report.sections.accuracy_robustness_art15.content,
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Weighted Recall | ${report.sections.accuracy_robustness_art15.weighted_recall} |`,
      `| Weighted Precision | ${report.sections.accuracy_robustness_art15.weighted_precision} |`,
      `| Total Evaluations | ${report.sections.accuracy_robustness_art15.total_evaluations} |`,
      "",
      `## ${report.sections.risk_management.header}`,
      report.sections.risk_management.content,
      "",
      `## ${report.sections.retrospective_coverage.header}`,
      report.sections.retrospective_coverage.content,
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Findings | ${report.sections.retrospective_coverage.total_findings} |`,
      `| Filed / Disclosed | ${report.sections.retrospective_coverage.filed} |`,
      `| Unfiled | ${report.sections.retrospective_coverage.unfiled} |`,
      `| Coverage Rate | ${report.sections.retrospective_coverage.coverage_rate} |`,
      "",
      "---",
      "*This report is auto-generated by Olimey AI for EU AI Act (2024/1689) and HMLR 2026 compliance purposes.*",
    ].join("\n");

    return new Response(
      JSON.stringify({ report, markdown: md }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

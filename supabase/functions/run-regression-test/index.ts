import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CASE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per benchmark comparison call
const STALE_PROGRESS_MS = 15 * 60 * 1000; // consider run stalled if no progress for 15 minutes
const CHUNK_SIZE = 3; // Process 3 cases per invocation then self-invoke for next chunk

function agentLabel(agentType: string): string {
  return agentType === "source-of-wealth" ? "Olimey AI" : agentType;
}

function buildFailureSummary(totalCases: number, completedCases: number, error: string) {
  return {
    total_cases: totalCases,
    completed: completedCases,
    failed: Math.max(0, totalCases - completedCases),
    error,
    last_progress_at: new Date().toISOString(),
  };
}

async function notifyRegressionFailure(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  agentType: string,
  errorMessage: string,
) {
  const { data: adminRoles } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
  const adminIds = (adminRoles || []).map((r: any) => r.user_id);

  if (adminIds.length === 0) return;

  const title = `Regression Test Failed — ${agentLabel(agentType)}`;
  const message = `Run stopped: ${errorMessage}`;

  await supabase.from("admin_notifications").insert(
    adminIds.map((uid: string) => ({
      user_id: uid,
      title,
      message,
      event_type: "regression_test_failed",
      metadata: {
        run_id: runId,
        agent_type: agentType,
        error: errorMessage,
      },
    })),
  );
}

/** Process a single chunk of regression cases, then self-invoke for the next chunk */
async function processRegressionChunk(
  runId: string,
  caseIdsToProcess: string[],
  allCaseIds: string[],
  agentType: string,
  token: string,
  userId: string,
  userEmail: string,
) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let chunkCompleted = 0;
  let chunkFailed = 0;

  try {
    for (const caseId of caseIdsToProcess) {
      try {
        // Find the most recent prior comparison for this case
        const { data: priorComp } = await supabase.from("benchmark_comparisons")
          .select("id, recall_score, precision_score")
          .eq("benchmark_case_id", caseId)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const priorRecall = priorComp?.recall_score != null ? Number(priorComp.recall_score) : null;
        const priorPrecision = priorComp?.precision_score != null ? Number(priorComp.precision_score) : null;

        // Run a new comparison (skip judge for speed in regression)
        const compareController = new AbortController();
        const compareTimeout = setTimeout(() => compareController.abort(), CASE_TIMEOUT_MS);

        let compareResp: Response;
        try {
          compareResp = await fetch(`${SUPABASE_URL}/functions/v1/benchmark-compare`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ benchmark_case_id: caseId, skip_judge: true }),
            signal: compareController.signal,
          });
        } catch (fetchErr: any) {
          if (fetchErr?.name === "AbortError") {
            throw new Error(`benchmark-compare timed out after ${Math.round(CASE_TIMEOUT_MS / 1000)}s`);
          }
          throw fetchErr;
        } finally {
          clearTimeout(compareTimeout);
        }

        let proposedRecall: number | null = null;
        let proposedPrecision: number | null = null;
        let proposedCompId: string | null = null;

        if (compareResp.ok) {
          const compareResult = await compareResp.json();
          proposedCompId = compareResult.comparison_id;

          if (proposedCompId) {
            const { data: newComp } = await supabase.from("benchmark_comparisons")
              .select("recall_score, precision_score")
              .eq("id", proposedCompId)
              .single();
            proposedRecall = newComp?.recall_score != null ? Number(newComp.recall_score) : null;
            proposedPrecision = newComp?.precision_score != null ? Number(newComp.precision_score) : null;
          }
        } else {
          const errorBody = await compareResp.text();
          throw new Error(`benchmark-compare failed (${compareResp.status}): ${errorBody.slice(0, 240)}`);
        }

        const recallDelta = (priorRecall != null && proposedRecall != null) ? proposedRecall - priorRecall : null;
        const precisionDelta = (priorPrecision != null && proposedPrecision != null) ? proposedPrecision - priorPrecision : null;
        const regressionDetected = (recallDelta != null && recallDelta < -0.05) || (precisionDelta != null && precisionDelta < -0.05);
        const improvementDetected = (recallDelta != null && recallDelta > 0.05) || (precisionDelta != null && precisionDelta > 0.05);

        const result = {
          run_id: runId,
          benchmark_case_id: caseId,
          prior_comparison_id: priorComp?.id || null,
          proposed_comparison_id: proposedCompId,
          prior_recall: priorRecall,
          prior_precision: priorPrecision,
          proposed_recall: proposedRecall,
          proposed_precision: proposedPrecision,
          recall_delta: recallDelta != null ? Math.round(recallDelta * 100) / 100 : null,
          precision_delta: precisionDelta != null ? Math.round(precisionDelta * 100) / 100 : null,
          regression_detected: regressionDetected,
          improvement_detected: improvementDetected,
        };

        await supabase.from("regression_test_results").insert(result);
      } catch (err: any) {
        console.error(`Regression case ${caseId} error:`, err);
        chunkFailed++;
      } finally {
        chunkCompleted++;
      }
    }

    // Update progress after this chunk
    const { data: currentRun } = await supabase.from("regression_test_runs")
      .select("completed_cases, summary, status")
      .eq("id", runId)
      .single();

    // If run was externally cancelled/failed, stop
    if (currentRun?.status !== "running") {
      console.log(`Run ${runId} is no longer running (status: ${currentRun?.status}), stopping.`);
      return;
    }

    const prevCompleted = Number(currentRun?.completed_cases || 0);
    const prevFailed = Number((currentRun?.summary as any)?.failed || 0);
    const newCompleted = prevCompleted + chunkCompleted;
    const newFailed = prevFailed + chunkFailed;

    await supabase.from("regression_test_runs").update({
      completed_cases: newCompleted,
      summary: {
        total_cases: allCaseIds.length,
        completed: newCompleted,
        failed: newFailed,
        last_progress_at: new Date().toISOString(),
      },
    }).eq("id", runId);

    // Determine remaining cases
    const processedSet = new Set(caseIdsToProcess);
    const { data: completedResults } = await supabase.from("regression_test_results")
      .select("benchmark_case_id")
      .eq("run_id", runId);
    const doneSet = new Set((completedResults || []).map((r: any) => r.benchmark_case_id));

    // Also count failures (cases attempted but errored)
    const attemptedInThisChunk = new Set(caseIdsToProcess);
    const remainingCaseIds = allCaseIds.filter((id) => !doneSet.has(id) && !attemptedInThisChunk.has(id));

    // Add back cases from this chunk that were neither completed nor resulted (edge case)
    const trueRemaining = allCaseIds.filter((id) => {
      // Already has a result row
      if (doneSet.has(id)) return false;
      // Was in this chunk (attempted, whether success or fail)
      if (attemptedInThisChunk.has(id)) return false;
      return true;
    });

    if (trueRemaining.length > 0) {
      // Self-invoke to continue with next chunk
      console.log(`Continuing regression run ${runId}: ${trueRemaining.length} cases remaining, invoking next chunk...`);
      const nextChunk = trueRemaining.slice(0, CHUNK_SIZE);

      try {
        const continueResp = await fetch(`${SUPABASE_URL}/functions/v1/run-regression-test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            _continue: true,
            run_id: runId,
            agent_type: agentType,
            chunk_case_ids: nextChunk,
            all_case_ids: allCaseIds,
            user_id: userId,
            user_email: userEmail,
          }),
        });
        // Consume the response body to prevent resource leaks
        await continueResp.text();
      } catch (continueErr: any) {
        console.error("Self-invoke continuation failed:", continueErr);
        // Mark run as failed since we can't continue
        const failMsg = `Continuation failed: ${continueErr?.message || "Unknown error"}`;
        await supabase.from("regression_test_runs").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          summary: buildFailureSummary(allCaseIds.length, newCompleted, failMsg),
        }).eq("id", runId);
        await notifyRegressionFailure(supabase, runId, agentType, failMsg);
      }
    } else {
      // All cases done — finalize
      await finalizeRegressionRun(supabase, runId, allCaseIds, agentType, token, userId, userEmail);
    }
  } catch (fatalErr: any) {
    const fatalMessage = fatalErr?.message || "Unexpected regression worker crash";
    console.error("Regression chunk crashed:", fatalErr);

    const { data: currentRun } = await supabase.from("regression_test_runs")
      .select("completed_cases")
      .eq("id", runId)
      .single();

    const completedSoFar = Number(currentRun?.completed_cases || 0);

    await supabase.from("regression_test_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      summary: buildFailureSummary(allCaseIds.length, completedSoFar, fatalMessage),
    }).eq("id", runId);

    await notifyRegressionFailure(supabase, runId, agentType, fatalMessage);
  }
}

/** Finalize a completed regression run: compute aggregates, notify, auto-deploy */
async function finalizeRegressionRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  allCaseIds: string[],
  agentType: string,
  token: string,
  userId: string,
  userEmail: string,
) {
  // Fetch all results for this run
  const { data: results } = await supabase.from("regression_test_results")
    .select("*")
    .eq("run_id", runId);

  const allResults = results || [];

  const priorRecalls = allResults.filter((r: any) => r.prior_recall != null).map((r: any) => Number(r.prior_recall));
  const priorPrecisions = allResults.filter((r: any) => r.prior_precision != null).map((r: any) => Number(r.prior_precision));
  const proposedRecalls = allResults.filter((r: any) => r.proposed_recall != null).map((r: any) => Number(r.proposed_recall));
  const proposedPrecisions = allResults.filter((r: any) => r.proposed_precision != null).map((r: any) => Number(r.proposed_precision));

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100 : null;

  const regressionsFound = allResults.filter((r: any) => r.regression_detected).length;
  const improvementsFound = allResults.filter((r: any) => r.improvement_detected).length;
  const failedCount = allCaseIds.length - allResults.length;
  const unchangedCount = Math.max(0, allResults.length - regressionsFound - improvementsFound);

  await supabase.from("regression_test_runs").update({
    status: "complete",
    completed_cases: allCaseIds.length,
    completed_at: new Date().toISOString(),
    prior_avg_recall: avg(priorRecalls),
    prior_avg_precision: avg(priorPrecisions),
    proposed_avg_recall: avg(proposedRecalls),
    proposed_avg_precision: avg(proposedPrecisions),
    summary: {
      total_cases: allCaseIds.length,
      completed: allResults.length,
      failed: failedCount,
      regressions: regressionsFound,
      improvements: improvementsFound,
      no_change: unchangedCount,
      last_progress_at: new Date().toISOString(),
    },
  }).eq("id", runId);

  // Audit
  await supabase.from("audit_log").insert({
    user_id: userId,
    user_name: "",
    user_email: userEmail,
    event_type: "regression_test_run",
    metadata: {
      run_id: runId,
      agent_type: agentType,
      total_cases: allCaseIds.length,
      regressions: regressionsFound,
      improvements: improvementsFound,
    },
  });

  // ── Auto-deploy logic ──
  let autoDeployed = false;
  try {
    const { data: adSettings } = await supabase.from("auto_deploy_settings")
      .select("*").eq("agent_type", agentType).maybeSingle();

    if (adSettings?.enabled) {
      const avgProposedRecall = avg(proposedRecalls);
      const avgPriorRecall = avg(priorRecalls);
      const avgProposedPrecision = avg(proposedPrecisions);
      const avgPriorPrecision = avg(priorPrecisions);

      const recallImprovement = (avgProposedRecall != null && avgPriorRecall != null)
        ? avgProposedRecall - avgPriorRecall : null;
      const precisionImprovement = (avgProposedPrecision != null && avgPriorPrecision != null)
        ? avgProposedPrecision - avgPriorPrecision : null;

      const meetsRecall = recallImprovement != null && recallImprovement >= Number(adSettings.min_recall_improvement);
      const meetsPrecision = precisionImprovement != null && precisionImprovement >= Number(adSettings.min_precision_improvement);
      const meetsRegressions = !adSettings.require_zero_regressions || regressionsFound === 0;

      if (meetsRecall && meetsPrecision && meetsRegressions) {
        const { data: proposedPVRow } = await supabase.from("prompt_versions")
          .select("id, version")
          .eq("agent_id", agentType)
          .in("status", ["draft", "pending"])
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (proposedPVRow) {
          await supabase.from("prompt_versions")
            .update({ status: "rolled_back" })
            .eq("agent_id", agentType)
            .eq("status", "deployed");

          await supabase.from("prompt_versions")
            .update({ status: "deployed", deployed_at: new Date().toISOString() })
            .eq("id", proposedPVRow.id);

          autoDeployed = true;

          await supabase.from("regression_test_runs").update({
            summary: {
              total_cases: allCaseIds.length,
              completed: allResults.length,
              failed: failedCount,
              regressions: regressionsFound,
              improvements: improvementsFound,
              no_change: unchangedCount,
              auto_deployed: true,
              deployed_version: `v${proposedPVRow.version}`,
              last_progress_at: new Date().toISOString(),
            },
          }).eq("id", runId);

          await supabase.from("audit_log").insert({
            user_id: userId,
            user_name: "",
            user_email: userEmail,
            event_type: "auto_deploy_prompt_version",
            metadata: {
              run_id: runId,
              agent_type: agentType,
              deployed_version: `v${proposedPVRow.version}`,
              recall_improvement: recallImprovement,
              precision_improvement: precisionImprovement,
              regressions: regressionsFound,
            },
          });
        }
      }
    }
  } catch (adErr: any) {
    console.error("Auto-deploy check error:", adErr);
  }

  // ── Admin notifications ──
  try {
    const agentDisplayName = agentLabel(agentType);
    const notifTitle = `Regression Test Complete — ${agentDisplayName}`;
    const notifMessage = [
      `${allCaseIds.length} cases tested: ${improvementsFound} improved, ${regressionsFound} regressed, ${unchangedCount} unchanged${failedCount > 0 ? `, ${failedCount} failed` : ""}.`,
      autoDeployed ? "✅ Auto-deployed successfully." : "",
    ].filter(Boolean).join(" ");

    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
    const adminIds = (adminRoles || []).map((r: any) => r.user_id);

    if (adminIds.length > 0) {
      const notifRows = adminIds.map((uid: string) => ({
        user_id: uid,
        title: notifTitle,
        message: notifMessage,
        event_type: "regression_test_complete",
        metadata: {
          run_id: runId,
          agent_type: agentType,
          total_cases: allCaseIds.length,
          regressions: regressionsFound,
          improvements: improvementsFound,
          auto_deployed: autoDeployed,
        },
      }));
      await supabase.from("admin_notifications").insert(notifRows);

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
      if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
        const { data: adminProfiles } = await supabase.from("profiles").select("email").in("user_id", adminIds);
        const adminEmails = (adminProfiles || []).map((p: any) => p.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const htmlBody = `
            <h2>Regression Test Complete — ${agentDisplayName}</h2>
            <table style="border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:4px 12px;font-weight:bold">Agent</td><td style="padding:4px 12px">${agentDisplayName}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold">Cases Tested</td><td style="padding:4px 12px">${allCaseIds.length}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold">Improvements</td><td style="padding:4px 12px;color:green">${improvementsFound}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold">Regressions</td><td style="padding:4px 12px;color:${regressionsFound > 0 ? "red" : "green"}">${regressionsFound}</td></tr>
              <tr><td style="padding:4px 12px;font-weight:bold">Auto-Deployed</td><td style="padding:4px 12px">${autoDeployed ? "Yes ✅" : "No"}</td></tr>
            </table>
            <p><a href="https://lexsentinel-insight.lovable.app/admin/benchmark-dashboard">View Dashboard →</a></p>
          `;

          const emailResp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: RESEND_FROM_EMAIL,
              to: adminEmails[0],
              bcc: adminEmails.slice(1),
              subject: notifTitle,
              html: htmlBody,
            }),
          });
          await emailResp.text();
        }
      }
    }
  } catch (notifErr: any) {
    console.error("Notification error (non-fatal):", notifErr);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();

    // ── CONTINUATION MODE: self-invoked to process next chunk ──
    if (body._continue && body.run_id) {
      const { run_id, agent_type, chunk_case_ids, all_case_ids, user_id, user_email } = body;

      // Verify run is still active
      const { data: run } = await supabase.from("regression_test_runs")
        .select("status")
        .eq("id", run_id)
        .single();

      if (run?.status !== "running") {
        return new Response(JSON.stringify({ message: "Run no longer active", status: run?.status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process chunk in background, return immediately
      const chunkPromise = processRegressionChunk(
        run_id, chunk_case_ids, all_case_ids, agent_type, token, user_id, user_email,
      );

      // @ts-ignore – EdgeRuntime.waitUntil is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(chunkPromise);
      } else {
        chunkPromise.catch(err => console.error("Background chunk error:", err));
      }

      return new Response(JSON.stringify({ message: "Chunk processing started", run_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── INITIAL MODE: start a new regression test ──
    const { agent_type, prompt_patch_id, source_types, case_ids } = body;
    if (!agent_type) {
      return new Response(JSON.stringify({ error: "agent_type required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Guard: prevent duplicate runs for the same agent (auto-fail stalled runs)
    const { data: existingRun } = await supabase.from("regression_test_runs")
      .select("id, created_at, total_cases, completed_cases, summary")
      .eq("agent_type", agent_type)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRun) {
      const summary = (existingRun.summary && typeof existingRun.summary === "object") ? existingRun.summary as Record<string, any> : null;
      const lastProgressAtRaw = typeof summary?.last_progress_at === "string" ? summary.last_progress_at : existingRun.created_at;
      const stalledMs = Date.now() - new Date(lastProgressAtRaw).getTime();
      const isStalled = stalledMs > STALE_PROGRESS_MS;

      if (isStalled) {
        const failedSummary = buildFailureSummary(
          Number(existingRun.total_cases || 0),
          Number(existingRun.completed_cases || 0),
          `Marked failed after ${Math.round(STALE_PROGRESS_MS / 60000)}m without progress`,
        );

        await supabase.from("regression_test_runs").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          summary: failedSummary,
        }).eq("id", existingRun.id);

        await notifyRegressionFailure(supabase, existingRun.id, agent_type, failedSummary.error);
      } else {
        return new Response(JSON.stringify({
          error: "duplicate",
          message: `A regression test is already running for this agent. Run ID: ${existingRun.id}`,
          existing_run_id: existingRun.id,
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Determine benchmark cases for regression set
    let benchmarkCaseIds: string[] = case_ids || [];

    if (benchmarkCaseIds.length === 0) {
      let query = supabase.from("benchmark_cases").select("id, source_type")
        .eq("agent_type", agent_type)
        .eq("status", "ready")
        .eq("is_excluded", false);

      if (source_types && source_types.length > 0) {
        query = query.in("source_type", source_types);
      }

      const { data: cases } = await query.limit(200);
      benchmarkCaseIds = (cases || []).map((c: any) => c.id);
    }

    if (benchmarkCaseIds.length === 0) {
      return new Response(JSON.stringify({ error: "No benchmark cases found for regression test" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch current deployed prompt version
    const { data: currentPV } = await supabase.from("prompt_versions").select("version")
      .eq("agent_id", agent_type).eq("status", "deployed")
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const priorVersion = currentPV ? `v${currentPV.version}` : null;

    // Fetch proposed version
    const { data: proposedPV } = await supabase.from("prompt_versions").select("version")
      .eq("agent_id", agent_type).in("status", ["draft", "pending"])
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const proposedVersion = proposedPV ? `v${proposedPV.version}` : priorVersion ? `${priorVersion}-proposed` : "v1-proposed";

    // Determine source types included
    const { data: casesForSources } = await supabase.from("benchmark_cases").select("source_type").in("id", benchmarkCaseIds);
    const sourceTypesIncluded = [...new Set((casesForSources || []).map((c: any) => c.source_type))];

    // Create regression test run
    const { data: run, error: runErr } = await supabase.from("regression_test_runs").insert({
      agent_type,
      prompt_patch_id: prompt_patch_id || null,
      prior_prompt_version: priorVersion,
      proposed_prompt_version: proposedVersion,
      status: "running",
      benchmark_case_ids: benchmarkCaseIds,
      source_types_included: sourceTypesIncluded,
      total_cases: benchmarkCaseIds.length,
      completed_cases: 0,
      summary: {
        total_cases: benchmarkCaseIds.length,
        completed: 0,
        failed: 0,
        started_at: new Date().toISOString(),
        last_progress_at: new Date().toISOString(),
      },
      created_by: user.id,
    }).select("id").single();
    if (runErr) throw runErr;

    // Start first chunk in background
    const firstChunk = benchmarkCaseIds.slice(0, CHUNK_SIZE);
    const chunkPromise = processRegressionChunk(
      run.id, firstChunk, benchmarkCaseIds, agent_type, token, user.id, user.email || "",
    );

    // @ts-ignore – EdgeRuntime.waitUntil is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(chunkPromise);
    } else {
      chunkPromise.catch(err => console.error("Background regression processing error:", err));
    }

    return new Response(JSON.stringify({
      run_id: run.id,
      total_cases: benchmarkCaseIds.length,
      status: "running",
      message: `Regression test started for ${benchmarkCaseIds.length} cases (processing in chunks of ${CHUNK_SIZE}). Results will appear in the Benchmark Dashboard.`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("run-regression-test error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

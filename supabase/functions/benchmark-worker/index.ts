import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "";

const MAX_CASE_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Concurrency Lock Check ──
    const lockConflict = await checkConcurrencyLock(sb);
    if (lockConflict) {
      return new Response(JSON.stringify({ message: `Skipped: ${lockConflict}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Acquire lock (3 min expiry — must be shorter than edge function timeout)
    await sb.from("benchmark_system_locks").update({
      is_locked: true,
      locked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 min expiry
      locked_by: "benchmark-worker",
    }).eq("lock_type", "evaluation_worker");

    // Find the oldest running batch, or the oldest pending batch
    const { data: batch } = await sb
      .from("benchmark_batches")
      .select("*")
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!batch) {
      await releaseLock(sb, "evaluation_worker");
      return new Response(JSON.stringify({ message: "No pending batches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark batch as running if pending
    if (batch.status === "pending") {
      await sb.from("benchmark_batches").update({ status: "running" }).eq("id", batch.id);
    }

    // Pick up to 3 pending items from this batch
    const { data: items } = await sb
      .from("benchmark_job_items")
      .select("*")
      .eq("batch_id", batch.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3);

    if (!items || items.length === 0) {
      // No more items — check if batch is complete
      await finalizeBatch(sb, batch);
      await releaseLock(sb, "evaluation_worker");
      return new Response(JSON.stringify({ message: "Batch finalized", batch_id: batch.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark items as running
    const itemIds = items.map((i: any) => i.id);
    await sb
      .from("benchmark_job_items")
      .update({ status: "running", started_at: new Date().toISOString() })
      .in("id", itemIds);

    // Canary check removed — auth errors are caught per-item and batch continues

    // Process each item by calling benchmark-compare
    const results = await Promise.allSettled(
      items.map(async (item: any) => {
        try {
          // ── File Size Pre-Flight Check ──
          const fileSizeCheck = await checkCaseFileSize(sb, item.benchmark_case_id);
          if (fileSizeCheck.exceeded) {
            await sb
              .from("benchmark_job_items")
              .update({
                status: "failed",
                error_message: `FILE_SIZE_EXCEEDED: Total ${formatBytes(fileSizeCheck.totalSize)} exceeds ${formatBytes(MAX_CASE_FILE_SIZE_BYTES)} limit. Use Reduced-Res optimizer or chunked extraction.`,
                completed_at: new Date().toISOString(),
              })
              .eq("id", item.id);
            return { id: item.id, success: false, fileSizeExceeded: true };
          }

          const resp = await fetch(`${SUPABASE_URL}/functions/v1/benchmark-compare`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ benchmark_case_id: item.benchmark_case_id }),
          });

          const text = await resp.text();

          if (!resp.ok) {
            const isCredit = resp.status === 402 || /payment_required|not enough credits/i.test(text);
            if (isCredit) {
              throw new Error("CREDIT_LIMIT");
            }
            throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
          }

          await sb
            .from("benchmark_job_items")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", item.id);

          return { id: item.id, success: true };
        } catch (err: any) {
          const msg = err?.message || "Unknown error";
          const isCredit = msg === "CREDIT_LIMIT";

          await sb
            .from("benchmark_job_items")
            .update({
              status: isCredit ? "credit_exhausted" : "failed",
              error_message: msg,
              completed_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          if (isCredit) {
            // Mark all remaining pending items as credit_exhausted
            await sb
              .from("benchmark_job_items")
              .update({ status: "credit_exhausted", error_message: "Credit limit reached", completed_at: new Date().toISOString() })
              .eq("batch_id", batch.id)
              .eq("status", "pending");

            // Also mark any other running items
            await sb
              .from("benchmark_job_items")
              .update({ status: "credit_exhausted", error_message: "Credit limit reached", completed_at: new Date().toISOString() })
              .eq("batch_id", batch.id)
              .eq("status", "running");
          }

          return { id: item.id, success: false, credit: isCredit };
        }
      })
    );

    // Check if any credit limit hit
    const creditHit = results.some(
      (r) => r.status === "fulfilled" && (r.value as any).credit
    );

    if (creditHit) {
      await finalizeBatch(sb, batch, true);
      await releaseLock(sb, "evaluation_worker");
      return new Response(JSON.stringify({ message: "Batch stopped: credit limit", batch_id: batch.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Individual case failures are simply skipped — batch continues with remaining cases

    // Update batch progress
    const { count: completedCount } = await sb
      .from("benchmark_job_items")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batch.id)
      .eq("status", "completed");

    const { count: failedCount } = await sb
      .from("benchmark_job_items")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batch.id)
      .in("status", ["failed", "credit_exhausted"]);

    await sb
      .from("benchmark_batches")
      .update({
        completed_cases: completedCount || 0,
        failed_cases: failedCount || 0,
      })
      .eq("id", batch.id);

    // Check if all items are done
    const { count: pendingCount } = await sb
      .from("benchmark_job_items")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batch.id)
      .in("status", ["pending", "running"]);

    if (pendingCount === 0) {
      await finalizeBatch(sb, batch);
    }

    await releaseLock(sb, "evaluation_worker");

    // Self-continuation: if there are more pending items, re-invoke the worker
    if ((pendingCount || 0) > 0) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/benchmark-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ continuation: true }),
        });
      } catch (err) {
        console.warn("Worker self-continuation failed:", err);
      }
    }

    return new Response(
      JSON.stringify({ message: "Processed items", batch_id: batch.id, processed: items.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Worker error:", err);
    await releaseLock(sb, "evaluation_worker");
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Check if any conflicting lock is active (manual regression or another batch eval) */
async function checkConcurrencyLock(sb: any): Promise<string | null> {
  const { data: locks } = await sb
    .from("benchmark_system_locks")
    .select("*")
    .eq("is_locked", true)
    .in("lock_type", ["evaluation_worker", "manual_regression", "batch_evaluation"]);

  if (!locks || locks.length === 0) return null;

  const now = Date.now();
  for (const lock of locks) {
    // Check if lock has expired
    if (lock.expires_at && new Date(lock.expires_at).getTime() < now) {
      // Expired — release it
      await sb.from("benchmark_system_locks").update({
        is_locked: false, locked_at: null, expires_at: null, locked_by: null,
      }).eq("id", lock.id);
      continue;
    }
    // Allow benchmark-worker to reclaim its own lock (handles timeout-without-release)
    if (lock.lock_type === "evaluation_worker" && lock.locked_by === "benchmark-worker") {
      // Check if the lock is older than 2 minutes (likely a timed-out invocation)
      const lockAge = now - new Date(lock.locked_at).getTime();
      if (lockAge > 2 * 60 * 1000) {
        console.log(`[LOCK] Reclaiming stale evaluation_worker lock (age: ${Math.round(lockAge / 1000)}s)`);
        await sb.from("benchmark_system_locks").update({
          is_locked: false, locked_at: null, expires_at: null, locked_by: null,
        }).eq("id", lock.id);
        continue;
      }
    }
    // Active non-expired lock found
    return `Active lock: ${lock.lock_type} (by ${lock.locked_by || "unknown"}, since ${lock.locked_at})`;
  }
  return null;
}

/** Release a specific lock */
async function releaseLock(sb: any, lockType: string) {
  await sb.from("benchmark_system_locks").update({
    is_locked: false, locked_at: null, expires_at: null, locked_by: null,
  }).eq("lock_type", lockType);
}

/** Check total file size for a benchmark case's documents */
async function checkCaseFileSize(sb: any, benchmarkCaseId: string): Promise<{ exceeded: boolean; totalSize: number }> {
  const { data: docs } = await sb
    .from("benchmark_documents")
    .select("file_size")
    .eq("benchmark_case_id", benchmarkCaseId);

  if (!docs || docs.length === 0) return { exceeded: false, totalSize: 0 };

  const totalSize = docs.reduce((sum: number, d: any) => sum + (d.file_size || 0), 0);
  return { exceeded: totalSize > MAX_CASE_FILE_SIZE_BYTES, totalSize };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function finalizeBatch(sb: any, batch: any, creditExhausted = false) {
  // Get final counts
  const { count: completedCount } = await sb
    .from("benchmark_job_items")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batch.id)
    .eq("status", "completed");

  const { count: failedCount } = await sb
    .from("benchmark_job_items")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batch.id)
    .in("status", ["failed", "credit_exhausted"]);

  const finalStatus = creditExhausted ? "credit_exhausted" : "completed";

  await sb
    .from("benchmark_batches")
    .update({
      status: finalStatus,
      completed_cases: completedCount || 0,
      failed_cases: failedCount || 0,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batch.id);

  // Run pattern analysis if requested — check for ANY existing comparisons (not just this batch)
  if (batch.include_analysis) {
    let hasComparisons = (completedCount || 0) > 0;

    // If no successes in this batch, check if prior comparisons exist for this agent
    if (!hasComparisons && batch.agent_filter) {
      const { count } = await sb
        .from("benchmark_comparisons")
        .select("*", { count: "exact", head: true })
        .eq("status", "complete");
      hasComparisons = (count || 0) > 0;
    }

    if (hasComparisons) {
      try {
        const analysisResp = await fetch(`${SUPABASE_URL}/functions/v1/benchmark-analyze-patterns`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            agent_type: batch.agent_filter || "all",
            source_type: batch.source_filter || "all",
          }),
        });
        const analysisText = await analysisResp.text();
        if (!analysisResp.ok) {
          console.error(`Pattern analysis HTTP ${analysisResp.status}: ${analysisText.slice(0, 500)}`);
        } else {
          console.log(`Pattern analysis completed: ${analysisText.slice(0, 200)}`);
        }
      } catch (err) {
        console.error("Pattern analysis invocation failed:", err);
      }
    }
  }

  // Create notification
  const completed = completedCount || 0;
  const failed = failedCount || 0;
  const title = creditExhausted
    ? "Batch evaluation stopped — credits exhausted"
    : "Batch evaluation complete";
  const message = `${completed} case${completed !== 1 ? "s" : ""} evaluated successfully${failed > 0 ? `, ${failed} failed` : ""}${batch.include_analysis ? ". Pattern analysis complete." : "."}`;

  await sb.from("admin_notifications").insert({
    user_id: batch.created_by,
    event_type: "batch_evaluation_complete",
    title,
    message,
    metadata: {
      batch_id: batch.id,
      completed: completed,
      failed: failed,
      credit_exhausted: creditExhausted,
    },
  });

  // Send email notification
  if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
    try {
      // Get admin emails
      const { data: admins } = await sb
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      if (admins && admins.length > 0) {
        const adminIds = admins.map((a: any) => a.user_id);
        const { data: profiles } = await sb
          .from("profiles")
          .select("email")
          .in("user_id", adminIds)
          .eq("active", true);

        const emails = (profiles || []).map((p: any) => p.email).filter(Boolean);

        if (emails.length > 0) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: RESEND_FROM_EMAIL,
              to: emails[0],
              bcc: emails.slice(1),
              subject: `Olimey AI: ${title}`,
              html: `<h2>${title}</h2><p>${message}</p><p><a href="https://lexsentinel-insight.lovable.app/admin/benchmark-dashboard">View Dashboard</a></p>`,
            }),
          });
        }
      }
    } catch (err) {
      console.error("Email notification failed:", err);
    }
  }
}

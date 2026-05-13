/**
 * Edge function cold-start mitigation (H5 Fix).
 * Sends a lightweight OPTIONS ping to warm up the container
 * before the user triggers a heavy analysis.
 */

const WARMUP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;

let lastWarmup = 0;
const COOLDOWN_MS = 120_000; // Don't re-ping within 2 minutes

/**
 * Fire-and-forget warmup ping. Safe to call multiple times —
 * internally debounced to avoid spamming.
 */
export function warmUpEdgeFunction(): void {
  const now = Date.now();
  if (now - lastWarmup < COOLDOWN_MS) return;
  lastWarmup = now;

  // OPTIONS preflight is the lightest possible request — no auth needed
  fetch(WARMUP_URL, { method: "OPTIONS" }).catch(() => {
    // Silently ignore — this is best-effort
  });
}

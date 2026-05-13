/**
 * System telemetry logger (H7 Fix).
 * Routes 404s, edge function failures, and other system events
 * to a central system_logs table for operational visibility.
 */

import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "info" | "warn" | "error";
export type LogCategory = "navigation_404" | "edge_function_error" | "network_error" | "client_error";

interface SystemLogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: Record<string, unknown>;
}

// Debounce/dedup: don't log the same message more than once per 60s
const recentLogs = new Map<string, number>();
const DEDUP_MS = 60_000;

/**
 * Log a system event to the system_logs table.
 * Fire-and-forget — never throws or blocks the UI.
 */
export function logSystemEvent(entry: SystemLogEntry): void {
  const dedupeKey = `${entry.category}:${entry.message}`;
  const now = Date.now();
  const last = recentLogs.get(dedupeKey);
  if (last && now - last < DEDUP_MS) return;
  recentLogs.set(dedupeKey, now);

  // Clean old entries periodically
  if (recentLogs.size > 100) {
    for (const [key, ts] of recentLogs) {
      if (now - ts > DEDUP_MS) recentLogs.delete(key);
    }
  }

  // Fire-and-forget insert
  supabase
    .from("system_logs" as any)
    .insert({
      level: entry.level,
      category: entry.category,
      message: entry.message.slice(0, 1000),
      metadata: entry.metadata || null,
      user_agent: navigator.userAgent.slice(0, 500),
      url: window.location.href.slice(0, 2000),
    } as any)
    .then(({ error }) => {
      if (error) console.warn("[SystemLogger] Failed to log:", error.message);
    });
}

/**
 * Log a 404 navigation event.
 */
export function log404(pathname: string): void {
  logSystemEvent({
    level: "warn",
    category: "navigation_404",
    message: `404: ${pathname}`,
    metadata: { pathname, referrer: document.referrer || null },
  });
}

/**
 * Log an edge function failure.
 */
export function logEdgeFunctionError(functionName: string, error: string, statusCode?: number): void {
  logSystemEvent({
    level: "error",
    category: "edge_function_error",
    message: `Edge function "${functionName}" failed: ${error}`,
    metadata: { functionName, statusCode },
  });
}

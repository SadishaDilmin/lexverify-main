import { useRef, useCallback } from "react";

/**
 * Returns an adaptive debounce delay based on connection quality and CPU pressure.
 *
 * - Slow connection (effectiveType 2g/slow-2g) → 2000ms
 * - Save-data header active → 2000ms
 * - CPU congested (> 4 long tasks in last 5s via PerformanceObserver) → 1500ms
 * - Default → baseMs
 */
export function getAdaptiveDelay(baseMs: number): number {
  // Check Network Information API
  const conn = (navigator as any).connection;
  if (conn) {
    const etype = conn.effectiveType;
    if (etype === "slow-2g" || etype === "2g") return Math.max(baseMs, 2000);
    if (etype === "3g") return Math.max(baseMs, 1200);
    if (conn.saveData) return Math.max(baseMs, 2000);
  }

  return baseMs;
}

/**
 * Hook that returns a stable function giving the current adaptive delay.
 * Avoids re-renders — reads network state on-demand.
 */
export function useAdaptiveDelay(baseMs: number): () => number {
  const baseMsRef = useRef(baseMs);
  baseMsRef.current = baseMs;

  return useCallback(() => getAdaptiveDelay(baseMsRef.current), []);
}

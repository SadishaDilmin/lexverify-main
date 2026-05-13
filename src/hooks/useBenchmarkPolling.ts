import { useCallback, useEffect, useRef, useState } from "react";

interface UseBenchmarkPollingOptions {
  /** Whether there's an active batch running */
  isActive: boolean;
  /** Current progress percentage (0-100) */
  progressPct: number;
  /** Callback to refetch data */
  onPoll: () => void;
}

const BASE_INTERVAL_MS = 4_000;
const BACKOFF_INTERVAL_MS = 15_000;
const STALE_CYCLE_THRESHOLD = 5;

/**
 * Intelligent polling hook with exponential backoff and visibility-aware pausing.
 * - Starts at 4s intervals
 * - Backs off to 15s if progress stalls for 5+ cycles
 * - Stops polling entirely when tab is hidden
 */
export function useBenchmarkPolling({ isActive, progressPct, onPoll }: UseBenchmarkPollingOptions) {
  const [interval, setInterval_] = useState(BASE_INTERVAL_MS);
  const staleCyclesRef = useRef(0);
  const lastProgressRef = useRef(progressPct);
  const isVisibleRef = useRef(!document.hidden);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track visibility changes
  useEffect(() => {
    const handler = () => {
      isVisibleRef.current = !document.hidden;
      // If tab becomes visible again and active, immediately poll
      if (!document.hidden && isActive) {
        onPoll();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isActive, onPoll]);

  // Track progress changes for backoff
  useEffect(() => {
    if (!isActive) {
      staleCyclesRef.current = 0;
      setInterval_(BASE_INTERVAL_MS);
      return;
    }

    if (progressPct !== lastProgressRef.current) {
      // Progress changed — reset backoff
      staleCyclesRef.current = 0;
      setInterval_(BASE_INTERVAL_MS);
      lastProgressRef.current = progressPct;
    }
  }, [isActive, progressPct]);

  // Main polling loop
  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const tick = () => {
      // Skip if tab hidden
      if (!isVisibleRef.current) {
        timerRef.current = setTimeout(tick, interval);
        return;
      }

      staleCyclesRef.current++;

      // Check for stale progress
      if (staleCyclesRef.current >= STALE_CYCLE_THRESHOLD && interval !== BACKOFF_INTERVAL_MS) {
        setInterval_(BACKOFF_INTERVAL_MS);
      }

      onPoll();
      timerRef.current = setTimeout(tick, interval);
    };

    timerRef.current = setTimeout(tick, interval);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, interval, onPoll]);

  return { currentInterval: interval, isBackedOff: interval > BASE_INTERVAL_MS };
}

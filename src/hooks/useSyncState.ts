import { useState, useEffect, useRef } from "react";
import { getAdaptiveDelay } from "./useAdaptiveDebounce";

/**
 * useSyncState — persists React state to localStorage with debounced writes,
 * and rehydrates on mount using the priority chain:
 *   dbValue → localStorage → defaultValue
 *
 * C1 Fix: Uses a ref to track current state so the flush-on-unmount
 * cleanup always writes the latest value, not a stale closure capture.
 *
 * H3 Fix: Tracks whether a DB write has occurred to prevent unmount
 * flush from re-persisting stale data after a successful save.
 */
export function useSyncState<T>(
  key: string,
  defaultValue: T,
  dbValue?: T | undefined,
  debounceMs = 300,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (dbValue !== undefined) return dbValue;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      // corrupted localStorage, fall through
    }
    return defaultValue;
  });

  // C1 Fix: Always keep a ref pointing at the latest state
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isInitial = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // H3 Fix: Track whether dbValue has been applied to suppress stale flush
  const dbSyncedRef = useRef(false);

  // Sync DB value if it arrives after mount
  useEffect(() => {
    if (dbValue !== undefined && isInitial.current) {
      setState(dbValue);
      isInitial.current = false;
      dbSyncedRef.current = true;
    }
  }, [dbValue]);

  // Track dbValue in a ref for comparison
  const dbRef = useRef(dbValue);
  useEffect(() => { dbRef.current = dbValue; }, [dbValue]);

  // Debounced write to localStorage — skip if value equals dbValue (M5)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const serialized = JSON.stringify(state);
        // Skip redundant write when state matches the authoritative DB value
        if (dbRef.current !== undefined && serialized === JSON.stringify(dbRef.current)) return;
        localStorage.setItem(key, serialized);
      } catch {
        // quota exceeded — non-critical
      }
    }, getAdaptiveDelay(debounceMs));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, state, debounceMs]);

  // Flush on unmount — reads from ref to avoid stale closure
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // H3 Fix: If DB synced successfully, don't write stale local state back
      if (dbSyncedRef.current && dbRef.current !== undefined) {
        const currentSerialized = JSON.stringify(stateRef.current);
        const dbSerialized = JSON.stringify(dbRef.current);
        if (currentSerialized === dbSerialized) return; // No divergence
      }
      try {
        localStorage.setItem(key, JSON.stringify(stateRef.current));
      } catch { /* non-critical */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [state, setState];
}

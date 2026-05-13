import { useState, useEffect, useRef, useCallback } from "react";
import { getAdaptiveDelay } from "./useAdaptiveDebounce";

const DEBOUNCE_MS = 500;

/**
 * useFormDraft — auto-saves form state to sessionStorage so users can resume
 * incomplete multi-step forms after accidental navigation or refresh.
 *
 * C1 Fix: Uses a ref to track current state so flush-on-unmount
 * always persists the latest value instead of a stale closure capture.
 *
 * H3 Fix: Uses a `cleared` ref to prevent unmount flush from
 * re-persisting a draft that was explicitly cleared via `clear()`.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  defaultValue: T
): [T, (patch: Partial<T>) => void, () => void] {
  const storageKey = `ls-draft:${key}`;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultValue, ...parsed };
      }
    } catch {
      // corrupted — fall through
    }
    return defaultValue;
  });

  // C1 Fix: Always keep a ref pointing at the latest state
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // H3 Fix: Track whether clear() was called to prevent unmount re-persist
  const clearedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced write
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // quota exceeded
      }
    }, getAdaptiveDelay(DEBOUNCE_MS));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [storageKey, state]);

  // Flush on unmount — reads from ref to avoid stale closure
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // H3 Fix: Don't re-persist if clear() was called
      if (clearedRef.current) return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(stateRef.current));
      } catch { /* non-critical */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = useCallback((patch: Partial<T>) => {
    clearedRef.current = false; // Reset cleared flag on new data
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => {
    clearedRef.current = true; // H3 Fix: Mark as cleared
    sessionStorage.removeItem(storageKey);
    setState(defaultValue); // H3 Fix: Reset in-memory state so UI reflects cleared form
  }, [storageKey, defaultValue]);

  return [state, update, clear];
}

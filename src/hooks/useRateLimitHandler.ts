import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface RateLimitState {
  isRateLimited: boolean;
  retryAfterSecs: number;
}

/**
 * Extracts retry-after seconds from a rate-limit error message.
 * Matches patterns like "try again in 45 seconds" or "retry after 120 seconds".
 */
function extractRetrySeconds(message: string): number {
  const match = message.match(/(?:in|after)\s+(\d+)\s+seconds?/i);
  return match ? parseInt(match[1], 10) : 30; // default 30s
}

/**
 * Returns true if the error looks like a 429 rate-limit response,
 * whether it comes from supabase.functions.invoke error or data.error.
 */
export function isRateLimitError(error: any, data?: any): boolean {
  const msg =
    (typeof error === "string" ? error : error?.message || error?.msg || "") +
    (data?.error || "");
  return (
    msg.toLowerCase().includes("rate limit") ||
    msg.includes("429") ||
    msg.toLowerCase().includes("too many requests")
  );
}

/**
 * Hook that manages a countdown timer for rate-limit errors
 * and shows a toast with live countdown updates.
 */
export function useRateLimitHandler() {
  const { toast: showToast } = useToast();
  const [state, setState] = useState<RateLimitState>({
    isRateLimited: false,
    retryAfterSecs: 0,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleRateLimit = useCallback(
    (errorMessage: string) => {
      const secs = extractRetrySeconds(errorMessage);
      setState({ isRateLimited: true, retryAfterSecs: secs });

      if (intervalRef.current) clearInterval(intervalRef.current);

      let remaining = secs;

      showToast({
        title: "Rate limit reached",
        description: `Please wait ${remaining}s before trying again.`,
        variant: "destructive",
      });

      intervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(intervalRef.current);
          setState({ isRateLimited: false, retryAfterSecs: 0 });
          showToast({
            title: "Ready to retry",
            description: "You can now run the AI review again.",
          });
        } else {
          setState((prev) => ({ ...prev, retryAfterSecs: remaining }));
        }
      }, 1000);
    },
    [showToast],
  );

  /**
   * Call this in your catch block. Returns true if it was a rate-limit error
   * (and the handler took care of the toast), false otherwise.
   */
  const checkAndHandle = useCallback(
    (error: any, data?: any): boolean => {
      const combinedMsg =
        (typeof error === "string" ? error : error?.message || "") +
        " " +
        (data?.error || "");
      if (isRateLimitError(error, data)) {
        handleRateLimit(combinedMsg);
        return true;
      }
      return false;
    },
    [handleRateLimit],
  );

  return {
    isRateLimited: state.isRateLimited,
    retryAfterSecs: state.retryAfterSecs,
    checkAndHandle,
  };
}

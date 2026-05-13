import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Generate a simple session ID for grouping events (persists per tab) */
const getSessionId = (() => {
  let id: string | null = null;
  return () => {
    if (!id) {
      id = `gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return id;
  };
})();

/**
 * Lightweight glossary analytics hook.
 * Tracks: pageview, search queries (debounced), and definition clicks.
 * Bounce = pageview with no click or search within the session.
 */
export function useGlossaryAnalytics() {
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInteracted = useRef(false);

  // Track pageview on mount
  useEffect(() => {
    const sessionId = getSessionId();
    supabase
      .from("glossary_analytics" as any)
      .insert({ event_type: "pageview", session_id: sessionId } as any)
      .then(() => {});

    // On unmount, if no interaction happened, it's a bounce (already trackable via pageview-only sessions)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  /** Track a search query (debounced 800ms to avoid spamming) */
  const trackSearch = useCallback((query: string, resultsCount: number) => {
    if (!query.trim() || query.length < 2) return;
    hasInteracted.current = true;

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      supabase
        .from("glossary_analytics" as any)
        .insert({
          event_type: "search",
          search_query: query.trim().toLowerCase().slice(0, 200),
          results_count: resultsCount,
          session_id: getSessionId(),
        } as any)
        .then(() => {});
    }, 800);
  }, []);

  /** Track a definition click */
  const trackClick = useCallback((termSlug: string) => {
    hasInteracted.current = true;
    supabase
      .from("glossary_analytics" as any)
      .insert({
        event_type: "click",
        term_slug: termSlug,
        session_id: getSessionId(),
      } as any)
      .then(() => {});
  }, []);

  return { trackSearch, trackClick };
}

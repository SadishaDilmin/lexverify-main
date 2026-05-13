import { useState, useEffect, memo, useRef, useCallback } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { WifiOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { replayOfflineMutations, hasPendingMutations } from "@/lib/offlineQueue";

/**
 * Global connectivity & sync indicator.
 * H6 Fix: Replays queued offline mutations on reconnect.
 */
const NetworkStatus = memo(function NetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const replayingRef = useRef(false);

  // Debounce syncing indicator to avoid flash for fast fetches
  const [showSync, setShowSync] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOnline = useCallback(async () => {
    setOnline(true);
    // H6 Fix: Replay offline mutations when back online
    if (!replayingRef.current && hasPendingMutations()) {
      replayingRef.current = true;
      try {
        await replayOfflineMutations(supabase);
      } finally {
        replayingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    const goOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [handleOnline]);

  // Only show syncing pill if fetching/mutating persists >400ms
  const isActive = isFetching > 0 || isMutating > 0;
  useEffect(() => {
    if (isActive) {
      syncTimer.current = setTimeout(() => setShowSync(true), 400);
    } else {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      setShowSync(false);
    }
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [isActive]);

  if (!online) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground py-2 px-4 text-sm font-medium shadow-lg">
        <WifiOff size={16} />
        Offline — Changes will sync when reconnected
      </div>
    );
  }

  if (!showSync) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-muted border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200">
      <Loader2 size={14} className="animate-spin text-primary" />
      {isMutating > 0 ? "Saving…" : "Syncing…"}
    </div>
  );
});

export default NetworkStatus;

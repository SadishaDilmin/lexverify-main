/**
 * Lightweight offline mutation queue (H6 Fix).
 * Intercepts mutations when offline, stores in localStorage,
 * and replays them when connectivity is restored.
 *
 * H4 Fix: Version-aware replay — fetches current server version before
 * applying queued updates to prevent silent overwrites of concurrent changes.
 */

import { toast } from "sonner";

const QUEUE_KEY = "ls_offline_mutations";

export interface OfflineMutation {
  id: string;
  table: string;
  type: "insert" | "update" | "upsert";
  data: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  /** H4 Fix: Expected version at the time the mutation was queued */
  expectedVersion?: number;
  timestamp: number;
}

function getQueue(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineMutation[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* quota */ }
}

/** Enqueue a mutation for later replay */
export function enqueueMutation(mutation: Omit<OfflineMutation, "id" | "timestamp">) {
  const entry: OfflineMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const queue = getQueue();
  queue.push(entry);
  saveQueue(queue);
  toast.info("You're offline — change queued for sync.");
}

/** Check if there are pending offline mutations */
export function hasPendingMutations(): boolean {
  return getQueue().length > 0;
}

/**
 * Replay all queued mutations. Called on reconnect.
 * H4 Fix: For updates with expectedVersion, performs a version-checked update
 * to prevent overwriting changes made while the user was offline.
 */
export async function replayOfflineMutations(
  supabase: { from: (table: string) => any }
): Promise<{ success: number; failed: number; conflicts: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { success: 0, failed: 0, conflicts: 0 };

  toast.info("Syncing offline changes…", { duration: 3000 });

  let success = 0;
  let failed = 0;
  let conflicts = 0;
  const remaining: OfflineMutation[] = [];

  for (const mutation of queue) {
    try {
      let query;
      if (mutation.type === "insert") {
        query = supabase.from(mutation.table).insert(mutation.data);
      } else if (mutation.type === "update" && mutation.matchColumn && mutation.matchValue) {
        // H4 Fix: Version-aware replay for updates
        if (mutation.expectedVersion != null) {
          // Fetch current server version first
          const { data: current, error: fetchErr } = await supabase
            .from(mutation.table)
            .select("version")
            .eq(mutation.matchColumn, mutation.matchValue)
            .single();

          if (fetchErr || !current) {
            console.warn("[OfflineQueue] Could not fetch current version for", mutation.table, mutation.matchValue);
            remaining.push(mutation);
            failed++;
            continue;
          }

          const serverVersion = current.version as number;

          // If server version has advanced beyond what we expected, this is a conflict
          if (serverVersion !== mutation.expectedVersion) {
            console.warn(
              `[OfflineQueue] Version conflict on ${mutation.table}/${mutation.matchValue}: ` +
              `expected v${mutation.expectedVersion}, server has v${serverVersion}. Skipping to prevent overwrite.`
            );
            conflicts++;
            // Don't retry conflicting mutations — they're stale
            continue;
          }

          // Version matches — safe to apply with version increment and strict lock
          query = supabase
            .from(mutation.table)
            .update({ ...mutation.data, version: serverVersion + 1 })
            .eq(mutation.matchColumn, mutation.matchValue)
            .eq("version", serverVersion);
        } else {
          // No version tracking on this table — apply directly (legacy behavior)
          query = supabase.from(mutation.table).update(mutation.data).eq(mutation.matchColumn, mutation.matchValue);
        }
      } else if (mutation.type === "upsert") {
        query = supabase.from(mutation.table).upsert(mutation.data);
      } else {
        failed++;
        continue;
      }

      const { error } = await query;
      if (error) {
        console.warn("[OfflineQueue] Replay failed:", error.message);
        remaining.push(mutation);
        failed++;
      } else {
        success++;
      }
    } catch (err) {
      console.warn("[OfflineQueue] Replay exception:", err);
      remaining.push(mutation);
      failed++;
    }
  }

  saveQueue(remaining);

  if (success > 0) {
    toast.success(`Synced ${success} offline change${success > 1 ? "s" : ""}.`);
  }
  if (conflicts > 0) {
    toast.warning(
      `${conflicts} offline change${conflicts > 1 ? "s were" : " was"} skipped due to conflicts — the data was modified while you were offline. Please review and re-apply if needed.`
    );
  }
  if (failed > 0) {
    toast.error(`${failed} change${failed > 1 ? "s" : ""} failed to sync. Will retry on next reconnect.`);
  }

  return { success, failed, conflicts };
}

/** Clear the offline queue (e.g. on logout) */
export function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

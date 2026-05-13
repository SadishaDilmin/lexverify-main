import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OptimisticSaveOptions {
  table: string;
  id: string;
  idColumn?: string;
  expectedVersion: number;
  data: Record<string, unknown>;
  onSuccess?: (newVersion: number) => void;
  onConflict?: () => void;
}

interface ConflictState {
  isConflict: boolean;
  pendingOptions: OptimisticSaveOptions | null;
}

/**
 * useOptimisticSave — prevents stale overwrites (H2, H4, H7).
 *
 * Phase 4: Returns conflict state for ConflictResolutionModal integration.
 * When conflict detected → sets conflictState instead of just toasting.
 *
 * H3 Fix: forceSave now uses strict version locking (.eq('version', serverVersion))
 * to prevent silent overwrites from concurrent force-saves.
 */
export function useOptimisticSave() {
  const [conflictState, setConflictState] = useState<ConflictState>({
    isConflict: false,
    pendingOptions: null,
  });

  const save = useCallback(async (opts: OptimisticSaveOptions): Promise<boolean> => {
    const {
      table,
      id,
      idColumn = "id",
      expectedVersion,
      data,
      onSuccess,
      onConflict,
    } = opts;

    const { data: rows, error } = await (supabase
      .from(table as "cases")
      .update({ ...data, version: expectedVersion + 1 } as never)
      .eq(idColumn as "id", id as never)
      .eq("version" as never, expectedVersion as never)
      .select("version") as unknown as Promise<{ data: Array<{ version: number }> | null; error: { message: string } | null }>);

    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return false;
    }

    if (!rows || rows.length === 0) {
      // Set conflict state for modal
      setConflictState({ isConflict: true, pendingOptions: opts });
      onConflict?.();
      return false;
    }

    onSuccess?.(rows[0].version);
    return true;
  }, []);

  /**
   * Force save — fetches current server version first to ensure monotonic increment.
   * H3 Fix: Uses .eq('version', serverVersion) to prevent concurrent force-save races.
   * If another force-save lands between our read and write, this will detect the conflict
   * and surface it rather than silently overwriting.
   */
  const forceSave = useCallback(async (opts: OptimisticSaveOptions): Promise<boolean> => {
    const { table, id, idColumn = "id", data, onSuccess, onConflict } = opts;

    // Fetch current server version to guarantee monotonic versioning
    const { data: currentRows, error: fetchErr } = await (supabase
      .from(table as "cases")
      .select("version")
      .eq(idColumn as "id", id as never)
      .single() as unknown as Promise<{ data: { version: number } | null; error: { message: string } | null }>);

    if (fetchErr || !currentRows) {
      toast.error(`Force save failed: ${fetchErr?.message || "Record not found"}`);
      return false;
    }

    const serverVersion = currentRows.version;
    const newVersion = serverVersion + 1;

    // H3 Fix: Strict version lock — .eq('version', serverVersion) ensures no concurrent
    // force-save can overwrite silently. If version changed between our read and write,
    // zero rows will be updated and we surface a conflict.
    const { data: rows, error } = await (supabase
      .from(table as "cases")
      .update({ ...data, version: newVersion } as never)
      .eq(idColumn as "id", id as never)
      .eq("version" as never, serverVersion as never)
      .select("version") as unknown as Promise<{ data: Array<{ version: number }> | null; error: { message: string } | null }>);

    if (error) {
      toast.error(`Force save failed: ${error.message}`);
      return false;
    }

    // H3 Fix: If no rows updated, another write landed between our read and write
    if (!rows || rows.length === 0) {
      toast.error("Conflict detected: another change was saved while force-saving. Please reload and try again.");
      setConflictState({ isConflict: true, pendingOptions: opts });
      onConflict?.();
      return false;
    }

    setConflictState({ isConflict: false, pendingOptions: null });
    onSuccess?.(rows[0].version);
    toast.success("Changes saved (force override).");
    return true;
  }, []);

  const dismissConflict = useCallback(() => {
    setConflictState({ isConflict: false, pendingOptions: null });
  }, []);

  return { save, forceSave, conflictState, dismissConflict };
}

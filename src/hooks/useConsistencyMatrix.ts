/**
 * useConsistencyMatrix
 *
 * Derives the LSAG A–E Consistency Matrix view-model for a given case by
 * re-running the deterministic Armalytix pipeline (`runFullAnalysis`) over
 * already-persisted `sow_*` rows. Pure presentation-layer hook — no writes,
 * no edge-function call, no schema dependency beyond what `useSoWSubmit`
 * already reads.
 *
 * Returns `{ enabled: false }` for cases without Armalytix structured data
 * so the consumer can hide the matrix card entirely on non-Armalytix cases.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExceptionItem } from "@/lib/armalytix/exceptionEngine";
import type { DraftEnquiry } from "@/lib/armalytix/enquiryGenerator";
import type { CheckExecutionRecord } from "@/lib/armalytix/checkStatus";

export interface ConsistencyMatrixData {
  enabled: boolean;
  exceptions: ExceptionItem[];
  draftEnquiries: DraftEnquiry[];
  pendingChecks: CheckExecutionRecord[];
}

const EMPTY: ConsistencyMatrixData = {
  enabled: false,
  exceptions: [],
  draftEnquiries: [],
  pendingChecks: [],
};

export function useConsistencyMatrix(caseId: string | null | undefined) {
  return useQuery<ConsistencyMatrixData>({
    queryKey: ["consistency-matrix", caseId ?? null],
    enabled: !!caseId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      if (!caseId) return EMPTY;

      // Dynamically import so this code is not in the synchronous workspace bundle.
      const { shouldActivateArmalytixModule, fetchStructuredArmalytixData, buildAnalysisInputs } =
        await import("@/lib/armalytix/promptModule");

      const enabled = await shouldActivateArmalytixModule(caseId, supabase);
      if (!enabled) return EMPTY;

      const structured = await fetchStructuredArmalytixData(caseId, supabase);
      const { deriveBlockedChecks } = await import("@/lib/armalytix/pendingChecks");
      const pendingChecks = deriveBlockedChecks(structured);

      if (
        (structured.fundSources?.length ?? 0) === 0 &&
        (structured.transactions?.length ?? 0) === 0
      ) {
        // Armalytix row exists but no structured rows yet — treat as enabled-but-empty.
        return { enabled: true, exceptions: [], draftEnquiries: [], pendingChecks };
      }

      const { runFullAnalysis } = await import("@/lib/armalytix/contradictionDetector");
      const inputs = buildAnalysisInputs(structured);
      // `buildAnalysisInputs` returns a loosely-typed shape that matches the engine
      // contract at runtime (same call site as `useSoWSubmit`). Cast at the boundary.
      const result = runFullAnalysis(inputs as unknown as Parameters<typeof runFullAnalysis>[0]);

      return {
        enabled: true,
        exceptions: result.exceptions ?? [],
        draftEnquiries: result.draftEnquiries ?? [],
        pendingChecks,
      };
    },
  });
}

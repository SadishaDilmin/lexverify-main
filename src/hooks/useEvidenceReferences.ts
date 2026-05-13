import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EvidenceReference } from "@/components/evidence/types";

export function useEvidenceReferences(aiReportId: string | undefined) {
  return useQuery({
    queryKey: ["evidence_references", aiReportId],
    enabled: !!aiReportId,
    queryFn: async (): Promise<EvidenceReference[]> => {
      const { data, error } = await supabase
        .from("evidence_references")
        .select("*")
        .eq("ai_report_id", aiReportId!)
        .order("section_heading")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as EvidenceReference[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Group evidence references by section heading */
export function groupBySection(refs: EvidenceReference[]): Map<string, EvidenceReference[]> {
  const map = new Map<string, EvidenceReference[]>();
  for (const ref of refs) {
    const key = ref.section_heading.toLowerCase().trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ref);
  }
  return map;
}

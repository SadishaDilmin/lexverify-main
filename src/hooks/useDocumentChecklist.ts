import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChecklistItem {
  id: string;
  doc_name: string;
  doc_slot_id: string;
  agent_type: string;
  transaction_type: string;
  tenure: string;
  required: boolean;
  reason: string;
  sort_order: number;
  is_active: boolean;
}

export function useDocumentChecklist(
  agentType: string,
  tenure?: string,
  transactionType?: string
) {
  return useQuery({
    queryKey: ["document-checklists", agentType, tenure, transactionType],
    queryFn: async () => {
      let query = supabase
        .from("document_checklists" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      // Filter by agent type: match exact or 'all'
      query = query.or(`agent_type.eq.${agentType},agent_type.eq.all`);

      const { data, error } = await query;
      if (error) throw error;

      let items = (data || []) as unknown as ChecklistItem[];

      // Client-side filter for tenure
      if (tenure && tenure !== "Unknown") {
        items = items.filter(
          (i) => i.tenure === "all" || i.tenure === tenure
        );
      }

      // Client-side filter for transaction type
      if (transactionType) {
        items = items.filter(
          (i) => i.transaction_type === "all" || i.transaction_type === transactionType
        );
      }

      return items;
    },
    staleTime: 60_000,
  });
}

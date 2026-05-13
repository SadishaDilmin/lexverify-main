import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserCredits {
  balance: number;
  is_free_trial: boolean;
  trial_credits_granted: number;
}

export function useCredits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-credits", user?.id],
    queryFn: async (): Promise<UserCredits | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_credits")
        .select("balance, is_free_trial, trial_credits_granted")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

/**
 * Estimate credits needed for a case based on complexity factors.
 * Base: 5 credits. Leasehold +3, New Build +4, BSA +2, Auction +2.
 */
export function estimateCaseCredits(factors: string[] = []): number {
  let credits = 5;
  const modifiers: Record<string, number> = {
    leasehold: 3,
    "new-build": 4,
    bsa: 2,
    auction: 2,
  };
  for (const f of factors) {
    credits += modifiers[f] ?? 0;
  }
  return credits;
}

/**
 * Calculate extra credits for document uploads beyond the 15-doc threshold.
 * First 15 documents are free. Every 10 documents (or part thereof) after that costs 2 credits.
 */
export function estimateDocumentCredits(docCount: number): number {
  if (docCount <= 15) return 0;
  const excess = docCount - 15;
  const blocks = Math.ceil(excess / 10);
  return blocks * 2;
}

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface HoowlaMappedData {
  case_reference: string;
  property_address: string;
  transaction_type: string;
  tenure: string;
  property_type: string;
  lender: string | null;
  seller_conveyancer_email: string | null;
  purchase_price: number | null;
  stamp_duty: number | null;
  legal_fees: number | null;
  hoowla_matter_id: string;
  parties: { role: string; full_name: string; email: string | null }[];
  warnings?: string[];
  case_flags?: string[];
  selected_add_ons?: string[];
  // Raw data passed through for LLM validation
  _raw_contributors?: any[];
  _raw_case_name?: string;
  _raw_case_type_name?: string;
}

export interface HoowlaValidationResult {
  validated: HoowlaMappedData;
  corrections: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

/**
 * Check if the current user's firm has an active CMS integration.
 */
export function useFirmHasCMS() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["cms_integration_check", profile?.email, profile?.firm_name],
    queryFn: async () => {
      if (!profile?.email && !profile?.firm_name) return false;

      const { data, error } = await supabase.functions.invoke("check-cms-integration", {
        body: { provider: "hoowla" },
      });

      if (error || data?.error) return false;
      return Boolean(data?.hasIntegration);
    },
    enabled: !!profile?.email || !!profile?.firm_name,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to sync case data from Hoowla given a matter ID.
 */
export function useHoowlaSync() {
  const [syncing, setSyncing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncMatter = async (matterId: string): Promise<HoowlaMappedData | null> => {
    setSyncing(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("sync-hoowla", {
        body: { matter_id: matterId },
      });

      if (fnErr) {
        setError(fnErr.message || "Failed to sync from Hoowla");
        return null;
      }

      if (data?.error) {
        setError(data.error);
        return null;
      }

      return data?.data ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      return null;
    } finally {
      setSyncing(false);
    }
  };

  const validateMatter = async (mappedData: HoowlaMappedData): Promise<HoowlaValidationResult | null> => {
    setValidating(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("validate-hoowla", {
        body: { mappedData },
      });

      if (fnErr) {
        console.error("Validation function error:", fnErr);
        // Non-fatal: return null so we fall back to unvalidated data
        return null;
      }

      if (data?.error) {
        console.error("Validation error:", data.error);
        return null;
      }

      return data as HoowlaValidationResult;
    } catch (e) {
      console.error("Validation error:", e);
      return null;
    } finally {
      setValidating(false);
    }
  };

  const generateAgentContext = async (caseData: {
    case_reference?: string;
    property_address?: string;
    transaction_type?: string;
    tenure?: string;
    property_type?: string;
    lender?: string | null;
    seller_conveyancer_email?: string | null;
    purchase_price?: number | null;
    stamp_duty?: number | null;
    legal_fees?: number | null;
    case_flags?: string[];
    selected_add_ons?: string[];
    parties?: { role: string; full_name: string; email: string | null; buyer_type?: string; pep_status?: string }[];
    warnings?: string[];
  }): Promise<Record<string, string> | null> => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("generate-agent-context", {
        body: { caseData },
      });

      if (fnErr) {
        console.error("Agent context generation error:", fnErr);
        return null;
      }

      if (data?.error) {
        console.error("Agent context generation error:", data.error);
        return null;
      }

      return data?.contexts ?? null;
    } catch (e) {
      console.error("Agent context generation error:", e);
      return null;
    }
  };

  const syncMessages = async (matterId: string, caseId: string): Promise<{ synced: number; skipped: number; failed: number; total: number } | null> => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("sync-hoowla-messages", {
        body: { matter_id: matterId, case_id: caseId },
      });

      if (fnErr) {
        console.error("Message sync error:", fnErr);
        return null;
      }

      if (data?.error) {
        console.error("Message sync error:", data.error);
        return null;
      }

      return data ?? null;
    } catch (e) {
      console.error("Message sync error:", e);
      return null;
    }
  };

  return { syncMatter, validateMatter, generateAgentContext, syncMessages, syncing, validating, error, clearError: () => setError(null) };
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────
export interface CaseSummary {
  id: string;
  case_reference: string;
  property_address: string;
  tenure: string;
  transaction_type: string;
  lender: string | null;
  property_type: string;
  purchase_price?: number | null;
  stamp_duty?: number | null;
  legal_fees?: number | null;
  // PHASE 3: SDLT precedence resolution requires both the form value and
  // Hoowla value at analysis time. The banner uses these to decide whether
  // to surface the missing-evidence prompt.
  sdlt_form_value?: number | null;
  sdlt_form_additional_property_surcharge?: boolean | null;
  sdlt_form_non_uk_resident_surcharge?: boolean | null;
  sdlt_form_first_time_buyer_relief?: boolean | null;
  hoowla_last_sync_at?: string | null;
  ai_context_notes?: Record<string, string> | null;
}

export type PartyRole = "purchaser" | "seller" | "giftor";
export type PepStatus = "unknown" | "not_pep" | "pep" | "pep_family" | "pep_associate";

export interface CaseParty {
  id: string;
  case_id: string;
  role: PartyRole;
  full_name: string;
  email: string | null;
  pep_status: PepStatus;
  relationship_to_purchaser: string | null;
  notes: string | null;
  raise_enquiry_funding: boolean;
  raise_enquiry_employment: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrefillData {
  // From profile
  fullName: string;
  email: string;
  position: string;
  firmName: string;

  // From selected case
  propertyAddress: string;
  caseReference: string;
  tenure: string;
  transactionType: string;
  lender: string;
  propertyType: string;
  purchasePrice: string;
  stampDuty: string;
  legalFees: string;

  // PHASE 3 SDLT precedence: form > Hoowla > absent.
  // resolvedSdlt is the figure to use in funding-gap reasoning. sdltSource
  // names which source provided it. sdltMissing is true iff both sources are
  // null (drives the inline banner at analysis time). sdltDivergence is true
  // iff both sources are populated AND values differ.
  sdltFormValue: number | null;
  sdltHoowlaValue: number | null;
  resolvedSdlt: number | null;
  sdltSource: "form" | "cms" | "absent";
  sdltMissing: boolean;
  sdltDivergence: boolean;
  hoowlaLastSyncAt: string | null;

  // AI-generated context notes per agent
  aiContextNotes: Record<string, string> | null;

  // From selected case parties
  purchasers: CaseParty[];
  sellers: CaseParty[];
  giftors: CaseParty[];
}

/**
 * Hook that provides:
 * - User profile data for auto-injection
 * - List of user's open cases for a "Link to Case" selector
 * - Pre-filled data based on selected case + profile
 * - Auto-selects case if `caseId` URL param is present
 */
export function useAgentPrefill() {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [loadingCases, setLoadingCases] = useState(true);

  const [caseParties, setCaseParties] = useState<CaseParty[]>([]);
  const [loadingParties, setLoadingParties] = useState(false);

  // Fetch user's cases
  useEffect(() => {
    if (!user?.id) {
      setLoadingCases(false);
      return;
    }

    const fetchCases = async () => {
      setLoadingCases(true);
      const { data } = await supabase
        .from("cases")
        .select(
          "id, case_reference, property_address, tenure, transaction_type, lender, property_type, purchase_price, stamp_duty, legal_fees, ai_context_notes, sdlt_form_value, sdlt_form_additional_property_surcharge, sdlt_form_non_uk_resident_surcharge, sdlt_form_first_time_buyer_relief, hoowla_last_sync_at"
        )
        .eq("conveyancer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      setCases((data as CaseSummary[]) ?? []);
      setLoadingCases(false);
    };

    fetchCases();
  }, [user?.id]);

  // Auto-select case from URL param (e.g. returning from case creation)
  const caseLinkedToastShown = useRef(false);
  useEffect(() => {
    const caseId = searchParams.get("caseId");
    if (caseId && cases.length > 0) {
      const match = cases.find((c) => c.id === caseId);
      if (match) {
        setSelectedCaseId(caseId);
        // Show confirmation toast once when returning from case creation
        if (!caseLinkedToastShown.current) {
          caseLinkedToastShown.current = true;
          // Dynamically import toast to avoid adding it as a hook dependency
          import("@/hooks/use-toast").then(({ toast }) => {
            toast({
              title: "Case linked successfully",
              description: `${match.case_reference} — ${match.property_address}`,
            });
          });
        }
      }
    }
  }, [searchParams, cases]);

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) ?? null,
    [cases, selectedCaseId]
  );

  // Fetch parties for selected case
  useEffect(() => {
    const fetchParties = async () => {
      if (!selectedCaseId || !user?.id) {
        setCaseParties([]);
        return;
      }

      setLoadingParties(true);
      const { data, error } = await supabase
        .from("case_parties" as any)
        .select("*")
        .eq("case_id", selectedCaseId)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("Failed to fetch case parties", error);
        setCaseParties([]);
      } else {
        setCaseParties((Array.isArray(data) ? (data as unknown as CaseParty[]) : []) ?? []);
      }
      setLoadingParties(false);
    };

    fetchParties();
  }, [selectedCaseId, user?.id]);

  const purchasers = useMemo(
    () => caseParties.filter((p) => p.role === "purchaser"),
    [caseParties]
  );
  const sellers = useMemo(
    () => caseParties.filter((p) => p.role === "seller"),
    [caseParties]
  );
  const giftors = useMemo(
    () => caseParties.filter((p) => p.role === "giftor"),
    [caseParties]
  );

  const toMoneyString = (v?: number | null) => (v == null ? "" : String(v));

  const prefillData: PrefillData = useMemo(
    () => {
      // PHASE 3 SDLT precedence resolution: form > Hoowla > absent.
      const sdltFormValue =
        selectedCase?.sdlt_form_value != null ? Number(selectedCase.sdlt_form_value) : null;
      const sdltHoowlaValue =
        selectedCase?.stamp_duty != null ? Number(selectedCase.stamp_duty) : null;
      let resolvedSdlt: number | null = null;
      let sdltSource: "form" | "cms" | "absent" = "absent";
      if (sdltFormValue != null) {
        resolvedSdlt = sdltFormValue;
        sdltSource = "form";
      } else if (sdltHoowlaValue != null) {
        resolvedSdlt = sdltHoowlaValue;
        sdltSource = "cms";
      }
      const sdltMissing = sdltFormValue == null && sdltHoowlaValue == null;
      const sdltDivergence =
        sdltFormValue != null && sdltHoowlaValue != null && sdltFormValue !== sdltHoowlaValue;

      return {
        fullName: profile?.full_name ?? "",
        email: profile?.email ?? "",
        position: profile?.position ?? "",
        firmName: profile?.firm_name ?? "",

        propertyAddress: selectedCase?.property_address ?? "",
        caseReference: selectedCase?.case_reference ?? "",
        tenure: selectedCase?.tenure ?? "",
        transactionType: selectedCase?.transaction_type ?? "",
        lender: selectedCase?.lender ?? "",
        propertyType: selectedCase?.property_type ?? "",
        purchasePrice: toMoneyString(selectedCase?.purchase_price),
        stampDuty: toMoneyString(resolvedSdlt),
        legalFees: toMoneyString(selectedCase?.legal_fees),

        sdltFormValue,
        sdltHoowlaValue,
        resolvedSdlt,
        sdltSource,
        sdltMissing,
        sdltDivergence,
        hoowlaLastSyncAt: selectedCase?.hoowla_last_sync_at ?? null,

        aiContextNotes: (selectedCase?.ai_context_notes as Record<string, string>) ?? null,

        purchasers,
        sellers,
        giftors,
      };
    },
    [profile, selectedCase, purchasers, sellers, giftors]
  );

  return {
    cases,
    selectedCaseId,
    setSelectedCaseId,
    selectedCase,
    prefillData,
    loadingCases,
    loadingParties,
    caseParties,
    profile,
  };
}

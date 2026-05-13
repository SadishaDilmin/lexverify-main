import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, AlertTriangle, Coins, Plus, Trash2, UserPlus, Users, Building2, PoundSterling, XCircle, Download, CloudDownload, Sparkles } from "lucide-react";
import { useFormDraft } from "@/hooks/useFormDraft";
import InfoTooltip from "@/components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatAddress } from "@/lib/formatAddress";
import { createCaseFolderSkeleton } from "@/lib/caseFolders";
// SDLT calculator removed: stamp duty is sourced from Hoowla (cases.stamp_duty)
// or, in PHASE 3, from a manual SDLT form. Buyer-type below is preserved as an
// AML risk signal only — it no longer drives any computation.
import {
  COMPLEXITY_MODIFIERS,
  ADD_ON_DOCUMENTS,
  creditsPerAgent,
  hasAIBlockingFactor,
  CREDIT_PRICE_GBP,
} from "@/data/creditPricing";
import { useFirmHasCMS, useHoowlaSync, HoowlaValidationResult } from "@/hooks/useCMSIntegration";
import CMSRequestCard from "@/components/CMSRequestCard";
import { parsePurchasePrice, sanitisePurchasePriceInput } from "@/lib/validation";

// ── Party types ───────────────────────────────────────────────────────
// Buyer type values are preserved as AML risk signals (additional-property
// holdings, non-UK residency, corporate purchaser etc.) — not as inputs to any
// SDLT calculation. The platform no longer computes SDLT.
type BuyerType =
  | "standard"
  | "first_time_buyer"
  | "additional_dwelling"
  | "non_uk_resident"
  | "company";

const BUYER_TYPE_OPTIONS: { value: BuyerType; label: string }[] = [
  { value: "standard", label: "Standard Residential" },
  { value: "first_time_buyer", label: "First-Time Buyer" },
  { value: "additional_dwelling", label: "Additional Dwelling" },
  { value: "non_uk_resident", label: "Non-UK Resident" },
  { value: "company", label: "Company Purchase" },
];

interface PartyEntry {
  id: string;
  fullName: string;
  email: string;
  pepStatus: string;
  buyerType: BuyerType;
  relationshipToPurchaser: string;
  notes: string;
}

const emptyParty = (role: string): PartyEntry => ({
  id: crypto.randomUUID(),
  fullName: "",
  email: "",
  pepStatus: "unknown",
  buyerType: "standard",
  relationshipToPurchaser: role === "giftor" ? "" : "",
  notes: "",
});

// ── Party row (extracted to avoid re-mount on parent render) ──────────
const PartyRow = ({
  party,
  list,
  setList,
  role,
  showRelationship = false,
  showBuyerType = false,
  onUpdate,
  onRemove,
}: {
  party: PartyEntry;
  list: PartyEntry[];
  setList: React.Dispatch<React.SetStateAction<PartyEntry[]>>;
  role: string;
  showRelationship?: boolean;
  showBuyerType?: boolean;
  onUpdate: (setList: React.Dispatch<React.SetStateAction<PartyEntry[]>>, id: string, field: keyof PartyEntry, value: string) => void;
  onRemove: (list: PartyEntry[], setList: React.Dispatch<React.SetStateAction<PartyEntry[]>>, id: string) => void;
}) => (
  <div className="rounded-lg border border-border p-3 space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Full Name *</Label>
        <Input
          placeholder="Full legal name"
          value={party.fullName}
          onChange={(e) => onUpdate(setList, party.id, "fullName", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          placeholder="Optional"
          value={party.email}
          onChange={(e) => onUpdate(setList, party.id, "email", e.target.value)}
        />
      </div>
    </div>
    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3`}>
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          PEP Status
          <InfoTooltip title="Politically Exposed Person">
            <p>A PEP is someone who holds or has held a prominent public function (e.g. MP, senior civil servant, judge). Family members and close associates of PEPs are also flagged.</p>
            <p className="mt-1">Identifying PEPs is a legal requirement under the Money Laundering Regulations 2017.</p>
          </InfoTooltip>
        </Label>
        <Select
          value={party.pepStatus}
          onValueChange={(v) => onUpdate(setList, party.id, "pepStatus", v)}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unknown">Unknown</SelectItem>
            <SelectItem value="not_pep">Not a PEP</SelectItem>
            <SelectItem value="pep">PEP</SelectItem>
            <SelectItem value="pep_family">PEP Family Member</SelectItem>
            <SelectItem value="pep_associate">PEP Close Associate</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showBuyerType && (
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            Buyer Status (AML)
            <InfoTooltip title="Buyer Status — AML signal">
              <p>Captured for AML risk profiling only — this no longer drives any SDLT calculation in Olimey AI. SDLT figures come from the firm's CMS or are entered separately.</p>
              <p className="mt-1"><strong>First-Time Buyer</strong> · <strong>Additional Dwelling</strong> (signals existing property holdings) · <strong>Non-UK Resident</strong> (jurisdictional risk) · <strong>Company</strong> (corporate purchaser).</p>
            </InfoTooltip>
          </Label>
          <Select
            value={party.buyerType}
            onValueChange={(v) => onUpdate(setList, party.id, "buyerType", v)}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUYER_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {showRelationship && (
        <div className="space-y-1">
          <Label className="text-xs">Relationship to Purchaser</Label>
          <Input
            placeholder="e.g. Parent, Spouse"
            value={party.relationshipToPurchaser}
            onChange={(e) => onUpdate(setList, party.id, "relationshipToPurchaser", e.target.value)}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Input
          placeholder="Optional notes"
          value={party.notes}
          onChange={(e) => onUpdate(setList, party.id, "notes", e.target.value)}
        />
      </div>
    </div>
    {list.length > 1 && (
      <button
        type="button"
        onClick={() => onRemove(list, setList, party.id)}
        className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
      >
        <Trash2 size={12} /> Remove
      </button>
    )}
  </div>
);

const STEPS = [
  { label: "Property", icon: Building2, desc: "Case & property details" },
  { label: "Parties", icon: Users, desc: "Purchasers, sellers & giftors" },
  { label: "Financials", icon: PoundSterling, desc: "Price, stamp duty & fees" },
  { label: "Attributes", icon: Coins, desc: "Complexity & credit estimate" },
];

const CaseNew = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const duplicateId = searchParams.get("duplicate");
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  // ── CMS Integration (Hoowla) ───────────────────────────────────────
  const { data: hasCMS } = useFirmHasCMS();
  const { syncMatter, validateMatter, generateAgentContext, syncing: hoowlaSyncing, validating: hoowlaValidating, error: hoowlaError, clearError: clearHoowlaError } = useHoowlaSync();
  const [hoowlaMatterId, setHoowlaMatterId] = useState("");
  const [hoowlaImported, setHoowlaImported] = useState(false);
  const [hoowlaWarnings, setHoowlaWarnings] = useState<string[]>([]);
  // PHASE 3: Hoowla's SDLT figure persists to cases.stamp_duty (Hoowla-only
  // source per the precedence rule — form > Hoowla > absent). Captured at sync
  // time and written at case insert.
  const [hoowlaStampDuty, setHoowlaStampDuty] = useState<number | null>(null);
  const [hoowlaCorrections, setHoowlaCorrections] = useState<string[]>([]);
  const [hoowlaValidationConfidence, setHoowlaValidationConfidence] = useState<string | null>(null);
  const [agentContextNotes, setAgentContextNotes] = useState<Record<string, string> | null>(null);

  const handleHoowlaImport = async () => {
    if (!hoowlaMatterId.trim()) return;
    const rawResult = await syncMatter(hoowlaMatterId.trim());
    if (!rawResult) return;

    // Run LLM validation on the raw result
    let result = rawResult;
    const validation = await validateMatter(rawResult);
    if (validation) {
      result = validation.validated;
      setHoowlaCorrections(validation.corrections);
      setHoowlaValidationConfidence(validation.confidence);
    } else {
      setHoowlaCorrections([]);
      setHoowlaValidationConfidence(null);
    }

    // Populate form fields from (validated) data
    setCaseRef(result.case_reference || caseRef);
    setPropertyAddress(result.property_address || propertyAddress);
    setTransactionType(result.transaction_type || transactionType);
    if (result.tenure && result.tenure !== "Unknown") setTenure(result.tenure);
    if (result.property_type && result.property_type !== "Unknown") setPropertyType(result.property_type);
    setSellerEmail(result.seller_conveyancer_email || sellerEmail);
    setLender(result.lender || lender);

    if (result.purchase_price != null) {
      // Defensive guard: if the server ever returns an out-of-bounds value
      // (e.g. a future Hoowla schema drift), don't populate the field — leave
      // it blank so the user enters it manually rather than displaying a
      // wrong-but-plausible number they have to notice and override.
      const priceCheck = parsePurchasePrice(String(result.purchase_price));
      if (priceCheck.error === null && priceCheck.value !== null) {
        setPurchasePrice(String(result.purchase_price));
      } else {
        console.warn(
          `Hoowla purchase_price ${result.purchase_price} rejected by client validator: ${priceCheck.error}`
        );
      }
    }
    // PHASE 3 precedence rule: Hoowla's SDLT figure (when present) is captured
    // here and written to cases.stamp_duty at case insert. The form's manual
    // SDLT field (sdltFormValue) is intentionally NOT populated from Hoowla —
    // it is the conveyancer's manual entry and takes precedence over CMS.
    if (result.stamp_duty != null) {
      const n = Number(result.stamp_duty);
      if (Number.isFinite(n)) setHoowlaStampDuty(n);
    }
    if (result.legal_fees != null) setLegalFees(String(result.legal_fees));

    // Populate parties
    const importedPurchasers = result.parties
      .filter((p) => p.role === "purchaser")
      .map((p) => ({ ...emptyParty("purchaser"), fullName: p.full_name, email: p.email || "" }));
    const importedSellers = result.parties
      .filter((p) => p.role === "seller")
      .map((p) => ({ ...emptyParty("seller"), fullName: p.full_name, email: p.email || "" }));

    if (importedPurchasers.length > 0) setPurchasers(importedPurchasers);
    if (importedSellers.length > 0) setSellers(importedSellers);

    // Populate case attributes (complexity flags)
    if (result.case_flags && Array.isArray(result.case_flags) && result.case_flags.length > 0) {
      setCaseFlags(result.case_flags);
      setHoowlaDetectedFlags(new Set(result.case_flags));
    }
    if (result.selected_add_ons && Array.isArray(result.selected_add_ons) && result.selected_add_ons.length > 0) {
      setSelectedAddOns(result.selected_add_ons);
      setHoowlaDetectedAddOns(new Set(result.selected_add_ons));
    }

    // Show any data quality warnings
    setHoowlaWarnings(result.warnings || []);

    setHoowlaImported(true);
    
    const correctionCount = validation?.corrections?.length || 0;
    const desc = correctionCount > 0
      ? `Matter ${hoowlaMatterId} synced. AI made ${correctionCount} correction(s) — review highlighted changes.`
      : `Matter ${hoowlaMatterId} synced and validated by AI.`;
    toast({ title: "Case data imported from Hoowla", description: desc });

    // Fire-and-forget: generate AI context notes for each agent
    generateAgentContext({
      case_reference: result.case_reference,
      property_address: result.property_address,
      transaction_type: result.transaction_type,
      tenure: result.tenure,
      property_type: result.property_type,
      lender: result.lender,
      seller_conveyancer_email: result.seller_conveyancer_email,
      purchase_price: result.purchase_price,
      stamp_duty: result.stamp_duty,
      legal_fees: result.legal_fees,
      case_flags: result.case_flags,
      selected_add_ons: result.selected_add_ons,
      parties: result.parties?.map((p) => ({ ...p, buyer_type: undefined, pep_status: undefined })),
      warnings: result.warnings,
    }).then((contexts) => {
      if (contexts) {
        setAgentContextNotes(contexts);
        toast({ title: "AI context notes generated", description: "Agent-specific notes have been prepared from Hoowla data." });
      }
    });
  };

  // ── Duplicate case pre-fill (H4: ownership validation) ──────────────
  useEffect(() => {
    if (!duplicateId || !user) return;
    supabase
      .from("cases")
      .select("case_reference, property_address, transaction_type, tenure, property_type, seller_conveyancer_email, lender, purchase_price, legal_fees, case_flags, conveyancer_id")
      .eq("id", duplicateId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast({ title: "Case not found or access denied", description: "The case you are trying to duplicate could not be found.", variant: "destructive" });
          return;
        }

        // H4: Verify ownership — case must belong to current user or same firm
        const caseOwnerId = (data as any).conveyancer_id;
        const isSameUser = caseOwnerId === user.id;
        const isSameFirm = profile?.firm_name && profile.firm_name.length > 0;

        if (!isSameUser && !isSameFirm) {
          toast({ title: "Case not found or access denied", description: "You do not have permission to duplicate this case.", variant: "destructive" });
          return;
        }

        setCaseRef(`${(data as any).case_reference}-COPY`);
        setPropertyAddress((data as any).property_address || "");
        setTransactionType((data as any).transaction_type || "Purchase");
        setTenure((data as any).tenure || "Freehold");
        setPropertyType((data as any).property_type || "House");
        setSellerEmail((data as any).seller_conveyancer_email || "");
        setLender((data as any).lender || "");
        if ((data as any).purchase_price) setPurchasePrice(String((data as any).purchase_price));
        if ((data as any).legal_fees) setLegalFees(String((data as any).legal_fees));
        const flags = (data as any).case_flags || [];
        setCaseFlags(flags.filter((f: string) => !f.startsWith("addon:")));
        setSelectedAddOns(flags.filter((f: string) => f.startsWith("addon:")).map((f: string) => f.replace("addon:", "")));
        toast({ title: "Case duplicated", description: "Fields pre-filled from the original case. Update the reference before saving." });
      });
  }, [duplicateId, user]);

  const [draft, updateDraft, clearDraft] = useFormDraft("case-new", {
    caseRef: "", propertyAddress: "", transactionType: "Purchase",
    tenure: "Freehold", propertyType: "House", sellerEmail: "", lender: "",
    purchasePrice: "", legalFees: "", step: 0,
  });

  // ── Step 1: Property ────────────────────────────────────────────────
  const [caseRef, setCaseRef] = useState(draft.caseRef as string);
  const [propertyAddress, setPropertyAddress] = useState(draft.propertyAddress as string);
  const [transactionType, setTransactionType] = useState(draft.transactionType as string);
  const [tenure, setTenure] = useState(draft.tenure as string);
  const [propertyType, setPropertyType] = useState(draft.propertyType as string);
  const [sellerEmail, setSellerEmail] = useState(draft.sellerEmail as string);
  const [lender, setLender] = useState(draft.lender as string);

  // ── Step 2: Parties ─────────────────────────────────────────────────
  const [purchasers, setPurchasers] = useState<PartyEntry[]>([emptyParty("purchaser")]);
  const [sellers, setSellers] = useState<PartyEntry[]>([emptyParty("seller")]);
  const [giftors, setGiftors] = useState<PartyEntry[]>([]);
  const [hasGiftors, setHasGiftors] = useState(false);

  // ── Step 3: Financials ──────────────────────────────────────────────
  // `sdltFormValue` is the conveyancer's manual SDLT entry. It writes to
  // cases.sdlt_form_value (NOT cases.stamp_duty, which is now Hoowla-only per
  // the PHASE 3 precedence rule: form > Hoowla > absent).
  const [purchasePrice, setPurchasePrice] = useState(draft.purchasePrice as string);
  const [sdltFormValue, setSdltFormValue] = useState("");
  const [legalFees, setLegalFees] = useState(draft.legalFees as string);
  // Tri-state surcharge flags: "unspecified" = NULL, "yes" = true, "no" = false.
  // AML signals only — they do not feed any SDLT computation. "unspecified" is
  // the explicit default per the approved design (3.d) — NULL means
  // "AML signal not asserted by conveyancer".
  type TriState = "unspecified" | "yes" | "no";
  const [sdltAddlProperty, setSdltAddlProperty] = useState<TriState>("unspecified");
  const [sdltNonUkResident, setSdltNonUkResident] = useState<TriState>("unspecified");
  const [sdltFirstTimeBuyer, setSdltFirstTimeBuyer] = useState<TriState>("unspecified");

  // Sync form fields to draft (after all state declared)
  useEffect(() => {
    updateDraft({ caseRef, propertyAddress, transactionType, tenure, propertyType, sellerEmail, lender, purchasePrice, legalFees, step });
  }, [caseRef, propertyAddress, transactionType, tenure, propertyType, sellerEmail, lender, purchasePrice, legalFees, step]);

  // ── SDLT computation removed (Path 2) ──────────────────────────────
  // The platform no longer computes SDLT. cases.stamp_duty is sourced from
  // Hoowla via sync-hoowla, or from manual entry in the form below. The
  // buyer-type Select on each PartyRow is preserved as an AML risk signal
  // only and no longer feeds any computation.

  // Canonical parsed purchase price — single source of truth for summary and submit.
  // Future edits: read priceParse.value, never parseFloat(purchasePrice) directly.
  const priceParse = useMemo(() => parsePurchasePrice(purchasePrice), [purchasePrice]);

  const handlePurchasePriceChange = (rawValue: string) => {
    const sanitised = sanitisePurchasePriceInput(rawValue);
    setPurchasePrice(sanitised);
  };

  const handlePurchasePriceBlur = () => {
    // On blur, normalise the visible string to the canonical formatted form.
    if (priceParse.value !== null && !priceParse.error) {
      setPurchasePrice(priceParse.formatted);
    }
  };

  // ── Step 4: Attributes ──────────────────────────────────────────────
  const [caseFlags, setCaseFlags] = useState<string[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [hoowlaDetectedFlags, setHoowlaDetectedFlags] = useState<Set<string>>(new Set());
  const [hoowlaDetectedAddOns, setHoowlaDetectedAddOns] = useState<Set<string>>(new Set());

  // ── Derived state ───────────────────────────────────────────────────
  const canProceedStep0 = caseRef.trim() !== "" && propertyAddress.trim() !== "";
  const canProceedStep1 = purchasers.some((p) => p.fullName.trim() !== "");
  const priceValid = !priceParse.error;
  const canSubmit = canProceedStep0 && canProceedStep1 && priceValid;
  const aiBlocked = hasAIBlockingFactor(caseFlags);

  const effectiveFlags = useMemo(() => {
    const flags = [...caseFlags];
    if ((tenure === "Leasehold" || tenure === "Commonhold") && !flags.includes("leasehold")) {
      flags.push("leasehold");
    }
    if (tenure !== "Leasehold" && tenure !== "Commonhold") {
      const idx = flags.indexOf("leasehold");
      if (idx !== -1) flags.splice(idx, 1);
    }
    return flags;
  }, [caseFlags, tenure]);

  const estimatedCredits = creditsPerAgent(effectiveFlags, selectedAddOns);
  const isLeasehold = tenure === "Leasehold" || tenure === "Commonhold";
  const availableAddOns = ADD_ON_DOCUMENTS.filter((a) => !a.leaseholdOnly || isLeasehold);
  const manualModifiers = COMPLEXITY_MODIFIERS.filter((m) => m.id !== "leasehold");

  const toggleAddOn = (id: string) => setSelectedAddOns((p) => p.includes(id) ? p.filter((a) => a !== id) : [...p, id]);
  const toggleFlag = (id: string) => setCaseFlags((p) => p.includes(id) ? p.filter((f) => f !== id) : [...p, id]);

  // ── Validation errors (shown when user attempts to proceed) ─────────
  const [showErrors, setShowErrors] = useState(false);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!caseRef.trim()) errors.push("Case Reference is required");
    if (!propertyAddress.trim()) errors.push("Property Address is required");
    if (!purchasers.some((p) => p.fullName.trim())) errors.push("At least one purchaser name is required");
    return errors;
  }, [caseRef, propertyAddress, purchasers]);

  // ── Party helpers ───────────────────────────────────────────────────
  const updateParty = useCallback(
    (setList: React.Dispatch<React.SetStateAction<PartyEntry[]>>, id: string, field: keyof PartyEntry, value: string) => {
      setList((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    },
    []
  );

  const addParty = (setList: React.Dispatch<React.SetStateAction<PartyEntry[]>>, role: string) => {
    setList((prev) => [...prev, emptyParty(role)]);
  };

  const removeParty = (list: PartyEntry[], setList: React.Dispatch<React.SetStateAction<PartyEntry[]>>, id: string) => {
    if (list.length <= 1) return;
    setList(list.filter((p) => p.id !== id));
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const handleCreateCase = async () => {
    if (!user || !profile || !canSubmit) return;
    setSaving(true);

    const priceNum = priceParse.value;
    const sdltFormNum = sdltFormValue ? parseFloat(sdltFormValue) : null;
    const feesNum = legalFees ? parseFloat(legalFees) : null;
    const triToBool = (v: "unspecified" | "yes" | "no"): boolean | null =>
      v === "yes" ? true : v === "no" ? false : null;

    const { data, error } = await supabase
      .from("cases" as any)
      .insert({
        case_reference: caseRef.trim(),
        property_address: propertyAddress.trim(),
        transaction_type: transactionType,
        tenure,
        property_type: propertyType,
        conveyancer_id: user.id,
        conveyancer_name: profile.full_name,
        conveyancer_email: profile.email,
        seller_conveyancer_email: sellerEmail || null,
        lender: lender || null,
        purchase_price: priceNum,
        // PHASE 3: form value is the conveyancer's manual SDLT entry. It writes
        // to sdlt_form_value. cases.stamp_duty is Hoowla-only (precedence
        // resolution: form > Hoowla > absent).
        sdlt_form_value: sdltFormNum,
        sdlt_form_additional_property_surcharge: triToBool(sdltAddlProperty),
        sdlt_form_non_uk_resident_surcharge: triToBool(sdltNonUkResident),
        sdlt_form_first_time_buyer_relief: triToBool(sdltFirstTimeBuyer),
        // Hoowla-sourced SDLT figure (NULL if Hoowla wasn't used or had no SDLT).
        stamp_duty: hoowlaImported ? hoowlaStampDuty : null,
        legal_fees: feesNum,
        status: "documents_pending",
        case_flags: [...effectiveFlags, ...selectedAddOns.map((a) => `addon:${a}`)],
        ...(agentContextNotes ? { ai_context_notes: agentContextNotes } : {}),
        ...(hoowlaImported && hoowlaMatterId.trim() ? { hoowla_matter_id: hoowlaMatterId.trim(), hoowla_last_sync_at: new Date().toISOString() } : {}),
      } as any)
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      const isDuplicate = error.message?.includes("duplicate key") || error.code === "23505";
      toast({
        title: isDuplicate ? "Duplicate case reference" : "Failed to create case",
        description: isDuplicate
          ? "This case reference already exists. Please use a unique reference."
          : error.message,
        variant: "destructive",
      });
      return;
    }

    const newCaseId = (data as any).id;

    // Create folder skeleton in storage
    createCaseFolderSkeleton(newCaseId, selectedAddOns).catch((err) =>
      console.warn("Folder skeleton creation failed:", err)
    );

    // Save parties
    const allParties = [
      ...purchasers.filter((p) => p.fullName.trim()).map((p) => ({ ...p, role: "purchaser" })),
      ...sellers.filter((p) => p.fullName.trim()).map((p) => ({ ...p, role: "seller" })),
      ...(hasGiftors ? giftors.filter((p) => p.fullName.trim()).map((p) => ({ ...p, role: "giftor" }) ) : []),
    ];

    if (allParties.length > 0) {
      const partyRows = allParties.map((p) => ({
        case_id: newCaseId,
        role: p.role,
        full_name: p.fullName.trim(),
        email: p.email.trim() || null,
        pep_status: p.pepStatus,
        buyer_type: p.role === "purchaser" ? p.buyerType : null,
        relationship_to_purchaser: p.role === "giftor" ? p.relationshipToPurchaser || null : null,
        notes: p.notes || null,
      }));

      const { error: partyErr } = await supabase.from("case_parties" as any).insert(partyRows as any);
      if (partyErr) console.error("Failed to save parties:", partyErr);
    }

    // Audit log
    await supabase.from("audit_log" as any).insert({
      case_reference: caseRef.trim(),
      user_id: user.id,
      user_name: profile.full_name,
      user_email: profile.email,
      user_position: profile.position,
      event_type: "Case Created",
      metadata: {
        case_flags: effectiveFlags,
        add_ons: selectedAddOns,
        purchaser_count: purchasers.filter((p) => p.fullName.trim()).length,
        seller_count: sellers.filter((p) => p.fullName.trim()).length,
        giftor_count: hasGiftors ? giftors.filter((p) => p.fullName.trim()).length : 0,
      },
    } as any);

    // Auto-sync documents from Hoowla (fire-and-forget, non-blocking)
    if (hoowlaImported && hoowlaMatterId.trim()) {
      supabase.functions
        .invoke("sync-hoowla-docs", {
          body: { matter_id: hoowlaMatterId.trim(), case_id: newCaseId },
        })
        .then(({ data, error: syncErr }) => {
          if (syncErr) {
            console.warn("Hoowla doc sync error:", syncErr);
          } else if (data) {
            console.log(`Hoowla doc sync: ${data.synced} synced, ${data.skipped} skipped, ${data.failed} failed`);
            if (data.message && data.synced === 0) {
              toast({
                title: "Hoowla documents",
                description: data.message,
              });
            } else if (data.synced > 0) {
              toast({
                title: "Hoowla documents synced",
                description: `${data.synced} document(s) imported to Case Files.${data.failed > 0 ? ` ${data.failed} failed.` : ""}`,
              });
              // Auto-populate missing case fields from the newly synced documents
              supabase.functions
                .invoke("extract-case-fields", { body: { case_id: newCaseId } })
                .then(({ data: extractData }) => {
                  if (extractData?.populated > 0) {
                    toast({
                      title: "Case fields auto-populated",
                      description: extractData.message,
                    });
                  }
                })
                .catch((err) => console.warn("Auto field extraction failed:", err));
            }
          }
        })
        .catch((err) => console.warn("Hoowla doc sync failed:", err));

      // Also sync notes & alerts from Hoowla (fire-and-forget)
      supabase.functions
        .invoke("sync-hoowla-notes", {
          body: { matter_id: hoowlaMatterId.trim(), case_id: newCaseId },
        })
        .then(({ data: notesData }) => {
          if (notesData?.synced > 0) {
            toast({
              title: "Hoowla notes synced",
              description: `${notesData.synced} note(s)/alert(s) imported to Case Files.`,
            });
          }
        })
        .catch((err) => console.warn("Hoowla notes sync failed:", err));
    }

    clearDraft();
    setSaving(false);

    if (returnTo) {
      navigate(`${returnTo}?caseId=${newCaseId}`, { replace: true });
    } else {
      navigate(`/case/${newCaseId}`, { state: { justCreated: true } });
    }
  };

  // ── Step content ────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={18} className="text-accent" /> Property & Case Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Hoowla CMS Import or Request */}
              {hasCMS ? (
                <div className={`rounded-lg border p-4 space-y-3 ${hoowlaImported ? "border-risk-green/30 bg-risk-green-bg/30" : "border-accent/20 bg-accent/5"}`}>
                  <div className="flex items-center gap-2">
                    <Download size={16} className="text-accent" />
                    <span className="text-sm font-semibold text-foreground">Import from Hoowla</span>
                    {hoowlaImported && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-risk-green-bg text-risk-green border border-risk-green/20">
                        Imported
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter Hoowla matter ID"
                      value={hoowlaMatterId}
                      onChange={(e) => { setHoowlaMatterId(e.target.value); clearHoowlaError(); }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleHoowlaImport}
                      disabled={hoowlaSyncing || hoowlaValidating || !hoowlaMatterId.trim()}
                      className="gap-2"
                    >
                      {(hoowlaSyncing || hoowlaValidating) ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {hoowlaSyncing ? "Importing…" : hoowlaValidating ? "AI Validating…" : "Import"}
                    </Button>
                  </div>
                  {hoowlaError && (
                    <p className="text-xs text-destructive">{hoowlaError}</p>
                   )}
                  {hoowlaCorrections.length > 0 && (
                    <div className="rounded-md border border-blue-500/30 bg-blue-50 dark:bg-blue-900/10 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                        <AlertTriangle size={14} />
                        <span className="text-xs font-semibold">
                          AI Corrections Applied
                          {hoowlaValidationConfidence && (
                            <span className="ml-1.5 font-normal opacity-75">
                              (confidence: {hoowlaValidationConfidence})
                            </span>
                          )}
                        </span>
                      </div>
                      {hoowlaCorrections.map((c, i) => (
                        <p key={i} className="text-xs text-blue-700 dark:text-blue-400">• {c}</p>
                      ))}
                      <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-1">
                        Please review the corrected fields above. You can override any field before creating the case.
                      </p>
                    </div>
                  )}
                  {hoowlaWarnings.length > 0 && (
                    <div className="rounded-md border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/10 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle size={14} />
                        <span className="text-xs font-semibold">Data Quality Warning</span>
                      </div>
                      {hoowlaWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{w}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Enter your Hoowla matter ID to auto-fill case details, parties, and financial data. AI validation will verify the imported data.
                  </p>
                </div>
              ) : (
                <CMSRequestCard compact />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Case Reference *</Label>
                  <Input placeholder="SL-2026-XXXXX" required value={caseRef} onChange={(e) => setCaseRef(e.target.value)} className={showErrors && !caseRef.trim() ? "border-destructive" : ""} />
                  {showErrors && !caseRef.trim() && <p className="text-[11px] text-destructive">Case reference is required</p>}
                </div>
                <div className="space-y-2">
                  <Label>Transaction Type *</Label>
                  <Select value={transactionType} onValueChange={setTransactionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Purchase">Purchase</SelectItem>
                      <SelectItem value="Sale">Sale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Property Address *</Label>
                <Input placeholder="Full property address" required value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} onBlur={() => setPropertyAddress(formatAddress(propertyAddress))} className={showErrors && !propertyAddress.trim() ? "border-destructive" : ""} />
                {showErrors && !propertyAddress.trim() && <p className="text-[11px] text-destructive">Property address is required</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Tenure *
                    <InfoTooltip title="Tenure">
                      <p><strong>Freehold</strong> — You own the land and building outright.</p>
                      <p><strong>Leasehold</strong> — You own the property for a fixed term under a lease from the freeholder.</p>
                      <p><strong>Commonhold</strong> — A form of freehold ownership for flats, where common areas are jointly managed.</p>
                    </InfoTooltip>
                  </Label>
                  <Select value={tenure} onValueChange={setTenure}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Freehold">Freehold</SelectItem>
                      <SelectItem value="Leasehold">Leasehold</SelectItem>
                      <SelectItem value="Commonhold">Commonhold</SelectItem>
                      <SelectItem value="Unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Property Type *</Label>
                  <Select value={propertyType} onValueChange={setPropertyType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="House">House</SelectItem>
                      <SelectItem value="Flat">Flat</SelectItem>
                      <SelectItem value="Maisonette">Maisonette</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                      <SelectItem value="Unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Conveyancer</Label>
                <Input value={profile?.full_name ?? ""} disabled className="bg-muted" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seller's Conveyancer Email</Label>
                  <Input type="email" placeholder="Optional" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Lender</Label>
                  <Input placeholder="Optional" value={lender} onChange={(e) => setLender(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 1:
        return (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users size={18} className="text-accent" /> Transaction Parties</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* Purchasers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Purchasers</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => addParty(setPurchasers, "purchaser")} className="text-xs gap-1">
                    <Plus size={14} /> Add Purchaser
                  </Button>
                </div>
                {purchasers.map((p) => (
                  <PartyRow key={p.id} party={p} list={purchasers} setList={setPurchasers} role="purchaser" showBuyerType onUpdate={updateParty} onRemove={removeParty} />
                ))}
              </div>

              {/* Sellers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Sellers</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => addParty(setSellers, "seller")} className="text-xs gap-1">
                    <Plus size={14} /> Add Seller
                  </Button>
                </div>
                {sellers.map((p) => (
                  <PartyRow key={p.id} party={p} list={sellers} setList={setSellers} role="seller" onUpdate={updateParty} onRemove={removeParty} />
                ))}
              </div>

              {/* Giftors toggle */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={hasGiftors} onCheckedChange={(v) => {
                    setHasGiftors(!!v);
                    if (v && giftors.length === 0) setGiftors([emptyParty("giftor")]);
                  }} />
                  <span className="text-sm font-medium text-foreground">Gift involved in this transaction</span>
                </label>
                {hasGiftors && (
                  <div className="space-y-3 pl-6 border-l-2 border-accent/20">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Giftors</h3>
                      <Button type="button" variant="ghost" size="sm" onClick={() => addParty(setGiftors, "giftor")} className="text-xs gap-1">
                        <Plus size={14} /> Add Giftor
                      </Button>
                    </div>
                    {giftors.map((p) => (
                      <PartyRow key={p.id} party={p} list={giftors} setList={setGiftors} role="giftor" showRelationship onUpdate={updateParty} onRemove={removeParty} />
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Party details will be used to pre-fill the Source of Wealth assessment and other AI agent forms.
              </p>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><PoundSterling size={18} className="text-accent" /> Financial Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Purchase Price (£)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 450,000"
                    value={purchasePrice}
                    onChange={(e) => handlePurchasePriceChange(e.target.value)}
                    onBlur={handlePurchasePriceBlur}
                    aria-invalid={!!priceParse.error}
                    className={priceParse.error ? "border-destructive" : undefined}
                  />
                  {priceParse.error && (
                    <p className="text-[11px] text-destructive">{priceParse.error}</p>
                  )}
                  {!priceParse.error && priceParse.warning && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">{priceParse.warning}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>SDLT (Stamp Duty Land Tax) (£)</Label>
                  <Input
                    type="number"
                    placeholder="From CMS or enter manually"
                    value={sdltFormValue}
                    onChange={(e) => setSdltFormValue(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Enter the SDLT figure provided by your tax adviser or computed externally. If left blank, the system will use the figure from your CMS sync (Hoowla) if available; otherwise the funding-gap analysis will flag the gap.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Legal Fees (£)</Label>
                  <Input type="number" placeholder="e.g. 1500" value={legalFees} onChange={(e) => setLegalFees(e.target.value)} />
                </div>
              </div>

              {/* PHASE 3: Surcharges & relief — AML signals only, not SDLT computation inputs. */}
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-semibold text-foreground">Surcharges &amp; relief (AML signals)</h3>
                <p className="text-[11px] text-muted-foreground">
                  Conveyancer's declaration. Used for AML risk profiling only — does not feed SDLT computation. Leave as <span className="font-medium">Not specified</span> if unknown at case-creation time.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Additional-property surcharge applies</Label>
                    <Select value={sdltAddlProperty} onValueChange={(v) => setSdltAddlProperty(v as TriState)}>
                      <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="unspecified">Not specified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Non-UK-resident surcharge applies</Label>
                    <Select value={sdltNonUkResident} onValueChange={(v) => setSdltNonUkResident(v as TriState)}>
                      <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="unspecified">Not specified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">First-time-buyer relief claimed</Label>
                    <Select value={sdltFirstTimeBuyer} onValueChange={(v) => setSdltFirstTimeBuyer(v as TriState)}>
                      <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="unspecified">Not specified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Olimey AI no longer computes SDLT. If your CMS (Hoowla) holds an SDLT figure it is synced automatically (cases.stamp_duty); the field above takes precedence when populated. Leave blank to flag the funding-gap dimension as missing evidence.
              </p>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Case Attributes
                  <span className="text-xs font-normal text-muted-foreground ml-1">Select all that apply</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(tenure === "Leasehold" || tenure === "Commonhold") && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
                    <span className="font-medium text-foreground">Leasehold</span> modifier auto-applied based on tenure selection (+3 credits/agent)
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {manualModifiers.map((mod) => {
                    const checked = caseFlags.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          checked
                            ? mod.blocksAI ? "border-destructive/40 bg-destructive/5" : "border-accent/40 bg-accent/5"
                            : "border-border hover:border-border/80 hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleFlag(mod.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{mod.label}</span>
                            {hoowlaDetectedFlags.has(mod.id) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                <CloudDownload size={10} /> Hoowla
                              </span>
                            )}
                            {mod.blocksAI ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">AI BLOCKED</span>
                            ) : (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">+{mod.extraCredits} cr</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {availableAddOns.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
                      <span className="font-medium text-foreground">Optional Add-on Documents</span> — enable to upload additional documents for AI analysis
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {availableAddOns.map((addon) => {
                        const checked = selectedAddOns.includes(addon.id);
                        return (
                          <label
                            key={addon.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                              checked ? "border-accent/40 bg-accent/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                            }`}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleAddOn(addon.id)} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{addon.label}</span>
                                {hoowlaDetectedAddOns.has(addon.id) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    <CloudDownload size={10} /> Hoowla
                                  </span>
                                )}
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">+{addon.extraCreditsPerAgent} cr/agent</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{addon.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={`rounded-lg p-4 border ${aiBlocked ? "border-destructive/30 bg-destructive/5" : "border-accent/20 bg-accent/5"}`}>
                  {aiBlocked ? (
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-destructive">AI Tools Not Available</p>
                        <p className="text-xs text-muted-foreground mt-1">Unregistered land cases cannot currently be processed by our AI agents.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coins size={16} className="text-accent" />
                        <span className="text-sm font-medium text-foreground">Estimated credit cost per agent</span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-accent">{estimatedCredits}</span>
                        <span className="text-xs text-muted-foreground ml-1">credits (£{estimatedCredits * CREDIT_PRICE_GBP})</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Summary card */}
            <Card className="border-accent/20 bg-accent/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">Case Summary</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Reference:</span>
                  <span className="font-mono text-foreground">{caseRef || "—"}</span>
                  <span className="text-muted-foreground">Property:</span>
                  <span className="text-foreground truncate">{propertyAddress || "—"}</span>
                  <span className="text-muted-foreground">Purchasers:</span>
                  <span className="text-foreground">{purchasers.filter((p) => p.fullName.trim()).map((p) => p.fullName).join(", ") || "—"}</span>
                  <span className="text-muted-foreground">Sellers:</span>
                  <span className="text-foreground">{sellers.filter((p) => p.fullName.trim()).map((p) => p.fullName).join(", ") || "—"}</span>
                  {hasGiftors && giftors.some((g) => g.fullName.trim()) && (
                    <>
                      <span className="text-muted-foreground">Giftors:</span>
                      <span className="text-foreground">{giftors.filter((g) => g.fullName.trim()).map((g) => g.fullName).join(", ")}</span>
                    </>
                  )}
                  {purchasePrice && (
                    <>
                      <span className="text-muted-foreground">Purchase price:</span>
                      <span className="text-foreground">{priceParse.value !== null ? `£${priceParse.formatted}` : "—"}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

          </>
        );

      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Case</h1>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length} — {STEPS[step].desc}
            {draft.caseRef && <span className="ml-2 text-accent text-[10px] font-semibold">● Draft saved</span>}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (i === 0 || (i === 1 && canProceedStep0) || (i >= 2 && canProceedStep0)) setStep(i);
              }}
              className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border transition-all text-left ${
                i === step
                  ? "border-accent bg-accent/5"
                  : i < step
                  ? "border-accent/20 bg-accent/5 opacity-70"
                  : "border-border bg-muted/20 opacity-50"
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i === step ? "bg-accent text-accent-foreground" : i < step ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <div className="hidden sm:block min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">{s.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Validation error banner */}
        {showErrors && validationErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
            <XCircle size={16} className="text-destructive shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-destructive">Please complete the following before proceeding:</p>
              <ul className="list-disc list-inside text-xs text-destructive/80 space-y-0.5">
                {validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Step content */}
        {renderStep()}

        {/* Navigation */}
        <div className="flex justify-between">
          {step === 0 ? (
            <Button variant="outline" onClick={() => navigate("/dashboard")} disabled={saving}>
              <ArrowLeft size={16} className="mr-2" /> Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={() => { setStep(step - 1); setShowErrors(false); }} disabled={saving}>
              <ArrowLeft size={16} className="mr-2" /> Back
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => {
                if (step === 0 && !canProceedStep0) {
                  setShowErrors(true);
                  return;
                }
                if (step === 1 && !canProceedStep1) {
                  setShowErrors(true);
                  return;
                }
                setShowErrors(false);
                setStep(step + 1);
              }}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Next <ArrowRight size={16} className="ml-2" />
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (!canSubmit) {
                  setShowErrors(true);
                  return;
                }
                handleCreateCase();
              }}
              disabled={saving}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              {saving ? "Creating…" : "Create Case"}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default CaseNew;

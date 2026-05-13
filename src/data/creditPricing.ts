/* ─── Olimey AI Credit Pricing Model ─── */

/** £1 per credit */
export const CREDIT_PRICE_GBP = 1;

/** Base credits per agent per case (Freehold) */
export const BASE_CREDITS_PER_AGENT = 5;

/** Additional credits by case complexity factor */
export interface ComplexityModifier {
  id: string;
  label: string;
  description: string;
  extraCredits: number;
  /** If true, selecting this flag blocks AI tool usage entirely */
  blocksAI?: boolean;
}

export const COMPLEXITY_MODIFIERS: ComplexityModifier[] = [
  {
    id: "leasehold",
    label: "Leasehold",
    description: "Lease review, ground rent, service charge analysis",
    extraCredits: 3,
  },
  {
    id: "new-build",
    label: "New Build",
    description: "NHBC warranty, phased completion, snagging provisions",
    extraCredits: 4,
  },
  {
    id: "bsa",
    label: "Building Safety Act (BSA)",
    description: "BSA compliance checks, building safety certificates, remediation assessment",
    extraCredits: 2,
  },
  {
    id: "auction",
    label: "Auction Purchase",
    description: "Accelerated timelines, special conditions, completion deadlines",
    extraCredits: 2,
  },
  {
    id: "right-to-buy",
    label: "Right to Buy",
    description: "RTB valuation, discount clawback provisions, landlord obligations",
    extraCredits: 2,
  },
  {
    id: "shared-ownership",
    label: "Shared Ownership",
    description: "Housing association lease, staircasing provisions, resale restrictions",
    extraCredits: 3,
  },
  {
    id: "staircasing",
    label: "Staircasing",
    description: "Acquiring additional shares in a shared ownership property",
    extraCredits: 2,
  },
  {
    id: "unregistered",
    label: "Unregistered Land",
    description: "Title deeds review, first registration — AI tool not available for this case type",
    extraCredits: 0,
    blocksAI: true,
  },
];

/* ─── Optional Leasehold Add-on Documents ─── */

export interface AddOnDocument {
  id: string;
  label: string;
  description: string;
  extraCreditsPerAgent: number;
  /** doc_type value used in the documents table */
  docType: string;
  /** Only shown when tenure is leasehold/commonhold */
  leaseholdOnly: boolean;
}

export const ADD_ON_DOCUMENTS: AddOnDocument[] = [
  {
    id: "management-pack",
    label: "Management Pack / LPE1",
    description: "Landlord's leasehold property enquiry form, service charge accounts, insurance, and management information",
    extraCreditsPerAgent: 3,
    docType: "management_pack",
    leaseholdOnly: true,
  },
  {
    id: "licence-to-alter",
    label: "Licence to Alter",
    description: "Licence permitting structural or non-structural alterations to a leasehold property",
    extraCreditsPerAgent: 2,
    docType: "licence_to_alter",
    leaseholdOnly: true,
  },
];

/** Calculate total credits per agent for a given set of complexity factors and add-on documents */
export function creditsPerAgent(
  selectedFactors: readonly string[],
  selectedAddOns: readonly string[] = []
): number {
  let total = BASE_CREDITS_PER_AGENT;
  for (const mod of COMPLEXITY_MODIFIERS) {
    if (selectedFactors.includes(mod.id)) {
      total += mod.extraCredits;
    }
  }
  for (const addon of ADD_ON_DOCUMENTS) {
    if (selectedAddOns.includes(addon.id)) {
      total += addon.extraCreditsPerAgent;
    }
  }
  return total;
}

/** Check if any selected factor blocks AI usage */
export function hasAIBlockingFactor(selectedFactors: readonly string[]): boolean {
  return COMPLEXITY_MODIFIERS.some(
    (mod) => mod.blocksAI && selectedFactors.includes(mod.id)
  );
}

/** Calculate total credits for all selected agents & factors */
export function totalCreditsPerCase(
  agentCount: number,
  selectedFactors: string[],
  selectedAddOns: string[] = []
): number {
  return agentCount * creditsPerAgent(selectedFactors, selectedAddOns);
}

/** Calculate total credit cost in GBP */
export function creditCostGBP(credits: number): number {
  return credits * CREDIT_PRICE_GBP;
}

/* ─── Top-up bundles (aggressive volume discounts) ─── */
export const CREDIT_BUNDLES = [
  { credits: 100, price: 100, discount: 0, label: "Starter" },
  { credits: 500, price: 400, discount: 20, label: "Professional" },
  { credits: 1_000, price: 700, discount: 30, label: "Firm" },
  { credits: 5_000, price: 2_500, discount: 50, label: "Enterprise" },
] as const;

/* ─── Example case profiles for the pricing page ─── */
export const CASE_EXAMPLES = [
  {
    label: "Standard Freehold",
    factors: [],
    description: "Typical freehold residential purchase",
  },
  {
    label: "Standard Leasehold",
    factors: ["leasehold"],
    description: "Flat or apartment purchase with existing lease",
  },
  {
    label: "New Build Leasehold",
    factors: ["leasehold", "new-build"],
    description: "New-build flat with developer lease",
  },
  {
    label: "New Build + BSA",
    factors: ["leasehold", "new-build", "bsa"],
    description: "High-rise new-build requiring BSA compliance",
  },
  {
    label: "Auction Freehold",
    factors: ["auction"],
    description: "Auction purchase with tight completion deadline",
  },
  {
    label: "Shared Ownership",
    factors: ["leasehold", "shared-ownership"],
    description: "Shared ownership flat via housing association",
  },
  {
    label: "Right to Buy",
    factors: ["right-to-buy"],
    description: "Council property purchased under Right to Buy scheme",
  },
  {
    label: "Complex (All factors)",
    factors: ["leasehold", "new-build", "bsa", "auction", "right-to-buy", "shared-ownership", "staircasing"],
    description: "Maximum complexity — all chargeable factors apply",
  },
] as const;

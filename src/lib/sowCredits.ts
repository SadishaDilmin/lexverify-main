/* ─── Source of Wealth Assessment Credit Calculator ─── */

export interface SoWCreditBreakdown {
  base: number;
  additionalPurchasers: number;
  giftorCredits: number;
  documentCredits: number;
  total: number;
  /** Human-readable lines for the confirmation dialog */
  lines: { label: string; credits: number }[];
}

/** Base cost for a SoW assessment (1 purchaser, no extras) */
export const SOW_BASE_CREDITS = 20;

/** Credits per additional purchaser beyond the first */
export const SOW_EXTRA_PURCHASER = 3;

/** Credits per giftor */
export const SOW_PER_GIFTOR = 5;

/** Number of supporting documents included free */
export const SOW_FREE_DOCS = 15;

/** Credits per block of 10 documents beyond the free threshold */
export const SOW_DOC_BLOCK_CREDITS = 2;

/** Block size for excess documents */
export const SOW_DOC_BLOCK_SIZE = 10;

/**
 * Calculate the credit cost of a Source of Wealth assessment.
 */
export function estimateSoWCredits(params: {
  purchaserCount: number;
  giftorCount: number;
  /** Total supporting documents (shared + per-person) */
  supportingDocCount: number;
}): SoWCreditBreakdown {
  const { purchaserCount, giftorCount, supportingDocCount } = params;

  const lines: { label: string; credits: number }[] = [];

  // Base
  const base = SOW_BASE_CREDITS;
  lines.push({ label: "SoW Assessment (base)", credits: base });

  // Additional purchasers
  const extraPurchasers = Math.max(0, purchaserCount - 1);
  const additionalPurchasers = extraPurchasers * SOW_EXTRA_PURCHASER;
  if (extraPurchasers > 0) {
    lines.push({
      label: `${extraPurchasers} additional purchaser${extraPurchasers !== 1 ? "s" : ""} (${SOW_EXTRA_PURCHASER} each)`,
      credits: additionalPurchasers,
    });
  }

  // Giftors
  const giftorCredits = giftorCount * SOW_PER_GIFTOR;
  if (giftorCount > 0) {
    lines.push({
      label: `${giftorCount} giftor${giftorCount !== 1 ? "s" : ""} (${SOW_PER_GIFTOR} each)`,
      credits: giftorCredits,
    });
  }

  // Supporting documents (first 15 free)
  let documentCredits = 0;
  if (supportingDocCount > SOW_FREE_DOCS) {
    const excess = supportingDocCount - SOW_FREE_DOCS;
    const blocks = Math.ceil(excess / SOW_DOC_BLOCK_SIZE);
    documentCredits = blocks * SOW_DOC_BLOCK_CREDITS;
    lines.push({
      label: `${supportingDocCount} supporting docs (first ${SOW_FREE_DOCS} free, ${excess} extra)`,
      credits: documentCredits,
    });
  } else if (supportingDocCount > 0) {
    lines.push({ label: `${supportingDocCount} supporting docs (included)`, credits: 0 });
  }

  const total = base + additionalPurchasers + giftorCredits + documentCredits;

  return {
    base,
    additionalPurchasers,
    giftorCredits,
    documentCredits,
    total,
    lines,
  };
}

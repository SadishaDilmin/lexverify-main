/**
 * Map a SectionCompliance finding (by `section_id` or `section` label) to a
 * rendered Internal Report heading. Used to render finding strips inline
 * underneath the section they criticise.
 *
 * Pure functions, no DB. Returns the lower-case heading key the report parser
 * uses (`heading.toLowerCase().trim()`), so the caller can compare against
 * its own section list without any further normalisation.
 */
import type { SectionFinding } from "@/lib/sowSectionValidator";

/** Keyword groups that identify a target Internal Report section. */
const SECTION_ID_TO_KEYWORDS: Record<string, RegExp[]> = {
  // Material credits + bundling + own-account transfers + asset disposals
  // all belong to the Source-of-Funds / Bank-Analysis section in the report.
  material_inbound_credit_review: [/source\s+of\s+funds?/i, /bank\s+(?:statement|analysis)/i, /transactions?\s+review/i],
  material_credit_bundling: [/source\s+of\s+funds?/i, /bank\s+(?:statement|analysis)/i, /transactions?\s+review/i],
  own_account_transfer_verification: [/source\s+of\s+funds?/i, /bank\s+(?:statement|analysis)/i, /own[-\s]?account/i],
  asset_disposal_verification: [/asset\s+disposal/i, /source\s+of\s+wealth/i, /source\s+of\s+funds?/i],

  // Screenshots are an evidence/format issue — surface in the SoW assessment.
  screenshot_rejection: [/source\s+of\s+wealth/i, /evidence/i, /document/i],

  // Completion readiness — overall risk / decision section.
  completion_readiness_check: [/overall\s+risk/i, /completion\s+readiness/i, /executive\s+summary/i, /decision/i],

  // Employment role + tenure — Personal Profile.
  employment_role_tenure: [/personal\s+profile/i, /employment/i],

  // Anti-bundling alias from the validator.
  material_credit_bundling_anti: [/source\s+of\s+funds?/i, /bank\s+(?:statement|analysis)/i],

  // ID checks — Identity & Address Verification.
  id_field_near_clone_suppression: [/identit/i, /id\s+verification/i, /address/i],

  // Personal Profile (Section 5C deterministic table).
  personal_profile_section_5c: [/personal\s+profile/i],
};

/**
 * Choose a matching heading key for a single finding. Walks the rendered
 * section list in order and picks the first heading that matches one of the
 * keyword regexes for the finding's section_id.
 *
 * Falls back to fuzzy matching against the finding's own `section` label if
 * the section_id is unknown to us. Returns null when no match is possible —
 * caller should pin those to the LSAG / overall-risk section as a default.
 */
export function matchFindingToHeading(
  finding: SectionFinding,
  headings: string[],
): string | null {
  const lower = headings.map((h) => h.toLowerCase().trim());
  const sectionId = (finding.section_id || "").trim();
  const patterns = SECTION_ID_TO_KEYWORDS[sectionId];

  if (patterns) {
    for (let i = 0; i < lower.length; i++) {
      if (patterns.some((re) => re.test(lower[i]))) return lower[i];
    }
  }

  // Fallback: fuzzy match against the finding's own label.
  const labelTokens = finding.section
    .toLowerCase()
    .replace(/\(section[^)]+\)/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t.length > 3);

  for (let i = 0; i < lower.length; i++) {
    if (labelTokens.some((t) => lower[i].includes(t))) return lower[i];
  }

  return null;
}

/** Group findings by the resolved heading key. */
export function groupFindingsByHeading(
  findings: SectionFinding[],
  headings: string[],
): Map<string, SectionFinding[]> {
  const out = new Map<string, SectionFinding[]>();
  const fallback = pickFallbackHeading(headings);
  for (const f of findings) {
    const key = matchFindingToHeading(f, headings) ?? fallback;
    if (!key) continue;
    const arr = out.get(key) ?? [];
    arr.push(f);
    out.set(key, arr);
  }
  return out;
}

/** When a finding can't be mapped, attach it to a sensible default section. */
function pickFallbackHeading(headings: string[]): string | null {
  const lower = headings.map((h) => h.toLowerCase().trim());
  // Prefer Overall Risk / Decision / Executive Summary as the catch-all.
  for (const re of [/overall\s+risk/i, /executive\s+summary/i, /decision/i, /summary/i]) {
    const idx = lower.findIndex((h) => re.test(h));
    if (idx >= 0) return lower[idx];
  }
  // Otherwise the first section.
  return lower[0] ?? null;
}

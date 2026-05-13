/**
 * Deterministic Personal Profile (Section 5C) table builder.
 *
 * Why deterministic:
 *   The Section 5C structured table is a reporting *layout*, not a judgement
 *   call. Letting the model author it produces drift (rows missing, headings
 *   renamed, narrative substituted) which then breaks downstream parsers,
 *   QA gates and audit exports. We assemble the canonical 8-row table from
 *   already-collected enrichment data here, and keep the model purely for
 *   the narrative subsections (savings plausibility, occupation risk, etc.).
 *
 * This module is the single source of truth for the table format.
 *   - Same row order, same row count, same labels for every person.
 *   - "Not checked" is an explicit, valid status — never an empty cell.
 *   - Output markdown is stable: hash-equal across runs given equal input.
 */

// ── Input shapes (loose copies of the edge-function response types) ──────

export interface ProfileResultStructuredRow {
  professionalStatus: "verified" | "inconsistent" | "not_found" | "not_checked";
  professionalDetail: string;
  adverseMediaStatus: "none" | "review_recommended" | "not_checked";
  adverseMediaDetail: string;
  highestConfidence: "High" | "Medium" | "Low" | "None";
  identityMatched: boolean;
}

export interface ProfileResultPerson {
  fullName: string;
  sources?: Array<{
    sourceTitle: string;
    sourceUrl: string;
    extractedInformation: string;
    confidenceLevel: string;
    identityMatch: boolean;
  }>;
  structuredRow?: ProfileResultStructuredRow;
}

export interface CompaniesHouseResultPerson {
  fullName: string;
  verificationStatus: string; // verified | not_verified | not_found | error
  verificationSummary: string;
  companiesFound?: Array<{
    companyName: string;
    companyNumber: string;
    role: string;
    verificationComplete?: boolean;
  }>;
}

export interface OfsiResultParty {
  partyName: string;
  status: string; // clear | potential_match | strong_match
  matches?: Array<{ ofsiName: string; score: number; type: string; regime: string }>;
}

export interface FcaResultFirm {
  firmName: string;
  frnNumber: string;
  status: string;
  statusCategory: string; // authorised | registered | not_found | no_longer_authorised
}

export interface FatfData {
  blackList?: string[];
  greyList?: string[];
}

export interface PersonInputForProfile {
  fullName: string;
  occupation?: string;
  employer?: string;
  jurisdictions?: string[]; // e.g. ["England"], ["Greece", "United Kingdom"]
  hasIdDocument?: boolean; // true if a passport/driving licence was uploaded
}

export interface BuildPersonalProfileInputs {
  persons: PersonInputForProfile[];
  profileResult: { profiles?: ProfileResultPerson[] } | null;
  chResult: { results?: CompaniesHouseResultPerson[] } | null;
  ofsiResult: { results?: OfsiResultParty[]; overall_status?: string } | null;
  fcaResult: { results?: FcaResultFirm[] } | null;
  fatfData: FatfData | null;
}

// ── Status emoji helpers ─────────────────────────────────────────────────

const NOT_CHECKED = "➖ Not checked";

function statusIdentity(hasIdDocument: boolean | undefined): string {
  if (hasIdDocument === undefined) return NOT_CHECKED;
  return hasIdDocument
    ? "✅ ID document on file"
    : "❌ Not provided";
}

function statusProfessional(row: ProfileResultStructuredRow | undefined): { emoji: string; detail: string } {
  if (!row || row.professionalStatus === "not_checked") {
    return { emoji: NOT_CHECKED, detail: "Profile-intelligence search not run for this person." };
  }
  switch (row.professionalStatus) {
    case "verified":
      return { emoji: "✅ Consistent", detail: row.professionalDetail };
    case "inconsistent":
      return { emoji: "⚠️ Inconsistent", detail: row.professionalDetail };
    case "not_found":
    default:
      return { emoji: "➖ Not found", detail: row.professionalDetail };
  }
}

function statusCompaniesHouse(ch: CompaniesHouseResultPerson | undefined): { emoji: string; detail: string } {
  if (!ch) return { emoji: NOT_CHECKED, detail: "Companies House lookup not run for this person." };
  if (ch.verificationStatus === "error") {
    return { emoji: "⚠️ Lookup error", detail: ch.verificationSummary };
  }
  if (ch.verificationStatus === "not_found" || !ch.companiesFound?.length) {
    return { emoji: "➖ No directorships", detail: "No Companies House director or PSC records found." };
  }
  const summaries = ch.companiesFound
    .map((c) => `${c.role} of ${c.companyName} (${c.companyNumber})${c.verificationComplete ? " — verified" : ""}`)
    .join("; ");
  return {
    emoji: ch.verificationStatus === "verified" ? "✅ Directorship(s) verified" : "⚠️ Directorship(s) found — verify",
    detail: summaries,
  };
}

function statusOfsi(ofsi: OfsiResultParty | undefined): { emoji: string; detail: string } {
  if (!ofsi) return { emoji: NOT_CHECKED, detail: "OFSI screening not run for this person." };
  switch (ofsi.status) {
    case "clear":
      return { emoji: "✅ Clear", detail: "No sanctions match against the OFSI Consolidated List." };
    case "potential_match":
      return {
        emoji: "⚠️ Potential match",
        detail: `${ofsi.matches?.length || 1} potential match(es) — manual review recommended.`,
      };
    case "strong_match":
      return {
        emoji: "🔴 Strong match",
        detail: `${ofsi.matches?.length || 1} strong match(es) — escalate to Compliance Officer immediately.`,
      };
    default:
      return { emoji: "⚠️ Unknown status", detail: `OFSI screening returned status "${ofsi.status}".` };
  }
}

function statusFatf(person: PersonInputForProfile, fatf: FatfData | null): { emoji: string; detail: string } {
  const jurisdictions = (person.jurisdictions || []).filter((j) => j && j.toLowerCase() !== "united kingdom" && j.toLowerCase() !== "england" && j.toLowerCase() !== "scotland" && j.toLowerCase() !== "wales" && j.toLowerCase() !== "northern ireland" && j.toLowerCase() !== "uk");
  if (jurisdictions.length === 0) {
    return { emoji: "➖ N/A", detail: "No non-UK jurisdiction relevant to this person." };
  }
  if (!fatf || (!fatf.blackList && !fatf.greyList)) {
    return { emoji: NOT_CHECKED, detail: `FATF reference list unavailable. Manual check required for: ${jurisdictions.join(", ")}.` };
  }
  const black = (fatf.blackList || []).map((j) => j.toLowerCase());
  const grey = (fatf.greyList || []).map((j) => j.toLowerCase());
  const onBlack = jurisdictions.filter((j) => black.includes(j.toLowerCase()));
  const onGrey = jurisdictions.filter((j) => grey.includes(j.toLowerCase()));
  if (onBlack.length > 0) {
    return { emoji: "🔴 Black list", detail: `Jurisdiction(s) on FATF Call-for-Action list: ${onBlack.join(", ")}.` };
  }
  if (onGrey.length > 0) {
    return { emoji: "⚠️ Grey list", detail: `Jurisdiction(s) on FATF Increased-Monitoring list: ${onGrey.join(", ")}.` };
  }
  return { emoji: "✅ Not listed", detail: `Jurisdiction(s) checked and not FATF-listed: ${jurisdictions.join(", ")}.` };
}

function statusFca(employer: string | undefined, fca: FcaResultFirm[] | undefined): { emoji: string; detail: string } {
  const empNorm = (employer || "").trim().toLowerCase();
  if (!empNorm || /^(employed|self[- ]?employed|retired|unemployed|student|other|unknown)$/i.test(empNorm)) {
    return { emoji: "➖ Not applicable", detail: "Employer not stated or generic — FCA register check not applicable." };
  }
  if (!fca || fca.length === 0) {
    return { emoji: NOT_CHECKED, detail: `FCA register check not run for employer "${employer}".` };
  }
  const match = fca.find((f) => (f.firmName || "").trim().toLowerCase() === empNorm);
  if (!match) {
    return { emoji: "➖ Not applicable", detail: `Employer "${employer}" not searched against FCA register.` };
  }
  if (match.statusCategory === "authorised" || match.statusCategory === "registered") {
    return { emoji: "✅ Employer authorised", detail: `${match.firmName} (FRN ${match.frnNumber}) — ${match.status}.` };
  }
  if (match.statusCategory === "no_longer_authorised") {
    return { emoji: "⚠️ Authorisation lapsed", detail: `${match.firmName} — ${match.status}. Verify whether this affects the declared role.` };
  }
  return { emoji: "➖ Not on FCA register", detail: `${match.firmName} not found on FCA register. Most employers are not regulated firms — only flag if the person specifically claims a regulated role.` };
}

function statusAdverseMedia(row: ProfileResultStructuredRow | undefined): { emoji: string; detail: string } {
  if (!row || row.adverseMediaStatus === "not_checked") {
    return { emoji: NOT_CHECKED, detail: "Adverse media scan not run for this person." };
  }
  return row.adverseMediaStatus === "review_recommended"
    ? { emoji: "⚠️ Review recommended", detail: row.adverseMediaDetail }
    : { emoji: "✅ None identified", detail: row.adverseMediaDetail };
}

function statusConsistency(rows: Array<{ emoji: string }>): { emoji: string; detail: string } {
  // Consistency = worst severity across all checked categories.
  // Anything 🔴 → RED. Any ⚠️ → AMBER. Otherwise GREEN.
  const joined = rows.map((r) => r.emoji).join(" ");
  if (/🔴/.test(joined)) return { emoji: "🔴 RED", detail: "One or more material risk indicators present (see flagged rows above)." };
  if (/⚠️/.test(joined)) return { emoji: "🟡 AMBER", detail: "Clarification required — see flagged rows above." };
  if (joined.split("➖").length - 1 >= 4) {
    return { emoji: "🟡 AMBER", detail: "Most external checks unavailable — assessment based on uploaded documentation only." };
  }
  return { emoji: "🟢 GREEN", detail: "Profile consistent with the financial structure of the transaction; no adverse external-source findings." };
}

// ── Public API ───────────────────────────────────────────────────────────

export const PERSONAL_PROFILE_SECTION_HEADER = "## Personal Profile (Section 5C)";
export const PERSONAL_PROFILE_PERSON_PREFIX = "### Personal Profile — ";

/**
 * Build the canonical Personal Profile section for the report.
 * Output is deterministic and auditor-friendly.
 */
export function buildPersonalProfileSection(inputs: BuildPersonalProfileInputs): string {
  const { persons, profileResult, chResult, ofsiResult, fcaResult, fatfData } = inputs;
  if (persons.length === 0) return "";

  const profileByName = new Map<string, ProfileResultPerson>();
  for (const p of profileResult?.profiles || []) profileByName.set(p.fullName.toLowerCase(), p);

  const chByName = new Map<string, CompaniesHouseResultPerson>();
  for (const c of chResult?.results || []) chByName.set(c.fullName.toLowerCase(), c);

  const ofsiByName = new Map<string, OfsiResultParty>();
  for (const o of ofsiResult?.results || []) ofsiByName.set(o.partyName.toLowerCase(), o);

  const allFcaResults = fcaResult?.results || [];

  const lines: string[] = [];
  lines.push(PERSONAL_PROFILE_SECTION_HEADER);
  lines.push("");
  lines.push("_The structured table below is generated deterministically from collected enrichment data. Each row reflects what was actually checked; \"Not checked\" is an explicit, audit-visible status._");
  lines.push("");

  for (const person of persons) {
    const profile = profileByName.get(person.fullName.toLowerCase());
    const ch = chByName.get(person.fullName.toLowerCase());
    const ofsi = ofsiByName.get(person.fullName.toLowerCase());

    const identity = statusIdentity(person.hasIdDocument);
    const professional = statusProfessional(profile?.structuredRow);
    const companiesHouse = statusCompaniesHouse(ch);
    const ofsiRow = statusOfsi(ofsi);
    const fatfRow = statusFatf(person, fatfData);
    const fcaRow = statusFca(person.employer, allFcaResults);
    const adverse = statusAdverseMedia(profile?.structuredRow);
    const consistency = statusConsistency([
      { emoji: identity },
      professional,
      companiesHouse,
      ofsiRow,
      fatfRow,
      fcaRow,
      adverse,
    ]);

    lines.push(`${PERSONAL_PROFILE_PERSON_PREFIX}${person.fullName}`);
    lines.push("");
    lines.push("| Category | Status | Detail |");
    lines.push("| :--- | :--- | :--- |");
    lines.push(`| **Identity Verification** | ${identity} | ${person.hasIdDocument === undefined ? "ID-document tracking not provided to this builder." : person.hasIdDocument ? "Photo ID document was uploaded for this person." : "No photo ID document was uploaded for this person."} |`);
    lines.push(`| **Professional Profile** | ${professional.emoji} | ${professional.detail} |`);
    lines.push(`| **Companies House** | ${companiesHouse.emoji} | ${companiesHouse.detail} |`);
    lines.push(`| **OFSI Sanctions** | ${ofsiRow.emoji} | ${ofsiRow.detail} |`);
    lines.push(`| **FATF Jurisdiction** | ${fatfRow.emoji} | ${fatfRow.detail} |`);
    lines.push(`| **FCA Register** | ${fcaRow.emoji} | ${fcaRow.detail} |`);
    lines.push(`| **Adverse Media** | ${adverse.emoji} | ${adverse.detail} |`);
    lines.push(`| **Profile Consistency** | ${consistency.emoji} | ${consistency.detail} |`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Detect whether a Personal Profile section already exists in the report
 * text (so we can replace it cleanly during consolidation).
 *
 * Matches both the canonical deterministic header and any prior
 * model-authored variants ("Profile Intelligence Findings", "Section 5C",
 * "Personal Profiles", etc.).
 *
 * IMPORTANT: only TOP-LEVEL profile sections (h2 `## ` or section-level h3
 * `### Section ...`) are recognised here. Per-person narrative subsections
 * such as `### Background and profile` nested under a per-person heading
 * are intentional and must NOT be replaced — those describe one person
 * within their own block, not the whole-report profile section.
 */
export function findExistingProfileSectionRange(
  reportText: string,
): { start: number; end: number } | null {
  // Order matters: more specific patterns first so we anchor on the canonical
  // header where present.
  const headers: Array<string | RegExp> = [
    PERSONAL_PROFILE_SECTION_HEADER,
    "## Profile Intelligence Findings",
    "## Personal Profiles",
    "## Personal Profile",
    "## Structured Personal Profile",
    /^##\s+Section\s*5C\b[^\n]*$/m,
    /^###\s+Section\s*5C\b[^\n]*$/m,
  ];
  let start = -1;
  for (const h of headers) {
    let idx = -1;
    if (typeof h === "string") {
      idx = reportText.indexOf(h);
    } else {
      const m = h.exec(reportText);
      if (m) idx = m.index;
    }
    if (idx !== -1 && (start === -1 || idx < start)) start = idx;
  }
  if (start === -1) return null;

  // Section ends at the next H2 (## ) or the document end. We look at line
  // starts only so embedded ## inside table cells don't false-positive.
  const after = reportText.slice(start + 1);
  const nextH2Match = after.match(/\n## /);
  const end = nextH2Match ? start + 1 + nextH2Match.index! : reportText.length;
  return { start, end };
}

/**
 * Replace any existing profile section in the report with the deterministic
 * one. If no section exists, inserts before the first addendum / draft email
 * marker, or appends to the end as a last resort.
 */
export function upsertPersonalProfileSection(
  reportText: string,
  deterministicSection: string,
): string {
  if (!deterministicSection) return reportText;
  const range = findExistingProfileSectionRange(reportText);
  if (range) {
    return (
      reportText.slice(0, range.start).trimEnd() +
      "\n\n" +
      deterministicSection +
      "\n\n" +
      reportText.slice(range.end).trimStart()
    );
  }
  // Insert before first addendum marker if present
  const addendumIdx = reportText.indexOf("<!-- ai-merge:");
  if (addendumIdx !== -1) {
    return (
      reportText.slice(0, addendumIdx).trimEnd() +
      "\n\n" +
      deterministicSection +
      "\n\n" +
      reportText.slice(addendumIdx)
    );
  }
  return reportText.trimEnd() + "\n\n" + deterministicSection + "\n";
}

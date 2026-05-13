/**
 * Parser used by sow-section-validator to detect whether the canonical
 * Personal Profile section is present and complete for every named person.
 *
 * Matches the output of src/lib/sow/personalProfileBuilder.ts. If you change
 * the canonical layout there, change this here.
 */

const PERSON_HEADER_RE = /^###\s+Personal Profile\s*[—\-]\s+(.+?)\s*$/gm;

const REQUIRED_ROW_LABELS = [
  "Identity Verification",
  "Professional Profile",
  "Companies House",
  "OFSI Sanctions",
  "FATF Jurisdiction",
  "FCA Register",
  "Adverse Media",
  "Profile Consistency",
];

export interface ProfileCoverageResult {
  hasSectionHeader: boolean;
  personsExpected: string[];
  personsRendered: string[];
  personsMissing: string[];
  personsWithIncompleteRows: Array<{ name: string; missingRows: string[] }>;
  rendersCorrectly: boolean;
}

export function evaluatePersonalProfileCoverage(
  reportText: string,
  expectedPersons: string[],
): ProfileCoverageResult {
  const personsExpected = expectedPersons.map((p) => p.trim()).filter(Boolean);
  const hasSectionHeader = /(^|\n)##\s+Personal Profile\s*\(Section 5C\)\s*$/m.test(reportText);

  const personsRendered: string[] = [];
  const personsWithIncompleteRows: Array<{ name: string; missingRows: string[] }> = [];

  // Parse each person block
  const matches: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  PERSON_HEADER_RE.lastIndex = 0;
  while ((m = PERSON_HEADER_RE.exec(reportText)) !== null) {
    matches.push({ name: m[1].trim(), index: m.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const { name, index } = matches[i];
    personsRendered.push(name);
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index : Math.min(reportText.length, index + 4000);
    const block = reportText.slice(index, blockEnd);
    const missingRows = REQUIRED_ROW_LABELS.filter(
      (label) => !new RegExp(`\\|\\s*\\*\\*${escapeReg(label)}\\*\\*\\s*\\|`).test(block),
    );
    if (missingRows.length > 0) {
      personsWithIncompleteRows.push({ name, missingRows });
    }
  }

  const personsMissing = personsExpected.filter(
    (expected) => !personsRendered.some((r) => normaliseName(r) === normaliseName(expected)),
  );

  return {
    hasSectionHeader,
    personsExpected,
    personsRendered,
    personsMissing,
    personsWithIncompleteRows,
    rendersCorrectly:
      hasSectionHeader &&
      personsMissing.length === 0 &&
      personsWithIncompleteRows.length === 0,
  };
}

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

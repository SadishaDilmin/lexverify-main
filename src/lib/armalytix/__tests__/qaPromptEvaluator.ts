/**
 * Prompt + Engine Joint Testing — Heuristic Rubric Evaluator
 *
 * Evaluates AI output text against expected structural and linguistic
 * characteristics using keyword/section-header detection (not AI-graded).
 */

import type { FullAnalysisResult } from '../contradictionDetector';
import type { QATestCase, PromptQARubric } from './qaTypes';

const REQUIRED_SECTIONS = [
  'Funding overview',
  'Supported',
  'Partially supported',
  'Unexplained',
  'Manual balances',
  'Co-buyer',
  'Transactions of concern',
  'Enquiries',
  'Decision-support',
];

const DECLARATION_KEYWORDS = [
  'declared', 'self-reported', 'client states', 'client declaration',
  'stated by client', 'asserted', 'unverified claim',
];

const EVIDENCE_KEYWORDS = [
  'evidenced', 'bank data', 'verified', 'confirmed by',
  'supported by', 'bank statement', 'payslip', 'matched to bank',
];

const GENERIC_PHRASES = [
  'overall the funds appear', 'in summary everything',
  'no issues were found', 'the source of funds is satisfactory',
  'all funds are accounted for',
];

/**
 * Evaluate AI-generated output text for structural and linguistic quality.
 * Returns a heuristic rubric — not perfect but catches regressions.
 */
export function evaluatePromptOutput(
  aiOutputText: string,
  fixture: QATestCase,
  engineResult: FullAnalysisResult
): PromptQARubric {
  const text = aiOutputText.toLowerCase();
  let score = 0;

  // ── Section presence ────────────────────────────────────────
  const outputHasRequiredSections: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (text.includes(section.toLowerCase())) {
      outputHasRequiredSections.push(section);
    }
  }
  const sectionScore = outputHasRequiredSections.length / REQUIRED_SECTIONS.length;
  score += sectionScore * 20;

  // ── Uses structured inputs ──────────────────────────────────
  const referencesAmounts = /£[\d,]+/.test(aiOutputText);
  const referencesSourceCategories = engineResult.sourceReconciliations.some(
    (r) => text.includes(r.sourceCategory.toLowerCase())
  );
  const usesStructuredInputs = referencesAmounts && referencesSourceCategories;
  if (usesStructuredInputs) score += 15;

  // ── Declaration vs evidence distinction ─────────────────────
  const hasDeclarationLanguage = DECLARATION_KEYWORDS.some((kw) => text.includes(kw));
  const hasEvidenceLanguage = EVIDENCE_KEYWORDS.some((kw) => text.includes(kw));
  const distinguishesDeclarationsFromEvidence =
    hasDeclarationLanguage && hasEvidenceLanguage;
  if (distinguishesDeclarationsFromEvidence) score += 15;

  // ── Surfaces exceptions ─────────────────────────────────────
  const exceptionCount = engineResult.exceptions.length;
  const mentionsExceptions =
    exceptionCount > 0 &&
    (text.includes('exception') ||
      text.includes('unresolved') ||
      text.includes('concern') ||
      text.includes('risk'));
  const surfacesExceptions = exceptionCount === 0 || mentionsExceptions;
  if (surfacesExceptions) score += 10;

  // ── Surfaces unmatched items ────────────────────────────────
  const unmatchedCount = engineResult.matchResult.unmatched.length;
  const mentionsUnmatched =
    unmatchedCount > 0 &&
    (text.includes('unmatched') ||
      text.includes('unexplained') ||
      text.includes('not linked'));
  const surfacesUnmatchedItems = unmatchedCount === 0 || mentionsUnmatched;
  if (surfacesUnmatchedItems) score += 10;

  // ── Proportionate enquiries ─────────────────────────────────
  const enquiryMentions = (text.match(/enquir/g) || []).length;
  const generatesProportionateEnquiries =
    enquiryMentions > 0 && enquiryMentions < 50;
  if (generatesProportionateEnquiries) score += 10;

  // ── Avoids generic summarisation ────────────────────────────
  const hasGenericPhrases = GENERIC_PHRASES.some((p) => text.includes(p));
  const avoidsGenericSummarisation = !hasGenericPhrases;
  if (avoidsGenericSummarisation) score += 10;

  // ── Handles hybrid correctly ────────────────────────────────
  let handlesHybridCorrectly: boolean | null = null;
  if (fixture.expectedPathway === 'hybrid') {
    const mentionsArmalytix = text.includes('armalytix') || text.includes('open banking');
    const mentionsDocumentary =
      text.includes('statement') || text.includes('document') || text.includes('manual');
    handlesHybridCorrectly = mentionsArmalytix && mentionsDocumentary;
    if (handlesHybridCorrectly) score += 10;
  } else {
    score += 10; // not applicable — full marks
  }

  return {
    usesStructuredInputs,
    distinguishesDeclarationsFromEvidence,
    surfacesExceptions,
    surfacesUnmatchedItems,
    generatesProportionateEnquiries,
    avoidsGenericSummarisation,
    handlesHybridCorrectly,
    outputHasRequiredSections,
    score: Math.round(Math.min(100, score)),
  };
}

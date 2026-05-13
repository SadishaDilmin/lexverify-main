/**
 * QA Reporter — Aggregates evaluations into suite reports
 * with false-negative/positive summaries and calibration notes.
 */

import type {
  QAEvaluation,
  QASuiteReport,
  AggregateScores,
} from './qaTypes';
import { evaluationPasses } from './qaEvaluator';

/**
 * Build a suite-level report from individual evaluations.
 */
export function buildSuiteReport(evaluations: QAEvaluation[]): QASuiteReport {
  const totalCases = evaluations.length;
  let passed = 0;
  let failed = 0;

  for (const ev of evaluations) {
    if (evaluationPasses(ev)) passed++;
    else failed++;
  }

  // ── Aggregate scores ────────────────────────────────────────
  const issueRecalls = evaluations.map((e) => e.scores.issueRecall);
  const issuePrecisions = evaluations.map((e) => e.scores.issuePrecision);
  const enquiryRecalls = evaluations.map((e) => e.scores.enquiryRecall);
  const enquiryPrecisions = evaluations.map((e) => e.scores.enquiryPrecision);
  const duplicateRates = evaluations.map((e) => e.scores.duplicateEnquiryRate);
  const pathwayCorrectCount = evaluations.filter((e) => e.scores.pathwayCorrect).length;

  const mean = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const min = (arr: number[]) => (arr.length > 0 ? Math.min(...arr) : 0);

  const aggregateScores: AggregateScores = {
    meanIssueRecall: mean(issueRecalls),
    meanIssuePrecision: mean(issuePrecisions),
    meanEnquiryRecall: mean(enquiryRecalls),
    meanEnquiryPrecision: mean(enquiryPrecisions),
    meanDuplicateRate: mean(duplicateRates),
    minIssueRecall: min(issueRecalls),
    minIssuePrecision: min(issuePrecisions),
    pathwayAccuracy: totalCases > 0 ? pathwayCorrectCount / totalCases : 0,
  };

  // ── False negative summary (systematic misses) ──────────────
  const fnMap = new Map<string, string[]>();
  for (const ev of evaluations) {
    for (const fn of ev.falseNegatives) {
      if (!fnMap.has(fn.expectedExceptionType)) fnMap.set(fn.expectedExceptionType, []);
      fnMap.get(fn.expectedExceptionType)!.push(fn.fixtureId);
    }
  }
  const falseNegativeSummary = Array.from(fnMap.entries()).map(
    ([exceptionType, missedInCases]) => ({ exceptionType, missedInCases })
  );

  // ── False positive summary ──────────────────────────────────
  const fpMap = new Map<string, string[]>();
  for (const ev of evaluations) {
    for (const fp of ev.falsePositives) {
      if (!fpMap.has(fp.raisedExceptionType)) fpMap.set(fp.raisedExceptionType, []);
      fpMap.get(fp.raisedExceptionType)!.push(fp.fixtureId);
    }
  }
  const falsePositiveSummary = Array.from(fpMap.entries()).map(
    ([exceptionType, raisedInCases]) => ({ exceptionType, raisedInCases })
  );

  // ── Calibration notes ───────────────────────────────────────
  const calibrationNotes: string[] = [];

  if (aggregateScores.meanIssueRecall < 0.8) {
    calibrationNotes.push(
      `⚠ Mean issue recall (${(aggregateScores.meanIssueRecall * 100).toFixed(1)}%) is below 80% threshold. Review exception rule coverage.`
    );
  }
  if (aggregateScores.meanIssuePrecision < 0.7) {
    calibrationNotes.push(
      `⚠ Mean issue precision (${(aggregateScores.meanIssuePrecision * 100).toFixed(1)}%) is below 70% threshold. Too many irrelevant exceptions raised.`
    );
  }
  if (aggregateScores.meanDuplicateRate > 0.15) {
    calibrationNotes.push(
      `⚠ Mean duplicate enquiry rate (${(aggregateScores.meanDuplicateRate * 100).toFixed(1)}%) is elevated. Review merge-group logic.`
    );
  }
  if (aggregateScores.pathwayAccuracy < 1) {
    calibrationNotes.push(
      `⚠ Pathway accuracy ${(aggregateScores.pathwayAccuracy * 100).toFixed(0)}% — some fixtures used wrong analysis pathway.`
    );
  }

  // Systematic misses (same exception missed in 2+ cases)
  for (const fn of falseNegativeSummary) {
    if (fn.missedInCases.length >= 2) {
      calibrationNotes.push(
        `🔴 Systematic miss: "${fn.exceptionType}" missed in ${fn.missedInCases.length} cases (${fn.missedInCases.join(', ')}). Rule may need strengthening.`
      );
    }
  }

  // Systematic false positives
  for (const fp of falsePositiveSummary) {
    if (fp.raisedInCases.length >= 2) {
      calibrationNotes.push(
        `🟡 Systematic false positive: "${fp.exceptionType}" raised incorrectly in ${fp.raisedInCases.length} cases. Rule may be too aggressive.`
      );
    }
  }

  if (calibrationNotes.length === 0) {
    calibrationNotes.push('✅ All metrics within acceptable thresholds.');
  }

  return {
    runDate: new Date().toISOString(),
    totalCases,
    passed,
    failed,
    aggregateScores,
    perCaseResults: evaluations,
    falseNegativeSummary,
    falsePositiveSummary,
    calibrationNotes,
  };
}

/**
 * Format suite report as a human-readable string for logging.
 */
export function formatSuiteReport(report: QASuiteReport): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════');
  lines.push('  ARMALYTIX PIPELINE QA SUITE REPORT');
  lines.push(`  ${report.runDate}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`  Total: ${report.totalCases} | Passed: ${report.passed} | Failed: ${report.failed}`);
  lines.push('');
  lines.push('  AGGREGATE SCORES');
  lines.push(`    Issue Recall:     ${(report.aggregateScores.meanIssueRecall * 100).toFixed(1)}% (min ${(report.aggregateScores.minIssueRecall * 100).toFixed(1)}%)`);
  lines.push(`    Issue Precision:  ${(report.aggregateScores.meanIssuePrecision * 100).toFixed(1)}% (min ${(report.aggregateScores.minIssuePrecision * 100).toFixed(1)}%)`);
  lines.push(`    Enquiry Recall:   ${(report.aggregateScores.meanEnquiryRecall * 100).toFixed(1)}%`);
  lines.push(`    Enquiry Precision:${(report.aggregateScores.meanEnquiryPrecision * 100).toFixed(1)}%`);
  lines.push(`    Duplicate Rate:   ${(report.aggregateScores.meanDuplicateRate * 100).toFixed(1)}%`);
  lines.push(`    Pathway Accuracy: ${(report.aggregateScores.pathwayAccuracy * 100).toFixed(0)}%`);
  lines.push('');

  if (report.falseNegativeSummary.length > 0) {
    lines.push('  FALSE NEGATIVES (expected but not raised)');
    for (const fn of report.falseNegativeSummary) {
      lines.push(`    ${fn.exceptionType}: missed in [${fn.missedInCases.join(', ')}]`);
    }
    lines.push('');
  }

  if (report.falsePositiveSummary.length > 0) {
    lines.push('  FALSE POSITIVES (raised but should not be)');
    for (const fp of report.falsePositiveSummary) {
      lines.push(`    ${fp.exceptionType}: raised in [${fp.raisedInCases.join(', ')}]`);
    }
    lines.push('');
  }

  if (report.calibrationNotes.length > 0) {
    lines.push('  CALIBRATION NOTES');
    for (const note of report.calibrationNotes) {
      lines.push(`    ${note}`);
    }
  }

  lines.push('═══════════════════════════════════════════════════');
  return lines.join('\n');
}

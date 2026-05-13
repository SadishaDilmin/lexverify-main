/**
 * Per-check execution status.
 *
 * Surfaces "pending — awaiting [field]" instead of silently dropping
 * checks that cannot run because required intake is missing.
 *
 * Pure types + helpers. No DB calls.
 */

import type { ExceptionType } from './exceptionEngine';

export type CheckRunStatus = 'ran' | 'blocked_missing_input' | 'not_applicable';

export interface CheckExecutionRecord {
  /** Stable ID of the check (typically the ExceptionType it would produce). */
  checkId: ExceptionType | string;
  /** Human-readable label for the check (used by the UI). */
  label: string;
  /** Outcome of attempting to run the check. */
  status: CheckRunStatus;
  /**
   * Specific inputs that were missing when status === 'blocked_missing_input'.
   * Field names should match the underlying record/column where applicable.
   */
  missingInputs?: string[];
  /** Free-text reason shown to the reviewer. */
  reason?: string;
}

export function blocked(
  checkId: CheckExecutionRecord['checkId'],
  label: string,
  missingInputs: string[],
  reason?: string,
): CheckExecutionRecord {
  return {
    checkId,
    label,
    status: 'blocked_missing_input',
    missingInputs,
    reason: reason ?? `Awaiting ${missingInputs.join(', ')}`,
  };
}

export function ran(
  checkId: CheckExecutionRecord['checkId'],
  label: string,
): CheckExecutionRecord {
  return { checkId, label, status: 'ran' };
}

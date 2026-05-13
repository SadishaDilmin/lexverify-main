/**
 * Regression tests: Fund-Flow Reconstruction Discipline
 *
 * Validates that the prompt enforces transaction-level verification
 * before making deposit-source or contribution-attribution assertions,
 * preventing false single-transfer / single-contributor narratives.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROMPT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

describe('Fund-Flow Reconstruction Discipline prompt rules', () => {
  // ── Section existence ──────────────────────────────────────────

  it('contains the fund-flow reconstruction rule section', () => {
    expect(prompt).toContain('FUND-FLOW RECONSTRUCTION DISCIPLINE — NO INVENTED NARRATIVES (REUSABLE RULE)');
  });

  // ── Transaction-level evidence requirement ─────────────────────

  it('requires transaction-level evidence before deposit-source assertions', () => {
    expect(prompt).toContain('Transaction-level evidence required');
    expect(prompt).toMatch(/cite.*date.*amount.*payer.*description/i);
  });

  it('prohibits assertions without citing specific transactions', () => {
    expect(prompt).toContain('If you cannot cite a specific transaction, you MUST NOT make the assertion');
  });

  // ── Mixed / accumulated funding detection ──────────────────────

  it('requires mixed funding pattern detection', () => {
    expect(prompt).toContain('Mixed / accumulated funding detection');
    expect(prompt).toContain('mixed / accumulated funding pattern');
  });

  it('lists mixed funding source types', () => {
    expect(prompt).toContain('Multiple credits over time');
    expect(prompt).toContain('Mixed sources');
    expect(prompt).toContain('Transfers between the buyer');
    expect(prompt).toContain('Contributions from multiple people');
  });

  // ── Single-source assertion standard ───────────────────────────

  it('sets strict conditions for single-source deposit assertions', () => {
    expect(prompt).toContain('Single-source assertion standard');
    expect(prompt).toMatch(/single transaction.*visible.*matching the deposit amount/i);
  });

  it('requires payer identification for single-source claims', () => {
    expect(prompt).toContain('transaction description or payer field identifies the source');
  });

  it('requires no other material credits for single-source claims', () => {
    expect(prompt).toContain('No other material credits contributed to the same balance');
  });

  // ── Anti-simplification rule ───────────────────────────────────

  it('prohibits simplifying complex funding chains', () => {
    expect(prompt).toContain('Do NOT simplify complex funding chains');
    expect(prompt).toContain('rather than collapsing it into a false simple narrative');
  });

  // ── Declared funding story alignment ───────────────────────────

  it('requires checking declared funding against transaction evidence', () => {
    expect(prompt).toContain('Declared funding story alignment');
    expect(prompt).toContain('MUST NOT discard or override that declared composition');
  });

  it('requires per-source evidence classification', () => {
    expect(prompt).toContain('confirmed');
    expect(prompt).toContain('partially evidenced');
    expect(prompt).toContain('not evidenced');
    expect(prompt).toContain('contradicted');
  });

  it('prohibits collapsing partial evidence into single-person narrative', () => {
    expect(prompt).toContain('Do NOT collapse "partially evidenced from multiple sources" into "entirely provided by [one person]"');
  });

  // ── Contribution attribution standard ──────────────────────────

  it('requires evidenced transaction totals for contribution splits', () => {
    expect(prompt).toContain('Contribution attribution standard');
    expect(prompt).toContain('Use only evidenced transaction totals, not assumptions');
  });

  it('requires clarification enquiry for unclear splits', () => {
    expect(prompt).toContain('exact contribution split between [parties] is not fully determined');
  });

  // ── Decision Log requirement ───────────────────────────────────

  it('requires Decision Log entries for deposit-source assertions', () => {
    expect(prompt).toMatch(/Decision Log requirement.*deposit-source.*contribution-attribution/is);
  });

  it('requires distinguishing direct evidence from inference', () => {
    expect(prompt).toContain('directly evidenced');
    expect(prompt).toContain('inferred');
    expect(prompt).toContain('basis for the inference');
  });

  // ── Prohibited reporting patterns ──────────────────────────────

  it('prohibits "entire deposit was provided by X" without evidence', () => {
    expect(prompt).toContain('PROHIBITED');
    expect(prompt).toMatch(/PROHIBITED.*The entire deposit was provided by X/);
  });

  it('prohibits invented single transfer claims', () => {
    expect(prompt).toMatch(/PROHIBITED.*transferred £Y in a single payment/);
  });

  it('prohibits false single-account attribution', () => {
    expect(prompt).toMatch(/PROHIBITED.*The deposit came from X's account.*when multiple sources/);
  });

  // ── Required reporting patterns ────────────────────────────────

  it('requires accumulated-through-multiple-transactions wording', () => {
    expect(prompt).toContain('deposit appears to have been accumulated through multiple transactions');
  });

  it('requires mixed-contribution wording where appropriate', () => {
    expect(prompt).toContain('full deposit build-up involves multiple sources');
  });

  it('requires unclear-split wording where appropriate', () => {
    expect(prompt).toContain('exact contribution split remains unclear on the current evidence');
  });

  // ── Interaction with existing rules ────────────────────────────

  it('coexists with contribution-detection rule', () => {
    expect(prompt).toContain('CONTRIBUTION-DETECTION RULE — DO NOT ASSUME (REUSABLE RULE)');
    expect(prompt).toContain('FUND-FLOW RECONSTRUCTION DISCIPLINE — NO INVENTED NARRATIVES (REUSABLE RULE)');
  });

  it('fund-flow rule appears after contribution-detection rule', () => {
    const contribIdx = prompt.indexOf('CONTRIBUTION-DETECTION RULE');
    const fundFlowIdx = prompt.indexOf('FUND-FLOW RECONSTRUCTION DISCIPLINE');
    expect(fundFlowIdx).toBeGreaterThan(contribIdx);
  });

  it('preserves payment-route-first logic', () => {
    expect(prompt).toContain('Payment-route-first enquiry discipline');
  });

  it('preserves evidence-tier weighting', () => {
    expect(prompt).toContain('Source-Event Evidence Weighting');
  });
});

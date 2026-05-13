/**
 * Regression tests: Contribution-Detection Rule — Do Not Assume
 *
 * Validates that the prompt enforces evidence-based contribution detection
 * and prevents assumed contributions from unevidenced parties.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROMPT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

describe('Contribution-detection prompt rules', () => {
  // ── Section existence ──────────────────────────────────────────

  it('contains the contribution-detection rule section', () => {
    expect(prompt).toContain('CONTRIBUTION-DETECTION RULE — DO NOT ASSUME (REUSABLE RULE)');
  });

  it('states the critical no-assumption rule', () => {
    expect(prompt).toContain('MUST NOT assume that a named party');
    expect(prompt).toContain('actually evidenced');
  });

  // ── Verification sequence ──────────────────────────────────────

  it('requires checking evidenced accounts first', () => {
    expect(prompt).toContain('Check evidenced accounts');
    expect(prompt).toContain('These are the only accounts you can analyse');
  });

  it('requires searching for visible credits from the other party', () => {
    expect(prompt).toContain('Search for visible credits from the other party');
    expect(prompt).toContain('originate from the named party');
  });

  // ── Evidenced contribution path ────────────────────────────────

  it('defines treatment when credits ARE visible', () => {
    expect(prompt).toContain('If material credits from the other party ARE visible');
    expect(prompt).toContain('Classify that party as a contributor');
    expect(prompt).toContain('Request proportionate SoW/SoF evidence');
  });

  // ── No-evidence path ───────────────────────────────────────────

  it('defines treatment when credits are NOT visible', () => {
    expect(prompt).toContain('If NO credits from the other party are visible');
    expect(prompt).toContain('Do NOT state or assume');
    expect(prompt).toContain('"assumed to be contributing"');
  });

  it('requires clarification enquiry when contribution is not evidenced', () => {
    expect(prompt).toContain('Please confirm whether');
    expect(prompt).toContain('is contributing any funds towards this purchase');
  });

  it('requires internal report to state contribution is not evidenced', () => {
    expect(prompt).toContain('No contribution from');
    expect(prompt).toContain('is evidenced in the available financial documentation');
  });

  // ── Joint account handling ─────────────────────────────────────

  it('has specific rules for joint accounts', () => {
    expect(prompt).toContain('Joint accounts');
    expect(prompt).toContain('source of funds INTO the joint account**');
  });

  it('prevents assuming contribution via joint account without visible credits', () => {
    expect(prompt).toContain('do not assume Party B is contributing via the joint account');
    expect(prompt).toContain("Party B's own income/funds also visibly enter it");
  });

  // ── Materiality test ───────────────────────────────────────────

  it('defines materiality threshold for contribution detection', () => {
    expect(prompt).toContain('Materiality test for contribution detection');
    expect(prompt).toContain('5% of the required deposit');
    expect(prompt).toContain('£5,000');
  });

  it('excludes trivial transfers from contributor treatment', () => {
    expect(prompt).toContain('Trivial transfers');
    expect(prompt).toContain('should not be treated as purchase contributions');
  });

  // ── Report section effects ─────────────────────────────────────

  it('prevents padding funding gap with assumed contributions', () => {
    expect(prompt).toContain('Do not pad the evidenced figure with assumed contributions');
  });

  it('requires conditional language in draft email for unevidenced contribution', () => {
    expect(prompt).toContain('"if [Person] is contributing"');
    expect(prompt).toContain('"we note that [Person] is contributing"');
  });

  it('requires Decision Log to record contribution-detection outcome', () => {
    expect(prompt).toContain('evidenced (with transaction references) / not evidenced (clarification requested) / below materiality threshold');
  });

  it('prevents role classification for unevidenced parties', () => {
    expect(prompt).toContain('Role pending — contribution not yet confirmed');
  });

  // ── Preserves existing associated-party rules ──────────────────

  it('still contains Associated-Party Role Classification', () => {
    expect(prompt).toContain('ASSOCIATED-PARTY ROLE CLASSIFICATION (REUSABLE RULE)');
    expect(prompt).toContain('Economic Source Originator');
    expect(prompt).toContain('Operational Fund Holder / Router');
  });
});

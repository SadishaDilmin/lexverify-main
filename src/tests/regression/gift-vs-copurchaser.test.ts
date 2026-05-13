/**
 * Regression tests: Gift vs Co-Purchaser Contribution Classification
 *
 * Validates that the prompt correctly distinguishes third-party gifts
 * from co-purchaser contributions, and does not treat funds from a
 * co-purchaser/spouse who is party to the transaction as a gift.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROMPT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

describe('Gift vs co-purchaser contribution classification', () => {
  // ── Section existence ──────────────────────────────────────────

  it('contains the gift vs co-purchaser classification rule', () => {
    expect(prompt).toContain('GIFT VS CO-PURCHASER CONTRIBUTION CLASSIFICATION (REUSABLE RULE)');
  });

  // ── Provider classification ────────────────────────────────────

  it('requires classifying the fund provider before applying gift logic', () => {
    expect(prompt).toContain('Classify the fund provider');
    expect(prompt).toContain('Co-purchaser / party to the transaction');
    expect(prompt).toContain('Non-party third party');
  });

  it('states co-purchaser contributions are NOT automatically gifts', () => {
    expect(prompt).toContain('co-purchaser contribution');
    expect(prompt).toContain('NOT automatically a gift');
  });

  // ── Contradiction logic ────────────────────────────────────────

  it('prevents false contradiction between no-gifts and co-purchaser funds', () => {
    expect(prompt).toContain('Do NOT treat "no gifts declared" + "funds from co-purchaser/spouse" as a contradiction');
    expect(prompt).toContain('if the spouse/partner is themselves a purchaser or party to the transaction');
  });

  it('still raises contradiction for genuine non-party gifts', () => {
    expect(prompt).toContain('provider is genuinely a non-party third party AND no gift was declared');
  });

  it('requires clarification when provider status is unclear', () => {
    expect(prompt).toContain('raise a **clarification enquiry** asking whether the provider is a party to the purchase');
  });

  // ── Wording / reporting ────────────────────────────────────────

  it('prohibits false gift-declaration language for co-purchaser contributions', () => {
    expect(prompt).toContain('PROHIBITED (when provider is a co-purchaser)');
    expect(prompt).toContain('false declaration because no gifts stated but husband/wife/partner contributed');
  });

  it('requires contribution-evidence framing for co-purchaser funds', () => {
    expect(prompt).toContain("the source and route of the co-purchaser's contribution remain to be evidenced");
  });

  it('uses correct inter-buyer terminology', () => {
    expect(prompt).toContain('inter-buyer funding');
    expect(prompt).toContain('pooled buyer funds');
  });

  // ── LSAG / checklist alignment ─────────────────────────────────

  it('limits giftor proportionality to true third-party gifts only', () => {
    expect(prompt).toContain('Giftor Proportionality (LSAG checklist item 10) applies ONLY to true third-party gifts');
  });

  it('requires Decision Log to record provider classification', () => {
    expect(prompt).toContain('provider classified as co-purchaser / non-party / unclear');
  });

  it('distinguishes contribution evidence from gift evidence in missing-evidence sections', () => {
    expect(prompt).toContain('co-purchaser contribution evidence required');
    expect(prompt).toContain('gift verification evidence required');
  });

  // ── Gift verification for genuine non-party gifts still intact ─

  it('retains gift verification rules for confirmed non-party gifts', () => {
    expect(prompt).toContain('Gift Verification (for confirmed non-party third-party gifts only)');
    expect(prompt).toContain('Gift Letter');
    expect(prompt).toContain('Giftor\'s Source of Funds');
  });

  // ── Code-level contradiction detection ─────────────────────────

  it('has code guard preventing gift contradiction for co-purchasers', () => {
    expect(prompt).toContain('isReferencedPartyAPurchaser');
    expect(prompt).toContain('party is a co-purchaser, funds are a contribution not a gift');
  });

  // ── Preserves existing rules ───────────────────────────────────

  it('still contains contribution-detection rule', () => {
    expect(prompt).toContain('CONTRIBUTION-DETECTION RULE — DO NOT ASSUME (REUSABLE RULE)');
  });

  it('still contains fund-flow reconstruction discipline', () => {
    expect(prompt).toContain('FUND-FLOW RECONSTRUCTION DISCIPLINE — NO INVENTED NARRATIVES (REUSABLE RULE)');
  });

  it('still contains associated-party role classification', () => {
    expect(prompt).toContain('ASSOCIATED-PARTY ROLE CLASSIFICATION (REUSABLE RULE)');
  });
});

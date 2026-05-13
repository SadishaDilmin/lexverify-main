/**
 * Regression: KB authority in-body application, Section D governance descriptions,
 * LSAG arithmetic robustness, ARMALYTIX_FORM_UPDATE contribution nullification,
 * CLC guidance usage, firm policy priority.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const AGENT_CHAT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const src = fs.readFileSync(AGENT_CHAT_PATH, 'utf-8');

describe('Defect 1 — KB authorities used in body, not just Section D', () => {
  it('Executive Summary requires 2-3 authority references', () => {
    expect(src).toMatch(/EXECUTIVE SUMMARY.*KB AUTHORITY INTEGRATION/s);
    expect(src).toMatch(/at least 2.3 explicit authority references/);
  });

  it('requires "Per the firm" phrasing in Exec Summary', () => {
    expect(src).toContain("Per the firm's CDD Policy");
    expect(src).toContain("Per LSAG AML Guidance 2025");
    expect(src).toContain("Per the CLC AML / Source of Funds Guidance");
  });

  it('per-person sections require KB authority integration', () => {
    expect(src).toMatch(/PER-PERSON KB AUTHORITY INTEGRATION \(MANDATORY\)/);
    expect(src).toMatch(/1.3 authority citations per person section/);
  });
});

describe('Defect 2 — Firm policies as primary authorities', () => {
  it('per-person section cites firm SoF/SoW Policy first', () => {
    expect(src).toMatch(/cite the firm's SoF \/ SoW Policy first/i);
  });

  it('firm CDD Policy cited first for identity thresholds', () => {
    expect(src).toMatch(/cite the firm's CDD Policy first.*MLR 2017/i);
  });

  it('priority order: firm > regulatory > supervisory', () => {
    expect(src).toMatch(/Firm-specific policies.*highest priority/i);
  });
});

describe('Defect 3 — CLC guidance actively used', () => {
  it('CLC SoF guidance cited in per-person instructions', () => {
    expect(src).toContain('Per the CLC AML / Source of Funds Guidance, it is not sufficient to observe that funds are held in a UK bank account');
  });
});

describe('Defect 4 — LSAG score arithmetic always sums to 15', () => {
  it('catches denominators 10-16 (not just 12-16)', () => {
    expect(src).toMatch(/14\|13\|12\|16\|11\|10/);
  });

  it('has force-correction fallback when counts dont match 15', () => {
    expect(src).toContain('reconcileLsagScoreArithmetic(');
    expect(src).toContain('Reconciled LSAG score line from checklist rows');
  });
});

describe('Defect 5 — ARMALYTIX_FORM_UPDATE contribution nullification', () => {
  it('detects allocation unclear in narrative', () => {
    expect(src).toMatch(/allocationUnclear/);
    expect(src).toMatch(/allocation\s+.*unclear|conflicting|requires.*clarification/);
  });

  it('nullifies contribution_amount when allocation unclear', () => {
    expect(src).toContain('person.contribution_amount = null');
    expect(src).toContain('Nullified contribution_amount in ARMALYTIX_FORM_UPDATE');
  });
});

describe('Defect 6 — Decision Log governing authority', () => {
  it('requires governing authority in reasoning column', () => {
    expect(src).toContain('reasoning column MUST name the governing authority');
  });
});

describe('Defect 7 — Section D requires per-authority governance descriptions', () => {
  it('requires format: Authority — what it governed', () => {
    expect(src).toMatch(/\*\*\[Authority name\]\*\* — \[what it governed in this report\]/);
  });

  it('provides example entries with governance descriptions', () => {
    expect(src).toContain('Firm AML Policy** — escalation thresholds');
    expect(src).toContain('LSAG AML Guidance 2025** — risk-based SoF / SoW expectations');
    expect(src).toContain('CLC AML / Source of Funds Guidance** — need to understand how and from where');
  });

  it('prohibits just listing names without governance descriptions', () => {
    expect(src).toContain('Do NOT just list names — always state what each authority governed');
  });
});

describe('Defect 8 — Live-path deterministic authority and arithmetic enforcement', () => {
  it('contains deterministic authority visibility enforcer', () => {
    expect(src).toContain('function enforceAuthorityVisibilityAndSectionD(');
    expect(src).toContain('Inserted firm CDD Policy authority anchor in body reasoning');
    expect(src).toContain('Inserted CLC supervisory authority anchor in substantive body reasoning');
  });

  it('reconciles LSAG score AFTER item-level calibrations', () => {
    expect(src).toContain('Final LSAG arithmetic reconciliation must run AFTER all item-level status changes');
    expect(src).toContain('corrected = reconcileLsagScoreArithmetic(corrected, adjustments);');
    expect(src).toContain('Reconciled LSAG score line from checklist rows');
  });

  it('downgrades item 7 pass to partial in co-purchaser transfer context without clear benign explanation', () => {
    expect(src).toContain('Downgraded LSAG item 7 from Pass to Partial — co-purchaser transfer needs reconciliation');
    expect(src).toContain('hasClearBenignExplanation');
  });

  it('hardens ARMALYTIX_FORM_UPDATE parsing and reconciliation under allocation uncertainty', () => {
    expect(src).toContain('ARMALYTIX_FORM_UPDATE');
    expect(src).toContain('replace(/```(?:json)?/gi, "")');
    expect(src).toContain('Reconciled total_balance_proved/funding_gap with narrative allocation-unclear position');
  });
});

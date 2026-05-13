/**
 * Regression tests: Decision Log evidence-specificity rules
 *
 * Validates that the prompt instructions enforce granular, verifiable
 * evidence references in the Decision Log rather than file-name-only citations.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROMPT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

describe('Decision Log evidence-specificity prompt rules', () => {
  // ── Structure ──────────────────────────────────────────────────

  it('table has "Evidence Relied Upon (Specific Reference)" column', () => {
    expect(prompt).toContain('Evidence Relied Upon (Specific Reference)');
  });

  it('table has "Contradictory / Comparative Evidence" column', () => {
    expect(prompt).toContain('Contradictory / Comparative Evidence');
  });

  // ── Specificity rules ─────────────────────────────────────────

  it('contains EVIDENCE SPECIFICITY RULES section', () => {
    expect(prompt).toContain('EVIDENCE SPECIFICITY RULES (MANDATORY)');
  });

  it('requires document name in evidence references', () => {
    expect(prompt).toMatch(/Document name.*actual file name/i);
  });

  it('requires page / section / image area', () => {
    expect(prompt).toMatch(/Page \/ section \/ image area/i);
  });

  it('requires specific field, row, or data point', () => {
    expect(prompt).toMatch(/Specific field, row, or data point/i);
  });

  it('requires extracted fact', () => {
    expect(prompt).toMatch(/Extracted fact.*actual value or statement/i);
  });

  // ── Format examples by document type ──────────────────────────

  it('provides bank statement format example with date/amount/description', () => {
    expect(prompt).toMatch(/Bank statement:.*credit £[\d,]+.*from/);
  });

  it('provides Armalytix format example with page and section', () => {
    expect(prompt).toMatch(/Armalytix report:.*p\.\d+.*section/i);
  });

  it('provides passport/ID format example with specific field', () => {
    expect(prompt).toMatch(/Passport\/ID:.*passport number/i);
  });

  it('provides screenshot format example noting limitations', () => {
    expect(prompt).toMatch(/Screenshot:.*limited transaction visibility/i);
  });

  // ── Prohibited patterns ───────────────────────────────────────

  it('prohibits file-name-only references', () => {
    expect(prompt).toMatch(/PROHIBITED.*File name only/is);
  });

  it('prohibits generic descriptions', () => {
    expect(prompt).toMatch(/PROHIBITED.*Generic descriptions/is);
  });

  it('prohibits vague references', () => {
    expect(prompt).toMatch(/PROHIBITED.*Vague references/is);
  });

  // ── Contradictory evidence rules ──────────────────────────────

  it('requires contradictory column to show both sides of a discrepancy', () => {
    expect(prompt).toMatch(/competing document.*specific reference/i);
  });

  it('requires N/A for single-source decisions', () => {
    expect(prompt).toContain('N/A — single-source decision');
  });

  it('provides contradiction example with two document references', () => {
    expect(prompt).toMatch(/declares.*vs.*declares|shows.*vs.*shows/i);
  });

  // ── Decision categories ───────────────────────────────────────

  it('requires identity/data discrepancy logging (new category 8)', () => {
    expect(prompt).toMatch(/Identity \/ data discrepancies/i);
  });

  // ── Supervisory reconstruction standard ───────────────────────

  it('sets standard of reconstruction without re-opening documents', () => {
    expect(prompt).toContain('without needing to re-open the original documents');
  });

  // ── EVIDENCE_MAP alignment ────────────────────────────────────

  it('contains EVIDENCE_MAP ALIGNMENT section', () => {
    expect(prompt).toContain('EVIDENCE_MAP ALIGNMENT (MANDATORY)');
  });

  it('requires exact uploaded filename matching EVIDENCE_MAP document field', () => {
    expect(prompt).toMatch(/EXACT uploaded filename.*identical to EVIDENCE_MAP/i);
  });

  it('requires same page numbering as EVIDENCE_MAP', () => {
    expect(prompt).toMatch(/same page numbering as EVIDENCE_MAP/i);
  });

  it('requires snippet consistency with EVIDENCE_MAP', () => {
    expect(prompt).toMatch(/same verbatim text used in EVIDENCE_MAP/i);
  });

  it('defines Decision Log vs EVIDENCE_MAP scope difference', () => {
    expect(prompt).toMatch(/EVIDENCE_MAP.*comprehensive evidence inventory/i);
    expect(prompt).toMatch(/Decision Log.*concise decision-specific citations/i);
  });

  it('requires cross-reference consistency between both systems', () => {
    expect(prompt).toContain('cross-reference between them without ambiguity');
  });
});

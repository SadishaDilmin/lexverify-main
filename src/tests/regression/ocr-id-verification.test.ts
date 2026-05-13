/**
 * Regression tests: OCR / Image-Extraction Discrepancy Safeguard
 *
 * Validates that the prompt enforces second-pass verification for
 * identity document inconsistencies before classifying as confirmed discrepancies.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROMPT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

describe('OCR / ID discrepancy safeguard prompt rules', () => {
  // ── Section existence ──────────────────────────────────────────

  it('contains the OCR discrepancy safeguard section', () => {
    expect(prompt).toContain('OCR / IMAGE-EXTRACTION DISCREPANCY SAFEGUARD (REUSABLE RULE)');
  });

  it('lists common OCR error types', () => {
    expect(prompt).toContain('digit substitution');
    expect(prompt).toContain('partial character recognition');
    expect(prompt).toContain('MRZ parsing errors');
  });

  // ── Second-pass verification ───────────────────────────────────

  it('mandates second-pass verification before confirming ID discrepancy', () => {
    expect(prompt).toContain('MANDATORY SECOND-PASS VERIFICATION');
    expect(prompt).toContain('Do NOT immediately classify this as a confirmed discrepancy');
  });

  it('requires careful second visual read of the specific field', () => {
    expect(prompt).toContain('Perform a careful second visual read');
    expect(prompt).toContain('individual character shapes');
  });

  it('requires comparison of extraction sources when multiple images exist', () => {
    expect(prompt).toContain('Compare extraction sources');
    expect(prompt).toContain('compare your reads of BOTH images');
  });

  // ── Classification outcomes ────────────────────────────────────

  it('defines resolved-on-re-read outcome', () => {
    expect(prompt).toContain('on careful visual re-examination, the values are consistent');
  });

  it('defines persists-clearly outcome for real discrepancies', () => {
    expect(prompt).toContain('genuinely different numbers visible on two different documents');
  });

  it('defines uncertain outcome as Amber manual review, not Red', () => {
    expect(prompt).toContain('Possible OCR/image-reading inconsistency detected');
    expect(prompt).toContain('Manual visual review by the Compliance Officer is recommended');
    // Must NOT escalate uncertain cases to Red/Critical
    expect(prompt).toContain('Classify as **Amber** (manual review required), NOT Red/Critical');
  });

  // ── Decision Log integration ───────────────────────────────────

  it('requires Decision Log to record which field was flagged', () => {
    expect(prompt).toContain('Which specific field was flagged');
  });

  it('requires Decision Log to record what each extraction produced', () => {
    expect(prompt).toContain('What each extraction produced');
  });

  it('requires Decision Log to record second-pass outcome', () => {
    expect(prompt).toContain('confirmed discrepancy / resolved on re-read / referred for manual visual review');
  });

  // ── Hard rule against premature fraud language ─────────────────

  it('prohibits confirmed discrepancy language without second-pass verification', () => {
    expect(prompt).toContain('Do NOT use language such as "passport numbers do not match"');
    expect(prompt).toContain('OCR errors on photographed documents are common');
  });

  // ── Preserves existing forgery heuristics ──────────────────────

  it('still contains Visual Forgery Heuristics for genuine fraud detection', () => {
    expect(prompt).toContain('Visual Forgery Heuristics (Multimodal Add-on)');
    expect(prompt).toContain('Font Consistency');
    expect(prompt).toContain('MRZ Validation');
  });

  // ── Forger-motive sanity check (near-clone rule) ───────────────

  it('contains the forger-motive sanity check rule', () => {
    expect(prompt).toContain('FORGER-MOTIVE SANITY CHECK');
    expect(prompt).toContain('A genuine forger has no rational motive to fabricate a document that differs from the original by a single digit');
  });

  it('defaults near-clone disagreements to Amber, never Red', () => {
    expect(prompt).toContain('Default classification for such near-identical disagreements: **Amber — manual visual review**, never Red / Critical');
  });

  it('lists fields the near-clone rule applies to', () => {
    expect(prompt).toContain('passport numbers, MRZ digits, document numbers');
    expect(prompt).toContain('dates of birth, expiry dates, issue dates');
    expect(prompt).toContain('driving-licence numbers');
  });

  it('lists exclusions where near-clone rule does NOT apply', () => {
    expect(prompt).toContain('Two genuinely DIFFERENT documents for the same person');
    expect(prompt).toContain('Cross-source amount/date mismatches in financial transactions');
    expect(prompt).toContain('typed declarations or digital text PDFs');
    expect(prompt).toContain('MRZ check-digit failure');
  });

  it('teaches the agent how to consume OCR-CORROBORATION blocks', () => {
    expect(prompt).toContain('HOW TO READ [OCR-CORROBORATION] BLOCKS');
    expect(prompt).toContain('Two independent OCR reads were performed');
  });
});

// ── Worker prompt parity (sowPromptDomains.ts) ─────────────────────

const DOMAINS_PATH = path.resolve(__dirname, '../../../src/lib/sowPromptDomains.ts');
const domainsSrc = fs.readFileSync(DOMAINS_PATH, 'utf-8');

describe('OCR safeguard parity in domain-split worker prompts', () => {
  it('Risk & Compliance worker carries the forger-motive rule', () => {
    expect(domainsSrc).toContain('Forger-Motive Sanity Check');
    expect(domainsSrc).toContain('A genuine forger has no rational motive to fabricate a document that differs from the original by a single digit');
  });

  it('Risk & Compliance worker defaults to Amber for near-clone ID disagreements', () => {
    expect(domainsSrc).toContain('Amber — manual visual review');
    expect(domainsSrc).toContain('never Red / Critical');
  });

  it('Risk & Compliance worker references OCR-CORROBORATION blocks', () => {
    expect(domainsSrc).toContain('OCR-CORROBORATION');
  });
});

// ── Shared utility presence ────────────────────────────────────────

const OCR_SIM_PATH = path.resolve(__dirname, '../../../supabase/functions/_shared/ocrSimilarity.ts');

describe('Shared ocrSimilarity utility', () => {
  it('exists and exports the near-clone predicate', () => {
    expect(fs.existsSync(OCR_SIM_PATH)).toBe(true);
    const src = fs.readFileSync(OCR_SIM_PATH, 'utf-8');
    expect(src).toContain('export function isNearCloneOcrArtifact');
    expect(src).toContain('export function levenshtein');
    expect(src).toContain('export function detectIdMismatchLanguage');
  });
});

// ── Validator integration ──────────────────────────────────────────

const VALIDATOR_PATH = path.resolve(__dirname, '../../../supabase/functions/sow-section-validator/index.ts');

describe('sow-section-validator near-clone suppression check', () => {
  const src = fs.readFileSync(VALIDATOR_PATH, 'utf-8');

  it('imports the shared OCR similarity utility', () => {
    expect(src).toContain('detectIdMismatchLanguage');
    expect(src).toContain('../_shared/ocrSimilarity.ts');
  });

  it('emits an id_field_near_clone_suppression finding when triggered', () => {
    expect(src).toContain('id_field_near_clone_suppression');
    expect(src).toContain('OCR / Image-Extraction Discrepancy Safeguard');
  });

  it('uses value-level near-clone detection (not just language)', () => {
    expect(src).toContain('extractCandidateIdValues');
    expect(src).toContain('findFirstNearCloneIdPair');
  });

  it('upgrades the finding to critical when a near-clone pair is confirmed', () => {
    // The validator should branch on nearClonePair and upgrade severity.
    expect(src).toContain('nearClonePair');
    expect(src).toContain("severity = \"critical\"");
    expect(src).toContain('edit distance');
  });

  it('logs the OCR safeguard outcome for observability', () => {
    expect(src).toContain('[sow-section-validator] OCR safeguard finding emitted');
  });
});

// ── Broadened ID-mismatch language patterns ────────────────────────

describe('Broadened ID_MISMATCH_PATTERNS in ocrSimilarity.ts', () => {
  const src = fs.readFileSync(OCR_SIM_PATH, 'utf-8');

  it('matches "Conflicting passports" headings', () => {
    expect(src).toMatch(/conflicting\\s\+passport/);
  });

  it('matches "two different passport numbers" wording', () => {
    expect(src).toMatch(/different\\s\+passport\\s\+number/);
    expect(src).toContain('(?:two|multiple)\\s+different\\s+passport\\s+number');
  });

  it('matches "presence of different passport numbers"', () => {
    expect(src).toContain('presence\\s+of\\s+different\\s+passport\\s+number');
  });

  it('matches "Critical Identity Discrepancy" header (not just confirmed)', () => {
    expect(src).toContain('critical\\s+identity\\s+discrepancy');
  });

  it('matches "indicator of (potential) identity (document) fraud"', () => {
    expect(src).toContain('indicator\\s+of\\s+(?:potential\\s+)?identity\\s+(?:document\\s+)?fraud');
  });

  it('matches "major red flag for identity fraud"', () => {
    expect(src).toContain('major\\s+red\\s+flag\\s+for\\s+identity\\s+(?:document\\s+)?fraud');
  });

  it('exports extractCandidateIdValues and findFirstNearCloneIdPair', () => {
    expect(src).toContain('export function extractCandidateIdValues');
    expect(src).toContain('export function findFirstNearCloneIdPair');
  });

  it('extractCandidateIdValues strips markdown wrappers before matching', () => {
    // Inline-document the documented behaviour so prompt drift is caught.
    expect(src).toContain("text.replace(/[`*_]+/g, \"\")");
  });

  it('findFirstNearCloneIdPair defaults assumeScanned to true', () => {
    expect(src).toContain('opts.assumeScanned ?? true');
  });
});

// ── Multi-filename clause (anti-evasion) ───────────────────────────

describe('Multi-filename clause prevents the "different filenames = different documents" loophole', () => {
  it('agent-chat prompt carries the MULTI-FILENAME CLAUSE', () => {
    expect(prompt).toContain('MULTI-FILENAME CLAUSE');
    expect(prompt).toContain('regardless of how many filenames the images are stored under');
    expect(prompt).toContain('Only escalate when the values differ by ≥3 characters');
  });

  it('agent-chat prompt includes the worked counter-example', () => {
    expect(prompt).toContain('R0258841');
    expect(prompt).toContain('R0258641');
    expect(prompt).toContain('Manual visual review by the Compliance Officer is recommended');
  });

  it('Risk & Compliance worker prompt carries the MULTI-FILENAME CLAUSE', () => {
    expect(domainsSrc).toContain('MULTI-FILENAME CLAUSE');
    expect(domainsSrc).toContain('R0258841');
    expect(domainsSrc).toContain('R0258641');
  });

  it('Risk & Compliance worker prompt forbids the broadened mismatch phrasings', () => {
    expect(domainsSrc).toContain('conflicting passports');
    expect(domainsSrc).toContain('two different passport numbers');
    expect(domainsSrc).toContain('critical identity discrepancy');
    expect(domainsSrc).toContain('indicator of identity (document) fraud');
  });
});

/**
 * Regression tests: Knowledge Base authority naming in live output
 *
 * Ensures the prompt instructs explicit naming of governing authorities
 * drawn from KB documents, with correct priority order and placement rules.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const AGENT_CHAT_PATH = path.resolve(__dirname, '../../../supabase/functions/agent-chat/index.ts');
const RESOLVE_SOW_PATH = path.resolve(__dirname, '../../../supabase/functions/resolve-sow-context/index.ts');
const agentChat = fs.readFileSync(AGENT_CHAT_PATH, 'utf-8');
const resolveSow = fs.readFileSync(RESOLVE_SOW_PATH, 'utf-8');

describe('KB authority naming — agent-chat prompt', () => {
  // ── Explicit authority naming rules ───────────────────────────
  it('contains EXPLICIT AUTHORITY NAMING RULES section', () => {
    expect(agentChat).toContain('EXPLICIT AUTHORITY NAMING RULES (MANDATORY)');
  });

  it('requires in-line attribution with Per phrasing', () => {
    expect(agentChat).toMatch(/Per LSAG AML Guidance 2025/);
    expect(agentChat).toMatch(/Per the firm's AML Policy/);
    expect(agentChat).toMatch(/Per the CLC Source of Funds Guidance/);
  });

  it('defines priority order: firm > regulatory > supervisory > general', () => {
    expect(agentChat).toMatch(/Firm-specific policies.*highest priority/i);
    expect(agentChat).toMatch(/Binding.*primary regulatory guidance/i);
    expect(agentChat).toMatch(/Supervisory.*inspection guidance/i);
    expect(agentChat).toMatch(/General external guidance/i);
  });

  it('specifies target citation count of 8–15', () => {
    expect(agentChat).toMatch(/8.15 explicit authority references/);
  });

  it('lists sections where authority naming applies', () => {
    expect(agentChat).toMatch(/Executive Summary.*major propositions/i);
    expect(agentChat).toMatch(/Person-level risk analysis/i);
    expect(agentChat).toMatch(/Decision Log reasoning/i);
    expect(agentChat).toMatch(/Compliance Officer Reliance Summary.*Section D/i);
  });

  it('warns against over-citation', () => {
    expect(agentChat).toMatch(/do NOT over-cite/i);
    expect(agentChat).toMatch(/must still read naturally/i);
  });

  // ── Compliance Officer Reliance Summary — Section D ───────────
  it('has four sub-sections (A, B, C, D) in Reliance Summary', () => {
    expect(agentChat).toContain('exactly four sub-sections');
  });

  it('Section D lists governing guidance and policy', () => {
    expect(agentChat).toContain('D. Governing Guidance and Policy Relied Upon');
  });

  it('Section D distinguishes case evidence, OSINT, and governing guidance', () => {
    expect(agentChat).toMatch(/Case evidence.*bank statements/i);
    expect(agentChat).toMatch(/External profile.*OSINT.*Companies House/i);
    expect(agentChat).toMatch(/Governing guidance and policy/i);
  });

  // ── Decision Log authority naming ─────────────────────────────
  it('Decision Log has category 9 for governing authority', () => {
    expect(agentChat).toContain('Governing authority for normative judgements');
  });

  it('Decision Log requires naming authority for normative decisions', () => {
    expect(agentChat).toMatch(/reasoning column MUST name the governing authority/i);
  });
});

describe('KB authority naming — resolve-sow-context', () => {
  it('instructs explicit authority naming in KB context preamble', () => {
    expect(resolveSow).toMatch(/EXPLICITLY NAME the governing authority/i);
  });

  it('defines priority order in resolve-sow-context', () => {
    expect(resolveSow).toMatch(/firm-specific policies.*primary regulatory guidance.*supervisory/i);
  });

  it('includes target citation count', () => {
    expect(resolveSow).toMatch(/8.15 explicit citations/);
  });
});

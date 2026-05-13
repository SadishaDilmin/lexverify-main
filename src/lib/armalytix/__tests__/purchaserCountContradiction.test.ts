/**
 * Unit tests for `rulePurchaserCountContradiction`.
 *
 * Pure-function tests covering the emit and omit paths. No DB, no mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  rulePurchaserCountContradiction,
  type PurchaserCountInputs,
  type PurchaserCountPartyInput,
} from '../exceptionEngine';

function party(overrides: Partial<PurchaserCountPartyInput>): PurchaserCountPartyInput {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
    full_name: overrides.full_name ?? null,
    role: overrides.role ?? null,
    on_mortgage: overrides.on_mortgage ?? null,
    contribution_amount: overrides.contribution_amount ?? null,
  };
}

function inputs(overrides: Partial<PurchaserCountInputs> = {}): PurchaserCountInputs {
  return {
    parties: overrides.parties ?? [],
    armalytixDetectedBuyerCount:
      overrides.armalytixDetectedBuyerCount ?? null,
  };
}

describe('rulePurchaserCountContradiction', () => {
  // ── Omit paths ──────────────────────────────────────────────────

  it('returns [] when inputs are undefined', () => {
    expect(rulePurchaserCountContradiction(undefined)).toEqual([]);
  });

  it('returns [] when parties array is empty', () => {
    expect(rulePurchaserCountContradiction(inputs({ parties: [] }))).toEqual([]);
  });

  it('returns [] when sole purchaser has no co-borrower or contribution signals', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [party({ id: 'p1', full_name: 'Alice', role: 'Purchaser', on_mortgage: true })],
      }),
    );
    expect(result).toEqual([]);
  });

  it('returns [] when all parties on mortgage are also declared as purchasers', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', full_name: 'Alice', role: 'Purchaser', on_mortgage: true }),
          party({ id: 'p2', full_name: 'Bob', role: 'Joint Purchaser', on_mortgage: true }),
        ],
      }),
    );
    expect(result).toEqual([]);
  });

  it('returns [] when armalytixDetectedBuyerCount matches declared purchaser count', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', role: 'Purchaser' }),
          party({ id: 'p2', role: 'Purchaser' }),
        ],
        armalytixDetectedBuyerCount: 2,
      }),
    );
    expect(result).toEqual([]);
  });

  it('returns [] when armalytixDetectedBuyerCount is 0 (treated as no signal)', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [party({ id: 'p1', role: 'Purchaser' })],
        armalytixDetectedBuyerCount: 0,
      }),
    );
    expect(result).toEqual([]);
  });

  it('does not treat a non-purchaser party with contribution_amount = 0 as a contributor signal', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', role: 'Purchaser' }),
          party({ id: 'p2', role: 'Solicitor', contribution_amount: 0 }),
        ],
      }),
    );
    expect(result).toEqual([]);
  });

  // ── Emit paths ──────────────────────────────────────────────────

  it('emits when a party is on the mortgage but not declared as a purchaser', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', full_name: 'Alice', role: 'Purchaser', on_mortgage: true }),
          party({ id: 'p2', full_name: 'Bob', role: 'Spouse', on_mortgage: true }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].exceptionType).toBe('purchaser_count_contradiction');
    expect(result[0].severity).toBe('high');
    expect(result[0].linkedRefTable).toBe('case_parties');
    expect(result[0].linkedRefId).toBe('p2');
    expect(result[0].linkedField).toBe('role');
    expect(result[0].rationale).toMatch(/mortgage/i);
    expect(result[0].rationale).toMatch(/Bob/);
    expect(result[0].canTriggerEnquiry).toBe(true);
    expect(result[0].reviewerConfirmationRequired).toBe(true);
  });

  it('emits when a non-purchaser party has a positive contribution_amount', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', full_name: 'Alice', role: 'Purchaser' }),
          party({ id: 'p2', full_name: 'Carol', role: 'Parent', contribution_amount: 50_000 }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].linkedRefId).toBe('p2');
    expect(result[0].rationale).toMatch(/contributing funds/i);
    expect(result[0].rationale).toMatch(/Carol/);
  });

  it('emits when armalytixDetectedBuyerCount differs from declared purchaser count', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [party({ id: 'p1', full_name: 'Alice', role: 'Purchaser' })],
        armalytixDetectedBuyerCount: 2,
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rationale).toMatch(/Armalytix data indicates 2 buyer\(s\) but 1 purchaser\(s\)/);
    expect(result[0].quantitativeBasis).toBe(
      'Declared purchasers: 1; Armalytix-detected buyers: 2',
    );
  });

  it('combines multiple signals into a single exception with concatenated rationale', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', full_name: 'Alice', role: 'Purchaser', on_mortgage: true }),
          party({ id: 'p2', full_name: 'Bob', role: 'Spouse', on_mortgage: true }),
          party({ id: 'p3', full_name: 'Carol', role: 'Parent', contribution_amount: 25_000 }),
        ],
        armalytixDetectedBuyerCount: 3,
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].rationale).toMatch(/on the mortgage/);
    expect(result[0].rationale).toMatch(/contributing funds/);
    expect(result[0].rationale).toMatch(/Armalytix data indicates 3/);
    // Anchor should be the first non-purchaser mortgage party.
    expect(result[0].linkedRefId).toBe('p2');
  });

  it('treats role tokens case-insensitively (purchaser, buyer, applicant)', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', role: 'JOINT BUYER', on_mortgage: true }),
          party({ id: 'p2', role: 'Co-Applicant', on_mortgage: true }),
        ],
      }),
    );
    expect(result).toEqual([]);
  });

  it('handles parties with null role gracefully and treats them as non-purchasers', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', full_name: 'Alice', role: 'Purchaser' }),
          party({ id: 'p2', full_name: 'Bob', role: null, on_mortgage: true }),
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].linkedRefId).toBe('p2');
  });

  it('uses "unnamed party" placeholder when full_name is missing', () => {
    const result = rulePurchaserCountContradiction(
      inputs({
        parties: [
          party({ id: 'p1', role: 'Purchaser' }),
          party({ id: 'p2', role: 'Spouse', on_mortgage: true }),
        ],
      }),
    );
    expect(result[0].rationale).toMatch(/unnamed party/);
  });

  // ── Null and missing-field handling (defensive regression) ──────
  describe('null and missing-field handling', () => {
    it('A-N1: does NOT emit when parties array is empty and armalytixDetectedBuyerCount is null', () => {
      const result = rulePurchaserCountContradiction(
        inputs({ parties: [], armalytixDetectedBuyerCount: null }),
      );
      expect(result).toEqual([]);
    });

    it('A-N2: does NOT emit when a single party has on_mortgage = null (null ≠ false ≠ true)', () => {
      const result = rulePurchaserCountContradiction(
        inputs({
          parties: [party({ id: 'p1', full_name: 'Alice', role: 'Purchaser', on_mortgage: null })],
        }),
      );
      expect(result).toEqual([]);
    });

    it('A-N3: does NOT emit when a non-purchaser party has contribution_amount = null', () => {
      const result = rulePurchaserCountContradiction(
        inputs({
          parties: [
            party({ id: 'p1', role: 'Purchaser' }),
            party({ id: 'p2', full_name: 'Bob', role: null, contribution_amount: null }),
          ],
        }),
      );
      expect(result).toEqual([]);
    });

    it('A-N4: does NOT emit when a non-purchaser party has contribution_amount = 0 (zero ≠ positive)', () => {
      const result = rulePurchaserCountContradiction(
        inputs({
          parties: [
            party({ id: 'p1', role: 'Purchaser' }),
            party({ id: 'p2', full_name: 'Bob', role: null, contribution_amount: 0 }),
          ],
        }),
      );
      expect(result).toEqual([]);
    });

    it('A-N5: does NOT emit when role is whitespace-only and no other contradiction signals exist', () => {
      const result = rulePurchaserCountContradiction(
        inputs({
          parties: [
            party({ id: 'p1', role: 'Purchaser' }),
            party({ id: 'p2', full_name: 'Bob', role: '   ' }),
          ],
        }),
      );
      expect(result).toEqual([]);
    });
  });
});

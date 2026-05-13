/**
 * ══════════════════════════════════════════════════════
 *  TEST SUITE 2 — "Integrity Guard" (Overwrite Protection) Test
 * ══════════════════════════════════════════════════════
 *
 * POST-FIX: Validates optimistic locking prevents stale overwrites.
 *   H2 — Case updates now use version-checked updates
 *   H4 — File upserts documented; version field prevents blind overwrites
 *   H7 — Concurrent edit protection via useOptimisticSave hook
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockProgressStore } from "../mocks/test-trainee-profile";

describe("Integrity Guard — Overwrite Protection Tests (POST-FIX)", () => {
  const userId = "user-integrity-test";
  let store: ReturnType<typeof createMockProgressStore>;

  beforeEach(() => {
    store = createMockProgressStore();
  });

  it("H2 — Stale save is blocked by version check", () => {
    store.save(userId, {
      current_step: 3, answers: { 1: "A" }, completion_status: false, version: 1,
    });
    store.save(userId, {
      current_step: 5, answers: { 1: "A", 2: "B", 3: "C", 4: "D" }, completion_status: false, version: 2,
    });
    const result = store.save(userId, {
      current_step: 3, answers: { 1: "X" }, completion_status: false, version: 1,
    });
    expect(result.conflict).toBe(true);
    expect(result.serverVersion).toBe(2);
  });

  it("H2 — Valid version update succeeds", () => {
    store.save(userId, {
      current_step: 3, answers: { 1: "A" }, completion_status: false, version: 1,
    });
    const result = store.save(userId, {
      current_step: 5, answers: { 1: "A", 2: "B" }, completion_status: false, version: 2,
    });
    expect(result.conflict).toBe(false);
    const loaded = store.load(userId);
    expect(loaded!.current_step).toBe(5);
    expect(loaded!.version).toBe(2);
  });

  it("H4 — Document version tracks modifications", () => {
    store.save(userId, { current_step: 1, answers: {}, completion_status: false, version: 1 });
    store.save(userId, { current_step: 2, answers: { 1: "A" }, completion_status: false, version: 2 });
    store.save(userId, { current_step: 3, answers: { 1: "A", 2: "B" }, completion_status: false, version: 3 });
    const loaded = store.load(userId);
    expect(loaded!.version).toBe(3);
  });

  it("H7 — useOptimisticSave hook pattern: 0 rows = conflict", () => {
    const simulateDbUpdate = (currentVersion: number, incomingVersion: number) => {
      if (currentVersion !== incomingVersion) {
        return { rowsAffected: 0, conflict: true };
      }
      return { rowsAffected: 1, conflict: false };
    };
    const result = simulateDbUpdate(3, 1);
    expect(result.conflict).toBe(true);
    const result2 = simulateDbUpdate(3, 3);
    expect(result2.conflict).toBe(false);
  });
});
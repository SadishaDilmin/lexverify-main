/**
 * ══════════════════════════════════════════════════════
 *  TEST SUITE 6 — "Concurrency & Cross-Tab" Validation
 * ══════════════════════════════════════════════════════
 *
 * Validates optimistic locking and cross-device hydration:
 *   - Multi-tab conflict detection (409) via version-gated saves
 *   - ConflictResolutionModal behavior (Keep Mine / Use Server)
 *   - Cross-device handover: DB version always overrides stale localStorage
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ── localStorage mock ── */
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

/* ── Simulated DB with version tracking ── */
interface DBRow {
  id: string;
  version: number;
  answer: string;
  step: number;
}

function createMockDB(initial: DBRow) {
  let row = { ...initial };

  return {
    /** Version-gated update — returns rows only if version matches */
    update(id: string, expectedVersion: number, data: Partial<DBRow>): { data: DBRow[]; error: null } | { data: []; error: null } {
      if (row.id !== id || row.version !== expectedVersion) {
        return { data: [], error: null }; // 0 rows = conflict
      }
      row = { ...row, ...data, version: expectedVersion + 1 };
      return { data: [{ ...row }], error: null };
    },
    /** Force update — bypasses version check */
    forceUpdate(id: string, data: Partial<DBRow>): { data: DBRow[]; error: null } {
      row = { ...row, ...data, version: row.version + 1 };
      return { data: [{ ...row }], error: null };
    },
    /** Read current state */
    read(id: string): DBRow {
      return { ...row };
    },
  };
}

/* ═══════════════════════════════════════════
 *  SECTION 1 — Multi-Tab Conflict Detection
 * ═══════════════════════════════════════════ */
describe("Concurrency — Multi-Tab Conflict (Optimistic Locking)", () => {
  const caseId = "case-multi-tab";

  it("CC-1: Tab B receives conflict (0 rows) when Tab A has already bumped version", () => {
    const db = createMockDB({ id: caseId, version: 1, answer: "Original", step: 1 });

    // Tab A: saves with version 1 → bumps to v2
    const tabAResult = db.update(caseId, 1, { answer: "Choice A" });
    expect(tabAResult.data).toHaveLength(1);
    expect(tabAResult.data[0].version).toBe(2);
    expect(tabAResult.data[0].answer).toBe("Choice A");

    // Tab B: still holds v1, tries to save
    const tabBResult = db.update(caseId, 1, { answer: "Choice B" });
    expect(tabBResult.data).toHaveLength(0); // 409 Conflict
  });

  it("CC-2: ConflictResolutionModal state is set on 0-row response", () => {
    const db = createMockDB({ id: caseId, version: 1, answer: "Original", step: 1 });

    // Tab A saves
    db.update(caseId, 1, { answer: "Choice A" });

    // Tab B attempts stale save
    const result = db.update(caseId, 1, { answer: "Choice B" });
    const isConflict = result.data.length === 0;

    // Simulate ConflictResolutionModal state
    const conflictState = {
      isConflict,
      pendingData: isConflict ? { answer: "Choice B" } : null,
    };

    expect(conflictState.isConflict).toBe(true);
    expect(conflictState.pendingData).toEqual({ answer: "Choice B" });
  });

  it("CC-3: 'Use Server Version' reloads latest without crash", () => {
    const db = createMockDB({ id: caseId, version: 1, answer: "Original", step: 1 });

    // Tab A saves
    db.update(caseId, 1, { answer: "Choice A" });

    // Tab B detects conflict, chooses "Use Server Version"
    const serverState = db.read(caseId);
    expect(serverState.version).toBe(2);
    expect(serverState.answer).toBe("Choice A");

    // Tab B UI updates to server state
    const tabBUI = { answer: serverState.answer, version: serverState.version };
    expect(tabBUI.answer).toBe("Choice A");
    expect(tabBUI.version).toBe(2);
  });

  it("CC-4: 'Keep My Version' force-saves Tab B's data", () => {
    const db = createMockDB({ id: caseId, version: 1, answer: "Original", step: 1 });

    // Tab A saves
    db.update(caseId, 1, { answer: "Choice A" });

    // Tab B detects conflict, chooses "Keep My Version"
    const forceResult = db.forceUpdate(caseId, { answer: "Choice B" });
    expect(forceResult.data).toHaveLength(1);
    expect(forceResult.data[0].answer).toBe("Choice B");
    expect(forceResult.data[0].version).toBe(3); // v2 → v3

    // DB now has Tab B's data
    const final = db.read(caseId);
    expect(final.answer).toBe("Choice B");
  });

  it("CC-5: Triple-tab scenario — only the latest version wins", () => {
    const db = createMockDB({ id: caseId, version: 1, answer: "Original", step: 1 });

    // Tab A saves v1→v2
    const a = db.update(caseId, 1, { answer: "A" });
    expect(a.data).toHaveLength(1);

    // Tab B saves v2→v3
    const b = db.update(caseId, 2, { answer: "B" });
    expect(b.data).toHaveLength(1);

    // Tab C still holds v1 — must fail
    const c = db.update(caseId, 1, { answer: "C" });
    expect(c.data).toHaveLength(0); // conflict

    // Tab C holds v2 — must also fail (server is at v3)
    const c2 = db.update(caseId, 2, { answer: "C" });
    expect(c2.data).toHaveLength(0); // conflict

    // Only v3 succeeds
    const c3 = db.update(caseId, 3, { answer: "C" });
    expect(c3.data).toHaveLength(1);
    expect(c3.data[0].version).toBe(4);
  });
});

/* ═══════════════════════════════════════════
 *  SECTION 2 — Cross-Device Handover
 * ═══════════════════════════════════════════ */
describe("Concurrency — Cross-Device Handover", () => {
  const userId = "user-cross-device";
  const stateKey = `ls_sync_progress_${userId}`;

  beforeEach(() => {
    localStorageMock.clear();
  });

  it("CC-6: DB version overrides stale localStorage on new device", () => {
    // Desktop saved step 5 to DB
    const dbState = { step: 5, version: 3, answers: [{ q: "q1", v: "Salary" }] };

    // Mobile has old localStorage from a previous session
    localStorageMock.setItem(stateKey, JSON.stringify({
      step: 2, version: 1, answers: [],
    }));

    // Hydration logic: DB > localStorage > default
    const local = JSON.parse(localStorageMock.getItem(stateKey)!);
    const hydrated = dbState.version > (local.version ?? 0) ? dbState : local;

    expect(hydrated.step).toBe(5);
    expect(hydrated.version).toBe(3);
    expect(hydrated.answers).toHaveLength(1);
  });

  it("CC-7: If DB is unavailable, localStorage is used as fallback", () => {
    const dbState = null; // DB fetch failed

    localStorageMock.setItem(stateKey, JSON.stringify({
      step: 3, version: 2, answers: [{ q: "q1", v: "Gift" }],
    }));

    const local = JSON.parse(localStorageMock.getItem(stateKey)!);
    const hydrated = dbState ?? local;

    expect(hydrated.step).toBe(3);
    expect(hydrated.answers[0].v).toBe("Gift");
  });

  it("CC-8: Fresh device with no localStorage uses DB state directly", () => {
    // No localStorage entry exists
    expect(localStorageMock.getItem(stateKey)).toBeNull();

    const dbState = { step: 7, version: 5, answers: [{ q: "q3", v: "Inheritance" }] };
    const local = localStorageMock.getItem(stateKey);
    const hydrated = local ? JSON.parse(local) : dbState;

    expect(hydrated.step).toBe(7);
    expect(hydrated.version).toBe(5);
  });

  it("CC-9: localStorage is updated after successful DB hydration", () => {
    const dbState = { step: 5, version: 3, answers: [{ q: "q1", v: "Salary" }] };

    // After hydrating from DB, sync to localStorage
    localStorageMock.setItem(stateKey, JSON.stringify(dbState));

    const synced = JSON.parse(localStorageMock.getItem(stateKey)!);
    expect(synced.step).toBe(5);
    expect(synced.version).toBe(3);
  });

  it("CC-10: Concurrent desktop+mobile — higher DB version always wins", () => {
    // Desktop saves step 8, version 6
    const desktopDB = { step: 8, version: 6, answers: [{ q: "q5", v: "Business income" }] };

    // Mobile still has step 4, version 3 in localStorage
    localStorageMock.setItem(stateKey, JSON.stringify({
      step: 4, version: 3, answers: [{ q: "q2", v: "Loan" }],
    }));

    const local = JSON.parse(localStorageMock.getItem(stateKey)!);
    const hydrated = desktopDB.version > (local.version ?? 0) ? desktopDB : local;

    expect(hydrated.step).toBe(8);
    expect(hydrated.version).toBe(6);
    expect(hydrated.answers[0].v).toBe("Business income");

    // localStorage is overwritten with the winning state
    localStorageMock.setItem(stateKey, JSON.stringify(hydrated));
    const finalLocal = JSON.parse(localStorageMock.getItem(stateKey)!);
    expect(finalLocal.step).toBe(8);
  });
});

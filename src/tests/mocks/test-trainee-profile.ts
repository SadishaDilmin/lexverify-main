/**
 * Mock Trainee Profile & State
 * ─────────────────────────────
 * Local-only mock — does NOT touch production Supabase tables.
 * Used by the Regression & Safety Suite to simulate trainee state.
 */

export interface TraineeProgress {
  current_step: number;
  answers: Record<number, string>;
  completion_status: boolean;
  version: number;
  last_saved_at: string;
}

export interface TraineeProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  position: string;
  firm_name: string;
  active: boolean;
  ai_disclaimer_accepted_at: string | null;
  role: "admin" | "user";
}

/* ── Seed data ── */

export const MOCK_TRAINEE_PROGRESS: TraineeProgress = {
  current_step: 5,
  answers: { 1: "A", 2: "B", 3: "C", 4: "D" },
  completion_status: false,
  version: 1,
  last_saved_at: new Date().toISOString(),
};

export const MOCK_TRAINEE_PROFILE: TraineeProfile = {
  id: "profile-test-001",
  user_id: "user-test-001",
  full_name: "Test Trainee",
  email: "trainee@testfirm.co.uk",
  position: "Trainee Solicitor",
  firm_name: "Test & Co LLP",
  active: true,
  ai_disclaimer_accepted_at: null,
  role: "user",
};

export const MOCK_ADMIN_PROFILE: TraineeProfile = {
  id: "profile-admin-001",
  user_id: "user-admin-001",
  full_name: "Admin User",
  email: "admin@testfirm.co.uk",
  position: "Senior Partner",
  firm_name: "Test & Co LLP",
  active: true,
  ai_disclaimer_accepted_at: new Date().toISOString(),
  role: "admin",
};

/* ── In-memory store (replaces Supabase for tests) ── */

type SaveResult = { success: boolean; conflict: boolean; serverVersion?: number };

class LocalProgressStore {
  private store = new Map<string, TraineeProgress>();

  seed(userId: string, data: TraineeProgress) {
    this.store.set(userId, structuredClone(data));
  }

  load(userId: string): TraineeProgress | null {
    const d = this.store.get(userId);
    return d ? structuredClone(d) : null;
  }

  /** Alias for backward compat */
  get(userId: string) { return this.load(userId); }

  save(userId: string, incoming: { current_step: number; answers: Record<number, string>; completion_status: boolean; version: number }): SaveResult {
    const existing = this.store.get(userId);

    if (!existing) {
      // First save — just insert
      this.store.set(userId, {
        ...incoming,
        last_saved_at: new Date().toISOString(),
      });
      return { success: true, conflict: false };
    }

    // Optimistic-locking: incoming version must be > existing version
    if (incoming.version <= existing.version) {
      return { success: false, conflict: true, serverVersion: existing.version };
    }

    this.store.set(userId, {
      ...incoming,
      last_saved_at: new Date().toISOString(),
    });
    return { success: true, conflict: false };
  }

  /** Simulate a background/concurrent update (for Integrity Guard tests) */
  backgroundUpdate(userId: string, patch: Partial<TraineeProgress>) {
    const existing = this.store.get(userId);
    if (!existing) return;
    this.store.set(userId, {
      ...existing,
      ...patch,
      version: existing.version + 1,
      last_saved_at: new Date().toISOString(),
    });
  }

  reset() {
    this.store.clear();
  }
}

export const progressStore = new LocalProgressStore();

/** Factory for isolated test instances */
export function createMockProgressStore() {
  return new LocalProgressStore();
}

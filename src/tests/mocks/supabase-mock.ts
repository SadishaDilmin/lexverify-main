/**
 * Supabase Client Mock
 * ─────────────────────
 * Intercepts all Supabase calls during tests so nothing hits production.
 * Tracks every network-level call for the Observer Effect audit.
 */

import { vi } from "vitest";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RecordedCall {
  method: HttpMethod;
  table: string;
  timestamp: number;
  payload?: unknown;
}

class SupabaseCallRecorder {
  calls: RecordedCall[] = [];

  record(method: HttpMethod, table: string, payload?: unknown) {
    this.calls.push({ method, table, timestamp: Date.now(), payload });
  }

  getWriteCalls(): RecordedCall[] {
    return this.calls.filter((c) => c.method !== "GET");
  }

  getCallsForTable(table: string): RecordedCall[] {
    return this.calls.filter((c) => c.table === table);
  }

  reset() {
    this.calls = [];
  }
}

export const recorder = new SupabaseCallRecorder();

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
}

/** Build a chainable mock that records calls */
function chainable(_method: HttpMethod, table: string): MockChain {
  const chain = {} as MockChain;

  chain.select = vi.fn(() => {
    recorder.record("GET", table);
    return { data: [], error: null, single: vi.fn(() => ({ data: null, error: null })), eq: vi.fn(() => chain) };
  });
  chain.insert = vi.fn((payload: unknown) => {
    recorder.record("POST", table, payload);
    return { data: null, error: null, select: vi.fn(() => ({ data: [], error: null })) };
  });
  chain.update = vi.fn((payload: unknown) => {
    recorder.record("PUT", table, payload);
    return { data: null, error: null, eq: vi.fn(() => ({ data: null, error: null })) };
  });
  chain.upsert = vi.fn((payload: unknown) => {
    recorder.record("PUT", table, payload);
    return { data: null, error: null };
  });
  chain.delete = vi.fn(() => {
    recorder.record("DELETE", table);
    return { data: null, error: null, eq: vi.fn(() => ({ data: null, error: null })) };
  });
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => ({ data: null, error: null }));
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);

  return chain;
}

export const mockSupabaseClient = {
  from: vi.fn((table: string) => chainable("GET", table)),
  auth: {
    getSession: vi.fn(() =>
      Promise.resolve({ data: { session: null }, error: null })
    ),
    getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    signInWithPassword: vi.fn(() =>
      Promise.resolve({ data: { session: null, user: null }, error: null })
    ),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(() => ({ data: null, error: null })),
      download: vi.fn(() => ({ data: null, error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
    })),
  },
  functions: {
    invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
};

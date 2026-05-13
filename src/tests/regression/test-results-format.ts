/**
 * Test Results JSON Schema & Generator
 * ─────────────────────────────────────
 * Produces a structured test-results.json for CI/CD consumption.
 */

export interface TestResult {
  suite: string;
  test: string;
  status: "pass" | "fail" | "warn";
  audit_id: string;
  severity: "critical" | "high" | "medium";
  failure_path?: string;
  component?: string;
  edge_function?: string;
  description: string;
  timestamp: string;
}

export interface TestReport {
  platform: "Olimey AI (Lexora™)";
  run_date: string;
  total_tests: number;
  passed: number;
  failed: number;
  warnings: number;
  results: TestResult[];
}

/** Pre-populated baseline report from audit findings */
export const BASELINE_REPORT: TestReport = {
  platform: "Olimey AI (Lexora™)",
  run_date: new Date().toISOString(),
  total_tests: 10,
  passed: 0,
  failed: 3,
  warnings: 7,
  results: [
    // ── Critical ──
    {
      suite: "Fortress",
      test: "C1 — Ghost Route: DraftDocReview.tsx",
      status: "fail",
      audit_id: "C1",
      severity: "critical",
      failure_path: "src/App.tsx → missing <Route> for DraftDocReview",
      component: "src/pages/DraftDocReview.tsx",
      description: "DraftDocReview.tsx exists but has no route in App.tsx. Users get 404.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Fortress",
      test: "C2 — Missing Admin Role Guards",
      status: "fail",
      audit_id: "C2",
      severity: "critical",
      failure_path: "src/components/ProtectedRoute.tsx → no role check → /admin/* accessible to all authenticated users",
      component: "src/components/ProtectedRoute.tsx",
      description: "22 admin routes lack role='admin' guards. Any authenticated user can access them.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Refresh & Resume",
      test: "C3 — Disclaimer Persistence",
      status: "fail",
      audit_id: "C3",
      severity: "critical",
      failure_path: "src/components/ProtectedRoute.tsx → useState(false) → never reads profile.ai_disclaimer_accepted_at",
      component: "src/components/ProtectedRoute.tsx",
      description: "AI disclaimer accepted_at is saved to DB but never checked on reload. Forces re-acceptance every session.",
      timestamp: new Date().toISOString(),
    },
    // ── High ──
    {
      suite: "Refresh & Resume",
      test: "H1 — State-destroying reload in Settings",
      status: "warn",
      audit_id: "H1",
      severity: "high",
      failure_path: "src/pages/Settings.tsx:55 → window.location.reload()",
      component: "src/pages/Settings.tsx",
      description: "Profile save triggers full page reload, destroying all in-memory state.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Integrity Guard",
      test: "H2 — No optimistic locking on case updates",
      status: "warn",
      audit_id: "H2",
      severity: "high",
      failure_path: "supabase.from('cases').update({}).eq('id', id) — no version check",
      component: "src/pages/CaseWorkspace.tsx",
      description: "Case updates have no version/ETag check. Concurrent edits silently overwrite.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Refresh & Resume",
      test: "H3 — Auth race condition in AuthContext",
      status: "warn",
      audit_id: "H3",
      severity: "high",
      failure_path: "src/contexts/AuthContext.tsx → getSession + onAuthStateChange race",
      component: "src/contexts/AuthContext.tsx",
      description: "getSession and onAuthStateChange may fire profile/role fetches in parallel, causing stale state.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Integrity Guard",
      test: "H4 — upsert:true on file uploads",
      status: "warn",
      audit_id: "H4",
      severity: "high",
      failure_path: "storage.from('case-documents').upload(path, file, { upsert: true })",
      component: "src/lib/uploadUtils.ts",
      description: "File uploads use upsert:true which silently replaces existing files without version control.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Observer Effect",
      test: "H5 — Write operations during read-only sessions",
      status: "warn",
      audit_id: "H5",
      severity: "high",
      failure_path: "Audit log inserts triggered by page views",
      component: "src/components/ProtectedRoute.tsx",
      description: "Some read-only browsing may trigger audit_log inserts (disclaimer acceptance flow).",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Observer Effect",
      test: "H6 — Missing ErrorBoundary for lazy routes",
      status: "warn",
      audit_id: "H6",
      severity: "high",
      failure_path: "src/App.tsx → <Suspense> without <ErrorBoundary>",
      component: "src/App.tsx",
      description: "48+ lazy-loaded routes have no ErrorBoundary. Network failures crash the entire app.",
      timestamp: new Date().toISOString(),
    },
    {
      suite: "Integrity Guard",
      test: "H7 — No conflict detection on report edits",
      status: "warn",
      audit_id: "H7",
      severity: "high",
      failure_path: "supabase.from('ai_reports').update({}).eq('id', id)",
      component: "src/components/EditableReportTab.tsx",
      description: "AI report edits have no conflict detection. Parallel edits by two users will silently overwrite.",
      timestamp: new Date().toISOString(),
    },
  ],
};

/** Helper to generate the JSON output */
export function generateTestResultsJSON(): string {
  return JSON.stringify(BASELINE_REPORT, null, 2);
}

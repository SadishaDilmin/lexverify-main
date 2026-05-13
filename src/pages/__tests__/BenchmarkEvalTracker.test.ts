import { describe, it, expect } from "vitest";

/**
 * Unit tests for the per-case evaluation status tracking logic
 * used in AdminBenchmarkDashboard's runFullEvaluation.
 */

type CaseStatus = "pending" | "running" | "success" | "failed";
interface EvalCaseResult {
  id: string;
  title: string;
  status: CaseStatus;
}

// Mirror the state update logic from the dashboard
function updateStatus(prev: EvalCaseResult[], id: string, status: CaseStatus): EvalCaseResult[] {
  return prev.map(r => r.id === id ? { ...r, status } : r);
}

function initResults(cases: { id: string; title: string }[]): EvalCaseResult[] {
  return cases.map(c => ({ id: c.id, title: c.title, status: "pending" as const }));
}

describe("Evaluation per-case status tracker", () => {
  const mockCases = [
    { id: "c1", title: "Case Alpha" },
    { id: "c2", title: "Case Beta" },
    { id: "c3", title: "Case Gamma" },
    { id: "c4", title: "Case Delta" },
  ];

  it("initializes all cases as pending", () => {
    const results = initResults(mockCases);
    expect(results).toHaveLength(4);
    expect(results.every(r => r.status === "pending")).toBe(true);
  });

  it("transitions a case from pending to running", () => {
    let results = initResults(mockCases);
    results = updateStatus(results, "c1", "running");
    expect(results.find(r => r.id === "c1")?.status).toBe("running");
    expect(results.filter(r => r.status === "pending")).toHaveLength(3);
  });

  it("transitions a case from running to success", () => {
    let results = initResults(mockCases);
    results = updateStatus(results, "c2", "running");
    results = updateStatus(results, "c2", "success");
    expect(results.find(r => r.id === "c2")?.status).toBe("success");
  });

  it("transitions a case from running to failed", () => {
    let results = initResults(mockCases);
    results = updateStatus(results, "c3", "running");
    results = updateStatus(results, "c3", "failed");
    expect(results.find(r => r.id === "c3")?.status).toBe("failed");
  });

  it("handles concurrent status updates correctly", () => {
    let results = initResults(mockCases);
    // Simulate 3 concurrent: c1, c2, c3 running
    results = updateStatus(results, "c1", "running");
    results = updateStatus(results, "c2", "running");
    results = updateStatus(results, "c3", "running");
    expect(results.filter(r => r.status === "running")).toHaveLength(3);
    expect(results.filter(r => r.status === "pending")).toHaveLength(1);

    // c1 succeeds, c4 starts
    results = updateStatus(results, "c1", "success");
    results = updateStatus(results, "c4", "running");
    expect(results.filter(r => r.status === "running")).toHaveLength(3);
    expect(results.filter(r => r.status === "success")).toHaveLength(1);
    expect(results.filter(r => r.status === "pending")).toHaveLength(0);

    // c2 fails, c3 succeeds, c4 succeeds
    results = updateStatus(results, "c2", "failed");
    results = updateStatus(results, "c3", "success");
    results = updateStatus(results, "c4", "success");

    expect(results.filter(r => r.status === "success")).toHaveLength(3);
    expect(results.filter(r => r.status === "failed")).toHaveLength(1);
    expect(results.filter(r => r.status === "running")).toHaveLength(0);
    expect(results.filter(r => r.status === "pending")).toHaveLength(0);
  });

  it("computes summary counts correctly", () => {
    let results = initResults(mockCases);
    results = updateStatus(results, "c1", "success");
    results = updateStatus(results, "c2", "failed");
    results = updateStatus(results, "c3", "running");
    // c4 remains pending

    const doneCount = results.filter(r => r.status === "success").length;
    const failCount = results.filter(r => r.status === "failed").length;
    const pendingCount = results.filter(r => r.status === "pending" || r.status === "running").length;

    expect(doneCount).toBe(1);
    expect(failCount).toBe(1);
    expect(pendingCount).toBe(2);
  });

  it("does not mutate other cases when updating one", () => {
    const results = initResults(mockCases);
    const updated = updateStatus(results, "c2", "running");
    // Original unchanged
    expect(results.find(r => r.id === "c2")?.status).toBe("pending");
    // Updated correct
    expect(updated.find(r => r.id === "c2")?.status).toBe("running");
    // Others untouched
    expect(updated.find(r => r.id === "c1")?.status).toBe("pending");
    expect(updated.find(r => r.id === "c3")?.status).toBe("pending");
  });
});

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");

describe("Live-output low-balance wording guardrail hardening", () => {
  it("detects low-balance evidence phrasing used in live cases", () => {
    expect(agentChat).toContain("balance\\s+of\\s*£?");
    expect(agentChat).toContain("hasLowBalanceSignal");
  });

  it("requires spending-only debit analysis before allowing strong savings disproval language", () => {
    expect(agentChat).toContain("hasSpendingOnlyDebitAnalysis");
    expect(agentChat).toContain("predominantly|primarily|mostly");
    expect(agentChat).toContain("Detected low-balance overreach context without spending-only debit analysis");
  });

  it("downgrades over-assertive false/fabricated savings wording", () => {
    expect(agentChat).toContain("Replaced false/fabricated source-narrative wording in live-to-zero context");
    expect(agentChat).toContain("Replaced false/fabricated savings-claim wording in live-to-zero context");
    expect(agentChat).toContain("Replaced direct disprove wording for low-balance-only conclusions");
  });

  it("restrains layering/fraud certainty wording in low-balance-only context", () => {
    expect(agentChat).toContain("Softened layering-detected wording in low-balance context");
    expect(agentChat).toContain("Softened mortgage-fraud-indicator wording in low-balance context");
  });
});

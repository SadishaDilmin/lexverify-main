import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const RESOLVE_CONTEXT_PATH = path.resolve(__dirname, "../../../supabase/functions/resolve-sow-context/index.ts");

const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");
const resolveContext = fs.readFileSync(RESOLVE_CONTEXT_PATH, "utf-8");

describe("Runtime enforcement for persistent live-output defects", () => {
  it("adds runtime SoW output override block in resolve-sow-context", () => {
    expect(resolveContext).toContain("RUNTIME OUTPUT SAFETY OVERRIDES (NON-NEGOTIABLE)");
    expect(resolveContext).toContain("Co-purchaser vs gift classification");
    expect(resolveContext).toContain("Live-to-zero caution");
  });

  it("includes deterministic co-purchaser/live-to-zero enforcement function in agent-chat", () => {
    expect(agentChat).toContain("function enforceCoPurchaserAndLiveToZeroGuardrails(");
    expect(agentChat).toContain("Normalized LSAG item 10 from FAIL to N/A for co-purchaser context");
    expect(agentChat).toContain("Inserted deterministic live-to-zero reconciliation note");
  });

  it("applies deterministic enforcement in skipJudge post-processing path", () => {
    expect(agentChat).toContain("[sow-post-process][logic-enforcement]");
  });

  it("applies deterministic enforcement in non-skipJudge post-processing path", () => {
    expect(agentChat).toContain("[post-processing][logic-enforcement]");
  });
});

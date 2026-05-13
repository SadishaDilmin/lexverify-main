import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");

describe("Live-output authority naming and calibration enforcement", () => {
  it("inserts firm SoF/SoW Policy in-body with broadened triggers", () => {
    expect(agentChat).toContain("Inserted firm SoF/SoW Policy authority anchor in body reasoning (broadened trigger)");
    expect(agentChat).toContain("Inserted firm SoF/SoW Policy authority anchor after Executive Summary heading (fallback)");
  });

  it("inserts CLC AML / Source of Funds Guidance in substantive body reasoning", () => {
    expect(agentChat).toContain("Inserted CLC supervisory authority anchor in substantive body reasoning");
    expect(agentChat).toContain("Per the CLC AML / Source of Funds Guidance, it is not sufficient to observe that funds are held in a UK bank account; the firm must understand how and from where they were generated.");
  });

  it("injects governing authority naming into Decision Log rows when missing", () => {
    expect(agentChat).toContain("Injected governing authority naming into Decision Log rows");
    expect(agentChat).toContain("Per firm's CDD Policy");
    expect(agentChat).toContain("Per firm's SoF / SoW Policy");
    expect(agentChat).toContain("Per firm's AML Policy");
    expect(agentChat).toContain("Per CLC AML / Source of Funds Guidance");
  });

  it("calibrates Gkata SoW overstatement to per-purchaser analysis", () => {
    expect(agentChat).toContain("Incomplete Source of Wealth Evidence (see per-purchaser analysis below)");
    expect(agentChat).toContain("Calibrated Ms Gkata SoW finding");
    expect(agentChat).toContain("employment/income is evidenced, but the declared savings path or declared contribution narrative is not fully established on current evidence");
  });

  it("broadens ARMALYTIX contribution nullification to catch 'contribution split is not reliably evidenced'", () => {
    expect(agentChat).toContain("(?:individual\\s+)?contribution\\s+split");
    expect(agentChat).toContain("contribution\\s+split\\s+(?:is\\s+)?(?:unclear|not\\s+reliably\\s+evidenced)");
  });
});

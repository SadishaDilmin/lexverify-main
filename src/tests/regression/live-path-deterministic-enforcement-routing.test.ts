import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const SOW_SUBMIT_PATH = path.resolve(__dirname, "../../hooks/useSoWSubmit.ts");

const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");
const sowSubmit = fs.readFileSync(SOW_SUBMIT_PATH, "utf-8");

describe("Live-path deterministic enforcement routing", () => {
  it("enables skipJudge in retry consolidation path", () => {
    expect(sowSubmit).toContain("skipJudge: true");
    expect(sowSubmit).toContain("handleRetryConsolidation");
  });

  it("runs SoW deterministic post-processing for skipJudge requests without caseId gating", () => {
    expect(agentChat).toContain(
      "const needsSoWPostProcessing = skipJudge === true && agentId === \"source-of-wealth\";",
    );
  });

  it("runs non-skipJudge deterministic enforcement without buyer-enquiry case-ref hard gate", () => {
    expect(agentChat).toContain("if (agentId === \"source-of-wealth\") {");
  });

  it("reconciles multiline LSAG score blocks to 15", () => {
    expect(agentChat).toContain("Reconciled LSAG multiline score block from checklist rows");
  });

  it("treats uncertain allocation language as trigger for ARMALYTIX contribution nullification", () => {
    expect(agentChat).toContain("true\\s+contribution\\s+split\\s+(?:is\\s+)?uncertain");
    expect(agentChat).toContain("Reconciled total_balance_proved/funding_gap with narrative allocation-unclear position");
    // Broadened triggers also present
    expect(agentChat).toContain("unclear|uncertain|conflicting|unevidenced|unknown");
  });
});

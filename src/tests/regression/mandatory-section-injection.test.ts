import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");

describe("Mandatory section injection enforcement", () => {
  it("contains ensureMandatorySections function", () => {
    expect(agentChat).toContain("function ensureMandatorySections(");
  });

  it("injects Section D when missing with governance descriptions", () => {
    expect(agentChat).toContain("Injected missing Section D with governance descriptions from cited authorities");
    expect(agentChat).toContain("Section D: Governing Guidance and Policy Relied Upon");
  });

  it("injects Decision Log when missing with authority-anchored rows", () => {
    expect(agentChat).toContain("Injected missing Decision Log with authority-anchored rows derived from report findings");
    expect(agentChat).toContain("Per firm's CDD Policy");
    expect(agentChat).toContain("Per firm's SoF / SoW Policy");
    expect(agentChat).toContain("Per firm's AML Policy");
  });

  it("rebuilds LSAG checklist to full 15-item template when fewer items present", () => {
    expect(agentChat).toContain("Rebuilt LSAG checklist from");
    expect(agentChat).toContain("items to full 15-item template");
    expect(agentChat).toContain("Injected missing LSAG checklist with full 15-item template");
  });

  it("defines all 15 LSAG items in canonical order", () => {
    expect(agentChat).toContain("Client Identity Verified");
    expect(agentChat).toContain("Proof of Address Obtained");
    expect(agentChat).toContain("Source of Funds Identified");
    expect(agentChat).toContain("Source of Wealth Identified");
    expect(agentChat).toContain("Deposit Structure Verified");
    expect(agentChat).toContain("Mortgage Details Confirmed");
    expect(agentChat).toContain("Velocity of Funds Check");
    expect(agentChat).toContain("Third-Party Funding Check");
    expect(agentChat).toContain("Sanctions & PEP Screening");
    expect(agentChat).toContain("Giftor Proportionality");
    expect(agentChat).toContain("Ongoing Monitoring");
    expect(agentChat).toContain("Electronic Verification");
    expect(agentChat).toContain("Retainer & File Notes");
    expect(agentChat).toContain("Linked Transactions");
    expect(agentChat).toContain("Risk Assessment & Scoring");
  });

  it("broadens ARMALYTIX contribution nullification triggers", () => {
    expect(agentChat).toContain("Broadened ARMALYTIX contribution_amount nullification");
    expect(agentChat).toContain("unclear|uncertain|conflicting|unevidenced|unknown");
    expect(agentChat).toContain("not\\s+(?:reliably|clearly|separately)\\s+evidenced");
  });

  it("has mandatory output sections checklist in the system prompt", () => {
    expect(agentChat).toContain("MANDATORY OUTPUT SECTIONS (NON-NEGOTIABLE)");
    expect(agentChat).toContain("Section D MUST list every authority relied upon with governance descriptions");
    expect(agentChat).toContain("minimum 5 rows, with governing authority named");
    expect(agentChat).toContain("ALL 15 items numbered 1–15, every time, no exceptions");
  });

  it("calls ensureMandatorySections after enforceAuthorityVisibilityAndSectionD", () => {
    const authIdx = agentChat.indexOf("enforceAuthorityVisibilityAndSectionD(corrected, adjustments)");
    const mandatoryIdx = agentChat.indexOf("ensureMandatorySections(corrected, adjustments)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(mandatoryIdx).toBeGreaterThan(-1);
    expect(mandatoryIdx).toBeGreaterThan(authIdx);
  });
});

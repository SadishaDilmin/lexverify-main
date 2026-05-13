import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");

describe("Live-output wording proportionality enforcement", () => {
  // ── Issue 1: Low-balance savings logic breadth ──
  it("detects broad low-balance signal patterns", () => {
    expect(agentChat).toContain("only|just|mere(?:ly)?");
    expect(agentChat).toContain("balance\\s+(?:was|stood\\s+at|of)");
  });

  it("catches savings-could-not-have-been-accumulated wording", () => {
    expect(agentChat).toContain("savings?\\s+(?:could\\s+not|cannot|can\\s*not)");
    expect(agentChat).toContain("savings accumulation is not evidenced from this account alone");
  });

  it("catches false/untrue declaration wording in low-balance context", () => {
    expect(agentChat).toContain("(?:false|untrue)\\s+(?:declaration|statement|claim)");
    expect(agentChat).toContain("inconsistent declaration");
  });

  // ── Issue 2: Accusatory / criminal wording restraint ──
  it("detects classic-money-laundering wording", () => {
    expect(agentChat).toContain("classic\\s+money\\s+laundering");
    expect(agentChat).toContain("unusual transfer sequence");
  });

  it("detects designed-to-obscure wording", () => {
    expect(agentChat).toContain("designed\\s+to\\s+(?:obscure|conceal|disguise|hide)");
    expect(agentChat).toContain("transfer route with unclear rationale");
  });

  it("detects potential-fraud/laundering wording", () => {
    expect(agentChat).toContain("potential\\s+(?:money\\s+laundering|fraud|criminal");
    expect(agentChat).toContain("elevated risk");
  });

  it("detects criminal-conduct wording", () => {
    expect(agentChat).toContain("criminal\\s+(?:conduct|activity|proceeds)");
    // Criminal-conduct replacement in low-balance context
    expect(agentChat).toContain("suspicious activity");
  });

  // ── Issue 3: Contribution allocation overstatement ──
  it("catches zero-contribution overstatement for co-purchasers", () => {
    expect(agentChat).toContain("contribut(?:ed|ion)[:\\\\s]*£\\\\s*0");
    expect(agentChat).toContain("contribution not separately evidenced on current material");
  });

  // ── Issue 4: LSAG formatting corruption ──
  it("includes LSAG formatting repair rules", () => {
    expect(agentChat).toContain("Fixed broken LSAG checklist table row");
    expect(agentChat).toContain("Fixed double-pipe LSAG formatting corruption");
    expect(agentChat).toContain("Fixed LSAG row missing leading pipe");
    expect(agentChat).toContain("Fixed LSAG status marker missing trailing pipe");
  });

  // ── Issue 5: Prompt-control phrase leakage ──
  it("cleans prompt-control phrases from output", () => {
    expect(agentChat).toContain("Cleaned prompt-control phrase leakage");
  });
});

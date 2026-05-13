import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const AGENT_CHAT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const agentChat = fs.readFileSync(AGENT_CHAT_PATH, "utf-8");

describe("Live-output final hardening guardrails", () => {
  it("uses native replacement semantics so capture placeholders are not emitted literally", () => {
    expect(agentChat).toContain("const updated = source.replace(pattern, replacement);");
    expect(agentChat).not.toContain("source.replace(pattern, () =>");
  });

  it("restrains prosecutorial phrasing when criminal threshold is not explicitly met", () => {
    expect(agentChat).toContain("Softened deliberate-obfuscation wording without criminal-threshold evidence");
    expect(agentChat).toContain("Softened classic-money-laundering wording without criminal-threshold evidence");
    // Replacement strings use natural report language, not control phrases
    expect(agentChat).toContain("unusual transfer sequence");
    expect(agentChat).toContain("inconsistent transfer route");
  });

  it("hardens low-balance detection and blocks false/disproved savings conclusions", () => {
    expect(agentChat).toContain("pre[-\\s]?credit\\s+balance");
    expect(agentChat).toContain("hasIncompleteDestinationVisibility");
    expect(agentChat).toContain("not fully established on current evidence");
    expect(agentChat).toContain("does not by itself establish the savings narrative from this account alone");
  });

  it("qualifies contribution allocation overstatements in multi-purchaser cases", () => {
    expect(agentChat).toContain("primary evidenced source on current material (final allocation requires clarification)");
    expect(agentChat).toContain("deposit currently appears primarily funded by $1 on current material");
    expect(agentChat).toContain("Qualified £0 allocation statement for");
  });

  it("catches 'ultimate source' and 'entire deposit' overstatement variants", () => {
    expect(agentChat).toContain("Qualified ultimate-source overstatement in joint-purchaser context");
    expect(agentChat).toContain("Qualified entire-deposit-amount overstatement in joint-purchaser context");
    expect(agentChat).toContain("Qualified misrepresentation wording for co-purchaser contribution context");
  });

  it("repairs LSAG formatting corruption including literal $number row prefixes", () => {
    expect(agentChat).toContain("Fixed literal capture placeholder corruption in LSAG item 10");
    expect(agentChat).toContain("Fixed LSAG row prefix corruption with literal $number tokens");
    expect(agentChat).toContain("Fixed LSAG rows missing terminal pipe");
  });

  it("removes bare 'layering' without negative lookahead exceptions", () => {
    // The regex should catch ALL bare 'layering' instances, not just some
    expect(agentChat).toContain("Replaced bare 'layering' with proportionate wording");
    expect(agentChat).toContain("/\\blayering\\b/gi");
  });

  it("catches 'deliberate attempt to mislead' outside criminal threshold", () => {
    expect(agentChat).toContain("Replaced deliberate-attempt-to-mislead outside criminal threshold");
  });

  it("cleans prompt-control phrase leakage from output", () => {
    expect(agentChat).toContain("Cleaned prompt-control phrase leakage");
    // Replacement strings should not contain "requiring clarification" control language
    expect(agentChat).toContain("elevated risk indicator");
    expect(agentChat).toContain("inconsistent declaration");
    expect(agentChat).toContain("material inconsistency");
  });
});

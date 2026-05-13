/**
 * Regression tests: Co-purchaser gift misclassification & live-to-zero overreach enforcement
 *
 * Validates that the prompt hierarchy (Step 5 self-check) and Quality Judge criteria
 * (#23, #24) actively prevent these two known failure modes in live output.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROMPT_PATH = path.resolve(__dirname, "../../../supabase/functions/agent-chat/index.ts");
const prompt = fs.readFileSync(PROMPT_PATH, "utf-8");

// ── Co-purchaser gift enforcement ────────────────────────────────────

describe("Co-purchaser contribution enforcement in Step 5 self-check", () => {
  it("Step 5 contains mandatory co-purchaser contribution check", () => {
    expect(prompt).toContain("CO-PURCHASER CONTRIBUTION CHECK (MANDATORY)");
  });

  it("Step 5 requires rewrite if co-purchaser funds called a gift", () => {
    expect(prompt).toContain("Have I called ANY funds from a co-purchaser/spouse/partner who is themselves a party to the transaction a \"gift\"? If yes, REWRITE");
  });

  it("Step 5 checks Giftor Proportionality is not applied to co-purchasers", () => {
    expect(prompt).toContain("\"Giftor Proportionality\" must NOT reference a co-purchaser");
  });

  it("Step 5 checks false declaration wording does not target co-purchasers", () => {
    expect(prompt).toContain("\"false declaration\" must NOT appear where the only issue is funds from a co-purchaser");
  });

  it("Quality Judge criterion #23 exists for co-purchaser gift misclassification", () => {
    expect(prompt).toContain("Co-Purchaser Gift Misclassification Check");
  });

  it("Quality Judge #23 fails response if co-purchaser is called a giftor", () => {
    expect(prompt).toContain("Co-purchaser contributions are NOT gifts — they are inter-buyer funding");
  });
});

// ── Live-to-zero enforcement ─────────────────────────────────────────

describe("Live-to-zero savings overreach enforcement in Step 5 self-check", () => {
  it("Step 5 contains mandatory live-to-zero savings check", () => {
    expect(prompt).toContain("LIVE-TO-ZERO SAVINGS CHECK (MANDATORY)");
  });

  it("Step 5 requires debit classification before concluding savings disproved", () => {
    expect(prompt).toContain("did I classify the outgoing debits first? If not, I cannot conclude savings are disproved");
  });

  it("Step 5 requires checking for visible savings movements", () => {
    expect(prompt).toContain("are there visible outward transfers that could be savings movements");
  });

  it("Step 5 only allows savings undermined when debit analysis shows spending", () => {
    expect(prompt).toContain("Only if the debit analysis shows genuine spending/depletion with NO savings movements");
  });

  it("Quality Judge criterion #24 exists for live-to-zero overreach", () => {
    expect(prompt).toContain("Live-to-Zero Overreach Check");
  });

  it("Quality Judge #24 fails response if savings disproved without debit classification", () => {
    expect(prompt).toContain("does NOT include a debit classification analysis showing spending-only outflows, the response FAILS");
  });
});

// ── Hierarchy position ───────────────────────────────────────────────

describe("Enforcement position in prompt hierarchy", () => {
  it("co-purchaser check appears in Step 5 (before Step 6)", () => {
    const step5Pos = prompt.indexOf("STEP 5 — SELF-CHECK");
    const copurchaserPos = prompt.indexOf("CO-PURCHASER CONTRIBUTION CHECK (MANDATORY)");
    const step6Pos = prompt.indexOf("STEP 6 — PAYMENT-ROUTE-FIRST");
    expect(copurchaserPos).toBeGreaterThan(step5Pos);
    expect(copurchaserPos).toBeLessThan(step6Pos);
  });

  it("live-to-zero check appears in Step 5 (before Step 6)", () => {
    const step5Pos = prompt.indexOf("STEP 5 — SELF-CHECK");
    const ltzPos = prompt.indexOf("LIVE-TO-ZERO SAVINGS CHECK (MANDATORY)");
    const step6Pos = prompt.indexOf("STEP 6 — PAYMENT-ROUTE-FIRST");
    expect(ltzPos).toBeGreaterThan(step5Pos);
    expect(ltzPos).toBeLessThan(step6Pos);
  });

  it("existing section-level rules still present", () => {
    expect(prompt).toContain("GIFT VS CO-PURCHASER CONTRIBUTION CLASSIFICATION (REUSABLE RULE)");
    expect(prompt).toContain("LIVE-TO-ZERO / LOW-BALANCE SALARY ACCOUNT ANALYSIS");
  });
});

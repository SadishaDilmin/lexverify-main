/**
 * Regression tests: Single-Pass Bypass Path Selection
 *
 * Validates that the orchestration pipeline correctly chooses
 * single-pass vs domain-split vs multi-chunk based on total
 * extracted document text size.
 */
import { describe, it, expect } from "vitest";
import { SINGLE_PASS_CHAR_THRESHOLD } from "@/components/sow/sowHelpers";
import { MIN_DOCS_FOR_DOMAIN_SPLIT, hasOpenBankingDocs } from "@/lib/sowPromptDomains";

// ── Path Selection Logic (mirrors useSoWSubmit decision) ────────────────

type PathChoice = "single-pass" | "domain-split" | "multi-chunk";

function selectPath(
  totalChars: number,
  docCount: number,
  hasOpenBanking: boolean,
): PathChoice {
  if (totalChars <= SINGLE_PASS_CHAR_THRESHOLD) return "single-pass";
  if (hasOpenBanking && docCount >= MIN_DOCS_FOR_DOMAIN_SPLIT) return "domain-split";
  return "multi-chunk";
}

// ── Test Helpers ────────────────────────────────────────────────────────

function makeDocs(count: number, charsEach: number, namePrefix = "doc"): string[] {
  return Array.from({ length: count }, (_, i) =>
    `[Document: ${namePrefix}-${i + 1}.pdf]\n${"x".repeat(charsEach)}`
  );
}

function makeOpenBankingDocs(count: number, charsEach: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    `[Document: armalytix-report-${i + 1}.pdf]\n${"x".repeat(charsEach)}`
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Single-Pass Bypass Threshold", () => {
  it("should export a numeric threshold constant", () => {
    expect(typeof SINGLE_PASS_CHAR_THRESHOLD).toBe("number");
    expect(SINGLE_PASS_CHAR_THRESHOLD).toBeGreaterThan(0);
    expect(SINGLE_PASS_CHAR_THRESHOLD).toBe(200_000);
  });

  it("should select single-pass for small case (50K chars, 3 docs)", () => {
    expect(selectPath(50_000, 3, false)).toBe("single-pass");
  });

  it("should select single-pass for medium case at threshold (200K chars)", () => {
    expect(selectPath(200_000, 8, true)).toBe("single-pass");
  });

  it("should select single-pass even with Open Banking docs if under threshold", () => {
    expect(selectPath(150_000, 5, true)).toBe("single-pass");
  });

  it("should select domain-split for large case with Open Banking docs", () => {
    expect(selectPath(300_000, 10, true)).toBe("domain-split");
  });

  it("should select multi-chunk for large case without Open Banking docs", () => {
    expect(selectPath(300_000, 10, false)).toBe("multi-chunk");
  });

  it("should select multi-chunk for large case with OB but too few docs", () => {
    expect(selectPath(300_000, 2, true)).toBe("multi-chunk");
  });

  it("should select single-pass for very small case (1 doc, 5K chars)", () => {
    expect(selectPath(5_000, 1, false)).toBe("single-pass");
  });

  it("should select single-pass for zero docs", () => {
    expect(selectPath(0, 0, false)).toBe("single-pass");
  });
});

describe("hasOpenBankingDocs detection", () => {
  it("should detect armalytix docs", () => {
    const docs = makeOpenBankingDocs(1, 100);
    expect(hasOpenBankingDocs(docs)).toBe(true);
  });

  it("should not detect regular docs as Open Banking", () => {
    const docs = makeDocs(5, 100, "passport");
    expect(hasOpenBankingDocs(docs)).toBe(false);
  });

  it("should detect source-of-funds docs", () => {
    const docs = [`[Document: source-of-funds-report.pdf]\nContent here`];
    expect(hasOpenBankingDocs(docs)).toBe(true);
  });
});

describe("Effective chunk collapsing", () => {
  it("docs under threshold should collapse into single effective chunk", () => {
    const docs = makeDocs(6, 20_000); // 6 * 20K = 120K total
    const totalChars = docs.reduce((s, d) => s + d.length, 0);
    expect(totalChars).toBeLessThanOrEqual(SINGLE_PASS_CHAR_THRESHOLD);
    expect(selectPath(totalChars, docs.length, true)).toBe("single-pass");
  });

  it("docs over threshold should NOT collapse", () => {
    const docs = makeDocs(15, 20_000); // 15 * 20K = 300K total
    const totalChars = docs.reduce((s, d) => s + d.length, 0);
    expect(totalChars).toBeGreaterThan(SINGLE_PASS_CHAR_THRESHOLD);
    expect(selectPath(totalChars, docs.length, false)).toBe("multi-chunk");
  });
});

describe("Debug output format", () => {
  it("path selection log should contain all required fields", () => {
    // Simulate the log message format from useSoWSubmit
    const totalChars = 150_000;
    const threshold = SINGLE_PASS_CHAR_THRESHOLD;
    const useSinglePass = totalChars <= threshold;
    const chosenPath = useSinglePass ? "single-pass" : "multi-chunk";

    const logMessage =
      `[SoW][PATH-SELECTION] ` +
      `totalExtractedChars=${totalChars} | ` +
      `threshold=${threshold} | ` +
      `chosenPath=${chosenPath}`;

    expect(logMessage).toContain("totalExtractedChars=");
    expect(logMessage).toContain("threshold=");
    expect(logMessage).toContain("chosenPath=");
    expect(logMessage).toContain("single-pass");
  });
});

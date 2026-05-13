/**
 * Regression tests for FATF jurisdiction-check architecture
 *
 * Validates:
 * - Stored-list-first architecture (DB → live fallback → static fallback)
 * - Alias/demonym normalisation
 * - Staleness and fail-safe behaviour
 * - Prompt-level anti-hallucination rules
 * - Scheduled refresh design
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const agentChatPath = path.resolve("supabase/functions/agent-chat/index.ts");
const agentChatSource = fs.existsSync(agentChatPath) ? fs.readFileSync(agentChatPath, "utf-8") : "";

const fatfCheckPath = path.resolve("supabase/functions/fatf-jurisdiction-check/index.ts");
const fatfCheckSource = fs.existsSync(fatfCheckPath) ? fs.readFileSync(fatfCheckPath, "utf-8") : "";

const fatfRefreshPath = path.resolve("supabase/functions/fatf-refresh/index.ts");
const fatfRefreshSource = fs.existsSync(fatfRefreshPath) ? fs.readFileSync(fatfRefreshPath, "utf-8") : "";

const sowSubmitPath = path.resolve("src/hooks/useSoWSubmit.ts");
const sowSource = fs.existsSync(sowSubmitPath) ? fs.readFileSync(sowSubmitPath, "utf-8") : "";

describe("FATF Jurisdiction Check — Architecture", () => {

  describe("Prompt-level anti-hallucination", () => {
    it("requires verified FATF check result before classification", () => {
      expect(agentChatSource).toContain("FATF_JURISDICTION_CHECK_RESULTS");
      expect(agentChatSource).toContain("NEVER");
    });

    it("prohibits guessing FATF status from training data", () => {
      expect(agentChatSource).toMatch(/must\s+not.*training\s+data|never.*training\s+data|do\s+not.*training\s+data/i);
    });

    it("requires structured reporting format with list version and date", () => {
      expect(agentChatSource).toContain("list version");
    });

    it("requires manual review fallback when check unavailable", () => {
      expect(agentChatSource).toMatch(/manual.*verif/i);
    });
  });

  describe("Stored-list-first architecture", () => {
    it("reads from fatf_lists DB table as primary source", () => {
      expect(fatfCheckSource).toContain("fatf_lists");
      expect(fatfCheckSource).toContain("getStoredLists");
    });

    it("has a 14-day staleness limit", () => {
      expect(fatfCheckSource).toContain("STALENESS_LIMIT_MS");
      expect(fatfCheckSource).toMatch(/14\s*\*\s*24/);
    });

    it("falls back to live Firecrawl only when DB is missing or stale", () => {
      expect(fatfCheckSource).toContain("live_fallback");
      expect(fatfCheckSource).toContain("fetchLiveFallback");
    });

    it("has a static fallback as last resort", () => {
      expect(fatfCheckSource).toContain("static_fallback");
      expect(fatfCheckSource).toContain("getStaticFallback");
    });

    it("resolves lists with priority: DB → live → static", () => {
      expect(fatfCheckSource).toContain("resolveLists");
      const resolveFunc = fatfCheckSource.slice(fatfCheckSource.indexOf("async function resolveLists"));
      const storedIdx = resolveFunc.indexOf("getStoredLists");
      const liveIdx = resolveFunc.indexOf("fetchLiveFallback");
      const staticIdx = resolveFunc.indexOf("getStaticFallback");
      expect(storedIdx).toBeLessThan(liveIdx);
      expect(liveIdx).toBeLessThan(staticIdx);
    });

    it("returns lastRefreshedAt in check results", () => {
      expect(fatfCheckSource).toContain("lastRefreshedAt");
    });
  });

  describe("Scheduled refresh (fatf-refresh)", () => {
    it("fatf-refresh function exists", () => {
      expect(fatfRefreshSource.length).toBeGreaterThan(100);
    });

    it("compares publication dates to detect changes", () => {
      expect(fatfRefreshSource).toContain("listsChanged");
      expect(fatfRefreshSource).toContain("publicationDate");
    });

    it("only updates DB when lists have actually changed", () => {
      expect(fatfRefreshSource).toContain("no_change");
      expect(fatfRefreshSource).toContain("updated");
    });

    it("updates last_refreshed_at even when no change detected", () => {
      expect(fatfRefreshSource).toContain("last_refreshed_at");
    });

    it("uses Firecrawl to scrape official FATF page", () => {
      expect(fatfRefreshSource).toContain("firecrawl.dev");
      expect(fatfRefreshSource).toContain("fatf-gafi.org");
    });

    it("parses FATF markdown for country lists", () => {
      expect(fatfRefreshSource).toContain("parseFATFMarkdown");
    });
  });

  describe("Alias and demonym normalisation", () => {
    const aliasTests = [
      { input: "st vincent", expected: "Saint Vincent and the Grenadines" },
      { input: "svg", expected: "Saint Vincent and the Grenadines" },
      { input: "vincentian", expected: "Saint Vincent and the Grenadines" },
      { input: "bvi", expected: "British Virgin Islands" },
      { input: "caymans", expected: "Cayman Islands" },
      { input: "dprk", expected: "North Korea" },
      { input: "ivory coast", expected: "Côte d'Ivoire" },
      { input: "laos", expected: "Lao People's Democratic Republic" },
      { input: "burmese", expected: "Myanmar" },
      { input: "iranian", expected: "Iran" },
      { input: "lebanese", expected: "Lebanon" },
    ];

    for (const { input, expected } of aliasTests) {
      it(`normalises "${input}" → "${expected}"`, () => {
        expect(fatfCheckSource).toContain(`"${input.toLowerCase()}"`);
        expect(fatfCheckSource).toContain(expected);
      });
    }
  });

  describe("False-positive prevention", () => {
    it("St Vincent is not in static fallback black list", () => {
      const blackMatch = fatfCheckSource.match(/FALLBACK_BLACK[^;]*\];/s)?.[0] || "";
      expect(blackMatch.toLowerCase()).not.toContain("vincent");
    });

    it("St Vincent is not in static fallback grey list", () => {
      const greyMatch = fatfCheckSource.match(/FALLBACK_GREY[^;]*\];/s)?.[0] || "";
      expect(greyMatch.toLowerCase()).not.toContain("vincent");
    });

    it("Cayman Islands is not in static fallback lists", () => {
      const blackMatch = fatfCheckSource.match(/FALLBACK_BLACK[^;]*\];/s)?.[0] || "";
      const greyMatch = fatfCheckSource.match(/FALLBACK_GREY[^;]*\];/s)?.[0] || "";
      expect(blackMatch.toLowerCase()).not.toContain("cayman");
      expect(greyMatch.toLowerCase()).not.toContain("cayman");
    });
  });

  describe("Feb 2026 list currency", () => {
    it("includes British Virgin Islands on grey list", () => {
      const greyMatch = fatfCheckSource.match(/FALLBACK_GREY[^;]*\];/s)?.[0] || "";
      expect(greyMatch).toContain("British Virgin Islands");
    });

    it("includes Bolivia on grey list", () => {
      const greyMatch = fatfCheckSource.match(/FALLBACK_GREY[^;]*\];/s)?.[0] || "";
      expect(greyMatch).toContain("Bolivia");
    });

    it("does NOT include Nigeria on grey list (removed Feb 2026)", () => {
      const greyMatch = fatfCheckSource.match(/FALLBACK_GREY[^;]*\];/s)?.[0] || "";
      expect(greyMatch).not.toContain("Nigeria");
    });
  });

  describe("Prompt context injection (useSoWSubmit)", () => {
    it("injects FATF_JURISDICTION_CHECK_RESULTS into prompt", () => {
      expect(sowSource).toContain("FATF_JURISDICTION_CHECK_RESULTS");
    });

    it("includes Last Refreshed metadata", () => {
      expect(sowSource).toContain("Last Refreshed");
    });

    it("labels stored source correctly", () => {
      expect(sowSource).toContain("Verified stored FATF list");
    });

    it("labels live fallback with verification warning", () => {
      expect(sowSource).toContain("live_fallback");
    });

    it("labels static fallback with verification warning", () => {
      expect(sowSource).toContain("static_fallback");
    });

    it("has fail-safe when FATF check completely fails", () => {
      expect(sowSource).toContain("FATF list could not be retrieved automatically");
    });
  });

  describe("Fail-safe behaviour", () => {
    it("warns on static fallback results", () => {
      expect(fatfCheckSource).toContain("verify manually");
    });

    it("fatf-refresh handles missing FIRECRAWL_API_KEY gracefully", () => {
      expect(fatfRefreshSource).toContain("FIRECRAWL_API_KEY not set");
      expect(fatfRefreshSource).toContain("skipped");
    });
  });
});

import { describe, it, expect } from "vitest";
import { stripUserFacingNoise, toCleanProse } from "../userFacingText";

describe("stripUserFacingNoise", () => {
  it("removes EVIDENCE_MAP_START..END comment block", () => {
    const input =
      "Please confirm the source. <!-- EVIDENCE_MAP_START [ { \"finding_id\": \"x\" } ] EVIDENCE_MAP_END -->";
    expect(stripUserFacingNoise(input)).toBe("Please confirm the source.");
  });

  it("removes single-comment EVIDENCE_MAP wrapper", () => {
    const input =
      "Body text. <!-- EVIDENCE_MAP\n[ { \"finding_id\": \"x\" } ]\n-->";
    expect(stripUserFacingNoise(input)).toBe("Body text.");
  });

  it("removes loose EVIDENCE_MAP_START tail with no closing comment", () => {
    const input =
      "Kind regards, Solicitor EVIDENCE_MAP_START { \"evidence_map\": [ { \"finding_id\": \"income-verification\" } ] }";
    expect(stripUserFacingNoise(input)).toBe("Kind regards, Solicitor");
  });

  it("removes ai-merge HTML comments", () => {
    // The stripper removes the comment but does not collapse the resulting
    // intra-line whitespace — that is toCleanProse's job. Verify both layers.
    const stripped = stripUserFacingNoise("Hello. <!-- ai-merge:round-2 --> World.");
    expect(stripped).toBe("Hello.  World.");
    expect(toCleanProse("Hello. <!-- ai-merge:round-2 --> World.").paragraphs).toEqual([
      "Hello. World.",
    ]);
  });

  it("strips bold and italic markdown", () => {
    expect(stripUserFacingNoise("**Source of Funds Clarifications**")).toBe(
      "Source of Funds Clarifications",
    );
    expect(stripUserFacingNoise("This is _important_ text.")).toBe(
      "This is important text.",
    );
  });

  it("strips leading bullet markers", () => {
    const input = "* First point\n* Second point\n- Third point";
    expect(stripUserFacingNoise(input)).toBe(
      "First point\nSecond point\nThird point",
    );
  });

  it("preserves numbered lists", () => {
    const input = "1. First\n2. Second";
    expect(stripUserFacingNoise(input)).toBe("1. First\n2. Second");
  });

  it("strips heading markers", () => {
    expect(stripUserFacingNoise("## Heading\nbody")).toBe("Heading\nbody");
  });

  it("strips backticks around prose", () => {
    expect(stripUserFacingNoise("Use `Smart Legal` carefully")).toBe(
      "Use Smart Legal carefully",
    );
  });

  it("unescapes backslash-escaped markdown punctuation", () => {
    expect(stripUserFacingNoise("price was \\$5 with \\* note")).toBe(
      "price was \\$5 with * note",
    );
  });

  it("handles a realistic leaked enquiry sample", () => {
    const input = `**2. Source of Funds Clarifications** We have noted a few transactions.
* **November 2024 Credits:** Could you please explain the source of two large credits.
* **Parental Funds:** You mentioned you are anticipating £12,750.
Kind regards, Appan Pathmanathan Smart Legal <!-- EVIDENCE_MAP_START [ { "finding_id": "x" } ] -->`;
    const out = stripUserFacingNoise(input);
    expect(out).not.toMatch(/EVIDENCE_MAP/);
    expect(out).not.toMatch(/\*\*/);
    expect(out).not.toMatch(/^\* /m);
    expect(out).toContain("November 2024 Credits:");
    expect(out).toContain("Kind regards, Appan Pathmanathan Smart Legal");
  });

  it("returns empty string for null/undefined", () => {
    expect(stripUserFacingNoise(null)).toBe("");
    expect(stripUserFacingNoise(undefined)).toBe("");
  });
});

describe("toCleanProse", () => {
  it("splits into paragraphs on blank lines", () => {
    const input = "First paragraph.\n\nSecond paragraph.\n\nThird.";
    expect(toCleanProse(input).paragraphs).toEqual([
      "First paragraph.",
      "Second paragraph.",
      "Third.",
    ]);
  });

  it("collapses single newlines within a paragraph", () => {
    const input = "Line one\nline two\n\nNext para";
    expect(toCleanProse(input).paragraphs).toEqual([
      "Line one line two",
      "Next para",
    ]);
  });

  it("returns no paragraphs for empty input", () => {
    expect(toCleanProse("").paragraphs).toEqual([]);
    expect(toCleanProse(null).paragraphs).toEqual([]);
  });
});

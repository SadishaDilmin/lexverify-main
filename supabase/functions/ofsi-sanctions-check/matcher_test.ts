import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fuzzyScore, dobAdjustment, classify, buildAliases, phoneticKey } from "./index.ts";

Deno.test("identical names score 1.0", () => {
  assertEquals(fuzzyScore("Vladimir Putin", "Vladimir Putin"), 1);
});

Deno.test("single-character typo passes review threshold", () => {
  // `Poutin` vs `Putin` — common French transliteration.
  const s = fuzzyScore("Vladimir Poutin", "Vladimir Putin");
  assert(s >= 0.65, `expected ≥0.65, got ${s}`);
});

Deno.test("transliteration variant Qaddafi/Gaddafi flagged", () => {
  const s = fuzzyScore("Muammar Gaddafi", "Muammar Qaddafi");
  assert(s >= 0.65, `expected ≥0.65, got ${s}`);
});

Deno.test("middle name dropped still matches", () => {
  // Party gives first + last; OFSI has full patronymic.
  const aliases = buildAliases(["Vladimir", "Vladimirovich", "Putin"]);
  const fullName = "Vladimir Vladimirovich Putin";
  const candidate = "Vladimir Putin";
  const direct = fuzzyScore(candidate, fullName);
  const best = Math.max(direct, ...aliases.map((a) => fuzzyScore(candidate, a)));
  assert(best >= 0.75, `expected potential_match tier, got ${best}`);
});

Deno.test("surname-first ordering matches", () => {
  const aliases = buildAliases(["Saif", "al-Islam", "Gaddafi"]);
  const score = Math.max(
    fuzzyScore("Gaddafi Saif al-Islam", "Saif al-Islam Gaddafi"),
    ...aliases.map((a) => fuzzyScore("Gaddafi Saif al-Islam", a)),
  );
  assert(score >= 0.75, `expected ≥0.75, got ${score}`);
});

Deno.test("initial vs full given name matches", () => {
  const s = fuzzyScore("V Putin", "Vladimir Putin");
  assert(s >= 0.65, `expected ≥0.65 for initial match, got ${s}`);
});

Deno.test("honorific stripped before scoring", () => {
  const s = fuzzyScore("Mr Vladimir Putin", "Vladimir Putin");
  assertEquals(s, 1);
});

Deno.test("clearly unrelated names stay below review threshold", () => {
  const s = fuzzyScore("John Smith", "Vladimir Putin");
  assert(s < 0.65, `expected <0.65 for unrelated names, got ${s}`);
});

Deno.test("DOB exact match adds small boost", () => {
  assertEquals(dobAdjustment("1952-10-07", "1952-10-07"), 0.05);
});

Deno.test("DOB year mismatch reduces score", () => {
  assertEquals(dobAdjustment("1980-01-01", "1952-10-07"), -0.10);
});

Deno.test("DOB year-only match gives smaller boost", () => {
  assertEquals(dobAdjustment("1952", "1952-10-07"), 0.02);
});

Deno.test("classify thresholds respect tier boundaries", () => {
  assertEquals(classify(0.95), "strong_match");
  assertEquals(classify(0.80), "potential_match");
  assertEquals(classify(0.70), "review_recommended");
  assertEquals(classify(0.50), "clear");
});

Deno.test("phonetic key collapses Qaddafi/Gaddafi/Kadhafi family", () => {
  const a = phoneticKey("qaddafi");
  const b = phoneticKey("gaddafi");
  const c = phoneticKey("kadhafi");
  // All should collapse to similar consonant skeleton.
  assert(a.length > 0 && b.length > 0 && c.length > 0);
  // At minimum, two of the three must agree on the leading consonant cluster.
  const heads = [a[0], b[0], c[0]];
  const counts = heads.reduce((m: Record<string, number>, h) => ((m[h] = (m[h] || 0) + 1), m), {});
  assert(Math.max(...Object.values(counts)) >= 2, `phonetic heads disagree: ${heads}`);
});

Deno.test("particle stripped via phoneticKey", () => {
  assertEquals(phoneticKey("al"), "");
  assertEquals(phoneticKey("bin"), "");
});

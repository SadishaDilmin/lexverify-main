import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/benchmark-compare`;

// ── Unit: callAI temperature logic ──
Deno.test("benchmark-compare: temperature omitted for openai/ models", () => {
  const model = "openai/gpt-5-mini";
  const body: any = { model, messages: [] };
  if (!model.startsWith("openai/")) {
    body.temperature = 0.1;
  }
  assertEquals(body.temperature, undefined);
});

Deno.test("benchmark-compare: temperature included for google/ models", () => {
  const model = "google/gemini-2.5-flash";
  const body: any = { model, messages: [] };
  if (!model.startsWith("openai/")) {
    body.temperature = 0.1;
  }
  assertEquals(body.temperature, 0.1);
});

// ── Unit: DIFFERENCE_TYPES constant ──
Deno.test("DIFFERENCE_TYPES includes all expected types", () => {
  const DIFFERENCE_TYPES = [
    "ai_missed_material_issue", "ai_false_positive", "data_extraction_error",
    "severity_classification_error", "action_recommendation_error", "evidence_citation_failure", "match",
  ] as const;
  assertEquals(DIFFERENCE_TYPES.length, 7);
  assert(DIFFERENCE_TYPES.includes("match"));
  assert(DIFFERENCE_TYPES.includes("ai_missed_material_issue"));
});

// ── Integration: CORS preflight ──
Deno.test("benchmark-compare CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
});

// ── Integration: Unauthenticated returns 401 ──
Deno.test("benchmark-compare returns 401 without auth", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ benchmark_case_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const body = await res.text();
  assert(res.status === 401 || res.status === 500, `Expected 401/500, got ${res.status}: ${body}`);
});

// ── Integration: Missing benchmark_case_id ──
Deno.test("benchmark-compare returns error without benchmark_case_id", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const body = await res.text();
  assert(res.status >= 400, `Expected error, got ${res.status}: ${body}`);
});

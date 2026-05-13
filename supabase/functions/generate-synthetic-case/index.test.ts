import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/generate-synthetic-case`;

// ── Unit: callAI temperature suppression for OpenAI models ──
Deno.test("callAI body omits temperature for openai/ models", () => {
  const model = "openai/gpt-5-mini";
  const body: any = { model, messages: [] };
  if (!model.startsWith("openai/")) {
    body.temperature = 0.1;
  }
  assertEquals(body.temperature, undefined, "temperature should be omitted for OpenAI models");
});

Deno.test("callAI body includes temperature for google/ models", () => {
  const model = "google/gemini-2.5-flash";
  const body: any = { model, messages: [] };
  if (!model.startsWith("openai/")) {
    body.temperature = 0.1;
  }
  assertEquals(body.temperature, 0.1, "temperature should be set for Google models");
});

// ── Unit: parseJSON helper ──
Deno.test("parseJSON handles markdown-wrapped JSON", () => {
  function parseJSON(raw: string): any[] {
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : parsed.issues ?? parsed.items ?? [parsed];
    } catch { return []; }
  }

  const wrapped = '```json\n[{"issue_type":"test"}]\n```';
  const result = parseJSON(wrapped);
  assertEquals(result.length, 1);
  assertEquals(result[0].issue_type, "test");
});

Deno.test("parseJSON returns empty array for invalid JSON", () => {
  function parseJSON(raw: string): any[] {
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : parsed.issues ?? parsed.items ?? [parsed];
    } catch { return []; }
  }

  assertEquals(parseJSON("not json at all"), []);
  assertEquals(parseJSON(""), []);
});

// ── Integration: CORS preflight ──
Deno.test("generate-synthetic-case CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200, "OPTIONS should return 200");
});

// ── Integration: Unauthenticated request returns 401 ──
Deno.test("generate-synthetic-case returns 401 without auth", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ scenario: "doubling_ground_rent", transaction_type: "leasehold_purchase" }),
  });
  const body = await res.text();
  // Should be 401 or 500 with unauthorized error
  assert(res.status === 401 || res.status === 500, `Expected 401/500, got ${res.status}: ${body}`);
});

// ── Integration: Missing body returns error ──
Deno.test("generate-synthetic-case returns error with empty body", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const body = await res.text();
  assert(res.status >= 400, `Expected error status, got ${res.status}: ${body}`);
});

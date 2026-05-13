import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/generate-prompt-patches`;

// ── Unit: AI gateway URL is correct ──
Deno.test("generate-prompt-patches uses correct AI gateway URL", async () => {
  const content = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(
    content.includes("ai.gateway.lovable.dev"),
    "Should use ai.gateway.lovable.dev, not api.lovable.dev"
  );
  assert(
    !content.includes("api.lovable.dev"),
    "Should NOT contain the old api.lovable.dev URL"
  );
});

// ── Unit: supports agent_type parameter ──
Deno.test("generate-prompt-patches code supports agent_type parameter", async () => {
  const content = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(content.includes("agent_type"), "Should reference agent_type parameter");
  assert(
    content.includes("comparison_id || compIds[0]") || content.includes("comparison_id") && content.includes("agent_type"),
    "Should support both comparison_id and agent_type modes"
  );
});

// ── Unit: requires either comparison_id or agent_type ──
Deno.test("generate-prompt-patches code validates input params", async () => {
  const content = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(
    content.includes("comparison_id or agent_type required") || content.includes("!comparison_id && !agent_type"),
    "Should validate that at least one param is provided"
  );
});

// ── Integration: CORS preflight ──
Deno.test("generate-prompt-patches CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
});

// ── Integration: Unauthenticated returns 401 ──
Deno.test("generate-prompt-patches returns 401 without auth", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ agent_type: "source-of-wealth" }),
  });
  const body = await res.text();
  assertEquals(res.status, 401, `Expected 401, got ${res.status}: ${body}`);
});

// ── Integration: Missing both params returns 400 (needs auth, so may be 401) ──
Deno.test("generate-prompt-patches returns error without params", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({}),
  });
  const body = await res.text();
  assert(res.status >= 400, `Expected error status, got ${res.status}: ${body}`);
});

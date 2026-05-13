/**
 * fca-register-check — Checks the FCA Financial Services Register for firms and individuals.
 *
 * Uses the public FCA Register API (https://register.fca.org.uk/services/V0.1/)
 * to verify whether a firm/individual is authorised or regulated.
 *
 * Returns structured results for injection into the SoW prompt context.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FCA_API_BASE = "https://register.fca.org.uk/services/V0.1";

// ── Types ─────────────────────────────────────────────────────────────

interface FCAFirmResult {
  firmName: string;
  frnNumber: string;
  status: string; // "Authorised", "Registered", "No longer authorised", etc.
  statusCategory: "authorised" | "registered" | "no_longer_authorised" | "not_found" | "error";
  permissions: string[];
  sourceUrl: string;
  checkedAt: string;
}

interface FCACheckRequest {
  firms?: Array<{ name: string; frn?: string }>;
}

// ── FCA API helpers ───────────────────────────────────────────────────

async function searchFirmByName(name: string): Promise<FCAFirmResult | null> {
  try {
    const encodedName = encodeURIComponent(name.trim());
    const resp = await fetch(
      `${FCA_API_BASE}/Search?q=${encodedName}&type=firm`,
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) {
      console.error(`[fca-check] Search API error: ${resp.status}`);
      await resp.text(); // consume body
      return null;
    }
    const data = await resp.json();
    const results = data?.Data || [];
    if (results.length === 0) return null;

    // Find best match — exact or closest name match
    const nameLower = name.toLowerCase().trim();
    const exactMatch = results.find(
      (r: any) => r["Organisation Name"]?.toLowerCase().trim() === nameLower
    );
    const best = exactMatch || results[0];
    return parseFirmResult(best);
  } catch (e) {
    console.error("[fca-check] Search exception:", e);
    return null;
  }
}

async function lookupFirmByFRN(frn: string): Promise<FCAFirmResult | null> {
  try {
    const resp = await fetch(`${FCA_API_BASE}/Firm/${frn.trim()}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      if (resp.status === 404) {
        await resp.text();
        return null;
      }
      console.error(`[fca-check] FRN lookup error: ${resp.status}`);
      await resp.text();
      return null;
    }
    const data = await resp.json();
    const firmData = data?.Data?.[0] || data?.Data;
    if (!firmData) return null;
    return parseFirmResult(firmData);
  } catch (e) {
    console.error("[fca-check] FRN lookup exception:", e);
    return null;
  }
}

function parseFirmResult(raw: any): FCAFirmResult {
  const frn = raw["FRN"] || raw["Firm Reference Number"] || raw["FRNNumber"] || "";
  const name = raw["Organisation Name"] || raw["Name"] || "";
  const status = raw["Status"] || raw["Current Status"] || "Unknown";

  let statusCategory: FCAFirmResult["statusCategory"] = "not_found";
  const statusLower = status.toLowerCase();
  if (statusLower.includes("authorised") && !statusLower.includes("no longer")) {
    statusCategory = "authorised";
  } else if (statusLower.includes("registered")) {
    statusCategory = "registered";
  } else if (statusLower.includes("no longer") || statusLower.includes("cancelled") || statusLower.includes("withdrawn")) {
    statusCategory = "no_longer_authorised";
  }

  // Extract permissions if available
  const permissions: string[] = [];
  if (raw["Permissions"]) {
    if (Array.isArray(raw["Permissions"])) {
      for (const p of raw["Permissions"]) {
        if (p["Permission"] || p["Regulated Activity"]) {
          permissions.push(p["Permission"] || p["Regulated Activity"]);
        }
      }
    }
  }

  return {
    firmName: name,
    frnNumber: String(frn),
    status,
    statusCategory,
    permissions: permissions.slice(0, 5), // cap for context budget
    sourceUrl: `https://register.fca.org.uk/s/firm?id=${frn}`,
    checkedAt: new Date().toISOString(),
  };
}

// ── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { firms }: FCACheckRequest = await req.json();

    if (!Array.isArray(firms) || firms.length === 0) {
      return new Response(
        JSON.stringify({ error: "firms array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fca-check] Checking ${firms.length} firm(s)`);

    const results: FCAFirmResult[] = [];
    for (const firm of firms.slice(0, 10)) {
      let result: FCAFirmResult | null = null;

      // Prefer FRN lookup if available
      if (firm.frn) {
        result = await lookupFirmByFRN(firm.frn);
      }

      // Fall back to name search
      if (!result && firm.name) {
        result = await searchFirmByName(firm.name);
      }

      if (result) {
        results.push(result);
      } else {
        results.push({
          firmName: firm.name || firm.frn || "Unknown",
          frnNumber: firm.frn || "",
          status: "Not found on FCA Register",
          statusCategory: "not_found",
          permissions: [],
          sourceUrl: "https://register.fca.org.uk/s/",
          checkedAt: new Date().toISOString(),
        });
      }
    }

    // Build markdown summary
    let markdownSummary = "## FCA_REGISTER_CHECK_RESULTS\n\n";
    for (const r of results) {
      const statusEmoji =
        r.statusCategory === "authorised" ? "✅" :
        r.statusCategory === "registered" ? "✅" :
        r.statusCategory === "no_longer_authorised" ? "⚠️" : "❌";

      markdownSummary += `### ${r.firmName}\n`;
      markdownSummary += `- **FRN**: ${r.frnNumber || "N/A"}\n`;
      markdownSummary += `- **Status**: ${statusEmoji} ${r.status}\n`;
      if (r.permissions.length > 0) {
        markdownSummary += `- **Permissions**: ${r.permissions.join("; ")}\n`;
      }
      markdownSummary += `- **Source**: ${r.sourceUrl}\n`;
      markdownSummary += `- **Checked**: ${r.checkedAt}\n\n`;
    }

    return new Response(
      JSON.stringify({ results, markdownSummary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[fca-check] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

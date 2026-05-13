/**
 * fatf-refresh — Scheduled function that checks the official FATF page for updates
 * and refreshes the stored fatf_lists table only when the publication has changed.
 *
 * Uses Firecrawl to scrape the FATF public lists page.
 * Designed to run on a schedule (daily or twice-weekly) — NOT per case run.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FATF_SOURCE_URL =
  "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html";
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";

// ── FATF markdown parser ─────────────────────────────────────────
function parseFATFMarkdown(markdown: string): {
  blackList: string[];
  greyList: string[];
  publicationDate: string;
} {
  const lines = markdown.split("\n");
  let section: "none" | "black" | "grey" = "none";
  const blackList: string[] = [];
  const greyList: string[] = [];
  let publicationDate = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (/black\s*list/i.test(trimmed) && /^#+\s/.test(trimmed)) {
      section = "black";
      continue;
    }
    if (/grey\s*list/i.test(trimmed) && /^#+\s/.test(trimmed)) {
      section = "grey";
      continue;
    }

    if (section !== "none" && !publicationDate) {
      const dateMatch = trimmed.match(/(\d{1,2}\s+\w+\s+\d{4})/);
      if (dateMatch) publicationDate = dateMatch[1];
    }

    const countryMatch = trimmed.match(
      /^-\s*\[([^\]]+)\]\(https?:\/\/www\.fatf-gafi\.org\/en\/countries\/detail\//
    );
    if (countryMatch) {
      const name = normaliseCountryName(countryMatch[1].trim());
      if (section === "black") blackList.push(name);
      else if (section === "grey") greyList.push(name);
    }
  }

  return {
    blackList,
    greyList,
    publicationDate: publicationDate || "unknown",
  };
}

function normaliseCountryName(n: string): string {
  if (n === "Democratic People's Republic of Korea") return "North Korea";
  if (n === "Virgin Islands (UK)") return "British Virgin Islands";
  return n;
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Get the currently stored list
    const { data: currentList } = await supabase
      .from("fatf_lists")
      .select("*")
      .order("last_refreshed_at", { ascending: false })
      .limit(1)
      .single();

    const currentPubDate = currentList?.publication_date || "";

    // 2. Scrape live FATF page
    if (!firecrawlKey) {
      console.warn("[fatf-refresh] FIRECRAWL_API_KEY not set — skipping refresh");
      return new Response(
        JSON.stringify({
          action: "skipped",
          reason: "FIRECRAWL_API_KEY not configured",
          current_publication_date: currentPubDate,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[fatf-refresh] Scraping official FATF page...");
    const scrapeRes = await fetch(FIRECRAWL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: FATF_SOURCE_URL,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      console.error(`[fatf-refresh] Firecrawl error ${scrapeRes.status}: ${errText.slice(0, 300)}`);
      return new Response(
        JSON.stringify({
          action: "failed",
          reason: `Firecrawl returned ${scrapeRes.status}`,
          current_publication_date: currentPubDate,
          stored_list_still_valid: !!currentList,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scrapeData = await scrapeRes.json();
    const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";

    if (!markdown || markdown.length < 200) {
      console.error("[fatf-refresh] Insufficient content from Firecrawl");
      return new Response(
        JSON.stringify({
          action: "failed",
          reason: "Insufficient content from FATF page",
          current_publication_date: currentPubDate,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse the scraped content
    const parsed = parseFATFMarkdown(markdown);

    if (parsed.blackList.length === 0 && parsed.greyList.length === 0) {
      console.error("[fatf-refresh] Parser found no countries — page structure may have changed");
      return new Response(
        JSON.stringify({
          action: "failed",
          reason: "Parser found no countries — FATF page structure may have changed",
          current_publication_date: currentPubDate,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Compare with stored list — only update if publication changed or lists differ
    const listsChanged =
      parsed.publicationDate !== currentPubDate ||
      JSON.stringify(parsed.blackList.sort()) !==
        JSON.stringify((currentList?.black_list || []).sort()) ||
      JSON.stringify(parsed.greyList.sort()) !==
        JSON.stringify((currentList?.grey_list || []).sort());

    if (!listsChanged) {
      console.log(
        `[fatf-refresh] No change detected | publication=${parsed.publicationDate} | black=${parsed.blackList.length} | grey=${parsed.greyList.length}`
      );
      // Still update the last_refreshed_at to show we checked
      if (currentList?.id) {
        await supabase
          .from("fatf_lists")
          .update({ last_refreshed_at: new Date().toISOString() })
          .eq("id", currentList.id);
      }
      return new Response(
        JSON.stringify({
          action: "no_change",
          publication_date: parsed.publicationDate,
          black_count: parsed.blackList.length,
          grey_count: parsed.greyList.length,
          checked_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Lists have changed — upsert new data
    console.log(
      `[fatf-refresh] UPDATE DETECTED | old=${currentPubDate} → new=${parsed.publicationDate} | ` +
        `black=${parsed.blackList.length} | grey=${parsed.greyList.length}`
    );

    // Delete old rows and insert fresh (single-row design)
    await supabase.from("fatf_lists").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { error: insertErr } = await supabase.from("fatf_lists").insert({
      black_list: parsed.blackList,
      grey_list: parsed.greyList,
      publication_date: parsed.publicationDate,
      source_url: FATF_SOURCE_URL,
      last_refreshed_at: new Date().toISOString(),
      refresh_source: "live",
    });

    if (insertErr) {
      console.error("[fatf-refresh] DB insert error:", insertErr);
      return new Response(
        JSON.stringify({ action: "failed", reason: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        action: "updated",
        previous_publication_date: currentPubDate,
        new_publication_date: parsed.publicationDate,
        black_list: parsed.blackList,
        grey_list: parsed.greyList,
        black_count: parsed.blackList.length,
        grey_count: parsed.greyList.length,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fatf-refresh] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

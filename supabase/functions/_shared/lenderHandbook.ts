// Shared lender handbook fetching with DB cache (7-day expiry)
// Extracted from detect-title-defects for reuse across agents

export function lenderCacheKey(lenderName: string): string {
  return lenderName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const LENDER_SLUG_MAP: Record<string, string> = {
  "barclays": "barclays-bank-uk-plc",
  "barclays plc": "barclays-bank-uk-plc",
  "barclays bank": "barclays-bank-uk-plc",
  "barclays bank uk plc": "barclays-bank-uk-plc",
  "nationwide": "nationwide-building-society",
  "nationwide building society": "nationwide-building-society",
  "halifax": "halifax-division-of-bank-of-scotland-plc",
  "bank of scotland": "bank-of-scotland-plc",
  "lloyds": "lloyds-banking-group",
  "lloyds group plc": "lloyds-banking-group",
  "lloyds banking group": "lloyds-banking-group",
  "hsbc": "hsbc-bank-uk-plc",
  "hsbc bank": "hsbc-bank-uk-plc",
  "hsbc uk": "hsbc-bank-uk-plc",
  "natwest": "natwest",
  "natwest bank": "natwest",
  "rbs": "the-royal-bank-of-scotland-plc",
  "royal bank of scotland": "the-royal-bank-of-scotland-plc",
  "santander": "santander-uk-plc",
  "santander uk": "santander-uk-plc",
  "virgin money": "virgin-money",
  "virgin money uk": "virgin-money",
  "skipton": "skipton-building-society",
  "skipton building society": "skipton-building-society",
  "coventry building society": "coventry-building-society",
  "yorkshire building society": "yorkshire-building-society",
  "leeds building society": "leeds-building-society",
  "tsb": "tsb-bank-plc",
  "tsb bank": "tsb-bank-plc",
  "tsb bank plc": "tsb-bank-plc",
  "metro bank": "metro-bank-plc",
  "metro bank plc": "metro-bank-plc",
  "aldermore": "aldermore-bank-plc",
  "aldermore bank": "aldermore-bank-plc",
  "aldermore bank plc": "aldermore-bank-plc",
  "accord": "accord-mortgages-ltd",
  "accord mortgages": "accord-mortgages-ltd",
  "accord mortgages ltd": "accord-mortgages-ltd",
  "kensington": "kensington-mortgage-company-ltd",
  "kensington mortgages": "kensington-mortgage-company-ltd",
  "kensington mortgage company": "kensington-mortgage-company-ltd",
  "pepper money": "pepper-money",
  "pepper": "pepper-money",
  "together": "together-personal-finance-ltd",
  "together money": "together-personal-finance-ltd",
  "together personal finance": "together-personal-finance-ltd",
  "clydesdale bank": "clydesdale-bank-plc",
  "clydesdale": "clydesdale-bank-plc",
  "the mortgage works": "the-mortgage-works-uk-plc",
  "tmw": "the-mortgage-works-uk-plc",
  "mortgage works": "the-mortgage-works-uk-plc",
  "paragon": "paragon-bank-plc",
  "paragon bank": "paragon-bank-plc",
  "paragon mortgages": "paragon-bank-plc",
  "atom bank": "atom-bank-plc",
  "atom": "atom-bank-plc",
  "fleet mortgages": "fleet-mortgages-ltd",
  "fleet": "fleet-mortgages-ltd",
  "foundation home loans": "foundation-home-loans-ltd",
  "foundation": "foundation-home-loans-ltd",
  "precise mortgages": "precise-mortgages",
  "precise": "precise-mortgages",
  "handelsbanken": "handelsbanken-plc",
  "svenska handelsbanken": "handelsbanken-plc",
  "newcastle building society": "newcastle-building-society",
  "newcastle": "newcastle-building-society",
  "nottingham building society": "nottingham-building-society",
  "nottingham": "nottingham-building-society",
  "principality building society": "principality-building-society",
  "principality": "principality-building-society",
  "west bromwich building society": "west-bromwich-building-society",
  "west brom": "west-bromwich-building-society",
  "cumberland building society": "cumberland-building-society",
  "cumberland": "cumberland-building-society",
  "furness building society": "furness-building-society",
  "furness": "furness-building-society",
  "kent reliance": "onesavings-bank-plc",
  "onesavings bank": "onesavings-bank-plc",
  "osb": "onesavings-bank-plc",
  "standard life": "standard-life-home-finance-ltd",
  "scottish widows": "scottish-widows-bank-plc",
  "scottish widows bank": "scottish-widows-bank-plc",
  "cheltenham and gloucester": "cheltenham-and-gloucester-plc",
  "c&g": "cheltenham-and-gloucester-plc",
};

export async function fetchLenderHandbook(
  lenderName: string,
  supabase: any,
  logPrefix = "[lender-handbook]"
): Promise<{ content: string; fromCache: boolean }> {
  const cacheKey = lenderCacheKey(lenderName);

  // Check cache first
  const { data: cached } = await supabase
    .from("lender_handbook_cache")
    .select("handbook_markdown, expires_at")
    .eq("lender_key", cacheKey)
    .maybeSingle();

  if (cached && cached.handbook_markdown && new Date(cached.expires_at) > new Date()) {
    console.log(`${logPrefix} Cache HIT for "${lenderName}" (${cached.handbook_markdown.length} chars)`);
    return { content: cached.handbook_markdown, fromCache: true };
  }

  // Cache miss or expired — scrape via Firecrawl
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    console.warn(`${logPrefix} FIRECRAWL_API_KEY not set — skipping lender handbook lookup`);
    return { content: "", fromCache: false };
  }

  const lowerName = lenderName.toLowerCase().trim();
  const slug = LENDER_SLUG_MAP[lowerName] || cacheKey;
  const baseUrl = "https://lendershandbook.ukfinance.org.uk/lenders-handbook";
  let markdown = "";

  try {
    // Attempt 1: Firecrawl search
    console.log(`${logPrefix} Cache MISS — searching for "${lenderName}" handbook via Firecrawl`);
    const searchResp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `"${lenderName}" Part 2 mortgage lenders handbook site:lendershandbook.ukfinance.org.uk`,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const results = searchData.data || searchData.results || [];
      if (results.length > 0) {
        const combined = results
          .map((r: any) => `### ${r.title || r.url}\n\n${(r.markdown || r.description || "").slice(0, 15000)}`)
          .join("\n\n---\n\n");
        if (combined.length > 200) {
          console.log(`${logPrefix} Search returned ${results.length} results (${combined.length} chars)`);
          markdown = combined.slice(0, 40000);
        }
      }
    }

    // Attempt 2: Direct scrape fallback
    if (!markdown) {
      const handbookUrl = `${baseUrl}/englandandwales/${slug}/`;
      console.log(`${logPrefix} Search didn't return enough. Trying direct scrape: ${handbookUrl}`);
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: handbookUrl,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 5000,
          timeout: 25000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const scraped = data.data?.markdown || data.markdown || "";
        if (scraped.length > 100) {
          console.log(`${logPrefix} Direct scrape success: ${scraped.length} chars`);
          markdown = scraped.slice(0, 40000);
        }
      } else {
        const errBody = await response.text();
        console.warn(`${logPrefix} Direct scrape failed ${response.status}: ${errBody.slice(0, 200)}`);
      }
    }

    // Store in cache (upsert)
    if (markdown.length > 100) {
      const sections: { heading: string; excerpt: string }[] = [];
      const sectionRegex = /^#{1,4}\s+(.+)$/gm;
      let match;
      const headings: { heading: string; start: number }[] = [];
      while ((match = sectionRegex.exec(markdown)) !== null) {
        headings.push({ heading: match[1].trim(), start: match.index });
      }
      for (let i = 0; i < headings.length; i++) {
        const end = i + 1 < headings.length ? headings[i + 1].start : markdown.length;
        const body = markdown.slice(headings[i].start, end).trim();
        if (body.length < 30) continue;
        sections.push({
          heading: headings[i].heading,
          excerpt: body.slice(headings[i].heading.length + 4, headings[i].heading.length + 504).trim(),
        });
      }

      const { error: upsertErr } = await supabase
        .from("lender_handbook_cache")
        .upsert({
          lender_key: cacheKey,
          lender_name: lenderName,
          handbook_markdown: markdown,
          handbook_sections: sections,
          char_count: markdown.length,
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "lender_key" });

      if (upsertErr) {
        console.error(`${logPrefix} Failed to cache handbook:`, upsertErr.message);
      } else {
        console.log(`${logPrefix} Cached handbook for "${lenderName}" (${markdown.length} chars, ${sections.length} sections)`);
      }
    }

    return { content: markdown, fromCache: false };
  } catch (e) {
    console.error(`${logPrefix} Firecrawl lender lookup failed:`, e);
    return { content: "", fromCache: false };
  }
}

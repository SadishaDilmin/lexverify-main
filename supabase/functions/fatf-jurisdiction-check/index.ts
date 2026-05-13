/**
 * fatf-jurisdiction-check — Returns current FATF status for one or more jurisdictions.
 *
 * PRIMARY: reads from the stored `fatf_lists` DB table (refreshed by fatf-refresh schedule).
 * FALLBACK: if the stored list is missing or stale (>14 days since last refresh),
 *   attempts a live Firecrawl scrape. If that also fails, uses a dated static fallback
 *   clearly labelled so the model and user know it may be stale.
 *
 * This prevents the AI model from guessing FATF status from training data.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FATF_SOURCE_URL =
  "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html";
const STALENESS_LIMIT_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ── Fallback static list — used ONLY if DB + live fetch both fail ─
const FALLBACK_VERSION = "2026-02-13";
const FALLBACK_BLACK: string[] = ["North Korea", "Iran", "Myanmar"];
const FALLBACK_GREY: string[] = [
  "Algeria", "Angola", "Bolivia", "Bulgaria", "Cameroon",
  "Côte d'Ivoire", "Democratic Republic of Congo", "Haiti",
  "Kenya", "Kuwait", "Lao People's Democratic Republic",
  "Lebanon", "Monaco", "Namibia", "Nepal",
  "Papua New Guinea", "South Sudan", "Syria",
  "Venezuela", "Vietnam", "British Virgin Islands", "Yemen",
];

// ── Alias / demonym normalisation ────────────────────────────────
const ALIASES: Record<string, string> = {
  "drc": "Democratic Republic of Congo",
  "dr congo": "Democratic Republic of Congo",
  "democratic republic of the congo": "Democratic Republic of Congo",
  "congo (democratic republic)": "Democratic Republic of Congo",
  "ivory coast": "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  "cote divoire": "Côte d'Ivoire",
  "dprk": "North Korea",
  "democratic people's republic of korea": "North Korea",
  "lao pdr": "Lao People's Democratic Republic",
  "laos": "Lao People's Democratic Republic",
  "republic of korea": "South Korea",
  "south korea": "South Korea",
  "korea (south)": "South Korea",
  "korea (north)": "North Korea",
  "uae": "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  "türkiye": "Turkey",
  "turkiye": "Turkey",
  "uk": "United Kingdom",
  "united kingdom": "United Kingdom",
  "great britain": "United Kingdom",
  "usa": "United States",
  "united states of america": "United States",
  "st vincent": "Saint Vincent and the Grenadines",
  "st. vincent": "Saint Vincent and the Grenadines",
  "st vincent and the grenadines": "Saint Vincent and the Grenadines",
  "st. vincent and the grenadines": "Saint Vincent and the Grenadines",
  "saint vincent": "Saint Vincent and the Grenadines",
  "svg": "Saint Vincent and the Grenadines",
  "cayman islands": "Cayman Islands",
  "caymans": "Cayman Islands",
  "bvi": "British Virgin Islands",
  "british virgin islands": "British Virgin Islands",
  "virgin islands (british)": "British Virgin Islands",
  "virgin islands (uk)": "British Virgin Islands",
  "papua new guinea": "Papua New Guinea",
  "png": "Papua New Guinea",
  "nigerian": "Nigeria",
  "south african": "South Africa",
  "turkish": "Turkey",
  "emirati": "United Arab Emirates",
  "vietnamese": "Vietnam",
  "syrian": "Syria",
  "yemeni": "Yemen",
  "iranian": "Iran",
  "burmese": "Myanmar",
  "vincentian": "Saint Vincent and the Grenadines",
  "caymanian": "Cayman Islands",
  "lebanese": "Lebanon",
  "haitian": "Haiti",
  "kenyan": "Kenya",
  "algerian": "Algeria",
  "angolan": "Angola",
  "bulgarian": "Bulgaria",
  "filipino": "Philippines",
  "philippine": "Philippines",
  "nepalese": "Nepal",
  "nepali": "Nepal",
  "venezuelan": "Venezuela",
  "mozambican": "Mozambique",
  "namibian": "Namibia",
  "cameroonian": "Cameroon",
  "bolivian": "Bolivia",
  "kuwaiti": "Kuwait",
  "laotian": "Lao People's Democratic Republic",
  "tanzanian": "Tanzania",
  "croatian": "Croatia",
  "monegasque": "Monaco",
  "malian": "Mali",
  "senegalese": "Senegal",
};

function normalise(input: string): string {
  const trimmed = input.trim();
  return ALIASES[trimmed.toLowerCase()] || trimmed;
}

// ── Types ────────────────────────────────────────────────────────
interface FATFListData {
  blackList: string[];
  greyList: string[];
  publicationDate: string;
  lastRefreshedAt: string;
  source: "stored" | "live_fallback" | "static_fallback";
}

interface FATFCheckResult {
  input: string;
  resolvedJurisdiction: string;
  status: "black_list" | "grey_list" | "not_listed";
  publicationDate: string;
  sourceUrl: string;
  source: string;
  lastRefreshedAt: string;
  checkedAt: string;
  note: string;
}

// ── Get lists from DB (primary) ──────────────────────────────────
async function getStoredLists(supabase: ReturnType<typeof createClient>): Promise<FATFListData | null> {
  const { data, error } = await supabase
    .from("fatf_lists")
    .select("*")
    .order("last_refreshed_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.warn("[fatf-jurisdiction-check] No stored FATF list found in DB");
    return null;
  }

  const refreshedAt = new Date(data.last_refreshed_at).getTime();
  const age = Date.now() - refreshedAt;

  if (age > STALENESS_LIMIT_MS) {
    console.warn(
      `[fatf-jurisdiction-check] Stored list is STALE | age=${Math.round(age / 86400000)}d | ` +
        `publication=${data.publication_date} | last_refreshed=${data.last_refreshed_at}`
    );
    return null; // Force live fallback
  }

  console.log(
    `[fatf-jurisdiction-check] Using STORED list | publication=${data.publication_date} | ` +
      `refreshed=${data.last_refreshed_at} | age=${Math.round(age / 3600000)}h | ` +
      `black=${data.black_list.length} | grey=${data.grey_list.length}`
  );

  return {
    blackList: data.black_list,
    greyList: data.grey_list,
    publicationDate: data.publication_date,
    lastRefreshedAt: data.last_refreshed_at,
    source: "stored",
  };
}

// ── Live fallback via Firecrawl (only if DB is missing/stale) ────
async function fetchLiveFallback(): Promise<FATFListData | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return null;

  try {
    console.log("[fatf-jurisdiction-check] DB stale/missing — attempting live Firecrawl fallback...");
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: FATF_SOURCE_URL,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || "";
    if (!md || md.length < 200) return null;

    const parsed = parseFATFMarkdown(md);
    if (parsed.blackList.length === 0 && parsed.greyList.length === 0) return null;

    return {
      blackList: parsed.blackList,
      greyList: parsed.greyList,
      publicationDate: parsed.publicationDate,
      lastRefreshedAt: new Date().toISOString(),
      source: "live_fallback",
    };
  } catch {
    return null;
  }
}

function parseFATFMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  let section: "none" | "black" | "grey" = "none";
  const blackList: string[] = [];
  const greyList: string[] = [];
  let publicationDate = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (/black\s*list/i.test(trimmed) && /^#+\s/.test(trimmed)) { section = "black"; continue; }
    if (/grey\s*list/i.test(trimmed) && /^#+\s/.test(trimmed)) { section = "grey"; continue; }
    if (section !== "none" && !publicationDate) {
      const m = trimmed.match(/(\d{1,2}\s+\w+\s+\d{4})/);
      if (m) publicationDate = m[1];
    }
    const cm = trimmed.match(/^-\s*\[([^\]]+)\]\(https?:\/\/www\.fatf-gafi\.org\/en\/countries\/detail\//);
    if (cm) {
      let name = cm[1].trim();
      if (name === "Democratic People's Republic of Korea") name = "North Korea";
      if (name === "Virgin Islands (UK)") name = "British Virgin Islands";
      if (section === "black") blackList.push(name);
      else if (section === "grey") greyList.push(name);
    }
  }
  return { blackList, greyList, publicationDate: publicationDate || "unknown" };
}

// ── Static fallback (last resort) ────────────────────────────────
function getStaticFallback(): FATFListData {
  console.warn(`[fatf-jurisdiction-check] Using STATIC FALLBACK (${FALLBACK_VERSION}) — both DB and live unavailable`);
  return {
    blackList: FALLBACK_BLACK,
    greyList: FALLBACK_GREY,
    publicationDate: FALLBACK_VERSION,
    lastRefreshedAt: "static",
    source: "static_fallback",
  };
}

// ── Resolve lists with priority: DB → live → static ──────────────
async function resolveLists(supabase: ReturnType<typeof createClient>, forceRefresh: boolean): Promise<FATFListData> {
  if (!forceRefresh) {
    const stored = await getStoredLists(supabase);
    if (stored) return stored;
  }

  const live = await fetchLiveFallback();
  if (live) return live;

  return getStaticFallback();
}

// ── Jurisdiction check ───────────────────────────────────────────
function checkJurisdiction(input: string, lists: FATFListData): FATFCheckResult {
  const resolved = normalise(input);
  const resolvedLower = resolved.toLowerCase();
  const checkedAt = new Date().toISOString();

  const isBlack = lists.blackList.some((c) => c.toLowerCase() === resolvedLower);
  if (isBlack) {
    return {
      input, resolvedJurisdiction: resolved, status: "black_list",
      publicationDate: lists.publicationDate, sourceUrl: FATF_SOURCE_URL,
      source: lists.source, lastRefreshedAt: lists.lastRefreshedAt, checkedAt,
      note: `${resolved} is on the FATF Black List (Call for Action) as of ${lists.publicationDate}. Countermeasures apply under MLR 2017 Reg 33.`,
    };
  }

  const isGrey = lists.greyList.some((c) => c.toLowerCase() === resolvedLower);
  if (isGrey) {
    return {
      input, resolvedJurisdiction: resolved, status: "grey_list",
      publicationDate: lists.publicationDate, sourceUrl: FATF_SOURCE_URL,
      source: lists.source, lastRefreshedAt: lists.lastRefreshedAt, checkedAt,
      note: `${resolved} is on the FATF Grey List (Increased Monitoring) as of ${lists.publicationDate}.`,
    };
  }

  const staleWarning = lists.source === "static_fallback"
    ? " — WARNING: using static fallback list, verify manually against official FATF source"
    : "";

  return {
    input, resolvedJurisdiction: resolved, status: "not_listed",
    publicationDate: lists.publicationDate, sourceUrl: FATF_SOURCE_URL,
    source: lists.source, lastRefreshedAt: lists.lastRefreshedAt, checkedAt,
    note: `${resolved} is not currently on the FATF Black or Grey List (publication: ${lists.publicationDate})${staleWarning}.`,
  };
}

// ── Serve ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { jurisdictions, forceRefresh } = body;

    if (!jurisdictions || !Array.isArray(jurisdictions) || jurisdictions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'jurisdictions array is required (e.g. ["Nigeria", "Cayman Islands"])' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (jurisdictions.length > 20) {
      return new Response(
        JSON.stringify({ error: "Maximum 20 jurisdictions per request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lists = await resolveLists(supabase, forceRefresh === true);

    // Meta-request: return full lists for prompt context injection
    if (jurisdictions.length === 1 && jurisdictions[0] === "_list_all") {
      console.log(
        `[fatf-jurisdiction-check] List-all | source=${lists.source} | publication=${lists.publicationDate} | refreshed=${lists.lastRefreshedAt}`
      );
      return new Response(
        JSON.stringify({
          blackList: lists.blackList,
          greyList: lists.greyList,
          publicationDate: lists.publicationDate,
          sourceUrl: FATF_SOURCE_URL,
          source: lists.source,
          lastRefreshedAt: lists.lastRefreshedAt,
          checkedAt: new Date().toISOString(),
          listVersion: lists.publicationDate,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: FATFCheckResult[] = jurisdictions.map((j: string) =>
      checkJurisdiction(String(j), lists)
    );

    console.log(
      `[fatf-jurisdiction-check] Checked ${results.length} jurisdiction(s): ` +
        results.map((r) => `${r.resolvedJurisdiction}=${r.status}`).join(", ") +
        ` | source=${lists.source} | publication=${lists.publicationDate}`
    );

    return new Response(
      JSON.stringify({
        results,
        publicationDate: lists.publicationDate,
        sourceUrl: FATF_SOURCE_URL,
        source: lists.source,
        lastRefreshedAt: lists.lastRefreshedAt,
        checkedAt: new Date().toISOString(),
        listVersion: lists.publicationDate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fatf-jurisdiction-check] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

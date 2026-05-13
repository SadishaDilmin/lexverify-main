import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PersonInput {
  fullName: string;
  armalytixName?: string;
  occupation?: string;
  employer?: string;
  location?: string;
}

interface DiscoveredSource {
  sourceTitle: string;
  sourceUrl: string;
  extractedInformation: string;
  relevance: string;
  confidenceLevel: string;
  identityMatch: boolean;
  falsePositiveRisk?: string;
}

interface ProfileStructuredRow {
  professionalStatus: "verified" | "inconsistent" | "not_found" | "not_checked";
  professionalDetail: string;
  adverseMediaStatus: "none" | "review_recommended" | "not_checked";
  adverseMediaDetail: string;
  highestConfidence: "High" | "Medium" | "Low" | "None";
  identityMatched: boolean;
}

interface PersonProfile {
  fullName: string;
  sources: DiscoveredSource[];
  structuredRow?: ProfileStructuredRow;
  error?: string;
  cached?: boolean;
}

const MAX_TOTAL_API_CALLS = Infinity;
const PERSON_TIMEOUT_MS = 30_000;
const MAX_SOURCES_PER_PERSON = 5;
const MAX_MARKDOWN_CHARS = 6000;

// ── Cache key generation ──────────────────────────────────────────────
async function profileCacheKey(person: PersonInput): Promise<string> {
  const raw = [
    (person.fullName || "").toLowerCase().trim(),
    (person.occupation || "").toLowerCase().trim(),
    (person.employer || "").toLowerCase().trim(),
  ].join("|");
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function firecrawlSearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!resp.ok) {
      console.error(`Firecrawl search error: ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return data.data || [];
  } catch (e) {
    console.error("Firecrawl search exception:", e);
    return [];
  }
}

async function summariseWithAI(
  apiKey: string,
  personName: string,
  sources: { title: string; url: string; content: string }[],
  occupation?: string,
  employer?: string,
  location?: string
): Promise<DiscoveredSource[]> {
  if (sources.length === 0) return [];

  const sourceTexts = sources
    .map(
      (s, i) =>
        `### Source ${i + 1}: ${s.title}\nURL: ${s.url}\n\n${s.content.slice(0, 3000)}`
    )
    .join("\n\n---\n\n");

  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You are a profile intelligence analyst performing identity-verified research on "${personName}"${occupation ? ` (occupation: ${occupation})` : ""}${employer ? ` (employer: ${employer})` : ""}${location ? ` (location: ${location})` : ""}.

For each source, you MUST cross-reference the person's known occupation, employer, and location against the source content to determine identity match confidence.

CRITICAL RULES FOR CONFIDENCE LEVELS:
- "High": Name matches AND at least TWO of (occupation, employer, geographic area) are corroborated by the source content.
- "Medium": Name matches AND ONE of (occupation, employer, geographic area) is corroborated, OR the source contains unique identifying details consistent with this person.
- "Low": Name matches ONLY, with NO corroborating occupation, employer, or location data. This is likely a false positive.

LINKEDIN-SPECIFIC RULE: A LinkedIn profile that matches only by name but NOT by occupation, employer, or geographic area MUST be rated "Low" confidence with identityMatch=false and falsePositiveRisk explaining the mismatch (e.g. "LinkedIn profile is for a software engineer in California, not a solicitor in London").

COMPANIES HOUSE RULE: A directorship record matching by name alone without corroborating employer/location should be rated "Medium" at most.

Return structured data for each source with identityMatch (true if you are confident this is the same person) and falsePositiveRisk (explanation of why this might not be the right person, or empty string if confident match).`,
            },
            {
              role: "user",
              content: sourceTexts,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_profile_sources",
                description: "Return structured profile intelligence sources",
                parameters: {
                  type: "object",
                  properties: {
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          sourceTitle: { type: "string" },
                          sourceUrl: { type: "string" },
                          extractedInformation: { type: "string" },
                          relevance: { type: "string" },
                          confidenceLevel: {
                            type: "string",
                            enum: ["High", "Medium", "Low"],
                          },
                          identityMatch: {
                            type: "boolean",
                            description: "True if confident this source is about the same person",
                          },
                          falsePositiveRisk: {
                            type: "string",
                            description: "Explanation of why this might not be the correct person, or empty string if confident match",
                          },
                        },
                        required: [
                          "sourceTitle",
                          "sourceUrl",
                          "extractedInformation",
                          "relevance",
                          "confidenceLevel",
                          "identityMatch",
                          "falsePositiveRisk",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["sources"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_profile_sources" },
          },
        }),
      }
    );

    if (!resp.ok) {
      console.error(`AI summarise error: ${resp.status}`);
      return sources.map((s) => ({
        sourceTitle: s.title || "Unknown",
        sourceUrl: s.url,
        extractedInformation: s.content.slice(0, 500),
        relevance: "Requires manual review",
        confidenceLevel: "Low",
      }));
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return parsed.sources || [];
    }

    // Fallback: try to parse content as JSON
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return [];
  } catch (e) {
    console.error("AI summarise exception:", e);
    return [];
  }
}

async function discoverPerson(
  person: PersonInput,
  propertyAddress: string,
  firecrawlKey: string,
  lovableKey: string,
  apiCallBudget: { remaining: number }
): Promise<PersonProfile> {
  const { fullName, armalytixName, occupation, employer, location } = person;
  // Prefer the Armalytix-extracted legal name (includes middle names) over form input
  const searchName = armalytixName?.trim() || fullName;

  if (!searchName?.trim()) {
    return { fullName: fullName || "Unknown", sources: [], error: "No name provided" };
  }

  const queries: string[] = [];

  // LinkedIn search
  if (apiCallBudget.remaining > 0) {
    const parts = [`"${searchName}"`];
    if (occupation) parts.push(occupation);
    if (employer) parts.push(employer);
    parts.push("LinkedIn site:linkedin.com");
    queries.push(parts.join(" "));
  }

  // Companies House search
  if (apiCallBudget.remaining > 1) {
    queries.push(
      `"${searchName}" director site:find-and-update.company-information.service.gov.uk`
    );
  }

  // General professional footprint
  if (apiCallBudget.remaining > 2) {
    const parts = [`"${searchName}"`];
    if (occupation) parts.push(occupation);
    if (location) parts.push(location);
    else if (propertyAddress) {
      const addressParts = propertyAddress.split(",");
      if (addressParts.length > 1) parts.push(addressParts[addressParts.length - 1].trim());
    }
    queries.push(parts.join(" "));
  }

  const allRawSources: { title: string; url: string; content: string }[] = [];

  const searchTimeout = AbortSignal.timeout(PERSON_TIMEOUT_MS);

  for (const query of queries) {
    if (apiCallBudget.remaining <= 0) break;
    if (searchTimeout.aborted) break;

    apiCallBudget.remaining--;
    const results = await firecrawlSearch(firecrawlKey, query);

    for (const result of results) {
      if (result.url && (result.markdown || result.description)) {
        allRawSources.push({
          title: result.title || result.url,
          url: result.url,
          content: result.markdown || result.description || "",
        });
      }
    }
  }

  // Deduplicate by URL
  const uniqueSources = Array.from(
    new Map(allRawSources.map((s) => [s.url, s])).values()
  );

  // Summarise with AI (cap sources per person)
  const summarised = await summariseWithAI(
    lovableKey,
    searchName,
    uniqueSources.slice(0, MAX_SOURCES_PER_PERSON),
    occupation,
    employer,
    location
  );

  return {
    fullName: searchName,
    sources: summarised,
  };
}

// ── Deterministic structured-row derivation ────────────────────────
function deriveStructuredRow(
  sources: DiscoveredSource[],
  occupation?: string,
  employer?: string,
): ProfileStructuredRow {
  if (sources.length === 0) {
    return {
      professionalStatus: "not_found",
      professionalDetail: "No publicly verifiable professional profile found.",
      adverseMediaStatus: "none",
      adverseMediaDetail: "No adverse media identified in public sources searched.",
      highestConfidence: "None",
      identityMatched: false,
    };
  }

  const matchedSources = sources.filter((s) => s.identityMatch);
  const identityMatched = matchedSources.length > 0;
  const ranks: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  let highest: "High" | "Medium" | "Low" | "None" = "None";
  for (const s of sources) {
    const r = ranks[s.confidenceLevel] || 0;
    if (r > (ranks[highest] || 0)) highest = s.confidenceLevel as "High" | "Medium" | "Low";
  }

  // Adverse media: surface only sources whose extractedInformation contains
  // negative-signal keywords AND are at least Medium confidence + identity matched.
  const ADVERSE_KEYWORDS = /\b(arrest|charged|convicted|fraud|sanction|launder|investigation|allegation|tribunal|struck off|prohibited|disqualified|bankrupt)\b/i;
  const adverseHits = sources.filter((s) =>
    s.identityMatch &&
    (s.confidenceLevel === "High" || s.confidenceLevel === "Medium") &&
    ADVERSE_KEYWORDS.test(s.extractedInformation),
  );

  // Professional status: derived from identity-matched sources that
  // corroborate occupation or employer.
  let professionalStatus: ProfileStructuredRow["professionalStatus"] = "not_found";
  let professionalDetail = "No publicly verifiable professional profile found.";
  if (identityMatched) {
    const occLower = (occupation || "").toLowerCase();
    const empLower = (employer || "").toLowerCase();
    const corroborated = matchedSources.find((s) => {
      const text = (s.extractedInformation || "").toLowerCase();
      return (occLower && text.includes(occLower)) || (empLower && text.includes(empLower));
    });
    if (corroborated) {
      professionalStatus = "verified";
      professionalDetail = `Public profile consistent with declared ${occupation ? `occupation (${occupation})` : "details"}${employer ? ` / employer (${employer})` : ""}.`;
    } else {
      const top = matchedSources[0];
      professionalStatus = "inconsistent";
      professionalDetail = `Public profile found but does not corroborate declared occupation/employer. Top source: ${top.sourceTitle}.`;
    }
  }

  return {
    professionalStatus,
    professionalDetail,
    adverseMediaStatus: adverseHits.length > 0 ? "review_recommended" : "none",
    adverseMediaDetail:
      adverseHits.length > 0
        ? `${adverseHits.length} potential adverse-media reference(s) identified — manual review recommended.`
        : "No adverse media identified in public sources searched.",
    highestConfidence: highest,
    identityMatched,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { persons, propertyAddress } = await req.json();

    if (!Array.isArray(persons) || persons.length === 0) {
      return new Response(
        JSON.stringify({ error: "persons array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Cache setup ──────────────────────────────────────────────────
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const apiCallBudget = { remaining: MAX_TOTAL_API_CALLS };
    const profiles: PersonProfile[] = [];
    let profilesCached = 0;

    // TTLs: cache hits live for 14 days; misses (zero sources) for 24h so we
    // have an audit trail of "checked, nothing found" without locking the
    // empty result for too long.
    const TTL_HIT_MS = 14 * 24 * 60 * 60 * 1000;
    const TTL_MISS_MS = 24 * 60 * 60 * 1000;

    for (const person of persons) {
      // Check cache first
      const cacheKey = await profileCacheKey(person);
      try {
        const { data: cached } = await serviceClient
          .from("profile_intelligence_cache")
          .select("result, expires_at")
          .eq("cache_key", cacheKey)
          .maybeSingle();

        if (cached && cached.result && new Date(cached.expires_at) > new Date()) {
          console.log(`[profile-intelligence] Cache HIT for "${person.fullName}"`);
          const cachedSources = cached.result as unknown as DiscoveredSource[];
          profiles.push({
            fullName: person.fullName,
            sources: cachedSources,
            structuredRow: deriveStructuredRow(cachedSources, person.occupation, person.employer),
            cached: true,
          });
          profilesCached++;
          continue;
        }
      } catch (e) {
        console.warn("[profile-intelligence] Cache lookup failed:", e);
      }

      // Cache miss — run discovery
      const profile = await discoverPerson(
        person,
        propertyAddress || "",
        firecrawlKey,
        lovableKey,
        apiCallBudget
      );
      profile.cached = false;
      profile.structuredRow = deriveStructuredRow(profile.sources, person.occupation, person.employer);
      profiles.push(profile);

      // Always cache — non-empty results for 14 days, empty results for 24h.
      // This restores the audit trail for "checked, nothing found" cases that
      // were previously invisible (the Gkata-class miss).
      if (!profile.error) {
        try {
          const ttl = profile.sources.length > 0 ? TTL_HIT_MS : TTL_MISS_MS;
          await serviceClient
            .from("profile_intelligence_cache")
            .upsert({
              cache_key: cacheKey,
              person_name: person.fullName,
              result: profile.sources as unknown as Record<string, unknown>[],
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + ttl).toISOString(),
            }, { onConflict: "cache_key" });
          console.log(`[profile-intelligence] Cached profile for "${person.fullName}" (${profile.sources.length} sources, ttl=${profile.sources.length > 0 ? "14d" : "24h"})`);
        } catch (e) {
          console.warn("[profile-intelligence] Cache store failed:", e);
        }
      }
    }


    console.log(`[profile-intelligence] ${profilesCached}/${persons.length} profiles served from cache`);

    // Build markdown summary for injection into prompt (capped for token budget)
    let markdownSummary = "## FIRECRAWL INTELLIGENCE\n\n";
    for (const profile of profiles) {
      markdownSummary += `### ${profile.fullName}\n\n`;
      if (profile.error) {
        markdownSummary += `_${profile.error}_\n\n`;
        continue;
      }
      if (profile.sources.length === 0) {
        markdownSummary += "_No publicly available profile information discovered._\n\n";
        continue;
      }
      for (const source of profile.sources) {
      const fpWarning = source.falsePositiveRisk ? ` ⚠️ ${source.falsePositiveRisk}` : "";
        markdownSummary += `**[${source.sourceTitle}](${source.sourceUrl})**\n`;
        markdownSummary += `- Information: ${source.extractedInformation}\n`;
        markdownSummary += `- Relevance: ${source.relevance}\n`;
        markdownSummary += `- Confidence: **${source.confidenceLevel}**${fpWarning}\n`;
        markdownSummary += `- Identity Match: ${source.identityMatch ? "✅ Confirmed" : "❌ Unconfirmed"}\n\n`;
      }
      // Enforce per-profile char budget
      if (markdownSummary.length > MAX_MARKDOWN_CHARS) {
        markdownSummary = markdownSummary.slice(0, MAX_MARKDOWN_CHARS) + "\n\n...[profile intelligence truncated for context budget]...\n";
        break;
      }
    }

    return new Response(
      JSON.stringify({
        profiles,
        markdownSummary,
        apiCallsUsed: MAX_TOTAL_API_CALLS - apiCallBudget.remaining,
        profilesCached,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("profile-intelligence error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

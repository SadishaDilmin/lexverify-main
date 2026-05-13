import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";
const CH_BASE = "find-and-update.company-information.service.gov.uk";

interface PersonInput {
  fullName: string;
  companyName?: string;
  companyNumber?: string;
}

interface CHVerificationResult {
  fullName: string;
  companiesFound: CompanyResult[];
  verificationStatus: "verified" | "not_verified" | "not_found" | "error";
  verificationSummary: string;
}

interface CompanyResult {
  companyName: string;
  companyNumber: string;
  role: string;
  verificationComplete: boolean;
  verificationDetails: string;
  sourceUrl: string;
}

async function firecrawlScrape(apiKey: string, url: string): Promise<string> {
  try {
    const resp = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    if (!resp.ok) {
      console.error(`[CH-lookup] Firecrawl scrape error: ${resp.status}`);
      return "";
    }
    const data = await resp.json();
    return data.data?.markdown || data.markdown || "";
  } catch (e) {
    console.error("[CH-lookup] Firecrawl scrape exception:", e);
    return "";
  }
}

async function firecrawlSearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const resp = await fetch(`${FIRECRAWL_API}/search`, {
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
      console.error(`[CH-lookup] Firecrawl search error: ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return data.data || [];
  } catch (e) {
    console.error("[CH-lookup] Firecrawl search exception:", e);
    return [];
  }
}

function detectVerificationStatus(markdown: string): { verified: boolean; details: string } {
  const lower = markdown.toLowerCase();

  // Check for verification complete signals
  const verifiedPatterns = [
    /verification\s+requirements?\s+complete/i,
    /identity\s+verification\s+status[:\s]+verified/i,
    /personal\s+code[:\s]+[A-Z0-9]+/i,
    /identity\s+verified/i,
    /verification\s+status[:\s]+complete/i,
    /id\s+verification[:\s]+complete/i,
  ];

  for (const pattern of verifiedPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      return {
        verified: true,
        details: `Companies House verification confirmed: "${match[0].trim()}"`,
      };
    }
  }

  // Check for not-yet-verified signals
  const notVerifiedPatterns = [
    /verification\s+requirements?\s+not\s+(yet\s+)?complete/i,
    /identity\s+not\s+verified/i,
    /verification\s+status[:\s]+pending/i,
    /verification\s+overdue/i,
  ];

  for (const pattern of notVerifiedPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      return {
        verified: false,
        details: `Companies House verification NOT complete: "${match[0].trim()}"`,
      };
    }
  }

  return { verified: false, details: "Verification status could not be determined from page content." };
}

function extractRole(markdown: string, personName: string): string {
  const lower = markdown.toLowerCase();
  const personLower = personName.toLowerCase();

  if (lower.includes("director") && lower.includes(personLower)) return "Director";
  if (lower.includes("person with significant control") || lower.includes("psc")) return "PSC";
  if (lower.includes("secretary")) return "Secretary";
  return "Officer";
}

async function lookupPerson(
  person: PersonInput,
  firecrawlKey: string,
): Promise<CHVerificationResult> {
  const { fullName, companyName, companyNumber } = person;

  if (!fullName?.trim()) {
    return {
      fullName: fullName || "Unknown",
      companiesFound: [],
      verificationStatus: "error",
      verificationSummary: "No name provided.",
    };
  }

  const companies: CompanyResult[] = [];

  try {
    // Strategy 1: If company number is known, go directly to the company's officers page
    if (companyNumber) {
      const officersUrl = `https://${CH_BASE}/company/${companyNumber}/officers`;
      console.log(`[CH-lookup] Scraping officers page: ${officersUrl}`);
      const officersMarkdown = await firecrawlScrape(firecrawlKey, officersUrl);

      if (officersMarkdown && officersMarkdown.toLowerCase().includes(fullName.toLowerCase())) {
        const role = extractRole(officersMarkdown, fullName);
        const { verified, details } = detectVerificationStatus(officersMarkdown);

        // Also check the individual officer page for verification details
        const pscUrl = `https://${CH_BASE}/company/${companyNumber}/persons-with-significant-control`;
        const pscMarkdown = await firecrawlScrape(firecrawlKey, pscUrl);
        const pscCheck = pscMarkdown ? detectVerificationStatus(pscMarkdown) : { verified: false, details: "" };

        const isVerified = verified || pscCheck.verified;
        const verDetails = verified ? details : pscCheck.verified ? pscCheck.details : details;

        companies.push({
          companyName: companyName || `Company ${companyNumber}`,
          companyNumber,
          role,
          verificationComplete: isVerified,
          verificationDetails: verDetails,
          sourceUrl: officersUrl,
        });
      }
    }

    // Strategy 2: Search Companies House for the person's name
    if (companies.length === 0) {
      const searchQuery = companyName
        ? `"${fullName}" "${companyName}" site:${CH_BASE}`
        : `"${fullName}" director site:${CH_BASE}`;

      console.log(`[CH-lookup] Searching: ${searchQuery}`);
      const results = await firecrawlSearch(firecrawlKey, searchQuery);

      // Process up to 3 results
      for (const result of results.slice(0, 3)) {
        if (!result.url || !result.url.includes(CH_BASE)) continue;

        const markdown = result.markdown || "";
        if (!markdown.toLowerCase().includes(fullName.toLowerCase())) continue;

        // Extract company number from URL
        const compNumMatch = result.url.match(/\/company\/([A-Z0-9]+)/i);
        const compNum = compNumMatch?.[1] || "Unknown";

        // Check if this is a company page — scrape the officers/PSC pages
        let verResult = detectVerificationStatus(markdown);

        if (!verResult.verified && compNum !== "Unknown") {
          // Try scraping the officers page directly for verification status
          const officersUrl = `https://${CH_BASE}/company/${compNum}/officers`;
          const officersMarkdown = await firecrawlScrape(firecrawlKey, officersUrl);
          if (officersMarkdown) {
            verResult = detectVerificationStatus(officersMarkdown);
          }
        }

        const role = extractRole(markdown, fullName);
        const nameMatch = markdown.match(/(?:company|registered)\s+(?:name|as)[:\s]+([^\n]+)/i);
        const foundCompanyName = nameMatch?.[1]?.trim() || result.title || `Company ${compNum}`;

        companies.push({
          companyName: foundCompanyName,
          companyNumber: compNum,
          role,
          verificationComplete: verResult.verified,
          verificationDetails: verResult.details,
          sourceUrl: result.url,
        });
      }
    }
  } catch (e) {
    console.error(`[CH-lookup] Error looking up ${fullName}:`, e);
    return {
      fullName,
      companiesFound: [],
      verificationStatus: "error",
      verificationSummary: `Error during Companies House lookup: ${e instanceof Error ? e.message : "Unknown error"}`,
    };
  }

  if (companies.length === 0) {
    return {
      fullName,
      companiesFound: [],
      verificationStatus: "not_found",
      verificationSummary: `No Companies House director/PSC records found for "${fullName}".`,
    };
  }

  const anyVerified = companies.some((c) => c.verificationComplete);

  return {
    fullName,
    companiesFound: companies,
    verificationStatus: anyVerified ? "verified" : "not_verified",
    verificationSummary: anyVerified
      ? `Companies House identity verification CONFIRMED for "${fullName}" under ECCTA 2023. ${companies.filter((c) => c.verificationComplete).map((c) => `${c.role} of ${c.companyName} (${c.companyNumber})`).join("; ")}.`
      : `"${fullName}" found as ${companies.map((c) => `${c.role} of ${c.companyName} (${c.companyNumber})`).join("; ")} but verification status NOT confirmed.`,
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
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { persons } = await req.json();

    if (!Array.isArray(persons) || persons.length === 0) {
      return new Response(
        JSON.stringify({ error: "persons array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[CH-lookup] Looking up ${persons.length} person(s)`);

    const results: CHVerificationResult[] = [];
    for (const person of persons) {
      const result = await lookupPerson(person, firecrawlKey);
      results.push(result);
    }

    // Build markdown summary for injection into the SoW prompt
    let markdownSummary = "## COMPANIES HOUSE IDENTITY VERIFICATION (LIVE LOOKUP)\n\n";
    markdownSummary += "_Data retrieved live from Companies House via web scraping. This supplements any verification status found in uploaded documents._\n\n";

    for (const r of results) {
      markdownSummary += `### ${r.fullName}\n`;
      markdownSummary += `- **Status**: ${r.verificationStatus.toUpperCase()}\n`;
      markdownSummary += `- **Summary**: ${r.verificationSummary}\n`;

      if (r.companiesFound.length > 0) {
        for (const c of r.companiesFound) {
          markdownSummary += `  - **${c.companyName}** (${c.companyNumber}) — Role: ${c.role}\n`;
          markdownSummary += `    - Verification: ${c.verificationComplete ? "✅ Complete" : "❌ Not confirmed"}\n`;
          markdownSummary += `    - Details: ${c.verificationDetails}\n`;
          markdownSummary += `    - Source: ${c.sourceUrl}\n`;
        }
      }
      markdownSummary += "\n";
    }

    return new Response(
      JSON.stringify({ results, markdownSummary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[CH-lookup] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

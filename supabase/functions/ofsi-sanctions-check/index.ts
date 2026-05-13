import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OFSI_CSV_URL =
  "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv";

/** Loose UUID v4-ish check, sufficient to gate persistence inputs. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Fuzzy matching helpers ──────────────────────────────────────────

/**
 * Honorifics, titles and common name particles that add noise to fuzzy
 * matching. Stripped before scoring. Kept deliberately small and
 * UK-OFSI-tuned — over-stripping would create false positives.
 */
const STOPWORD_TOKENS = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "dame", "lord", "lady",
  "sheikh", "shaykh", "sayyid", "hajji", "haji", "imam", "mullah",
  "colonel", "col", "general", "gen", "major", "maj", "captain", "capt",
  "lt", "lieutenant", "brigadier", "admiral",
  "the", "of", "and",
]);

/**
 * Particles that join name parts (e.g. `bin`, `al`). We do NOT remove these
 * from the canonical full name, but we strip them when generating phonetic
 * keys so `Saif al-Islam` and `Saif Islam` align phonetically.
 */
const NAME_PARTICLES = new Set([
  "al", "el", "bin", "ibn", "abu", "abd", "abdul", "von", "van", "de", "da", "du", "la", "le",
]);

/** Round to 3 decimal places for stable JSON output. */
function round3(n: number): number { return Math.round(n * 1000) / 1000; }

/** Normalise a name string for comparison. Lower-cased, accent-stripped, punctuation collapsed. */
function normalise(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenise + drop honorifics. Returns the cleaned tokens (particles preserved). */
function meaningfulTokens(name: string): string[] {
  return normalise(name)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORD_TOKENS.has(t));
}

/** Cleaned, space-joined name with honorifics removed. Used as the primary comparison string. */
function cleanedName(name: string): string {
  return meaningfulTokens(name).join(" ");
}

/** Dice bi-gram similarity. */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  let matches = 0;
  const totalB = b.length - 1;
  for (let i = 0; i < totalB; i++) {
    if (bigramsA.has(b.slice(i, i + 2))) matches++;
  }
  return (2 * matches) / (bigramsA.size + totalB);
}

/** Length-normalised Levenshtein similarity (1 = identical, 0 = fully different). */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  // Two-row DP for memory.
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  const distance = prev[n];
  return 1 - distance / Math.max(m, n);
}

/**
 * Token-level similarity. For each token in the shorter name, find its best
 * pair in the longer name using the max of bi-gram, Levenshtein, and an
 * initial-match rule. This catches initials, transliteration, and
 * single-character typos.
 */
function tokenMatch(a: string, b: string): number {
  const tokA = a.split(" ").filter(Boolean);
  const tokB = b.split(" ").filter(Boolean);
  if (!tokA.length || !tokB.length) return 0;
  const [shorter, longer] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  let total = 0;
  for (const t of shorter) {
    let best = 0;
    for (const l of longer) {
      // Initial vs full given-name: `v` matches `vladimir`.
      if (t.length === 1 && l.startsWith(t)) best = Math.max(best, 0.9);
      if (l.length === 1 && t.startsWith(l)) best = Math.max(best, 0.9);
      const bg = bigramSimilarity(t, l);
      const lv = levenshteinSimilarity(t, l);
      best = Math.max(best, bg, lv);
    }
    total += best;
  }
  return total / shorter.length;
}

/**
 * Lightweight phonetic key (Metaphone-flavoured). Deterministic, no external
 * library. Designed to collapse common transliteration variants:
 * `Qaddafi` / `Gaddafi` / `Kadhafi` → similar key.
 */
function phoneticKey(token: string): string {
  if (!token) return "";
  let s = token.toLowerCase();
  // Drop name particles entirely so `al-islam` keys as `islam`.
  if (NAME_PARTICLES.has(s)) return "";
  // Common transliteration substitutions, applied in order.
  s = s
    .replace(/^x/, "z")
    .replace(/^kn/, "n")
    .replace(/^gn/, "n")
    .replace(/^ps/, "s")
    .replace(/^wr/, "r")
    .replace(/qu/g, "kw")
    .replace(/q/g, "k")
    .replace(/c([eiy])/g, "s$1")
    .replace(/c/g, "k")
    .replace(/ph/g, "f")
    .replace(/gh/g, "g")
    .replace(/dh/g, "d")
    .replace(/th/g, "t")
    .replace(/sh/g, "s")
    .replace(/ch/g, "s")
    .replace(/zh/g, "j")
    .replace(/ck/g, "k")
    .replace(/x/g, "ks")
    .replace(/[wh]/g, "")
    .replace(/y/g, "i")
    .replace(/[aeiou]+/g, "a"); // collapse vowels
  // Drop trailing `a` from collapsed vowel run for stability.
  if (s.length > 2 && s.endsWith("a")) s = s.slice(0, -1);
  // De-duplicate adjacent identical consonants.
  let out = "";
  let prev = "";
  for (const ch of s) {
    if (ch !== prev) out += ch;
    prev = ch;
  }
  return out;
}

/** Phonetic similarity between two full names: best pairwise key match across tokens. */
function phoneticSimilarity(a: string, b: string): number {
  const ka = a.split(" ").map(phoneticKey).filter(Boolean);
  const kb = b.split(" ").map(phoneticKey).filter(Boolean);
  if (!ka.length || !kb.length) return 0;
  const [shorter, longer] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  let matched = 0;
  for (const k of shorter) {
    if (longer.some((l) => l === k || (k.length >= 3 && l.length >= 3 && (l.startsWith(k) || k.startsWith(l))))) {
      matched++;
    }
  }
  return matched / shorter.length;
}

/**
 * Component breakdown of a fuzzy comparison. Used both internally for the
 * combined score AND surfaced to the UI for audit-friendly explanation of
 * why a particular OFSI entry was flagged.
 */
interface ScoreComponents {
  bigram: number;       // Dice bi-gram similarity on the cleaned full names
  token: number;        // Token-level similarity (handles initials, transliteration)
  levenshtein: number;  // Length-normalised edit distance on the cleaned names
  phonetic: number;     // Phonetic-key overlap (catches Qaddafi/Gaddafi etc.)
  lexical: number;      // max(bigram, token, levenshtein) — the dominant lexical signal
  combined: number;     // Final 0–1 score before any DOB adjustment
  variantUsed: "primary" | "alias"; // Which form of the OFSI name produced the best score
}

/** Compute every component score for a single (query, target) pair. */
function scoreBreakdown(query: string, target: string): ScoreComponents {
  const nq = cleanedName(query);
  const nt = cleanedName(target);
  if (!nq || !nt) {
    return { bigram: 0, token: 0, levenshtein: 0, phonetic: 0, lexical: 0, combined: 0, variantUsed: "primary" };
  }
  if (nq === nt) {
    return { bigram: 1, token: 1, levenshtein: 1, phonetic: 1, lexical: 1, combined: 1, variantUsed: "primary" };
  }
  const bigram = bigramSimilarity(nq, nt);
  const token = tokenMatch(nq, nt);
  const levenshtein = levenshteinSimilarity(nq, nt);
  const phonetic = phoneticSimilarity(nq, nt);
  const lexical = Math.max(bigram, token, levenshtein);
  // Phonetic contributes up to 0.85 on its own, or a small boost on top of lexical.
  const phoneticContribution = Math.min(phonetic * 0.85, lexical + 0.1);
  const combined = Math.min(1, Math.max(lexical, phoneticContribution));
  return { bigram, token, levenshtein, phonetic, lexical, combined, variantUsed: "primary" };
}

/**
 * Backwards-compatible scalar wrapper retained for unit tests and any
 * caller that just wants the final number.
 */
function fuzzyScore(query: string, target: string): number {
  return scoreBreakdown(query, target).combined;
}

/** DOB tie-breaker. Returns a small adjustment to apply to the name score. */
function dobAdjustment(partyDob: string | undefined, entryDob: string): number {
  if (!partyDob || !entryDob) return 0;
  const pYear = (partyDob.match(/\b(19|20)\d{2}\b/) || [])[0];
  const eYear = (entryDob.match(/\b(19|20)\d{2}\b/) || [])[0];
  if (!pYear || !eYear) return 0;
  // Try full ISO comparison first.
  const pIso = partyDob.slice(0, 10);
  const eIso = entryDob.slice(0, 10);
  if (pIso && eIso && pIso === eIso) return 0.05;
  if (pYear === eYear) return 0.02;
  return -0.10;
}

// ── CSV Parsing ─────────────────────────────────────────────────────

interface OFSIEntry {
  groupId: string;
  name: string;
  type: string;
  regime: string;
  dateOfBirth: string;
  aliases: string[];
  listedOn: string;
  ukSanctionsListRef: string;
}

function parseOFSICSV(csv: string): OFSIEntry[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];

  const entries: OFSIEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length < 20) continue;

    const groupId = row[0]?.trim() || "";
    const groupType = row[1]?.trim() || "";
    const names = [row[2], row[3], row[4], row[5], row[6], row[7]]
      .map((n) => n?.trim())
      .filter(Boolean);
    if (!names.length) continue;
    const fullName = names.join(" ");

    const dob = row[9]?.trim() || "";
    const listedOn = row[15]?.trim() || "";
    const ukRef = row[16]?.trim() || "";
    const regime = row[19]?.trim() || "";

    // Generate alias permutations for resilient matching.
    const aliases = buildAliases(names);

    entries.push({
      groupId,
      name: fullName,
      type: groupType.includes("Individual") ? "Individual" : "Entity",
      regime,
      dateOfBirth: dob,
      aliases,
      listedOn,
      ukSanctionsListRef: ukRef,
    });
  }

  return entries;
}

/**
 * Build a small set of alias forms to score against. OFSI lists names as
 * `Name 1..6`; the ordering is not always consistent (sometimes given-first,
 * sometimes surname-first), and parties may supply only first + last.
 */
function buildAliases(parts: string[]): string[] {
  const out = new Set<string>();
  if (parts.length <= 1) return [];
  // Reverse order.
  out.add([...parts].reverse().join(" "));
  if (parts.length >= 3) {
    // Drop middle name(s): first + last, last + first.
    out.add(`${parts[0]} ${parts[parts.length - 1]}`);
    out.add(`${parts[parts.length - 1]} ${parts[0]}`);
  }
  return Array.from(out);
}

/** Basic CSV row parser handling quoted fields. */
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ── In-memory cache ─────────────────────────────────────────────────

let cachedEntries: OFSIEntry[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getOFSIEntries(): Promise<OFSIEntry[]> {
  if (cachedEntries && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEntries;
  }
  console.log("[ofsi-sanctions-check] Fetching OFSI Consolidated List…");
  const resp = await fetch(OFSI_CSV_URL);
  if (!resp.ok) throw new Error(`Failed to fetch OFSI list: ${resp.status}`);
  const csv = await resp.text();
  cachedEntries = parseOFSICSV(csv);
  cacheTimestamp = Date.now();
  console.log(`[ofsi-sanctions-check] Parsed ${cachedEntries.length} entries`);
  return cachedEntries;
}

// ── Main handler ────────────────────────────────────────────────────

interface ScreeningRequest {
  parties: Array<{
    id?: string;
    full_name: string;
    date_of_birth?: string;
    role?: string;
  }>;
  threshold?: number;
  /** When supplied, the run is recorded in `ofsi_screening_runs` for audit history. */
  case_id?: string;
}

type ScreeningStatus = "clear" | "review_recommended" | "potential_match" | "strong_match";

/** Per-match audit explanation, surfaced 1:1 in the UI. */
interface MatchExplanation {
  bigram: number;
  token: number;
  levenshtein: number;
  phonetic: number;
  lexical: number;
  nameScore: number;            // combined name score before DOB adjustment
  dobAdjustment: number;        // signed adjustment applied (Individuals only)
  finalScore: number;           // nameScore + dobAdjustment, clamped 0..1
  variantUsed: "primary" | "alias"; // which OFSI name form produced the best score
  matchedAgainst: string;       // the cleaned form of the OFSI name actually scored
  cleanedQuery: string;         // the cleaned form of the party name
}

interface MatchResult {
  partyName: string;
  partyId?: string;
  partyRole?: string;
  matches: Array<{
    ofsiName: string;
    score: number;
    type: string;
    regime: string;
    dateOfBirth: string;
    listedOn: string;
    ukRef: string;
    groupId: string;
    explanation: MatchExplanation;
  }>;
  status: ScreeningStatus;
}

function classify(score: number): ScreeningStatus {
  if (score >= 0.90) return "strong_match";
  if (score >= 0.75) return "potential_match";
  if (score >= 0.65) return "review_recommended";
  return "clear";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Default threshold lowered from 0.75 → 0.65 so the new "review_recommended"
    // tier surfaces in the UI. Callers may still override.
    const { parties, threshold = 0.65, case_id }: ScreeningRequest = await req.json();

    if (!parties || !Array.isArray(parties) || parties.length === 0) {
      return new Response(
        JSON.stringify({ error: "parties array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entries = await getOFSIEntries();
    const results: MatchResult[] = [];

    for (const party of parties) {
      const partyResult: MatchResult = {
        partyName: party.full_name,
        partyId: party.id,
        partyRole: party.role,
        matches: [],
        status: "clear",
      };

      for (const entry of entries) {
        // Score against the primary OFSI name first…
        let best = scoreBreakdown(party.full_name, entry.name);
        let matchedAgainst = cleanedName(entry.name);
        // …then each alias permutation, keeping the highest combined score.
        for (const alias of entry.aliases) {
          const aliasBreakdown = scoreBreakdown(party.full_name, alias);
          if (aliasBreakdown.combined > best.combined) {
            best = { ...aliasBreakdown, variantUsed: "alias" };
            matchedAgainst = cleanedName(alias);
          }
        }

        // DOB tie-breaker (individuals only). Tracked separately so the
        // breakdown can show how much DOB shifted the result.
        const dobAdj = entry.type === "Individual"
          ? dobAdjustment(party.date_of_birth, entry.dateOfBirth)
          : 0;
        const finalScore = Math.max(0, Math.min(1, best.combined + dobAdj));

        if (finalScore >= threshold) {
          const explanation: MatchExplanation = {
            bigram: round3(best.bigram),
            token: round3(best.token),
            levenshtein: round3(best.levenshtein),
            phonetic: round3(best.phonetic),
            lexical: round3(best.lexical),
            nameScore: round3(best.combined),
            dobAdjustment: round3(dobAdj),
            finalScore: round3(finalScore),
            variantUsed: best.variantUsed,
            matchedAgainst,
            cleanedQuery: cleanedName(party.full_name),
          };
          partyResult.matches.push({
            ofsiName: entry.name,
            score: Math.round(finalScore * 100) / 100,
            type: entry.type,
            regime: entry.regime,
            dateOfBirth: entry.dateOfBirth,
            listedOn: entry.listedOn,
            ukRef: entry.ukSanctionsListRef,
            groupId: entry.groupId,
            explanation,
          });
        }
      }

      // Sort matches by score descending
      partyResult.matches.sort((a, b) => b.score - a.score);
      partyResult.matches = partyResult.matches.slice(0, 10);

      partyResult.status = partyResult.matches.length === 0
        ? "clear"
        : classify(partyResult.matches[0].score);

      results.push(partyResult);
    }

    const overallStatus: ScreeningStatus = results.some((r) => r.status === "strong_match")
      ? "strong_match"
      : results.some((r) => r.status === "potential_match")
      ? "potential_match"
      : results.some((r) => r.status === "review_recommended")
      ? "review_recommended"
      : "clear";

    const screenedAt = new Date().toISOString();
    const tierCounts = {
      clear: 0,
      review_recommended: 0,
      potential_match: 0,
      strong_match: 0,
    } as Record<ScreeningStatus, number>;
    for (const r of results) tierCounts[r.status] += 1;

    // ── Persist run for audit history (best-effort; never blocks the response) ──
    let runId: string | null = null;
    if (case_id && UUID_RE.test(case_id)) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service config missing");

        // Resolve caller for `screened_by` using project-standard getClaims.
        let screenedBy: string | null = null;
        const authHeader = req.headers.get("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (token) {
          const serviceAuthClient = createClient(SUPABASE_URL, SERVICE_KEY);
          const { data: claimsData } = await serviceAuthClient.auth.getClaims(token);
          screenedBy = claimsData?.claims?.sub ?? null;
        }

        const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: inserted, error: insertError } = await serviceClient
          .from("ofsi_screening_runs")
          .insert({
            case_id,
            screened_by: screenedBy,
            screened_at: screenedAt,
            threshold,
            parties_screened: parties.length,
            ofsi_entries_checked: entries.length,
            overall_status: overallStatus,
            tier_counts: tierCounts,
            results,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        runId = inserted?.id ?? null;
      } catch (persistErr) {
        // Persistence failure must not break the screening result.
        console.error("[ofsi-sanctions-check] failed to persist run:", persistErr);
      }
    }

    return new Response(
      JSON.stringify({
        run_id: runId,
        overall_status: overallStatus,
        screened_at: screenedAt,
        total_ofsi_entries: entries.length,
        threshold,
        tier_counts: tierCounts,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ofsi-sanctions-check error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Exposed for unit tests.
export { fuzzyScore, scoreBreakdown, dobAdjustment, classify, buildAliases, phoneticKey, cleanedName };

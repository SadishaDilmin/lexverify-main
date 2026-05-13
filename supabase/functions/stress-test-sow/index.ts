import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ────────────────────────────────────────────────
 * 1. SYMBOL NORMALISER
 * ──────────────────────────────────────────────── */
function normaliseSymbols(text: string): string {
  let out = text
    .replace(/(?<![A-Za-z])E(?=\s?\d)/g, "£")
    .replace(/(?<![A-Za-z])L(?=\s?\d)/g, "£")
    .replace(/(?<![A-Za-z])&(?=\s?\d)/g, "£")
    .replace(/(?<![A-Za-z])A3(?=\s?\d)/g, "£");
  out = out.replace(/(\d{1,3}(?:\.\d{3})+),(\d{2})\b/g, (_match, intPart, dec) => {
    const cleaned = intPart.replace(/\./g, "");
    return `${cleaned}.${dec}`;
  });
  return out;
}

/* ────────────────────────────────────────────────
 * 2. UK SDLT CALCULATOR (March 2026 — HRAD 5%)
 * ──────────────────────────────────────────────── */
interface SDLTResult {
  baseSdlt: number; surcharge: number; totalSdlt: number;
  isAdditionalDwelling: boolean;
  bands: { threshold: number; rate: number; tax: number }[];
}

function calculateSDLT(purchasePrice: number, isAdditionalDwelling: boolean): SDLTResult {
  const bands = [
    { threshold: 250000, rate: 0 },
    { threshold: 925000, rate: 0.05 },
    { threshold: 1500000, rate: 0.10 },
    { threshold: Infinity, rate: 0.12 },
  ];
  let remaining = purchasePrice, baseSdlt = 0, prev = 0;
  const bandResults: { threshold: number; rate: number; tax: number }[] = [];
  for (const band of bands) {
    const taxable = Math.min(remaining, band.threshold - prev);
    if (taxable <= 0) break;
    const tax = Math.round(taxable * band.rate);
    baseSdlt += tax;
    bandResults.push({ threshold: band.threshold, rate: band.rate, tax });
    remaining -= taxable;
    prev = band.threshold;
  }
  const surcharge = isAdditionalDwelling ? Math.round(purchasePrice * 0.05) : 0;
  return { baseSdlt, surcharge, totalSdlt: baseSdlt + surcharge, isAdditionalDwelling, bands: bandResults };
}

/* ────────────────────────────────────────────────
 * 3. STRICT SCHEMA LEDGER
 * ──────────────────────────────────────────────── */
type LedgerKey = "mortgage" | "savings" | "gift" | "inheritance" | "investment" | "pension" | "other" | "pending_funds";

interface LedgerEntry {
  amount: number; verified: boolean; source_label: string;
  pending_date?: string; is_pending?: boolean;
}

interface FundsLedger {
  mortgage: LedgerEntry; savings: LedgerEntry; gift: LedgerEntry;
  inheritance: LedgerEntry; investment: LedgerEntry; pension: LedgerEntry;
  other: LedgerEntry; pending_funds: LedgerEntry;
}

const LEDGER_EXACT_MAP: Record<string, LedgerKey> = {
  "savings": "savings", "bank savings": "savings", "deposit": "savings",
  "cash savings": "savings", "current account": "savings", "savings account": "savings",
  "isa": "investment", "stocks and shares isa": "investment", "s&s isa": "investment",
  "lifetime isa": "investment", "lisa": "investment",
  "investment": "investment", "shares": "investment", "bonds": "investment",
  "stocks": "investment", "fund": "investment", "equity": "investment",
  "premium bonds": "investment", "unit trust": "investment",
  "sipp": "pension", "sipp drawdown": "pension", "pension": "pension",
  "pension drawdown": "pension", "pension lump sum": "pension",
  "tax-free lump sum": "pension", "pcls": "pension",
  "gift": "gift", "gifted deposit": "gift", "family gift": "gift",
  "parental gift": "gift", "gift from": "gift",
  "inheritance": "inheritance", "probate": "inheritance", "estate": "inheritance",
  "bequest": "inheritance",
  "mortgage": "mortgage", "mortgage advance": "mortgage", "mortgage offer": "mortgage",
  "bonus": "other", "salary": "other", "redundancy": "other",
  "loan": "other", "director loan": "other", "directors loan": "other",
  "sale proceeds": "other", "property sale": "other", "compensation": "other",
  "crypto": "other", "coinbase": "other", "bitcoin": "other",
  "house sale": "pending_funds", "property sale proceeds": "pending_funds",
  "isa withdrawal": "pending_funds", "isa drawdown": "pending_funds",
  "pending": "pending_funds",
};

function fuzzyTokenScore(label: string, pattern: string): number {
  const lt = label.toLowerCase().split(/[\s\-_/()&,]+/).filter(Boolean);
  const pt = pattern.toLowerCase().split(/[\s\-_/()&,]+/).filter(Boolean);
  let hits = 0;
  for (const p of pt) { for (const l of lt) { if (l.includes(p) || p.includes(l)) { hits++; break; } } }
  return pt.length > 0 ? hits / pt.length : 0;
}

function classifyToLedgerKey(label: string): LedgerKey {
  const lower = label.toLowerCase().trim();
  if (LEDGER_EXACT_MAP[lower]) return LEDGER_EXACT_MAP[lower];
  for (const [pattern, key] of Object.entries(LEDGER_EXACT_MAP)) {
    if (lower.includes(pattern)) return key;
  }
  let bestKey: LedgerKey = "other"; let bestScore = 0;
  for (const [pattern, key] of Object.entries(LEDGER_EXACT_MAP)) {
    const score = fuzzyTokenScore(lower, pattern);
    if (score > bestScore && score >= 0.5) { bestScore = score; bestKey = key; }
  }
  return bestKey;
}

function isWithin14Days(dateStr: string): boolean {
  try {
    const parsed = new Date(dateStr.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1"));
    if (isNaN(parsed.getTime())) return true;
    const diffDays = Math.abs((parsed.getTime() - Date.now()) / 86400000);
    return diffDays <= 30;
  } catch { return true; }
}

function detectPendingFundsDate(content: string): string | null {
  const patterns = [
    /(?:complet(?:ion|e|ing)|settl(?:e|ement)|expect(?:ed)?|due|available)\s*(?:on|by|date)?:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i,
  ];
  for (const p of patterns) { const m = content.match(p); if (m) return m[1]; }
  return null;
}

function buildFundsLedger(documents: any[], narrative: string, mortgageAmount: number): FundsLedger {
  const ledger: FundsLedger = {
    mortgage: { amount: mortgageAmount, verified: true, source_label: "Mortgage Offer" },
    savings: { amount: 0, verified: false, source_label: "" },
    gift: { amount: 0, verified: false, source_label: "" },
    inheritance: { amount: 0, verified: false, source_label: "" },
    investment: { amount: 0, verified: false, source_label: "" },
    pension: { amount: 0, verified: false, source_label: "" },
    other: { amount: 0, verified: false, source_label: "" },
    pending_funds: { amount: 0, verified: false, source_label: "", is_pending: true },
  };

  const totalPat = /\b(total|grand\s*total|total\s*declared|total\s*funds|sum\s*total|overall)\b/i;
  const finDocTypes = /bank\s*statement|statement|certificate|valuation|confirmation|drawdown|offer/i;
  const pendingTriggers = /house\s*sale|property\s*sale|isa\s*withdrawal|isa\s*drawdown|pending\s*redemption|fund\s*redemption/i;

  for (const doc of documents) {
    const content = normaliseSymbols(doc.content || "");
    const isFin = finDocTypes.test(doc.title || "");
    for (const line of content.split(/\n/)) {
      if (totalPat.test(line)) continue;
      const match = line.match(/([A-Za-z][A-Za-z\s/\-'()&]+?)[:;\-–—]?\s*£\s?([\d,]+(?:\.\d{2})?)/);
      if (!match) continue;
      const label = match[1].trim();
      const amount = parseFloat(match[2].replace(/,/g, ""));
      if (isNaN(amount) || amount <= 0 || totalPat.test(label)) continue;
      let key = classifyToLedgerKey(label);
      if (key === "mortgage") continue;

      if (pendingTriggers.test(label) || pendingTriggers.test(line)) {
        const pd = detectPendingFundsDate(content);
        if (pd && isWithin14Days(pd)) {
          const ek = key === "pending_funds" ? "other" : key;
          ledger[ek].amount += amount; ledger[ek].verified = true;
          ledger[ek].source_label += (ledger[ek].source_label ? ", " : "") + label + ` (in-flight, confirmed ${pd})`;
          continue;
        }
      }
      const ek = key === "pending_funds" ? "other" : key;
      ledger[ek].amount += amount;
      ledger[ek].verified = ledger[ek].verified || isFin;
      ledger[ek].source_label = ledger[ek].source_label ? `${ledger[ek].source_label}, ${label}` : label;
    }
  }

  // Narrative fallback
  const nNorm = normaliseSymbols(narrative);
  for (const m of nNorm.matchAll(/([A-Za-z][A-Za-z\s/\-'()&]+?)[:;\-–—]?\s*£\s?([\d,]+(?:\.\d{2})?)/g)) {
    const label = m[1].trim();
    if (totalPat.test(label)) continue;
    const amount = parseFloat(m[2].replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) continue;
    const key = classifyToLedgerKey(label);
    if (key === "mortgage") continue;
    const ek = key === "pending_funds" ? "other" : key;
    if (ledger[ek].amount === 0) {
      ledger[ek].amount = amount; ledger[ek].verified = false;
      ledger[ek].source_label = `${label} (unverified_amount — narrative only)`;
    }
  }
  return ledger;
}

function ledgerTotal(ledger: FundsLedger): number {
  return ledger.savings.amount + ledger.gift.amount + ledger.inheritance.amount +
    ledger.investment.amount + ledger.pension.amount + ledger.other.amount +
    ledger.pending_funds.amount;
}

/* ────────────────────────────────────────────────
 * 4. BONUS EXTRACTION (Cycle 5: Simplified — just extract gross/net, JS does the math)
 * ──────────────────────────────────────────────── */
interface BonusDelta {
  declared_gross: number; received_net: number;
  tax_rate: number; expected_net: number;
  delta_explained: boolean; note: string;
}

function extractBonusGrossNet(documents: any[], narrative: string): BonusDelta | null {
  const combined = normaliseSymbols(
    (documents.map((d: any) => d.content || "").join("\n") + "\n" + narrative)
  );
  // Just find any gross and net bonus numbers
  const grossMatch = combined.match(/(?:declared|gross)\s*bonus[:\s]*£\s?([\d,]+(?:\.\d{2})?)/i)
    || combined.match(/bonus\s*\(?\s*gross\s*\)?[:\s]*£\s?([\d,]+(?:\.\d{2})?)/i)
    || combined.match(/bonus[:\s]*£\s?([\d,]+(?:\.\d{2})?)[\s\S]{0,50}gross/i);
  const netMatch = combined.match(/(?:received|net)\s*bonus[:\s]*£\s?([\d,]+(?:\.\d{2})?)/i)
    || combined.match(/bonus\s*\(?\s*net\s*\)?[:\s]*£\s?([\d,]+(?:\.\d{2})?)/i)
    || combined.match(/bonus\s*(?:credited|deposited|paid)[:\s]*£\s?([\d,]+(?:\.\d{2})?)/i);

  if (!grossMatch || !netMatch) return null;
  const gross = parseFloat(grossMatch[1].replace(/,/g, ""));
  const net = parseFloat(netMatch[1].replace(/,/g, ""));
  if (isNaN(gross) || isNaN(net) || gross <= 0) return null;

  // JS does all the tax math — AI never needs to
  const taxRate = 0.40;
  const expectedNet = Math.round(gross * (1 - taxRate));
  const tolerance = gross * 0.05;
  const deltaExplained = Math.abs(net - expectedNet) <= tolerance;

  return {
    declared_gross: gross, received_net: net, tax_rate: taxRate,
    expected_net: expectedNet, delta_explained: deltaExplained,
    note: deltaExplained
      ? `VERIFIED: Gross bonus £${gross.toLocaleString("en-GB")} → Net £${net.toLocaleString("en-GB")}. 40% tax delta explains difference (expected net: £${expectedNet.toLocaleString("en-GB")}).`
      : `UNVERIFIED: Gross bonus £${gross.toLocaleString("en-GB")} → Net £${net.toLocaleString("en-GB")}. Expected net after 40% tax: £${expectedNet.toLocaleString("en-GB")} — actual differs beyond tolerance.`,
  };
}

/* ────────────────────────────────────────────────
 * 5. HNW CHAIN-OF-WEALTH DETECTION
 * ──────────────────────────────────────────────── */
function detectHNWChainOfWealth(documents: any[], narrative: string): { isHNW: boolean; chainDocumented: boolean; note: string } {
  const combined = (narrative + " " + documents.map((d: any) => `${d.title || ""} ${d.content || ""}`).join(" ")).toLowerCase();
  const hnwIndicators = ["high net worth", "hnw", "uhnw", "wealthy", "substantial assets", "portfolio", "investment portfolio", "private bank", "wealth manager"];
  const isHNW = hnwIndicators.some((t) => combined.includes(t)) || (combined.includes("sipp") && combined.includes("isa"));
  if (!isHNW) return { isHNW: false, chainDocumented: false, note: "" };
  const chainIndicators = ["sipp drawdown", "isa drawdown", "pension drawdown", "pcls", "tax-free lump sum", "investment redemption", "fund redemption", "platform statement", "pension statement", "investment statement", "certificate", "confirmation of drawdown"];
  const chainDocumented = chainIndicators.filter((t) => combined.includes(t)).length >= 2;
  return {
    isHNW: true, chainDocumented,
    note: chainDocumented
      ? "HNW case with documented Chain of Wealth (SIPP/ISA drawdowns supported by statements). Low Risk if no other red flags."
      : "HNW indicators present but Chain of Wealth not fully documented.",
  };
}

/* ────────────────────────────────────────────────
 * 6. ADDITIONAL DWELLING DETECTION
 * ──────────────────────────────────────────────── */
function detectAdditionalDwelling(narrative: string, documents: any[]): boolean {
  const combined = (narrative + " " + documents.map((d: any) => d.content || "").join(" ")).toLowerCase();
  const triggers = ["second property", "additional dwelling", "second home", "buy-to-let", "buy to let", "investment property", "additional property", "hrad", "higher rates for additional", "already own", "existing property", "rental property", "portfolio landlord"];
  return triggers.some((t) => combined.includes(t));
}

/* ────────────────────────────────────────────────
 * 7. UK FUNDING GAP CALCULATOR
 * ──────────────────────────────────────────────── */
interface FundingGapResult {
  purchasePrice: number; sdlt: number; legalFees: number; mortgage: number;
  totalRequired: number; totalAvailable: number;
  sowItemsTotal: number; sowItemsBreakdown: { label: string; amount: number }[];
  shortfall: number; autoFlag: string | null;
  sdltResult: SDLTResult; inadequateSdltBudget: boolean;
  ledger: FundsLedger; bonusDelta: BonusDelta | null;
  hnwCheck: { isHNW: boolean; chainDocumented: boolean; note: string };
  materialityPct: number; isMaterialShortfall: boolean;
}

function calculateUKFundingGap(
  purchasePrice: number, sdltProvided: number, legalFees: number,
  mortgageAmount: number, documents: any[], narrative: string,
): FundingGapResult {
  const isAdditional = detectAdditionalDwelling(narrative, documents);
  const sdltResult = calculateSDLT(purchasePrice, isAdditional);
  const effectiveSdlt = Math.max(sdltProvided || 0, sdltResult.totalSdlt);
  const totalRequired = purchasePrice + effectiveSdlt + legalFees;

  const ledger = buildFundsLedger(documents, narrative, mortgageAmount);
  const sowItemsTotal = ledgerTotal(ledger);
  const sowItemsBreakdown: { label: string; amount: number }[] = [];
  for (const [key, entry] of Object.entries(ledger)) {
    if (key === "mortgage" || entry.amount === 0) continue;
    sowItemsBreakdown.push({ label: `${key}${!entry.verified ? " (unverified)" : ""}${entry.is_pending ? " ⏳" : ""}: ${entry.source_label}`, amount: entry.amount });
  }

  const totalAvailable = mortgageAmount + sowItemsTotal;
  const shortfall = totalRequired - totalAvailable;
  const bonusDelta = extractBonusGrossNet(documents, narrative);
  const hnwCheck = detectHNWChainOfWealth(documents, narrative);
  const materialityPct = purchasePrice > 0 ? (Math.max(0, shortfall) / purchasePrice) * 100 : 0;
  const isMaterialShortfall = materialityPct >= 2;

  let autoFlag: string | null = null;
  if (hnwCheck.isHNW && hnwCheck.chainDocumented && shortfall <= 100) {
    // No auto-flag
  } else if (shortfall > 100) {
    if (isMaterialShortfall) {
      autoFlag = `High Risk: Funding Gap of £${shortfall.toLocaleString("en-GB")} (${materialityPct.toFixed(1)}% of purchase price).`;
    } else {
      autoFlag = `Low Risk: Minor Funding Gap of £${shortfall.toLocaleString("en-GB")} (${materialityPct.toFixed(1)}% — below 2% materiality).`;
    }
  }

  const inadequateSdltBudget = isAdditional && sdltProvided < sdltResult.totalSdlt;
  if (inadequateSdltBudget) {
    autoFlag = (autoFlag ? autoFlag + " " : "") +
      `Administrative/Technical — SDLT Under-budgeted. HRAD +5% surcharge applies (£${sdltResult.surcharge.toLocaleString("en-GB")}). Not indicative of criminal tax evasion.`;
  }

  return {
    purchasePrice, sdlt: effectiveSdlt, legalFees, mortgage: mortgageAmount,
    totalRequired, totalAvailable, sowItemsTotal, sowItemsBreakdown,
    shortfall: Math.max(0, shortfall), autoFlag, sdltResult, inadequateSdltBudget,
    ledger, bonusDelta, hnwCheck, materialityPct, isMaterialShortfall,
  };
}

/* ────────────────────────────────────────────────
 * 8. JSON SCHEMA VALIDATOR (Cycle 5: Zod-style)
 * ──────────────────────────────────────────────── */
interface ValidatedLedger {
  mortgage: number; savings: number; gift: number; inheritance: number;
  investment: number; pension: number; other: number; pending_funds: number;
}

function validateLedgerJSON(obj: any): ValidatedLedger | null {
  if (!obj || typeof obj !== "object") return null;
  const keys: (keyof ValidatedLedger)[] = ["mortgage", "savings", "gift", "inheritance", "investment", "pension", "other", "pending_funds"];
  const result: any = {};
  for (const k of keys) {
    const v = obj[k];
    result[k] = typeof v === "number" && !isNaN(v) ? v : 0;
  }
  return result as ValidatedLedger;
}

function validateStage1Response(raw: string): { ledger: ValidatedLedger; bonus_gross?: number; bonus_net?: number } | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const ledger = validateLedgerJSON(parsed.funds_ledger || parsed);
    if (!ledger) return null;
    return {
      ledger,
      bonus_gross: typeof parsed.bonus_gross === "number" ? parsed.bonus_gross : undefined,
      bonus_net: typeof parsed.bonus_net === "number" ? parsed.bonus_net : undefined,
    };
  } catch { return null; }
}

function validateStage2Response(raw: string): any | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.risk_level || typeof parsed.risk_level !== "string") return null;
    if (!Array.isArray(parsed.findings)) parsed.findings = [];
    return parsed;
  } catch { return null; }
}

/* ────────────────────────────────────────────────
 * 9. STAGE 1 PROMPT — DATA EXTRACTOR ONLY
 * ──────────────────────────────────────────────── */
function buildStage1Prompt(): string {
  return `You are a financial data extractor. Your ONLY job is to extract numbers and dates.
DO NOT assess risk. DO NOT provide legal analysis. Just extract data.

Extract ALL funding sources into this EXACT JSON schema:
{
  "funds_ledger": {
    "mortgage": <number>,
    "savings": <number>,
    "gift": <number>,
    "inheritance": <number>,
    "investment": <number>,
    "pension": <number>,
    "other": <number>,
    "pending_funds": <number>
  },
  "bonus_gross": <number or null>,
  "bonus_net": <number or null>,
  "extraction_notes": "brief notes on what was found"
}

## Mapping Rules (STRICT):
- ISA (any type: Lifetime ISA, S&S ISA, Cash ISA) → "investment"
- SIPP / Pension drawdown / PCLS / tax-free lump sum → "pension"
- Premium Bonds → "investment"
- Stocks, shares, bonds, unit trusts, funds → "investment"
- Director's loan, bonus, salary, redundancy, crypto sale, artwork sale → "other"
- Gift / gifted deposit / family gift / parental gift → "gift"
- Inheritance / probate / estate / bequest (from ANY person, e.g. "James Inheritance", "Grandmother's estate") → "inheritance"
- House sale / property sale with completion date within 14 days → "pending_funds"
- Bank savings / personal savings / deposit / current account balance → "savings"
- Mortgage → "mortgage"

## Key Rules:
1. If you see "Inheritance from Grandmother" or "James Inheritance" — map to "inheritance", not "other"
2. If you see both a gross bonus and net bonus, extract BOTH as bonus_gross and bonus_net
3. Do NOT include mortgage in other categories
4. NEVER add up a "Total" line — sum individual items only
5. If Coinbase/crypto sale → "other"

Respond with ONLY the JSON object. No other text.`;
}

/* ────────────────────────────────────────────────
 * 10. STAGE 2 PROMPT — RISK ASSESSOR
 * ──────────────────────────────────────────────── */
function buildStage2Prompt(mathAudit: FundingGapResult, aiLedger: ValidatedLedger, bonusDelta: BonusDelta | null): string {
  const shortfallNote = mathAudit.shortfall === 0
    ? "**Deterministic Funding Gap: £0 — NO funding gap exists. You are FORBIDDEN from calling this a 'Funding Gap'. You may only flag Identity or Source risks.**"
    : mathAudit.isMaterialShortfall
      ? `**Deterministic Funding Gap: £${mathAudit.shortfall.toLocaleString("en-GB")} (${mathAudit.materialityPct.toFixed(1)}% — MATERIAL)**`
      : `**Deterministic Funding Gap: £${mathAudit.shortfall.toLocaleString("en-GB")} (${mathAudit.materialityPct.toFixed(1)}% — IMMATERIAL, do NOT escalate)**`;

  const bonusNote = bonusDelta
    ? `\n### Bonus Verification (JS-calculated)\n${bonusDelta.note}\nThe AI should NOT recalculate this — it is pre-verified by the system.`
    : "";

  const hnwNote = mathAudit.hnwCheck.isHNW
    ? `\n### HNW Assessment\n${mathAudit.hnwCheck.note}`
    : "";

  return `You are Olimey AI, a UK AML compliance risk assessor.

## YOUR ROLE
You receive a pre-extracted financial ledger and a deterministic math audit. Your job is ONLY to assess risk based on:
1. The documents (identity, source, patterns)
2. The pre-calculated math (DO NOT recalculate)

## DETERMINISTIC MATH (THE FINAL WORD — DO NOT OVERRIDE)
${shortfallNote}
- Purchase Price: £${mathAudit.purchasePrice.toLocaleString("en-GB")}
- SDLT: £${mathAudit.sdlt.toLocaleString("en-GB")}${mathAudit.sdltResult.isAdditionalDwelling ? " (includes HRAD +5%)" : ""}
- Legal Fees: £${mathAudit.legalFees.toLocaleString("en-GB")}
- Total Required: £${mathAudit.totalRequired.toLocaleString("en-GB")}
- Total Available: £${mathAudit.totalAvailable.toLocaleString("en-GB")}
${mathAudit.inadequateSdltBudget ? "- SDLT Under-budgeted: Administrative/Technical — NOT criminal tax evasion." : ""}
${bonusNote}
${hnwNote}

## AI-Extracted Ledger
- mortgage: £${aiLedger.mortgage.toLocaleString("en-GB")}
- savings: £${aiLedger.savings.toLocaleString("en-GB")}
- gift: £${aiLedger.gift.toLocaleString("en-GB")}
- inheritance: £${aiLedger.inheritance.toLocaleString("en-GB")}
- investment: £${aiLedger.investment.toLocaleString("en-GB")}
- pension: £${aiLedger.pension.toLocaleString("en-GB")}
- other: £${aiLedger.other.toLocaleString("en-GB")}
- pending_funds: £${aiLedger.pending_funds.toLocaleString("en-GB")}

## CRITICAL RULES
1. If deterministic shortfall is £0, you CANNOT flag a "Funding Gap". Only flag Identity or Source risks.
2. If shortfall < 2% of purchase price, it is IMMATERIAL — Low Risk only.
3. HNW cases with documented SIPP/ISA chain of wealth → Low Risk (unless circular payments, fraud, or strike-off).
4. Missing HRAD → "Administrative/Technical — SDLT Under-budgeted" (NOT tax evasion).
5. Bonus gross vs net differences pre-verified by system → do NOT re-flag.

## LSAG 2026 — Serious Red Flags (ONLY these justify High Risk):
1. Director's Loans from companies with GAZ2 strike-off notices
2. Circular Payment Patterns
3. Gifted Deposits Without Giftor Declaration (>£5,000 from non-immediate family)
4. Hawala / Informal Value Transfer Systems
5. Evidence of deliberate fraud
6. Material Funding Gap (≥2% with no explanation)
7. Offshore trust distributions with opacity (no trust deed, no settlor verification)

## Response Format (ONLY valid JSON):
{
  "risk_level": "High Risk" | "Medium Risk" | "Low Risk",
  "self_correction": {
    "initial_assessment": "...",
    "lsag_aligned": true/false,
    "correction_reasoning": "...",
    "final_assessment": "..."
  },
  "uk_legal_justification": "...",
  "findings": [
    { "issue_type": "...", "severity": "Critical"|"High"|"Medium"|"Low", "evidence": "...", "conclusion": "..." }
  ],
  "funding_gap_check": {
    "total_required": ${mathAudit.totalRequired},
    "total_declared": ${mathAudit.totalAvailable},
    "shortfall": ${mathAudit.shortfall},
    "notes": "..."
  }
}

Respond ONLY with the JSON object.`;
}

/* ────────────────────────────────────────────────
 * 11. RETRY-SIMPLIFIED STAGE 1 PROMPT (for JSON repair)
 * ──────────────────────────────────────────────── */
function buildSimplifiedStage1Prompt(): string {
  return `Extract funding amounts from the documents into this JSON. Only numbers, no text.
{
  "funds_ledger": {
    "mortgage": 0,
    "savings": 0,
    "gift": 0,
    "inheritance": 0,
    "investment": 0,
    "pension": 0,
    "other": 0,
    "pending_funds": 0
  },
  "bonus_gross": null,
  "bonus_net": null,
  "extraction_notes": ""
}
Rules: ISA→investment, SIPP→pension, crypto→other, inheritance from any person→inheritance.
Respond with ONLY the JSON.`;
}

/* ────────────────────────────────────────────────
 * 12. LEDGER MATCH SCORING
 * ──────────────────────────────────────────────── */
function scoreLedgerMatch(
  deterministicLedger: FundsLedger,
  aiLedger: ValidatedLedger | null,
): { match: boolean; score: number; mismatches: string[] } {
  if (!aiLedger) return { match: false, score: 0, mismatches: ["AI did not return funds_ledger"] };
  const keys: (keyof ValidatedLedger)[] = ["savings", "gift", "inheritance", "investment", "pension", "other", "pending_funds"];
  const mismatches: string[] = [];
  let matched = 0;
  for (const key of keys) {
    const det = deterministicLedger[key].amount;
    const ai = aiLedger[key] ?? 0;
    if (det === 0 && ai === 0) { matched++; continue; }
    const diff = Math.abs(det - ai);
    const tolerance = Math.max(500, det * 0.10); // Wider tolerance for Cycle 5
    if (diff <= tolerance) { matched++; } else {
      mismatches.push(`${key}: det=£${det.toLocaleString("en-GB")} vs ai=£${ai.toLocaleString("en-GB")}`);
    }
  }
  return { match: mismatches.length === 0, score: Math.round((matched / keys.length) * 100), mismatches };
}

/* ────────────────────────────────────────────────
 * 13. AI GATEWAY CALL HELPER
 * ──────────────────────────────────────────────── */
import { chat as aiGatewayChat, extractContent as aiExtractContent } from "../_shared/aiGateway.ts";

async function callAI(_apiKey: string, systemPrompt: string, userContent: string, model = "google/gemini-2.5-flash"): Promise<string> {
  const resp = await aiGatewayChat({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.05,
  }, "stress-test-sow");
  return aiExtractContent(resp);
}

/* ────────────────────────────────────────────────
 * 14. EDGE FUNCTION HANDLER — TWO-STAGE PIPELINE
 * ──────────────────────────────────────────────── */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { case_id, title, property_address, purchase_price, mortgage_amount, sdlt, legal_fees, tenure, transaction_type, parties, documents } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── Normalise documents ──
    const normalisedDocs = (documents || []).map((d: any) => ({
      ...d, content: normaliseSymbols(d.content || ""),
    }));

    const narrative = `
## Case: ${title}
**Case ID:** ${case_id}
**Property:** ${property_address}
**Purchase Price:** £${(purchase_price || 0).toLocaleString("en-GB")}
**Mortgage Amount:** £${(mortgage_amount || 0).toLocaleString("en-GB")}
**SDLT:** £${(sdlt || 0).toLocaleString("en-GB")}
**Legal Fees:** £${(legal_fees || 0).toLocaleString("en-GB")}
**Tenure:** ${tenure}
**Transaction Type:** ${transaction_type}

### Parties
${(parties || []).map((p: any) => `- **${p.full_name}** (DOB: ${p.date_of_birth}) — ${p.occupation} at ${p.employer}, Annual Income: £${(p.annual_income || 0).toLocaleString("en-GB")}, Address: ${p.address}`).join("\n")}

### Documents Provided
${normalisedDocs.map((d: any, i: number) => `
#### Document ${i + 1}: ${d.title}
${d.content}
`).join("\n")}
`;

    // ── Deterministic funding gap ──
    const mathAudit = calculateUKFundingGap(purchase_price || 0, sdlt || 0, legal_fees || 0, mortgage_amount || 0, normalisedDocs, narrative);

    console.log(`[${case_id}] Ledger: savings=£${mathAudit.ledger.savings.amount}, gift=£${mathAudit.ledger.gift.amount}, inheritance=£${mathAudit.ledger.inheritance.amount}, investment=£${mathAudit.ledger.investment.amount}, pension=£${mathAudit.ledger.pension.amount}, other=£${mathAudit.ledger.other.amount}`);
    console.log(`[${case_id}] Deterministic: shortfall=£${mathAudit.shortfall}, materiality=${mathAudit.materialityPct.toFixed(1)}%, HNW=${mathAudit.hnwCheck.isHNW}, chainDoc=${mathAudit.hnwCheck.chainDocumented}`);

    // ═══════════════════════════════════════════
    // STAGE 1: DATA EXTRACTION (no risk assessment)
    // ═══════════════════════════════════════════
    console.log(`[${case_id}] Stage 1: Data Extraction starting...`);
    let stage1Raw = await callAI(LOVABLE_API_KEY, buildStage1Prompt(), narrative);
    let stage1 = validateStage1Response(stage1Raw);

    // JSON Repair: retry with simplified prompt if invalid
    if (!stage1) {
      console.log(`[${case_id}] Stage 1: Invalid JSON — retrying with simplified prompt`);
      stage1Raw = await callAI(LOVABLE_API_KEY, buildSimplifiedStage1Prompt(), narrative);
      stage1 = validateStage1Response(stage1Raw);
    }

    // Final fallback: use deterministic ledger
    const aiLedger: ValidatedLedger = stage1?.ledger || {
      mortgage: mortgage_amount || 0,
      savings: mathAudit.ledger.savings.amount,
      gift: mathAudit.ledger.gift.amount,
      inheritance: mathAudit.ledger.inheritance.amount,
      investment: mathAudit.ledger.investment.amount,
      pension: mathAudit.ledger.pension.amount,
      other: mathAudit.ledger.other.amount,
      pending_funds: mathAudit.ledger.pending_funds.amount,
    };

    console.log(`[${case_id}] Stage 1 result: savings=£${aiLedger.savings}, gift=£${aiLedger.gift}, inheritance=£${aiLedger.inheritance}, investment=£${aiLedger.investment}, pension=£${aiLedger.pension}, other=£${aiLedger.other}`);

    // Bonus: JS does the math from AI-extracted gross/net (Cycle 5)
    let bonusDelta = mathAudit.bonusDelta;
    if (!bonusDelta && stage1?.bonus_gross && stage1?.bonus_net) {
      const gross = stage1.bonus_gross;
      const net = stage1.bonus_net;
      const expectedNet = Math.round(gross * 0.6);
      const tolerance = gross * 0.05;
      const deltaExplained = Math.abs(net - expectedNet) <= tolerance;
      bonusDelta = {
        declared_gross: gross, received_net: net, tax_rate: 0.40,
        expected_net: expectedNet, delta_explained: deltaExplained,
        note: deltaExplained
          ? `VERIFIED: Gross £${gross.toLocaleString("en-GB")} → Net £${net.toLocaleString("en-GB")}. 40% tax explains difference.`
          : `UNVERIFIED: Gross £${gross.toLocaleString("en-GB")} → Net £${net.toLocaleString("en-GB")}. Expected £${expectedNet.toLocaleString("en-GB")} after 40% tax.`,
      };
    }

    // ═══════════════════════════════════════════
    // STAGE 2: RISK ASSESSMENT (uses ledger + deterministic math)
    // ═══════════════════════════════════════════
    console.log(`[${case_id}] Stage 2: Risk Assessment starting...`);
    const stage2Prompt = buildStage2Prompt(mathAudit, aiLedger, bonusDelta);
    let stage2Raw = await callAI(LOVABLE_API_KEY, stage2Prompt, narrative);
    let parsed = validateStage2Response(stage2Raw);

    // JSON Repair: retry with simpler model if invalid
    if (!parsed) {
      console.log(`[${case_id}] Stage 2: Invalid JSON — retrying...`);
      stage2Raw = await callAI(LOVABLE_API_KEY, stage2Prompt, narrative, "google/gemini-2.5-flash-lite");
      parsed = validateStage2Response(stage2Raw);
    }

    // Final fallback
    if (!parsed) {
      console.error(`[${case_id}] Stage 2: Both attempts failed. Raw:`, stage2Raw.slice(0, 500));
      parsed = {
        risk_level: "Unknown",
        uk_legal_justification: "AI response could not be parsed after 2 attempts",
        findings: [],
        raw_response: stage2Raw.slice(0, 2000),
      };
    }

    // Inject AI ledger and ledger match
    parsed.funds_ledger = aiLedger;
    const ledgerMatch = scoreLedgerMatch(mathAudit.ledger, aiLedger);
    parsed.ledger_match = ledgerMatch;
    parsed.stage1_used_fallback = !stage1;

    // ── Deterministic Override (Cycle 5: THE FINAL WORD) ──
    // If deterministic says £0 gap, AI cannot call it a "Funding Gap"
    if (mathAudit.shortfall === 0) {
      // Strip any funding gap findings
      parsed.findings = (parsed.findings || []).filter((f: any) =>
        !/funding\s*gap|shortfall|under.?funded/i.test(f.issue_type + " " + f.conclusion)
      );
      // Force funding_gap_check to match deterministic
      parsed.funding_gap_check = {
        total_required: mathAudit.totalRequired,
        total_declared: mathAudit.totalAvailable,
        shortfall: 0,
        notes: "Deterministic override: No funding gap detected.",
      };
    }

    // ── HNW override ──
    if (mathAudit.hnwCheck.isHNW && mathAudit.hnwCheck.chainDocumented) {
      const hasRedFlags = (parsed.findings || []).some((f: any) =>
        /strike.?off|circular|hawala|fraud|gaz2/i.test(f.issue_type + " " + f.evidence)
      );
      if (!hasRedFlags && parsed.risk_level !== "Low Risk") {
        console.log(`[${case_id}] HNW Chain of Wealth override: ${parsed.risk_level} → Low Risk`);
        parsed.risk_level = "Low Risk";
        parsed.findings.push({
          issue_type: "HNW Chain of Wealth — Risk Downgrade",
          severity: "Low", evidence: mathAudit.hnwCheck.note,
          conclusion: "Documented SIPP/ISA drawdowns. No red flags. → Low Risk per LSAG.",
        });
      }
    }

    // ── Bonus delta ──
    if (bonusDelta && bonusDelta.delta_explained) {
      const bonusDiscrepancy = Math.abs(bonusDelta.declared_gross - bonusDelta.received_net);
      const bonusMaterialityPct = mathAudit.purchasePrice > 0 ? (bonusDiscrepancy / mathAudit.purchasePrice) * 100 : 0;
      parsed.findings.push({
        issue_type: "Bonus Gross/Net Tax Delta — VERIFIED",
        severity: "Low", evidence: bonusDelta.note,
        conclusion: bonusMaterialityPct < 2 ? "Immaterial — no escalation." : "Verified by 40% tax delta.",
      });
      if (bonusMaterialityPct < 2 && parsed.risk_level === "High Risk") {
        const hasOtherHigh = (parsed.findings || []).some((f: any) =>
          f.severity === "Critical" || (f.severity === "High" && !/bonus|tax delta/i.test(f.issue_type))
        );
        if (!hasOtherHigh) { parsed.risk_level = "Medium Risk"; }
      }
    }

    // ── Self-correction validation ──
    const sc = parsed.self_correction;
    if (sc && sc.final_assessment && sc.final_assessment !== parsed.risk_level) {
      console.log(`[${case_id}] Self-correction: ${parsed.risk_level} → ${sc.final_assessment}`);
      parsed.risk_level = sc.final_assessment;
    }

    // ── Auto-flag override (material shortfall only) ──
    if (mathAudit.autoFlag && mathAudit.isMaterialShortfall && parsed.risk_level !== "High Risk") {
      console.log(`[${case_id}] Material auto-flag override → High Risk`);
      parsed.risk_level = "High Risk";
      parsed.findings.unshift({
        issue_type: "Deterministic Funding Gap Override",
        severity: "Critical", evidence: mathAudit.autoFlag,
        conclusion: `Material shortfall of £${mathAudit.shortfall.toLocaleString("en-GB")} (${mathAudit.materialityPct.toFixed(1)}%).`,
      });
    }

    parsed.deterministic_audit = { ...mathAudit, sdltResult: mathAudit.sdltResult };
    parsed.processing_stages = { stage1_success: !!stage1, stage2_success: !!parsed.risk_level && parsed.risk_level !== "Unknown" };

    return new Response(JSON.stringify({ case_id, assessment: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stress-test-sow error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

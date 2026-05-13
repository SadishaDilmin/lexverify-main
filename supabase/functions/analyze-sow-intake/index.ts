import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions"; // kept for reference only

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── Auth gate ─────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin-only access
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[analyze-sow-intake] Authenticated admin: ${user.id}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ─── Current state document ────────────────────────────────────
    const currentState = `
# Olimey AI Current Intake Form & Process Analysis

## CURRENT CASE CREATION FORM (CaseNew.tsx — 4-step wizard)

### Step 1: Property & Case Details
- Case Reference (required)
- Transaction Type: Purchase / Sale
- Property Address (required)
- Tenure: Freehold / Leasehold / Commonhold / Unknown
- Property Type: House / Flat / Maisonette / Other / Unknown
- Conveyancer (auto-filled, disabled)
- Seller Conveyancer Email (optional)
- Lender (optional, free text)
- Hoowla CMS import (optional)

### Step 2: Parties
- Purchasers: Full Name (required), Email, PEP Status, Buyer Type (SDLT: Standard/FTB/Additional Dwelling/Non-UK Resident/Company), Relationship, Notes
- Sellers: Same fields minus buyer type
- Giftors (optional toggle): Same as purchasers + Relationship to Purchaser

### Step 3: Financials
- Purchase Price (optional at creation — auto-calculates SDLT)
- Stamp Duty (auto-calculated, overridable)
- Legal Fees (optional)
- NO mortgage amount field
- NO deposit amount field
- NO completion date field

### Step 4: Attributes
- Complexity flags: leasehold, new-build, BSA, auction, right-to-buy, shared-ownership, staircasing
- Add-on documents (optional)
- Credit estimate

## CURRENT SoW FORM (SoWFormUI.tsx — the assessment workspace)

### Transaction fields captured:
- Property Address (required)
- Purchase Price (required)
- Case Reference
- Tenure
- Stamp Duty
- Legal Fees
- Mortgage Amount (field exists but NOT in CaseNew)
- Transaction Type
- Property Type
- Lender
- Additional Context (free text)

### Per-person fields:
- Full Name (required)
- Role: Purchaser / Giftor
- Funding Source: Salary/Employment Income, Savings, Sale of Existing Property, Gift, Inheritance, Investment Proceeds, Pension Lump Sum, Compensation/Settlement, Business Profits, Mortgage, Other
- Contribution Amount
- Employment Status: Employed, Self-Employed, Director/Business Owner, Retired, Not Currently Employed, Student, Other
- Additional Notes
- Relationship to Purchaser (giftors only)
- PEP Status
- Buyer Type
- Per-person file attachments
- "Raise Enquiry" toggles for funding and employment

### Process flow:
1. User creates case in CaseNew (4-step wizard) — parties and basic details saved to DB
2. User navigates to case workspace → SoW tab
3. Form pre-fills from case data + case_parties table
4. User uploads documents (drag-drop, per-person, bulk AML upload with auto-classification)
5. Armalytix report extraction (extract-armalytix function) auto-fills person data
6. Documents pre-processed in parallel batches (text extraction, OCR)
7. Profile intelligence gathered via Firecrawl (parallel)
8. Files hydrated from case storage (for re-runs)
9. Multi-chunk parallel analysis with consolidation pass
10. Cross-family LLM judge verification
11. Report saved with evidence references

## CURRENT DATABASE SCHEMA (cases table):
- case_reference, property_address, transaction_type, tenure, property_type
- conveyancer_id/name/email, seller_conveyancer_email
- purchase_price, stamp_duty, legal_fees, lender
- risk_level, risk_score, status, case_flags
- hoowla_matter_id, ai_context_notes

## CURRENT DATABASE SCHEMA (case_parties table):
- full_name, role, email, pep_status, buyer_type
- relationship_to_purchaser, notes
- raise_enquiry_funding, raise_enquiry_employment

## KEY GAPS ALREADY IDENTIFIED:
1. Mortgage amount is in SoWFormUI but NOT saved to cases table or pre-filled from CaseNew
2. No deposit amount captured anywhere
3. No completion date / expected completion date
4. No mortgage type (repayment, interest-only, HTB)
5. No mortgage term
6. No solicitor/lender reference numbers
7. Employment details (employer name, job title, income) not captured at intake
8. Date of birth not captured (critical for age-based risk checks)
9. No nationality/residency status beyond SDLT buyer type
10. No existing property details (for chain/additional dwelling analysis)

## REGULATORY CONTEXT:
- Law Society AML Guide on Source of Funds (November 2025)
- Regulation 28 MLR 2017
- LSAG 2026 Guidance
- UK Finance Handbook (lender requirements)
- POCA 2002
`;

    // ─── Run BOTH stages in parallel using parallelChat ──────────
    const { parallelChat, extractContent: ec } = await import("../_shared/aiGateway.ts");

    console.log("[analyze-sow-intake] Running Stage 1 + Stage 2 in parallel");

    const stage1Req = {
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a senior UK conveyancing compliance architect and AML specialist with 20+ years of experience. You have deep expertise in:
- Money Laundering Regulations 2017 (MLR 2017), particularly Regulation 28 (Source of Funds/Wealth)
- Law Society Anti-Money Laundering Practice Note (November 2025)
- LSAG 2026 Guidance on Source of Wealth
- UK Finance Handbook (CML/BSA handbook) Part 1 and Part 2
- POCA 2002 and SAR obligations
- SRA Standards and Regulations
- Armalytix and Open Banking verification workflows
- Thirdfort and InfoTrack AML verification

Your task is to deeply analyse the current Olimey AI intake form and assessment process, then produce a comprehensive, actionable improvement plan. Think step-by-step about every aspect of the AML compliance workflow.

For each recommendation, explain:
1. WHAT is missing or suboptimal
2. WHY it matters (cite specific regulation, guidance, or practical risk)
3. HOW it should be implemented (specific field types, validation rules, UX placement)
4. PRIORITY: Critical (blocks compliance), High (significant risk reduction), Medium (efficiency gain), Low (nice-to-have)

Be forensically thorough. Consider the entire lifecycle: intake → document collection → analysis → reporting → ongoing monitoring.`,
        },
        {
          role: "user",
          content: `Analyse this current Olimey AI system and produce a detailed improvement plan:\n\n${currentState}`,
        },
      ],
    };

    // Stage 2 needs Stage 1 output, so we can't truly parallelize them.
    // Run Stage 1 first, then Stage 2.
    const [stage1Response] = await parallelChat([stage1Req], {
      maxConcurrency: 1,
      logContext: "analyze-sow-intake-stage1",
    });

    const stage1Analysis = ec(stage1Response);
    console.log(`[analyze-sow-intake] Stage 1 complete: ${stage1Analysis.length} chars`);

    // ─── Stage 2: Cross-family judge ───────────────────────
    const stage2Req = {
      model: "openai/gpt-5-nano",
      messages: [
        {
          role: "system",
          content: `You are an independent compliance technology auditor and legal technology architect. Your role is to critically evaluate an improvement plan for a Source of Wealth assessment tool used by UK conveyancers.

You MUST:
1. VALIDATE each recommendation against current UK AML regulations (MLR 2017, LSAG 2026, Law Society guidance)
2. CHALLENGE any recommendations that are impractical, over-engineered, or would create friction without proportionate compliance benefit
3. IDENTIFY any gaps the primary analyst missed
4. RE-PRIORITISE recommendations based on regulatory risk vs implementation effort
5. ADD specific implementation notes where the primary analysis was vague
6. FLAG any recommendations that could inadvertently create compliance issues (e.g., collecting data you're not authorised to store)
7. Consider GDPR implications of additional data collection
8. Consider the UX burden on fee-earners (conveyancers are time-poor)

Structure your response as:

## JUDGE VERDICT
[APPROVED / APPROVED WITH AMENDMENTS / REVISION REQUIRED]

## VALIDATED RECOMMENDATIONS (agree with primary analyst)
For each: brief rationale for agreement

## CHALLENGED RECOMMENDATIONS (disagree or modify)
For each: what you'd change and why

## MISSED GAPS (additional recommendations)
Any critical items the primary analyst overlooked

## FINAL PRIORITISED ROADMAP
A consolidated, de-duplicated list in implementation order, with:
- Phase 1: Critical compliance gaps (must-fix)
- Phase 2: High-impact efficiency improvements
- Phase 3: Enhanced intelligence features
- Phase 4: Advanced automation

For each item include: field/feature name, data type, where in the form it goes, and the specific regulation it addresses.`,
        },
        {
          role: "user",
          content: `Here is the current system state:\n\n${currentState}\n\n---\n\nHere is the primary analyst's improvement plan:\n\n${stage1Analysis}\n\nPlease evaluate, challenge, and produce the final consolidated roadmap.`,
        },
      ],
    };

    let stage2Judge = "";
    try {
      const [stage2Response] = await parallelChat([stage2Req], {
        maxConcurrency: 1,
        logContext: "analyze-sow-intake-stage2",
      });
      stage2Judge = ec(stage2Response);
      console.log(`[analyze-sow-intake] Stage 2 complete: ${stage2Judge.length} chars`);
    } catch (err) {
      console.error("Stage 2 error:", err);
      stage2Judge = "Judge evaluation failed — returning primary analysis only.";
    }

    return new Response(JSON.stringify({
      stage1_analysis: stage1Analysis,
      stage2_judge: stage2Judge,
      stage1_model: "google/gemini-3-flash-preview",
      stage2_model: "openai/gpt-5-nano",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyze-sow-intake error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

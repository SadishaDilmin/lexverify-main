import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/cmsEncryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { matter_id } = body;

    if (!matter_id || typeof matter_id !== "string" || matter_id.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "matter_id is required (Hoowla case ID)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { resolveActiveCmsIntegration } = await import("../_shared/resolveCmsIntegration.ts");

    // Resolve the user's active CMS integration using stable identifiers first.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("email, firm_name")
      .eq("user_id", userId)
      .single();

    if (profileErr) {
      return new Response(
        JSON.stringify({ error: "Unable to load your profile." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { integration, matchType } = await resolveActiveCmsIntegration(adminClient, {
      provider: "hoowla",
      userId,
      profileEmail: profile?.email ?? userData.user.email ?? null,
      profileFirmName: profile?.firm_name ?? null,
    });

    if (matchType === "ambiguous") {
      return new Response(
        JSON.stringify({ error: "Multiple Hoowla integrations could match your account. Please ask your administrator to review the CMS integration setup." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration) {
      return new Response(
        JSON.stringify({
          error: "No active Hoowla integration found for your account. Please ask your administrator to check the CMS integration setup.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-hoowla] Resolved integration via ${matchType ?? "unknown"}: ${integration.id}`);

    const hoowlaBaseUrl = integration.api_base_url.replace(/\/$/, "");
    let hoowlaApiKey: string;
    try {
      hoowlaApiKey = await decryptApiKey(integration.api_key_encrypted);
    } catch (decryptErr) {
      console.error("Failed to decrypt API key:", decryptErr);
      return new Response(
        JSON.stringify({ error: "Failed to decrypt CMS API key. Please re-save the Hoowla integration in Admin → CMS Integrations with the current API key." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const hoowlaUserEmail = integration.provider_user_email;

    if (!hoowlaUserEmail) {
      return new Response(
        JSON.stringify({ error: "Hoowla user email not configured. Please ask your administrator to update the CMS integration." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encodedEmail = encodeURIComponent(hoowlaUserEmail);
    const caseId = encodeURIComponent(matter_id.trim());

    // Step 1: Fetch case info from Hoowla
    // GET /api/v2/cases/cases/info?id={id}&user={email}
    const caseInfoRes = await fetch(
      `${hoowlaBaseUrl}/api/v2/cases/cases/info?id=${caseId}&user=${encodedEmail}`,
      {
        method: "GET",
        headers: {
          "X-API-KEY": hoowlaApiKey,
          Accept: "application/json",
        },
      }
    );

    if (!caseInfoRes.ok) {
      const errText = await caseInfoRes.text();
      console.error(`Hoowla case info error [${caseInfoRes.status}]:`, errText);

      if (caseInfoRes.status === 404) {
        return new Response(
          JSON.stringify({ error: `Case ${matter_id} not found in Hoowla` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (caseInfoRes.status === 401) {
        return new Response(
          JSON.stringify({ error: "Hoowla authentication failed. Check your API key and user email." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Hoowla API error: ${caseInfoRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const caseInfo = await caseInfoRes.json();
    console.log("Hoowla caseInfo keys:", Object.keys(caseInfo));
    console.log("Hoowla title_tenure:", caseInfo.title_tenure);
    console.log("Hoowla case_type_name:", caseInfo.case_type_name);
    console.log("Hoowla case_name:", caseInfo.case_name);
    console.log("Hoowla contributors:", JSON.stringify(caseInfo.contributors));

    // Step 2: Fetch custom fields for financial data (purchase price, stamp duty, legal fees)
    let customFields: any[] = [];
    try {
      const cfRes = await fetch(
        `${hoowlaBaseUrl}/api/v2/cases/custom-fields/?user=${encodedEmail}&case=${caseId}`,
        {
          method: "GET",
          headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
        }
      );
      if (cfRes.ok) {
        customFields = await cfRes.json();
        // Log ALL custom field slugs for debugging
        const allSlugs = customFields.map((f: any) => `${f.casedetail_slug}=${f.casedetail_value}`);
        console.log("Hoowla ALL custom field count:", allSlugs.length);
        // Log fields that might contain lender/solicitor info
        const lenderRelated = customFields
          .filter((f: any) => /lender|mortgage|solicitor|conveyancer|other.?side|seller|vendor|acting/i.test((f.casedetail_slug || "") + (f.casedetail_value || "")))
          .map((f: any) => `${f.casedetail_slug}=${f.casedetail_value}`);
        console.log("Hoowla lender/solicitor related fields:", lenderRelated);
        // Log financial fields (price, fee, duty, invoice, csow, stamp)
        const financialRelated = customFields
          .filter((f: any) => /price|fee|duty|sdlt|stamp|invoice|csow|completion.?statement|supplement|disb|vat|total|amount|cost|charge|sum/i.test((f.casedetail_slug || "")))
          .filter((f: any) => {
            const v = String(f.casedetail_value ?? "").trim();
            return v !== "" && v !== "0";
          })
          .map((f: any) => `${f.casedetail_slug}=${f.casedetail_value}`);
        console.log("Hoowla financial fields:", financialRelated);
        const relevantCustomFields = customFields
          .filter((f: any) => /tenure|property|dwelling|class-of-title|title/i.test((f.casedetail_slug || "").toLowerCase()))
          .slice(0, 80)
          .map((f: any) => `${f.casedetail_slug}=${f.casedetail_value}`);
        console.log("Hoowla relevant custom fields:", relevantCustomFields);
      } else {
        await cfRes.text(); // consume body
      }
    } catch (e) {
      console.warn("Failed to fetch custom fields:", e);
    }

    // Step 3: Fetch quotes/invoices for legal fees extraction
    // Try multiple Hoowla billing endpoints to find the right one
    let invoiceTotal: number | null = null;
    const billingEndpoints = [
      `/api/v2/billing/quotes/?user=${encodedEmail}&case=${caseId}`,
      `/api/v2/cases/quotes/?user=${encodedEmail}&case=${caseId}`,
      `/api/v2/billing/invoices/?user=${encodedEmail}&case=${caseId}`,
      `/api/v2/cases/invoices/?user=${encodedEmail}&case=${caseId}`,
      `/api/v2/cases/billing/?user=${encodedEmail}&case=${caseId}`,
    ];
    for (const endpoint of billingEndpoints) {
      try {
        const invRes = await fetch(`${hoowlaBaseUrl}${endpoint}`, {
          method: "GET",
          headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
        });
        console.log(`Hoowla billing endpoint ${endpoint} → ${invRes.status}`);
        if (invRes.ok) {
          const data = await invRes.json();
          const items = Array.isArray(data) ? data : (data?.results || data?.data || data?.items || []);
          console.log(`Hoowla billing hit! Endpoint: ${endpoint}, items: ${items.length}`);
          if (items.length > 0) {
            console.log("Hoowla billing sample keys:", Object.keys(items[0]));
            console.log("Hoowla billing items:", JSON.stringify(items.slice(0, 5).map((inv: any) => ({
              name: inv.name || inv.invoice_name || inv.title || inv.description || inv.quote_name || "unnamed",
              type: inv.type || inv.invoice_type || inv.category || inv.status || "",
              total: inv.total || inv.invoice_total || inv.amount || inv.gross_total || inv.quote_total || inv.net_total || 0,
              accepted: inv.accepted ?? inv.is_accepted ?? inv.status ?? "",
            }))));
            // Sum legal fees + supplements from accepted quotes or draft invoices
            let total = 0;
            for (const inv of items) {
              const invName = (inv.name || inv.invoice_name || inv.title || inv.description || inv.quote_name || "").toLowerCase();
              const invType = (inv.type || inv.invoice_type || inv.category || "").toLowerCase();
              const invStatus = (inv.status || "").toLowerCase();
              const combined = invName + " " + invType;
              const isLegalFeeOrSupplement =
                /legal.?fee/i.test(combined) ||
                /supplement/i.test(combined) ||
                /smart.?legal/i.test(combined) ||
                /professional.?fee/i.test(combined) ||
                /solicitor.?fee/i.test(combined) ||
                /quote/i.test(combined);
              // Accept draft invoices and accepted quotes
              const isAcceptedOrDraft = !invStatus || /accepted|draft|approved|sent|open|paid/i.test(invStatus);
              if (!isLegalFeeOrSupplement && items.length > 1) {
                console.log(`Skipping billing item "${invName}" (type: "${invType}", status: "${invStatus}") — not a legal fee or supplement`);
                continue;
              }
              if (!isAcceptedOrDraft) {
                console.log(`Skipping billing item "${invName}" — status "${invStatus}" not accepted/draft`);
                continue;
              }
              const invTotal = parseFloat(String(inv.total || inv.invoice_total || inv.amount || inv.gross_total || inv.quote_total || inv.net_total || 0));
              if (!isNaN(invTotal) && invTotal > 0) total += invTotal;
            }
            if (total > 0) {
              invoiceTotal = total;
              console.log("Hoowla billing total (legal fees):", invoiceTotal, "from endpoint:", endpoint);
              break; // Found valid data, stop trying other endpoints
            }
          }
        } else {
          await invRes.text(); // consume body
        }
      } catch (e) {
        console.warn(`Failed to fetch ${endpoint}:`, e);
      }
    }

    // Build property address from individual fields
    const addressParts = [
      caseInfo.address_line1,
      caseInfo.address_line2,
      caseInfo.address_city,
      caseInfo.address_county,
      caseInfo.address_postcode,
    ].filter((p) => p && p.trim());
    const propertyAddress = addressParts.join(", ");

    // Map tenure from Hoowla numeric codes
    const tenureMap: Record<number, string> = {
      0: "Unknown",
      10: "Freehold",
      20: "Leasehold",
      110: "Unknown",
    };

    // Try tenure from API first (title_tenure), then custom fields
    const rawTitleTenure = caseInfo.title_tenure;
    let resolvedTenure =
      (typeof rawTitleTenure === "number" ? tenureMap[rawTitleTenure] : undefined) ||
      (typeof rawTitleTenure === "string" ? normalizeTenureString(rawTitleTenure) : null) ||
      (Array.isArray(rawTitleTenure) ? normalizeTenureFromArray(rawTitleTenure) : null) ||
      (rawTitleTenure && typeof rawTitleTenure === "object" ? normalizeTenureString((rawTitleTenure as any).tenure) : null) ||
      "Unknown";

    if (resolvedTenure === "Unknown") {
      const cfTenure = findCustomFieldText(customFields, [
        "tenure", "title-tenure", "title_tenure", "property-tenure", "class-of-title",
      ]);
      const normalizedTenure = normalizeTenureString(cfTenure);
      if (normalizedTenure) resolvedTenure = normalizedTenure;
    }

    // Property type from custom fields (exact slug match first, then inferred value scan)
    const cfPropertyType = findCustomFieldText(customFields, [
      "property-type", "property_type", "propertytype", "type-of-property", "dwelling-type",
    ]);

    let resolvedPropertyType =
      normalizePropertyType(cfPropertyType) ||
      inferPropertyTypeFromCustomFields(customFields) ||
      normalizePropertyType(caseInfo.case_name) ||
      "Unknown";

    // Leasehold inference: if tenure is Leasehold and property type is still Unknown,
    // check if address has a number+letter pattern (e.g. "12A", "5B") → Maisonette, otherwise → Flat
    if (resolvedTenure === "Leasehold" && resolvedPropertyType === "Unknown") {
      const hasNumberLetter = /\d+[A-Za-z]\b/.test(propertyAddress);
      resolvedPropertyType = hasNumberLetter ? "Maisonette" : "Flat";
      console.log(`Leasehold inference: address "${propertyAddress}" → ${resolvedPropertyType} (numberLetter=${hasNumberLetter})`);
    }

    // Data quality warnings
    const warnings: string[] = [];

    // Tenure vs Property Type mismatches
    if (resolvedTenure === "Leasehold" && resolvedPropertyType === "House") {
      warnings.push("Tenure is Leasehold but Property Type is House — this is unusual. Please verify the property type is correct.");
    }
    if (resolvedTenure === "Freehold" && (resolvedPropertyType === "Flat" || resolvedPropertyType === "Maisonette")) {
      warnings.push(`Tenure is Freehold but Property Type is ${resolvedPropertyType} — most flats and maisonettes are Leasehold. Please verify tenure.`);
    }

    // Unresolved fields
    if (resolvedTenure === "Unknown") {
      warnings.push("Tenure could not be determined from Hoowla — please select the correct tenure manually.");
    }
    if (resolvedPropertyType === "Unknown") {
      warnings.push("Property Type could not be determined from Hoowla — please select the correct type manually.");
    }

    // Missing address
    if (!propertyAddress || propertyAddress.trim().length < 5) {
      warnings.push("Property address appears incomplete or missing — please check and complete it.");
    }

    // Missing parties
    const parties = mapContributors(caseInfo.contributors || []);
    const hasPurchasers = parties.some((p) => p.role === "purchaser");
    const hasSellers = parties.some((p) => p.role === "seller");
    if (!hasPurchasers) {
      warnings.push("No purchaser/buyer parties were found in Hoowla — please add at least one purchaser manually.");
    }
    if (!hasSellers) {
      warnings.push("No seller parties were found in Hoowla — you may need to add seller details manually.");
    }

    // Extract financial data from custom fields.
    // NOTE: slug match is EXACT (case-insensitive). Substring matching previously
    // caused unrelated fields like "asking-price" or "max-loan-price" to be
    // returned as the purchase price. Do not re-introduce a bare "price" token.
    let purchasePrice = findCustomFieldNumericValue(customFields, [
      "purchase-price", "purchase_price",
      "agreed-price", "agreed-purchase-price",
      "property-price", "property-value", "property_value", "propertyvalue",
      "csow-purchase-price", "csow-agreed-price", "csow-price",
      "completion-statement-purchase-price", "consideration",
    ]);

    // Fallback: extract purchase price from memorandum of sale PDF
    if (!purchasePrice) {
      purchasePrice = await extractPriceFromMemo(hoowlaBaseUrl, hoowlaApiKey, encodedEmail, caseId);
    }

    // Plausibility gate: a real UK residential purchase price sits between
    // £1,000 and £10,000,000. Anything outside this range is almost certainly
    // a misclassified field or a vision-model misread — drop it and warn so
    // the operator enters the value manually rather than seeing a wrong number.
    const PRICE_HARD_MIN = 1_000;
    const PRICE_HARD_MAX = 10_000_000;
    if (purchasePrice != null && (purchasePrice < PRICE_HARD_MIN || purchasePrice > PRICE_HARD_MAX)) {
      const formatted = purchasePrice.toLocaleString("en-GB", { maximumFractionDigits: 2 });
      warnings.push(
        `A purchase price of £${formatted} was extracted from Hoowla but looks implausible — please enter it manually on the Financials step.`
      );
      console.warn(`Discarded implausible Hoowla purchase price: ${purchasePrice}`);
      purchasePrice = null;
    }
    const stampDuty = findCustomFieldNumericValue(customFields, [
      "stamp-duty", "stamp_duty", "sdlt", "stamp-duty-land-tax",
      "csow-sdlt", "csow-stamp-duty", "csow-stamp-duty-land-tax",
      "land-tax", "sdlt-amount", "stamp-duty-amount",
    ]);

    // Legal fees priority:
    // 1) explicit legal fee fields
    // 2) draft invoice total in custom fields
    // 3) accepted initial quote total in custom fields
    // 4) billing API totals (if endpoint is available)
    const explicitLegalFees = findCustomFieldNumericValue(customFields, [
      "legal-fees", "legal_fees", "our-fees", "solicitor-fees",
      "csow-legal-fees", "csow-our-fees", "csow-professional-fees",
      "total-legal-fees", "professional-fees", "professional-charges",
    ]);
    const draftInvoiceTotalFromCustomFields = findCustomFieldNumericValue(customFields, [
      "draft-invoice-total", "draft_invoice_total", "draft-invoice",
      "draft_invoice", "invoice-total", "csow-invoice-total",
      "csow-total", "total-payable-to-us", "amount-payable-to-us",
    ]);
    const acceptedQuoteTotalFromCustomFields = findCustomFieldNumericValue(customFields, [
      "accepted-quote-total", "quote-total", "quote_total",
      "accepted-quote", "quote-accepted", "initial-quote",
      "initial_quote", "client-care-quote", "legal-quote", "estimate-total",
    ]);

    const legalFeeCandidates = findCustomFieldCandidates(customFields, [
      "legal", "fee", "draft-invoice", "invoice-total", "quote", "estimate", "payable", "csow-total", "supplement",
    ]);
    console.log("Hoowla legal fee candidates (custom fields):", legalFeeCandidates);

    const lender = findCustomFieldText(customFields, [
      "lender", "mortgage-lender", "lender-name", "lender_name", "mortgage_lender",
      "lending-company", "mortgage-company", "mortgage-provider", "lenders-name",
      "name-of-lender", "name-of-mortgage-lender",
    ]);

    // Determine transaction type from case_type_name or case_name
    const caseTypeName = (caseInfo.case_type_name || "").toLowerCase();
    const caseName = (caseInfo.case_name || "").toLowerCase();
    let transactionType = "Purchase";
    if (caseTypeName.includes("sale") || caseName.includes("sale")) {
      transactionType = "Sale";
    }

    // Find seller's solicitor email from contributors
    // Method 1: case_side === 2 (seller side) with type "user"
    const sellerSolicitor = (caseInfo.contributors || []).find(
      (c: any) => c.case_side === 2 && c.type === "user"
    );
    // Method 2: entity_name containing "Other Side" with a non-empty email (person entries)
    const otherSideSolicitor = !sellerSolicitor?.email
      ? (caseInfo.contributors || []).find(
          (c: any) =>
            /other.?side/i.test(c.entity_name || "") &&
            /solicitor/i.test(c.entity_name || c.role_name || "") &&
            c.email
        )
      : null;
    // Method 3: custom fields
    const cfSellerEmail = findCustomFieldText(customFields, [
      "seller-solicitor-email", "sellers-solicitor-email", "other-side-email",
      "other-sides-email", "vendor-solicitor-email", "acting-solicitor-email",
      "seller-conveyancer-email", "other-side-solicitor",
    ]);

    const resolvedSellerEmail = sellerSolicitor?.email || otherSideSolicitor?.email || cfSellerEmail || null;
    console.log("Resolved seller conveyancer email:", resolvedSellerEmail);

    // Also extract lender from new-lender-name custom field as additional fallback
    const cfNewLender = findCustomFieldText(customFields, [
      "new-lender-name", "new_lender_name", "mortgagee-name", "mortgagee-company-name",
    ]);
    const resolvedLender = lender || cfNewLender || null;

    const resolvedLegalFees =
      explicitLegalFees ??
      draftInvoiceTotalFromCustomFields ??
      acceptedQuoteTotalFromCustomFields ??
      invoiceTotal;

    console.log("Resolved financials:", {
      purchasePrice,
      stampDuty,
      explicitLegalFees,
      draftInvoiceTotalFromCustomFields,
      acceptedQuoteTotalFromCustomFields,
      invoiceTotal,
      legalFees: resolvedLegalFees,
    });

    // Additional data quality warnings based on extracted financial/contact data
    if (transactionType === "Purchase" && !purchasePrice) {
      warnings.push("Purchase price was not found in Hoowla — please enter it manually on the Financials step.");
    }
    // Only warn about missing lender if a mortgage is required
    const noMortgage = customFields.some((f: any) => {
      const slug = (f.casedetail_slug || "").toLowerCase();
      const val = String(f.casedetail_value ?? "").trim();
      return /do.you.require.a.mortgage.*-n/i.test(slug) && val === "1";
    }) || customFields.some((f: any) => {
      const slug = (f.casedetail_slug || "").toLowerCase();
      const val = String(f.casedetail_value ?? "").toLowerCase().trim();
      return /do.you.require.a.mortgage/i.test(slug) && !/-[ny]$/.test(slug) && (val === "no" || val === "0" || val === "false");
    });
    if (!resolvedLender && !noMortgage) {
      warnings.push("Lender details were not found in Hoowla — if this is a mortgage purchase, please enter lender details manually.");
    }
    if (!resolvedSellerEmail) {
      warnings.push("Seller's conveyancer email was not found in Hoowla — you may need to enter it manually.");
    }

    // ── Extract Case Attributes (complexity flags) from custom fields & case data ──
    const caseFlags: string[] = [];
    // Use case name + case type for keyword scanning (NOT raw slugs which cause false positives)
    const caseText = `${caseName} ${caseTypeName}`.toLowerCase();
    // Only scan custom field VALUES that are non-empty and non-boolean for attribute detection
    const cfValues = customFields
      .filter((f: any) => {
        const v = String(f.casedetail_value ?? "").trim().toLowerCase();
        return v && !["0", "1", "yes", "no", "true", "false", ""].includes(v);
      })
      .map((f: any) => String(f.casedetail_value).toLowerCase());
    const cfValueText = cfValues.join(" ");
    // Also check specific boolean custom fields where slug indicates the attribute and value is "1" or "yes"
    const cfBooleanYes = (slugPattern: RegExp) =>
      customFields.some((f: any) => {
        const slug = (f.casedetail_slug || "").toLowerCase();
        const val = String(f.casedetail_value ?? "").trim().toLowerCase();
        return slugPattern.test(slug) && (val === "1" || val === "yes" || val === "true");
      });

    // New Build — check boolean slug "is-this-a-newly-built-property-y" or text keywords
    if (cfBooleanYes(/newly.?built|new.?build/i) || /new.?build|new.?home|nhbc/i.test(caseText) || /new.?build|nhbc/i.test(cfValueText)) {
      caseFlags.push("new-build");
    }
    // BSA (Building Safety Act) — only match explicit mentions, not slug fragments
    if (/building.?safety.?act|bsa.?compliance/i.test(caseText + " " + cfValueText) || cfBooleanYes(/building.?safety/i)) {
      caseFlags.push("bsa");
    }
    // Auction
    if (/auction/i.test(caseText + " " + cfValueText) || cfBooleanYes(/auction/i)) {
      caseFlags.push("auction");
    }
    // Right to Buy
    if (/right.?to.?buy|rtb/i.test(caseText + " " + cfValueText) || cfBooleanYes(/right.?to.?buy/i)) {
      caseFlags.push("right-to-buy");
    }
    // Shared Ownership
    if (/shared.?ownership|housing.?association/i.test(caseText + " " + cfValueText) || cfBooleanYes(/shared.?ownership/i)) {
      caseFlags.push("shared-ownership");
      if (/staircas/i.test(caseText + " " + cfValueText)) {
        caseFlags.push("staircasing");
      }
    }
    // Unregistered Land — only match explicit "unregistered" in values or case text, NOT slug fragments
    if (/\bunregistered\b/i.test(caseText + " " + cfValueText) || cfBooleanYes(/unregistered/i)) {
      caseFlags.push("unregistered");
    }

    console.log("Inferred case flags:", caseFlags);

    // ── Extract Add-on Document flags from Hoowla documents list ──
    const selectedAddOns: string[] = [];
    try {
      const docsRes = await fetch(
        `${hoowlaBaseUrl}/api/v2/cases/documents/?user=${encodedEmail}&case=${caseId}`,
        { method: "GET", headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" } }
      );
      if (docsRes.ok) {
        const docs = await docsRes.json();
        const docList = Array.isArray(docs) ? docs : (docs?.results || docs?.data || docs?.items || []);
        const docNames = docList.map((d: any) =>
          (d.name || d.file_name || d.title || d.document_name || "").toLowerCase()
        );
        console.log("Hoowla doc names for add-on detection:", docNames.slice(0, 30));

        // Management Pack / LPE1
        if (docNames.some((n: string) => /management.?pack|lpe.?1|landlord.*enquir|leasehold.*property.*enquir/i.test(n))) {
          selectedAddOns.push("management-pack");
        }
        // Licence to Alter
        if (docNames.some((n: string) => /licen[cs]e.?to.?alter|licence.?for.?alteration/i.test(n))) {
          selectedAddOns.push("licence-to-alter");
        }
        console.log("Detected add-on documents (from doc list):", selectedAddOns);
      } else {
        await docsRes.text();
      }
    } catch (e) {
      console.warn("Failed to scan documents for add-ons:", e);
    }

    // Also scan custom fields for add-on keywords (in case docs aren't uploaded yet)
    const mgmtPackPattern = /management.?pack|lpe.?1|landlord.*enquir|leasehold.*property.*enquir|service.?charge.?pack/i;
    const licenceToAlterPattern = /licen[cs]e.?to.?alter|licence.?for.?alteration|alteration.?licen[cs]e/i;

    if (!selectedAddOns.includes("management-pack")) {
      const matchedField = customFields.find((f: any) => {
        const text = `${f.casedetail_slug} ${f.casedetail_value}`.toLowerCase();
        return mgmtPackPattern.test(text);
      });
      if (matchedField) {
        selectedAddOns.push("management-pack");
        console.log(`Management pack detected from custom field — slug: "${matchedField.casedetail_slug}", value: "${matchedField.casedetail_value}"`);
      }
    }
    if (!selectedAddOns.includes("licence-to-alter")) {
      const matchedField = customFields.find((f: any) => {
        const text = `${f.casedetail_slug} ${f.casedetail_value}`.toLowerCase();
        return licenceToAlterPattern.test(text);
      });
      if (matchedField) {
        selectedAddOns.push("licence-to-alter");
        console.log(`Licence to alter detected from custom field — slug: "${matchedField.casedetail_slug}", value: "${matchedField.casedetail_value}"`);
      }
    }
    console.log("Final detected add-ons:", selectedAddOns);

    const mappedData = {
      case_reference: String(caseInfo.case_id || matter_id),
      property_address: propertyAddress,
      transaction_type: transactionType,
      tenure: resolvedTenure,
      property_type: resolvedPropertyType,
      lender: resolvedLender,
      seller_conveyancer_email: resolvedSellerEmail,
      purchase_price: purchasePrice,
      stamp_duty: stampDuty,
      legal_fees: resolvedLegalFees,
      hoowla_matter_id: matter_id.trim(),
      parties,
      warnings,
      case_flags: caseFlags,
      selected_add_ons: selectedAddOns,
      // Raw data for LLM validation
      _raw_contributors: (caseInfo.contributors || []).map((c: any) => ({
        type: c.type,
        name: c.name,
        email: c.email || null,
        entity_name: c.entity_name || null,
        role_name: c.role_name || null,
        case_side: c.case_side,
        company_name: c.company_name || null,
        is_primary_client: c.is_primary_client || false,
      })),
      _raw_case_name: caseInfo.case_name || "",
      _raw_case_type_name: caseInfo.case_type_name || "",
    };

    return new Response(JSON.stringify({ data: mappedData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-hoowla error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helpers ──────────────────────────────────────────────────────────

interface MappedParty {
  role: string;
  full_name: string;
  email: string | null;
}

/**
 * Map Hoowla contributors array to our party format.
 * case_side: 0 = neutral, 1 = buyer, 2 = seller
 * type: "person" | "linked" | "user"
 */
function mapContributors(contributors: any[]): MappedParty[] {
  const parties: MappedParty[] = [];

  // Entity names that represent actual transaction parties (clients)
  const clientEntityNames = ["client"];
  // Entity names to explicitly exclude (non-party contributors)
  const excludedEntityPatterns = [
    /solicitor/i,
    /estate\s*agent/i,
    /source\s*of\s*work/i,
    /broker/i,
    /surveyor/i,
    /lender/i,
    /mortgagee/i,
    /referr/i,
  ];

  for (const c of contributors) {
    // Skip internal users (solicitors/case workers from the firm)
    if (c.type === "user") continue;

    const entityName = (c.entity_name || "").toLowerCase().trim();
    const roleName = (c.role_name || "").toLowerCase().trim();

    // For "person" type: only include if entity_name indicates a client
    // or if entity_name matches "Other Sides Client" (seller's client)
    if (c.type === "person") {
      const isClient = clientEntityNames.some((cn) => entityName.includes(cn));
      const isExcluded = excludedEntityPatterns.some((p) => p.test(entityName) || p.test(roleName));
      if (!isClient || isExcluded) continue;
    }

    // "linked" type entries are the firm's own clients — always include
    const name = c.name || "";
    if (!name.trim()) continue;

    // Determine role: "Other Sides Client" = seller, otherwise purchaser
    const isSeller = c.case_side === 2 || /other.?side/i.test(entityName);
    const role = isSeller ? "seller" : "purchaser";

    parties.push({
      role,
      full_name: name,
      email: c.email || null,
    });
  }

  return parties;
}

/**
 * Parse a free-form numeric string into a number.
 * Handles UK formatting ("1,250,000.50") and European-locale formatting
 * ("1.250.000,50") so we don't silently truncate Continental-style amounts
 * to a tiny fraction of their real value.
 */
function parseNumber(val?: string | number | null): number | null {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;

  let s = String(val).trim();
  if (!s) return null;

  // Strip currency symbols and whitespace, keep digits, separators, and sign
  s = s.replace(/[^\d.,\-]/g, "");
  if (!s) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  // Decide which character (if any) is the decimal separator.
  // - If both are present, the rightmost one is the decimal separator and the
  //   other is a thousands grouping → strip the grouping char.
  // - If only commas are present and the pattern looks European
  //   (e.g. "1.250.000,50" — already handled above; or "450,00" with exactly
  //   2 trailing digits), treat comma as decimal.
  // - Otherwise commas are thousands separators (UK style) → strip them.
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // European: "1.250.000,50" → "1250000.50"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // UK: "1,250,000.50" → "1250000.50"
      s = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const afterComma = s.length - lastComma - 1;
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount === 1 && afterComma > 0 && afterComma <= 2) {
      // Likely European decimal: "450,00"
      s = s.replace(",", ".");
    } else {
      // UK thousands grouping: "450,000"
      s = s.replace(/,/g, "");
    }
  } else if (lastDot !== -1) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      // European thousands grouping with no decimal: "1.250.000" → "1250000"
      s = s.replace(/\./g, "");
    }
    // else: a single dot is a UK decimal separator — leave as-is
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Search custom fields by slug patterns and return the first parseable positive numeric value.
 * Slug matching is EXACT (case-insensitive) to prevent unrelated fields whose
 * slug merely contains the pattern (e.g. "asking-price", "max-loan-price")
 * from being returned ahead of the canonical field.
 */
function findCustomFieldNumericValue(fields: any[], slugPatterns: string[]): number | null {
  for (const pattern of slugPatterns) {
    const target = pattern.toLowerCase();
    const matches = fields.filter((f) => {
      const slug = (f.casedetail_slug || "").toLowerCase();
      // Hoowla slugs are commonly prefixed with a workflow id like "173746-".
      // Treat the slug as exact-match against the optional-prefix tail.
      if (slug === target) return true;
      const dashIdx = slug.indexOf("-");
      if (dashIdx > 0 && /^\d+$/.test(slug.slice(0, dashIdx))) {
        return slug.slice(dashIdx + 1) === target;
      }
      return false;
    });

    for (const field of matches) {
      const parsed = parseNumber(field?.casedetail_value);
      if (parsed != null && parsed > 0) return parsed;
    }
  }
  return null;
}

/**
 * Return candidate custom fields for debugging financial extraction.
 */
function findCustomFieldCandidates(fields: any[], keywords: string[]): string[] {
  return fields
    .filter((f) => {
      const slug = (f.casedetail_slug || "").toLowerCase();
      return keywords.some((k) => slug.includes(k));
    })
    .map((f) => `${f.casedetail_slug}=${f.casedetail_value}`)
    .filter((v) => {
      const raw = String(v.split("=").slice(1).join("=") ?? "").trim();
      return raw !== "" && raw !== "0";
    })
    .slice(0, 120);
}

/**
 * Search custom fields by slug patterns and return the text value.
 */
function findCustomFieldText(fields: any[], slugPatterns: string[]): string | null {
  for (const pattern of slugPatterns) {
    const field = fields.find((f) => {
      const slug = (f.casedetail_slug || "").toLowerCase();
      return slug.includes(pattern);
    });
    if (field?.casedetail_value) return field.casedetail_value;
  }
  return null;
}

function normalizeTenureString(value?: string | null): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("freehold")) return "Freehold";
  if (lower.includes("leasehold")) return "Leasehold";
  if (lower.includes("commonhold")) return "Commonhold";
  return null;
}

function normalizeTenureFromArray(values: any[]): string | null {
  for (const item of values) {
    const normalized =
      normalizeTenureString(typeof item === "string" ? item : null) ||
      normalizeTenureString(item?.tenure);
    if (normalized) return normalized;
  }
  return null;
}

function normalizePropertyType(value?: string | null): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();

  if (lower.includes("maisonette")) return "Maisonette";
  if (lower.includes("flat") || lower.includes("apartment") || lower.includes("studio")) return "Flat";
  if (lower.includes("house") || lower.includes("detached") || lower.includes("semi") || lower.includes("terrace") || lower.includes("townhouse") || lower.includes("bungalow")) return "House";
  if (lower.includes("land") || lower.includes("plot") || lower.includes("commercial") || lower.includes("retail") || lower.includes("office") || lower.includes("industrial")) return "Other";

  return null;
}

function inferPropertyTypeFromCustomFields(fields: any[]): string | null {
  for (const field of fields) {
    const slug = (field?.casedetail_slug || "").toLowerCase();
    const rawValue = String(field?.casedetail_value ?? "").trim();
    if (!rawValue) continue;

    // Skip checkbox/boolean-ish values
    if (["0", "1", "yes", "no", "true", "false"].includes(rawValue.toLowerCase())) continue;

    // Only inspect fields that look relevant
    if (!/property|dwelling|building|premises|type/i.test(slug)) continue;

    const normalized = normalizePropertyType(rawValue);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Fetch case documents from Hoowla, find the memorandum of sale,
 * download it, and use Gemini to extract the purchase price.
 */
async function extractPriceFromMemo(
  hoowlaBaseUrl: string,
  hoowlaApiKey: string,
  encodedEmail: string,
  caseId: string
): Promise<number | null> {
  try {
    // Step 1: Fetch case documents list
    const docsRes = await fetch(
      `${hoowlaBaseUrl}/api/v2/cases/documents/?user=${encodedEmail}&case=${caseId}`,
      {
        method: "GET",
        headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
      }
    );

    if (!docsRes.ok) {
      const errText = await docsRes.text();
      console.log(`Hoowla documents API: ${docsRes.status}`, errText.slice(0, 200));
      return null;
    }

    const docs = await docsRes.json();
    const docList = Array.isArray(docs) ? docs : (docs?.results || docs?.data || docs?.items || []);
    console.log(`Hoowla documents count: ${docList.length}`);

    if (docList.length > 0) {
      console.log("Hoowla document sample keys:", Object.keys(docList[0]));
      const docNames = docList.map((d: any) => ({
        name: d.name || d.file_name || d.title || d.document_name || "unnamed",
        type: d.type || d.mime_type || d.content_type || "",
        id: d.id || d.document_id || "",
      }));
      console.log("Hoowla documents:", JSON.stringify(docNames.slice(0, 20)));
    }

    // Step 2: Find memorandum of sale
    const memo = docList.find((d: any) => {
      const name = (d.name || d.file_name || d.title || d.document_name || "").toLowerCase();
      return /memorandum/i.test(name) || /memo.*sale/i.test(name) || /mem.*of.*sale/i.test(name);
    });

    if (!memo) {
      console.log("No memorandum of sale document found in Hoowla");
      return null;
    }

    const memoId = memo.id || memo.document_id;
    const memoName = memo.name || memo.file_name || memo.title || "memo";
    console.log(`Found memorandum of sale: "${memoName}" (id: ${memoId})`);

    // Step 3: Download the document
    const downloadEndpoints = [
      `${hoowlaBaseUrl}/api/v2/cases/documents/download/?user=${encodedEmail}&case=${caseId}&document=${memoId}`,
      `${hoowlaBaseUrl}/api/v2/cases/documents/${memoId}/download/?user=${encodedEmail}&case=${caseId}`,
      `${hoowlaBaseUrl}/api/v2/cases/documents/${memoId}/?user=${encodedEmail}&case=${caseId}`,
    ];

    let fileBytes: ArrayBuffer | null = null;
    let mimeType = "application/pdf";

    for (const endpoint of downloadEndpoints) {
      try {
        const dlRes = await fetch(endpoint, {
          method: "GET",
          headers: { "X-API-KEY": hoowlaApiKey },
        });
        console.log(`Hoowla doc download → ${dlRes.status}`);
        if (dlRes.ok) {
          mimeType = dlRes.headers.get("content-type") || "application/pdf";
          fileBytes = await dlRes.arrayBuffer();
          console.log(`Downloaded memo: ${fileBytes.byteLength} bytes, type: ${mimeType}`);
          break;
        } else {
          await dlRes.text();
        }
      } catch (e) {
        console.warn(`Doc download failed:`, e);
      }
    }

    if (!fileBytes || fileBytes.byteLength < 100) {
      console.log("Could not download memorandum of sale");
      return null;
    }

    // Step 4: Send to Gemini to extract purchase price
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("LOVABLE_API_KEY not configured, cannot parse memo PDF");
      return null;
    }

    const base64Doc = btoa(
      new Uint8Array(fileBytes).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the purchase price / sale price / agreed price from this memorandum of sale document. Return ONLY a JSON object like {"purchase_price": 450000} with the numeric value (no commas, no currency symbol). If you cannot find a price, return {"purchase_price": null}.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Doc}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI memo extraction failed:", aiRes.status, errText.slice(0, 200));
      return null;
    }

    const aiResult = await aiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";
    console.log("AI memo extraction raw response:", rawContent.slice(0, 300));

    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const price = parseNumber(parsed.purchase_price);
      if (price && price > 0) {
        console.log("Extracted purchase price from memorandum of sale:", price);
        return price;
      }
    } catch (e) {
      console.warn("Failed to parse AI memo extraction response:", e);
    }

    return null;
  } catch (e) {
    console.warn("extractPriceFromMemo error:", e);
    return null;
  }
}

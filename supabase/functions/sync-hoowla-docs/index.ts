import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/cmsEncryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Classify a Hoowla document into a case folder based on name/category keywords.
 * Returns the folder key from caseFolders structure.
 */
function classifyDocByName(
  docName: string,
  docCategory: string,
  folderName: string,
): string | null {
  const text = `${docName} ${docCategory} ${folderName}`.toLowerCase();

  // Searches: local authority, drainage, water, environmental, EPC
  if (/local\s*authority|local\s*search|llc|con29/i.test(text)) return "searches";
  if (/drainage|water\s*search|water\s*and\s*drainage/i.test(text)) return "searches";
  if (/environmental|env\s*search|ground\s*stability|flood|contamination|mining/i.test(text)) return "searches";
  if (/\bepc\b|energy\s*performance|energy\s*certificate/i.test(text)) return "searches";
  if (/chancel|chancel\s*repair/i.test(text)) return "searches";
  if (/coal\s*mining|tin\s*mining/i.test(text)) return "searches";
  if (/\bsearch(es)?\b/i.test(text) && !/title\s*search/i.test(text)) return "searches";

  // Title: title documents, registers, plans, title deeds
  if (/title\s*(register|plan|deed|document|information|search|absolute|possessory|qualified)/i.test(text)) return "title";
  if (/\bofficial\s*copy\b|\boc1\b|\boc2\b/i.test(text)) return "title";
  if (/\bland\s*registry\b|\bhmlr\b/i.test(text)) return "title";
  if (/\bregister\s*of\s*title\b/i.test(text)) return "title";
  if (/\btitle\b/i.test(text) && !/defect|shield|insurance/i.test(text)) return "title";

  // Contract Pack: contracts, TR1, TP1, protocol forms, property info forms
  if (/\bcontract\b|\bdraft\s*contract\b/i.test(text)) return "contracts";
  if (/\btr1\b|\btp1\b|\btransfer\s*deed/i.test(text)) return "contracts";
  if (/\bta\d{1,2}\b/i.test(text)) return "contracts"; // TA6, TA7, TA10, TA13, etc.
  if (/\bpif\b|property\s*info(rmation)?\s*form/i.test(text)) return "contracts";
  if (/\bfittings?\s*(and|&)\s*contents?\b/i.test(text)) return "contracts";
  if (/\bleasehold\s*info(rmation)?\b|\blpe1\b/i.test(text)) return "contracts";
  if (/\bprotocol\b|\blaw\s*society\b/i.test(text)) return "contracts";
  if (/\bcompletion\s*statement\b/i.test(text)) return "contracts";
  if (/\brequisition/i.test(text)) return "contracts";
  if (/\bmemorandum\s*of\s*sale\b/i.test(text)) return "contracts";

  // AML / Source of Wealth
  if (/\baml\b|\banti[\s-]?money\s*launder/i.test(text)) return "aml-sow";
  if (/\bkyc\b|\bknow\s*your\s*customer/i.test(text)) return "aml-sow";
  if (/source\s*of\s*(wealth|funds?)/i.test(text)) return "aml-sow";
  if (/\bid\s*verif|\bidentity\s*(check|verif|document)/i.test(text)) return "aml-sow";
  if (/\bpassport\b|\bdriving\s*licen[cs]e\b|\bnational\s*id\b|\bphoto\s*id\b/i.test(text)) return "aml-sow";
  if (/\bliveness\b|\bbiometric\b|\bonfido\b|\bsumsub\b|\bjumio\b|\bveriff\b/i.test(text)) return "aml-sow";
  if (/\bbank\s*statement|\bstatement[_\s-]?\d+/i.test(text)) return "aml-sow";
  if (/\bproof\s*of\s*(address|identity|funds?)/i.test(text)) return "aml-sow";
  if (/\bopen\s*banking/i.test(text)) return "aml-sow";
  if (/\barmalytix\b/i.test(text)) return "aml-sow";
  if (/\btax\s*return\b|\btax\s*computation\b|\bsa302\b|\bsa100\b|\bhmrc\b|\bpayslip\b|\bp60\b|\bp45\b/i.test(text)) return "aml-sow";
  if (/\bsanction/i.test(text)) return "aml-sow";
  if (/\bpep\b/i.test(text)) return "aml-sow";
  if (/\bcdd\b|\bcustomer\s*due\s*diligence/i.test(text)) return "aml-sow";
  if (/\bgift\s*(letter|declaration|deed)/i.test(text)) return "aml-sow";

  // Reports
  if (/\breport\b.*\b(on\s*title|property|survey)/i.test(text)) return "reports";
  if (/\bvaluation\b|\bsurvey(or)?\s*report/i.test(text)) return "reports";

  // Management Pack
  if (/management\s*pack|\blpe[\s-]?1\b|service\s*charge/i.test(text)) return "management-pack";

  // Licence to Alter
  if (/licen[cs]e\s*to\s*alter|alteration\s*licen[cs]e/i.test(text)) return "licence-to-alter";

  // Correspondence
  if (/\bletter\b|\bemail\b|\bcorrespondence\b|\bcover(ing)?\s*(letter|note)/i.test(text)) return "correspondence";

  // Miscellaneous: planning, building regs, certificates, warranties, insurance
  if (/\bplanning\b|\bbuilding\s*reg/i.test(text)) return "miscellaneous";
  if (/\bcertificate\b|\bwarrant/i.test(text)) return "miscellaneous";
  if (/\binsurance\b|\bindemnit/i.test(text)) return "miscellaneous";
  if (/\bgas\s*safety\b|\bniceic\b|\belectrical\b/i.test(text)) return "miscellaneous";
  if (/\bfensa\b|\bwindow/i.test(text)) return "miscellaneous";

  return null; // Could not classify
}

function extractStringCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Avoid pure numeric IDs (e.g. task_id: "12345")
    if (/^\d+$/.test(trimmed)) return null;
    return trimmed;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractStringCandidate(item);
      if (extracted) return extracted;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const priorityKeys = ["name", "title", "label", "folder", "tag", "task", "milestone", "stage"];

    for (const key of priorityKeys) {
      if (key in record) {
        const extracted = extractStringCandidate(record[key]);
        if (extracted) return extracted;
      }
    }

    for (const [k, v] of Object.entries(record)) {
      if (/(name|title|label|folder|tag|task|milestone|stage)/i.test(k)) {
        const extracted = extractStringCandidate(v);
        if (extracted) return extracted;
      }
    }
  }

  return null;
}

function getHoowlaFolderLabel(doc: Record<string, unknown>): string {
  const preferredKeys = [
    "task_name",
    "task_title",
    "workflow_task_name",
    "folder",
    "folder_name",
    "folder_label",
    "folder_title",
    "tag",
    "tags",
    "milestone",
    "milestone_name",
    "stage",
    "stage_name",
    "document_folder",
    "document_group",
    "group",
    "category_name",
  ];

  for (const key of preferredKeys) {
    if (key in doc) {
      const extracted = extractStringCandidate(doc[key]);
      if (extracted) return extracted;
    }
  }

  // Fallback: inspect any key that looks folder-like in unknown API payload variants.
  for (const [key, value] of Object.entries(doc)) {
    if (/(folder|tag|task|milestone|stage|group|category)/i.test(key)) {
      const extracted = extractStringCandidate(value);
      if (extracted) return extracted;
    }
  }

  return "";
}

/**
 * Use AI (Gemini) to classify an ambiguous document name into a folder.
 */
async function classifyDocByAI(
  docName: string,
  docCategory: string,
  folderName: string,
): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return "miscellaneous";

  const prompt = `You are a UK conveyancing document classifier. Given a document name from a case management system, classify it into ONE of these folder categories:

- searches: Local authority searches, drainage/water searches, environmental searches, EPC, chancel, coal mining searches
- title: Title registers, plans, deeds, official copies, Land Registry documents
- contracts: Contracts, transfer deeds (TR1/TP1), protocol forms (TA6, TA7, TA10), property information forms, fittings & contents, completion statements
- aml-sow: AML/KYC documents, ID verification/liveness checks, bank statements, source of funds/wealth evidence, passports, driving licences, proof of address, SA302/SA100/tax returns/tax computations/payslips
- correspondence: Letters, emails, general correspondence
- reports: Property reports, survey reports, valuations
- management-pack: Management packs, LPE1, service charge accounts
- licence-to-alter: Alteration licences
- miscellaneous: Planning permissions, building regs, certificates, warranties, insurance, indemnities, anything else

Document name: "${docName}"
${docCategory ? `Category in CMS: "${docCategory}"` : ""}
${folderName ? `Folder in CMS: "${folderName}"` : ""}

Respond with ONLY the folder key (e.g. "searches" or "aml-sow"). Nothing else.`;

  try {
    const res = await fetch("https://ai.lovable.dev/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 30,
        temperature: 0,
      }),
    });
    if (!res.ok) return "miscellaneous";
    const data = await res.json();
    const answer = (data?.choices?.[0]?.message?.content || "").trim().toLowerCase();
    const validFolders = [
      "searches", "title", "contracts", "aml-sow", "correspondence",
      "reports", "management-pack", "licence-to-alter", "miscellaneous",
    ];
    return validFolders.includes(answer) ? answer : "miscellaneous";
  } catch {
    return "miscellaneous";
  }
}

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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
    const { matter_id, case_id } = body;
    const maxDocsRaw = Number(body?.max_docs);
    // No cap by default — sync ALL documents, skipping duplicates already in storage
    const maxDocsPerRun = Number.isFinite(maxDocsRaw) && maxDocsRaw > 0
      ? Math.floor(maxDocsRaw)
      : Infinity;
    const refreshExisting = Boolean(body?.refresh_existing);

    if (!matter_id || !case_id) {
      return new Response(
        JSON.stringify({ error: "matter_id and case_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify user owns the case
    const { data: caseData, error: caseErr } = await supabase
      .from("cases")
      .select("id, conveyancer_id")
      .eq("id", case_id)
      .single();

    if (caseErr || !caseData) {
      return new Response(
        JSON.stringify({ error: "Case not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Background processing ────────────────────────────────────────────
    // The full sync (Hoowla list → per-doc download → AI classify → upload →
    // metadata refresh) routinely runs >150s for cases with many docs and
    // hits the Edge Runtime IDLE_TIMEOUT. Dispatch the heavy work to the
    // background and return 202 immediately. The client polls storage /
    // case data via existing query invalidation hooks, so per-file counts
    // arriving in the response are not required for correctness.
    // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
    EdgeRuntime.waitUntil(
      runSyncInBackground({
        supabase,
        adminClient: createClient(supabaseUrl, serviceKey),
        supabaseUrl,
        supabaseAnonKey,
        authHeader: authHeader!,
        userId,
        matter_id,
        case_id,
        maxDocsPerRun,
        refreshExisting,
      }).catch((bgErr) => {
        console.error("[sync-hoowla-docs] background task failed:", bgErr);
      }),
    );

    return new Response(
      JSON.stringify({
        started: true,
        synced: 0,
        skipped: 0,
        failed: 0,
        total: 0,
        message:
          "Sync started in the background. Documents will appear in the case folders as they are imported — refresh in a minute or two to see progress.",
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-hoowla-docs error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

interface BackgroundSyncArgs {
  supabase: ReturnType<typeof createClient>;
  adminClient: ReturnType<typeof createClient>;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
  userId: string;
  matter_id: string;
  case_id: string;
  maxDocsPerRun: number;
  refreshExisting: boolean;
}

async function runSyncInBackground(args: BackgroundSyncArgs): Promise<void> {
  const {
    supabase,
    adminClient,
    supabaseUrl,
    supabaseAnonKey,
    authHeader,
    userId,
    matter_id,
    case_id,
    maxDocsPerRun,
    refreshExisting,
  } = args;

  try {
    const { resolveActiveCmsIntegration } = await import("../_shared/resolveCmsIntegration.ts");

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, firm_name")
      .eq("user_id", userId)
      .single();

    const { integration, matchType } = await resolveActiveCmsIntegration(adminClient, {
      provider: "hoowla",
      userId,
      profileEmail: profile?.email ?? null,
      profileFirmName: profile?.firm_name ?? null,
    });

    if (matchType === "ambiguous") {
      console.error("[sync-hoowla-docs:bg] Ambiguous Hoowla integration for user", userId);
      return;
    }

    if (!integration) {
      console.error("[sync-hoowla-docs:bg] No active Hoowla integration for user", userId);
      return;
    }

    console.log(`[sync-hoowla-docs:bg] Resolved integration via ${matchType ?? "unknown"}: ${integration.id}`);

    const hoowlaBaseUrl = integration.api_base_url.replace(/\/$/, "");
    let decryptedKey: string;
    try {
      decryptedKey = await decryptApiKey(integration.api_key_encrypted);
    } catch (decryptErr) {
      console.error("[sync-hoowla-docs:bg] Failed to decrypt API key:", decryptErr);
      return;
    }
    const hoowlaApiKey = decryptedKey;
    const hoowlaUserEmail = integration.provider_user_email;
    const encodedEmail = encodeURIComponent(hoowlaUserEmail);
    const encodedMatterId = encodeURIComponent(matter_id.trim());

    // Step 1: Fetch document list from Hoowla
    // Prefer GET for listing; fall back to POST for tenant/API-version compatibility.
    const docEndpoint = `${hoowlaBaseUrl}/api/v2/documents/documents?case=${encodedMatterId}&user=${encodedEmail}`;

    let docsRes: Response | null = null;
    const listMethods: Array<"GET" | "POST"> = ["GET", "POST"];

    for (const method of listMethods) {
      console.log(`Fetching Hoowla docs: ${method} ${docEndpoint}`);
      try {
        const res = await fetch(docEndpoint, {
          method,
          headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
        });

        if (res.ok) {
          docsRes = res;
          console.log(`✓ Hoowla docs endpoint succeeded via ${method}`);
          break;
        }

        const errBody = await res.text();
        console.error(`Hoowla docs endpoint ${method} returned ${res.status}`);
        console.error(`Response body: ${errBody}`);
      } catch (e) {
        console.error(`Hoowla docs fetch error (${method}):`, e);
      }
    }

    if (!docsRes) {
      console.warn("[sync-hoowla-docs:bg] Hoowla documents endpoint not available for case", matter_id);
      return;
    }

    const docsRaw = await docsRes.json();
    const docList = Array.isArray(docsRaw)
      ? docsRaw
      : docsRaw?.results || docsRaw?.data || docsRaw?.items || [];

    console.log(`[sync-hoowla-docs:bg] Hoowla document count: ${docList.length}`);

    if (docList.length === 0) {
      console.log("[sync-hoowla-docs:bg] No documents found in Hoowla — nothing to sync");
      return;
    }

    // ── Priority sorting: ensure AML/SoW documents are synced first ──
    // Without this, correspondence and miscellaneous docs consume the per-run
    // upload cap before high-value financial documents are reached.
    const HIGH_PRIORITY_PATTERNS = [
      /armalytix/i, /source\s*of\s*(wealth|funds?)/i, /\bsof\b/i,
      /open\s*banking/i, /bank\s*statement/i, /\bsa302\b/i, /\bsa100\b/i,
      /\bhmrc\b/i, /\btax\s*(return|computation)/i, /payslip/i, /\bp60\b/i,
      /\baml\b/i, /\bkyc\b/i, /\bpassport\b/i, /driving\s*licen/i,
      /proof\s*of\s*(address|identity|funds?)/i, /gift\s*(letter|declaration|deed)/i,
      /\bcdd\b/i, /identity\s*(check|verif)/i, /\bid\s*verif/i,
    ];
    const MID_PRIORITY_PATTERNS = [
      /local\s*(authority|search)/i, /\bllc\b/i, /\bcon29/i,
      /drainage|water\s*search/i, /environmental|env\s*search/i,
      /\bepc\b|energy\s*performance/i, /\bsearch(es)?\b/i,
      /title\s*(register|plan|deed)/i, /official\s*copy/i, /\bland\s*registry\b/i,
      /\bcontract\b/i, /\btr1\b|\btp1\b/i, /\bta\d{1,2}\b/i,
    ];

    function docPriority(doc: any): number {
      const name = (doc.document_title || doc.title || doc.name || "").toLowerCase();
      if (HIGH_PRIORITY_PATTERNS.some(p => p.test(name))) return 0;
      if (MID_PRIORITY_PATTERNS.some(p => p.test(name))) return 1;
      return 2;
    }

    docList.sort((a: any, b: any) => docPriority(a) - docPriority(b));
    // ── End priority sorting ──────────────────────────────────────────

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    let processedUploads = 0;
    const errors: string[] = [];
    const skippedFiles: { name: string; reason: string }[] = [];
    const folderFileCache = new Map<string, Set<string>>();
    let cursor = 0;
    let missingFolderMetadataLogs = 0;

    // Step 2: Process each document
    // Hoowla API returns: document_id, document_title, document_type, task_name, etc.
    for (; cursor < docList.length; cursor++) {
      const doc = docList[cursor];
      const docName = doc.document_title || doc.title || doc.name || doc.file_name || doc.document_name || "";
      const docCategory = doc.document_type != null ? String(doc.document_type) : "";
      // Prefer Hoowla-native task/folder/tag metadata so storage mirrors CMS structure.
      const docFolder = getHoowlaFolderLabel(doc as Record<string, unknown>);
      const docId = doc.document_id || doc.id || "";

      if (!docName) {
        console.warn("Skipping document with no name:", docId);
        skipped++;
        skippedFiles.push({ name: docId || "(unknown)", reason: "No document name" });
        continue;
      }

      // Hoowla document titles may not have extensions — skip extension check for Hoowla docs
      // since they may be HTML-based documents without file extensions

      // Use the Hoowla folder/tag name directly if available, otherwise classify
      let folder: string;
      if (docFolder && docFolder.trim()) {
        // Sanitize the Hoowla task_name/tag into a safe subfolder key
        folder = docFolder.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!folder) folder = "miscellaneous";
        console.log(`Hoowla folder metadata "${docFolder}" → folder "${folder}"`);
      } else {
        const shouldLogMissingMetadata = missingFolderMetadataLogs < 5 || cursor >= docList.length - 5;
        if (shouldLogMissingMetadata) {
          missingFolderMetadataLogs++;
          console.log(
            `No Hoowla folder metadata for "${docName}". Available keys: ${Object.keys(doc || {}).join(", ")}`,
          );
        }

        folder = classifyDocByName(docName, docCategory, docFolder);
        if (!folder) {
          folder = await classifyDocByAI(docName, docCategory, docFolder);
          console.log(`AI classified "${docName}" → ${folder}`);
        } else {
          console.log(`Rule classified "${docName}" → ${folder}`);
        }
      }

      // Ensure the folder exists by uploading a .keep placeholder
      const keepPath = `${case_id}/${folder}/.keep`;
      await adminClient.storage
        .from("case-documents")
        .upload(keepPath, new Blob([""]), { upsert: true });

      // Sanitize filename for storage path
      const safeFileName = docName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${case_id}/${folder}/${safeFileName}`;

      // Cache folder listings to avoid re-listing storage on every document.
      if (!folderFileCache.has(folder)) {
        const { data: existingFiles } = await supabase.storage
          .from("case-documents")
          .list(`${case_id}/${folder}`, { limit: 1000 });
        folderFileCache.set(
          folder,
          new Set((existingFiles || []).map((f) => f.name).filter((name) => name && name !== ".keep")),
        );
      }

      const folderFiles = folderFileCache.get(folder)!;
      const fileExists = folderFiles.has(safeFileName);

      if (fileExists && !refreshExisting) {
        skipped++;
        continue;
      }

      if (processedUploads >= maxDocsPerRun) {
        console.log(`Reached per-run upload cap (${maxDocsPerRun}). Stopping early.`);
        break;
      }

      // Step 3: Download the file from Hoowla
      // Per Hoowla API docs: POST /api/v2/documents/download?id={id}&user={email}
      // Returns a pre-signed S3 URL
      if (!docId) {
        console.warn(`No document ID for: ${docName}`);
        failed++;
        errors.push(`No document ID for "${docName}"`);
        continue;
      }

      let downloadUrl = "";
      const downloadMetaEndpoint = `${hoowlaBaseUrl}/api/v2/documents/download?id=${encodeURIComponent(docId)}&user=${encodedEmail}`;
      const downloadMethods: Array<"GET" | "POST"> = ["GET", "POST"];

      for (const method of downloadMethods) {
        try {
          const dlRes = await fetch(downloadMetaEndpoint, {
            method,
            headers: { "X-API-KEY": hoowlaApiKey, Accept: "application/json" },
          });

          if (!dlRes.ok) {
            const errBody = await dlRes.text();
            console.error(`Download URL request failed via ${method} for "${docName}" [${dlRes.status}]`);
            console.error(`Download URL error body: ${errBody}`);
            continue;
          }

          const dlData = await dlRes.json();
          downloadUrl = dlData.url || "";
          if (downloadUrl) break;
        } catch (e) {
          console.error(`Download URL fetch error via ${method} for "${docName}":`, e);
        }
      }

      if (!downloadUrl) {
        failed++;
        errors.push(`No download URL for "${docName}"`);
        continue;
      }

      if (!downloadUrl) {
        console.warn(`No download URL returned for document: ${docName}`);
        failed++;
        errors.push(`No download URL for "${docName}"`);
        continue;
      }

      try {
        // Download from the pre-signed S3 URL (no auth headers needed)
        const fileRes = await fetch(downloadUrl, {
          method: "GET",
        });

        if (!fileRes.ok) {
          console.error(`Failed to download "${docName}" [${fileRes.status}]`);
          failed++;
          errors.push(`Download failed for "${docName}" (${fileRes.status})`);
          continue;
        }

        // Guard: check Content-Length to avoid loading huge files into memory
        const contentLength = Number(fileRes.headers.get("content-length") || "0");
        const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
        if (contentLength > MAX_FILE_BYTES) {
          const sizeMB = (contentLength / 1024 / 1024).toFixed(1);
          console.warn(`Skipping oversized file "${docName}" (${sizeMB} MB)`);
          skipped++;
          skippedFiles.push({ name: docName, reason: `File too large (${sizeMB} MB — limit is 50 MB)` });
          // Drain the body to free the connection
          await fileRes.body?.cancel();
          continue;
        }

        const fileBlob = await fileRes.blob();
        if (fileBlob.size === 0) {
          console.warn(`Empty file skipped: ${docName}`);
          skipped++;
          skippedFiles.push({ name: docName, reason: "File is empty (0 bytes)" });
          continue;
        }
        if (fileBlob.size > MAX_FILE_BYTES) {
          const sizeMB = (fileBlob.size / 1024 / 1024).toFixed(1);
          console.warn(`Skipping oversized file "${docName}" (${sizeMB} MB, blob check)`);
          skipped++;
          skippedFiles.push({ name: docName, reason: `File too large (${sizeMB} MB — limit is 50 MB)` });
          continue;
        }

        // Upload to storage (upsert only when explicitly refreshing existing files)
        const { error: uploadErr } = await supabase.storage
          .from("case-documents")
          .upload(storagePath, fileBlob, {
            contentType: fileBlob.type || "application/octet-stream",
            upsert: refreshExisting,
          });

        if (uploadErr) {
          console.error(`Upload failed for "${docName}":`, uploadErr.message);
          failed++;
          errors.push(`Upload failed for "${docName}": ${uploadErr.message}`);
          continue;
        }

        folderFiles.add(safeFileName);
        processedUploads++;

        // Register in documents table so completeness checks work
        const folderToDocType: Record<string, string> = {
          searches: "searches", title: "title", contracts: "contracts",
          correspondence: "correspondence", "aml-sow": "aml_sow",
          reports: "reports", miscellaneous: "miscellaneous",
          "management-pack": "management_pack", "licence-to-alter": "licence_to_alter",
        };
        // Map specific search sub-types from the folder classification
        const searchSubTypes: Record<string, string> = {
          local_authority: "local_authority", drainage_water: "drainage_water",
          environmental: "environmental", epc: "epc",
        };
        let docType = folderToDocType[folder] || folder.replace(/-/g, "_");
        // Try to detect specific search sub-type from the document name
        const nameLower = docName.toLowerCase();
        if (folder === "searches") {
          if (/local\s*authority|con29|llc/i.test(nameLower)) docType = "local_authority";
          else if (/drainage|water/i.test(nameLower)) docType = "drainage_water";
          else if (/environmental|env\s*search|flood|contamination/i.test(nameLower)) docType = "environmental";
          else if (/\bepc\b|energy\s*performance/i.test(nameLower)) docType = "epc";
        }

        try {
          const { data: existingDoc } = await supabase
            .from("documents")
            .select("id")
            .eq("case_id", case_id)
            .eq("file_path", storagePath)
            .maybeSingle();

          if (!existingDoc) {
            await supabase.from("documents").insert({
              case_id,
              doc_type: docType,
              file_name: safeFileName,
              file_path: storagePath,
              uploaded_by: userId,
            });
          }
        } catch (docErr: any) {
          console.warn(`[sync-hoowla-docs] Failed to register document record for "${docName}":`, docErr?.message);
        }

        if (fileExists) {
          console.log(`✓ Updated: ${docName} → ${folder}`);
        } else {
          console.log(`✓ Synced: ${docName} → ${folder}`);
        }
        synced++;
      } catch (e) {
        console.error(`Error processing "${docName}":`, e);
        failed++;
        errors.push(`Error processing "${docName}": ${e instanceof Error ? e.message : "Unknown"}`);
      }
    }

    const remaining = Math.max(docList.length - cursor, 0);

    // ── Metadata refresh: compare Hoowla matter data with existing case ──
    const conflicts: { field: string; label: string; currentValue: string; hoowlaValue: string }[] = [];
    try {
      // Call the sync-hoowla function internally to get fresh matter metadata
      const syncHoowlaUrl = `${supabaseUrl}/functions/v1/sync-hoowla`;
      const metaRes = await fetch(syncHoowlaUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader!,
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ matter_id }),
      });

      if (metaRes.ok) {
        const metaJson = await metaRes.json();
        const hoowla = metaJson?.data;

        if (hoowla) {
          // Fetch current case data
          const { data: currentCase } = await supabase
            .from("cases")
            .select("property_address, transaction_type, tenure, property_type, lender, purchase_price, stamp_duty, legal_fees, seller_conveyancer_email")
            .eq("id", case_id)
            .single();

          if (currentCase) {
            const fieldsToCompare: { field: string; label: string; current: string | number | null; hoowla: string | number | null }[] = [
              { field: "property_address", label: "Property Address", current: currentCase.property_address, hoowla: hoowla.property_address },
              { field: "transaction_type", label: "Transaction Type", current: currentCase.transaction_type, hoowla: hoowla.transaction_type },
              { field: "tenure", label: "Tenure", current: currentCase.tenure, hoowla: hoowla.tenure },
              { field: "property_type", label: "Property Type", current: currentCase.property_type, hoowla: hoowla.property_type },
              { field: "lender", label: "Lender", current: currentCase.lender, hoowla: hoowla.lender },
              { field: "purchase_price", label: "Purchase Price", current: currentCase.purchase_price, hoowla: hoowla.purchase_price },
              { field: "stamp_duty", label: "Stamp Duty", current: currentCase.stamp_duty, hoowla: hoowla.stamp_duty },
              { field: "legal_fees", label: "Legal Fees", current: currentCase.legal_fees, hoowla: hoowla.legal_fees },
              { field: "seller_conveyancer_email", label: "Seller Conveyancer Email", current: currentCase.seller_conveyancer_email, hoowla: hoowla.seller_conveyancer_email },
            ];

            const updates: Record<string, unknown> = {};

            for (const { field, label, current, hoowla: hoowlaVal } of fieldsToCompare) {
              const currentStr = current != null ? String(current).trim() : "";
              const hoowlaStr = hoowlaVal != null ? String(hoowlaVal).trim() : "";

              if (!hoowlaStr || hoowlaStr === "Unknown" || hoowlaStr === "0") continue;

              // Fill blank: current is empty/null/Unknown/0
              if (!currentStr || currentStr === "Unknown" || currentStr === "0") {
                if (field === "purchase_price" || field === "stamp_duty" || field === "legal_fees") {
                  updates[field] = parseFloat(hoowlaStr) || null;
                } else {
                  updates[field] = hoowlaStr;
                }
                console.log(`[metadata-refresh] Filling blank ${field}: "${currentStr}" → "${hoowlaStr}"`);
              }
              // Conflict: both have values and they differ
              else if (currentStr.toLowerCase() !== hoowlaStr.toLowerCase()) {
                conflicts.push({ field, label, currentValue: currentStr, hoowlaValue: hoowlaStr });
                console.log(`[metadata-refresh] Conflict on ${field}: case="${currentStr}" vs hoowla="${hoowlaStr}"`);
              }
            }

            // Apply blank fills + store conflicts
            if (Object.keys(updates).length > 0 || conflicts.length > 0) {
              // Merge conflicts into ai_context_notes
              const { data: fullCase } = await supabase
                .from("cases")
                .select("ai_context_notes")
                .eq("id", case_id)
                .single();

              const existingNotes = (fullCase?.ai_context_notes as Record<string, unknown>) || {};
              const patchPayload: Record<string, unknown> = {
                ...updates,
                ai_context_notes: { ...existingNotes, hoowla_conflicts: conflicts },
              };

              await adminClient
                .from("cases")
                .update(patchPayload)
                .eq("id", case_id);

              console.log(`[metadata-refresh] Applied ${Object.keys(updates).length} blank fills, ${conflicts.length} conflicts stored`);
            }

            // Fill blank parties
            if (hoowla.parties?.length > 0) {
              const { data: existingParties } = await supabase
                .from("case_parties")
                .select("full_name, role")
                .eq("case_id", case_id);

              const existingNames = new Set(
                (existingParties || []).map((p: any) => `${p.full_name?.toLowerCase()}-${p.role}`)
              );

              const newParties = hoowla.parties.filter(
                (p: any) => p.full_name && !existingNames.has(`${p.full_name.toLowerCase()}-${p.role}`)
              );

              if (newParties.length > 0) {
                const partyRows = newParties.map((p: any) => ({
                  case_id,
                  role: p.role,
                  full_name: p.full_name,
                  email: p.email || null,
                  pep_status: "unknown",
                }));
                await adminClient.from("case_parties").insert(partyRows);
                console.log(`[metadata-refresh] Added ${newParties.length} new parties from Hoowla`);
              }
            }
          }
        }
      } else {
        console.warn(`[metadata-refresh] sync-hoowla returned ${metaRes.status}`);
      }
    } catch (e) {
      console.warn("[metadata-refresh] Failed to refresh metadata from Hoowla:", e);
    }

    // Audit log
    await supabase.from("audit_log").insert({
      case_reference: matter_id,
      user_id: userId,
      user_name: profile?.firm_name ?? "",
      user_email: "",
      user_position: "",
      event_type: "hoowla_docs_synced",
      metadata: {
        case_id,
        synced,
        skipped,
        failed,
        total: docList.length,
        processed_uploads: processedUploads,
        remaining,
        max_docs_per_run: maxDocsPerRun,
        refresh_existing: refreshExisting,
        conflicts_detected: conflicts.length,
        background: true,
      },
    });

    console.log(
      `[sync-hoowla-docs:bg] Completed for case ${case_id}: ` +
        `synced=${synced}, skipped=${skipped}, failed=${failed}, ` +
        `remaining=${remaining}, conflicts=${conflicts.length}`,
    );
  } catch (err) {
    console.error("[sync-hoowla-docs:bg] Background sync error:", err);
  }
}

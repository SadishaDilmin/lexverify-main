import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processDocument, buildMultimodalContent, type ProcessedDocument } from "../_shared/documentProcessor.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** AML document categories the AI will assign */
const AML_CATEGORIES = [
  "Bank Statement",
  "Payslip",
  "P60 / P45",
  "Tax Return / SA302",
  "Gift Letter / Declaration",
  "Mortgage Offer / Agreement in Principle",
  "ID Document (Passport / Driving Licence)",
  "Proof of Address",
  "Open Banking Report",
  "Purchase Instruction Form",
  "Property Valuation",
  "Savings / ISA Statement",
  "Pension Statement",
  "Investment / Share Certificate",
  "Business Accounts / Company Financials",
  "Solicitor Completion Statement",
  "Tenancy Agreement / Rental Income",
  "Inheritance / Probate Documentation",
  "Compensation / Settlement Agreement",
  "Insurance Policy",
  "Utility Bill",
  "Council Tax Bill",
  "Other / Unknown",
];

const SYSTEM_PROMPT = `You are a document classification assistant for Anti-Money Laundering (AML) compliance in UK residential conveyancing.

You will be given a document (which may be a PDF, image, or text file). Your task is to:
1. Read and understand the document content
2. Classify it into ONE of the following categories:
${AML_CATEGORIES.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

3. If the document contains information about a specific person, extract their full name
4. If the document contains a date of birth (e.g. passport, driving licence, national identity card, birth certificate), extract it in DD/MM/YYYY format
5. If the document is an ID document (passport, driving licence, national identity card), extract the ISSUE DATE in DD/MM/YYYY format. Look for fields labelled "Date of issue", "Issue date", "Valid from", "Issued", "Date de délivrance", or similar.
6. Provide a brief description of what the document contains
7. Rate your confidence: "high", "medium", or "low"
8. If the document is unreadable, damaged, or you cannot determine its content, set readable to false and explain why

IMPORTANT: For ID Documents (Passport / Driving Licence), you MUST attempt to extract the date of birth AND the issue date. Look for fields labelled "Date of birth", "DOB", "Date de naissance", or similar. Also extract DOB from any other document that contains it (e.g. bank statements, tax returns, payslips).

IMPORTANT: Be precise. A bank statement is different from a savings statement. A P60 is different from a payslip.

IMPORTANT: Reports from open banking and verification platforms (Armalytix, Thirdfort, Infotrak, Plaid, TrueLayer, Codat, Credit Kudos, Xero, FreeAgent, QuickBooks) should be classified as "Open Banking Report". These reports typically contain source of funds analysis, income verification, bank account summaries, or employment details. Do NOT rely on the filename — read the content to identify the provider and report type.`;

const normalizeDocName = (name: string) =>
  (name || "")
    .toLowerCase()
    .trim()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9]+/g, "");

const normalizePerson = (name: string) =>
  (name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth guard ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
    authHeader.replace("Bearer ", "")
  );
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { files, existingFiles } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "No files provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (files.length > 100) {
      return new Response(
        JSON.stringify({ error: "Maximum 100 files per batch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const results: ClassificationResult[] = [];
    let classificationCacheHits = 0;
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const inputFileMeta = new Map<string, { fileHash: string }>(
      files.map((f: { id: string; fileHash?: string }) => [
        f.id,
        {
          fileHash: (f.fileHash || "").toLowerCase().trim(),
        },
      ])
    );

    // Process files in batches of 3 to avoid timeouts
    const BATCH_SIZE = 3;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (file: { id: string; name: string; base64: string; mimeType: string; fileHash?: string }) => {
          try {
            // Decode the base64 to bytes for processing
            const binaryStr = atob(file.base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let j = 0; j < binaryStr.length; j++) {
              bytes[j] = binaryStr.charCodeAt(j);
            }

            // ── Classification cache check ──
            const fileHash = (file.fileHash || "").toLowerCase().trim();
            if (fileHash) {
              try {
                const { data: cached } = await serviceClient
                  .from("doc_classification_cache")
                  .select("result")
                  .eq("file_hash", fileHash)
                  .eq("classifier", "aml")
                  .maybeSingle();

                if (cached?.result) {
                  console.log(`[CLASSIFICATION CACHE HIT] ${file.name}`);
                  classificationCacheHits++;
                  const r = cached.result as any;
                  return {
                    fileId: file.id,
                    fileName: file.name,
                    category: r.category || "Other / Unknown",
                    personName: r.personName || "",
                    dateOfBirth: r.dateOfBirth || "",
                    issueDate: r.issueDate || "",
                    description: r.description || "",
                    confidence: r.confidence || "low",
                    readable: r.readable !== false,
                    readabilityIssue: r.readabilityIssue,
                    judgeOverridden: r.judgeOverridden,
                    judgeNotes: r.judgeNotes,
                    cached: true,
                  };
                }
              } catch (cacheErr) {
                console.warn(`[CLASSIFICATION CACHE] lookup failed for ${file.name}:`, cacheErr);
              }
            }

            console.log(`[CLASSIFICATION CACHE MISS] ${file.name}`);

            // Process document using shared processor
            const processed = await processDocument(file.name, bytes, "Document", {
              maxTextLength: 20000,
              maxBase64Length: 15_000_000,
              aiApiKey: LOVABLE_API_KEY,
            });

            // Build AI message
            const userContent = buildClassificationContent(processed);

            // Stage 1: Initial classification
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: userContent },
                ],
                tools: [CLASSIFY_TOOL],
                tool_choice: { type: "function", function: { name: "classify_document" } },
              }),
            });

            if (!aiResp.ok) {
              const errText = await aiResp.text();
              console.error(`AI classification failed for ${file.name}:`, aiResp.status, errText);
              return makeErrorResult(file, "Classification failed — AI service error",
                "AI classification service returned an error. Try re-uploading this file.");
            }

            const aiData = await aiResp.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

            if (!toolCall?.function?.arguments) {
              return makeErrorResult(file, "Could not parse classification result");
            }

            const args = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

            const initialResult = {
              fileId: file.id,
              fileName: file.name,
              category: args.category || "Other / Unknown",
              personName: args.person_name || "",
              dateOfBirth: args.date_of_birth || "",
              issueDate: args.issue_date || "",
              description: args.description || "",
              confidence: args.confidence || "low",
              readable: args.readable !== false,
              readabilityIssue: args.readability_issue || undefined,
            };

            // Stage 2: LLM-as-a-judge verification
            const judged = await judgeClassification(LOVABLE_API_KEY, processed, initialResult);

            // ── Store in classification cache ──
            if (fileHash) {
              try {
                await serviceClient.from("doc_classification_cache").upsert({
                  file_hash: fileHash,
                  classifier: "aml",
                  result: {
                    category: judged.category,
                    personName: judged.personName,
                    dateOfBirth: judged.dateOfBirth,
                    issueDate: judged.issueDate,
                    description: judged.description,
                    confidence: judged.confidence,
                    readable: judged.readable,
                    readabilityIssue: judged.readabilityIssue,
                    judgeOverridden: judged.judgeOverridden,
                    judgeNotes: judged.judgeNotes,
                  },
                }, { onConflict: "file_hash,classifier" });
              } catch (e) {
                console.warn(`[CLASSIFICATION CACHE] write failed for ${file.name}:`, e);
              }
            }

            return { ...judged, cached: false };
          } catch (err) {
            console.error(`Error processing ${file.name}:`, err);
            return makeErrorResult(file, `Processing error: ${err.message}`,
              `Error reading document: ${err.message}. Try converting to a standard PDF or image format.`);
          }
        })
      );

      results.push(...batchResults);
    }

    // ── Cross-document consistency checks ──
    const rawNameWarnings = checkNameConsistency(results);
    const dobWarnings = checkDobConsistency(results);
    const idWarnings = checkRecentIdIssuance(results);

    // ── LLM judge for name warnings: filter noise, keep only genuine fraud signals ──
    let nameWarnings = rawNameWarnings;
    let nameJudgeSummary: { isFraudRisk: boolean; summary: string; mostImpactful: { message: string; files: string[]; names: string[] } | null } | null = null;
    if (rawNameWarnings.length > 0 && LOVABLE_API_KEY) {
      try {
        nameJudgeSummary = await judgeNameWarnings(LOVABLE_API_KEY, rawNameWarnings, results);
        if (nameJudgeSummary && !nameJudgeSummary.isFraudRisk) {
          // Not a fraud risk — reduce to zero raw warnings, frontend will show summary
          nameWarnings = [];
        } else if (nameJudgeSummary?.mostImpactful) {
          // Fraud risk — show only the most impactful warning
          nameWarnings = [{
            severity: "high" as const,
            message: nameJudgeSummary.mostImpactful.message,
            files: nameJudgeSummary.mostImpactful.files,
            names: nameJudgeSummary.mostImpactful.names,
          }];
        }
      } catch (e) {
        console.error("Name judge failed, falling back to raw warnings:", e);
      }
    }

    // ── Duplicate detection against existing files + same upload batch ──
    const duplicates: Array<{ fileId: string; fileName: string; matchedFileName: string; reason: string }> = [];
    const normalizedExisting = (Array.isArray(existingFiles) ? existingFiles : []).map((ef: any) => ({
      ...ef,
      normalizedName: normalizeDocName(ef?.name || ""),
      normalizedPerson: normalizePerson(ef?.personName || ""),
      fileHash: (ef?.fileHash || "").toLowerCase().trim(),
    }));

    const seenInThisRequest: Array<{ fileName: string; category: string; personName: string; fileHash: string; normalizedName: string }> = [];

    for (const result of results) {
      const meta = inputFileMeta.get(result.fileId);
      const currentHash = meta?.fileHash || "";
      const currentNormalizedName = normalizeDocName(result.fileName);
      const currentNormalizedPerson = normalizePerson(result.personName || "");

      const exactHashMatch = currentHash
        ? normalizedExisting.find((ef) => ef.fileHash && ef.fileHash === currentHash)
        : null;
      if (exactHashMatch) {
        duplicates.push({
          fileId: result.fileId,
          fileName: result.fileName,
          matchedFileName: exactHashMatch.name,
          reason: `Exact file content match with "${exactHashMatch.name}"`,
        });
        continue;
      }

      const exactNameMatch = normalizedExisting.find((ef) => ef.normalizedName && ef.normalizedName === currentNormalizedName);
      if (exactNameMatch) {
        duplicates.push({
          fileId: result.fileId,
          fileName: result.fileName,
          matchedFileName: exactNameMatch.name,
          reason: `Exact filename match with "${exactNameMatch.name}"`,
        });
        continue;
      }

      const contentMatch = normalizedExisting.find(
        (ef) =>
          ef.category === result.category &&
          ef.normalizedPerson &&
          currentNormalizedPerson &&
          ef.normalizedPerson === currentNormalizedPerson &&
          ef.category !== "Other / Unknown"
      );
      if (contentMatch) {
        duplicates.push({
          fileId: result.fileId,
          fileName: result.fileName,
          matchedFileName: contentMatch.name,
          reason: `Same type (${result.category}) for "${result.personName}" already exists as "${contentMatch.name}"`,
        });
        continue;
      }

      const sameUploadMatch = seenInThisRequest.find(
        (prev) =>
          (currentHash && prev.fileHash && prev.fileHash === currentHash) ||
          (prev.normalizedName && prev.normalizedName === currentNormalizedName) ||
          (
            prev.category === result.category &&
            prev.personName &&
            currentNormalizedPerson &&
            normalizePerson(prev.personName) === currentNormalizedPerson &&
            prev.category !== "Other / Unknown"
          )
      );

      if (sameUploadMatch) {
        duplicates.push({
          fileId: result.fileId,
          fileName: result.fileName,
          matchedFileName: sameUploadMatch.fileName,
          reason: `Duplicate detected within this upload batch (matches "${sameUploadMatch.fileName}")`,
        });
        continue;
      }

      seenInThisRequest.push({
        fileName: result.fileName,
        category: result.category,
        personName: result.personName,
        fileHash: currentHash,
        normalizedName: currentNormalizedName,
      });
    }

    console.log(`[CLASSIFICATION CACHE] ${classificationCacheHits}/${results.length} files served from cache`);

    return new Response(
      JSON.stringify({ classifications: results, duplicates, nameWarnings, dobWarnings, idWarnings, nameJudgeSummary, classifications_cached: classificationCacheHits, classifications_total: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("classify-aml-docs error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classify_document",
    description: "Classify an AML document and extract metadata",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: AML_CATEGORIES, description: "The document category" },
        person_name: { type: "string", description: "Full name of the person the document relates to, or empty string if not identifiable" },
        date_of_birth: { type: "string", description: "Date of birth in DD/MM/YYYY format if found in the document, or empty string if not present. Look for DOB fields on passports, driving licences, national ID cards, and any other document that displays it." },
        issue_date: { type: "string", description: "Issue date in DD/MM/YYYY format for ID documents (passport, driving licence, national identity card). Look for 'Date of issue', 'Valid from', 'Issued' fields. Empty string if not an ID document or not found." },
        description: { type: "string", description: "Brief description of the document content (max 100 chars)" },
        confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in the classification" },
        readable: { type: "boolean", description: "Whether the document content could be read/understood" },
        readability_issue: { type: "string", description: "If not readable, explain the issue and suggest solutions" },
      },
      required: ["category", "person_name", "date_of_birth", "issue_date", "description", "confidence", "readable"],
      additionalProperties: false,
    },
  },
};

function makeErrorResult(
  file: { id: string; name: string },
  description: string,
  readabilityIssue?: string
) {
  return {
    fileId: file.id,
    fileName: file.name,
    category: "Other / Unknown",
    personName: "",
    dateOfBirth: "",
    issueDate: "",
    description,
    confidence: "low",
    readable: !readabilityIssue,
    readabilityIssue,
  };
}

/** Build the content array for a single document classification */
function buildClassificationContent(doc: ProcessedDocument): any[] {
  const preamble = `Classify this document. File name: "${doc.fileName}".\n\nAnalyse the content and classify it into the correct AML document category.`;

  if (doc.isMultimodal && doc.multimodalContent) {
    return [
      { type: "text", text: preamble },
      { type: "text", text: `\n\n${doc.label}\n[Analysing document visually]` },
      {
        type: "image_url",
        image_url: {
          url: `data:${doc.multimodalContent.mimeType};base64,${doc.multimodalContent.base64}`,
        },
      },
    ];
  }

  return [{ type: "text", text: `${preamble}\n\n${doc.textContent || "[No content could be extracted]"}` }];
}

// ── Stage 2: LLM-as-a-judge verification ──────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are a senior AML compliance reviewer acting as a quality-assurance judge.

You will receive:
1. A document (PDF, image, or text)
2. A proposed classification from a junior classifier

Your task is to VERIFY the classification is correct by independently reviewing the document. Check:
- Is the category correct? (e.g., a bank statement should NOT be classified as a savings statement)
- Is the person name correctly extracted?
- Is the date of birth correctly extracted (if present)? For ID documents, DOB extraction is critical.
- Is the description accurate?
- Was the document actually readable, or did the classifier miss readability issues?
- Are there any red flags the classifier missed (e.g., document appears altered, dates inconsistent)?

If the classification is WRONG, provide the corrected values.
If the classification is CORRECT, confirm it.

Be strict: a Payslip is NOT a P60. A Savings/ISA Statement is NOT a Bank Statement. A Council Tax Bill is NOT a Utility Bill.`;

type ClassificationResult = {
  fileId: string;
  fileName: string;
  category: string;
  personName: string;
  dateOfBirth: string;
  issueDate: string;
  description: string;
  confidence: string;
  readable: boolean;
  readabilityIssue?: string;
  judgeOverridden?: boolean;
  judgeNotes?: string;
};

async function judgeClassification(
  apiKey: string,
  doc: ProcessedDocument,
  initial: ClassificationResult
): Promise<ClassificationResult> {
  try {
    const reviewPrompt = `Review this document classification:

FILE: "${initial.fileName}"
PROPOSED CATEGORY: ${initial.category}
PROPOSED PERSON NAME: "${initial.personName}"
PROPOSED DATE OF BIRTH: "${initial.dateOfBirth}"
PROPOSED ISSUE DATE: "${initial.issueDate}"
PROPOSED DESCRIPTION: "${initial.description}"
PROPOSED CONFIDENCE: ${initial.confidence}
PROPOSED READABLE: ${initial.readable}
${initial.readabilityIssue ? `PROPOSED READABILITY ISSUE: ${initial.readabilityIssue}` : ""}

Now independently verify by examining the document below. Pay special attention to extracting the date of birth and issue date if this is an ID document.`;

    const docContent = buildClassificationContent(doc);
    const userContent: any[] = [
      { type: "text", text: reviewPrompt },
      ...docContent,
    ];

    const judgeResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "judge_classification",
              description: "Verify or correct a document classification",
              parameters: {
                type: "object",
                properties: {
                  approved: {
                    type: "boolean",
                    description: "true if the original classification is correct, false if corrections are needed",
                  },
                  corrected_category: {
                    type: "string",
                    enum: AML_CATEGORIES,
                    description: "The correct category (same as original if approved)",
                  },
                  corrected_person_name: {
                    type: "string",
                    description: "The correct person name (same as original if approved)",
                  },
                  corrected_date_of_birth: {
                    type: "string",
                    description: "The correct date of birth in DD/MM/YYYY format (same as original if approved, empty if not present)",
                  },
                  corrected_issue_date: {
                    type: "string",
                    description: "The correct issue date in DD/MM/YYYY format for ID documents (same as original if approved, empty if not an ID or not found)",
                  },
                  corrected_description: {
                    type: "string",
                    description: "Corrected description if needed (max 100 chars)",
                  },
                  corrected_confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Updated confidence after judge review",
                  },
                  readable: {
                    type: "boolean",
                    description: "Whether the document is actually readable",
                  },
                  readability_issue: {
                    type: "string",
                    description: "Readability issues found by the judge, if any",
                  },
                  judge_notes: {
                    type: "string",
                    description: "Brief explanation of the judge's decision (max 150 chars)",
                  },
                },
                required: ["approved", "corrected_category", "corrected_person_name", "corrected_description", "corrected_confidence", "readable"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "judge_classification" } },
      }),
    });

    if (!judgeResp.ok) {
      console.error(`Judge call failed for ${initial.fileName}:`, judgeResp.status);
      // If judge fails, return original with a note
      return { ...initial, judgeNotes: "Judge verification unavailable — using initial classification" };
    }

    const judgeData = await judgeResp.json();
    const judgeTool = judgeData.choices?.[0]?.message?.tool_calls?.[0];

    if (!judgeTool?.function?.arguments) {
      return { ...initial, judgeNotes: "Judge returned no result — using initial classification" };
    }

    const jArgs = typeof judgeTool.function.arguments === "string"
      ? JSON.parse(judgeTool.function.arguments)
      : judgeTool.function.arguments;

    const overridden = !jArgs.approved;

    if (overridden) {
      console.log(`[JUDGE OVERRIDE] ${initial.fileName}: "${initial.category}" → "${jArgs.corrected_category}" | ${jArgs.judge_notes || ""}`);
    }

    return {
      fileId: initial.fileId,
      fileName: initial.fileName,
      category: jArgs.corrected_category || initial.category,
      personName: jArgs.corrected_person_name ?? initial.personName,
      dateOfBirth: jArgs.corrected_date_of_birth ?? initial.dateOfBirth,
      issueDate: jArgs.corrected_issue_date ?? initial.issueDate,
      description: jArgs.corrected_description || initial.description,
      confidence: jArgs.corrected_confidence || initial.confidence,
      readable: jArgs.readable !== undefined ? jArgs.readable : initial.readable,
      readabilityIssue: jArgs.readability_issue || initial.readabilityIssue,
      judgeOverridden: overridden,
      judgeNotes: jArgs.judge_notes || undefined,
    };
  } catch (err) {
    console.error(`Judge error for ${initial.fileName}:`, err);
    return { ...initial, judgeNotes: "Judge error — using initial classification" };
  }
}

// ── Cross-document name consistency check ─────────────────────────────

type NameWarning = {
  severity: "high" | "medium" | "low";
  message: string;
  files: string[];
  names: string[];
};

function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\b(mr|mrs|ms|miss|dr|prof|sir|dame|lady|lord)\b\.?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameParts(normalised: string): string[] {
  return normalised.split(" ").filter(Boolean);
}

function describeDiscrepancy(a: string, b: string): string | null {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (na === nb || !na || !nb) return null;

  const partsA = nameParts(na);
  const partsB = nameParts(nb);
  const surnameA = partsA[partsA.length - 1];
  const surnameB = partsB[partsB.length - 1];

  if (surnameA !== surnameB) {
    return `Different surnames detected: "${a}" vs "${b}"`;
  }

  const firstA = partsA[0] || "";
  const firstB = partsB[0] || "";

  if (firstA.length === 1 && firstB.startsWith(firstA)) {
    return `Initial "${a}" may be an abbreviated form of "${b}" — verify full name matches`;
  }
  if (firstB.length === 1 && firstA.startsWith(firstB)) {
    return `Initial "${b}" may be an abbreviated form of "${a}" — verify full name matches`;
  }
  if (firstA !== firstB) {
    return `First name mismatch: "${a}" vs "${b}" — possible different individuals or name variation`;
  }

  return `Name variation detected: "${a}" vs "${b}" — verify these refer to the same person`;
}

function checkNameConsistency(results: ClassificationResult[]): NameWarning[] {
  const warnings: NameWarning[] = [];
  const nameEntries: Array<{ name: string; fileName: string }> = [];

  for (const r of results) {
    if (r.personName && r.personName.trim().length > 0 && r.readable) {
      nameEntries.push({ name: r.personName.trim(), fileName: r.fileName });
    }
  }
  if (nameEntries.length < 2) return warnings;

  // Group by normalised surname
  const bySurname = new Map<string, typeof nameEntries>();
  for (const entry of nameEntries) {
    const parts = nameParts(normaliseName(entry.name));
    const surname = parts[parts.length - 1] || normaliseName(entry.name);
    const group = bySurname.get(surname) || [];
    group.push(entry);
    bySurname.set(surname, group);
  }

  // Within each surname group, check for discrepancies
  for (const [, group] of bySurname) {
    if (group.length < 2) continue;
    const checked = new Set<string>();
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const key = [group[i].name, group[j].name].sort().join("||");
        if (checked.has(key)) continue;
        checked.add(key);
        const issue = describeDiscrepancy(group[i].name, group[j].name);
        if (issue) {
          warnings.push({
            severity: issue.includes("Different surnames") ? "high" : "medium",
            message: issue,
            files: [group[i].fileName, group[j].fileName],
            names: [group[i].name, group[j].name],
          });
        }
      }
    }
  }

  // Cross-surname typo detection (1-2 char difference)
  const allSurnames = [...bySurname.keys()];
  for (let i = 0; i < allSurnames.length; i++) {
    for (let j = i + 1; j < allSurnames.length; j++) {
      const s1 = allSurnames[i], s2 = allSurnames[j];
      if (Math.abs(s1.length - s2.length) <= 2 && s1.length > 2) {
        let diffs = 0;
        for (let k = 0; k < Math.max(s1.length, s2.length); k++) {
          if (s1[k] !== s2[k]) diffs++;
          if (diffs > 2) break;
        }
        if (diffs > 0 && diffs <= 2) {
          const gA = bySurname.get(s1)!, gB = bySurname.get(s2)!;
          warnings.push({
            severity: "high",
            message: `Possible surname typo: "${gA[0].name}" vs "${gB[0].name}" — surnames "${s1}" and "${s2}" are very similar`,
            files: [gA[0].fileName, gB[0].fileName],
            names: [gA[0].name, gB[0].name],
          });
        }
      }
    }
  }

  return warnings;
}

// ── Cross-document DOB consistency check ──────────────────────────────

type DobWarning = {
  severity: "high" | "medium";
  message: string;
  files: string[];
  datesOfBirth: string[];
};

/**
 * Normalise a DOB string to YYYY-MM-DD for comparison.
 * Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY
 */
function normaliseDob(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function checkDobConsistency(results: ClassificationResult[]): DobWarning[] {
  const warnings: DobWarning[] = [];

  // Collect DOBs with associated person names and files
  const dobEntries: Array<{ dob: string; normalisedDob: string; personName: string; fileName: string; isIdDoc: boolean }> = [];

  const ID_CATEGORIES = new Set([
    "ID Document (Passport / Driving Licence)",
  ]);

  for (const r of results) {
    if (!r.dateOfBirth || !r.dateOfBirth.trim() || !r.readable) continue;
    const normDob = normaliseDob(r.dateOfBirth);
    if (!normDob) continue;
    dobEntries.push({
      dob: r.dateOfBirth.trim(),
      normalisedDob: normDob,
      personName: r.personName || "Unknown",
      fileName: r.fileName,
      isIdDoc: ID_CATEGORIES.has(r.category),
    });
  }

  if (dobEntries.length < 2) return warnings;

  // Group by normalised person name to compare DOBs for the same person
  const byPerson = new Map<string, typeof dobEntries>();
  for (const entry of dobEntries) {
    const key = normaliseName(entry.personName);
    if (!key) continue;
    const group = byPerson.get(key) || [];
    group.push(entry);
    byPerson.set(key, group);
  }

  for (const [, group] of byPerson) {
    if (group.length < 2) continue;

    // Find the "authoritative" DOB from ID documents
    const idDob = group.find((e) => e.isIdDoc);
    const uniqueDobs = new Set(group.map((e) => e.normalisedDob));

    if (uniqueDobs.size > 1) {
      // DOB mismatch for the same person
      const allFiles = group.map((e) => e.fileName);
      const allDobs = group.map((e) => e.dob);

      if (idDob) {
        // Compare against ID document DOB
        const mismatched = group.filter((e) => e.normalisedDob !== idDob.normalisedDob);
        for (const m of mismatched) {
          warnings.push({
            severity: "high",
            message: `🔴 Date of birth mismatch: ID document (${idDob.fileName}) shows DOB ${idDob.dob}, but "${m.fileName}" shows DOB ${m.dob} for ${group[0].personName}. This requires immediate investigation.`,
            files: [idDob.fileName, m.fileName],
            datesOfBirth: [idDob.dob, m.dob],
          });
        }
      } else {
        // No ID doc — just flag the inconsistency
        warnings.push({
          severity: "high",
          message: `🔴 Inconsistent dates of birth detected for ${group[0].personName}: ${[...new Set(allDobs)].join(" vs ")} across documents. Verify against a primary ID document.`,
          files: allFiles,
          datesOfBirth: [...new Set(allDobs)],
        });
      }
    }
  }

  return warnings;
}

// ── Recently-issued ID document check ─────────────────────────────────

type IdWarning = {
  severity: "high";
  message: string;
  files: string[];
  issueDate: string;
  personName: string;
};

function checkRecentIdIssuance(results: ClassificationResult[]): IdWarning[] {
  const warnings: IdWarning[] = [];
  const ID_CATEGORIES = new Set(["ID Document (Passport / Driving Licence)"]);
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  for (const r of results) {
    if (!ID_CATEGORIES.has(r.category) || !r.issueDate || !r.readable) continue;

    const normIssue = normaliseDob(r.issueDate); // reuse same date parser
    if (!normIssue) continue;

    const issueDate = new Date(normIssue);
    if (isNaN(issueDate.getTime())) continue;

    if (issueDate > oneYearAgo) {
      const daysDiff = Math.floor((now.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
      warnings.push({
        severity: "high",
        message: `🔴 Recently issued ID document: "${r.fileName}" for ${r.personName || "unknown person"} was issued ${r.issueDate} (${daysDiff} days ago). ID documents less than 1 year old are a red flag for potential identity fraud — the individual may have obtained a new identity document to commit fraud.`,
        files: [r.fileName],
        issueDate: r.issueDate,
        personName: r.personName || "Unknown",
      });
    }
  }

  return warnings;
}

// ── LLM Judge for Name Consistency Warnings ───────────────────────────
// Uses OpenAI (different family from Gemini generator) per Model Independence rule.

async function judgeNameWarnings(
  apiKey: string,
  warnings: NameWarning[],
  results: ClassificationResult[],
): Promise<{ isFraudRisk: boolean; summary: string; mostImpactful: { message: string; files: string[]; names: string[] } | null }> {
  // Build a document profile summary for context
  const docSummary = results
    .filter((r) => r.readable && r.personName)
    .map((r) => `- ${r.fileName}: ${r.category}, person: "${r.personName}"`)
    .join("\n");

  const warningList = warnings
    .map((w, i) => `${i + 1}. [${w.severity}] ${w.message} (files: ${w.files.join(", ")})`)
    .join("\n");

  const prompt = `You are an AML compliance expert reviewing name consistency warnings generated from document classification in a UK residential conveyancing transaction.

Here is the document profile for this client:
${docSummary}

The following name discrepancies were detected:
${warningList}

Your task:
1. Consider the ENTIRETY of the client's document profile. Many name variations are benign (e.g., "John Smith" vs "J Smith", middle names included/omitted, title differences like Mr/Mrs, married name on some docs).
2. Determine whether ANY of these discrepancies are likely to indicate fraud or identity concerns — not just innocent variation.
3. If the discrepancies are all explainable by normal name variation (abbreviations, initials, titles, middle names), respond that it is NOT a fraud risk and provide a brief reassuring summary.
4. If there IS a genuine concern, identify the SINGLE most impactful discrepancy to flag.

You MUST respond using the provided tool.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-nano",
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          type: "function",
          function: {
            name: "name_fraud_assessment",
            description: "Return the fraud risk assessment for name discrepancies",
            parameters: {
              type: "object",
              properties: {
                is_fraud_risk: {
                  type: "boolean",
                  description: "true if any discrepancy is a genuine fraud/identity concern, false if all are benign variations",
                },
                summary: {
                  type: "string",
                  description: "A 1-2 sentence summary. If benign: reassure and note the variation type. If risky: explain the concern.",
                },
                most_impactful_index: {
                  type: "integer",
                  description: "1-based index of the most impactful warning to surface. Use 0 if none are risky.",
                },
              },
              required: ["is_fraud_risk", "summary", "most_impactful_index"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "name_fraud_assessment" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Name judge failed: ${resp.status} ${t}`);
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in name judge response");

  const args = JSON.parse(toolCall.function.arguments);
  const idx = args.most_impactful_index;
  const impactful = idx > 0 && idx <= warnings.length ? warnings[idx - 1] : null;

  return {
    isFraudRisk: args.is_fraud_risk,
    summary: args.summary,
    mostImpactful: impactful ? { message: impactful.message, files: impactful.files, names: impactful.names } : null,
  };
}

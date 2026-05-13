import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Knowledge base categories (must match AdminKnowledgeBase CATEGORIES) */
const CATEGORIES = [
  "regulatory",
  "firm_policy",
  "case_law",
  "training",
];

const CATEGORY_LABELS: Record<string, string> = {
  regulatory: "Regulatory Guidance",
  firm_policy: "Firm-Specific Policy",
  case_law: "Case Law & Precedent",
  training: "Training Material",
};

const DOC_TYPE_TAGS = [
  "general",
  "regulatory",
  "guidance",
  "policy",
  "checklist",
  "template",
  "case_law",
];

const TENURE_OPTIONS = ["freehold", "leasehold", "commonhold", "new-build"];

// ── Prompts ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a document classification assistant for a legal conveyancing knowledge base.

You will be given a document's text content and file name. Your task is to classify and label it for a RAG (Retrieval-Augmented Generation) knowledge base used by AI agents in UK residential property conveyancing.

Analyse the document and return:
1. **title** — A clear, descriptive title for the document (not just the filename). Should describe what the document covers.
2. **description** — A one-sentence summary of the document's content and purpose (max 150 chars).
3. **category** — One of: ${CATEGORIES.map(c => `"${c}" (${CATEGORY_LABELS[c]})`).join(", ")}
4. **knowledge_base_ids** — An array of the most appropriate knowledge base IDs from the provided list. Most documents belong to one KB, but some span multiple domains. Include all that are relevant. Minimum 1.
5. **tenure_types** — Array of relevant tenure types from: ${TENURE_OPTIONS.join(", ")}. Only include tenures that the document specifically discusses or is relevant to. Use empty array if the document is tenure-agnostic.
6. **doc_type_tag** — One of: ${DOC_TYPE_TAGS.join(", ")}. Describes the nature of the document.

Be precise and ground your classification in the actual document content. Do NOT hallucinate information that isn't present in the document.`;

const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classify_knowledge_document",
    description: "Classify a knowledge base document and extract structured metadata",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Clear, descriptive title for the document (not just the filename)",
        },
        description: {
          type: "string",
          description: "One-sentence summary of the document (max 150 chars)",
        },
        category: {
          type: "string",
          enum: CATEGORIES,
          description: "Document category",
        },
        knowledge_base_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of matching knowledge base IDs from the provided list (minimum 1)",
        },
        tenure_types: {
          type: "array",
          items: { type: "string", enum: TENURE_OPTIONS },
          description: "Relevant tenure types (empty array if tenure-agnostic)",
        },
        doc_type_tag: {
          type: "string",
          enum: DOC_TYPE_TAGS,
          description: "Nature/type of the document",
        },
      },
      required: ["title", "description", "category", "knowledge_base_ids", "tenure_types", "doc_type_tag"],
      additionalProperties: false,
    },
  },
};

// ── Judge ──────────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are a senior knowledge management reviewer acting as a quality-assurance judge for a legal conveyancing RAG knowledge base.

You will receive:
1. A document's text content
2. A proposed classification from a junior classifier

Your task is to VERIFY the classification is accurate by independently reviewing the document. Check:
- **Title accuracy**: Does the title accurately reflect the document content, or is it hallucinated / too vague / misleading?
- **Category correctness**: Is the category appropriate? (e.g. a statute should be "regulatory", not "training")
- **Knowledge base assignment**: Does the document belong to the suggested knowledge base domain?
- **Tenure tag relevance**: Are the tenure tags actually supported by the document content? Don't tag a document as "leasehold" unless it specifically discusses leasehold matters.
- **Description faithfulness**: Does the description accurately summarise the actual content?
- **Doc type tag**: Is the doc_type_tag correct? (e.g. a checklist should be "checklist", not "guidance")

If the classification is WRONG, provide the corrected values.
If the classification is CORRECT, confirm it.

Be strict: do not allow hallucinated titles or descriptions that add information not present in the document.`;

const JUDGE_TOOL = {
  type: "function",
  function: {
    name: "judge_knowledge_classification",
    description: "Verify or correct a knowledge document classification",
    parameters: {
      type: "object",
      properties: {
        approved: {
          type: "boolean",
          description: "true if the original classification is correct, false if corrections are needed",
        },
        corrected_title: { type: "string", description: "Corrected title (same as original if approved)" },
        corrected_description: { type: "string", description: "Corrected description (max 150 chars)" },
        corrected_category: { type: "string", enum: CATEGORIES },
        corrected_knowledge_base_ids: { type: "array", items: { type: "string" }, description: "Corrected knowledge base IDs" },
        corrected_tenure_types: {
          type: "array",
          items: { type: "string", enum: TENURE_OPTIONS },
        },
        corrected_doc_type_tag: { type: "string", enum: DOC_TYPE_TAGS },
        judge_notes: { type: "string", description: "Brief explanation of the judge's decision (max 150 chars)" },
      },
      required: ["approved", "corrected_title", "corrected_description", "corrected_category", "corrected_knowledge_base_ids", "corrected_tenure_types", "corrected_doc_type_tag"],
      additionalProperties: false,
    },
  },
};

// ── Types ──────────────────────────────────────────────────────────────

interface DocInput {
  documentId: string;
  contentText: string;
  fileName: string;
}

interface ClassificationResult {
  documentId: string;
  title: string;
  description: string;
  category: string;
  knowledgeBaseIds: string[];
  tenureTypes: string[];
  docTypeTag: string;
  judgeOverridden: boolean;
  judgeNotes?: string;
  error?: string;
}

// ── Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documents, knowledgeBases } = await req.json();

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (documents.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 documents per batch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build KB context for the AI
    const kbContext = (knowledgeBases || [])
      .map((kb: { id: string; label: string; description?: string }) =>
        `- "${kb.id}": ${kb.label}${kb.description ? ` — ${kb.description}` : ""}`
      )
      .join("\n");

    const results: ClassificationResult[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (doc: DocInput) => {
          try {
            const contentPreview = (doc.contentText || "").slice(0, 15000);

            if (!contentPreview || contentPreview.length < 20) {
              return {
                documentId: doc.documentId,
                title: doc.fileName.replace(/\.[^.]+$/, ""),
                description: "Document has insufficient content for classification",
                category: "regulatory",
                knowledgeBaseIds: [knowledgeBases?.[0]?.id || "source-of-wealth"],
                tenureTypes: [],
                docTypeTag: "general",
                judgeOverridden: false,
                error: "Insufficient content",
              } as ClassificationResult;
            }

            const userPrompt = `Classify this document for the knowledge base.

FILE NAME: "${doc.fileName}"

AVAILABLE KNOWLEDGE BASES:
${kbContext}

DOCUMENT CONTENT:
${contentPreview}`;

            // Stage 1: Classification
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: userPrompt },
                ],
                tools: [CLASSIFY_TOOL],
                tool_choice: { type: "function", function: { name: "classify_knowledge_document" } },
              }),
            });

            if (!aiResp.ok) {
              const errText = await aiResp.text();
              console.error(`Classification failed for ${doc.fileName}:`, aiResp.status, errText);

              if (aiResp.status === 429) {
                return {
                  documentId: doc.documentId,
                  title: doc.fileName.replace(/\.[^.]+$/, ""),
                  description: "",
                  category: "regulatory",
                  knowledgeBaseIds: [knowledgeBases?.[0]?.id || "source-of-wealth"],
                  tenureTypes: [],
                  docTypeTag: "general",
                  judgeOverridden: false,
                  error: "Rate limited — please try again shortly",
                } as ClassificationResult;
              }

              return {
                documentId: doc.documentId,
                title: doc.fileName.replace(/\.[^.]+$/, ""),
                description: "",
                category: "regulatory",
                knowledgeBaseIds: [knowledgeBases?.[0]?.id || "source-of-wealth"],
                tenureTypes: [],
                docTypeTag: "general",
                judgeOverridden: false,
                error: "AI classification failed",
              } as ClassificationResult;
            }

            const aiData = await aiResp.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

            if (!toolCall?.function?.arguments) {
              return {
                documentId: doc.documentId,
                title: doc.fileName.replace(/\.[^.]+$/, ""),
                description: "",
                category: "regulatory",
                knowledgeBaseIds: [knowledgeBases?.[0]?.id || "source-of-wealth"],
                tenureTypes: [],
                docTypeTag: "general",
                judgeOverridden: false,
                error: "Could not parse classification",
              } as ClassificationResult;
            }

            const args = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

            const initialResult: ClassificationResult = {
              documentId: doc.documentId,
              title: args.title || doc.fileName.replace(/\.[^.]+$/, ""),
              description: args.description || "",
              category: CATEGORIES.includes(args.category) ? args.category : "regulatory",
              knowledgeBaseIds: Array.isArray(args.knowledge_base_ids) && args.knowledge_base_ids.length > 0
                ? args.knowledge_base_ids
                : [knowledgeBases?.[0]?.id || "source-of-wealth"],
              tenureTypes: Array.isArray(args.tenure_types)
                ? args.tenure_types.filter((t: string) => TENURE_OPTIONS.includes(t))
                : [],
              docTypeTag: DOC_TYPE_TAGS.includes(args.doc_type_tag) ? args.doc_type_tag : "general",
              judgeOverridden: false,
            };

            // Stage 2: Judge verification
            const judged = await judgeClassification(LOVABLE_API_KEY, doc, initialResult, kbContext);
            return judged;
          } catch (err) {
            console.error(`Error classifying ${doc.fileName}:`, err);
            return {
              documentId: doc.documentId,
              title: doc.fileName.replace(/\.[^.]+$/, ""),
              description: "",
              category: "regulatory",
              knowledgeBaseIds: [knowledgeBases?.[0]?.id || "source-of-wealth"],
              tenureTypes: [],
              docTypeTag: "general",
              judgeOverridden: false,
              error: `Processing error: ${err.message}`,
            } as ClassificationResult;
          }
        })
      );

      results.push(...batchResults);
    }

    return new Response(
      JSON.stringify({ classifications: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("classify-knowledge-docs error:", err);

    if (err.message?.includes("Rate limit") || err.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Judge verification ────────────────────────────────────────────────

async function judgeClassification(
  apiKey: string,
  doc: DocInput,
  initial: ClassificationResult,
  kbContext: string
): Promise<ClassificationResult> {
  try {
    const contentPreview = (doc.contentText || "").slice(0, 12000);

    const reviewPrompt = `Review this knowledge base document classification:

FILE: "${doc.fileName}"
PROPOSED TITLE: "${initial.title}"
PROPOSED DESCRIPTION: "${initial.description}"
PROPOSED CATEGORY: ${initial.category} (${CATEGORY_LABELS[initial.category] || initial.category})
PROPOSED KNOWLEDGE BASES: ${initial.knowledgeBaseIds.join(", ")}
PROPOSED TENURE TYPES: ${initial.tenureTypes.length > 0 ? initial.tenureTypes.join(", ") : "(none — tenure-agnostic)"}
PROPOSED DOC TYPE TAG: ${initial.docTypeTag}

AVAILABLE KNOWLEDGE BASES:
${kbContext}

Now independently verify by examining the document content below. Check that the title is accurate (not hallucinated), the category and KB assignment are correct, and tenure tags are justified by the content.

DOCUMENT CONTENT:
${contentPreview}`;

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
          { role: "user", content: reviewPrompt },
        ],
        tools: [JUDGE_TOOL],
        tool_choice: { type: "function", function: { name: "judge_knowledge_classification" } },
      }),
    });

    if (!judgeResp.ok) {
      console.error(`Judge call failed for ${doc.fileName}:`, judgeResp.status);
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
      console.log(`[JUDGE OVERRIDE] ${doc.fileName}: title "${initial.title}" → "${jArgs.corrected_title}" | cat "${initial.category}" → "${jArgs.corrected_category}" | ${jArgs.judge_notes || ""}`);
    }

    return {
      documentId: initial.documentId,
      title: jArgs.corrected_title || initial.title,
      description: jArgs.corrected_description || initial.description,
      category: CATEGORIES.includes(jArgs.corrected_category) ? jArgs.corrected_category : initial.category,
      knowledgeBaseIds: Array.isArray(jArgs.corrected_knowledge_base_ids) && jArgs.corrected_knowledge_base_ids.length > 0
        ? jArgs.corrected_knowledge_base_ids
        : initial.knowledgeBaseIds,
      tenureTypes: Array.isArray(jArgs.corrected_tenure_types)
        ? jArgs.corrected_tenure_types.filter((t: string) => TENURE_OPTIONS.includes(t))
        : initial.tenureTypes,
      docTypeTag: DOC_TYPE_TAGS.includes(jArgs.corrected_doc_type_tag) ? jArgs.corrected_doc_type_tag : initial.docTypeTag,
      judgeOverridden: overridden,
      judgeNotes: jArgs.judge_notes || undefined,
    };
  } catch (err) {
    console.error(`Judge error for ${doc.fileName}:`, err);
    return { ...initial, judgeNotes: "Judge verification failed — using initial classification" };
  }
}

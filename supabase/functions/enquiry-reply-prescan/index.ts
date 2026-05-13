/**
 * enquiry-reply-prescan
 *
 * Lightweight per-file AI pre-scan that proposes which open enquiry items a
 * reply file likely answers, with per-match confidence. The user reviews and
 * confirms (or corrects) the proposal in the EnquiryTrackerPanel UI before
 * the heavier `ingest-replies` analysis runs.
 *
 * Inputs:
 *   - case_id (uuid)
 *   - agent_type ("sow")
 *   - file_path (string, path inside enquiry-replies bucket)
 *   - file_name (string)
 *
 * Output:
 *   {
 *     auto_note: string,
 *     suggested_classification: string,
 *     matches: [{ enquiry_id, enquiry_number, confidence: "high"|"medium"|"low", reasoning_snippet }]
 *   }
 *
 * Cost: single Gemini 2.5 Flash call with structured output, typically <2K input tokens.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({
  case_id: z.string().uuid(),
  agent_type: z.enum(["sow"]),
  file_path: z.string().min(1),
  file_name: z.string().min(1),
});

interface OpenEnquiry {
  id: string;
  enquiry_number: string;
  category: string;
  issue_summary: string;
  evidence_required: string | null;
}

interface PrescanMatch {
  enquiry_id: string;
  enquiry_number: string;
  confidence: "high" | "medium" | "low";
  reasoning_snippet: string;
}

const MAX_FILE_TEXT_CHARS = 12_000; // keep prompt small — pre-scan is intentionally cheap

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorised" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return jsonResponse({ error: "AI gateway not configured" }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Validate userId from JWT (lightweight — full JWT verification done by Supabase platform)
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      const payloadPart = token.split(".")[1];
      if (payloadPart) {
        const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
        const payload = JSON.parse(atob(padded)) as { sub?: string; exp?: number };
        const now = Math.floor(Date.now() / 1000);
        if (payload.sub && (!payload.exp || payload.exp > now)) userId = payload.sub;
      }
    } catch {
      // ignore — handled below
    }
    if (!userId) {
      return jsonResponse({ error: "Unauthorised" }, 401);
    }

    const rawBody = await req.json();
    const parseResult = requestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return jsonResponse(
        { error: `Invalid input: ${parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")}` },
        400,
      );
    }

    const { case_id, agent_type, file_path, file_name } = parseResult.data;

    // Verify case access via user client (RLS enforces ownership)
    const { data: caseData, error: caseError } = await userClient
      .from("cases")
      .select("id, case_reference")
      .eq("id", case_id)
      .single();

    if (caseError || !caseData) {
      return jsonResponse({ error: "Case not found or access denied" }, 404);
    }

    // Fetch open enquiry items
    const { data: openItems, error: itemsError } = await adminClient
      .from("enquiry_items")
      .select("id, enquiry_number, category, issue_summary, evidence_required, status")
      .eq("case_id", case_id)
      .eq("agent_type", agent_type)
      .in("status", ["open", "partially_satisfied"])
      .order("enquiry_number", { ascending: true });

    if (itemsError) {
      console.error("Failed to fetch open enquiries:", itemsError);
      return jsonResponse({ error: "Failed to load open enquiries" }, 500);
    }

    if (!openItems || openItems.length === 0) {
      return jsonResponse({
        auto_note: "No open enquiries to map against.",
        suggested_classification: "general_reply",
        matches: [],
      });
    }

    const enquiries: OpenEnquiry[] = openItems as OpenEnquiry[];

    // Extract text from the file. We delegate to ingest-file-to-text to reuse the
    // project's existing extraction pipeline (PDF, DOCX, image OCR, etc.).
    let fileText = "";
    try {
      const extractResp = await fetch(`${supabaseUrl}/functions/v1/ingest-file-to-text`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bucket: "enquiry-replies",
          file_path,
          file_name,
        }),
      });
      if (extractResp.ok) {
        const extractData = await extractResp.json().catch(() => null) as { text?: string } | null;
        fileText = (extractData?.text || "").slice(0, MAX_FILE_TEXT_CHARS);
      } else {
        console.warn(`[prescan] text extraction failed (${extractResp.status}) — using filename only`);
      }
    } catch (e) {
      console.warn("[prescan] text extraction error — using filename only:", e);
    }

    const enquiriesContext = enquiries.map(e =>
      `[${e.enquiry_number}] (${e.category}) ${e.issue_summary}${e.evidence_required ? ` | Needs: ${e.evidence_required}` : ""}`
    ).join("\n");

    const systemPrompt = `You are a document routing assistant for a UK conveyancing compliance platform (Olimey AI).

ROLE: Given a single uploaded reply document and a list of currently open compliance enquiries, identify which enquiries the document most likely answers.

PRINCIPLES:
1. Only propose a match if the document content (or filename, if content is unreadable) clearly relates to the enquiry's subject matter.
2. Confidence levels:
   - "high" — the document is unambiguously the evidence requested (e.g. a "Gift Letter from Adebayo.pdf" answering an enquiry about a £40k gift from M. Adebayo).
   - "medium" — the document plausibly answers the enquiry but the link is inferred, not explicit.
   - "low" — the document touches the topic but is not clearly responsive.
3. Do NOT propose matches with confidence below "low". If nothing matches, return an empty matches array.
4. Provide a one-sentence reasoning_snippet per match citing the document content or filename feature you relied on.
5. Provide a single auto_note: a one-line description of what this document IS (e.g. "Gift letter dated 12 Jan 2025 from M. Adebayo, £40,000"). Use UK English. Do not editorialise.
6. suggested_classification: one of "gift_letter", "bank_statement", "payslip", "id_document", "mortgage_offer", "letter", "email", "certificate", "report", "other".`;

    const userPrompt = `OPEN ENQUIRIES:
${enquiriesContext}

---

REPLY DOCUMENT:
Filename: ${file_name}
Content (truncated to ${MAX_FILE_TEXT_CHARS} chars):
${fileText || "(content could not be extracted — base your decision on the filename and any contextual signals)"}

---

Identify which enquiries this document answers, with confidence per match. Return your structured response via the propose_routing tool.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "propose_routing",
              description: "Submit the proposed enquiry-routing for this reply document.",
              parameters: {
                type: "object",
                properties: {
                  auto_note: {
                    type: "string",
                    description: "One-line description of what the document is. UK English, factual.",
                  },
                  suggested_classification: {
                    type: "string",
                    enum: [
                      "gift_letter", "bank_statement", "payslip", "id_document",
                      "mortgage_offer", "letter", "email", "certificate", "report", "other",
                    ],
                  },
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        enquiry_number: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        reasoning_snippet: { type: "string" },
                      },
                      required: ["enquiry_number", "confidence", "reasoning_snippet"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["auto_note", "suggested_classification", "matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "propose_routing" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return jsonResponse({ error: "AI rate limit exceeded — please try again shortly." }, 429);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ error: "AI credits exhausted." }, 402);
      }
      const body = await aiResponse.text().catch(() => "");
      console.error("[prescan] AI gateway error:", aiResponse.status, body.slice(0, 500));
      // Graceful degradation — return empty proposal so the UI falls back to manual selection.
      return jsonResponse({
        auto_note: "AI pre-scan unavailable. Please confirm enquiry mapping manually.",
        suggested_classification: "other",
        matches: [],
        prescan_failed: true,
      });
    }

    const aiText = await aiResponse.text();
    const aiResult = JSON.parse(aiText);

    if (aiResult.usage) {
      console.log(
        `[TOKEN_USAGE] enquiry-reply-prescan | case=${case_id} | model=gemini-2.5-flash | ` +
        `prompt_tokens=${aiResult.usage.prompt_tokens} | completion_tokens=${aiResult.usage.completion_tokens} | total_tokens=${aiResult.usage.total_tokens}`,
      );
    }

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.warn("[prescan] AI did not return structured tool call — graceful fallback");
      return jsonResponse({
        auto_note: "Pre-scan returned no structured result.",
        suggested_classification: "other",
        matches: [],
        prescan_failed: true,
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments) as {
      auto_note: string;
      suggested_classification: string;
      matches: Array<{ enquiry_number: string; confidence: "high" | "medium" | "low"; reasoning_snippet: string }>;
    };

    // Resolve enquiry_number → enquiry_id, dropping any AI-hallucinated numbers.
    const matchesWithIds: PrescanMatch[] = [];
    for (const m of parsed.matches || []) {
      const item = enquiries.find(e => e.enquiry_number === m.enquiry_number);
      if (!item) {
        console.warn(`[prescan] AI proposed unknown enquiry_number ${m.enquiry_number} — dropped`);
        continue;
      }
      matchesWithIds.push({
        enquiry_id: item.id,
        enquiry_number: item.enquiry_number,
        confidence: m.confidence,
        reasoning_snippet: m.reasoning_snippet,
      });
    }

    return jsonResponse({
      auto_note: parsed.auto_note,
      suggested_classification: parsed.suggested_classification,
      matches: matchesWithIds,
    });
  } catch (e) {
    console.error("[prescan] unhandled error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

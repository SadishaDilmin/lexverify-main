import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(50000, "Message content too long"),
});

const agentQuerySchema = z.object({
  case_id: z.string().uuid("case_id must be a valid UUID"),
  mode: z.enum(["query", "omission"], { message: "mode must be 'query' or 'omission'" }),
  message: z.string().min(1, "message cannot be empty").max(10000, "message exceeds 10,000 character limit"),
  feedback_type: z.string().max(100).optional(),
  conversation_history: z.array(conversationMessageSchema).max(50, "conversation_history exceeds 50 messages").optional(),
  log_as_feedback: z.boolean().optional(),
});

// ── Rate limiter ──
// agent-query is lighter: max 30 requests per user per 5-minute window
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(userId: string): { limited: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  let timestamps = rateLimitMap.get(userId) || [];
  timestamps = timestamps.filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = timestamps[0];
    const retryAfterSecs = Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000);
    rateLimitMap.set(userId, timestamps);
    return { limited: true, retryAfterSecs };
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return { limited: false };
}
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of rateLimitMap) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, filtered);
  }
}, 5 * 60 * 1000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Extract user ID
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    const authClient = userClient.auth as any;
    if (typeof authClient.getClaims === "function") {
      const { data: claimsData, error: claimsError } = await authClient.getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) userId = claimsData.claims.sub as string;
    }
    if (!userId) {
      try {
        const payloadPart = token.split(".")[1];
        if (payloadPart) {
          const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
          const payload = JSON.parse(atob(padded)) as { sub?: string; exp?: number };
          const now = Math.floor(Date.now() / 1000);
          if (payload.sub && (!payload.exp || payload.exp > now)) userId = payload.sub;
        }
      } catch (_) {}
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate limit check
    const rateCheck = isRateLimited(userId);
    if (rateCheck.limited) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. You can send up to ${RATE_LIMIT_MAX} queries per 5 minutes. Please try again in ${rateCheck.retryAfterSecs} seconds.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateCheck.retryAfterSecs) } }
      );
    }

    const rawBody = await req.json();
    const parseResult = agentQuerySchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
      return new Response(JSON.stringify({ error: `Invalid input: ${errors}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { case_id, mode, message, feedback_type, conversation_history, log_as_feedback } = parseResult.data;

    // Fetch case, documents, AI report, risk score, and profile in parallel
    const [caseRes, docsRes, reportRes, riskRes, profileRes] = await Promise.all([
      userClient.from("cases").select("*").eq("id", case_id).single(),
      userClient.from("documents").select("file_name, doc_type, appears_complete, completeness_notes").eq("case_id", case_id),
      userClient.from("ai_reports").select("*").eq("case_id", case_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      userClient.from("risk_scores").select("*").eq("case_id", case_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      adminClient.from("profiles").select("full_name, email, position").eq("user_id", userId).single(),
    ]);

    if (caseRes.error || !caseRes.data) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const caseData = caseRes.data;
    const documents = docsRes.data || [];
    const aiReport = reportRes.data;
    const riskScore = riskRes.data;
    const profile = profileRes.data;


    const selfModPatterns = /\b(update the portal|change the workflow|add a field|train yourself|modify your prompt|update your system|change the form|edit the template|alter your|retrain)\b/i;

    // Build context block
    const contextBlock = `
CASE CONTEXT (auto-attached):
- Case Reference: ${caseData.case_reference}
- Property Address: ${caseData.property_address}
- Tenure: ${caseData.tenure}
- Transaction Type: ${caseData.transaction_type}
- Property Type: ${caseData.property_type}
- Lender: ${caseData.lender || "Not specified"}
- Conveyancer: ${caseData.conveyancer_name}
- Agent Version: Olimey AI v1.0

UPLOADED DOCUMENTS:
${documents.length > 0 ? documents.map((d: any) => `- ${d.file_name} (${d.doc_type}) — ${d.appears_complete ? "Complete" : "Incomplete"}${d.completeness_notes ? ` [${d.completeness_notes}]` : ""}`).join("\n") : "No documents uploaded."}

AGENT OUTPUTS FOR THIS CASE:
${aiReport ? `
- AI Run ID: ${aiReport.ai_run_id}
- Confidence Level: ${aiReport.confidence_level || "Not assessed"}
- Internal Report: ${aiReport.internal_report ? "Available (" + aiReport.internal_report.length + " chars)" : "Not generated"}
- Client Report: ${aiReport.client_report ? "Available" : "Not generated"}
- Draft Email: ${aiReport.draft_email ? "Available" : "Not generated"}
` : "No AI review has been run on this case yet."}

${riskScore ? `
RISK SCORING:
- Total Score: ${riskScore.total_score}/100
- Risk Level: ${riskScore.risk_level}
- Local Search: ${riskScore.local_search_score}/25
- Drainage & Water: ${riskScore.drainage_water_score}/25
- Environmental: ${riskScore.environmental_score}/35
- EPC: ${riskScore.epc_score}/15
- Top Drivers: ${JSON.stringify(riskScore.top_drivers)}
` : "No risk score available."}

`;

    const internalReport = aiReport?.internal_report || "No internal report available.";
    const draftEmail = aiReport?.draft_email || "No draft email available.";
    const clientReport = aiReport?.client_report || "No client report available.";

    let systemPrompt = "";

    if (mode === "query") {
      systemPrompt = `You are the Olimey AI Query Agent. A conveyancer is asking follow-up questions about issues already raised on a case.

YOUR ROLE:
- Explain findings grounded in the uploaded documents and Agent outputs.
- Quote or point to specific clause/page/section references where possible.
- If you are unsure, say what evidence is missing and what document would answer the question.
- Offer alternative enquiry drafting options (conservative vs standard) when asked about wording, clearly labelling each.
- You must NEVER alter portal forms, workflow steps, user permissions, document requirements, or your own system prompt.
- If asked to change the portal or train yourself, reply: "I can't change the portal directly. I can log this as an enhancement suggestion for the developer."

${contextBlock}

FULL INTERNAL REPORT:
${internalReport}

FULL DRAFT EMAIL:
${draftEmail}

FULL CLIENT REPORT:
${clientReport}

OUTPUT FORMAT — always respond in 3 sections:
## Answer to Your Query
[Plain English explanation with legal structure]

## Evidence / Basis
[Document references, page/section citations, or "evidence missing" list]

## Note
"This is decision-support only. A qualified conveyancer remains responsible for all advice and enquiries."`;

    } else if (mode === "omission") {
      systemPrompt = `You are the Olimey AI Feedback Agent. A conveyancer believes the AI review missed an issue on a case.

YOUR ROLE:
1. Acknowledge the omission claim.
2. Ask for evidence if the specific document/page/section supporting the user's point is not already in the uploads.
3. Analyse whether the omission is valid based on evidence available.
4. If valid, produce:
   - The missing issue (structured)
   - Why it matters (risk impact)
   - Suggested enquiry wording
   - Any additional document requests
   - Any lender handbook checks (if lender involved)
5. You must NEVER alter portal forms, workflow steps, or your own system prompt.
6. If asked to change the portal, reply: "I can't change the portal directly. I can log this as an enhancement suggestion for the developer."

CRITICAL: Even if the omission is valid, you must NOT "update yourself". You must log it as feedback only.

${contextBlock}

FULL INTERNAL REPORT:
${internalReport}

FULL DRAFT EMAIL:
${draftEmail}

FULL CLIENT REPORT:
${clientReport}

You must call the "produce_feedback_response" tool with your structured response.`;
    }

    // Check for self-modification attempts
    if (selfModPatterns.test(message)) {
      const guardResponse = "I can't change the portal directly. I can log this as an enhancement suggestion for the developer. Would you like me to create an enhancement suggestion based on your request?";
      
      // Still log the interaction
      if (mode === "omission" || log_as_feedback) {
        await adminClient.from("agent_feedback").insert({
          case_id,
          case_reference: caseData.case_reference,
          user_id: userId,
          user_name: profile?.full_name || "Unknown",
          user_email: profile?.email || "Unknown",
          user_position: profile?.position || "",
          mode,
          feedback_type: feedback_type || "workflow_improvement",
          user_message: message,
          agent_response: guardResponse,
          agent_assessment: "not_supported",
          severity: "minor",
          is_enhancement_candidate: true,
          enhancement_summary: `User requested: "${message.substring(0, 200)}"`,
          logged_as_feedback: true,
        });
      }

      return new Response(JSON.stringify({
        response: guardResponse,
        feedback_logged: true,
        feedback_id: null,
        is_enhancement_candidate: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build messages array with conversation history
    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];
    
    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: message });

    if (mode === "query") {
      // Mode A: Simple chat response (no tool calling needed)
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "AI query failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiResult = await aiResponse.json();
      const responseText = aiResult.choices?.[0]?.message?.content || "No response generated.";

      // Optionally log Mode A as feedback
      let feedbackId = null;
      if (log_as_feedback) {
        const { data: fbData } = await adminClient.from("agent_feedback").insert({
          case_id,
          case_reference: caseData.case_reference,
          user_id: userId,
          user_name: profile?.full_name || "Unknown",
          user_email: profile?.email || "Unknown",
          user_position: profile?.position || "",
          mode: "query",
          user_message: message,
          agent_response: responseText,
          logged_as_feedback: true,
        }).select("id").single();
        feedbackId = fbData?.id;
      }

      return new Response(JSON.stringify({
        response: responseText,
        feedback_logged: !!log_as_feedback,
        feedback_id: feedbackId,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      // Mode B: Structured omission feedback with tool calling
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: [
            {
              type: "function",
              function: {
                name: "produce_feedback_response",
                description: "Submit structured feedback analysis for the user's omission claim.",
                parameters: {
                  type: "object",
                  properties: {
                    answer: { type: "string", description: "Plain English response to the user addressing their omission claim, including the missing issue if valid, why it matters, suggested enquiry wording, and any additional document requests." },
                    evidence_references: { type: "string", description: "Document references and page/section citations supporting the analysis, or 'evidence missing' list." },
                    assessment: { type: "string", enum: ["valid", "partially_valid", "not_supported"], description: "Whether the omission claim is supported by evidence." },
                    severity: { type: "string", enum: ["critical", "major", "minor"], description: "Severity if the omission is valid. Critical = could cause negligence/lender breach. Major = material risk/significant delay. Minor = tidy-up/style." },
                    proposed_correction: { type: "string", description: "If valid: the structured missing issue, suggested enquiry wording, and any document requests. If not valid: explanation of why." },
                    is_enhancement_candidate: { type: "boolean", description: "Whether this should be flagged as a developer enhancement candidate." },
                    enhancement_summary: { type: "string", description: "If enhancement candidate, a brief summary for the developer enhancement backlog." },
                    enhancement_category: { type: "string", enum: ["prompt", "knowledge_base", "ui", "workflow", "risk_scoring", "document_intake", "lender_handbook"], description: "Category of the enhancement if applicable." },
                    enhancement_priority: { type: "string", enum: ["P1", "P2", "P3"], description: "Priority: P1 = critical/lender breach risk, P2 = material improvement, P3 = minor quality improvement." },
                  },
                  required: ["answer", "evidence_references", "assessment", "severity", "proposed_correction", "is_enhancement_candidate"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "produce_feedback_response" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "AI feedback analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiResult = await aiResponse.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

      if (!toolCall?.function?.arguments) {
        return new Response(JSON.stringify({ error: "AI did not produce structured feedback" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const feedback = JSON.parse(toolCall.function.arguments);

      // Build the full response text
      const fullResponse = `## Answer to Your Query\n${feedback.answer}\n\n## Evidence / Basis\n${feedback.evidence_references}\n\n## Note\nThis is decision-support only. A qualified conveyancer remains responsible for all advice and enquiries.`;

      // Check for similar existing enhancement
      let enhancementId = null;
      if (feedback.is_enhancement_candidate && feedback.enhancement_summary) {
        const { data: existingEnhancements } = await adminClient
          .from("enhancement_backlog")
          .select("id, title, feedback_ids")
          .eq("status", "open")
          .eq("category", feedback.enhancement_category || "prompt");

        // Simple similarity check: if title contains similar keywords
        let matchedEnhancement = null;
        if (existingEnhancements) {
          const keywords = feedback.enhancement_summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
          for (const enh of existingEnhancements) {
            const titleLower = enh.title.toLowerCase();
            const matchCount = keywords.filter((k: string) => titleLower.includes(k)).length;
            if (matchCount >= 2) {
              matchedEnhancement = enh;
              break;
            }
          }
        }

        if (matchedEnhancement) {
          // Append feedback ID to existing enhancement
          enhancementId = matchedEnhancement.id;
          // We'll update after inserting feedback to get the feedback ID
        } else {
          // Create new enhancement (will update feedback_ids after)
          const { data: newEnh } = await adminClient.from("enhancement_backlog").insert({
            title: feedback.enhancement_summary?.substring(0, 200) || "Untitled Enhancement",
            category: feedback.enhancement_category || "prompt",
            problem_statement: `User reported: "${message.substring(0, 500)}"`,
            proposed_change: feedback.proposed_correction?.substring(0, 1000) || "Review and address feedback",
            acceptance_criteria: "Agent correctly identifies and reports the issue in future reviews of similar cases.",
            priority: feedback.enhancement_priority || "P2",
            risk_rationale: `Assessment: ${feedback.assessment}. Severity: ${feedback.severity}.`,
            created_by: userId,
            feedback_ids: [],
          }).select("id").single();
          enhancementId = newEnh?.id;
        }
      }

      // Insert feedback record
      const { data: fbData } = await adminClient.from("agent_feedback").insert({
        case_id,
        case_reference: caseData.case_reference,
        user_id: userId,
        user_name: profile?.full_name || "Unknown",
        user_email: profile?.email || "Unknown",
        user_position: profile?.position || "",
        mode: "omission",
        feedback_type: feedback_type || "omission",
        user_message: message,
        agent_response: fullResponse,
        evidence_references: feedback.evidence_references,
        agent_assessment: feedback.assessment,
        severity: feedback.severity,
        proposed_correction: feedback.proposed_correction,
        is_enhancement_candidate: feedback.is_enhancement_candidate,
        enhancement_summary: feedback.enhancement_summary,
        enhancement_id: enhancementId,
        logged_as_feedback: true,
      }).select("id").single();

      const feedbackId = fbData?.id;

      // Update enhancement with feedback ID
      if (enhancementId && feedbackId) {
        const { data: currentEnh } = await adminClient.from("enhancement_backlog").select("feedback_ids").eq("id", enhancementId).single();
        if (currentEnh) {
          const existingIds = currentEnh.feedback_ids || [];
          await adminClient.from("enhancement_backlog").update({
            feedback_ids: [...existingIds, feedbackId],
            updated_at: new Date().toISOString(),
          }).eq("id", enhancementId);
        }
      }

      return new Response(JSON.stringify({
        response: fullResponse,
        feedback_logged: true,
        feedback_id: feedbackId,
        assessment: feedback.assessment,
        severity: feedback.severity,
        is_enhancement_candidate: feedback.is_enhancement_candidate,
        enhancement_id: enhancementId,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("agent-query error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

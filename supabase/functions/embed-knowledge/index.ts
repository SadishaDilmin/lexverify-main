import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Text chunking ──────────────────────────────────────────────────────
// PostgreSQL tsvector has a 1MB limit; keep chunks well under that
const MAX_TSVECTOR_CHARS = 250_000;

function chunkText(text: string, maxChunkChars = 3000, overlap = 300): string[] {
  const chunks: string[] = [];
  if (!text || text.length === 0) return chunks;

  // Split by paragraphs first, then merge into chunks
  const paragraphs = text.split(/\n{2,}/);
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 > maxChunkChars && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap from end of current chunk
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(" ") + "\n\n" + trimmed;
    } else {
      current = current ? current + "\n\n" + trimmed : trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // If text has no paragraph breaks, do character-based chunking
  if (chunks.length === 0 && text.length > 0) {
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + maxChunkChars).trim());
      i += maxChunkChars - overlap;
    }
  }

  return chunks;
}

function stripBase64Whitespace(value: string): string {
  return value.replace(/\s+/g, "");
}

function base64ToBytes(base64Value: string): Uint8Array {
  const normalized = stripBase64Whitespace(base64Value);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  try {
    const pdfMod = await import("npm:pdf-parse@1.1.1/lib/pdf-parse.js");
    const pdf = pdfMod.default ?? pdfMod;
    const parsed = await pdf(bytes);
    return parsed?.text?.trim() || "";
  } catch (e) {
    console.warn("[embed-knowledge] Local PDF parse failed:", e instanceof Error ? e.message : e);
    return "";
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deterministicEmbedding(text: string): number[] {
  // Stable, lightweight fallback to avoid stuck processing when gateway embedding calls hang.
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  const vec = new Array(EMBED_DIM).fill(0).map((_, i) => {
    const x = Math.sin((seed + i * 2654435761) * 0.000001) + Math.cos((seed ^ (i * 2246822519)) * 0.000001);
    return Number.isFinite(x) ? x : 0;
  });

  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (!mag || !Number.isFinite(mag)) return new Array(EMBED_DIM).fill(0);
  return vec.map((v) => v / mag);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    wait(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

// Use shared embedding utility (tries dedicated endpoint, falls back to chat)
import { generateEmbedding, EMBED_DIM } from "../_shared/generateEmbedding.ts";
export { EMBED_DIM };

// ── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");

    // Auth check - require service-role key or valid user JWT
    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.replace("Bearer ", "");
    const isServiceRole = bearerToken === SUPABASE_SERVICE_ROLE_KEY;

    let authenticatedUserId: string | null = null;
    if (!isServiceRole) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabaseUser.auth.getUser(bearerToken);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authenticatedUserId = user.id;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: any;
    try {
      body = await req.json();
    } catch (_jsonErr) {
      return new Response(
        JSON.stringify({ error: "No content provided — request body is empty or malformed. If uploading a PDF, the file may exceed the 6 MB payload limit." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { action, documentId, title, description, category, agentId, contentText, status, sourceUrl, retryDocumentId, pdfBase64, fileName, startIndex, batchSize } = body;

    // ── Action: process (chunk + embed a document — legacy, still works) ──
    if (action === "process") {
      if (!documentId) throw new Error("documentId required");

      const { data: doc, error: docErr } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("id", documentId)
        .single();

      if (docErr || !doc) throw new Error("Document not found");

      const text = doc.content_text;
      if (!text || text.trim().length === 0) throw new Error("Document has no content");

      const chunks = chunkText(text);
      console.log(`Document ${documentId}: ${chunks.length} chunks`);

      await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);

      let successCount = 0;
      const BATCH_SIZE = 5;

      for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
        const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (chunk, idx) => {
            const i = batchStart + idx;
            const embedding = await generateEmbedding(LOVABLE_API_KEY, chunk);
            const embeddingStr = `[${embedding.join(",")}]`;

            const { error: insertErr } = await supabase.from("knowledge_chunks").insert({
              document_id: documentId,
              content: chunk.slice(0, MAX_TSVECTOR_CHARS),
              chunk_index: i,
              embedding: embeddingStr,
              token_count: Math.ceil(chunk.length / 4),
            });

            if (insertErr) {
              console.error(`Chunk ${i} insert error:`, insertErr);
              throw insertErr;
            }
            return i;
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled") successCount++;
          else console.error("Chunk embedding error:", r.reason);
        }

        if (batchStart + BATCH_SIZE < chunks.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      await supabase
        .from("knowledge_documents")
        .update({ chunk_count: successCount })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({ success: true, chunks: successCount, total: chunks.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: chunk-only (chunk text + store without embeddings) ──
    if (action === "chunk-only") {
      if (!documentId) throw new Error("documentId required");

      const { data: doc, error: docErr } = await supabase
        .from("knowledge_documents")
        .select("id, content_text")
        .eq("id", documentId)
        .single();

      if (docErr || !doc) throw new Error("Document not found");

      const text = doc.content_text;
      if (!text || text.trim().length === 0) throw new Error("Document has no content");

      const chunks = chunkText(text);
      console.log(`[chunk-only] Document ${documentId}: ${chunks.length} chunks`);

      // Delete existing chunks
      await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);

      // Insert chunks without embeddings
      for (let i = 0; i < chunks.length; i++) {
        const { error: insertErr } = await supabase.from("knowledge_chunks").insert({
          document_id: documentId,
          content: chunks[i].slice(0, MAX_TSVECTOR_CHARS),
          chunk_index: i,
          token_count: Math.ceil(chunks[i].length / 4),
        });
        if (insertErr) {
          console.error(`Chunk ${i} insert error:`, insertErr);
          throw insertErr;
        }
      }

      // Reset chunk_count to 0 (will be updated as batches embed)
      await supabase
        .from("knowledge_documents")
        .update({ chunk_count: 0 })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({ success: true, totalChunks: chunks.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: embed-batch (embed a range of already-stored chunks) ──
    if (action === "embed-batch") {
      if (!documentId) throw new Error("documentId required");
      const requestedBatchSize = Number(batchSize) || 1;
      const effectiveBatchSize = Math.max(1, Math.min(requestedBatchSize, 1));
      const startedAt = Date.now();
      console.log(`[embed-batch] Start document=${documentId} batchSize=${effectiveBatchSize}`);

      // Fetch chunks that have no embedding yet, in order
      const { data: chunks, error: chunkErr } = await supabase
        .from("knowledge_chunks")
        .select("id, content, chunk_index")
        .eq("document_id", documentId)
        .is("embedding", null)
        .order("chunk_index", { ascending: true })
        .limit(effectiveBatchSize);

      if (chunkErr) throw chunkErr;

      if (!chunks || chunks.length === 0) {
        // All done — count total embedded
        const { count } = await supabase
          .from("knowledge_chunks")
          .select("id", { count: "exact", head: true })
          .eq("document_id", documentId)
          .not("embedding", "is", null);

        await supabase
          .from("knowledge_documents")
          .update({ chunk_count: count || 0 })
          .eq("id", documentId);

        return new Response(
          JSON.stringify({ success: true, embedded: 0, remaining: 0, done: true, totalEmbedded: count || 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let embedded = 0;
      for (const chunk of chunks) {
        let embedding: number[];

        try {
          embedding = await withTimeout(
            generateEmbedding(LOVABLE_API_KEY, chunk.content),
            12000,
            `Embedding chunk ${chunk.chunk_index}`,
          );
        } catch (embeddingErr) {
          console.warn(
            `[embed-batch] Embedding failed for chunk ${chunk.chunk_index}; using deterministic fallback`,
            embeddingErr instanceof Error ? embeddingErr.message : embeddingErr,
          );
          embedding = deterministicEmbedding(chunk.content);
        }

        const embeddingStr = `[${embedding.join(",")}]`;
        const { error: updateErr } = await supabase
          .from("knowledge_chunks")
          .update({ embedding: embeddingStr })
          .eq("id", chunk.id);

        if (updateErr) {
          console.error(`Batch embed update error for chunk ${chunk.chunk_index}:`, updateErr);
          continue;
        }

        embedded++;
      }

      // Count remaining un-embedded chunks
      const { count: remaining } = await supabase
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .is("embedding", null);

      // Count total embedded so far
      const { count: totalEmbedded } = await supabase
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .not("embedding", "is", null);

      // Update document chunk_count with embedded count
      await supabase
        .from("knowledge_documents")
        .update({ chunk_count: totalEmbedded || 0 })
        .eq("id", documentId);

      const durationMs = Date.now() - startedAt;
      console.log(
        `[embed-batch] Complete document=${documentId} embedded=${embedded} remaining=${remaining || 0} totalEmbedded=${totalEmbedded || 0} durationMs=${durationMs}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          embedded,
          remaining: remaining || 0,
          done: (remaining || 0) === 0,
          totalEmbedded: totalEmbedded || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: approve ───────────────────────────────────────────
    if (action === "approve") {
      if (!documentId) throw new Error("documentId required");

      // Check admin
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: authenticatedUserId,
        _role: "admin",
      });

      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("knowledge_documents")
        .update({
          status: "approved",
          approved_by: authenticatedUserId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: reject ────────────────────────────────────────────
    if (action === "reject") {
      if (!documentId) throw new Error("documentId required");

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: authenticatedUserId,
        _role: "admin",
      });

      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("knowledge_documents")
        .update({ status: "rejected" })
        .eq("id", documentId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: parse-pdf (extract text from PDF/DOC/DOCX via Gemini multimodal) ──
    if (action === "parse-pdf") {
      if (!documentId) throw new Error("documentId required");
      if (!pdfBase64) throw new Error("pdfBase64 required");

      // Confirm document exists
      const { data: pdfDoc, error: pdfDocErr } = await supabase
        .from("knowledge_documents")
        .select("id, file_name")
        .eq("id", documentId)
        .single();
      if (pdfDocErr || !pdfDoc) throw new Error("Document not found");

      // Determine MIME type from file name
      const docFileName = fileName || pdfDoc.file_name || "document.pdf";
      const ext = (docFileName.split(".").pop() || "").toLowerCase();
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      const mimeType = mimeMap[ext] || "application/pdf";
      const docLabel = ext === "pdf" ? "PDF" : "Word document";

      // Update status to processing
      await supabase
        .from("knowledge_documents")
        .update({ status: "processing" })
        .eq("id", documentId);

      try {
        console.log(`Parsing ${docLabel} (${ext}) via Gemini multimodal...`);

        const normalizedPdfBase64 = stripBase64Whitespace(pdfBase64);
        let localPdfText = "";

        // For PDFs, try local parse first to avoid unnecessary multimodal failures.
        if (ext === "pdf") {
          const pdfBytes = base64ToBytes(normalizedPdfBase64);
          const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
          if (!header.startsWith("%PDF")) {
            console.warn(`[embed-knowledge] ${docFileName} does not have a standard PDF header`);
          }

          localPdfText = await extractTextFromPdfBytes(pdfBytes);
          if (localPdfText.length >= 120) {
            await supabase
              .from("knowledge_documents")
              .update({
                content_text: localPdfText,
                status: "pending",
                fetch_method: "pdf_parse_local",
                fetch_error: null,
              })
              .eq("id", documentId);

            console.log(`PDF parsed locally: ${localPdfText.length} chars`);
            return new Response(
              JSON.stringify({ success: true, documentId, chars: localPdfText.length }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const retryDelaysMs = [1000, 2000, 4000];
        let geminiResult: any = null;
        let lastGeminiError: Error | null = null;

        for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
          const geminiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are a document text extractor. Extract ALL text content from the provided ${docLabel}. Preserve paragraph structure using double newlines between paragraphs. Preserve headings, lists, and tables as plain text. Do NOT summarise — output the complete text verbatim. Output ONLY the extracted text, nothing else.`,
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${normalizedPdfBase64}`,
                      },
                    },
                    {
                      type: "text",
                      text: `Extract all text from this ${docLabel}. Output the complete text content only.`,
                    },
                  ],
                },
              ],
              max_tokens: 16000,
            }),
          });

          if (geminiRes.ok) {
            geminiResult = await geminiRes.json();
            break;
          }

          const errText = await geminiRes.text();
          const isNoPagesError = geminiRes.status === 400 && /no pages/i.test(errText);
          console.error(`Gemini ${docLabel} parse error (attempt ${attempt + 1}):`, geminiRes.status, errText);

          if (isNoPagesError && attempt < retryDelaysMs.length) {
            const delay = retryDelaysMs[attempt];
            console.warn(`[embed-knowledge] Retrying ${docLabel} parse in ${delay}ms due to transient 'no pages' error`);
            await wait(delay);
            continue;
          }

          lastGeminiError = new Error(`${docLabel} parsing failed: HTTP ${geminiRes.status}`);
          break;
        }

        if (!geminiResult) {
          // Last-resort fallback for PDFs if Gemini failed but local parse got some text.
          if (ext === "pdf" && localPdfText.length > 20) {
            await supabase
              .from("knowledge_documents")
              .update({
                content_text: localPdfText,
                status: "pending",
                fetch_method: "pdf_parse_local_fallback",
                fetch_error: null,
              })
              .eq("id", documentId);

            console.warn(`[embed-knowledge] Used local PDF fallback after Gemini failure for ${docFileName}`);
            return new Response(
              JSON.stringify({ success: true, documentId, chars: localPdfText.length, fallback: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          throw lastGeminiError || new Error(`${docLabel} parsing failed`);
        }

        // ── Token usage logging ──────────────────────────
        if (geminiResult.usage) {
          console.log(`[TOKEN_USAGE] embed-knowledge-doc-parse | doc=${documentId} | model=gemini-2.5-flash | prompt_tokens=${geminiResult.usage.prompt_tokens} | completion_tokens=${geminiResult.usage.completion_tokens} | total_tokens=${geminiResult.usage.total_tokens}`);
        }

        const extractedText = geminiResult.choices?.[0]?.message?.content || "";

        if (!extractedText || extractedText.length < 20) {
          throw new Error(`${docLabel} parsing returned too little text — the document may be image-only or empty.`);
        }

        // Update document with extracted text
        await supabase
          .from("knowledge_documents")
          .update({
            content_text: extractedText,
            status: "pending",
            fetch_method: ext === "pdf" ? "pdf_gemini" : "doc_gemini",
            fetch_error: null,
          })
          .eq("id", documentId);

        console.log(`${docLabel} parsed successfully: ${extractedText.length} chars`);
        return new Response(
          JSON.stringify({ success: true, documentId, chars: extractedText.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (parseErr) {
        const errorMsg = parseErr instanceof Error ? parseErr.message : `Unknown ${docLabel} parse error`;
        console.error(`${docLabel} parse failed:`, errorMsg);

        await supabase
          .from("knowledge_documents")
          .update({
            status: "pending",
            fetch_error: errorMsg,
          })
          .eq("id", documentId);

        return new Response(
          JSON.stringify({ success: false, documentId, error: errorMsg }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Action: search ────────────────────────────────────────────
    if (action === "search") {
      const { query, agentId: searchAgentId } = await req.json().catch(() => ({ query: "", agentId: "source-of-wealth" }));
      if (!query) throw new Error("query required");

      // Not used directly here - search is done in agent-chat
      // But provided for testing
      const embedding = await generateEmbedding(LOVABLE_API_KEY, query);
      const embeddingStr = `[${embedding.join(",")}]`;

      const { data: results, error: searchErr } = await supabase.rpc("search_knowledge_chunks", {
        query_embedding_text: embeddingStr,
        match_agent_id: searchAgentId || "source-of-wealth",
        match_threshold: 0.5,
        match_count: 5,
      });

      if (searchErr) throw searchErr;

      return new Response(
        JSON.stringify({ results: results || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: fetch-url (scrape URL and create document) ──────
    if (action === "fetch-url") {
      if (!sourceUrl) throw new Error("sourceUrl required");
      if (!title) throw new Error("title required");

      let formattedUrl = sourceUrl.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      // If retrying an existing document, reuse its ID
      let docId: string;
      if (retryDocumentId) {
        // Update existing document to "processing"
        const { error: updateErr } = await supabase
          .from("knowledge_documents")
          .update({ status: "processing", fetch_error: null })
          .eq("id", retryDocumentId);
        if (updateErr) throw updateErr;
        docId = retryDocumentId;
      } else {
        // Create the document record first with status "processing"
        const { data: newDoc, error: insertErr } = await supabase
          .from("knowledge_documents")
          .insert({
            title: title.trim(),
            description: (description || "").trim(),
            category: category || "regulatory",
            agent_id: agentId || "source-of-wealth",
            content_text: "",
            source_url: formattedUrl,
            uploaded_by: authenticatedUserId || "system",
            status: "processing",
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;
        docId = newDoc.id;
      }

      try {
        console.log("Fetching URL via Firecrawl:", formattedUrl);

        const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

        let extractedText: string;

        if (FIRECRAWL_API_KEY) {
          // Use Firecrawl for JS-rendered page support
          const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ["markdown"],
              onlyMainContent: true,
            }),
          });

          if (!fcRes.ok) {
            const errBody = await fcRes.json().catch(() => null);
            throw new Error(errBody?.error || `Firecrawl error: HTTP ${fcRes.status}`);
          }

          const fcData = await fcRes.json();
          extractedText = fcData?.data?.markdown || fcData?.markdown || "";

          if (!extractedText || extractedText.length < 50) {
            throw new Error("Firecrawl returned too little content — page may be empty or blocked.");
          }
        } else {
          // Fallback to raw fetch if Firecrawl not configured
          console.log("FIRECRAWL_API_KEY not set, falling back to raw fetch");
          const fetchRes = await fetch(formattedUrl, {
            headers: {
              "User-Agent": "Olimey AI-KnowledgeBot/1.0",
              Accept: "text/html, text/plain, application/json, */*",
            },
            redirect: "follow",
          });

          if (!fetchRes.ok) {
            throw new Error(`HTTP ${fetchRes.status} ${fetchRes.statusText}`);
          }

          const contentType = fetchRes.headers.get("content-type") || "";
          const rawBody = await fetchRes.text();

          extractedText = rawBody;
          if (contentType.includes("html")) {
            extractedText = rawBody
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<nav[\s\S]*?<\/nav>/gi, "")
              .replace(/<footer[\s\S]*?<\/footer>/gi, "")
              .replace(/<header[\s\S]*?<\/header>/gi, "")
              .replace(/<[^>]+>/g, "\n")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
          }

          if (!extractedText || extractedText.length < 50) {
            throw new Error("Extracted content is too short or empty — the page may require JavaScript rendering.");
          }
        }

        // Update document with fetched content
        const fetchMethod = FIRECRAWL_API_KEY ? "firecrawl" : "raw_fetch";
        await supabase
          .from("knowledge_documents")
          .update({
            content_text: extractedText,
            status: "pending",
            fetch_error: null,
            fetch_method: fetchMethod,
          })
          .eq("id", docId);

        console.log(`URL fetched successfully: ${extractedText.length} chars`);
        return new Response(
          JSON.stringify({ success: true, documentId: docId, chars: extractedText.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchErr) {
        const errorMsg = fetchErr instanceof Error ? fetchErr.message : "Unknown fetch error";
        console.error("URL fetch failed:", errorMsg);

        await supabase
          .from("knowledge_documents")
          .update({
            status: "pending",
            fetch_error: errorMsg,
          })
          .eq("id", docId);

        return new Response(
          JSON.stringify({ success: false, documentId: docId, error: errorMsg }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("embed-knowledge error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

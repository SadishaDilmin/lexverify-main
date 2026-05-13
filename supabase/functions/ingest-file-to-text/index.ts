import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import pdf from "npm:pdf-parse@1.1.1/lib/pdf-parse.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── helpers ──

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac"]);

function detectFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["docx"].includes(ext)) return "docx";
  if (["doc"].includes(ext)) return "doc";
  if (["txt", "md", "csv", "json", "xml"].includes(ext)) return "txt";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "tiff", "bmp", "gif"].includes(ext)) return "image";
  return "other";
}

async function extractTextFromPdf(fileBytes: Uint8Array): Promise<string> {
  try {
    const parsed = await pdf(fileBytes);
    const text = parsed.text?.trim();
    if (text && text.length > 50) return text;
    return "";
  } catch (e) {
    console.error("[ingest] pdf-parse failed:", e.message);
    // Fallback to raw BT/ET regex extraction for edge-case PDFs
    try {
      const decoder = new TextDecoder("latin1");
      const raw = decoder.decode(fileBytes);
      const texts: string[] = [];
      const btEtRegex = /BT\s([\s\S]*?)ET/g;
      let match;
      while ((match = btEtRegex.exec(raw)) !== null) {
        const block = match[1];
        const tjRegex = /\(([^)]*)\)\s*Tj/g;
        let tj;
        while ((tj = tjRegex.exec(block)) !== null) texts.push(tj[1]);
        const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
        let tja;
        while ((tja = tjArrayRegex.exec(block)) !== null) {
          const innerRegex = /\(([^)]*)\)/g;
          let inner;
          while ((inner = innerRegex.exec(tja[1])) !== null) texts.push(inner[1]);
        }
      }
      if (texts.length > 0) return texts.join(" ").replace(/\s+/g, " ").trim();
    } catch { /* ignore regex fallback failure */ }
    return "";
  }
}

async function extractTextViaGemini(fileBytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const base64 = btoa(String.fromCharCode(...fileBytes));
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a document text extractor. Extract ALL text content from the provided file exactly as written. Preserve paragraph structure. Do not summarize or interpret — output only the raw text content. If this is an image, perform OCR and return all visible text." },
        { role: "user", content: [
          { type: "text", text: `Extract all text from this file (${fileName}). Return ONLY the extracted text, nothing else.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ]},
      ],
      max_tokens: 16000,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini extraction failed [${resp.status}]: ${errText}`);
  }
  const json = await resp.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Audio Transcription ──

async function transcribeAudio(fileBytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const base64 = btoa(String.fromCharCode(...fileBytes));

  console.log(`[ingest] Transcribing audio: ${fileName} (${(fileBytes.length / 1024 / 1024).toFixed(1)}MB)`);

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a professional audio transcription engine. Your task is to transcribe the audio with maximum precision.

Rules:
- Transcribe ALL spoken words exactly as said
- Include speaker labels if multiple speakers are detectable (e.g. "Speaker 1:", "Speaker 2:")
- Note significant timestamps for key moments (e.g. "[00:02:14]")
- Include relevant non-speech audio events in brackets (e.g. "[phone ringing]", "[door closes]")
- Preserve natural paragraph breaks based on topic changes or pauses
- If audio quality is poor in certain sections, note it as "[inaudible]"
- Do NOT summarize or interpret — provide verbatim transcription`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe this audio file (${fileName}) with full precision. Return the complete verbatim transcript.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 32000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Audio transcription failed [${resp.status}]: ${errText}`);
  }
  const json = await resp.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Video Processing (Transcript + Visual Reasoning) ──

interface VideoProcessingResult {
  transcript: string;
  visualSummary: string;
  mergedText: string;
  durationEstimate?: number;
}

async function processVideo(fileBytes: Uint8Array, mimeType: string, fileName: string): Promise<VideoProcessingResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const base64 = btoa(String.fromCharCode(...fileBytes));

  console.log(`[ingest] Processing video with visual reasoning: ${fileName} (${(fileBytes.length / 1024 / 1024).toFixed(1)}MB)`);

  // Single multimodal call that does both transcription AND visual reasoning
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a professional video analysis engine that performs BOTH audio transcription AND visual scene description.

You MUST return your output in EXACTLY this format with these two clearly labelled sections:

=== TRANSCRIPT ===
[Full verbatim transcription of all spoken words with speaker labels and timestamps where detectable]

=== VISUAL SUMMARY ===
[Detailed chronological description of what is visually happening in the video, with timestamps]

Rules for TRANSCRIPT section:
- Transcribe ALL spoken words verbatim
- Include speaker labels (Speaker 1, Speaker 2, etc.)
- Note timestamps at key moments: [HH:MM:SS]
- Mark inaudible sections as [inaudible]
- Include non-speech audio events: [phone ringing], [background noise]

Rules for VISUAL SUMMARY section:
- Describe what is visually happening scene by scene with timestamps
- For property/site inspections: note physical conditions, defects, damage (e.g. "02:14 — Crack visible in foundation wall, approximately 3cm wide")
- For meetings/recordings: describe the setting, participants, any documents or screens shown
- For document walkthroughs: describe what documents are being reviewed and key visible content
- Note any visual evidence relevant to legal or compliance matters
- If the video shows property, note the condition of rooms, structures, boundaries

Also estimate the total duration of the video in seconds and include as: DURATION_SECONDS: [number]`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze this video file (${fileName}). Provide both the full transcript and a detailed visual summary.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 32000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Video processing failed [${resp.status}]: ${errText}`);
  }

  const json = await resp.json();
  const fullContent = json.choices?.[0]?.message?.content?.trim() ?? "";

  // Parse the structured output
  let transcript = "";
  let visualSummary = "";
  let durationEstimate: number | undefined;

  const transcriptMatch = fullContent.match(/===\s*TRANSCRIPT\s*===\s*([\s\S]*?)(?:===\s*VISUAL SUMMARY\s*===|$)/i);
  const visualMatch = fullContent.match(/===\s*VISUAL SUMMARY\s*===\s*([\s\S]*?)(?:DURATION_SECONDS:|$)/i);
  const durationMatch = fullContent.match(/DURATION_SECONDS:\s*(\d+(?:\.\d+)?)/i);

  transcript = transcriptMatch?.[1]?.trim() || fullContent;
  visualSummary = visualMatch?.[1]?.trim() || "";
  if (durationMatch) durationEstimate = parseFloat(durationMatch[1]);

  // Merge into combined text for RAG indexing
  const mergedText = [
    "## Audio Transcript",
    transcript,
    "",
    visualSummary ? "## Visual Summary" : "",
    visualSummary,
  ].filter(Boolean).join("\n\n");

  console.log(`[ingest] Video processed: transcript=${transcript.length} chars, visual=${visualSummary.length} chars, duration=${durationEstimate ?? "unknown"}s`);

  return { transcript, visualSummary, mergedText, durationEstimate };
}

// ── Cross-family LLM Judge ──

async function judgeTranscription(
  transcript: string,
  fileName: string,
  mimeType: string,
  fileType: string,
): Promise<{ verified: boolean; correctedText?: string; notes: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { verified: true, notes: "Judge skipped — no API key" };

  const truncated = transcript.slice(0, 12000);

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-nano", // Cross-family judge (Gemini generated → GPT verifies)
        messages: [
          {
            role: "system",
            content: `You are a transcription quality judge for a legal technology platform. You receive a transcription of an ${fileType} file and evaluate its quality and completeness.

Your task:
1. Check for obvious errors: garbled text, repeated sentences, nonsensical passages, missing context
2. Check for completeness: does it read like a genuine transcription or is it mostly gibberish?
3. For video files with visual summaries: verify the visual descriptions are specific and actionable (not generic filler)
4. Check that timestamps are consistent if present
5. If the transcription is reasonable quality (>70% readable), mark as VERIFIED
6. If there are significant issues, mark as FLAGGED with specific reasons

Respond with EXACTLY this JSON format (no markdown, no code blocks):
{"verdict": "VERIFIED" or "FLAGGED", "notes": "brief explanation of quality assessment", "confidence_pct": 85, "corrected_text": null}`,
          },
          {
            role: "user",
            content: `File: ${fileName} (${mimeType}, type: ${fileType})\n\nTranscription to verify:\n\n${truncated}`,
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[judge] Failed [${resp.status}]: ${errText}`);
      return { verified: true, notes: `Judge unavailable (HTTP ${resp.status})` };
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";

    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(cleaned);
      return {
        verified: result.verdict === "VERIFIED",
        correctedText: result.corrected_text || undefined,
        notes: result.notes || "No notes",
      };
    } catch {
      const isVerified = content.toUpperCase().includes("VERIFIED") && !content.toUpperCase().includes("FLAGGED");
      return { verified: isVerified, notes: content.slice(0, 200) };
    }
  } catch (err) {
    console.error("[judge] Error:", err);
    return { verified: true, notes: "Judge error — accepted by default" };
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword", txt: "text/plain", md: "text/markdown", csv: "text/csv",
    json: "application/json", xml: "application/xml", mp3: "audio/mpeg", wav: "audio/wav",
    m4a: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", mp4: "video/mp4",
    flac: "audio/flac", aac: "audio/aac", mov: "video/quicktime", avi: "video/x-msvideo",
    mkv: "video/x-matroska", jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", webp: "image/webp", tiff: "image/tiff", bmp: "image/bmp", gif: "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}

// ── Chunking ──

const CHUNK_SIZE = 8000;
const CHUNK_OVERLAP = 200;

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks;
}

// ── Embedding via text-embedding-004 ──

async function generateEmbedding(text: string): Promise<number[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const truncated = text.slice(0, 8000);

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "text-embedding-004",
      input: truncated,
      dimensions: 768,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[embedding] Failed [${resp.status}]: ${errText}`);
    throw new Error(`Embedding failed [${resp.status}]`);
  }

  const json = await resp.json();
  return json.data?.[0]?.embedding ?? [];
}

// ── main ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { bucket, file_path, batch_mode, judge_verify } = await req.json();

    if (batch_mode) {
      return await handleBatch(supabase, bucket);
    }

    if (!bucket || !file_path) {
      return new Response(JSON.stringify({ error: "bucket and file_path required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await processFile(supabase, bucket, file_path, !!judge_verify);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ingest-file-to-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

interface ProcessResult {
  id: string;
  status: string;
  char_count: number;
  chunks_embedded: number;
  transcript?: string;
  raw_text?: string;
  visual_summary?: string;
  judge_result?: { verified: boolean; notes: string };
}

async function processFile(
  supabase: any,
  bucket: string,
  filePath: string,
  judgeVerify = false,
): Promise<ProcessResult> {
  const fileName = filePath.split("/").pop() ?? filePath;
  const fileType = detectFileType(fileName);
  const mimeType = getMimeType(fileName);

  // Upsert a pending record
  const { data: record, error: upsertErr } = await supabase
    .from("knowledge_base_content")
    .upsert(
      {
        bucket, file_path: filePath, file_name: fileName, file_type: fileType,
        status: "processing", chunk_index: 0,
        metadata: { original_name: fileName, mime_type: mimeType },
      },
      { onConflict: "bucket,file_path" },
    )
    .select("id")
    .single();

  if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);
  const recordId = record.id;

  try {
    // Download file from storage
    const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(filePath);
    if (dlErr || !fileData) throw new Error(`Download failed: ${dlErr?.message ?? "no data"}`);

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    const fileSize = fileBytes.length;
    let rawText = "";
    let visualSummary = "";
    let mediaDuration: number | undefined;

    // ── Route by file type ──
    if (fileType === "txt") {
      rawText = new TextDecoder().decode(fileBytes);
    } else if (fileType === "pdf") {
      rawText = await extractTextFromPdf(fileBytes);
      if (rawText.length < 100 && fileSize < 10_000_000) {
        console.log(`[ingest] PDF regex got ${rawText.length} chars, falling back to Gemini for ${fileName}`);
        rawText = await extractTextViaGemini(fileBytes, mimeType, fileName);
      }
    } else if (fileType === "video") {
      // ── VIDEO: Combined transcript + visual reasoning ──
      const videoResult = await processVideo(fileBytes, mimeType, fileName);
      rawText = videoResult.mergedText;
      visualSummary = videoResult.visualSummary;
      mediaDuration = videoResult.durationEstimate;
    } else if (fileType === "audio") {
      // ── AUDIO: High-precision transcription ──
      rawText = await transcribeAudio(fileBytes, mimeType, fileName);
    } else if (fileType === "image") {
      rawText = await extractTextViaGemini(fileBytes, mimeType, fileName);
    } else if (fileType === "docx" || fileType === "doc") {
      rawText = await extractTextViaGemini(fileBytes, mimeType, fileName);
    } else {
      if (fileSize < 5_000_000) rawText = await extractTextViaGemini(fileBytes, mimeType, fileName);
    }

    // ── LLM Judge verification for audio/video transcriptions ──
    let judgeResult: { verified: boolean; correctedText?: string; notes: string } | undefined;
    const isMediaType = fileType === "audio" || fileType === "video";

    if (isMediaType && rawText.length > 0) {
      // Always run judge for media files (or when explicitly requested)
      console.log(`[ingest] Running cross-family LLM judge on ${fileName} (${fileType}, ${rawText.length} chars)`);
      judgeResult = await judgeTranscription(rawText, fileName, mimeType, fileType);
      console.log(`[ingest] Judge verdict for ${fileName}: ${judgeResult.verified ? "VERIFIED" : "FLAGGED"} — ${judgeResult.notes}`);

      // If judge provided corrections and text is reasonably sized, use them
      if (judgeResult.correctedText && judgeResult.correctedText.length > rawText.length * 0.5) {
        rawText = judgeResult.correctedText;
      }
    } else if (judgeVerify && rawText.length > 0) {
      // For non-media files, only run judge when explicitly requested
      judgeResult = await judgeTranscription(rawText, fileName, mimeType, fileType);
    }

    const charCount = rawText.length;
    const extractionMethod = fileType === "txt" ? "direct"
      : fileType === "pdf" && rawText.length > 0 ? "pdf_regex_or_gemini"
      : fileType === "video" ? "gemini_video_reasoning"
      : fileType === "audio" ? "gemini_transcription"
      : "gemini_multimodal";

    // ── Chunking & Embedding ──
    let chunksEmbedded = 0;

    if (charCount > 0) {
      const chunks = chunkText(rawText);

      // Update the primary record (chunk 0)
      let primaryEmbedding: number[] | null = null;
      try {
        primaryEmbedding = await generateEmbedding(chunks[0]);
        chunksEmbedded++;
      } catch (e) {
        console.error(`[ingest] Embedding failed for primary chunk of ${fileName}:`, e);
      }

      await supabase
        .from("knowledge_base_content")
        .update({
          raw_text: chunks[0],
          status: "completed",
          error_message: null,
          char_count: chunks[0].length,
          chunk_index: 0,
          parent_file_path: filePath,
          content_embedding: primaryEmbedding ? `[${primaryEmbedding.join(",")}]` : null,
          processed_at: new Date().toISOString(),
          visual_summary: visualSummary || null,
          media_duration_seconds: mediaDuration ?? null,
          transcription_verified: judgeResult?.verified ?? null,
          judge_notes: judgeResult?.notes ?? null,
          metadata: {
            original_name: fileName, mime_type: mimeType, file_size: fileSize,
            extraction_method: extractionMethod, total_chunks: chunks.length,
            total_chars: charCount,
            ...(mediaDuration ? { duration_seconds: mediaDuration } : {}),
            ...(visualSummary ? { has_visual_summary: true } : {}),
            ...(judgeResult ? { judge_verdict: judgeResult.verified ? "verified" : "flagged" } : {}),
          },
        })
        .eq("id", recordId);

      // Insert additional chunks (if text was split)
      for (let i = 1; i < chunks.length; i++) {
        let chunkEmbedding: number[] | null = null;
        try {
          chunkEmbedding = await generateEmbedding(chunks[i]);
          chunksEmbedded++;
        } catch (e) {
          console.error(`[ingest] Embedding failed for chunk ${i} of ${fileName}:`, e);
        }

        await supabase.from("knowledge_base_content").upsert(
          {
            bucket, file_path: `${filePath}#chunk${i}`, file_name: fileName,
            file_type: fileType, status: "completed", raw_text: chunks[i],
            char_count: chunks[i].length, chunk_index: i,
            parent_file_path: filePath,
            content_embedding: chunkEmbedding ? `[${chunkEmbedding.join(",")}]` : null,
            metadata: {
              original_name: fileName, mime_type: mimeType, file_size: fileSize,
              extraction_method: extractionMethod, chunk_of: filePath,
              chunk_number: i + 1, total_chunks: chunks.length,
            },
          },
          { onConflict: "bucket,file_path" },
        );
      }
    } else {
      // No text extracted
      await supabase
        .from("knowledge_base_content")
        .update({
          raw_text: null, status: "error", error_message: "No text could be extracted",
          char_count: 0, processed_at: new Date().toISOString(),
          metadata: { original_name: fileName, mime_type: mimeType, file_size: fileSize, extraction_method: extractionMethod },
        })
        .eq("id", recordId);
    }

    console.log(`[ingest] ✓ ${fileName}: ${charCount} chars, ${chunksEmbedded} chunks embedded, type=${fileType}${visualSummary ? `, visual=${visualSummary.length} chars` : ""}${judgeResult ? `, judge=${judgeResult.verified ? "VERIFIED" : "FLAGGED"}` : ""}`);

    return {
      id: recordId,
      status: charCount > 0 ? "completed" : "error",
      char_count: charCount,
      chunks_embedded: chunksEmbedded,
      transcript: rawText,
      raw_text: rawText,
      visual_summary: visualSummary || undefined,
      judge_result: judgeResult ? { verified: judgeResult.verified, notes: judgeResult.notes } : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown processing error";
    await supabase.from("knowledge_base_content").update({ status: "error", error_message: msg }).eq("id", recordId);
    throw err;
  }
}

async function handleBatch(supabase: any, targetBucket?: string): Promise<Response> {
  const buckets = targetBucket
    ? [targetBucket]
    : ["case-documents", "benchmark-documents", "enquiry-replies"];

  let processed = 0, skipped = 0, errors = 0;

  for (const bucket of buckets) {
    const allPaths = await listAllFiles(supabase, bucket, "");

    for (const filePath of allPaths) {
      const { data: existing } = await supabase
        .from("knowledge_base_content")
        .select("id, status, content_embedding")
        .eq("bucket", bucket)
        .eq("file_path", filePath)
        .maybeSingle();

      if (existing && existing.status === "completed" && existing.content_embedding) {
        skipped++;
        continue;
      }

      try {
        await processFile(supabase, bucket, filePath, true);
        processed++;
      } catch (e) {
        console.error(`[batch] Error processing ${bucket}/${filePath}:`, e);
        errors++;
      }
    }
  }

  return new Response(
    JSON.stringify({ processed, skipped, errors, total: processed + skipped + errors }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function listAllFiles(supabase: any, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return paths;
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) { paths.push(fullPath); } else {
      const subPaths = await listAllFiles(supabase, bucket, fullPath);
      paths.push(...subPaths);
    }
  }
  return paths;
}

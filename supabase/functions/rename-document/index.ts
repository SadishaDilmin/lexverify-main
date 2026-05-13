import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Analyses a document's content using Gemini multimodal and suggests a descriptive filename.
 * Supports images and PDFs.
 */
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
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json();
    // mode: "suggest" (default) = return AI suggestion without renaming
    //        "apply"           = apply the approved_name rename
    const { case_id, folder, file_name, mode, approved_name } = body;

    if (!case_id || !folder || !file_name) {
      return new Response(
        JSON.stringify({ error: "case_id, folder, and file_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify user owns the case
    const { data: caseData, error: caseErr } = await supabase
      .from("cases")
      .select("id")
      .eq("id", case_id)
      .single();

    if (caseErr || !caseData) {
      return new Response(JSON.stringify({ error: "Case not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storagePath = `${case_id}/${folder}/${file_name}`;

    // ── APPLY MODE: user approved a name, just do the rename ──
    if (mode === "apply" && approved_name) {
      const ext = file_name.includes(".") ? file_name.substring(file_name.lastIndexOf(".")) : "";
      const sanitized = approved_name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
      if (!sanitized || sanitized.length < 3) {
        return new Response(
          JSON.stringify({ error: "Invalid approved name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const newFileName = `${sanitized}${ext}`;
      if (newFileName === file_name) {
        return new Response(
          JSON.stringify({ renamed: false, message: "File already has this name", file_name }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Download the file for re-upload
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("case-documents").download(storagePath);
      if (dlErr || !fileData) {
        return new Response(JSON.stringify({ error: "Failed to download file" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mimeType = fileData.type || "application/octet-stream";
      const arrayBuffer = await fileData.arrayBuffer();

      // Handle collision
      const { data: existingFiles } = await supabase.storage
        .from("case-documents").list(`${case_id}/${folder}`, { limit: 500 });

      let finalFileName = newFileName;
      let newStoragePath = `${case_id}/${folder}/${newFileName}`;
      if (existingFiles?.some((f) => f.name === newFileName)) {
        const ts = Date.now().toString().slice(-6);
        finalFileName = `${sanitized}_${ts}${ext}`;
        newStoragePath = `${case_id}/${folder}/${finalFileName}`;
      }

      const { error: uploadErr } = await supabase.storage
        .from("case-documents")
        .upload(newStoragePath, new Uint8Array(arrayBuffer), { contentType: mimeType, upsert: false });

      if (uploadErr) {
        return new Response(
          JSON.stringify({ error: `Failed to rename: ${uploadErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase.storage.from("case-documents").remove([storagePath]);
      await supabase.from("documents").update({
        file_name: finalFileName, file_path: newStoragePath, original_file_name: file_name,
      } as any).eq("file_path", storagePath);

      return new Response(
        JSON.stringify({ renamed: true, original_name: file_name, new_name: finalFileName, new_path: newStoragePath }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── SUGGEST MODE (default): analyse document and return suggested name ──

    // Download the file
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("case-documents")
      .download(storagePath);

    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get file extension
    const ext = file_name.includes(".") ? file_name.substring(file_name.lastIndexOf(".")) : "";
    const mimeType = fileData.type || "application/octet-stream";

    // Convert to base64 for multimodal analysis
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
    );

    // Check size — skip if > 4MB base64
    if (base64.length > 4_000_000) {
      return new Response(
        JSON.stringify({ error: "File too large for AI analysis (max ~3MB)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the AI prompt
    const isImage = /^image\//i.test(mimeType);
    const isPdf = /pdf/i.test(mimeType);

    const systemPrompt = `You are a UK conveyancing document classifier. You will be shown a document (image or PDF). Your task is to identify the document type and generate a short, descriptive filename (without extension) that accurately reflects the document's content.

Rules:
- The filename should be concise but descriptive (3-8 words max)
- Use Title_Case with underscores between words
- Include key identifiers like property address snippets, party names, or document type
- Examples of good names: "Title_Register_12_Oak_Lane", "Local_Authority_Search_Result", "Bank_Statement_Jan_2025", "Passport_John_Smith", "EPC_Certificate_Grade_C", "Draft_Contract_Sale"
- Do NOT include the file extension
- Do NOT include generic prefixes like "Document" or "File"
- If the document is unreadable or blank, respond with "Unreadable_Document"

Respond with ONLY the suggested filename. Nothing else.`;

    const userContent: any[] = [];
    if (isImage || isPdf) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }
    userContent.push({
      type: "text",
      text: `Original filename: "${file_name}". Folder category: "${folder}". Analyse this document and suggest a descriptive filename.`,
    });

    // Call Lovable AI (Gemini for multimodal)
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 100,
        temperature: 0,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let suggestedName = (aiData?.choices?.[0]?.message?.content || "").trim();

    // Sanitize the suggested name
    suggestedName = suggestedName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    if (!suggestedName || suggestedName.length < 3) {
      return new Response(
        JSON.stringify({ error: "AI could not determine a suitable name", original: file_name }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Stage 2: Cross-family LLM Judge (OpenAI) ──
    const judgePrompt = `You are a quality-assurance judge for a UK conveyancing document renaming system.

A previous AI analysed a document and suggested the filename: "${suggestedName}"
The original filename was: "${file_name}"
The document is in the "${folder}" folder category.

Your task:
1. Examine the document content carefully.
2. Determine if the suggested filename "${suggestedName}" accurately describes the document's actual content.
3. Check for hallucinated details — addresses, names, dates, or document types that are NOT clearly visible in the document.

Rules:
- If the suggested name is accurate, return it unchanged.
- If the suggested name contains hallucinated or incorrect details, provide a corrected filename.
- Use Title_Case with underscores. 3-8 words max. No file extension.
- If the document is genuinely unreadable, return "Unreadable_Document".
- Do NOT invent details not clearly visible in the document.

Respond with ONLY the final approved filename. Nothing else.`;

    const judgeContent: any[] = [];
    if (isImage || isPdf) {
      judgeContent.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }
    judgeContent.push({
      type: "text",
      text: `Verify this suggested filename: "${suggestedName}" for the document above. Original filename: "${file_name}".`,
    });

    const judgeRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: judgePrompt },
          { role: "user", content: judgeContent },
        ],
        max_tokens: 100,
        temperature: 0,
      }),
    });

    if (judgeRes.ok) {
      const judgeData = await judgeRes.json();
      const judgedName = (judgeData?.choices?.[0]?.message?.content || "").trim()
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .replace(/\s+/g, "_");

      if (judgedName && judgedName.length >= 3) {
        console.log(`Judge review: "${suggestedName}" → "${judgedName}"`);
        suggestedName = judgedName;
      }
    } else {
      console.warn("Judge call failed, proceeding with original suggestion:", judgeRes.status);
    }

    const newFileName = `${suggestedName}${ext}`;

    // Don't rename if it's the same
    if (newFileName === file_name) {
      return new Response(
        JSON.stringify({ renamed: false, message: "File already has a descriptive name", file_name }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Return the suggestion for user approval (do NOT rename yet)
    return new Response(
      JSON.stringify({
        suggestion: true,
        original_name: file_name,
        suggested_name: suggestedName,
        suggested_file_name: newFileName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("rename-document error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file, existingFiles } = await req.json();

    if (!file || !existingFiles || !Array.isArray(existingFiles)) {
      return new Response(
        JSON.stringify({ error: "file and existingFiles are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const existingList = existingFiles
      .map((f: any, i: number) => `${i + 1}. "${f.name}" — Category: ${f.category}, Person: ${f.personName || "N/A"}, Description: ${f.description || "N/A"}`)
      .join("\n");

    const prompt = `You are an AML document deduplication assistant. A user is trying to add a renamed document to their case.

The renamed file is: "${file.name}" (type: ${file.mimeType})

Here are the existing documents already in this case:
${existingList}

Your task:
1. Compare the renamed file's name against all existing files
2. Determine if this file is likely a duplicate of any existing document based on:
   - Filename similarity (e.g., same name with minor differences, same base name with different extension)
   - If the name strongly suggests the same document content as an existing one
3. Be lenient: if the user has clearly renamed the file to be distinct, allow it
4. Only flag as duplicate if the new name is still very similar to an existing document name or clearly refers to the same document

Respond using the provided tool.`;

    const { chat, extractToolArgs } = await import("../_shared/aiGateway.ts");

    let args: any;
    try {
      const resp = await chat({
        model: "openai/gpt-5-nano",
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "check_duplicate",
              description: "Check if a file is a duplicate of existing documents",
              parameters: {
                type: "object",
                properties: {
                  is_duplicate: {
                    type: "boolean",
                    description: "true if the file appears to be a duplicate of an existing document",
                  },
                  matched_file: {
                    type: "string",
                    description: "Name of the existing file it matches, or empty string if not a duplicate",
                  },
                  reason: {
                    type: "string",
                    description: "Brief explanation of why it is or isn't a duplicate",
                  },
                },
                required: ["is_duplicate", "matched_file", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "check_duplicate" } },
      }, "check-duplicate-doc");

      args = extractToolArgs(resp);
      if (!args) {
        return new Response(
          JSON.stringify({ isDuplicate: false, reason: "Could not parse check result — file allowed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (err: any) {
      console.error("Duplicate check AI error:", err);
      return new Response(
        JSON.stringify({ isDuplicate: false, reason: "Duplicate check unavailable — file allowed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        isDuplicate: args.is_duplicate || false,
        matchedFile: args.matched_file || "",
        reason: args.reason || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-duplicate-doc error:", err);
    return new Response(
      JSON.stringify({ isDuplicate: false, reason: "Error — file allowed by default" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

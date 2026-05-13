import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function unauthorizedResponse(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    // Public endpoint: insights articles are public, so no auth required.
    const { text, voiceId, slug } = await req.json();

    if (!text || typeof text !== "string" || text.length < 10) {
      return new Response(JSON.stringify({ error: "Text is required (min 10 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check cache if slug provided
    if (slug && typeof slug === "string") {
      const filePath = `${slug}.mp3`;
      const { data: existing } = await supabase.storage
        .from("article-audio")
        .createSignedUrl(filePath, 60); // just to check existence

      if (existing?.signedUrl) {
        // File exists — return public URL
        const { data: publicUrl } = supabase.storage
          .from("article-audio")
          .getPublicUrl(filePath);

        console.log("Cache hit for slug:", slug);
        return new Response(JSON.stringify({ cachedUrl: publicUrl.publicUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Cap text length to prevent abuse
    const cappedText = text.slice(0, 15000);

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    // Step 1: Rewrite article into conversational narration script using AI Gateway
    const { chat, extractContent } = await import("../_shared/aiGateway.ts");

    let narrationScript = cappedText;
    try {
      const rewriteResp = await chat({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a professional British narrator preparing an article for audio narration. Rewrite the following article text into a smooth, conversational narration script suitable for text-to-speech.

Rules:
- Remove all markdown formatting (headers, bold, links, list markers, bullet points)
- Convert lists into flowing sentences
- Add natural spoken transitions between sections (e.g. "Now, let's look at...", "What's particularly interesting here is...")
- Add emphasis cues through word choice and sentence rhythm — use shorter punchy sentences for impact, longer flowing ones for explanation
- Keep the tone warm, professional, and authoritative — like a knowledgeable colleague explaining the topic
- Do NOT add any stage directions, sound effects, or meta-commentary
- Do NOT start with "Welcome" or introduce yourself
- Begin directly with the content, perhaps with an engaging opening line
- Keep the meaning and facts exactly the same
- Output ONLY the narration script text, nothing else`,
          },
          { role: "user", content: cappedText },
        ],
      }, "article-tts-rewrite");

      narrationScript = extractContent(rewriteResp) || cappedText;
    } catch (err: any) {
      console.error("AI rewrite failed:", err);
      if (err.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (err.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fall through with original text as narration
    }

    // Cap narration to ElevenLabs limit (~5000 chars safe max)
    const cappedNarration = narrationScript.slice(0, 4900);
    console.log("Narration script length:", narrationScript.length, "→ capped to:", cappedNarration.length);

    // Step 2: Send to ElevenLabs TTS
    const selectedVoice = voiceId || "Xb7hH8MSUJpSbSDYk0k2"; // Alice (British female)

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cappedNarration,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.6,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error("ElevenLabs TTS failed:", ttsResponse.status, errText);
      throw new Error(`TTS generation failed: ${ttsResponse.status}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    // Step 3: Cache in storage if slug provided
    if (slug && typeof slug === "string") {
      const filePath = `${slug}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from("article-audio")
        .upload(filePath, audioBuffer, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("Failed to cache audio:", uploadError.message);
        // Non-fatal — still return the audio
      } else {
        console.log("Cached audio for slug:", slug);
      }
    }

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (e) {
    console.error("article-tts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

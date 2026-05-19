// Transcribe audio using Lovable AI Gateway (Whisper)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BASE64_BYTES = 6 * 1024 * 1024; // ~4.5MB audio
const ALLOWED_MIMES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
]);


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.audio !== "string" || typeof body.mimeType !== "string") {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audio, mimeType } = body;
    const language: string | undefined =
      body.language === "pt" ? "pt" : body.language === "en" ? "en" : undefined;

    const baseMime = mimeType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIMES.has(mimeType.toLowerCase()) && !ALLOWED_MIMES.has(baseMime)) {
      return new Response(JSON.stringify({ error: `Unsupported mime type: ${mimeType}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audio.length > MAX_BASE64_BYTES) {
      return new Response(JSON.stringify({ error: "Audio too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formatMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/m4a": "mp4",
      "audio/x-m4a": "mp4",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const audioFormat = formatMap[baseMime] ?? "webm";

    const langInstr = language === "pt"
      ? "The audio is in Portuguese (pt-BR or pt-PT)."
      : language === "en"
        ? "The audio is in English."
        : "Detect the spoken language.";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a speech-to-text transcription engine. Return ONLY the verbatim transcription of the audio as plain text. No quotes, no labels, no commentary, no markdown. If there is no speech, return an empty string.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Transcribe this audio. ${langInstr}` },
              {
                type: "input_audio",
                input_audio: { data: audio, format: audioFormat },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("[transcribe-audio] AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "no_credits" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "transcription_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const text = (data?.choices?.[0]?.message?.content ?? "").toString().trim();

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[transcribe-audio] error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

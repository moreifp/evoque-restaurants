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

    // Transcrição pelo ElevenLabs (Scribe). Chave no segredo ELEVENLABS_API_KEY.
    const ELEVEN = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVEN) {
      return new Response(JSON.stringify({ error: "transcription_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("model_id", "scribe_v1");
    if (language === "pt") form.append("language_code", "por");
    else if (language === "en") form.append("language_code", "eng");
    form.append("tag_audio_events", "false");
    form.append("file", new Blob([bytes], { type: baseMime || "audio/webm" }), "audio");
    const aiResp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVEN },
      body: form,
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("[transcribe-audio] elevenlabs error", aiResp.status, errText.slice(0, 300));
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 401 || aiResp.status === 402) {
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
    const text = (data?.text ?? "").toString().trim();

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

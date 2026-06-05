// Serves Open Graph HTML for shared restaurant links.
// Bots get rich meta tags; humans get a 302 to the SPA.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const APP_URL = "https://food.evoque.guru";
const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

const BOT_UA_RE = /facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|linkedinbot|discordbot|telegrambot|whatsapp|skypeuripreview|applebot|googlebot|bingbot|redditbot|pinterest|embedly|quora|outbrain|vkshare|w3c_validator|baiduspider|yandex|imessagebot/i;

function isBot(ua: string): boolean {
  return BOT_UA_RE.test(ua || "");
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface PreviewData {
  entry_id: string;
  name: string;
  city: string | null;
  rating: number | null;
  author: string | null;
  has_photo: boolean;
  is_private: boolean;
  language: "pt" | "en";
}

async function loadPreview(supabase: ReturnType<typeof createClient>, entryId: string): Promise<PreviewData | null> {
  const { data: entry, error } = await supabase
    .from("restaurant_entries")
    .select("id, restaurant_name, location_address, rating, user_id, is_draft")
    .eq("id", entryId)
    .maybeSingle();

  if (error || !entry || entry.is_draft) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, profile_visibility")
    .eq("id", entry.user_id)
    .maybeSingle();

  const isPrivate = (profile?.profile_visibility ?? "public") === "private";

  const { count } = await supabase
    .from("restaurant_photos")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", entryId)
    .neq("type", "receipt");

  return {
    entry_id: entry.id,
    name: entry.restaurant_name ?? "",
    city: entry.location_address ?? null,
    rating: entry.rating ?? null,
    author: isPrivate ? null : profile?.display_name ?? null,
    has_photo: (count ?? 0) > 0,
    is_private: isPrivate,
    language: "pt", // App is primarily PT; per-user language pref not stored.
  };
}

function buildHtml(data: PreviewData, canonical: string, imageUrl: string): string {
  const pt = data.language === "pt";

  const title = data.is_private
    ? (pt ? "Restaurante compartilhado · Evoque" : "Shared restaurant · Evoque")
    : (pt ? `Veja o restaurante ${data.name}` : `Check out ${data.name}`);

  const parts: string[] = [];
  if (data.rating) parts.push(`★ ${data.rating.toFixed(1)}`);
  if (data.city) parts.push(data.city);
  if (data.author) parts.push(pt ? `por ${data.author}` : `by ${data.author}`);
  const description = parts.length
    ? parts.join(" · ")
    : (pt ? "Descoberta gastronômica no Evoque" : "A culinary discovery on Evoque");

  return `<!DOCTYPE html>
<html lang="${data.language}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Evoque" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(imageUrl)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(title)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(imageUrl)}" />

<meta http-equiv="refresh" content="0; url=${esc(canonical)}" />
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;background:#0F172A;color:#fff;">
<p>${esc(pt ? "Redirecionando para" : "Redirecting to")} <a style="color:#7dd3fc" href="${esc(canonical)}">${esc(canonical)}</a>…</p>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const tokenParam = url.searchParams.get("token");
  let entryId = url.searchParams.get("entry_id");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve token → entry_id
  if (!entryId && tokenParam) {
    const { data: tokenRow } = await supabase
      .from("share_tokens")
      .select("entry_id, expires_at")
      .eq("token", tokenParam.trim().toLowerCase())
      .maybeSingle();

    if (tokenRow && (!tokenRow.expires_at || new Date(tokenRow.expires_at) > new Date())) {
      entryId = tokenRow.entry_id as string;
    }
  }

  if (!entryId) {
    return Response.redirect(`${APP_URL}/token`, 302);
  }

  const canonical = tokenParam
    ? `${APP_URL}/s/${tokenParam}`
    : `${APP_URL}/share/${entryId}`;

  const ua = req.headers.get("user-agent") ?? "";
  console.log("share-og UA:", ua, "isBot:", isBot(ua), "entry:", entryId);

  // Humans: bounce to the SPA. Bots: serve OG HTML.
  if (!isBot(ua)) {
    return Response.redirect(canonical, 302);
  }

  const data = await loadPreview(supabase, entryId);
  if (!data) {
    return Response.redirect(`${APP_URL}/`, 302);
  }

  const imageUrl = `${FUNCTIONS_URL}/share-og-image?entry_id=${encodeURIComponent(entryId)}`;
  const html = buildHtml(data, canonical, imageUrl);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

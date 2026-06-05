// Generates a branded 1200x630 PNG preview for shared restaurant links.
// Uses Satori for layout + resvg-wasm for SVG→PNG rasterization.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import satori, { init as initYoga } from "https://esm.sh/satori@0.10.13/wasm";
import initYogaWasm from "https://esm.sh/yoga-wasm-web@0.3.3";
import { Resvg, initWasm as initResvg } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

// One-shot wasm + font initialization, kept across isolate warm invocations.
let initialized = false;
let interRegular: ArrayBuffer | null = null;
let interBold: ArrayBuffer | null = null;

async function ensureInit() {
  if (initialized) return;

  const [yogaWasm, resvgWasm, regular, bold] = await Promise.all([
    fetch("https://unpkg.com/yoga-wasm-web@0.3.3/dist/yoga.wasm").then((r) => r.arrayBuffer()),
    fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm").then((r) => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff").then((r) => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff").then((r) => r.arrayBuffer()),
  ]);

  const yoga = await initYogaWasm(yogaWasm);
  initYoga(yoga);
  await initResvg(resvgWasm);

  interRegular = regular;
  interBold = bold;
  initialized = true;
}

interface PreviewData {
  name: string;
  city: string | null;
  rating: number | null;
  author: string | null;
  photo_url: string | null;
  is_private: boolean;
}

async function loadPreview(supabase: ReturnType<typeof createClient>, entryId: string): Promise<PreviewData | null> {
  const { data: entry } = await supabase
    .from("restaurant_entries")
    .select("id, restaurant_name, location_address, rating, user_id, is_draft")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry || entry.is_draft) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, profile_visibility")
    .eq("id", entry.user_id)
    .maybeSingle();

  const isPrivate = (profile?.profile_visibility ?? "public") === "private";

  // Prefer 'food' type, fall back to any non-receipt photo
  const { data: photos } = await supabase
    .from("restaurant_photos")
    .select("photo_url, type")
    .eq("entry_id", entryId)
    .neq("type", "receipt")
    .order("created_at", { ascending: true });

  const food = photos?.find((p) => p.type === "food");
  const photo = food ?? photos?.[0] ?? null;

  return {
    name: entry.restaurant_name ?? "",
    city: entry.location_address ?? null,
    rating: entry.rating ?? null,
    author: isPrivate ? null : profile?.display_name ?? null,
    photo_url: photo?.photo_url ?? null,
    is_private: isPrivate,
  };
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch {
    return null;
  }
}

function renderStars(rating: number | null): string {
  if (!rating) return "";
  const full = Math.round(rating);
  return "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full));
}

function buildTree(data: PreviewData, photoDataUrl: string | null): any {
  const displayName = data.is_private ? "Restaurante compartilhado" : (data.name || "Evoque");
  const metaParts: string[] = [];
  if (data.rating) metaParts.push(`${renderStars(data.rating)}  ${data.rating.toFixed(1)}`);
  if (data.city && !data.is_private) metaParts.push(data.city);
  const meta = metaParts.join("   ·   ");
  const footer = data.is_private
    ? "Evoque · food.evoque.guru"
    : data.author
      ? `Compartilhado por ${data.author}  ·  Evoque`
      : "Evoque · food.evoque.guru";

  const background = photoDataUrl
    ? {
        type: "img",
        props: {
          src: photoDataUrl,
          width: 1200,
          height: 630,
          style: { position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", objectFit: "cover" },
        },
      }
    : {
        type: "div",
        props: {
          style: {
            position: "absolute", top: 0, left: 0, width: "1200px", height: "630px",
            backgroundImage: "linear-gradient(135deg, #6b8e23, #4d8a4d, #2f8a73, #2c7d8a)",
            display: "flex",
          },
        },
      };

  const overlay = {
    type: "div",
    props: {
      style: {
        position: "absolute", top: 0, left: 0, width: "1200px", height: "630px",
        backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.85) 100%)",
        display: "flex",
      },
    },
  };

  const content = {
    type: "div",
    props: {
      style: {
        position: "absolute", inset: 0, padding: "60px 70px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        color: "white",
      },
      children: [
        // Top: Evoque badge
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", opacity: 0.95 },
            children: "Evoque",
          },
        },
        // Bottom: name + meta + footer
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 18 },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, textShadow: "0 2px 20px rgba(0,0,0,0.4)" },
                  children: displayName,
                },
              },
              meta ? {
                type: "div",
                props: {
                  style: { fontSize: 34, fontWeight: 400, opacity: 0.95 },
                  children: meta,
                },
              } : null,
              {
                type: "div",
                props: {
                  style: { fontSize: 24, fontWeight: 400, opacity: 0.75, marginTop: 6 },
                  children: footer,
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };

  return {
    type: "div",
    props: {
      style: { position: "relative", display: "flex", width: "1200px", height: "630px", backgroundColor: "#0F172A" },
      children: [background, overlay, content],
    },
  };
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

  const entryId = url.searchParams.get("entry_id");
  if (!entryId) {
    return new Response("Missing entry_id", { status: 400 });
  }

  try {
    await ensureInit();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const data = await loadPreview(supabase, entryId);
    if (!data) {
      return new Response("Not found", { status: 404 });
    }

    const photoDataUrl = data.photo_url ? await fetchImageAsDataUrl(data.photo_url) : null;
    const tree = buildTree(data, photoDataUrl);

    const svg = await satori(tree, {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: interRegular!, weight: 400, style: "normal" },
        { name: "Inter", data: interBold!, weight: 700, style: "normal" },
      ],
    });

    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();

    return new Response(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("share-og-image error:", err);
    return new Response(`Render error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
});

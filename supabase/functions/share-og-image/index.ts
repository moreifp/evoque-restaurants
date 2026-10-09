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

function ratingDots(rating: number | null): any[] {
  if (!rating) return [];
  const full = Math.round(rating);
  const dots: any[] = [];
  for (let i = 0; i < 5; i++) {
    dots.push({
      type: "div",
      props: {
        style: {
          width: 14, height: 14, borderRadius: 14,
          marginRight: 6,
          backgroundColor: i < full ? "#FFD166" : "rgba(255,255,255,0.3)",
        },
      },
    });
  }
  return dots;
}

function buildTree(data: PreviewData, photoDataUrl: string | null): any {
  const displayName = data.is_private ? "Restaurante compartilhado" : (data.name || "Evoque");
  const cityText = data.city && !data.is_private ? data.city : "";
  const footer = data.is_private
    ? "Evoque · restaurantes.evoque.global"
    : data.author
      ? `Compartilhado por ${data.author}  ·  Evoque`
      : "Evoque · restaurantes.evoque.global";

  const background = photoDataUrl
    ? {
        type: "img",
        props: {
          src: photoDataUrl,
          width: 1200,
          height: 630,
          style: { position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" },
        },
      }
    : {
        type: "div",
        props: {
          style: {
            position: "absolute", top: 0, left: 0, width: 1200, height: 630,
            backgroundImage: "linear-gradient(135deg, #6b8e23, #4d8a4d, #2f8a73, #2c7d8a)",
            display: "flex",
          },
        },
      };

  const overlay = {
    type: "div",
    props: {
      style: {
        position: "absolute", top: 0, left: 0, width: 1200, height: 630,
        backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.88) 100%)",
        display: "flex",
      },
    },
  };

  // Rating + city row
  const metaChildren: any[] = [];
  if (data.rating) {
    metaChildren.push({
      type: "div",
      props: {
        style: { display: "flex", alignItems: "center", marginRight: 18 },
        children: ratingDots(data.rating),
      },
    });
    metaChildren.push({
      type: "div",
      props: {
        style: { fontSize: 32, fontWeight: 700, marginRight: 18 },
        children: data.rating.toFixed(1),
      },
    });
  }
  if (cityText) {
    if (metaChildren.length) {
      metaChildren.push({
        type: "div",
        props: { style: { fontSize: 32, opacity: 0.6, marginRight: 18 }, children: "·" },
      });
    }
    metaChildren.push({
      type: "div",
      props: {
        style: {
          fontSize: 30, fontWeight: 400, opacity: 0.92,
          maxWidth: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        },
        children: cityText,
      },
    });
  }

  const content = {
    type: "div",
    props: {
      style: {
        position: "absolute", top: 0, left: 0, width: 1200, height: 630,
        padding: "60px 70px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        color: "white",
      },
      children: [
        // Top: Evoque badge
        {
          type: "div",
          props: {
            style: { display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", opacity: 0.95 },
            children: "Evoque",
          },
        },
        // Bottom block
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: 78, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2,
                    maxWidth: 1060,
                    marginBottom: 24,
                  },
                  children: displayName,
                },
              },
              metaChildren.length ? {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", marginBottom: 22 },
                  children: metaChildren,
                },
              } : null,
              {
                type: "div",
                props: {
                  style: { fontSize: 24, fontWeight: 400, opacity: 0.78 },
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
      style: { position: "relative", display: "flex", width: 1200, height: 630, backgroundColor: "#0F172A" },
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

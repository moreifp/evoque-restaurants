// Restaurantes perto do usuário (Places API New), no servidor.
// A chave GOOGLE_PLACES_API_KEY fica só aqui; o app nunca a vê.
//
// Corpo (JSON), um dos modos:
//   { lat, lng, lang? }                 → searchNearby, raio 400 m, ordem por distância
//   { query, lat?, lng?, lang? }        → searchText (busca pelo nome), viés perto do usuário
//   { placeId, lat?, lng?, lang? }      → um lugar pelo id (completar dados vindos da Agenda)
// Resposta: { places: [{ id, name, address, lat, lng, type, distance_m }] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAIO_M = 400;
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName";
const DETAIL_FIELD_MASK = "id,displayName,formattedAddress,location,primaryTypeDisplayName";

// Tipos da Tabela A (Places API New) ligados a comer e beber.
const TIPOS = [
  "restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "wine_bar",
  "pub",
  "bakery",
  "meal_takeaway",
  "fast_food_restaurant",
  "ice_cream_shop",
];

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function coord(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max ? v : null;
}

interface GPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
}

function compact(p: GPlace, lat: number | null, lng: number | null) {
  const plat = p.location?.latitude ?? null;
  const plng = p.location?.longitude ?? null;
  const distance =
    lat !== null && lng !== null && plat !== null && plng !== null
      ? Math.round(haversine(lat, lng, plat, plng))
      : null;
  return {
    id: p.id ?? "",
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    lat: plat,
    lng: plng,
    type: p.primaryTypeDisplayName?.text ?? null,
    distance_m: distance,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      console.error("[nearby-restaurants] GOOGLE_PLACES_API_KEY not configured");
      return json({ error: "Places not configured" }, 500);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const lat = coord(body.lat, 90);
    const lng = coord(body.lng, 180);
    const lang = typeof body.lang === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(body.lang) ? body.lang : "pt-BR";
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";
    const placeId = typeof body.placeId === "string" ? body.placeId : "";

    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    };

    let res: Response;
    if (placeId) {
      if (!PLACE_ID_RE.test(placeId)) return json({ error: "Invalid placeId" }, 400);
      res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(lang)}`,
        { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAIL_FIELD_MASK } },
      );
      if (!res.ok) {
        console.error("[nearby-restaurants] details", res.status, (await res.text()).slice(0, 300));
        return json({ error: "Places error", status: res.status }, 502);
      }
      const p = (await res.json()) as GPlace;
      return json({ places: [compact(p, lat, lng)] });
    }

    if (query) {
      if (query.length < 2) return json({ places: [] });
      const reqBody: Record<string, unknown> = { textQuery: query, languageCode: lang, pageSize: 10 };
      if (lat !== null && lng !== null) {
        reqBody.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } };
      }
      res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers,
        body: JSON.stringify(reqBody),
      });
    } else {
      if (lat === null || lng === null) return json({ error: "lat/lng required" }, 400);
      res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers,
        body: JSON.stringify({
          includedTypes: TIPOS,
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          languageCode: lang,
          locationRestriction: {
            circle: { center: { latitude: lat, longitude: lng }, radius: RAIO_M },
          },
        }),
      });
    }

    if (!res.ok) {
      console.error("[nearby-restaurants] google", res.status, (await res.text()).slice(0, 300));
      return json({ error: "Places error", status: res.status }, 502);
    }
    const data = (await res.json()) as { places?: GPlace[] };
    const places = (data.places ?? [])
      .map((p) => compact(p, lat, lng))
      .filter((p) => p.id && p.name);
    if (!query) places.sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9));
    return json({ places });
  } catch (e) {
    console.error("[nearby-restaurants] error", e);
    return json({ error: "Internal error" }, 500);
  }
});

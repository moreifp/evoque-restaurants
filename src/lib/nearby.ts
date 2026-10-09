/**
 * Localização do aparelho + restaurantes perto (edge function nearby-restaurants,
 * Places API New no servidor). A busca por nome usa a mesma função.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NearbyPlace {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  type: string | null;
  distance_m: number | null;
}

export type GeoResult =
  | { ok: true; lat: number; lng: number; accuracy: number | null }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" };

export function getDevicePosition(timeoutMs = 8000): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }
    let done = false;
    // Safari às vezes nunca chama nenhum callback (permissão pendente no iframe).
    const guard = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, reason: "timeout" });
      }
    }, timeoutMs + 2000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
      },
      (err) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve({ ok: false, reason: err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable" });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

const CACHE_PREFIX = "nearby:";
const CACHE_TTL = 10 * 60 * 1000;

function cacheKey(lat: number, lng: number) {
  // ~50 m de grade: mesma mesa, mesma lista.
  return `${CACHE_PREFIX}${lat.toFixed(4).slice(0, -1)},${lng.toFixed(4).slice(0, -1)}`;
}

function lang(): string {
  try {
    return localStorage.getItem("evoque-language") === "en" ? "en" : "pt-BR";
  } catch {
    return "pt-BR";
  }
}

async function invoke(body: Record<string, unknown>): Promise<NearbyPlace[]> {
  const { data, error } = await supabase.functions.invoke("nearby-restaurants", { body: { ...body, lang: lang() } });
  if (error) throw error;
  const places = (data as { places?: NearbyPlace[] } | null)?.places;
  return Array.isArray(places) ? places : [];
}

export async function fetchNearby(lat: number, lng: number): Promise<NearbyPlace[]> {
  const key = cacheKey(lat, lng);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; places: NearbyPlace[] };
      if (Date.now() - c.at < CACHE_TTL) return c.places;
    }
  } catch {
    /* sem cache */
  }
  const places = await invoke({ lat, lng });
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), places }));
  } catch {
    /* cheio */
  }
  return places;
}

export function searchPlaces(query: string, near?: { lat: number; lng: number } | null): Promise<NearbyPlace[]> {
  return invoke({ query, ...(near ? { lat: near.lat, lng: near.lng } : {}) });
}

export async function placeDetails(placeId: string): Promise<NearbyPlace | null> {
  const list = await invoke({ placeId });
  return list[0] ?? null;
}

export function formatDistance(m: number | null): string {
  if (m === null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

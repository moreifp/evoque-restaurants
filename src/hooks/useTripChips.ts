import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RestaurantEntry } from "@/types";

export interface TripChip {
  key: string;
  label: string;
  entryIds: Set<string>;
  /** visita mais recente (para ordenar) */
  latest: string;
}

interface Viagem {
  nome: string;
  inicio: string;
  fim: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Álbuns do usuário com pelo menos um restaurante. */
async function fetchAlbumGroups(): Promise<Array<{ title: string; entryIds: string[] }>> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("album_entries")
    .select("album_id, entry_id, albums!inner(user_id, title)")
    .eq("albums.user_id", uid);
  if (error) throw error;
  const by = new Map<string, { title: string; entryIds: string[] }>();
  for (const row of (data ?? []) as unknown as Array<{ album_id: string; entry_id: string; albums: { title: string } }>) {
    const g = by.get(row.album_id) ?? { title: row.albums?.title || "Álbum", entryIds: [] };
    g.entryIds.push(row.entry_id);
    by.set(row.album_id, g);
  }
  return [...by.values()];
}

/** Viagens do Evoque Viagens (edge function my-trips), guardadas na sessão. */
async function fetchTrips(): Promise<Viagem[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return [];
  const key = `my-trips:${uid}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Viagem[];
  } catch {
    /* sem cache */
  }
  const { data, error } = await supabase.functions.invoke("my-trips", { body: {} });
  if (error) throw error;
  const viagens = Array.isArray((data as { viagens?: Viagem[] } | null)?.viagens) ? (data as { viagens: Viagem[] }).viagens : [];
  try {
    sessionStorage.setItem(key, JSON.stringify(viagens));
  } catch {
    /* cheio */
  }
  return viagens;
}

/**
 * Chips de viagem da aba Restaurantes: álbuns com restaurantes + viagens do
 * Evoque Viagens (restaurantes com visita entre início e fim). Mesmo nome →
 * um chip só. Sem viagens (erro/offline): só os álbuns.
 */
export function useTripChips(entries: RestaurantEntry[]) {
  const albums = useQuery({ queryKey: ["album-groups"], queryFn: fetchAlbumGroups, staleTime: 0 });
  const trips = useQuery({
    queryKey: ["my-trips"],
    queryFn: fetchTrips,
    staleTime: Infinity,
    retry: 0,
  });

  const valid = new Set(entries.map((e) => e.id));
  const dateOf = new Map(entries.map((e) => [e.id, e.visit_date || ""]));
  const chips = new Map<string, TripChip>();
  const add = (label: string, ids: Iterable<string>) => {
    const k = norm(label);
    if (!k) return;
    const chip = chips.get(k) ?? { key: k, label, entryIds: new Set<string>(), latest: "" };
    for (const id of ids) if (valid.has(id)) chip.entryIds.add(id);
    chips.set(k, chip);
  };
  for (const a of albums.data ?? []) add(a.title, a.entryIds);
  for (const v of trips.data ?? []) {
    add(
      v.nome,
      entries.filter((e) => e.visit_date && e.visit_date >= v.inicio && e.visit_date <= v.fim).map((e) => e.id),
    );
  }
  const list = [...chips.values()].filter((c) => c.entryIds.size > 0);
  for (const c of list) {
    c.latest = [...c.entryIds].map((id) => dateOf.get(id) || "").sort().pop() || "";
  }
  list.sort((a, b) => b.latest.localeCompare(a.latest) || a.label.localeCompare(b.label));
  return list;
}

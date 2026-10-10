import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Star, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { cn } from "@/lib/utils";
import type { RestaurantEntry } from "@/types";

const PAGE = 20;
/** Preferência da foto de capa: lugar, comida, amigos; depois qualquer uma. */
const COVER_ORDER = ["restaurant_photo", "food", "friends", "wine", "menu"];

/** Cidade a partir do endereço do Google ("…, São Paulo - SP, 01305-000, Brazil" → "São Paulo"). */
export function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) parts.pop(); // país
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = parts[i]
      .replace(/\b[\d-]{3,}\b/g, "") // CEP / código postal
      .trim()
      .replace(/\s+-\s+[A-Z]{2}$/, "") // " - SP"
      .replace(/\s+[A-Z]{2,3}$/, "") // "Roma RM", "NY"
      .replace(/^[A-Z]{2,3}$/, "")
      .trim();
    if (c && !/^\d/.test(c) && !/\d+$/.test(c)) return c;
  }
  return parts[parts.length - 1] ?? "";
}

/** Miniatura de capa de cada restaurante (só os que estão na tela). Recarrega ao voltar à tela. */
function useCovers(ids: string[]) {
  const key = ids.join(",");
  const { data } = useQuery({
    queryKey: ["entry-covers", key],
    enabled: ids.length > 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_photos")
        .select("entry_id, photo_url, thumb_url, type, created_at")
        .in("entry_id", ids)
        .neq("type", "video")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const best: Record<string, { rank: number; url: string }> = {};
      for (const p of data ?? []) {
        const url = p.thumb_url || p.photo_url;
        if (!url) continue;
        const r = COVER_ORDER.indexOf(p.type ?? "");
        const rank = r === -1 ? 99 : r;
        if (!best[p.entry_id] || rank < best[p.entry_id].rank) best[p.entry_id] = { rank, url };
      }
      const out: Record<string, string> = {};
      for (const [id, v] of Object.entries(best)) out[id] = v.url;
      return out;
    },
  });
  return data ?? {};
}

function Stars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn("h-4 w-4", s <= value ? "fill-accent text-accent" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}

function EntryCard({
  entry,
  cover,
  onOpen,
  locale,
}: {
  entry: RestaurantEntry;
  cover?: string;
  onOpen: () => void;
  locale: string;
}) {
  const date = entry.visit_date
    ? new Date(`${entry.visit_date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
    : "";
  const city = cityFromAddress(entry.location_address);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-[#0d1a2d]/10 bg-background text-left shadow-sm transition-transform active:scale-[0.98]",
        // celular: linha com foto à esquerda; tablet/desktop: cartão com foto em cima
        "h-24 md:h-60 md:flex-col md:items-stretch md:gap-0",
      )}
    >
      <div className="h-24 w-24 shrink-0 bg-muted md:h-36 md:w-full">
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 py-2 pr-3 md:px-3">
        <p className="truncate text-lg font-semibold leading-tight text-[#0d1a2d]">{entry.restaurant_name}</p>
        <p className="truncate text-sm text-muted-foreground">{[city, date].filter(Boolean).join(" · ")}</p>
        <Stars value={entry.rating} />
      </div>
    </button>
  );
}

/**
 * Lista de restaurantes (início e aba Restaurantes). Celular: uma coluna que
 * rola com a página. ≥768 px: 3 colunas (≥1024 px: 4) numa caixa com duas
 * fileiras à vista, que rola por dentro. Carrega de 20 em 20.
 */
export function RestaurantGrid({ entries }: { entries: RestaurantEntry[] }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const [count, setCount] = useState(PAGE);
  const visible = entries.slice(0, count);
  const covers = useCovers(visible.map((e) => e.id));
  const sentinel = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const firstId = entries[0]?.id;

  // Lista nova (filtro mudou): volta ao começo
  useEffect(() => {
    setCount(PAGE);
    boxRef.current?.scrollTo({ top: 0 });
  }, [entries.length, firstId]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= entries.length) return;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const io = new IntersectionObserver(
      (obs) => {
        if (obs.some((o) => o.isIntersecting)) setCount((c) => c + PAGE);
      },
      { root: desktop ? boxRef.current : null, rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, entries.length]);

  const locale = language === "pt" ? "pt-BR" : "en-US";

  return (
    <div
      ref={boxRef}
      className="rounded-3xl border border-[#0d1a2d]/10 bg-background/60 p-3 md:max-h-[33rem] md:overflow-y-auto md:p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {visible.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            cover={covers[e.id]}
            locale={locale}
            onOpen={() => navigate(`/dining/${e.id}`)}
          />
        ))}
      </div>
      {count < entries.length && <div ref={sentinel} className="h-8" />}
    </div>
  );
}

/** Mais novos primeiro (data da visita, depois criação), sem rascunhos. */
export function sortEntries(list: RestaurantEntry[]): RestaurantEntry[] {
  return list
    .filter((e) => !e.is_draft)
    .sort(
      (a, b) =>
        (b.visit_date || "").localeCompare(a.visit_date || "") || (b.created_at || "").localeCompare(a.created_at || ""),
    );
}

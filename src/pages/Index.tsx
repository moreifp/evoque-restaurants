import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Star, UtensilsCrossed } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { cn } from "@/lib/utils";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import { PendingDraftsCard } from "@/components/add/PendingDraftsCard";
import type { RestaurantEntry } from "@/types";

const PAGE = 20;
/** Preferência da foto de capa: lugar, comida, amigos; depois qualquer uma. */
const COVER_ORDER = ["restaurant_photo", "food", "friends", "wine", "menu"];

/** Miniatura de capa de cada restaurante (só os que estão na tela). */
function useCovers(ids: string[]) {
  const [covers, setCovers] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const key = ids.join(",");
  useEffect(() => {
    const askedSet = asked.current;
    const todo = ids.filter((id) => !askedSet.has(id));
    if (!todo.length) return;
    todo.forEach((id) => askedSet.add(id));
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("restaurant_photos")
        .select("entry_id, photo_url, thumb_url, type, created_at")
        .in("entry_id", todo)
        .neq("type", "video")
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const best: Record<string, { rank: number; url: string }> = {};
      for (const p of data) {
        const url = p.thumb_url || p.photo_url;
        if (!url) continue;
        const r = COVER_ORDER.indexOf(p.type ?? "");
        const rank = r === -1 ? 99 : r;
        if (!best[p.entry_id] || rank < best[p.entry_id].rank) best[p.entry_id] = { rank, url };
      }
      setCovers((prev) => {
        const next = { ...prev };
        for (const [id, v] of Object.entries(best)) next[id] = v.url;
        return next;
      });
    })();
    return () => {
      cancelled = true;
      todo.forEach((id) => askedSet.delete(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return covers;
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

function EntryCard({ entry, cover, onOpen, locale }: {
  entry: RestaurantEntry;
  cover?: string;
  onOpen: () => void;
  locale: string;
}) {
  const date = entry.visit_date
    ? new Date(`${entry.visit_date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
    : "";
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
      <div className="min-w-0 flex-1 space-y-1 py-2 pr-3 md:px-3">
        <p className="truncate text-lg font-semibold text-[#0d1a2d]">{entry.restaurant_name}</p>
        <p className="text-sm text-muted-foreground">{date}</p>
        <Stars value={entry.rating} />
      </div>
    </button>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { data: allEntries = [], isLoading: loading } = useRestaurantEntries();
  // Todos os restaurantes, mais novos primeiro
  const entries = allEntries
    .filter((e) => !e.is_draft)
    .sort((a, b) => (b.visit_date || "").localeCompare(a.visit_date || "") || (b.created_at || "").localeCompare(a.created_at || ""));

  const [count, setCount] = useState(PAGE);
  const visible = entries.slice(0, count);
  const covers = useCovers(visible.map((e) => e.id));
  const sentinel = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Carrega mais 20 quando o fim da lista aparece (na página ou dentro da caixa)
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
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />

      <main className="container mx-auto max-w-5xl px-4 main-content-padding pb-24 md:pb-8">
        <p className="mb-4 text-center text-sm text-muted-foreground">{t("home.tagline")}</p>

        {/* Ação principal */}
        <Button
          type="button"
          onClick={() => navigate("/dining/add")}
          className="mx-auto mb-6 flex h-20 w-full max-w-xl gap-4 rounded-3xl bg-navy text-2xl font-semibold text-white shadow-md hover:bg-navy/90"
        >
          <Plus className="h-9 w-9" />
          {t("home.addRestaurant")}
        </Button>

        {/* Guardados no celular, esperando o Wi-Fi */}
        <PendingDraftsCard />

        {/* Todos os restaurantes */}
        <section className="space-y-3">
          <h2 className="px-1 text-xl font-bold text-[#0d1a2d]">{t("home.culinaryExperience")}</h2>
          {loading ? (
            <p className="py-10 text-center text-muted-foreground">{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <div className="space-y-4 rounded-3xl border border-[#0d1a2d]/10 bg-background/70 p-8 text-center">
              <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="text-base text-muted-foreground">{t("home.emptyList")}</p>
              <Button
                type="button"
                onClick={() => navigate("/dining/add")}
                className="h-14 gap-2 rounded-2xl bg-navy px-6 text-lg font-semibold text-white hover:bg-navy/90"
              >
                <Plus className="h-6 w-6" />
                {t("home.addRestaurant")}
              </Button>
            </div>
          ) : (
            <div
              ref={boxRef}
              className={cn(
                "rounded-3xl border border-[#0d1a2d]/10 bg-background/60 p-3 md:p-4",
                // tablet/desktop: duas fileiras à vista, rola dentro da caixa
                "md:max-h-[33rem] md:overflow-y-auto",
              )}
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
          )}
        </section>
      </main>
    </div>
  );
}

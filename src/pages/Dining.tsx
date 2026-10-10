import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, Search, X } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import { useTripChips } from "@/hooks/useTripChips";
import { RestaurantGrid, sortEntries } from "@/components/RestaurantGrid";
import { GridSkeleton } from "@/components/ui/skeletons";

const MAP_MAX_IDS = 200;

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Aba Restaurantes: busca + mapa, chips de viagem e a lista de todos. */
export default function Dining() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: rawEntries = [], isLoading } = useRestaurantEntries();
  const entries = useMemo(() => sortEntries(rawEntries), [rawEntries]);
  const chips = useTripChips(entries);
  const [query, setQuery] = useState("");
  const [trip, setTrip] = useState<string | null>(null);

  const activeChip = chips.find((c) => c.key === trip) ?? null;

  const filtered = useMemo(() => {
    let list = entries;
    if (activeChip) list = list.filter((e) => activeChip.entryIds.has(e.id));
    const q = norm(query.trim());
    if (q) {
      list = list.filter(
        (e) => norm(e.restaurant_name).includes(q) || norm(e.location_address).includes(q) || norm(e.notes).includes(q),
      );
    }
    return list;
  }, [entries, activeChip, query]);

  const openMap = () => {
    const isAll = !activeChip && !query.trim();
    if (isAll || filtered.length > MAP_MAX_IDS) {
      navigate("/albums/map?all=1");
      return;
    }
    navigate(`/albums/map?ids=${filtered.map((e) => e.id).join(",")}`);
  };

  const chip = (key: string | null, label: string, n: number) => {
    const active = trip === key;
    return (
      <button
        key={key ?? "__all__"}
        type="button"
        onClick={() => setTrip(key)}
        aria-pressed={active}
        className={cn(
          "flex h-11 shrink-0 items-center gap-2 rounded-full border-2 px-4 text-base font-semibold transition-colors",
          active ? "border-navy bg-navy text-white" : "border-[#0d1a2d]/15 bg-background text-[#0d1a2d]",
        )}
      >
        <span className="max-w-[12rem] truncate">{label}</span>
        <span className={cn("text-sm", active ? "text-white/80" : "text-muted-foreground")}>{n}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />

      <main className="container mx-auto max-w-5xl space-y-4 px-4 main-content-padding pb-24 md:pb-8">
        {/* Busca + mapa */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dining.searchRestaurantOrCity")}
              aria-label={t("dining.searchRestaurantOrCity")}
              className="h-14 rounded-2xl border-2 pl-12 pr-11 text-lg"
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("common.close")}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={openMap}
            aria-label={t("dining.map")}
            className="flex h-14 w-14 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[#0d1a2d]/15 bg-background text-[#0d1a2d] md:w-auto md:px-5"
          >
            <MapIcon className="h-6 w-6" />
            <span className="hidden text-base font-semibold md:inline">{t("dining.map")}</span>
          </button>
        </div>

        {/* Viagens */}
        {chips.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
            {chip(null, t("common.all"), entries.length)}
            {chips.map((c) => chip(c.key, c.label, c.entryIds.size))}
          </div>
        )}

        {/* Lista */}
        {isLoading ? (
          <GridSkeleton count={6} />
        ) : filtered.length === 0 ? (
          <p className="rounded-3xl border border-[#0d1a2d]/10 bg-background/70 p-8 text-center text-base text-muted-foreground">
            {entries.length === 0 ? t("home.emptyList") : t("dining.noMatches")}
          </p>
        ) : (
          <RestaurantGrid entries={filtered} />
        )}
      </main>
    </div>
  );
}

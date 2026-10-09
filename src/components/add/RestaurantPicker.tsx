import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, MapPin, MapPinOff, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { fetchNearby, formatDistance, getDevicePosition, searchPlaces, type NearbyPlace } from "@/lib/nearby";

export interface PickedRestaurant {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

interface RestaurantPickerProps {
  selected: PickedRestaurant | null;
  onSelect: (r: PickedRestaurant) => void;
  /** Seleciona o mais perto quando ainda não há restaurante escolhido. */
  autoSelectNearest: boolean;
}

const VISIBLE = 5;

function toPicked(p: NearbyPlace): PickedRestaurant {
  return { name: p.name, address: p.address, lat: p.lat, lng: p.lng, placeId: p.id };
}

/** Tela 1: restaurantes a até 400 m (mais perto primeiro) + busca pelo nome. */
export function RestaurantPicker({ selected, onSelect, autoSelectNearest }: RestaurantPickerProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"locating" | "list" | "nolocation" | "error">("locating");
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NearbyPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const autoRef = useRef(autoSelectNearest);
  autoRef.current = autoSelectNearest;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pos = await getDevicePosition(8000);
      if (cancelled) return;
      if (!pos.ok) {
        setPhase("nolocation");
        setSearchMode(true);
        return;
      }
      coordsRef.current = { lat: pos.lat, lng: pos.lng };
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPhase("error");
        setSearchMode(true);
        return;
      }
      try {
        const list = await fetchNearby(pos.lat, pos.lng);
        if (cancelled) return;
        setPlaces(list);
        setPhase("list");
        if (list.length && autoRef.current) onSelectRef.current(toPicked(list[0]));
        if (!list.length) setSearchMode(true);
      } catch (e) {
        console.warn("[RestaurantPicker] nearby failed", e);
        if (cancelled) return;
        setPhase("error");
        setSearchMode(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Busca pelo nome (com espera curta entre teclas)
  useEffect(() => {
    if (!searchMode) return;
    const q = query.trim();
    if (q.length < 2 || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const list = await searchPlaces(q, coordsRef.current);
        if (!cancelled) setResults(list);
      } catch (e) {
        console.warn("[RestaurantPicker] search failed", e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchMode]);

  const isSelected = (p: NearbyPlace) =>
    !!selected && (selected.placeId ? selected.placeId === p.id : selected.name === p.name);

  const renderRow = (p: NearbyPlace) => {
    const sel = isSelected(p);
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => {
          onSelect(toPicked(p));
          setSearchMode(false);
          setQuery("");
        }}
        className={cn(
          "flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 py-2 text-left transition-colors",
          sel ? "border-[#0d1a2d] bg-[#0d1a2d]/5" : "border-transparent bg-background",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
            sel ? "border-[#0d1a2d] bg-[#0d1a2d] text-white" : "border-muted-foreground/30",
          )}
        >
          {sel && <Check className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold text-[#0d1a2d]">{p.name}</span>
          {p.address && <span className="block truncate text-sm text-muted-foreground">{p.address}</span>}
        </span>
        {p.distance_m !== null && (
          <span className="shrink-0 text-base font-semibold tabular-nums text-muted-foreground">
            {formatDistance(p.distance_m)}
          </span>
        )}
      </button>
    );
  };

  // Escolhido fora da lista (busca, Agenda ou rascunho): mostra no topo.
  const selectedOutside =
    selected && !places.some((p) => isSelected(p))
      ? ({
          id: selected.placeId ?? "__picked__",
          name: selected.name,
          address: selected.address,
          lat: selected.lat,
          lng: selected.lng,
          type: null,
          distance_m: null,
        } as NearbyPlace)
      : null;

  if (searchMode) {
    const typed = query.trim();
    return (
      <div className="space-y-3">
        {phase === "nolocation" && (
          <p className="flex items-center gap-2 text-base text-muted-foreground">
            <MapPinOff className="h-5 w-5 shrink-0" />
            {t("quickAdd.noLocation")}
          </p>
        )}
        {phase === "error" && <p className="text-base text-muted-foreground">{t("quickAdd.nearbyError")}</p>}
        {phase === "list" && places.length === 0 && (
          <p className="text-base text-muted-foreground">{t("quickAdd.noneNearby")}</p>
        )}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("quickAdd.searchPlaceholder")}
            className="h-14 rounded-2xl pl-12 pr-12 text-lg"
            enterKeyHint="search"
          />
          {searching ? (
            <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center"
              aria-label={t("quickAdd.close")}
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        <div className="space-y-1">
          {selectedOutside && !typed && renderRow(selectedOutside)}
          {results.map((p) => renderRow(p))}
          {typed.length >= 2 && !searching && results.length === 0 && (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t("quickAdd.noResults")}</p>
          )}
          {typed.length >= 1 && (
            <button
              type="button"
              onClick={() => {
                onSelect({ name: typed, address: "", lat: null, lng: null, placeId: null });
                setSearchMode(false);
                setQuery("");
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-lg font-semibold text-[#0d1a2d]"
            >
              <Check className="h-6 w-6 shrink-0" />
              <span className="truncate">{t("quickAdd.useTyped").replace("{name}", typed)}</span>
            </button>
          )}
          {phase === "list" && places.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchMode(false)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-base font-semibold text-muted-foreground"
            >
              <MapPin className="h-6 w-6 shrink-0" />
              {t("quickAdd.backToNearby")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const shown = expanded ? places : places.slice(0, VISIBLE);
  return (
    <div className="space-y-1">
      {phase === "locating" && (
        <div className="flex min-h-16 items-center gap-3 px-4 text-base text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          {t("quickAdd.locating")}
        </div>
      )}
      {selectedOutside && renderRow(selectedOutside)}
      {shown.map((p) => renderRow(p))}
      {!expanded && places.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-h-12 w-full items-center justify-center gap-2 text-base font-semibold text-muted-foreground"
        >
          <ChevronDown className="h-5 w-5" />
          {t("quickAdd.more").replace("{n}", String(places.length - VISIBLE))}
        </button>
      )}
      {phase !== "locating" && (
        <button
          type="button"
          onClick={() => setSearchMode(true)}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 text-left text-lg font-semibold text-[#0d1a2d]"
        >
          <Search className="h-6 w-6 shrink-0" />
          {t("quickAdd.other")}
        </button>
      )}
      {phase === "locating" && (
        <button
          type="button"
          onClick={() => setSearchMode(true)}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-base text-muted-foreground"
        >
          <Search className="h-5 w-5 shrink-0" />
          {t("quickAdd.other")}
        </button>
      )}
    </div>
  );
}

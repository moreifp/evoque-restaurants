import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, MapPinOff, Pencil, X } from "lucide-react";
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
  /** Lista "perto de você" pelo GPS (desligada na edição). */
  showNearby?: boolean;
}

const VISIBLE = 5;

function toPicked(p: NearbyPlace): PickedRestaurant {
  return { name: p.name, address: p.address, lat: p.lat, lng: p.lng, placeId: p.id };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Campo grande para ESCREVER o nome (vale como está, mesmo offline) +
 * restaurantes a até 400 m (mais perto primeiro) + resultados da busca pelo nome.
 */
export function RestaurantPicker({ selected, onSelect, autoSelectNearest, showNearby = true }: RestaurantPickerProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"locating" | "list" | "nolocation" | "error" | "off">(
    showNearby ? "locating" : "off",
  );
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [expanded, setExpanded] = useState(false);
  // Nome digitado à mão (restaurado de um rascunho) aparece no campo.
  const [query, setQuery] = useState(() => (selected && !selected.placeId ? selected.name : ""));
  const [results, setResults] = useState<NearbyPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const autoRef = useRef(autoSelectNearest);
  autoRef.current = autoSelectNearest;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const typingRef = useRef(false);

  useEffect(() => {
    if (!showNearby) return;
    let cancelled = false;
    (async () => {
      const pos = await getDevicePosition(8000);
      if (cancelled) return;
      if (!pos.ok) {
        setPhase("nolocation");
        return;
      }
      coordsRef.current = { lat: pos.lat, lng: pos.lng };
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPhase("error");
        return;
      }
      try {
        const list = await fetchNearby(pos.lat, pos.lng);
        if (cancelled) return;
        setPlaces(list);
        setPhase("list");
        // Não troca o que a pessoa já começou a escrever
        if (list.length && autoRef.current && !typingRef.current) onSelectRef.current(toPicked(list[0]));
      } catch (e) {
        console.warn("[RestaurantPicker] nearby failed", e);
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showNearby]);

  // Busca pelo nome no Google (online), com espera curta entre teclas
  useEffect(() => {
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
  }, [query]);

  const typeName = (value: string) => {
    typingRef.current = true;
    setQuery(value);
    const name = value.trim();
    // O nome digitado já vale como restaurante (sem endereço/coordenadas)
    if (name) onSelect({ name, address: "", lat: null, lng: null, placeId: null });
  };

  const pick = (p: NearbyPlace) => {
    typingRef.current = false;
    setQuery("");
    setResults([]);
    onSelect(toPicked(p));
  };

  const isSelected = (p: NearbyPlace) =>
    !!selected && !!selected.placeId && selected.placeId === p.id;

  const renderRow = (p: NearbyPlace) => {
    const sel = isSelected(p);
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => pick(p)}
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

  const typed = query.trim();
  const manualSelected = !!selected && !selected.placeId && !!selected.name;

  // Escolhido de uma busca anterior (fora da lista perto): mostra no topo.
  const selectedOutside =
    !typed && selected?.placeId && !places.some((p) => p.id === selected.placeId)
      ? ({
          id: selected.placeId,
          name: selected.name,
          address: selected.address,
          lat: selected.lat,
          lng: selected.lng,
          type: null,
          distance_m: null,
        } as NearbyPlace)
      : null;

  // Digitando: primeiro os perto que batem com o nome (funciona offline), depois o Google
  const nearMatches = typed ? places.filter((p) => norm(p.name).includes(norm(typed))) : [];
  const remote = results.filter((r) => !nearMatches.some((p) => p.id === r.id));
  const shown = expanded ? places : places.slice(0, VISIBLE);

  return (
    <div className="space-y-2">
      {/* Campo do nome: sempre visível, 1 toque para escrever */}
      <div className="relative">
        <Pencil className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => typeName(e.target.value)}
          placeholder={t("quickAdd.typeName")}
          aria-label={t("quickAdd.typeName")}
          className={cn(
            "h-16 rounded-2xl border-2 pl-12 pr-12 text-lg font-semibold",
            manualSelected && typed ? "border-[#0d1a2d]" : "border-[#0d1a2d]/20",
          )}
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        {searching ? (
          <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : manualSelected && typed ? (
          <Check className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#0d1a2d]" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              typingRef.current = false;
              setQuery("");
            }}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center"
            aria-label={t("quickAdd.close")}
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {typed ? (
        <div className="space-y-1">
          {nearMatches.map((p) => renderRow(p))}
          {remote.map((p) => renderRow(p))}
          {typed.length >= 2 && !searching && !nearMatches.length && !remote.length && (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t("quickAdd.typedOnly")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {phase === "locating" && (
            <div className="flex min-h-14 items-center gap-3 px-4 text-base text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              {t("quickAdd.locating")}
            </div>
          )}
          {phase === "nolocation" && (
            <p className="flex items-center gap-2 px-2 text-base text-muted-foreground">
              <MapPinOff className="h-5 w-5 shrink-0" />
              {t("quickAdd.noLocation")}
            </p>
          )}
          {phase === "error" && <p className="px-2 text-base text-muted-foreground">{t("quickAdd.nearbyError")}</p>}
          {phase === "list" && places.length === 0 && (
            <p className="px-2 text-base text-muted-foreground">{t("quickAdd.noneNearby")}</p>
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
        </div>
      )}
    </div>
  );
}

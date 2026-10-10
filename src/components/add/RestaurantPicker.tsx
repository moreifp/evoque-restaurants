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
  /** Fecha a lista depois de escolher (só "Trocar" reabre). Usado na edição. */
  collapsible?: boolean;
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
export function RestaurantPicker({
  selected,
  onSelect,
  autoSelectNearest,
  showNearby = true,
  collapsible = false,
}: RestaurantPickerProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"locating" | "list" | "nolocation" | "error" | "off">(
    showNearby ? "locating" : "off",
  );
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [expanded, setExpanded] = useState(false);
  // editing = a pessoa está escrevendo; fora disso o campo mostra o restaurante escolhido.
  const [editing, setEditing] = useState(false);
  // Lista aberta? Com restaurante escolhido ela fecha e fica só o escolhido + "Trocar".
  // Na tela de adicionar a lista começa aberta (o mais perto só fica destacado);
  // fecha quando a pessoa toca numa linha ou termina de escrever. Na edição começa fechada.
  const [listOpen, setListOpen] = useState(() => (collapsible ? !selected?.name : true));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NearbyPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const autoRef = useRef(autoSelectNearest);
  autoRef.current = autoSelectNearest;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const typingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        if (list.length && autoRef.current && !typingRef.current) {
          onSelectRef.current(toPicked(list[0])); // escolha automática não fecha a lista
        }
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
    if (!editing || q.length < 2 || (typeof navigator !== "undefined" && navigator.onLine === false)) {
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
  }, [query, editing]);

  const typeName = (value: string) => {
    typingRef.current = true;
    setEditing(true);
    setQuery(value);
    const name = value.trim();
    // O nome digitado já vale como restaurante (sem endereço/coordenadas)
    if (name) onSelect({ name, address: "", lat: null, lng: null, placeId: null });
  };

  const pick = (p: NearbyPlace) => {
    typingRef.current = false;
    setEditing(false);
    setListOpen(false);
    setQuery(p.name);
    setResults([]);
    inputRef.current?.blur();
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
        onMouseDown={(e) => e.preventDefault()}
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

  const typed = editing ? query.trim() : "";
  const shownValue = editing ? query : (selected?.name ?? "");
  const hasSelection = !!selected?.name;

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
      {/* Onde estou */}
      {showNearby && (
        <div className="flex min-h-7 items-center gap-2 px-1 text-base text-muted-foreground">
          {phase === "locating" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("quickAdd.locating")}
            </>
          ) : phase === "list" ? (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
              {t("quickAdd.hereRadius")}
            </>
          ) : phase === "nolocation" ? (
            <>
              <MapPinOff className="h-4 w-4 shrink-0" /> {t("quickAdd.noLocation")}
            </>
          ) : phase === "error" ? (
            <>{t("quickAdd.nearbyError")}</>
          ) : null}
        </div>
      )}

      {/* Campo do nome: sempre visível, 1 toque para escrever */}
      <div className="relative">
        <Pencil className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={shownValue}
          onChange={(e) => typeName(e.target.value)}
          onFocus={(e) => {
            // Sem estar escrevendo: seleciona tudo, para a digitação substituir o nome
            setListOpen(true);
            if (!editing) {
              const el = e.currentTarget;
              setTimeout(() => el.select(), 0);
            }
          }}
          onBlur={() => {
            // Terminou de escrever: o campo volta a mostrar o escolhido. Com atraso,
            // para o toque numa linha da lista chegar antes da lista mudar.
            if (editing) {
              const name = query.trim();
              setTimeout(() => {
                setEditing(false);
                if (name) setListOpen(false); // nome escrito aceito: fecha a lista
              }, 250);
            }
          }}
          placeholder={t("quickAdd.typeName")}
          aria-label={t("quickAdd.typeName")}
          className={cn(
            "h-16 rounded-2xl border-2 pl-12 pr-12 text-lg font-semibold",
            hasSelection && !editing ? "border-[#0d1a2d]" : "border-[#0d1a2d]/20",
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
        ) : hasSelection && !editing ? (
          <Check className="pointer-events-none absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#0d1a2d]" />
        ) : editing && query ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center"
            aria-label={t("quickAdd.close")}
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {hasSelection && !editing && !listOpen ? (
        <div className="flex items-center gap-2 px-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {[
              selected?.address,
              formatDistance(places.find((p) => p.id === selected?.placeId)?.distance_m ?? null),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-base font-semibold text-[#0d1a2d]"
          >
            <Pencil className="h-4 w-4" /> {t("quickAdd.change")}
          </button>
        </div>
      ) : typed ? (
        <div className="space-y-1">
          {nearMatches.map((p) => renderRow(p))}
          {remote.map((p) => renderRow(p))}
          {typed.length >= 2 && !searching && !nearMatches.length && !remote.length && (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t("quickAdd.typedOnly")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
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

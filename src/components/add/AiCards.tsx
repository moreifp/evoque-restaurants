import { useState } from "react";
import { ChevronDown, Loader2, RotateCw, WifiOff, Wine, Receipt, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import type { DraftPhoto, ReceiptData } from "@/lib/draftStore";

function money(v: number | null | undefined, currency?: string | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  try {
    if (currency && /^[A-Z]{3}$/.test(currency)) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
    }
  } catch {
    /* moeda desconhecida */
  }
  return `${currency ? `${currency} ` : ""}${v.toFixed(2)}`;
}

/** Linha de estado da IA (lendo / sem internet / erro). */
export function AiStatusLine({
  photo,
  readingKey,
  onRetry,
}: {
  photo: DraftPhoto;
  readingKey: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const st = photo.ai?.status;
  if (!st || st === "done") return null;
  if (st === "running") {
    return (
      <p className="flex items-center gap-2 text-base text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> {t(readingKey)}
      </p>
    );
  }
  if (st === "queued") {
    return (
      <p className="flex items-center gap-2 text-base text-muted-foreground">
        <WifiOff className="h-5 w-5" /> {t("quickAdd.queued")}
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-base text-destructive">{t("quickAdd.aiError")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-11 items-center gap-2 rounded-xl border-2 px-3 text-base font-semibold"
      >
        <RotateCw className="h-5 w-5" /> {t("quickAdd.retry")}
      </button>
    </div>
  );
}

export function ReceiptCard({ data }: { data: ReceiptData }) {
  const { t } = useI18n();
  const cur = data.currency ?? null;
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <div className="space-y-3 rounded-2xl border-2 border-[#0d1a2d]/10 bg-background p-4">
      <p className="flex items-center gap-2 text-lg font-bold text-[#0d1a2d]">
        <Receipt className="h-6 w-6" /> {t("quickAdd.receiptTitle")}
      </p>
      <ul className="divide-y">
        {items.map((it, i) => {
          const pt = (it.name_pt || "").trim();
          const showOrig = !!pt && pt.toLowerCase() !== (it.name || "").trim().toLowerCase();
          return (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-snug">
                  {it.quantity && it.quantity !== 1 ? <span className="text-muted-foreground">{it.quantity}× </span> : null}
                  {pt || it.name}
                </p>
                {showOrig && <p className="text-xs text-muted-foreground">{it.name}</p>}
                {it.quantity && it.quantity !== 1 && it.unit_price ? (
                  <p className="text-xs text-muted-foreground">{money(it.unit_price, cur)}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-base font-semibold tabular-nums">{money(it.line_total, cur)}</span>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t pt-2 text-base">
        {data.subtotal ? (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("quickAdd.subtotal")}</span>
            <span className="tabular-nums">{money(data.subtotal, cur)}</span>
          </div>
        ) : null}
        {data.tax ? (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("quickAdd.tax")}</span>
            <span className="tabular-nums">{money(data.tax, cur)}</span>
          </div>
        ) : null}
        {data.service_fee ? (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("quickAdd.service")}</span>
            <span className="tabular-nums">{money(data.service_fee, cur)}</span>
          </div>
        ) : null}
        {data.total !== null && data.total !== undefined ? (
          <div className="flex justify-between text-lg font-bold text-[#0d1a2d]">
            <span>{t("quickAdd.total")}</span>
            <span className="tabular-nums">{money(data.total, cur)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MenuCard({ translation }: { translation: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border-2 border-[#0d1a2d]/10 bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-lg font-bold text-[#0d1a2d]"
        aria-expanded={open}
      >
        <BookOpen className="h-6 w-6 shrink-0" />
        <span className="flex-1">{t("quickAdd.menuTitle")}</span>
        <ChevronDown className={cn("h-6 w-6 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="whitespace-pre-wrap border-t px-4 py-3 text-base leading-relaxed">{translation}</div>
      )}
    </div>
  );
}

export function WineCard({ info }: { info: Record<string, unknown> }) {
  const { t } = useI18n();
  const s = (k: string) => {
    const v = info[k];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  };
  const rows: Array<[string, string]> = [
    ["quickAdd.producer", s("producer")],
    ["quickAdd.vintage", s("vintage")],
    ["quickAdd.region", [s("region"), s("country")].filter(Boolean).join(", ")],
    ["quickAdd.grape", s("grape_variety")],
    ["quickAdd.type", s("type")],
  ].filter(([, v]) => v) as Array<[string, string]>;
  return (
    <div className="space-y-2 rounded-2xl border-2 border-[#0d1a2d]/10 bg-background p-4">
      <p className="flex items-center gap-2 text-lg font-bold text-[#0d1a2d]">
        <Wine className="h-6 w-6 shrink-0" /> {s("name") || t("quickAdd.wineTitle")}
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-base">
          <span className="text-muted-foreground">{t(k)}</span>
          <span className="text-right font-medium">{v}</span>
        </div>
      ))}
      {s("characteristics") && <p className="text-sm text-muted-foreground">{s("characteristics")}</p>}
    </div>
  );
}

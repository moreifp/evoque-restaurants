import { useEffect, useState } from "react";
import { Camera, UtensilsCrossed, FileText, Wine, Users, Receipt, MapPin, Check, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  SHARE_CATEGORIES,
  type ShareCategory,
  type ShareInfo,
  type SharePhotos,
  prefetchFile,
  collectFiles,
  shareText,
  shareToWhatsApp,
  buildPdf,
  sharePdf,
  isMobileDevice,
} from "@/lib/sharePack";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  info: ShareInfo;
  photos: SharePhotos;
}

const ICONS: Record<ShareCategory, typeof Camera> = {
  place: Camera,
  menu: FileText,
  food: UtensilsCrossed,
  wine: Wine,
  friends: Users,
  receipt: Receipt,
};

/** Ícone oficial do WhatsApp (SVG simples, sem dependência). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.78h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.74 1.46h.01c6.55 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.16-3.49-8.41" />
    </svg>
  );
}

/** Folha "Compartilhar": nome e endereço, 6 bolinhas para escolher o que vai, e os botões PDF / WhatsApp. */
export function ShareSheet({ open, onClose, info, photos }: ShareSheetProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [selected, setSelected] = useState<ShareCategory[]>([]);
  const [busy, setBusy] = useState<"pdf" | "whatsapp" | null>(null);

  // Ao abrir, nada marcado: o usuário toca nas bolinhas do que quer mandar.
  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  // Baixa as fotos escolhidas enquanto o usuário decide, para o toque ser imediato no iPhone.
  const selectedKey = selected.join(",");
  useEffect(() => {
    if (!open) return;
    selected.forEach((c) => photos[c].forEach((url, i) => prefetchFile(url, `${c}-${i + 1}.jpg`).catch(() => {})));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedKey]);

  const toggle = (c: ShareCategory) =>
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const labels = { visit: t("share.visit"), rating: t("share.rating") };
  const selectedUrls = selected.flatMap((c) => photos[c]);
  const nothing = selected.length === 0;

  const onWhatsApp = async () => {
    setBusy("whatsapp");
    try {
      // No computador vão só os links; não precisa baixar as fotos.
      const { files, failed } = isMobileDevice() ? await collectFiles(photos, selected) : { files: [], failed: 0 };
      if (failed > 0) toast({ title: t("share.someFailed").replace("{n}", String(failed)), variant: "destructive" });
      const r = await shareToWhatsApp(shareText(info, labels), files, selectedUrls);
      if (r === "shared") onClose();
    } catch (e) {
      console.error("[ShareSheet] whatsapp", e);
      toast({ title: t("share.error"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const onPdf = async () => {
    setBusy("pdf");
    try {
      const sections = [];
      let failed = 0;
      for (const c of SHARE_CATEGORIES) {
        if (!selected.includes(c)) continue;
        const got = await collectFiles(photos, [c]);
        failed += got.failed;
        sections.push({ label: t(`share.${c}`), files: got.files });
      }
      if (failed > 0) toast({ title: t("share.someFailed").replace("{n}", String(failed)), variant: "destructive" });
      const pdf = await buildPdf(info, sections, labels);
      const r = await sharePdf(pdf);
      if (r === "shared") onClose();
    } catch (e) {
      console.error("[ShareSheet] pdf", e);
      toast({ title: t("share.error"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("share.title")}>
      <div className="space-y-5">
        <div>
          <p className="text-2xl font-bold leading-tight">{info.name}</p>
          {info.address && (
            <p className="mt-1 flex items-start gap-1.5 text-base text-muted-foreground">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{info.address}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {SHARE_CATEGORIES.map((c) => {
            const Icon = ICONS[c];
            const count = photos[c].length;
            const on = selected.includes(c);
            const empty = count === 0;
            return (
              <button
                key={c}
                type="button"
                disabled={empty}
                onClick={() => toggle(c)}
                aria-pressed={on}
                className={cn("flex flex-col items-center gap-2", empty && "opacity-35")}
              >
                <span
                  className={cn(
                    "relative flex h-20 w-20 items-center justify-center rounded-full border-2 transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <Icon className="h-9 w-9" />
                  {on && (
                    <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background text-primary shadow">
                      <Check className="h-5 w-5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={cn("text-sm font-semibold", !on && "text-muted-foreground")}>
                  {t(`share.${c}`)}
                  {!empty && <span className="text-muted-foreground"> · {count}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={onPdf}
            disabled={nothing || busy !== null}
            className="h-16 gap-2 rounded-2xl text-lg font-semibold"
          >
            {busy === "pdf" ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileText className="h-7 w-7" />}
            PDF
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onWhatsApp}
            disabled={nothing || busy !== null}
            className="h-16 gap-2 rounded-2xl bg-[#25D366] text-lg font-semibold text-white hover:bg-[#1fb857]"
          >
            {busy === "whatsapp" ? <Loader2 className="h-7 w-7 animate-spin" /> : <WhatsAppIcon className="h-7 w-7" />}
            WhatsApp
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

import { useMemo, useState } from "react";
import { Download, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import { canShareFiles, downloadFile, shareOrDownload } from "@/lib/saveToPhotos";

interface SaveOriginalsBarProps {
  files: File[];
  onDismiss: () => void;
}

/**
 * Depois do envio: um toque grande para guardar os ORIGINAIS no app Fotos
 * (o app guarda só a versão leve). Sem Web Share com arquivos, mostra um
 * link de download por foto.
 */
export function SaveOriginalsBar({ files, onDismiss }: SaveOriginalsBarProps) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const shareable = useMemo(() => canShareFiles(files), [files]);

  if (!files.length) return null;

  return (
    <div className="relative mx-auto max-w-md rounded-2xl border-2 border-[#0d1a2d]/15 bg-background p-4 shadow-sm">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("savePhotos.dismiss")}
        className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow"
      >
        <X className="h-5 w-5" />
      </button>

      {shareable ? (
        <Button
          type="button"
          size="lg"
          className="h-20 w-full gap-4 rounded-2xl bg-navy text-lg font-semibold text-white hover:bg-navy/90"
          onClick={async () => {
            const r = await shareOrDownload(files);
            if (r !== "cancelled") setDone(true);
          }}
        >
          {done ? <Check className="h-8 w-8" /> : <Download className="h-8 w-8" />}
          <span className="flex flex-col items-start leading-tight">
            <span>{t("savePhotos.saveOriginals")}</span>
            <span className="text-sm font-normal opacity-80">
              {t("savePhotos.count").replace("{n}", String(files.length))}
            </span>
          </span>
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-semibold text-[#0d1a2d]">
            <Download className="h-6 w-6" />
            {t("savePhotos.saveOriginals")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {files.map((f, i) => (
              <Button
                key={`${f.name}-${i}`}
                type="button"
                variant="outline"
                className="h-12 gap-2"
                onClick={() => downloadFile(f)}
              >
                <Download className="h-5 w-5" />
                {t("savePhotos.downloadOne").replace("{n}", String(i + 1))}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

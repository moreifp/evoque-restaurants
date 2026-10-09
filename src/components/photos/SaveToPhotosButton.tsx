import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { useToast } from "@/hooks/use-toast";
import { fetchAsFile, shareOrDownload } from "@/lib/saveToPhotos";

interface SaveToPhotosButtonProps {
  url: string;
  className?: string;
  /** "light" para fundo escuro (lightbox). */
  tone?: "default" | "light";
}

/**
 * Botão grande "Salvar no Fotos" do visualizador. Baixa a imagem assim que o
 * visualizador abre, para que o toque chame navigator.share imediatamente
 * (o iPhone exige o gesto do usuário).
 */
export function SaveToPhotosButton({ url, className, tone = "default" }: SaveToPhotosButtonProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<File | null>(null);
  const pendingRef = useRef<Promise<File> | null>(null);

  useEffect(() => {
    fileRef.current = null;
    setDone(false);
    const p = fetchAsFile(url);
    pendingRef.current = p;
    p.then((f) => {
      if (pendingRef.current === p) fileRef.current = f;
    }).catch(() => {
      /* tenta de novo no toque */
    });
    return () => {
      pendingRef.current = null;
    };
  }, [url]);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let file = fileRef.current;
      if (!file) {
        setBusy(true);
        file = await (pendingRef.current ?? fetchAsFile(url)).catch(() => fetchAsFile(url));
        fileRef.current = file;
      }
      const result = await shareOrDownload([file]);
      if (result !== "cancelled") setDone(true);
    } catch (err) {
      console.error("[SaveToPhotos]", err);
      toast({ title: t("savePhotos.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      onClick={onClick}
      disabled={busy}
      aria-label={t("savePhotos.saveOne")}
      className={cn(
        "h-14 w-full gap-3 rounded-2xl text-base font-semibold",
        tone === "light" && "bg-white text-[#0d1a2d] hover:bg-white/90",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : done ? (
        <Check className="h-6 w-6" />
      ) : (
        <Download className="h-6 w-6" />
      )}
      {t("savePhotos.saveOne")}
    </Button>
  );
}

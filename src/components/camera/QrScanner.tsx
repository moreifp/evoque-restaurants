import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, QrCode } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { readQrFromImageData, warmUpQrReader } from "@/lib/qrLink";

interface QrScannerProps {
  open: boolean;
  onClose: () => void;
  /** QR lido: texto do código e o quadro da câmera (vira a foto, se precisar). */
  onResult: (text: string, frame: Blob | null) => void;
}

/**
 * Leitor de QR ao vivo, em tela cheia: câmera traseira, lê sozinho (sem
 * apertar nada) e fecha ao achar. Usa o mesmo leitor das fotos (ZXing + jsQR).
 */
export function QrScanner({ open, onClose, onResult }: QrScannerProps) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    if (!open) return;
    warmUpQrReader();
    setErro(null);
    let parar = false;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        console.warn("[QrScanner] câmera", e);
        setErro(t("qrScan.noCamera"));
        return;
      }
      if (parar || !video.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);

      const loop = async () => {
        while (!parar) {
          const v = video.current;
          if (v && ctx && v.videoWidth) {
            const scale = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const texto = await readQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height)).catch(() => null);
            if (texto && !parar) {
              parar = true;
              navigator.vibrate?.(60);
              // Quadro em tamanho maior para guardar como foto
              const full = document.createElement("canvas");
              full.width = v.videoWidth;
              full.height = v.videoHeight;
              full.getContext("2d")?.drawImage(v, 0, 0);
              const frame = await new Promise<Blob | null>((ok) => full.toBlob(ok, "image/jpeg", 0.85));
              stream?.getTracks().forEach((tr) => tr.stop());
              cb.current(texto, frame);
              return;
            }
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      };
      void loop();
    })();

    return () => {
      parar = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, t]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={t("qrScan.title")}>
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
      {/* Moldura */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-64 w-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <div
        className="relative flex items-center justify-between p-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <p className="flex items-center gap-2 text-xl font-bold text-white">
          <QrCode className="h-7 w-7" /> {t("qrScan.title")}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black"
        >
          <X className="h-8 w-8" />
        </button>
      </div>
      <div className="relative mt-auto p-6 text-center" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}>
        <p className="text-lg font-semibold text-white">{erro ?? t("qrScan.hint")}</p>
      </div>
    </div>,
    document.body,
  );
}

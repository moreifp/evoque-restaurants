import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Images, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { CATEGORIES } from "@/components/add/categories";
import type { PhotoCategory } from "@/lib/draftStore";

export interface CameraShot {
  id: string;
  category: PhotoCategory;
  thumbSrc: string | null;
}

interface QuickCameraProps {
  open: boolean;
  category: PhotoCategory;
  onCategoryChange: (c: PhotoCategory) => void;
  /** Fotos já no rascunho; a faixa mostra só as tiradas nesta sessão da câmera. */
  shots: CameraShot[];
  /** Guarda o original (e a miniatura, se houver). Devolve o id da foto. */
  onCapture: (args: {
    blob: Blob;
    thumb: Blob | null;
    category: PhotoCategory;
    source: "camera" | "gallery";
    name?: string;
  }) => Promise<string | null>;
  onDiscard: (id: string) => void;
  onClose: () => void;
}

const THUMB_SIDE = 320;

function canvasToBlob(c: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** Câmera do app em tela cheia: cada toque no obturador vira um ORIGINAL (JPEG 0.92). */
export function QuickCamera({ open, category, onCategoryChange, shots, onCapture, onDiscard, onClose }: QuickCameraProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"starting" | "live" | "fallback">("starting");
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(0);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const categoryRef = useRef(category);
  categoryRef.current = category;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setMode("starting");
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia || (typeof window !== "undefined" && window.isSecureContext === false)) {
      setMode("fallback");
      return;
    }
    // Num iframe sem allow="camera" o pedido falha: vai direto para o plano B.
    try {
      const fp = (document as unknown as { featurePolicy?: { allowsFeature: (f: string) => boolean } }).featurePolicy;
      if (fp && !fp.allowsFeature("camera")) {
        setMode("fallback");
        return;
      }
    } catch {
      /* sem featurePolicy */
    }
    const ideal: MediaStreamConstraints = {
      video: { facingMode: { ideal: "environment" }, width: { ideal: 4032 }, height: { ideal: 3024 } },
      audio: false,
    };
    let stream: MediaStream | null = null;
    try {
      stream = await md.getUserMedia(ideal);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
        try {
          stream = await md.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        } catch {
          stream = null;
        }
      }
    }
    if (!stream) {
      setMode("fallback");
      return;
    }
    streamRef.current = stream;
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      try {
        await v.play();
      } catch {
        /* autoPlay cuida */
      }
    }
    setMode("live");
  }, [stop]);

  // Abre/fecha
  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    setSessionIds([]);
    void start();
    return () => stop();
  }, [open, start, stop]);

  // iPhone encerra a câmera ao ir para segundo plano: religa ao voltar.
  useEffect(() => {
    if (!open) return;
    const onVis = () => {
      if (document.visibilityState !== "visible" || mode === "fallback") return;
      const live = streamRef.current?.getVideoTracks().some((tr) => tr.readyState === "live");
      if (!live) void start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, mode, start]);

  // Tela cheia sem rolar a página por trás
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const addId = (id: string | null) => {
    if (id) setSessionIds((prev) => [...prev, id]);
  };

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || mode !== "live" || !v.videoWidth || !v.videoHeight) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    const w = v.videoWidth;
    const h = v.videoHeight;
    const cat = categoryRef.current;
    const full = document.createElement("canvas");
    full.width = w;
    full.height = h;
    const ctx = full.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    setBusy((n) => n + 1);
    try {
      const blob = await canvasToBlob(full, 0.92);
      const scale = Math.min(1, THUMB_SIDE / Math.max(w, h));
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(w * scale));
      small.height = Math.max(1, Math.round(h * scale));
      small.getContext("2d")?.drawImage(full, 0, 0, small.width, small.height);
      const thumb = await canvasToBlob(small, 0.7);
      small.width = small.height = 0;
      if (blob) addId(await onCapture({ blob, thumb, category: cat, source: "camera" }));
    } finally {
      // Libera a memória do quadro grande (iPhone é sensível a canvas grandes).
      full.width = full.height = 0;
      setBusy((n) => n - 1);
    }
  };

  const onFiles = async (list: FileList | null, source: "camera" | "gallery") => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    const cat = categoryRef.current;
    setBusy((n) => n + 1);
    try {
      for (const f of files) {
        addId(await onCapture({ blob: f, thumb: null, category: cat, source, name: f.name }));
      }
    } finally {
      setBusy((n) => n - 1);
    }
  };

  const close = () => {
    stop();
    onClose();
  };

  if (!open) return null;

  const strip = shots.filter((s) => sessionIds.includes(s.id));

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-modal="true"
    >
      {/* Categorias */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={close}
          aria-label={t("quickAdd.close")}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15"
        >
          <X className="h-7 w-7" />
        </button>
        <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.key === category;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onCategoryChange(c.key)}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
                  active ? "bg-white text-[#0d1a2d]" : "bg-white/15 text-white",
                )}
                aria-pressed={active}
              >
                <Icon className="h-5 w-5" />
                {t(c.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visor */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn("h-full w-full object-cover", mode !== "live" && "hidden")}
        />
        {mode === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-lg">{t("quickAdd.cameraStarting")}</p>
          </div>
        )}
        {mode === "fallback" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="text-lg text-white/90">{t("quickAdd.cameraFallback")}</p>
            <button
              type="button"
              onClick={() => fallbackRef.current?.click()}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-[#0d1a2d]"
              aria-label={t("quickAdd.takePhoto")}
            >
              <Camera className="h-12 w-12" />
            </button>
            <span className="text-base font-semibold">{t("quickAdd.takePhoto")}</span>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex h-14 items-center gap-3 rounded-2xl border-2 border-white/70 bg-white/20 px-6 text-lg font-bold"
            >
              <Images className="h-7 w-7" />
              {t("quickAdd.gallery")}
            </button>
          </div>
        )}
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}
      </div>

      {/* Faixa de fotos desta sessão */}
      <div className="flex h-20 items-center gap-2 overflow-x-auto px-3 no-scrollbar">
        {strip.length > 0 && (
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-sm font-bold">{strip.length}</span>
        )}
        {strip.map((s) => (
          <div key={s.id} className="relative h-16 w-16 shrink-0">
            {s.thumbSrc ? (
              <img src={s.thumbSrc} alt="" className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-lg bg-white/20" />
            )}
            <button
              type="button"
              onClick={() => {
                setSessionIds((prev) => prev.filter((x) => x !== s.id));
                onDiscard(s.id);
              }}
              aria-label={t("quickAdd.remove")}
              className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {busy > 0 && <Loader2 className="h-6 w-6 shrink-0 animate-spin text-white/70" />}
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between px-4 pb-4 pt-1">
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-white/70 bg-white/20 text-sm font-bold"
        >
          <Images className="h-7 w-7" />
          {t("quickAdd.gallery")}
        </button>

        <button
          type="button"
          onClick={mode === "fallback" ? () => fallbackRef.current?.click() : shoot}
          disabled={mode === "starting"}
          aria-label={t("quickAdd.takePhoto")}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
        >
          <span className="h-16 w-16 rounded-full bg-white transition-transform active:scale-90" />
        </button>

        <button
          type="button"
          onClick={close}
          className="flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-2xl bg-white text-sm font-bold text-[#0d1a2d]"
        >
          <Check className="h-7 w-7" />
          {t("quickAdd.cameraDone")}
        </button>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files, "gallery");
          e.target.value = "";
        }}
      />
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files, "camera");
          e.target.value = "";
        }}
      />
    </div>,
    document.body,
  );
}

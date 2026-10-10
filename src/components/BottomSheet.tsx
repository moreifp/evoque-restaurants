import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Folha que sobe de baixo (celular), com linhas grandes. Fecha no X, no fundo ou no Esc. */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={title} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-4 shadow-xl md:rounded-3xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xl font-bold text-[#0d1a2d]">{title}</p>
          <button type="button" onClick={onClose} aria-label="X" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <X className="h-6 w-6" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

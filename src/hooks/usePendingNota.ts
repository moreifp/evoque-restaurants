import { useEffect, useRef } from "react";
import { fetchPendingNota, type PendingNota } from "@/lib/nfceSend";

/**
 * Procura nota fiscal mandada pelo favorito "Enviar ao Evoque": ao abrir a tela,
 * ao voltar para o app e a cada 8 s com a tela visível. Chama onNota uma vez
 * por nota; se onNota devolver false, tenta de novo na próxima busca.
 */
export function usePendingNota(enabled: boolean, onNota: (n: PendingNota) => Promise<boolean>) {
  const cb = useRef(onNota);
  cb.current = onNota;
  const busy = useRef(false);
  const feitas = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let parado = false;
    const checar = async () => {
      if (parado || busy.current || document.visibilityState !== "visible" || navigator.onLine === false) return;
      busy.current = true;
      try {
        const n = await fetchPendingNota();
        if (n && !feitas.current.has(n.id)) {
          const ok = await cb.current(n);
          if (ok) feitas.current.add(n.id);
        }
      } catch (e) {
        console.warn("[usePendingNota]", e);
      } finally {
        busy.current = false;
      }
    };
    void checar();
    const onVis = () => void checar();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const timer = window.setInterval(() => void checar(), 8000);
    return () => {
      parado = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.clearInterval(timer);
    };
  }, [enabled]);
}

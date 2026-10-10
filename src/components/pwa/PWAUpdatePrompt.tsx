import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Atualização do app: o service worker novo entra sozinho (skipWaiting + clientsClaim).
 * Aqui só (1) procuramos versão nova sempre que o app volta para a tela e a cada 30 min, e
 * (2) quando a versão nova assume, mostramos o aviso "Nova versão disponível" com o botão Atualizar
 *     (fica na tela até tocar); depois de recarregar, aparece "App atualizado".
 */
const FLAG = "evoque_atualizou";

export function PWAUpdatePrompt() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(FLAG) === "1") {
        sessionStorage.removeItem(FLAG);
        toast("App atualizado", { description: "Você está na versão mais nova." });
      }
    } catch {
      /* sem sessionStorage */
    }
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    const atualizar = () => {
      if (reloading) return;
      reloading = true;
      try {
        sessionStorage.setItem(FLAG, "1");
      } catch {
        /* ignora */
      }
      window.location.reload();
    };
    const onController = () => {
      if (!hadController) return; // primeira instalação: nada a avisar
      toast("Nova versão disponível", {
        id: "evoque-update",
        description: "Toque em Atualizar para usar a versão mais nova.",
        action: { label: "Atualizar", onClick: atualizar },
        duration: Infinity,
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    const check = () => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 30 * 60 * 1000);
    check();
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";

/**
 * /nota — aberta pelo favorito "Enviar ao Evoque" na página da nota fiscal
 * (Safari). Lê #k=<chave>&u=<link>&t=<texto>, manda para receive-nfce e
 * avisa para voltar ao app. Não exige login: a chave identifica a pessoa.
 */
type Estado =
  | { fase: "enviando" }
  | { fase: "ok"; total: number; currency: string; items: number; restaurant: string | null }
  | { fase: "erro"; msg: string }
  | { fase: "vazio" };

function money(v: number, cur: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur || "BRL" }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

export default function NotaRecebida() {
  const { t } = useI18n();
  const [estado, setEstado] = useState<Estado>({ fase: "enviando" });
  const pedido = useRef<{ k: string; u: string; t: string } | null>(null);

  const enviar = async () => {
    const p = pedido.current;
    if (!p) return setEstado({ fase: "vazio" });
    setEstado({ fase: "enviando" });
    try {
      const { data, error } = await supabase.functions.invoke("receive-nfce", { body: p });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error || error.message);
      }
      if (!data?.ok) throw new Error(data?.error || "erro");
      setEstado({ fase: "ok", total: data.total, currency: data.currency, items: data.items, restaurant: data.restaurant });
    } catch (e) {
      const m = (e as Error)?.message || "";
      setEstado({ fase: "erro", msg: m === "chave" ? t("nota.badKey") : m === "não parece uma nota" ? t("nota.notReceipt") : t("nota.failed") });
    }
  };

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const k = h.get("k") || "";
    const texto = h.get("t") || "";
    // Tira o texto da nota da barra de endereço/histórico
    window.history.replaceState(null, "", window.location.pathname);
    if (!k || texto.length < 50) {
      setEstado({ fase: "vazio" });
      return;
    }
    pedido.current = { k, u: h.get("u") || "", t: texto };
    void enviar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-center">
      {estado.fase === "enviando" && (
        <>
          <Loader2 className="h-20 w-20 animate-spin text-primary" />
          <p className="text-2xl font-bold">{t("nota.sending")}</p>
        </>
      )}
      {estado.fase === "ok" && (
        <>
          <CheckCircle2 className="h-24 w-24 text-green-600" />
          <p className="text-3xl font-bold">{t("nota.sent")}</p>
          <div className="space-y-1 text-lg">
            {estado.restaurant && <p className="text-muted-foreground">{estado.restaurant}</p>}
            <p>
              {estado.items} {t("nota.items")} · <span className="font-bold">{money(estado.total, estado.currency)}</span>
            </p>
          </div>
          <p className="max-w-xs text-xl">{t("nota.goBack")}</p>
        </>
      )}
      {estado.fase === "erro" && (
        <>
          <XCircle className="h-24 w-24 text-destructive" />
          <p className="max-w-xs text-xl">{estado.msg}</p>
          <button type="button" onClick={() => void enviar()} className="h-16 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground">
            {t("nota.retry")}
          </button>
        </>
      )}
      {estado.fase === "vazio" && (
        <>
          <Receipt className="h-24 w-24 text-muted-foreground" />
          <p className="max-w-xs text-xl">{t("nota.empty")}</p>
        </>
      )}
    </main>
  );
}

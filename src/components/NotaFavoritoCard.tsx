import { useEffect, useState } from "react";
import { Copy, Check, Receipt, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";
import { useToast } from "@/hooks/use-toast";
import { bookmarkletCode, getSendKey, resetSendKey } from "@/lib/nfceSend";

/** Copia texto (com reserva para navegador sem Clipboard API). */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Conta → "Nota fiscal pelo QR": passo a passo para criar no Safari o favorito
 * "Enviar ao Evoque" (com a chave pessoal) e botão para copiar o código.
 */
export function NotaFavoritoCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      setUserId(uid);
      try {
        // Chave carregada antes do toque: o iPhone só copia dentro do gesto
        setCodigo(bookmarkletCode(await getSendKey(uid)));
      } catch (e) {
        console.warn("[NotaFavorito] chave", e);
      }
    })();
  }, []);

  const onCopiar = async () => {
    if (!codigo) return;
    const ok = await copiar(codigo);
    setCopiado(ok);
    toast({ title: ok ? t("nota.codeCopied") : t("nota.copyFailed"), variant: ok ? undefined : "destructive" });
    if (ok) setTimeout(() => setCopiado(false), 3000);
  };

  const onTrocar = async () => {
    if (!userId || !window.confirm(t("nota.resetConfirm"))) return;
    setCodigo(bookmarkletCode(await resetSendKey(userId)));
    toast({ title: t("nota.resetDone") });
  };

  const passos = [t("nota.step1"), t("nota.step2"), t("nota.step3")];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-6 w-6" />
          {t("nota.setupTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-base text-muted-foreground">{t("nota.setupWhat")}</p>
        <ol className="space-y-3">
          {passos.map((p, i) => (
            <li key={i} className="flex gap-3 text-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="pt-1" dangerouslySetInnerHTML={{ __html: p }} />
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => void onCopiar()}
          disabled={!codigo}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
        >
          {!codigo ? <Loader2 className="h-7 w-7 animate-spin" /> : copiado ? <Check className="h-7 w-7" /> : <Copy className="h-7 w-7" />}
          {t("nota.copyCode")}
        </button>
        <p className="text-base text-muted-foreground">{t("nota.howToUse")}</p>
        <button type="button" onClick={() => void onTrocar()} className="text-sm text-muted-foreground underline">
          {t("nota.resetKey")}
        </button>
      </CardContent>
    </Card>
  );
}

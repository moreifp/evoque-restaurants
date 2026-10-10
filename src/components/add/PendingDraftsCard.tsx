import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { refreshRestaurantLists } from "@/lib/entryCache";
import { AlertCircle, Camera, ChevronRight, CloudUpload, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { useUploadWithRetry } from "@/hooks/useUploadWithRetry";
import { SaveOriginalsBar } from "@/components/photos/SaveOriginalsBar";
import { QUEUE_EVENT, deleteDraft, listQueuedDrafts, putDraft, type AddDraft } from "@/lib/draftStore";
import { finishOriginals, saveEntry, type DraftCtx } from "@/lib/draftEngine";

function isInstalled(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * Início: restaurantes guardados no celular ("Salvar depois no Wi-Fi" ou sem
 * internet). Só envia quando a pessoa toca em "Enviar agora".
 */
export function PendingDraftsCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { uploadWithRetry } = useUploadWithRetry();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<AddDraft[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [sending, setSending] = useState<{ i: number; n: number; label: string; pct: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [originals, setOriginals] = useState<{ drafts: AddDraft[]; files: File[] } | null>(null);

  const refresh = useCallback(async (uid: string | null) => {
    if (!uid) return;
    try {
      setDrafts(await listQueuedDrafts(uid));
    } catch {
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    let uid: string | null = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      uid = session?.user?.id ?? null;
      setUserId(uid);
      void refresh(uid);
    });
    const onChange = () => void refresh(uid);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onVis = () => document.visibilityState === "visible" && onChange();
    window.addEventListener(QUEUE_EVENT, onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const sendAll = async () => {
    if (!userId || sending) return;
    const list = drafts;
    const n = list.length;
    const errs: Record<string, string> = {};
    const keepForPhotos: AddDraft[] = [];
    const files: File[] = [];
    let sent = 0;
    for (let k = 0; k < n; k++) {
      if (navigator.onLine === false) {
        errs[list[k].id] = t("quickAdd.noInternet");
        continue;
      }
      let cur = list[k];
      const label = t("quickAdd.sendingItem").replace("{i}", String(k + 1)).replace("{n}", String(n));
      setSending({ i: k + 1, n, label, pct: 0 });
      const ctx: DraftCtx = {
        userId,
        language,
        uploader: uploadWithRetry,
        t,
        get: () => cur,
        set: (fn) => {
          cur = { ...fn(cur), updatedAt: Date.now() };
        },
        persist: () => putDraft(cur),
        onProgress: (sub, pct) => setSending({ i: k + 1, n, label: `${label} ${sub}`, pct }),
      };
      try {
        if (!cur.form.restaurant_name.trim()) throw new Error(t("quickAdd.chooseRestaurant"));
        await saveEntry(ctx);
        const mine = await finishOriginals(ctx);
        if (mine.length) {
          cur = { ...cur, stage: "originals" };
          await putDraft(cur);
          keepForPhotos.push(cur);
          files.push(...mine);
        } else {
          await deleteDraft(cur);
        }
        sent++;
      } catch (e) {
        console.warn("[PendingDrafts] send failed", e);
        errs[cur.id] = (e as { message?: string })?.message || t("quickAdd.sendFailed");
        await putDraft(cur).catch(() => undefined); // guarda o progresso (o que já subiu não repete)
      }
    }
    setSending(null);
    setErrors(errs);
    if (sent) refreshRestaurantLists(queryClient);
    if (files.length) setOriginals({ drafts: keepForPhotos, files });
    else if (sent && !Object.keys(errs).length) toast({ title: t("quickAdd.sentAll") });
    await refresh(userId);
  };

  const finishOriginalsOffer = async () => {
    const o = originals;
    setOriginals(null);
    if (!o) return;
    for (const d of o.drafts) await deleteDraft(d).catch(() => undefined);
    await refresh(userId);
  };

  if (!drafts.length && !originals) return null;

  const title =
    drafts.length === 1 ? t("quickAdd.pendingOne") : t("quickAdd.pendingMany").replace("{n}", String(drafts.length));

  return (
    <div className="mx-auto max-w-xl space-y-3 rounded-3xl border-2 border-[#0d1a2d]/15 bg-background p-4 shadow-md">
      {drafts.length > 0 && (
        <>
          <p className="flex items-center gap-3 text-xl font-bold text-[#0d1a2d]">
            <CloudUpload className="h-8 w-8 shrink-0" />
            {title}
          </p>

          <div className="space-y-1">
            {drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={!!sending}
                onClick={() => navigate(`/dining/add?draft=${encodeURIComponent(d.id)}`)}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-muted/50 disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold text-[#0d1a2d]">
                    {d.form.restaurant_name.trim() || t("quickAdd.noName")}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Camera className="h-4 w-4" /> {d.photos.length}
                    <span className="mx-1">·</span>
                    {d.form.visit_date}
                  </span>
                  {errors[d.id] && (
                    <span className="mt-0.5 flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {t("quickAdd.sendFailed")}: {errors[d.id]}
                      </span>
                    </span>
                  )}
                </span>
                <ChevronRight className="h-6 w-6 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>

          {sending ? (
            <div className="space-y-2 py-1">
              <p className="flex items-center gap-2 text-base font-semibold text-[#0d1a2d]">
                <Loader2 className="h-5 w-5 animate-spin" /> {sending.label}
              </p>
              <Progress value={((sending.i - 1) * 100 + sending.pct) / sending.n} className="h-3" />
            </div>
          ) : (
            <Button
              type="button"
              disabled={!online}
              onClick={() => void sendAll()}
              className="h-16 w-full gap-3 rounded-2xl bg-navy text-xl font-semibold text-white hover:bg-navy/90"
            >
              {online ? <CloudUpload className="h-7 w-7" /> : <WifiOff className="h-7 w-7" />}
              {online ? t("quickAdd.sendNow") : t("quickAdd.noInternet")}
            </Button>
          )}

          {!isInstalled() && <p className="text-center text-xs text-muted-foreground">{t("quickAdd.installTip")}</p>}
        </>
      )}

      {originals && (
        <div className="space-y-3">
          <p className="text-center text-base text-muted-foreground">{t("quickAdd.saveOriginalsHint")}</p>
          <SaveOriginalsBar files={originals.files} onDismiss={() => void finishOriginalsOffer()} />
          <Button
            type="button"
            variant="outline"
            className="h-14 w-full rounded-2xl text-lg font-semibold"
            onClick={() => void finishOriginalsOffer()}
          >
            {t("quickAdd.done")}
          </Button>
        </div>
      )}
    </div>
  );
}

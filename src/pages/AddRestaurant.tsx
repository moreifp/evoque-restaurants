import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { refreshRestaurantLists } from "@/lib/entryCache";
import { ArrowLeft, Check, ChevronRight, Images, Loader2, Save, Star, Trash2, UtensilsCrossed, Wifi, X } from "lucide-react";
import { z } from "zod";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { useUploadWithRetry } from "@/hooks/useUploadWithRetry";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import { QuickCamera } from "@/components/camera/QuickCamera";
import { RestaurantPicker, type PickedRestaurant } from "@/components/add/RestaurantPicker";
import { AiStatusLine, MenuCard, ReceiptCard, WineCard } from "@/components/add/AiCards";
import { AI_CATEGORIES, CATEGORIES, categoryFromPhotoType } from "@/components/add/categories";
import { SaveOriginalsBar } from "@/components/photos/SaveOriginalsBar";
import { compressImage } from "@/lib/imageVariants";
import { cleanupInboxForEntry, removeInboxObjects, removePhotoObjects } from "@/lib/photoStorage";
import {
  deleteDraft,
  forgetDraft,
  getCurrentDraft,
  getDraft,
  idbDel,
  idbGet,
  idbSet,
  listQueuedDrafts,
  newDraftId,
  notifyQueueChanged,
  origKey,
  putDraft,
  thumbKey,
  type AddDraft,
  type AddDraftForm,
  type DraftPhoto,
  type PhotoCategory,
} from "@/lib/draftStore";
import {
  asFile,
  finishOriginals,
  isNetworkError,
  runAi as engineRunAi,
  runQueuedAi as engineRunQueuedAi,
  saveEntry,
  stampName,
  type DraftCtx,
} from "@/lib/draftEngine";
import { placeDetails } from "@/lib/nearby";
import { PendingDraftsCard } from "@/components/add/PendingDraftsCard";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import { BottomSheet } from "@/components/BottomSheet";

/** Rascunho antigo (só texto) do formulário anterior. */
const LEGACY_AUTOSAVE_KEY = "restaurant-draft-autosave";

const entrySchema = z.object({
  restaurant_name: z.string().trim().min(1).max(200),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(5000),
});

const today = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD no fuso do aparelho

function emptyForm(): AddDraftForm {
  return {
    restaurant_name: "",
    visit_date: today(),
    location_address: "",
    location_lat: null,
    location_lng: null,
    google_place_id: null,
    rating: 0,
    notes: "",
  };
}

function newDraft(userId: string): AddDraft {
  return {
    v: 1,
    id: newDraftId(),
    userId,
    stage: "pick",
    form: emptyForm(),
    photos: [],
    entryId: null,
    originScheduledVisitId: null,
    updatedAt: Date.now(),
  };
}

/** Vale guardar no aparelho? (o restaurante escolhido sozinho, pelo GPS, não conta) */
function isMeaningful(d: AddDraft): boolean {
  return (
    d.photos.length > 0 ||
    !!d.form.notes.trim() ||
    d.form.rating > 0 ||
    !!d.entryId ||
    !!d.saved ||
    !!d.queued ||
    !!d.originScheduledVisitId ||
    (!!d.form.restaurant_name.trim() && !d.form.google_place_id)
  );
}

function newId(): string {
  return newDraftId();
}

/** Rascunho do fluxo antigo (entrada is_draft no banco, fotos já enviadas). */
async function loadLegacyDbDraft(userId: string, exclude: string[]): Promise<AddDraft | null> {
  const { data: rows } = await supabase
    .from("restaurant_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("is_draft", true)
    .order("created_at", { ascending: false })
    .limit(10);
  // Rascunhos que já estão no aparelho (salvamento interrompido) não entram de novo
  const entry = (rows ?? []).find((r) => !exclude.includes(r.id));
  if (!entry) return null;

  const [{ data: photos }, { data: receipts }] = await Promise.all([
    supabase
      .from("restaurant_photos")
      .select("id, photo_url, thumb_url, type, menu_translation, caption, created_at")
      .eq("entry_id", entry.id),
    supabase.from("receipts").select("*, receipt_items(*)").eq("entry_id", entry.id),
  ]);

  const list: DraftPhoto[] = [];
  for (const p of photos ?? []) {
    const category = categoryFromPhotoType(p.type);
    list.push({
      id: `r-${p.id}`,
      category,
      createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      source: "gallery",
      hasOriginal: false,
      hasThumb: false,
      remote: true,
      photoUrl: p.photo_url,
      thumbUrl: p.thumb_url,
      rowId: p.id,
      menuTranslation: p.menu_translation ?? undefined,
      caption: p.caption ?? undefined,
      ai: category === "menu" && p.menu_translation ? { status: "done" } : undefined,
    });
  }
  for (const r of receipts ?? []) {
    list.push({
      id: `r-${r.id}`,
      category: "receipt",
      createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
      source: "gallery",
      hasOriginal: false,
      hasThumb: false,
      remote: true,
      photoUrl: r.photo_url,
      thumbUrl: null,
      rowId: r.id,
      receipt: {
        items: (r.receipt_items ?? []).map((it) => ({
          item_type: it.item_type,
          name: it.name,
          name_pt: it.name_pt,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
        })),
        subtotal: r.subtotal,
        tax: r.tax,
        service_fee: r.service_fee,
        total: r.total,
        currency: r.currency,
      },
      ai: { status: "done" },
    });
  }

  return {
    v: 1,
    id: newDraftId(),
    userId,
    stage: "form",
    form: {
      restaurant_name: entry.restaurant_name === "__draft__" ? "" : entry.restaurant_name || "",
      visit_date: entry.visit_date || today(),
      location_address: entry.location_address || "",
      location_lat: entry.location_lat,
      location_lng: entry.location_lng,
      google_place_id: entry.google_place_id,
      rating: entry.rating || 0,
      notes: entry.notes || "",
    },
    photos: list,
    entryId: entry.id,
    originScheduledVisitId: entry.origin_scheduled_visit_id ?? null,
    updatedAt: Date.now(),
  };
}

export default function AddRestaurant({ home = false }: { home?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { uploadWithRetry } = useUploadWithRetry();
  const { data: allEntries = [] } = useRestaurantEntries();
  const entryCount = allEntries.filter((e) => !e.is_draft).length;

  const [draft, setDraft] = useState<AddDraft | null>(null);
  const [noUser, setNoUser] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [camera, setCamera] = useState<{ open: boolean; category: PhotoCategory }>({ open: false, category: "place" });
  const [saving, setSaving] = useState<{ label: string; pct: number } | null>(null);
  const [done, setDone] = useState<{ entryId: string; originals: File[] } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const draftRef = useRef<AddDraft | null>(null);
  const userIdRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout>>();
  const thumbsRef = useRef<Record<string, string>>({});
  /** Originais em memória quando o IndexedDB falha (modo privado etc.). */
  const memBlobs = useRef(new Map<string, Blob>());
  const savingRef = useRef(false);
  const photosRef = useRef<HTMLElement>(null);

  // ---------------------------------------------------------------- estado
  /** Grava o rascunho no aparelho (cada mudança; fotos já foram gravadas no clique). */
  const persistNow = useCallback(async () => {
    clearTimeout(persistTimer.current);
    const d = draftRef.current;
    if (!d || finishedRef.current) return;
    try {
      if (isMeaningful(d)) await putDraft(d);
      else await forgetDraft(d);
      if (d.queued) notifyQueueChanged();
    } catch (e) {
      console.warn("[AddRestaurant] draft persist failed", e);
    }
  }, []);

  const schedulePersist = useCallback(() => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => void persistNow(), 300);
  }, [persistNow]);

  const update = useCallback(
    (fn: (d: AddDraft) => AddDraft) => {
      const cur = draftRef.current;
      if (!cur) return;
      const next = { ...fn(cur), updatedAt: Date.now() };
      draftRef.current = next;
      setDraft(next);
      schedulePersist();
    },
    [schedulePersist],
  );

  const updatePhoto = useCallback(
    (id: string, patch: Partial<DraftPhoto>) =>
      update((d) => ({ ...d, photos: d.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    [update],
  );

  const setForm = useCallback(
    (patch: Partial<AddDraftForm>) => update((d) => ({ ...d, form: { ...d.form, ...patch } })),
    [update],
  );

  const getPhoto = (id: string) => draftRef.current?.photos.find((p) => p.id === id);

  const setThumb = (id: string, url: string | null) => {
    const next = { ...thumbsRef.current };
    if (next[id]) URL.revokeObjectURL(next[id]);
    if (url) next[id] = url;
    else delete next[id];
    thumbsRef.current = next;
    setThumbs(next);
  };

  /** Contexto da rotina de envio (src/lib/draftEngine) para o rascunho aberto. */
  const ctx = (): DraftCtx => ({
    userId: userIdRef.current!,
    language,
    uploader: uploadWithRetry,
    t,
    get: () => draftRef.current!,
    set: update,
    persist: persistNow,
    memBlob: (id) => memBlobs.current.get(id),
    onProgress: (label, pct) => setSaving({ label, pct }),
  });
  const runAi = (id: string) => engineRunAi(ctx(), id);
  const runQueuedAi = () => {
    if (draftRef.current && userIdRef.current) engineRunQueuedAi(ctx());
  };

  // Salva ao sair/ir para segundo plano; libera as miniaturas ao fechar a tela.
  useEffect(() => {
    const flush = () => void persistNow();
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [persistNow]);

  /** Mostra um rascunho na tela (miniaturas do aparelho, IA interrompida volta à fila). */
  const showDraft = async (d0: AddDraft) => {
    const urls: Record<string, string> = {};
    for (const p of d0.photos) {
      if (!p.hasThumb && !p.hasOriginal) continue;
      try {
        const b = (await idbGet<Blob>(p.hasThumb ? thumbKey(p.id) : origKey(p.id))) ?? null;
        if (b) urls[p.id] = URL.createObjectURL(b);
      } catch {
        /* sem miniatura */
      }
    }
    const d: AddDraft = {
      ...d0,
      photos: d0.photos.map((p) => (p.ai?.status === "running" ? { ...p, ai: { status: "queued" } } : p)),
    };
    Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u));
    thumbsRef.current = urls;
    setThumbs(urls);
    finishedRef.current = false;
    draftRef.current = d;
    setDraft(d);
    return d;
  };

  // ---------------------------------------------------------------- abrir
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) {
        setNoUser(true);
        return;
      }
      userIdRef.current = uid;

      const draftParam = searchParams.get("draft");
      const pre = {
        name: searchParams.get("restaurant_name"),
        address: searchParams.get("location_address") || searchParams.get("city"),
        placeId: searchParams.get("google_place_id"),
        visitId: searchParams.get("origin_scheduled_visit_id"),
        date: searchParams.get("visit_date"),
      };
      const hasPrefill = !!(pre.name || pre.visitId);

      let d: AddDraft | null = null;
      let restored = false;
      try {
        if (draftParam) {
          d = await getDraft(uid, draftParam); // item da fila "para enviar"
        } else {
          d = await getCurrentDraft(uid);
          // Veio da Agenda/Viagens com outro restaurante: um rascunho sem fotos dá lugar ao novo.
          if (d && hasPrefill && !d.saved && !d.entryId && d.photos.length === 0) {
            await forgetDraft(d);
            d = null;
          }
        }
        restored = !!d;
      } catch (e) {
        console.warn("[AddRestaurant] IndexedDB unavailable", e);
      }
      if (!d && !draftParam && !hasPrefill && navigator.onLine !== false) {
        try {
          const local = await listQueuedDrafts(uid).catch(() => [] as AddDraft[]);
          const exclude = local.map((x) => x.entryId).filter((x): x is string => !!x);
          d = await loadLegacyDbDraft(uid, exclude);
          restored = !!d;
        } catch (e) {
          console.warn("[AddRestaurant] legacy draft load failed", e);
        }
      }
      if (!d) {
        d = newDraft(uid);
        if (hasPrefill) {
          d.form = {
            ...d.form,
            restaurant_name: pre.name || "",
            location_address: pre.address || "",
            google_place_id: pre.placeId || null,
            visit_date: pre.date && /^\d{4}-\d{2}-\d{2}$/.test(pre.date) ? pre.date : d.form.visit_date,
          };
          d.originScheduledVisitId = pre.visitId;
        } else {
          // Texto do formulário antigo, se houver
          try {
            const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
            const old = raw ? JSON.parse(raw)?.formData : null;
            if (old && (old.notes || old.rating)) {
              d.form = {
                ...d.form,
                restaurant_name: old.restaurant_name || "",
                location_address: old.location_address || "",
                location_lat: old.location_lat ?? null,
                location_lng: old.location_lng ?? null,
                google_place_id: old.google_place_id ?? null,
                rating: old.rating || 0,
                notes: old.notes || "",
              };
              restored = true;
            }
          } catch {
            /* ignora */
          }
        }
      }
      try {
        localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
      } catch {
        /* ignora */
      }
      if (cancelled) return;
      d = await showDraft(d);
      if (restored && isMeaningful(d) && !d.saved && !draftParam) toast({ title: t("quickAdd.draftRestored") });

      // Agenda: tem place_id mas não tem coordenadas
      if (d.form.google_place_id && d.form.location_lat === null && navigator.onLine !== false) {
        const pid = d.form.google_place_id;
        placeDetails(pid)
          .then((p) => {
            if (!p || draftRef.current?.form.google_place_id !== pid) return;
            setForm({
              location_lat: p.lat,
              location_lng: p.lng,
              location_address: draftRef.current.form.location_address || p.address,
            });
          })
          .catch(() => undefined);
      }

      // Entrada já salva, faltando os originais: retoma essa etapa
      if (d.saved && d.entryId) void finishOriginalsStep();
      else runQueuedAi();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => runQueuedAi();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- fotos
  const discardPhoto = async (id: string) => {
    const p = getPhoto(id);
    if (!p) return;
    update((d) => ({ ...d, photos: d.photos.filter((x) => x.id !== id) }));
    setThumb(id, null);
    memBlobs.current.delete(id);
    await persistNow();
    idbDel([origKey(id), thumbKey(id)]).catch(() => undefined);
    try {
      if (p.rowId) {
        if (p.category === "receipt") {
          await supabase.from("receipts").delete().eq("id", p.rowId);
          await removePhotoObjects([p.photoUrl]);
        } else {
          const { data: row } = await supabase
            .from("restaurant_photos")
            .select("original_path")
            .eq("id", p.rowId)
            .maybeSingle();
          await supabase.from("restaurant_photos").delete().eq("id", p.rowId);
          await removeInboxObjects([row?.original_path]);
        }
      } else if (p.photoUrl) {
        // Enviada só para a IA, ainda sem linha no banco
        await removePhotoObjects([p.photoUrl, p.thumbUrl]);
      }
    } catch (e) {
      console.warn("[AddRestaurant] discard cleanup failed", e);
    }
  };

  /** Cada toque no obturador: o ORIGINAL vai para o IndexedDB na hora, antes de qualquer outra coisa. */
  const handleCapture = async ({
    blob,
    thumb,
    category,
    source,
    name,
  }: {
    blob: Blob;
    thumb: Blob | null;
    category: PhotoCategory;
    source: "camera" | "gallery";
    name?: string;
  }): Promise<string | null> => {
    if (!draftRef.current) return null;
    const id = newId();
    const fileName = name || stampName();
    try {
      await idbSet(origKey(id), blob);
    } catch (e) {
      console.warn("[AddRestaurant] IndexedDB write failed, keeping in memory", e);
      memBlobs.current.set(id, blob);
    }
    let small = thumb;
    if (!small) {
      try {
        const c = await compressImage(asFile(blob, fileName), 320, 0.7);
        small = c.changed ? c.file : null;
      } catch {
        small = null;
      }
    }
    let thumbStored = false;
    if (small && !memBlobs.current.has(id)) {
      try {
        await idbSet(thumbKey(id), small);
        thumbStored = true;
      } catch {
        thumbStored = false;
      }
    }
    setThumb(id, URL.createObjectURL(small ?? blob));

    // Um recibo por restaurante: o novo substitui o anterior
    if (category === "receipt") {
      const old = draftRef.current.photos.filter((p) => p.category === "receipt");
      if (old.length) {
        for (const o of old) await discardPhoto(o.id);
        toast({ title: t("quickAdd.receiptReplaced") });
      }
    }

    const photo: DraftPhoto = {
      id,
      category,
      createdAt: Date.now(),
      source,
      fileName,
      hasOriginal: true,
      hasThumb: thumbStored,
      ai: AI_CATEGORIES.includes(category) ? { status: "queued" } : undefined,
    };
    update((d) => ({ ...d, photos: [...d.photos, photo] }));
    await persistNow();
    if (photo.ai) void runAi(id); // IA na hora (sem internet: fica na fila)
    return id;
  };

  const openCamera = (category: PhotoCategory) => setCamera({ open: true, category });

  // "Escolher da galeria" na tela: abre as fotos do iPhone e depois pergunta a categoria.
  // Mesmo caminho das fotos da câmera (handleCapture): original no IndexedDB,
  // display + miniatura ao salvar, original ao Drive do dono com nome e metadados.
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[] | null>(null);
  const [importing, setImporting] = useState(0);
  const addGalleryFiles = async (category: PhotoCategory) => {
    const files = galleryFiles ?? [];
    setGalleryFiles(null);
    setImporting(files.length);
    try {
      for (const f of files) {
        await handleCapture({ blob: f, thumb: null, category, source: "gallery", name: f.name });
        setImporting((n) => Math.max(0, n - 1));
      }
    } finally {
      setImporting(0);
      setTimeout(() => photosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };

  // ---------------------------------------------------------------- salvar
  const cleanupAndFinish = async () => {
    const d = draftRef.current;
    finishedRef.current = true;
    clearTimeout(persistTimer.current);
    if (d) await deleteDraft(d).catch(() => undefined);
    memBlobs.current.clear();
    notifyQueueChanged();
  };

  const goToEntry = (entryId: string) => navigate(`/dining/${entryId}`, { replace: true });
  /** Salvo: no início volta a uma tela vazia (o novo aparece na lista); em /dining/add abre a ficha. */
  const afterSaved = (entryId: string) => {
    if (home) {
      setDone(null);
      resetToFresh();
    } else goToEntry(entryId);
  };

  /** Depois de salvo: originais ao Drive (dono) ou "Salvar no Fotos"; só então apaga do aparelho. */
  const finishOriginalsStep = async () => {
    const d = draftRef.current;
    if (!d?.entryId || !userIdRef.current) return;
    const entryId = d.entryId;
    const files = await finishOriginals(ctx());
    if (!files.length) {
      await cleanupAndFinish();
      setSaving(null);
      setDone({ entryId, originals: [] });
      setTimeout(() => afterSaved(entryId), 1400);
      return;
    }
    update((x) => ({ ...x, stage: "originals" }));
    await persistNow();
    setSaving(null);
    setDone({ entryId, originals: files });
  };

  /** Recomeça com um "Novo restaurante" vazio (o anterior ficou guardado). */
  const resetToFresh = () => {
    const uid = userIdRef.current;
    if (!uid) return;
    setCamera((c) => ({ ...c, open: false }));
    void showDraft(newDraft(uid));
    if (searchParams.get("draft")) navigate(home ? "/" : "/dining/add", { replace: true });
    window.scrollTo({ top: 0 });
  };

  /** Fila "para enviar": guarda no aparelho e envia depois (Wi-Fi). */
  const moveToQueue = async (reason: "later" | "offline") => {
    if (!draftRef.current) return;
    update((x) => ({ ...x, queued: true }));
    await persistNow();
    notifyQueueChanged();
    toast({ title: reason === "offline" ? t("quickAdd.queuedOffline") : t("quickAdd.queuedLater") });
    resetToFresh();
  };

  const handleSave = async () => {
    const d = draftRef.current;
    const uid = userIdRef.current;
    if (!d || !uid || savingRef.current) return;
    if (d.saved && d.entryId) {
      savingRef.current = true;
      try {
        await finishOriginalsStep();
      } catch (e) {
        setSaving(null);
        if (isNetworkError(e)) await moveToQueue("offline");
        else toast({ title: t("quickAdd.saveError"), description: (e as Error)?.message, variant: "destructive" });
      } finally {
        savingRef.current = false;
      }
      return;
    }
    if (!d.form.restaurant_name.trim()) {
      toast({ title: t("quickAdd.chooseRestaurant") });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const check = entrySchema.safeParse(d.form);
    if (!check.success) {
      toast({
        title: t("addRestaurant.validationError"),
        description: check.error.errors.map((e) => e.path.join(".")).join(", "),
        variant: "destructive",
      });
      return;
    }
    if (navigator.onLine === false) {
      await moveToQueue("offline");
      return;
    }

    savingRef.current = true;
    try {
      await saveEntry(ctx());
      refreshRestaurantLists(queryClient);
      setSaving({ label: t("quickAdd.savingEntry"), pct: 80 });
      await finishOriginalsStep();
    } catch (e) {
      console.error("[AddRestaurant] save failed", e);
      setSaving(null);
      if (isNetworkError(e)) {
        await moveToQueue("offline");
      } else {
        toast({
          title: t("quickAdd.saveError"),
          description: (e as { message?: string })?.message,
          variant: "destructive",
        });
      }
    } finally {
      savingRef.current = false;
    }
  };

  const handleDiscardDraft = async () => {
    const d = draftRef.current;
    setConfirmDiscard(false);
    if (!d) return;
    const uploadedOnly = d.photos.filter((p) => !p.rowId && p.photoUrl);
    await cleanupAndFinish();
    removePhotoObjects(uploadedOnly.flatMap((p) => [p.photoUrl, p.thumbUrl])).catch(() => undefined);
    if (d.entryId && !d.saved) {
      try {
        await cleanupInboxForEntry(d.entryId);
        await supabase.from("restaurant_entries").delete().eq("id", d.entryId).eq("is_draft", true);
        refreshRestaurantLists(queryClient);
      } catch (e) {
        console.warn("[AddRestaurant] could not delete db draft", e);
      }
    }
    if (home) resetToFresh();
    else navigate("/dining", { replace: true });
  };

  useEffect(() => {
    if (noUser) navigate("/auth", { replace: true });
  }, [noUser, navigate]);

  // ---------------------------------------------------------------- tela
  if (!draft) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const form = draft.form;
  const photos = draft.photos;
  const picked: PickedRestaurant | null = form.restaurant_name
    ? {
        name: form.restaurant_name,
        address: form.location_address,
        lat: form.location_lat,
        lng: form.location_lng,
        placeId: form.google_place_id,
      }
    : null;
  const countBy = (c: PhotoCategory) => photos.filter((p) => p.category === c).length;
  const thumbSrc = (p: DraftPhoto) => thumbs[p.id] ?? p.thumbUrl ?? p.photoUrl ?? null;

  const tiles = (
    <div className="grid grid-cols-3 gap-3">
      {CATEGORIES.map((c) => {
        const Icon = c.icon;
        const n = countBy(c.key);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => openCamera(c.key)}
            className="relative flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[#0d1a2d]/10 bg-background shadow-sm transition-transform active:scale-95"
            aria-label={t(c.labelKey)}
          >
            <Icon className="h-10 w-10 text-[#0d1a2d]" strokeWidth={1.8} />
            <span className="text-base font-semibold text-[#0d1a2d]">{t(c.labelKey)}</span>
            {n > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-navy px-1.5 text-xs font-bold text-white">
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />

      <main className="container mx-auto px-4 main-content-padding pb-28 md:pb-10">
        <div className="mx-auto max-w-xl space-y-6">
          {/* Cabeçalho */}
          {/* Guardados no celular, esperando o Wi-Fi */}
          {home && <PendingDraftsCard />}

          <div className="flex min-h-12 items-center gap-2">
            {!home && (
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12"
                aria-label={t("common.back")}
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-7 w-7" />
              </Button>
            )}
            <h1 className="flex-1 text-3xl font-bold text-[#0d1a2d]">
              {t("quickAdd.title")}
            </h1>
            {isMeaningful(draft) && !draft.saved && (
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 text-muted-foreground"
                aria-label={t("quickAdd.discard")}
                onClick={() => setConfirmDiscard(true)}
              >
                <Trash2 className="h-6 w-6" />
              </Button>
            )}
          </div>

          {/* 1. Restaurante */}
          <section className="-mt-3 space-y-2">
            <div className="rounded-3xl bg-background/70 p-2 shadow-sm">
              <RestaurantPicker
                key={draft.id}
                selected={picked}
                autoSelectNearest={!form.restaurant_name}
                onSelect={(r) =>
                  setForm({
                    restaurant_name: r.name,
                    location_address: r.address,
                    location_lat: r.lat,
                    location_lng: r.lng,
                    google_place_id: r.placeId,
                  })
                }
              />
            </div>
          </section>

          {/* 2. Fotos: ícones grandes, miniaturas e leituras da IA */}
          <section ref={photosRef} className="scroll-mt-20 space-y-4">
            <p className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("quickAdd.photos")}
            </p>
            {tiles}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={importing > 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-[#0d1a2d]/80 underline-offset-4 hover:underline"
            >
              {importing > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Images className="h-5 w-5" />}
              {t("quickAdd.galleryPick")}
            </button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).filter(
                  (f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name),
                );
                e.target.value = "";
                if (list.length) setGalleryFiles(list);
              }}
            />
            {CATEGORIES.map((c) => {
              const list = photos.filter((p) => p.category === c.key);
              if (!list.length) return null;
              const Icon = c.icon;
              return (
                <div key={c.key} className="space-y-2">
                  <p className="flex items-center gap-2 text-base font-semibold text-[#0d1a2d]">
                    <Icon className="h-5 w-5" /> {t(c.labelKey)}
                    <span className="text-muted-foreground">{list.length}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {list.map((p) => {
                      const src = thumbSrc(p);
                      return (
                        <div key={p.id} className="relative aspect-square">
                          {src ? (
                            <img src={src} alt="" className="h-full w-full rounded-xl object-cover" loading="lazy" />
                          ) : (
                            <div className="h-full w-full rounded-xl bg-muted" />
                          )}
                          <button
                            type="button"
                            onClick={() => void discardPhoto(p.id)}
                            aria-label={t("quickAdd.remove")}
                            className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {AI_CATEGORIES.includes(c.key) &&
                    list.map((p) => (
                      <div key={`ai-${p.id}`} className="space-y-2">
                        <AiStatusLine
                          photo={p}
                          readingKey={
                            c.key === "receipt"
                              ? "quickAdd.receiptReading"
                              : c.key === "menu"
                                ? "quickAdd.menuReading"
                                : "quickAdd.wineReading"
                          }
                          onRetry={() => {
                            updatePhoto(p.id, { ai: { status: "queued" } });
                            void runAi(p.id);
                          }}
                        />
                        {c.key === "receipt" && p.receipt && <ReceiptCard data={p.receipt} />}
                        {c.key === "menu" && p.menuTranslation && <MenuCard translation={p.menuTranslation} />}
                        {c.key === "wine" && p.wineInfo && <WineCard info={p.wineInfo} />}
                      </div>
                    ))}
                </div>
              );
            })}
          </section>

          {/* 3. Avaliação e data */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setForm({ rating: form.rating === star ? 0 : star })}
                  className="p-1 transition-transform active:scale-90"
                  aria-label={`${t("addRestaurant.rating")} ${star}`}
                >
                  <Star
                    className={cn(
                      "h-11 w-11 transition-colors",
                      star <= form.rating ? "fill-accent text-accent" : "text-muted-foreground/50",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 px-1">
              <Label htmlFor="visit_date" className="text-sm text-muted-foreground">
                {t("addRestaurant.visitDate")}
              </Label>
              <Input
                id="visit_date"
                type="date"
                value={form.visit_date}
                onChange={(e) => setForm({ visit_date: e.target.value })}
                className="h-11 w-44 rounded-xl text-base"
              />
            </div>
          </section>

          {/* 4. Notas */}
          <section className="space-y-2">
            <Label htmlFor="notes" className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("addRestaurant.notes")}
            </Label>
            <div className="relative">
              <Textarea
                id="notes"
                placeholder={t("addRestaurant.notesPlaceholder")}
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ notes: e.target.value })}
                className="min-h-[120px] rounded-2xl pr-12 text-lg"
              />
              <VoiceNoteButton
                onTranscribed={(text) => {
                  const cur = draftRef.current?.form.notes ?? "";
                  setForm({ notes: cur ? `${cur}\n\n${text}` : text });
                }}
              />
            </div>
          </section>

          {/* 5. Salvar */}
          <section className="space-y-3">
            <Button
              type="button"
              disabled={!!saving}
              onClick={() => void handleSave()}
              className="h-16 w-full gap-3 rounded-2xl bg-navy text-xl font-semibold text-white hover:bg-navy/90"
            >
              {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
              {t("quickAdd.save")}
            </Button>
            {!draft.saved && (
              <Button
                type="button"
                variant="outline"
                disabled={!!saving}
                onClick={() => void moveToQueue("later")}
                className="h-14 w-full gap-3 rounded-2xl border-2 text-lg font-semibold text-[#0d1a2d]"
              >
                <Wifi className="h-6 w-6" />
                {t("quickAdd.saveLater")}
              </Button>
            )}
          </section>
        </div>

        {/* Início: as experiências passadas ficam por último, num botão para a aba Restaurantes */}
        {home && (
          <div className="mx-auto mt-10 max-w-xl border-t-2 border-[#0d1a2d]/10 pt-6">
            <button
              type="button"
              onClick={() => navigate("/dining")}
              className="flex h-20 w-full items-center gap-4 rounded-3xl border-2 border-[#0d1a2d]/15 bg-background px-5 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <UtensilsCrossed className="h-9 w-9 shrink-0 text-[#0d1a2d]" />
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold text-[#0d1a2d]">{t("home.culinaryExperience")}</span>
                {entryCount > 0 && (
                  <span className="block text-sm text-muted-foreground">
                    {t("home.restaurantCount").replace("{n}", String(entryCount))}
                  </span>
                )}
              </span>
              <ChevronRight className="h-7 w-7 shrink-0 text-muted-foreground" />
            </button>
          </div>
        )}
      </main>

      <QuickCamera
        open={camera.open}
        category={camera.category}
        onCategoryChange={(c) => setCamera((s) => ({ ...s, category: c }))}
        shots={photos.map((p) => ({ id: p.id, category: p.category, thumbSrc: thumbSrc(p) }))}
        onCapture={handleCapture}
        onDiscard={(id) => void discardPhoto(id)}
        onClose={() => {
          setCamera((s) => ({ ...s, open: false }));
          setTimeout(() => photosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
        }}
      />

      {/* Salvando */}
      {saving && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/95 px-8">
          <Loader2 className="h-14 w-14 animate-spin text-[#0d1a2d]" />
          <p className="text-center text-xl font-semibold text-[#0d1a2d]">{saving.label}</p>
          <Progress value={saving.pct} className="h-3 w-full max-w-xs" />
        </div>
      )}

      {/* Pronto */}
      {done && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background px-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-navy text-white">
            <Check className="h-14 w-14" />
          </div>
          <p className="text-3xl font-bold text-[#0d1a2d]">{t("quickAdd.saved")}</p>
          {done.originals.length > 0 ? (
            <div className="w-full max-w-md space-y-4">
              <p className="text-center text-base text-muted-foreground">{t("quickAdd.saveOriginalsHint")}</p>
              <SaveOriginalsBar
                files={done.originals}
                onDismiss={async () => {
                  await cleanupAndFinish();
                  afterSaved(done.entryId);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-14 w-full rounded-2xl text-lg font-semibold"
                onClick={async () => {
                  await cleanupAndFinish();
                  afterSaved(done.entryId);
                }}
              >
                {t("quickAdd.done")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-14 rounded-2xl px-8 text-lg font-semibold"
              onClick={() => goToEntry(done.entryId)}
            >
              {t("quickAdd.viewRestaurant")}
            </Button>
          )}
        </div>
      )}

      <BottomSheet
        open={!!galleryFiles}
        title={t("quickAdd.galleryWhich").replace("{n}", String(galleryFiles?.length ?? 0))}
        onClose={() => setGalleryFiles(null)}
      >
        <div className="grid grid-cols-3 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => void addGalleryFiles(c.key)}
                className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[#0d1a2d]/10 bg-background active:scale-95"
              >
                <Icon className="h-9 w-9 text-[#0d1a2d]" strokeWidth={1.8} />
                <span className="text-base font-semibold text-[#0d1a2d]">{t(c.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-xl">{t("quickAdd.discardConfirm")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="h-14 w-full bg-destructive text-lg text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDiscardDraft()}
            >
              {t("quickAdd.discardYes")}
            </AlertDialogAction>
            <AlertDialogCancel className="h-14 w-full text-lg">{t("quickAdd.keep")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

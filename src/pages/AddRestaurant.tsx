import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Pencil, Save, Star, Trash2, X } from "lucide-react";
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
import { useAIConsent } from "@/hooks/useAIConsent";
import { useUploadWithRetry } from "@/hooks/useUploadWithRetry";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import { QuickCamera } from "@/components/camera/QuickCamera";
import { RestaurantPicker, type PickedRestaurant } from "@/components/add/RestaurantPicker";
import { AiStatusLine, MenuCard, ReceiptCard, WineCard } from "@/components/add/AiCards";
import { AI_CATEGORIES, CATEGORIES, CATEGORY_BY_KEY, categoryFromPhotoType } from "@/components/add/categories";
import { SaveOriginalsBar } from "@/components/photos/SaveOriginalsBar";
import { compressImage } from "@/lib/imageVariants";
import {
  PHOTO_BUCKET,
  cleanupInboxForEntry,
  getDriveStatus,
  kickDriveBackup,
  removeInboxObjects,
  removePhotoObjects,
  uploadOriginalToInbox,
  uploadPhotoVariants,
} from "@/lib/photoStorage";
import {
  deleteDraft,
  draftKey,
  idbDel,
  idbGet,
  idbSet,
  origKey,
  thumbKey,
  type AddDraft,
  type AddDraftForm,
  type DraftPhoto,
  type PhotoCategory,
  type ReceiptData,
} from "@/lib/draftStore";
import { placeDetails } from "@/lib/nearby";

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
    userId,
    stage: "pick",
    form: emptyForm(),
    photos: [],
    entryId: null,
    originScheduledVisitId: null,
    updatedAt: Date.now(),
  };
}

function isMeaningful(d: AddDraft): boolean {
  return (
    d.photos.length > 0 ||
    !!d.form.notes.trim() ||
    d.form.rating > 0 ||
    !!d.entryId ||
    !!d.saved ||
    !!d.originScheduledVisitId
  );
}

function stampName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `Evoque_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${Math.random().toString(36).slice(2, 5)}.jpg`;
}

function asFile(blob: Blob, name?: string): File {
  if (blob instanceof File) return blob;
  return new File([blob], name || stampName(), { type: blob.type || "image/jpeg" });
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Rascunho do fluxo antigo (entrada is_draft no banco, fotos já enviadas). */
async function loadLegacyDbDraft(userId: string): Promise<AddDraft | null> {
  const { data: entry } = await supabase
    .from("restaurant_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("is_draft", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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

export default function AddRestaurant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { ensureAIConsent } = useAIConsent();
  const { uploadWithRetry } = useUploadWithRetry();

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
  const aiJobs = useRef(new Map<string, Promise<void>>());
  const uploadJobs = useRef(new Map<string, Promise<string>>());
  const savingRef = useRef(false);

  // ---------------------------------------------------------------- estado
  const persistNow = useCallback(async () => {
    clearTimeout(persistTimer.current);
    const d = draftRef.current;
    if (!d || finishedRef.current) return;
    try {
      if (isMeaningful(d)) await idbSet(draftKey(d.userId), d);
      else await idbDel(draftKey(d.userId));
    } catch (e) {
      console.warn("[AddRestaurant] draft persist failed", e);
    }
  }, []);

  const schedulePersist = useCallback(() => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => void persistNow(), 400);
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

  const getOriginal = async (id: string): Promise<Blob | null> => {
    const mem = memBlobs.current.get(id);
    if (mem) return mem;
    try {
      return (await idbGet<Blob>(origKey(id))) ?? null;
    } catch {
      return null;
    }
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

      const pre = {
        name: searchParams.get("restaurant_name"),
        address: searchParams.get("location_address") || searchParams.get("city"),
        placeId: searchParams.get("google_place_id"),
        visitId: searchParams.get("origin_scheduled_visit_id"),
        date: searchParams.get("visit_date"),
      };
      const hasPrefill = !!(pre.name || pre.visitId);

      let d: AddDraft | null = null;
      try {
        const saved = await idbGet<AddDraft>(draftKey(uid));
        if (saved && saved.v === 1 && saved.userId === uid) d = saved;
      } catch (e) {
        console.warn("[AddRestaurant] IndexedDB unavailable", e);
      }
      // Veio da Agenda com outro restaurante: um rascunho sem fotos dá lugar ao novo.
      if (d && hasPrefill && !d.saved && !d.entryId && d.photos.length === 0) {
        await idbDel(draftKey(uid)).catch(() => undefined);
        d = null;
      }
      let restored = !!d;
      if (!d && !hasPrefill && navigator.onLine !== false) {
        try {
          d = await loadLegacyDbDraft(uid);
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

      // Miniaturas locais
      const urls: Record<string, string> = {};
      for (const p of d.photos) {
        if (!p.hasThumb && !p.hasOriginal) continue;
        try {
          const b = (await idbGet<Blob>(p.hasThumb ? thumbKey(p.id) : origKey(p.id))) ?? null;
          if (b) urls[p.id] = URL.createObjectURL(b);
        } catch {
          /* sem miniatura */
        }
      }
      // IA que estava rodando quando o app fechou volta para a fila
      d = {
        ...d,
        photos: d.photos.map((p) => (p.ai?.status === "running" ? { ...p, ai: { status: "queued" } } : p)),
      };
      if (cancelled) {
        Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      thumbsRef.current = urls;
      setThumbs(urls);
      draftRef.current = d;
      setDraft(d);
      if (restored && isMeaningful(d) && !d.saved) toast({ title: t("quickAdd.draftRestored") });

      // Agenda: tem place_id mas não tem coordenadas
      if (d.form.google_place_id && d.form.location_lat === null && navigator.onLine !== false) {
        placeDetails(d.form.google_place_id)
          .then((p) => {
            if (!p || draftRef.current?.form.google_place_id !== d!.form.google_place_id) return;
            setForm({
              location_lat: p.lat,
              location_lng: p.lng,
              location_address: draftRef.current.form.location_address || p.address,
            });
          })
          .catch(() => undefined);
      }

      // Entrada já salva, faltando os originais: retoma essa etapa
      if (d.saved && d.entryId) void finishOriginals();
      else runQueuedAi();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- upload + IA
  const ensureUploaded = (id: string): Promise<string> => {
    const p = getPhoto(id);
    if (!p) return Promise.reject(new Error("photo gone"));
    if (p.photoUrl) return Promise.resolve(p.photoUrl);
    const running = uploadJobs.current.get(id);
    if (running) return running;
    const job = (async () => {
      const uid = userIdRef.current;
      if (!uid) throw new Error("Not authenticated");
      const blob = await getOriginal(id);
      if (!blob) throw new Error("original missing");
      const file = asFile(blob, p.fileName);
      let url: string;
      if (p.category === "receipt") {
        // Recibo: JPEG 1600 px (sem miniatura, sem Drive) — igual ao fluxo antigo
        const c = await compressImage(file, 1600, 0.85);
        const path = `receipts/${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${c.ext}`;
        const res = await uploadWithRetry({
          bucket: PHOTO_BUCKET,
          filePath: path,
          file: c.file,
          category: "receipt",
          maxRetries: 3,
          cacheControl: "31536000",
          contentType: c.file.type || undefined,
        });
        if (!res.success || !res.publicUrl) throw new Error(res.error || "Upload failed");
        url = res.publicUrl;
        updatePhoto(id, { photoUrl: url, thumbUrl: null });
      } else {
        const res = await uploadPhotoVariants({
          userId: uid,
          entryId: draftRef.current?.entryId ?? null,
          file,
          kind: CATEGORY_BY_KEY[p.category].photoType,
          uploader: uploadWithRetry,
        });
        if (!res.value) throw new Error(res.error || "Upload failed");
        url = res.value.photoUrl;
        updatePhoto(id, { photoUrl: url, thumbUrl: res.value.thumbUrl });
      }
      await persistNow();
      return url;
    })();
    uploadJobs.current.set(id, job);
    job.finally(() => uploadJobs.current.delete(id)).catch(() => undefined);
    return job;
  };

  const runAi = (id: string): Promise<void> => {
    const existing = aiJobs.current.get(id);
    if (existing) return existing;
    const p = getPhoto(id);
    if (!p || !AI_CATEGORIES.includes(p.category) || p.ai?.status === "done" || !p.ai) return Promise.resolve();
    if (navigator.onLine === false) {
      if (p.ai.status !== "queued") updatePhoto(id, { ai: { status: "queued" } });
      return Promise.resolve();
    }
    const job = (async () => {
      const scope =
        p.category === "receipt" ? "invoice_transcription" : p.category === "menu" ? "menu_translation" : "wine_recognition";
      const allowed = await ensureAIConsent(scope);
      if (!allowed) {
        updatePhoto(id, { ai: undefined });
        return;
      }
      updatePhoto(id, { ai: { status: "running" } });
      try {
        const imageUrl = await ensureUploaded(id);
        const cur = getPhoto(id);
        if (!cur) return;
        if (cur.category === "receipt") {
          const { data, error } = await supabase.functions.invoke("process-receipt", { body: { imageUrl } });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const rec = (data?.data ?? data) as ReceiptData;
          updatePhoto(id, { receipt: rec, ai: { status: "done" } });
        } else if (cur.category === "menu") {
          const { data, error } = await supabase.functions.invoke("translate-menu", {
            body: {
              imageUrl,
              targetLanguage: language === "en" ? "English" : "Portuguese",
              // com o id a tradução já fica gravada na foto
              ...(cur.rowId ? { photoId: cur.rowId } : {}),
            },
          });
          if (error) throw error;
          if (!data?.translation) throw new Error(data?.error || "No translation");
          updatePhoto(id, { menuTranslation: data.translation as string, ai: { status: "done" } });
        } else {
          const { data, error } = await supabase.functions.invoke("analyze-wine-label", { body: { imageUrl } });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const info = (data?.wineInfo ?? null) as Record<string, unknown> | null;
          const caption = info ? `${info.name ?? ""} ${info.vintage ?? ""}`.trim() : "";
          updatePhoto(id, { wineInfo: info, caption: caption || undefined, ai: { status: "done" } });
          if (cur.rowId && caption && !cur.remote) {
            await supabase.from("restaurant_photos").update({ caption }).eq("id", cur.rowId);
          }
        }
      } catch (e) {
        console.warn("[AddRestaurant] AI failed", e);
        updatePhoto(id, {
          ai: { status: navigator.onLine === false ? "queued" : "error", error: (e as Error)?.message },
        });
      } finally {
        await persistNow();
      }
    })();
    aiJobs.current.set(id, job);
    job.finally(() => aiJobs.current.delete(id)).catch(() => undefined);
    return job;
  };

  const runQueuedAi = () => {
    const d = draftRef.current;
    if (!d || navigator.onLine === false) return;
    d.photos.filter((p) => p.ai?.status === "queued").forEach((p) => void runAi(p.id));
  };

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
    let small = thumb;
    if (!small) {
      try {
        const c = await compressImage(asFile(blob, fileName), 320, 0.7);
        small = c.changed ? c.file : null;
      } catch {
        small = null;
      }
    }
    let stored = true;
    try {
      await idbSet(origKey(id), blob);
      if (small) await idbSet(thumbKey(id), small);
    } catch (e) {
      console.warn("[AddRestaurant] IndexedDB write failed, keeping in memory", e);
      stored = false;
      memBlobs.current.set(id, blob);
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
      hasOriginal: stored,
      hasThumb: stored && !!small,
      ai: AI_CATEGORIES.includes(category) ? { status: "queued" } : undefined,
    };
    update((d) => ({ ...d, photos: [...d.photos, photo] }));
    await persistNow();
    if (photo.ai) void runAi(id);
    return id;
  };

  const openCamera = (category: PhotoCategory) => setCamera({ open: true, category });

  // ---------------------------------------------------------------- salvar
  const cleanupAndFinish = async () => {
    const d = draftRef.current;
    finishedRef.current = true;
    clearTimeout(persistTimer.current);
    if (d) await deleteDraft(d).catch(() => undefined);
    memBlobs.current.clear();
  };

  const goToEntry = (entryId: string) => navigate(`/dining/${entryId}`, { replace: true });

  const finishOriginals = async () => {
    const d = draftRef.current;
    const uid = userIdRef.current;
    if (!d?.entryId || !uid) return;
    const entryId = d.entryId;
    const candidates = d.photos.filter((p) => p.hasOriginal && !p.remote && p.category !== "receipt" && p.rowId);
    const drive = candidates.length ? await getDriveStatus(uid) : false;

    if (drive) {
      const todo = candidates.filter((p) => !p.originalStashed);
      let i = 0;
      for (const p of todo) {
        i++;
        setSaving({
          label: t("quickAdd.originalsDrive").replace("{i}", String(i)).replace("{n}", String(todo.length)),
          pct: 80 + (20 * i) / Math.max(1, todo.length),
        });
        const blob = await getOriginal(p.id);
        if (!blob) continue;
        await uploadOriginalToInbox({ userId: uid, photoId: p.rowId!, file: asFile(blob, p.fileName) });
        updatePhoto(p.id, { originalStashed: true });
        await persistNow();
      }
      kickDriveBackup(uid);
      await cleanupAndFinish();
      setSaving(null);
      setDone({ entryId, originals: [] });
      setTimeout(() => goToEntry(entryId), 1400);
      return;
    }

    // Sem Drive: oferece guardar no Fotos as que a câmera do app tirou
    const fromCamera = candidates.filter((p) => p.source === "camera");
    if (!fromCamera.length) {
      await cleanupAndFinish();
      setSaving(null);
      setDone({ entryId, originals: [] });
      setTimeout(() => goToEntry(entryId), 1400);
      return;
    }
    const files: File[] = [];
    for (const p of fromCamera) {
      const blob = await getOriginal(p.id);
      if (blob) files.push(asFile(blob, p.fileName));
    }
    update((x) => ({ ...x, stage: "originals" }));
    await persistNow();
    setSaving(null);
    setDone({ entryId, originals: files });
  };

  const handleSave = async () => {
    const d = draftRef.current;
    const uid = userIdRef.current;
    if (!d || !uid || savingRef.current) return;
    if (d.saved && d.entryId) {
      savingRef.current = true;
      try {
        await finishOriginals();
      } catch (e) {
        setSaving(null);
        toast({ title: t("quickAdd.saveError"), description: (e as Error)?.message, variant: "destructive" });
      } finally {
        savingRef.current = false;
      }
      return;
    }
    if (!d.form.restaurant_name.trim()) {
      toast({ title: t("quickAdd.chooseRestaurant") });
      update((x) => ({ ...x, stage: "pick" }));
      return;
    }
    if (navigator.onLine === false) {
      toast({ title: t("quickAdd.offlineSave") });
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

    savingRef.current = true;
    try {
      // 1) IA que ainda falta (recibo, cardápio, vinho)
      const aiPending = d.photos.filter((p) => p.ai && p.ai.status !== "done").map((p) => p.id);
      if (aiPending.length) {
        setSaving({ label: t("quickAdd.readingAi"), pct: 5 });
        await Promise.all(aiPending.map((id) => runAi(id)));
      }

      // 2) Entrada (fica is_draft até as fotos entrarem)
      setSaving({ label: t("quickAdd.savingEntry"), pct: 10 });
      const f = draftRef.current!.form;
      const fields = {
        restaurant_name: f.restaurant_name.trim().slice(0, 200),
        visit_date: f.visit_date,
        location_address: f.location_address || null,
        location_lat: f.location_lat,
        location_lng: f.location_lng,
        google_place_id: f.google_place_id,
        rating: f.rating || null,
        notes: f.notes.trim() || null,
      };
      let entryId = draftRef.current!.entryId;
      if (entryId) {
        const { error } = await supabase.from("restaurant_entries").update(fields).eq("id", entryId);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase
          .from("restaurant_entries")
          .insert({
            ...fields,
            user_id: uid,
            is_draft: true,
            ...(draftRef.current!.originScheduledVisitId
              ? { origin_scheduled_visit_id: draftRef.current!.originScheduledVisitId }
              : {}),
          })
          .select("id")
          .single();
        if (error) throw error;
        entryId = ins.id as string;
        update((x) => ({ ...x, entryId }));
        await persistNow();
      }

      // 3) Fotos (display + miniatura) e linhas no banco
      const pending = draftRef.current!.photos.filter((p) => !p.rowId);
      const n = pending.length;
      if (n > 1) setSaving({ label: t("quickAdd.savingPhotos").replace("{n}", String(n)), pct: 12 });
      let i = 0;
      for (const p0 of pending) {
        i++;
        if (!getPhoto(p0.id)) continue; // removida durante o salvamento
        setSaving({
          label:
            n > 1
              ? t("quickAdd.savingPhoto").replace("{i}", String(i)).replace("{n}", String(n))
              : t("quickAdd.savingPhotos").replace("{n}", "1"),
          pct: 12 + (68 * i) / Math.max(1, n),
        });
        const url = await ensureUploaded(p0.id);
        const p = getPhoto(p0.id)!;
        if (p.category === "receipt") {
          const r = p.receipt;
          const { data: rec, error } = await supabase
            .from("receipts")
            .insert({
              entry_id: entryId,
              photo_url: url,
              subtotal: r?.subtotal ?? null,
              tax: r?.tax ?? null,
              service_fee: r?.service_fee ?? null,
              total: r?.total ?? null,
              currency: r?.currency ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          const items = Array.isArray(r?.items) ? r!.items : [];
          if (items.length) {
            const { error: itemsError } = await supabase.from("receipt_items").insert(
              items.map((it) => ({
                receipt_id: rec.id,
                item_type: it.item_type,
                name: it.name,
                name_pt: it.name_pt ?? null,
                quantity: it.quantity,
                unit_price: it.unit_price,
                line_total: it.line_total,
              })),
            );
            if (itemsError) {
              await supabase.from("receipts").delete().eq("id", rec.id);
              throw itemsError;
            }
          }
          updatePhoto(p.id, { rowId: rec.id });
        } else {
          const { data: row, error } = await supabase
            .from("restaurant_photos")
            .insert({
              entry_id: entryId,
              photo_url: url,
              thumb_url: p.thumbUrl ?? null,
              type: CATEGORY_BY_KEY[p.category].photoType,
              menu_translation: p.menuTranslation ?? null,
              caption: p.caption ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          updatePhoto(p.id, { rowId: row.id });
        }
        await persistNow();
      }

      // 4) Restaurante pronto
      const { error: finErr } = await supabase
        .from("restaurant_entries")
        .update({ ...fields, is_draft: false })
        .eq("id", entryId);
      if (finErr) throw finErr;
      update((x) => ({ ...x, saved: true }));
      await persistNow();
      queryClient.invalidateQueries({ queryKey: ["restaurant-entries"] });

      // 5) Originais: Drive do dono, ou "Salvar no Fotos"
      setSaving({ label: t("quickAdd.savingEntry"), pct: 80 });
      await finishOriginals();
    } catch (e) {
      console.error("[AddRestaurant] save failed", e);
      setSaving(null);
      toast({
        title: t("quickAdd.saveError"),
        description: (e as { message?: string })?.message,
        variant: "destructive",
      });
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
        queryClient.invalidateQueries({ queryKey: ["restaurant-entries"] });
      } catch (e) {
        console.warn("[AddRestaurant] could not delete db draft", e);
      }
    }
    navigate("/dining", { replace: true });
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
  const stage = draft.stage === "originals" ? "form" : draft.stage;
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

  const tiles = (big: boolean) => (
    <div className={cn("grid gap-3", big ? "grid-cols-3" : "grid-cols-6 gap-2")}>
      {CATEGORIES.map((c) => {
        const Icon = c.icon;
        const n = countBy(c.key);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => openCamera(c.key)}
            className={cn(
              "relative flex flex-col items-center justify-center rounded-2xl border-2 border-[#0d1a2d]/10 bg-background shadow-sm transition-transform active:scale-95",
              big ? "h-28 gap-2" : "h-16 gap-0.5",
            )}
            aria-label={t(c.labelKey)}
          >
            <Icon className={cn("text-[#0d1a2d]", big ? "h-10 w-10" : "h-6 w-6")} strokeWidth={1.8} />
            <span className={cn("font-semibold text-[#0d1a2d]", big ? "text-base" : "text-[10px] leading-none")}>
              {t(c.labelKey)}
            </span>
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12"
              aria-label={t("common.back")}
              onClick={() => (stage === "form" ? update((x) => ({ ...x, stage: "pick" })) : navigate(-1))}
            >
              <ArrowLeft className="h-7 w-7" />
            </Button>
            <h1 className="flex-1 text-2xl font-bold text-[#0d1a2d]">
              {stage === "form" ? t("quickAdd.form") : t("quickAdd.title")}
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

          {stage === "pick" ? (
            <>
              <section className="space-y-2">
                <p className="flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-4 w-4" /> {t("quickAdd.restaurant")}
                </p>
                <div className="rounded-3xl bg-background/70 p-2 shadow-sm">
                  <RestaurantPicker
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

              <section className="space-y-2">
                <p className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("quickAdd.photos")}
                </p>
                {tiles(true)}
              </section>

              <Button
                type="button"
                className="h-16 w-full gap-3 rounded-2xl bg-navy text-xl font-semibold text-white hover:bg-navy/90"
                onClick={() => update((x) => ({ ...x, stage: "form" }))}
              >
                {t("quickAdd.continue")}
                <ArrowRight className="h-6 w-6" />
              </Button>
            </>
          ) : (
            <>
              {/* Restaurante */}
              <button
                type="button"
                onClick={() => update((x) => ({ ...x, stage: "pick" }))}
                className="flex w-full items-center gap-3 rounded-3xl border-2 border-[#0d1a2d]/10 bg-background p-4 text-left shadow-sm"
              >
                <MapPin className="h-8 w-8 shrink-0 text-[#0d1a2d]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xl font-bold text-[#0d1a2d]">
                    {form.restaurant_name || t("quickAdd.chooseRestaurant")}
                  </span>
                  {form.location_address && (
                    <span className="block truncate text-sm text-muted-foreground">{form.location_address}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground">
                  <Pencil className="h-4 w-4" /> {t("quickAdd.change")}
                </span>
              </button>

              {/* Data */}
              <div className="space-y-2">
                <Label htmlFor="visit_date" className="text-base">
                  {t("addRestaurant.visitDate")}
                </Label>
                <Input
                  id="visit_date"
                  type="date"
                  value={form.visit_date}
                  onChange={(e) => setForm({ visit_date: e.target.value })}
                  className="h-14 rounded-2xl text-lg"
                />
              </div>

              {/* Estrelas */}
              <div className="space-y-2">
                <Label className="text-base">{t("addRestaurant.rating")}</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setForm({ rating: form.rating === star ? 0 : star })}
                      className="p-1 transition-transform active:scale-90"
                      aria-label={`${star}`}
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
              </div>

              {/* Fotos */}
              <section className="space-y-4">
                <Label className="text-base">{t("quickAdd.addPhotos")}</Label>
                {tiles(false)}
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

              {/* Notas */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-base">
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
              </div>

              {/* Salvar */}
              <Button
                type="button"
                disabled={!!saving}
                onClick={() => void handleSave()}
                className="h-16 w-full gap-3 rounded-2xl bg-navy text-xl font-semibold text-white hover:bg-navy/90"
              >
                {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
                {t("quickAdd.save")}
              </Button>
            </>
          )}
        </div>
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
          update((x) => ({ ...x, stage: "form" }));
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
                  goToEntry(done.entryId);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-14 w-full rounded-2xl text-lg font-semibold"
                onClick={async () => {
                  await cleanupAndFinish();
                  goToEntry(done.entryId);
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

/**
 * Rotina de envio de um rascunho do "Novo restaurante" — usada pela tela de
 * cadastro e pelo "Enviar agora" da fila no início.
 *   ensureUploaded → display + miniatura no bucket público
 *   runAi          → recibo / cardápio / vinho
 *   saveEntry      → IA pendente, entrada, fotos e linhas, finaliza
 *   finishOriginals→ originais ao inbox/Drive (dono) ou lista para "Salvar no Fotos"
 */
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageVariants";
import {
  PHOTO_BUCKET,
  getDriveStatus,
  kickDriveBackup,
  uploadOriginalToInbox,
  uploadPhotoVariants,
  type Uploader,
} from "@/lib/photoStorage";
import { idbGet, origKey, type AddDraft, type DraftPhoto, type ReceiptData } from "@/lib/draftStore";
import { AI_CATEGORIES, CATEGORY_BY_KEY } from "@/components/add/categories";

export interface DraftCtx {
  userId: string;
  language: string;
  uploader: Uploader;
  t: (key: string) => string;
  /** rascunho atual (sempre o mais novo) */
  get: () => AddDraft;
  /** altera o rascunho (quem chama cuida do estado da tela) */
  set: (fn: (d: AddDraft) => AddDraft) => void;
  /** grava no aparelho agora */
  persist: () => Promise<void>;
  /** originais guardados só em memória (IndexedDB indisponível) */
  memBlob?: (photoId: string) => Blob | undefined;
  onProgress?: (label: string, pct: number) => void;
}

export function stampName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `Evoque_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${Math.random().toString(36).slice(2, 5)}.jpg`;
}

export function asFile(blob: Blob, name?: string): File {
  if (blob instanceof File) return blob;
  return new File([blob], name || stampName(), { type: blob.type || "image/jpeg" });
}

/** Erro de rede (sem internet, conexão caiu): o rascunho vai para a fila. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = `${(e as { message?: string })?.message ?? ""} ${(e as { name?: string })?.name ?? ""}`;
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|FunctionsFetchError|ERR_INTERNET|offline/i.test(
    msg,
  );
}

const photoOf = (ctx: DraftCtx, id: string): DraftPhoto | undefined => ctx.get().photos.find((p) => p.id === id);
const patch = (ctx: DraftCtx, id: string, p: Partial<DraftPhoto>) =>
  ctx.set((d) => ({ ...d, photos: d.photos.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

export async function getOriginal(ctx: DraftCtx, id: string): Promise<Blob | null> {
  const mem = ctx.memBlob?.(id);
  if (mem) return mem;
  try {
    return (await idbGet<Blob>(origKey(id))) ?? null;
  } catch {
    return null;
  }
}

// Trabalhos em curso por foto (vale para as duas telas)
const uploadJobs = new Map<string, Promise<string>>();
const aiJobs = new Map<string, Promise<void>>();

export function ensureUploaded(ctx: DraftCtx, id: string): Promise<string> {
  const p = photoOf(ctx, id);
  if (!p) return Promise.reject(new Error("photo gone"));
  if (p.photoUrl) return Promise.resolve(p.photoUrl);
  const running = uploadJobs.get(id);
  if (running) return running;
  const job = (async () => {
    const blob = await getOriginal(ctx, id);
    if (!blob) throw new Error("original missing");
    const file = asFile(blob, p.fileName);
    let url: string;
    if (p.category === "receipt") {
      // Recibo: JPEG 1600 px (sem miniatura, sem Drive)
      const c = await compressImage(file, 1600, 0.85);
      const path = `receipts/${ctx.userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${c.ext}`;
      const res = await ctx.uploader({
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
      patch(ctx, id, { photoUrl: url, thumbUrl: null });
    } else {
      const res = await uploadPhotoVariants({
        userId: ctx.userId,
        entryId: ctx.get().entryId ?? null,
        file,
        kind: CATEGORY_BY_KEY[p.category].photoType,
        uploader: ctx.uploader,
      });
      if (!res.value) throw new Error(res.error || "Upload failed");
      url = res.value.photoUrl;
      patch(ctx, id, { photoUrl: url, thumbUrl: res.value.thumbUrl });
    }
    await ctx.persist();
    return url;
  })();
  uploadJobs.set(id, job);
  job.finally(() => uploadJobs.delete(id)).catch(() => undefined);
  return job;
}

/** Leitura da IA de uma foto (recibo, cardápio, vinho). Sem internet: fica na fila. */
export function runAi(ctx: DraftCtx, id: string): Promise<void> {
  const existing = aiJobs.get(id);
  if (existing) return existing;
  const p = photoOf(ctx, id);
  if (!p || !AI_CATEGORIES.includes(p.category) || !p.ai || p.ai.status === "done") return Promise.resolve();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (p.ai.status !== "queued") patch(ctx, id, { ai: { status: "queued" } });
    return Promise.resolve();
  }
  const job = (async () => {
    patch(ctx, id, { ai: { status: "running" } });
    try {
      const imageUrl = await ensureUploaded(ctx, id);
      const cur = photoOf(ctx, id);
      if (!cur) return;
      if (cur.category === "receipt") {
        const { data, error } = await supabase.functions.invoke("process-receipt", { body: { imageUrl } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        patch(ctx, id, { receipt: (data?.data ?? data) as ReceiptData, ai: { status: "done" } });
      } else if (cur.category === "menu") {
        const { data, error } = await supabase.functions.invoke("translate-menu", {
          body: {
            imageUrl,
            targetLanguage: ctx.language === "en" ? "English" : "Portuguese",
            ...(cur.rowId ? { photoId: cur.rowId } : {}),
          },
        });
        if (error) throw error;
        if (!data?.translation) throw new Error(data?.error || "No translation");
        patch(ctx, id, { menuTranslation: data.translation as string, ai: { status: "done" } });
      } else {
        const { data, error } = await supabase.functions.invoke("analyze-wine-label", { body: { imageUrl } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const info = (data?.wineInfo ?? null) as Record<string, unknown> | null;
        const caption = info ? `${info.name ?? ""} ${info.vintage ?? ""}`.trim() : "";
        patch(ctx, id, { wineInfo: info, caption: caption || undefined, ai: { status: "done" } });
        if (cur.rowId && caption && !cur.remote) {
          await supabase.from("restaurant_photos").update({ caption }).eq("id", cur.rowId);
        }
      }
    } catch (e) {
      console.warn("[draftEngine] AI failed", e);
      patch(ctx, id, { ai: { status: isNetworkError(e) ? "queued" : "error", error: (e as Error)?.message } });
    } finally {
      await ctx.persist();
    }
  })();
  aiJobs.set(id, job);
  job.finally(() => aiJobs.delete(id)).catch(() => undefined);
  return job;
}

export function runQueuedAi(ctx: DraftCtx): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  ctx
    .get()
    .photos.filter((p) => p.ai?.status === "queued")
    .forEach((p) => void runAi(ctx, p.id));
}

/**
 * Grava o restaurante: IA pendente, entrada (is_draft até as fotos entrarem),
 * display + miniatura e linhas das fotos/recibo, e finaliza (is_draft=false).
 * Retomável: o que já foi gravado (entryId, rowId, photoUrl) não se repete.
 */
export async function saveEntry(ctx: DraftCtx): Promise<string> {
  const t = ctx.t;
  const progress = ctx.onProgress ?? (() => undefined);
  const d0 = ctx.get();
  if (d0.saved && d0.entryId) return d0.entryId;

  // 1) IA que ainda falta
  const aiPending = d0.photos.filter((p) => p.ai && p.ai.status !== "done").map((p) => p.id);
  if (aiPending.length) {
    progress(t("quickAdd.readingAi"), 5);
    await Promise.all(aiPending.map((id) => runAi(ctx, id)));
    // uma nova tentativa para as que caíram por erro de rede
    const again = ctx.get().photos.filter((p) => p.ai?.status === "queued").map((p) => p.id);
    if (again.length && navigator.onLine !== false) await Promise.all(again.map((id) => runAi(ctx, id)));
  }

  // 2) Entrada
  progress(t("quickAdd.savingEntry"), 10);
  const f = ctx.get().form;
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
  let entryId = ctx.get().entryId;
  if (entryId) {
    const { error } = await supabase.from("restaurant_entries").update(fields).eq("id", entryId);
    if (error) throw error;
  } else {
    const origin = ctx.get().originScheduledVisitId;
    const { data: ins, error } = await supabase
      .from("restaurant_entries")
      .insert({ ...fields, user_id: ctx.userId, is_draft: true, ...(origin ? { origin_scheduled_visit_id: origin } : {}) })
      .select("id")
      .single();
    if (error) throw error;
    entryId = ins.id as string;
    const eid = entryId;
    ctx.set((x) => ({ ...x, entryId: eid }));
    await ctx.persist();
  }

  // 3) Fotos
  const pending = ctx.get().photos.filter((p) => !p.rowId);
  const n = pending.length;
  let i = 0;
  for (const p0 of pending) {
    i++;
    if (!photoOf(ctx, p0.id)) continue;
    progress(
      n > 1
        ? t("quickAdd.savingPhoto").replace("{i}", String(i)).replace("{n}", String(n))
        : t("quickAdd.savingPhotos").replace("{n}", "1"),
      12 + (68 * i) / Math.max(1, n),
    );
    const url = await ensureUploaded(ctx, p0.id);
    const p = photoOf(ctx, p0.id)!;
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
      patch(ctx, p.id, { rowId: rec.id });
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
      patch(ctx, p.id, { rowId: row.id });
    }
    await ctx.persist();
  }

  // 4) Finaliza
  const { error: finErr } = await supabase
    .from("restaurant_entries")
    .update({ ...fields, is_draft: false })
    .eq("id", entryId);
  if (finErr) throw finErr;
  ctx.set((x) => ({ ...x, saved: true }));
  await ctx.persist();
  return entryId;
}

/**
 * Originais depois de salvar. Dono (Drive): envia ao inbox e pede a cópia;
 * devolve []. Demais: devolve os originais tirados pela câmera do app, para
 * oferecer "Salvar no Fotos" (quem chama apaga o rascunho depois).
 */
export async function finishOriginals(ctx: DraftCtx): Promise<File[]> {
  const d = ctx.get();
  const candidates = d.photos.filter((p) => p.hasOriginal && !p.remote && p.category !== "receipt" && p.rowId);
  if (!candidates.length) return [];
  const drive = await getDriveStatus(ctx.userId);
  if (drive) {
    const todo = candidates.filter((p) => !p.originalStashed);
    let i = 0;
    for (const p of todo) {
      i++;
      ctx.onProgress?.(
        ctx.t("quickAdd.originalsDrive").replace("{i}", String(i)).replace("{n}", String(todo.length)),
        80 + (20 * i) / Math.max(1, todo.length),
      );
      const blob = await getOriginal(ctx, p.id);
      if (!blob) continue;
      await uploadOriginalToInbox({ userId: ctx.userId, photoId: p.rowId!, file: asFile(blob, p.fileName) });
      patch(ctx, p.id, { originalStashed: true });
      await ctx.persist();
    }
    kickDriveBackup(ctx.userId);
    return [];
  }
  const files: File[] = [];
  for (const p of candidates.filter((x) => x.source === "camera")) {
    const blob = await getOriginal(ctx, p.id);
    if (blob) files.push(asFile(blob, p.fileName));
  }
  return files;
}

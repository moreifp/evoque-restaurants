/**
 * Armazenamento das fotos de restaurante:
 *  - bucket público `restaurant-photos`: versão de exibição + miniatura (leves)
 *  - bucket privado `originals-inbox`: original aguardando cópia para o Google Drive do dono
 *  - edge function `backup-original`: diz se o usuário tem Drive e copia o original
 */
import { supabase } from "@/integrations/supabase/client";
import { makeImageVariants, originalExtension } from "@/lib/imageVariants";

export const PHOTO_BUCKET = "restaurant-photos";
export const INBOX_BUCKET = "originals-inbox";
const LONG_CACHE = "31536000";

export interface UploaderOptions {
  bucket: string;
  filePath: string;
  file: File;
  category: string;
  maxRetries?: number;
  cacheControl?: string;
  contentType?: string;
}
export interface UploaderResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
  attempts: number;
}
export type Uploader = (opts: UploaderOptions) => Promise<UploaderResult>;

/** Upload direto (sem retry) — usado onde o hook useUploadWithRetry não está disponível. */
export const directUploader: Uploader = async ({ bucket, filePath, file, cacheControl, contentType }) => {
  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    cacheControl: cacheControl ?? "3600",
    upsert: false,
    ...(contentType ? { contentType } : {}),
  });
  if (error) return { success: false, error: error.message, attempts: 1 };
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return { success: true, publicUrl: data.publicUrl, attempts: 1 };
};

function uniqueStamp(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** "viagens" quando o app está aberto dentro do Evoque Viagens (login pelo Viagens); senão "direto". */
export function uploadOrigin(): "viagens" | "direto" {
  try {
    if (typeof window !== "undefined" && window.self !== window.top) return "viagens";
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("evoque_embedded") === "1") return "viagens";
  } catch {
    return "viagens"; // acesso ao topo bloqueado = estamos num iframe
  }
  return "direto";
}

// ---------------------------------------------------------------------------
// Miniaturas conhecidas nesta sessão (display URL -> thumb URL). Usado quando a
// linha é gravada depois (fluxo sem rascunho do AddRestaurant).
const thumbByUrl = new Map<string, string>();
export function rememberThumb(displayUrl: string, thumbUrl: string | null) {
  if (thumbUrl) thumbByUrl.set(displayUrl, thumbUrl);
}
export function thumbFor(displayUrl: string): string | null {
  return thumbByUrl.get(displayUrl) ?? null;
}

// ---------------------------------------------------------------------------
export interface UploadedVariants {
  photoUrl: string;
  thumbUrl: string | null;
  attempts: number;
}

/**
 * Gera display + thumb e envia ao bucket público com cache longo.
 * Caminhos: `${userId}/${entryId}/${stamp}.jpg` e `${stamp}_thumb.jpg`.
 */
export async function uploadPhotoVariants(params: {
  userId: string;
  entryId: string | null;
  file: File;
  kind: string;
  uploader?: Uploader;
}): Promise<{ value?: UploadedVariants; error?: string; attempts: number }> {
  const { userId, entryId, file, kind } = params;
  const uploader = params.uploader ?? directUploader;
  const variants = await makeImageVariants(file, kind);
  const folder = `${userId}/${entryId ?? "sem-entrada"}`;
  const stamp = uniqueStamp();
  const displayPath = `${folder}/${stamp}.${variants.displayExt}`;
  const displayName = `${stamp}.${variants.displayExt}`;

  const displayRes = await uploader({
    bucket: PHOTO_BUCKET,
    filePath: displayPath,
    file: variants.displayIsOriginal
      ? file
      : new File([variants.display], displayName, { type: variants.displayType }),
    category: kind,
    maxRetries: 3,
    cacheControl: LONG_CACHE,
    contentType: variants.displayType,
  });
  if (!displayRes.success || !displayRes.publicUrl) {
    return { error: displayRes.error ?? "Upload failed", attempts: displayRes.attempts };
  }

  let thumbUrl: string | null = null;
  if (variants.thumb) {
    const thumbRes = await uploader({
      bucket: PHOTO_BUCKET,
      filePath: `${folder}/${stamp}_thumb.jpg`,
      file: new File([variants.thumb], `${stamp}_thumb.jpg`, { type: "image/jpeg" }),
      category: `${kind}_thumb`,
      maxRetries: 2,
      cacheControl: LONG_CACHE,
      contentType: "image/jpeg",
    });
    // Sem miniatura não é erro: as telas caem para photo_url.
    if (thumbRes.success && thumbRes.publicUrl) thumbUrl = thumbRes.publicUrl;
  }

  rememberThumb(displayRes.publicUrl, thumbUrl);
  return {
    value: { photoUrl: displayRes.publicUrl, thumbUrl, attempts: displayRes.attempts },
    attempts: displayRes.attempts,
  };
}

// ---------------------------------------------------------------------------
// Google Drive (só o dono). Resposta cacheada por sessão e por usuário.
let driveStatus: { userId: string; promise: Promise<boolean> } | null = null;

export function getDriveStatus(userId: string): Promise<boolean> {
  if (driveStatus && driveStatus.userId === userId) return driveStatus.promise;
  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("backup-original", {
        body: { action: "status" },
      });
      if (error) throw error;
      return Boolean((data as { drive?: boolean } | null)?.drive);
    } catch (e) {
      console.warn("[photoStorage] backup-original status failed", e);
      driveStatus = null; // tenta de novo na próxima vez
      return false;
    }
  })();
  driveStatus = { userId, promise };
  return promise;
}

/**
 * Envia o ORIGINAL para o inbox privado, marca a linha e pede a cópia ao Drive
 * sem bloquear a interface. Falhas são reprocessadas pela varredura agendada.
 */
/**
 * Só a primeira parte: original no inbox privado + linha marcada (original_path,
 * upload_origin). Não chama o Drive. Lança erro se falhar.
 * Repetir com o mesmo photoId é seguro (arquivo já existente é aceito).
 */
export async function uploadOriginalToInbox(params: {
  userId: string;
  photoId: string;
  file: File;
}): Promise<string> {
  const { userId, photoId, file } = params;
  const path = `${userId}/${photoId}.${originalExtension(file)}`;
  const { error: upErr } = await supabase.storage.from(INBOX_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  // Já enviado numa tentativa anterior (mesmo caminho): segue para marcar a linha.
  const dup = upErr && /exists|duplicate|409/i.test(`${upErr.message} ${(upErr as { statusCode?: string }).statusCode ?? ""}`);
  if (upErr && !dup) throw upErr;
  const { error: rowErr } = await supabase
    .from("restaurant_photos")
    .update({ original_path: path, upload_origin: uploadOrigin() })
    .eq("id", photoId);
  if (rowErr) throw rowErr;
  return path;
}

export async function stashOriginalForDrive(params: {
  userId: string;
  photoId: string;
  file: File;
}): Promise<boolean> {
  const { photoId } = params;
  try {
    await uploadOriginalToInbox(params);
  } catch (e) {
    console.error("[photoStorage] could not stash original", e);
    return false;
  }
  // Quem chama não espera por isto (fila em segundo plano). Aguardamos aqui só
  // para que as cópias do mesmo aparelho saiam uma de cada vez (evita pastas
  // duplicadas no Drive). Falhas ficam para a varredura agendada.
  try {
    const { error } = await supabase.functions.invoke("backup-original", {
      body: { action: "backup", photo_id: photoId },
    });
    if (error) console.warn("[photoStorage] backup will be retried by sweep", error);
  } catch (e) {
    console.warn("[photoStorage] backup will be retried by sweep", e);
  }
  return true;
}

/**
 * Pede ao servidor para copiar pendências do dono (ex.: depois de salvar um
 * restaurante que era rascunho). Não faz nada para quem não tem Drive.
 */
export function kickDriveBackup(userId: string): void {
  enqueueDriveTask(async () => {
    if (!(await getDriveStatus(userId))) return;
    const { error } = await supabase.functions.invoke("backup-original", { body: { action: "backup" } });
    if (error) console.warn("[photoStorage] kick backup failed", error);
  });
}

// Fila única (por aba) para o trabalho do Drive: roda em segundo plano, uma
// tarefa por vez, sem travar a interface.
let driveQueue: Promise<void> = Promise.resolve();
function enqueueDriveTask(task: () => Promise<unknown>): void {
  driveQueue = driveQueue.then(task).then(
    () => undefined,
    (e) => console.warn("[photoStorage] drive task failed", e),
  );
}

/** Coloca o original na fila do Drive (não bloqueia). */
export function queueOriginalForDrive(params: { userId: string; photoId: string; file: File }): void {
  enqueueDriveTask(() => stashOriginalForDrive(params));
}

// ---------------------------------------------------------------------------
// Remoção de objetos

/** Caminho do objeto a partir da URL pública do bucket (null se não for do bucket). */
export function storagePathFromPublicUrl(url: string | null | undefined, bucket = PHOTO_BUCKET): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    const path = decodeURIComponent(u.pathname.slice(idx + marker.length));
    return path || null;
  } catch {
    return null;
  }
}

/** Apaga display/miniatura do bucket público. Ignora URLs de fora do bucket. */
export async function removePhotoObjects(urls: Array<string | null | undefined>): Promise<void> {
  const paths = Array.from(
    new Set(urls.map((u) => storagePathFromPublicUrl(u)).filter((p): p is string => !!p)),
  );
  if (!paths.length) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) console.warn("[photoStorage] could not remove photo objects", error);
}

export async function removeInboxObjects(paths: Array<string | null | undefined>): Promise<void> {
  const clean = paths.filter((p): p is string => !!p);
  if (!clean.length) return;
  const { error } = await supabase.storage.from(INBOX_BUCKET).remove(clean);
  if (error) console.warn("[photoStorage] could not remove inbox objects", error);
}

/** Antes de apagar um restaurante: limpa originais que ainda não foram ao Drive. */
export async function cleanupInboxForEntry(entryId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("restaurant_photos")
      .select("original_path")
      .eq("entry_id", entryId)
      .not("original_path", "is", null);
    await removeInboxObjects((data ?? []).map((r) => r.original_path));
  } catch (e) {
    console.warn("[photoStorage] cleanupInboxForEntry failed", e);
  }
}

/** Fonte para exibição pequena: miniatura quando existir. */
export function smallSrc(photo: { photo_url: string; thumb_url?: string | null }): string {
  return photo.thumb_url || photo.photo_url;
}

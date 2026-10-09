/**
 * Armazenamento local (IndexedDB) do rascunho do "Novo restaurante":
 * campos, categorias, resultados da IA e os ORIGINAIS das fotos (Blobs).
 * Sobrevive a fechar o app e a ficar sem internet. Sem dependências.
 *
 * Chaves:
 *   draft:<userId>        → AddDraft (JSON)
 *   orig:<photoId>        → Blob original
 *   thumb:<photoId>       → Blob miniatura (pequena, para a tela)
 */

const DB_NAME = "evoque-add";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Outra aba atualizou a versão: fecha e reabre na próxima chamada.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        tx.oncomplete = () => resolve((req ? (req as IDBRequest).result : undefined) as T);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
      }),
  );
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>("readonly", (s) => s.get(key));
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run<void>("readwrite", (s) => s.put(value, key));
}

export function idbDel(keys: string | string[]): Promise<void> {
  const list = Array.isArray(keys) ? keys : [keys];
  return run<void>("readwrite", (s) => {
    list.forEach((k) => s.delete(k));
  });
}

// ---------------------------------------------------------------------------

export type PhotoCategory = "place" | "food" | "wine" | "menu" | "friends" | "receipt";

export interface ReceiptItemData {
  item_type: "dish" | "drink" | string;
  name: string;
  name_pt?: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
}

export interface ReceiptData {
  items: ReceiptItemData[];
  subtotal?: number | null;
  tax?: number | null;
  service_fee?: number | null;
  total?: number | null;
  currency?: string | null;
}

export type AiStatus = "queued" | "running" | "done" | "error";

export interface DraftPhoto {
  id: string;
  category: PhotoCategory;
  createdAt: number;
  source: "camera" | "gallery";
  /** Nome do arquivo original (extensão vale para o Drive). */
  fileName?: string;
  /** Original guardado no aparelho (orig:<id>). */
  hasOriginal: boolean;
  /** Miniatura guardada no aparelho (thumb:<id>). */
  hasThumb: boolean;
  /** Já veio do banco (rascunho antigo): sem original local. */
  remote?: boolean;
  /** Versão de exibição já enviada ao bucket público. */
  photoUrl?: string;
  thumbUrl?: string | null;
  /** id em restaurant_photos (ou em receipts, para recibo) depois de gravado. */
  rowId?: string;
  /** original_path no inbox já gravado (dono com Drive). */
  originalStashed?: boolean;
  ai?: { status: AiStatus; error?: string };
  receipt?: ReceiptData;
  menuTranslation?: string;
  wineInfo?: Record<string, unknown> | null;
  caption?: string;
}

export interface AddDraftForm {
  restaurant_name: string;
  visit_date: string;
  location_address: string;
  location_lat: number | null;
  location_lng: number | null;
  google_place_id: string | null;
  rating: number;
  notes: string;
}

export interface AddDraft {
  v: 1;
  /** id do rascunho (vários por usuário: o aberto + a fila "para enviar"). */
  id: string;
  userId: string;
  stage: "pick" | "form" | "originals";
  form: AddDraftForm;
  photos: DraftPhoto[];
  /** Linha em restaurant_entries já criada (rascunho antigo ou salvamento em curso). */
  entryId: string | null;
  /** Entrada já finalizada (is_draft=false): falta só cuidar dos originais. */
  saved?: boolean;
  /** Na fila "para enviar" (Salvar depois no Wi-Fi / sem internet). */
  queued?: boolean;
  originScheduledVisitId: string | null;
  updatedAt: number;
}

/** Chave antiga (um só rascunho por usuário). Migra para a fila. */
const legacyDraftKey = (userId: string) => `draft:${userId}`;
export const draftItemKey = (userId: string, id: string) => `draft:${userId}:${id}`;
const indexKey = (userId: string) => `drafts:${userId}`;
export const origKey = (photoId: string) => `orig:${photoId}`;
export const thumbKey = (photoId: string) => `thumb:${photoId}`;

/** Índice dos rascunhos: ids e qual está aberto na tela "Novo restaurante". */
interface DraftIndex {
  ids: string[];
  current: string | null;
}

export function newDraftId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// Escritas no índice uma de cada vez (evita perder ids em gravações seguidas).
let indexChain: Promise<unknown> = Promise.resolve();
function withIndex<T>(userId: string, fn: (ix: DraftIndex) => DraftIndex | null, ret?: (ix: DraftIndex) => T): Promise<T> {
  const job = indexChain.then(async () => {
    const cur = (await idbGet<DraftIndex>(indexKey(userId))) ?? { ids: [], current: null };
    const next = fn({ ids: [...cur.ids], current: cur.current });
    if (next) await idbSet(indexKey(userId), next);
    return ret ? ret(next ?? cur) : (undefined as T);
  });
  indexChain = job.catch(() => undefined);
  return job;
}

const migrated = new Set<string>();
/** Rascunho único do formato antigo → fila "para enviar". */
async function migrateLegacy(userId: string): Promise<void> {
  if (migrated.has(userId)) return;
  migrated.add(userId);
  const old = await idbGet<Omit<AddDraft, "id"> & { id?: string }>(legacyDraftKey(userId));
  if (!old) return;
  const d: AddDraft = { ...old, id: old.id ?? newDraftId(), queued: true } as AddDraft;
  await idbSet(draftItemKey(userId, d.id), d);
  await withIndex(userId, (ix) => ({ ids: ix.ids.includes(d.id) ? ix.ids : [...ix.ids, d.id], current: ix.current }));
  await idbDel(legacyDraftKey(userId));
}

let persistAsked = false;
/** Pede ao navegador para não apagar os dados do site (uma vez por sessão). */
export function requestPersistentStorage(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* sem suporte */
  }
}

/** Grava o rascunho e o registra no índice (aberto, se não estiver na fila). */
export async function putDraft(d: AddDraft): Promise<void> {
  requestPersistentStorage();
  await idbSet(draftItemKey(d.userId, d.id), d);
  await withIndex(d.userId, (ix) => {
    const ids = ix.ids.includes(d.id) ? ix.ids : [...ix.ids, d.id];
    const current = d.queued ? (ix.current === d.id ? null : ix.current) : d.id;
    if (ids === ix.ids && current === ix.current) return null;
    return { ids, current };
  });
}

/** Tira o registro do rascunho (sem fotos) — usado quando ele ficou vazio. */
export async function forgetDraft(d: AddDraft): Promise<void> {
  await idbDel(draftItemKey(d.userId, d.id));
  await withIndex(d.userId, (ix) => ({
    ids: ix.ids.filter((x) => x !== d.id),
    current: ix.current === d.id ? null : ix.current,
  }));
}

/** Apaga o rascunho e todos os blobs dele. */
export async function deleteDraft(d: AddDraft): Promise<void> {
  const keys: string[] = [];
  for (const p of d.photos) keys.push(origKey(p.id), thumbKey(p.id));
  if (keys.length) await idbDel(keys);
  await forgetDraft(d);
}

export async function getDraft(userId: string, id: string): Promise<AddDraft | null> {
  await migrateLegacy(userId);
  const d = await idbGet<AddDraft>(draftItemKey(userId, id));
  return d && d.v === 1 && d.userId === userId ? d : null;
}

/** O rascunho aberto na tela "Novo restaurante" (fora da fila), se houver. */
export async function getCurrentDraft(userId: string): Promise<AddDraft | null> {
  await migrateLegacy(userId);
  const ix = await withIndex(userId, () => null, (x) => x);
  if (!ix.current) return null;
  const d = await getDraft(userId, ix.current);
  return d && !d.queued ? d : null;
}

/** Fila "para enviar", mais antigos primeiro. */
export async function listQueuedDrafts(userId: string): Promise<AddDraft[]> {
  await migrateLegacy(userId);
  const ix = await withIndex(userId, () => null, (x) => x);
  const out: AddDraft[] = [];
  const alive: string[] = [];
  for (const id of ix.ids) {
    const d = await getDraft(userId, id);
    if (!d) continue;
    alive.push(id);
    if (d.queued) out.push(d);
  }
  // limpa ids sem rascunho
  if (alive.length !== ix.ids.length) {
    await withIndex(userId, (x) => ({ ids: x.ids.filter((i) => alive.includes(i)), current: x.current }));
  }
  return out.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** Avisa outras telas (ex.: início) que a fila mudou. */
export const QUEUE_EVENT = "evoque:drafts-changed";
export function notifyQueueChanged(): void {
  try {
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    /* sem window */
  }
}

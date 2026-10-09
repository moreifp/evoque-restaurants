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
  userId: string;
  stage: "pick" | "form" | "originals";
  form: AddDraftForm;
  photos: DraftPhoto[];
  /** Linha em restaurant_entries já criada (rascunho antigo ou salvamento em curso). */
  entryId: string | null;
  /** Entrada já finalizada (is_draft=false): falta só cuidar dos originais. */
  saved?: boolean;
  originScheduledVisitId: string | null;
  updatedAt: number;
}

export const draftKey = (userId: string) => `draft:${userId}`;
export const origKey = (photoId: string) => `orig:${photoId}`;
export const thumbKey = (photoId: string) => `thumb:${photoId}`;

/** Apaga o rascunho e todos os blobs dele. */
export async function deleteDraft(draft: AddDraft): Promise<void> {
  const keys = [draftKey(draft.userId)];
  for (const p of draft.photos) keys.push(origKey(p.id), thumbKey(p.id));
  await idbDel(keys);
}

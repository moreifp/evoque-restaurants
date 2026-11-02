/**
 * QR code em foto de cardápio ou recibo.
 *
 * Cardápio e recibo continuam sendo "uma foto". Se a foto tiver um QR code,
 * o app lê o link (cardápio online, PDF, pasta do Drive, nota fiscal NFC-e)
 * em vez da imagem — o resultado é mais completo. Se não houver QR ou o link
 * não abrir, faz a leitura da foto como antes. Nada muda para quem usa.
 *
 *   translateMenuSmart  → texto da tradução (QR ou foto)
 *   processReceiptSmart → itens e totais do recibo (QR ou foto)
 */
import jsQR from "jsqr";
import { supabase } from "@/integrations/supabase/client";
import { fetchAsFile } from "@/lib/saveToPhotos";
import type { ReceiptData } from "@/lib/draftStore";

// ───────────────────────── leitura do QR na imagem ─────────────────────────
// Dois leitores: ZXing (WebAssembly, mais forte com foto torta, borrada ou de
// longe) e, de reserva, jsQR. O arquivo .wasm é servido pelo próprio app.

/** Tamanhos testados com fotos reais do iPhone (o QR invertido do Santo Colomba pede ≤1280 no jsQR). */
const SIDES_JSQR = [1000, 800, 1400, 600];
const SIDES_ZXING = [1600, 1000];

type ZXingRead = typeof import("zxing-wasm/reader").readBarcodes;
let zxingPromise: Promise<ZXingRead | null> | null = null;

/** Carrega o ZXing só na primeira foto de cardápio/recibo. */
function loadZXing(): Promise<ZXingRead | null> {
  zxingPromise ??= (async () => {
    try {
      const [mod, wasm] = await Promise.all([
        import("zxing-wasm/reader"),
        import("zxing-wasm/reader/zxing_reader.wasm?url"),
      ]);
      mod.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasm.default : prefix + path) },
        fireImmediately: true,
      });
      return mod.readBarcodes;
    } catch (e) {
      console.warn("[qr] ZXing indisponível", e);
      return null;
    }
  })();
  return zxingPromise;
}

async function decodeBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* HEIC em navegador sem suporte: tenta <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Procura um QR code na imagem; devolve o texto (normalmente um link) ou null. */
export async function findQrInImage(blob: Blob): Promise<string | null> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decodeBitmap(blob);
  } catch (e) {
    console.warn("[qr] não abriu a imagem", e);
    return null;
  }
  const w0 = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h0 = "naturalHeight" in src ? src.naturalHeight : src.height;
  if (!w0 || !h0) return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const frame = (side: number): ImageData => {
    const scale = Math.min(1, side / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };
  try {
    const zxing = await loadZXing();
    if (zxing) {
      for (const side of SIDES_ZXING) {
        try {
          const r = await zxing(frame(side), {
            formats: ["QRCode"],
            tryHarder: true,
            tryInvert: true,
            tryRotate: true,
            tryDownscale: true,
            maxNumberOfSymbols: 1,
          });
          const hit = r.find((x) => x.isValid && x.text);
          if (hit) return hit.text.trim();
        } catch (e) {
          console.warn("[qr] ZXing falhou", e);
          break;
        }
      }
    }
    for (const side of SIDES_JSQR) {
      const img = frame(side);
      // attemptBoth: QR claro sobre fundo escuro (comum em cardápios)
      const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
      if (r?.data) return r.data.trim();
      if (img.width === w0) break;
    }
  } finally {
    if ("close" in src && typeof src.close === "function") src.close();
    canvas.width = canvas.height = 0;
  }
  return null;
}

/** Só links web servem (QR de Wi-Fi, PIX, texto etc. são ignorados). */
export function asWebLink(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  const withScheme = /^https?:\/\//i.test(t) ? t : /^www\./i.test(t) ? `https://${t}` : "";
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme.replace(/\|/g, "%7C"));
    return u.protocol === "https:" || u.protocol === "http:" ? withScheme : null;
  } catch {
    return null;
  }
}

/** Nota fiscal de consumidor (NFC-e) de qualquer Sefaz. */
export function isNfceUrl(url: string): boolean {
  try {
    const h = new URL(url.replace(/\|/g, "%7C")).hostname;
    return /(^|\.)fazenda\.[a-z]{2}\.gov\.br$/i.test(h) || /(^|\.)sefaz\.[a-z]{2}\.gov\.br$/i.test(h) || /(^|\.)sef\.sc\.gov\.br$/i.test(h);
  } catch {
    return false;
  }
}

async function qrFrom(localBlob: Blob | null | undefined, imageUrl: string | undefined): Promise<string | null> {
  if (localBlob) {
    const hit = asWebLink(await findQrInImage(localBlob));
    if (hit) return hit;
  }
  if (imageUrl) {
    try {
      return asWebLink(await findQrInImage(await fetchAsFile(imageUrl, "qr.jpg")));
    } catch {
      return null;
    }
  }
  return null;
}

// ───────────────────────── NFC-e (nota fiscal) ─────────────────────────

/** Texto visível de uma página HTML, uma linha por bloco. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,head").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p,div,tr,li,h1,h2,h3,h4,table,span.txtTit,label").forEach((n) => n.append("\n"));
  return (doc.body?.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Tira CPF/CNPJ e nome do consumidor antes de mandar para a IA. */
export function stripConsumer(text: string): string {
  return text
    .replace(/CPF\s*:?\s*[\d.\-/*]{11,18}/gi, "CPF: (omitido)")
    .replace(/(Consumidor[\s\S]{0,40}?Nome\s*:?)[^\n]*/i, "$1 (omitido)");
}

/**
 * A Sefaz bloqueia servidores de nuvem (Amazon). A página é buscada pelo
 * Worker do próprio app (/api/nfce, no Cloudflare). Devolve o texto da nota
 * ou null se não deu.
 */
async function nfceText(url: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/nfce?u=${encodeURIComponent(url)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const text = htmlToText(await r.text());
    // Página de bloqueio ou sem itens
    if (!/Vl\.?\s*Total|Valor\s+a\s+pagar|VALOR\s+TOTAL/i.test(text)) return null;
    return stripConsumer(text).slice(0, 60_000);
  } catch {
    return null;
  }
}

// ───────────────────────── chamadas às funções ─────────────────────────

interface QrResult<T> {
  value: T;
  viaQr: boolean;
  qrUrl: string | null;
}

type LinkResp = { success?: boolean; translation?: string; data?: ReceiptData; reason?: string; error?: string };

async function readLink(body: Record<string, unknown>): Promise<LinkResp | null> {
  const { data, error } = await supabase.functions.invoke("read-qr-link", { body });
  if (error) {
    // Rede caiu: deixa a fila tratar. Outros erros: cai para a foto.
    if (/failed to fetch|network|load failed|FunctionsFetchError/i.test(String(error?.message ?? error))) throw error;
    console.warn("[qr] read-qr-link", error);
    return null;
  }
  return (data as LinkResp) ?? null;
}

/**
 * Tradução do cardápio. Com QR na foto, lê o cardápio do link; senão, lê a foto.
 * Com photoId, a função grava a tradução (e o link, na legenda) na foto.
 */
export async function translateMenuSmart(opts: {
  imageUrl: string;
  targetLanguage: string;
  photoId?: string;
  localBlob?: Blob | null;
  /** QR já procurado antes ("" = não tem). */
  knownQr?: string | null;
}): Promise<QrResult<string>> {
  const qr = opts.knownQr !== undefined ? asWebLink(opts.knownQr) : await qrFrom(opts.localBlob, opts.imageUrl);
  if (qr && !isNfceUrl(qr)) {
    const r = await readLink({ kind: "menu", url: qr, targetLanguage: opts.targetLanguage, photoId: opts.photoId });
    if (r?.success && r.translation) return { value: r.translation, viaQr: true, qrUrl: qr };
  }
  const { data, error } = await supabase.functions.invoke("translate-menu", {
    body: { imageUrl: opts.imageUrl, targetLanguage: opts.targetLanguage, ...(opts.photoId ? { photoId: opts.photoId } : {}) },
  });
  if (error) throw error;
  if (!data?.translation) throw new Error(data?.error || "No translation");
  return { value: data.translation as string, viaQr: false, qrUrl: qr };
}

/** Recibo. Com QR (NFC-e ou link), lê a nota oficial; senão, lê a foto. */
export async function processReceiptSmart(opts: {
  imageUrl: string;
  localBlob?: Blob | null;
  knownQr?: string | null;
}): Promise<QrResult<ReceiptData>> {
  const qr = opts.knownQr !== undefined ? asWebLink(opts.knownQr) : await qrFrom(opts.localBlob, opts.imageUrl);
  if (qr) {
    let r: LinkResp | null = null;
    if (isNfceUrl(qr)) {
      const text = await nfceText(qr);
      if (text) r = await readLink({ kind: "receipt", url: qr, text });
    } else {
      r = await readLink({ kind: "receipt", url: qr });
    }
    if (r?.success && r.data && Array.isArray(r.data.items) && r.data.items.length > 0) {
      return { value: r.data, viaQr: true, qrUrl: qr };
    }
  }
  const { data, error } = await supabase.functions.invoke("process-receipt", { body: { imageUrl: opts.imageUrl } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { value: (data?.data ?? data) as ReceiptData, viaQr: false, qrUrl: qr };
}

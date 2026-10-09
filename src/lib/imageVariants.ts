/**
 * Gera versões leves de uma foto no próprio aparelho, antes do upload:
 *  - display: JPEG, lado maior 1280 px (1600 px para cardápio, vinho e recibo)
 *  - thumb:   JPEG, lado maior 400 px (para grades, cards e listas)
 *
 * Respeita a orientação EXIF, nunca aumenta a imagem e remove metadados
 * (inclusive GPS) porque a foto é recodificada.
 * Se o navegador não conseguir decodificar o arquivo, devolve o original como
 * display e nenhuma miniatura (comportamento antigo).
 */

export type ImageVariantKind =
  | "restaurant_photo"
  | "place"
  | "food"
  | "wine"
  | "menu"
  | "friends"
  | "receipt"
  | "avatar";

export interface ImageVariants {
  display: Blob;
  /** null quando não foi possível gerar (decodificação falhou ou thumb desligada). */
  thumb: Blob | null;
  /** true quando o display é o próprio arquivo original (fallback). */
  displayIsOriginal: boolean;
  /** Extensão do display ("jpg" ou a extensão do original no fallback). */
  displayExt: string;
  displayType: string;
}

export interface VariantOptions {
  /** Lado maior do display. Padrão conforme o tipo. */
  maxSide?: number;
  quality?: number;
  /** Gerar miniatura (padrão true). */
  thumb?: boolean;
  thumbMaxSide?: number;
  thumbQuality?: number;
}

const THUMB_SIDE = 400;
const THUMB_QUALITY = 0.7;
const DISPLAY_QUALITY = 0.8;

export function displaySideFor(kind: string): number {
  switch (kind) {
    case "menu":
    case "wine":
    case "receipt":
      return 1600;
    case "avatar":
      return 512;
    default:
      return 1280;
  }
}

/** Extensão segura do arquivo original (para nomear no inbox/Drive). */
export function originalExtension(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
  const clean = fromName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean && clean.length <= 5) return clean === "jpeg" ? "jpg" : clean;
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return byType[file.type] ?? "jpg";
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeWithImg(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
    // <img> já aplica a orientação EXIF (image-orientation: from-image é o padrão).
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error("empty image");
    return { source: img, width, height, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bmp.width && bmp.height) {
        return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
      }
      bmp.close();
    } catch {
      // cai para <img>
    }
  }
  return decodeWithImg(file);
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const c = new OffscreenCanvas(w, h);
      if (typeof c.convertToBlob === "function" && c.getContext("2d")) return c;
    } catch {
      // usa canvas normal
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToJpeg(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

function fit(w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h)); // nunca aumenta
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function draw(source: CanvasImageSource, sw: number, sh: number, maxSide: number): AnyCanvas {
  const { w, h } = fit(sw, sh, maxSide);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#ffffff"; // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

export async function makeImageVariants(
  file: File,
  kind: string,
  opts: VariantOptions = {},
): Promise<ImageVariants> {
  const maxSide = opts.maxSide ?? displaySideFor(kind);
  const quality = opts.quality ?? DISPLAY_QUALITY;
  const wantThumb = opts.thumb ?? true;

  let decoded: Decoded | null = null;
  try {
    decoded = await decode(file);
    const displayCanvas = draw(decoded.source, decoded.width, decoded.height, maxSide);
    const display = await canvasToJpeg(displayCanvas, quality);

    let thumb: Blob | null = null;
    if (wantThumb) {
      try {
        // Reduz a partir do display (mais barato e com melhor qualidade).
        const thumbCanvas = draw(
          displayCanvas,
          displayCanvas.width,
          displayCanvas.height,
          opts.thumbMaxSide ?? THUMB_SIDE,
        );
        thumb = await canvasToJpeg(thumbCanvas, opts.thumbQuality ?? THUMB_QUALITY);
      } catch (e) {
        console.warn("[imageVariants] thumb failed", e);
      }
    }
    return { display, thumb, displayIsOriginal: false, displayExt: "jpg", displayType: "image/jpeg" };
  } catch (e) {
    console.warn("[imageVariants] decode failed, uploading original", e);
    return {
      display: file,
      thumb: null,
      displayIsOriginal: true,
      displayExt: originalExtension(file),
      displayType: file.type || "application/octet-stream",
    };
  } finally {
    decoded?.close();
  }
}

/** Compressão simples (sem miniatura) — recibos e avatar. */
export async function compressImage(
  file: File,
  maxSide: number,
  quality: number,
): Promise<{ file: File; ext: string; changed: boolean }> {
  const v = await makeImageVariants(file, "custom", { maxSide, quality, thumb: false });
  if (v.displayIsOriginal) return { file, ext: v.displayExt, changed: false };
  const base = file.name.replace(/\.[^.]+$/, "") || "foto";
  return {
    file: new File([v.display], `${base}.jpg`, { type: "image/jpeg" }),
    ext: "jpg",
    changed: true,
  };
}

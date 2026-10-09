/**
 * "Salvar no Fotos": no iPhone, navigator.share({ files }) abre a folha de
 * compartilhamento com "Salvar imagem/imagens", que grava no app Fotos.
 * Sem Web Share com arquivos, cai para download comum.
 */

export function canShareFiles(files: File[]): boolean {
  try {
    return (
      files.length > 0 &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files })
    );
  } catch {
    return false;
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type SaveResult = "shared" | "downloaded" | "cancelled";

export async function shareOrDownload(files: File[]): Promise<SaveResult> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === "AbortError") return "cancelled";
      // NotAllowedError (perdeu o gesto) ou outro: tenta download
      console.warn("[saveToPhotos] share failed, falling back to download", e);
    }
  }
  files.forEach(downloadFile);
  return "downloaded";
}

function nameFromUrl(url: string, fallback: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "";
    const clean = decodeURIComponent(last).replace(/[^\w.-]/g, "_");
    return clean || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchAsFile(url: string, fallbackName = "evoque.jpg"): Promise<File> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  let name = nameFromUrl(url, fallbackName);
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) name = `${name}.jpg`;
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

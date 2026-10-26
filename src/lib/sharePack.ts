/**
 * Pacote de compartilhamento do restaurante: junta as fotos escolhidas
 * (lugar, cardápio, comida, vinho, amigos, recibo) e entrega como
 * arquivos para o WhatsApp (folha nativa) ou como um PDF.
 */
import { jsPDF } from "jspdf";
import { canShareFiles, fetchAsFile } from "@/lib/saveToPhotos";
import { pdfSafe, writeMarkdown } from "@/lib/pdfText";
import { supabase } from "@/integrations/supabase/client";

export type ShareCategory = "place" | "menu" | "food" | "wine" | "friends" | "receipt";

export const SHARE_CATEGORIES: ShareCategory[] = ["place", "menu", "food", "wine", "friends", "receipt"];

export interface ShareInfo {
  name: string;
  address?: string | null;
  visitDate?: string | null;
  rating?: number | null;
}

export type SharePhotos = Record<ShareCategory, string[]>;

const fileCache = new Map<string, Promise<File>>();

/** Baixa (e guarda) a foto como arquivo, para o toque de compartilhar ser imediato no iPhone. */
export function prefetchFile(url: string, fallbackName: string): Promise<File> {
  let p = fileCache.get(url);
  if (!p) {
    p = fetchAsFile(url, fallbackName).catch((e) => {
      fileCache.delete(url);
      throw e;
    });
    fileCache.set(url, p);
  }
  return p;
}

export interface Collected {
  files: File[];
  /** Quantas fotos não puderam ser baixadas. */
  failed: number;
}

export async function collectFiles(photos: SharePhotos, selected: ShareCategory[]): Promise<Collected> {
  const jobs: Promise<File>[] = [];
  for (const cat of selected) {
    photos[cat].forEach((url, i) => jobs.push(prefetchFile(url, `${cat}-${i + 1}.jpg`)));
  }
  const results = await Promise.allSettled(jobs);
  const files: File[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") files.push(r.value);
    else {
      failed += 1;
      console.error("[share] foto não baixou", r.reason);
    }
  }
  return { files, failed };
}

export function shareText(info: ShareInfo, labels: { visit: string; rating: string }): string {
  const lines = [info.name];
  if (info.address) lines.push(info.address);
  if (info.visitDate) lines.push(`${labels.visit}: ${info.visitDate}`);
  if (info.rating) lines.push(`${labels.rating}: ${"★".repeat(info.rating)}`);
  return lines.join("\n");
}

export type ShareOutcome = "shared" | "fallback" | "cancelled";

/** Celular/tablet (iPad se apresenta como Mac, mas tem toque). */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

/**
 * Computador: abre o app do WhatsApp direto com o texto e os links das fotos
 * (a folha de compartilhar do Mac não lista o WhatsApp). Se o app não abrir,
 * cai no WhatsApp Web.
 */
export function openWhatsAppDesktop(message: string) {
  const text = encodeURIComponent(message);
  let left = false;
  const onBlur = () => {
    left = true;
  };
  window.addEventListener("blur", onBlur, { once: true });
  window.location.href = `whatsapp://send?text=${text}`;
  setTimeout(() => {
    window.removeEventListener("blur", onBlur);
    if (!left && document.visibilityState === "visible") {
      window.open(`https://web.whatsapp.com/send?text=${text}`, "_blank", "noopener");
    }
  }, 1500);
}

/**
 * WhatsApp no celular: folha nativa com as fotos; escolhe o WhatsApp e um ou
 * mais contatos. Sem suporte a arquivos, abre o WhatsApp só com o texto.
 */
export async function shareToWhatsApp(text: string, files: File[]): Promise<ShareOutcome> {
  if (files.length > 0 && canShareFiles(files)) {
    try {
      await navigator.share({ files, text });
      return "shared";
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return "cancelled";
      console.warn("[share] navigator.share falhou, usando wa.me", e);
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return "fallback";
}

/**
 * Guarda o PDF na pasta do usuário no Storage (bucket público, caminho
 * impossível de adivinhar) e devolve o link — usado no WhatsApp do computador,
 * que não recebe arquivos de um site.
 */
export async function uploadSharePdf(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("sem usuário");
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${uid}/compartilhados/${Date.now().toString(36)}-${rand}/${file.name}`;
  const { error } = await supabase.storage.from("restaurant-photos").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("restaurant-photos").getPublicUrl(path).data.publicUrl;
}

function loadImage(file: File): Promise<{ dataUrl: string; w: number; h: number; fmt: "JPEG" | "PNG" }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight, fmt: file.type === "image/png" ? "PNG" : "JPEG" });
      img.onerror = () => reject(new Error("imagem inválida"));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export interface PdfSection {
  label: string;
  files: File[];
  /** Traduções do cardápio: vão num anexo no fim, com link a partir desta seção. */
  appendix?: { title: string; linkLabel: string; texts: string[] };
}

/**
 * Monta um PDF A4: cabeçalho do restaurante, fotos por seção (duas por linha)
 * e, se houver, o anexo com a tradução do cardápio — que só abre quem tocar no
 * link "Ver tradução" ou no índice lateral do PDF.
 */
export async function buildPdf(info: ShareInfo, sections: PdfSection[], labels: { visit: string; rating: string }): Promise<File> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const gap = 6;
  const colW = (pageW - margin * 2 - gap) / 2;
  const maxH = 90;
  const box = { margin, pageW, pageH };
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(pdfSafe(info.name), margin, y + 7);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  if (info.address) {
    const lines = doc.splitTextToSize(pdfSafe(info.address), pageW - margin * 2) as string[];
    doc.text(lines, margin, y + 4);
    y += 5 * lines.length + 1;
  }
  const meta: string[] = [];
  if (info.visitDate) meta.push(`${labels.visit}: ${info.visitDate}`);
  if (info.rating) meta.push(`${labels.rating}: ${info.rating}/5`);
  if (meta.length) {
    doc.text(pdfSafe(meta.join("   ·   ")), margin, y + 4);
    y += 7;
  }
  doc.setTextColor(0);
  y += 4;

  // links para o anexo, preenchidos depois que as páginas do anexo existirem
  const pendingLinks: { page: number; x: number; y: number; w: number; h: number; appendix: NonNullable<PdfSection["appendix"]> }[] = [];

  for (const section of sections) {
    const hasAppendix = !!section.appendix && section.appendix.texts.length > 0;
    if (section.files.length === 0 && !hasAppendix) continue;
    if (y + 14 > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(pdfSafe(section.label), margin, y + 5);
    doc.outline.add(null, pdfSafe(section.label), { pageNumber: doc.getNumberOfPages() });
    y += 9;

    if (hasAppendix) {
      const label = pdfSafe(section.appendix!.linkLabel);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(26, 115, 232);
      const w = doc.getTextWidth(label);
      doc.text(label, margin, y + 4);
      doc.setDrawColor(26, 115, 232);
      doc.line(margin, y + 5, margin + w, y + 5);
      doc.setTextColor(0);
      pendingLinks.push({ page: doc.getNumberOfPages(), x: margin, y: y - 1, w, h: 7, appendix: section.appendix! });
      y += 10;
    }

    let col = 0;
    let rowH = 0;
    for (const file of section.files) {
      let img;
      try {
        img = await loadImage(file);
      } catch {
        continue;
      }
      const scale = Math.min(colW / img.w, maxH / img.h);
      const w = img.w * scale;
      const h = img.h * scale;
      if (col === 0 && y + h > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      const x = margin + col * (colW + gap) + (colW - w) / 2;
      doc.addImage(img.dataUrl, img.fmt, x, y, w, h, undefined, "FAST");
      rowH = Math.max(rowH, h);
      col += 1;
      if (col === 2) {
        col = 0;
        y += rowH + gap;
        rowH = 0;
      }
    }
    if (col !== 0) y += rowH + gap;
    y += 4;
  }

  // Anexo: cada tradução numa página nova, no fim do PDF
  for (const link of pendingLinks) {
    doc.addPage();
    const startPage = doc.getNumberOfPages();
    doc.outline.add(null, pdfSafe(link.appendix.title), { pageNumber: startPage });
    let ay = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(pdfSafe(link.appendix.title), margin, ay + 7);
    ay += 14;
    link.appendix.texts.forEach((text, i) => {
      if (i > 0) {
        doc.addPage();
        ay = margin;
      }
      ay = writeMarkdown(doc, text, ay, box);
    });
    doc.setPage(link.page);
    doc.link(link.x, link.y, link.w, link.h, { pageNumber: startPage });
    doc.setPage(doc.getNumberOfPages());
  }

  const safeName = info.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "restaurante";
  const blob = doc.output("blob");
  return new File([blob], `${safeName}.pdf`, { type: "application/pdf" });
}

/** Compartilha o PDF pela folha nativa; sem suporte, abre numa aba nova. */
export async function sharePdf(file: File): Promise<ShareOutcome> {
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return "cancelled";
      console.warn("[share] compartilhar PDF falhou, abrindo em aba", e);
    }
  }
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "fallback";
}

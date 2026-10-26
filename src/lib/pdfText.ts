/**
 * Escreve texto em markdown simples (tradução do cardápio) num jsPDF:
 * títulos (#, ##), separador (---), citação (>), itens (•, *, -) e
 * explicações recuadas. Tira emojis e marcações (**, *) — as fontes
 * padrão do PDF só têm o alfabeto latino.
 */
import type { jsPDF } from "jspdf";

export interface TextBox {
  margin: number;
  pageW: number;
  pageH: number;
}

/** Remove emojis e símbolos fora do alfabeto latino; mantém acentos, aspas curvas, travessão, €, •. */
export function pdfSafe(text: string): string {
  const extra = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac]);
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || (code >= 32 && code <= 0xff) || extra.has(code)) out += ch;
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

function stripMarks(text: string): string {
  return text.replace(/\*\*|__/g, "").replace(/(^|[^\w])\*(?!\s)([^*]+?)\*(?=[^\w]|$)/g, "$1$2").replace(/\\\*/g, "*");
}

/** Escreve o texto a partir de `y`; devolve o novo y (criando páginas se precisar). */
export function writeMarkdown(doc: jsPDF, md: string, y: number, box: TextBox): number {
  const width = box.pageW - box.margin * 2;
  const ensure = (h: number) => {
    if (y + h > box.pageH - box.margin) {
      doc.addPage();
      y = box.margin;
    }
  };
  const para = (text: string, opts: { size: number; bold?: boolean; italic?: boolean; gray?: number; indent?: number; gapBefore?: number }) => {
    const clean = pdfSafe(stripMarks(text));
    if (!clean) return;
    const style = opts.bold && opts.italic ? "bolditalic" : opts.bold ? "bold" : opts.italic ? "italic" : "normal";
    doc.setFont("helvetica", style);
    doc.setFontSize(opts.size);
    doc.setTextColor(opts.gray ?? 0);
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(clean, width - indent) as string[];
    const lh = opts.size * 0.45;
    y += opts.gapBefore ?? 0;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, box.margin + indent, y + lh * 0.8);
      y += lh;
    }
    doc.setTextColor(0);
  };

  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) {
      y += 2;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      ensure(5);
      doc.setDrawColor(200);
      doc.line(box.margin, y + 2, box.pageW - box.margin, y + 2);
      y += 5;
      continue;
    }
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      para(h[2], { size: h[1].length === 1 ? 15 : 13, bold: true, gapBefore: 3 });
      y += 1;
      continue;
    }
    if (trimmed.startsWith(">")) {
      para(trimmed.replace(/^>\s?/, ""), { size: 10, italic: true, gray: 90 });
      continue;
    }
    const bullet = trimmed.match(/^(?:[•*-])\s+(.*)$/);
    const indented = /^\s{2,}/.test(line);
    if (bullet && !indented) {
      para(`• ${bullet[1]}`, { size: 11, bold: /^\*\*/.test(bullet[1]), gapBefore: 1 });
      continue;
    }
    if (bullet && indented) {
      para(`• ${bullet[1]}`, { size: 10.5, indent: 4 });
      continue;
    }
    if (indented) {
      para(trimmed, { size: 10, gray: 90, indent: 4 });
      continue;
    }
    // linha inteira em negrito = subtítulo
    if (/^\*\*[^*]+\*\*(\s*\([^)]*\))?$/.test(trimmed)) {
      para(trimmed, { size: 12, bold: true, gapBefore: 3 });
      continue;
    }
    para(trimmed, { size: 11 });
  }
  return y;
}

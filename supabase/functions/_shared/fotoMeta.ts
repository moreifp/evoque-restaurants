// Grava dentro do JPEG os dados que o Apple Fotos (e o Google Fotos) mostram:
//   - XMP dc:title       → "Título" (nome do restaurante)
//   - XMP dc:description → "Legenda" (restaurante · endereço · data)
//   - EXIF GPS           → localização do restaurante, só se a foto ainda não tiver GPS
// A imagem não é recodificada: só entram segmentos de metadados. Se algo der errado,
// devolve os bytes originais (nunca perde a foto). Arquivos que não são JPEG passam intactos.

import * as piexifMod from "https://esm.sh/piexifjs@1.0.6";
// deno-lint-ignore no-explicit-any
const piexif: any = (piexifMod as any).default ?? piexifMod;

export interface Metadados {
  titulo: string;
  descricao?: string;
  lat?: number | null;
  lng?: number | null;
}

const XMP_NS = "http://ns.adobe.com/xap/1.0/\0";

function ehJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
}

function paraBinario(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}

function deBinario(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dms(v: number): [number, number][] {
  const a = Math.abs(v);
  const g = Math.floor(a);
  const mf = (a - g) * 60;
  const m = Math.floor(mf);
  const s = Math.round((mf - m) * 60 * 100);
  return [[g, 1], [m, 1], [s, 100]];
}

/** GPS pelo piexif (só se a foto não tiver latitude). */
function comGps(b: Uint8Array, lat: number, lng: number): Uint8Array {
  const str = paraBinario(b);
  let exif: Record<string, Record<number, unknown>>;
  try {
    exif = piexif.load(str);
  } catch {
    exif = { "0th": {}, Exif: {}, GPS: {}, Interop: {}, "1st": {}, thumbnail: null as never };
  }
  const gps = (exif.GPS ??= {});
  if (gps[piexif.GPSIFD.GPSLatitude]) return b; // já tem localização: respeita a do celular
  gps[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
  gps[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
  gps[piexif.GPSIFD.GPSLatitude] = dms(lat);
  gps[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
  gps[piexif.GPSIFD.GPSLongitude] = dms(lng);
  return deBinario(piexif.insert(piexif.dump(exif), str));
}

/** Acha o segmento XMP existente (APP1 com o namespace do XMP). */
function acharXmp(b: Uint8Array): { ini: number; fim: number } | null {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const marcador = b[i + 1];
    if (marcador === 0xda || marcador === 0xd9) break; // começo da imagem
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marcador === 0xe1) {
      const cab = new TextDecoder("latin1").decode(b.subarray(i + 4, i + 4 + XMP_NS.length));
      if (cab === XMP_NS) return { ini: i, fim: i + 2 + len };
    }
    i += 2 + len;
  }
  return null;
}

/** Onde inserir um segmento novo: depois dos APP0/APP1 iniciais. */
function posInsercao(b: Uint8Array): number {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff && (b[i + 1] === 0xe0 || b[i + 1] === 0xe1)) {
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return i;
}

function segmentoXmp(xml: string): Uint8Array {
  const corpo = new TextEncoder().encode(XMP_NS + xml);
  const len = corpo.length + 2;
  if (len > 0xffff) throw new Error("XMP grande demais");
  const seg = new Uint8Array(2 + len);
  seg.set([0xff, 0xe1, len >> 8, len & 0xff]);
  seg.set(corpo, 4);
  return seg;
}

function comXmp(b: Uint8Array, titulo: string, descricao: string): Uint8Array {
  const desc = `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escXml(titulo)}</rdf:li></rdf:Alt></dc:title>` +
    (descricao ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escXml(descricao)}</rdf:li></rdf:Alt></dc:description>` : "") +
    `</rdf:Description>`;
  const atual = acharXmp(b);
  if (atual) {
    // Junta ao XMP que já existe (não apaga nada do celular), trocando título/legenda antigos.
    let xml = new TextDecoder().decode(b.subarray(atual.ini + 4 + XMP_NS.length, atual.fim));
    xml = xml.replace(/<dc:title>[\s\S]*?<\/dc:title>/g, "").replace(/<dc:description>[\s\S]*?<\/dc:description>/g, "");
    if (!xml.includes("</rdf:RDF>")) throw new Error("XMP sem rdf:RDF");
    xml = xml.replace("</rdf:RDF>", desc + "</rdf:RDF>");
    const seg = segmentoXmp(xml);
    const out = new Uint8Array(b.length - (atual.fim - atual.ini) + seg.length);
    out.set(b.subarray(0, atual.ini));
    out.set(seg, atual.ini);
    out.set(b.subarray(atual.fim), atual.ini + seg.length);
    return out;
  }
  const xml = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${desc}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const seg = segmentoXmp(xml);
  const p = posInsercao(b);
  const out = new Uint8Array(b.length + seg.length);
  out.set(b.subarray(0, p));
  out.set(seg, p);
  out.set(b.subarray(p), p + seg.length);
  return out;
}

export function comMetadados(original: Uint8Array, m: Metadados): Uint8Array {
  if (!ehJpeg(original)) return original;
  let b = original;
  if (typeof m.lat === "number" && typeof m.lng === "number" && isFinite(m.lat) && isFinite(m.lng) && (m.lat !== 0 || m.lng !== 0)) {
    try {
      b = comGps(b, m.lat, m.lng);
    } catch (e) {
      console.warn("[fotoMeta] GPS não gravado:", e instanceof Error ? e.message : e);
      b = original;
    }
  }
  try {
    return comXmp(b, m.titulo, m.descricao ?? "");
  } catch (e) {
    console.warn("[fotoMeta] título não gravado:", e instanceof Error ? e.message : e);
    return b;
  }
}

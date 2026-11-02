/**
 * Nota fiscal (NFC-e) pelo favorito "Enviar ao Evoque".
 *
 * A Sefaz só abre a nota no celular da pessoa (bloqueia servidores). Então:
 *   1. a câmera do iPhone lê o QR e a nota abre no Safari;
 *   2. o favorito "Enviar ao Evoque" pega o texto da página (sem CPF) e abre
 *      /nota#k=<chave>&u=<link>&t=<texto> no app;
 *   3. /nota manda para a função receive-nfce, que lê os itens e grava em
 *      pending_receipts;
 *   4. o restaurante aberto no app pega a nota e grava no Recibo.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptData } from "@/lib/draftStore";

const APP_URL = "https://restaurantes.evoque.global";
/** Nota recebida há mais tempo que isso não entra sozinha em restaurante nenhum. */
export const NOTA_VALIDADE_MS = 3 * 60 * 60 * 1000;

function novaChave(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Chave pessoal de envio (cria na primeira vez). */
export async function getSendKey(userId: string): Promise<string> {
  const { data } = await supabase.from("nfce_send_keys").select("key").eq("user_id", userId).maybeSingle();
  if (data?.key) return data.key;
  const key = novaChave();
  const { error } = await supabase.from("nfce_send_keys").insert({ user_id: userId, key });
  if (error) throw error;
  return key;
}

/** Troca a chave (o favorito antigo para de funcionar). */
export async function resetSendKey(userId: string): Promise<string> {
  const key = novaChave();
  const { error } = await supabase.from("nfce_send_keys").upsert({ user_id: userId, key });
  if (error) throw error;
  return key;
}

/**
 * Código do favorito. Roda na página da nota (Safari): pega o texto visível,
 * tira linhas com CPF e abre /nota no app com tudo no "#" (não vai a servidor
 * nenhum até o app mandar para a função).
 */
export function bookmarkletCode(key: string): string {
  return (
    "javascript:(function(){var t=(document.body.innerText||'').replace(/CPF[^\\n]*/gi,'').slice(0,20000);" +
    `location.href='${APP_URL}/nota#k=${key}&u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(t);})()`
  );
}

export interface PendingNota {
  id: string;
  data: ReceiptData & { restaurant?: string | null };
  source_url: string | null;
  created_at: string;
}

/** Nota recebida e ainda não usada (a mais nova, dentro da validade). */
export async function fetchPendingNota(): Promise<PendingNota | null> {
  const desde = new Date(Date.now() - NOTA_VALIDADE_MS).toISOString();
  const { data, error } = await supabase
    .from("pending_receipts")
    .select("id, data, source_url, created_at")
    .eq("status", "new")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PendingNota;
}

export async function markNotaUsed(id: string): Promise<void> {
  await supabase.from("pending_receipts").update({ status: "used", used_at: new Date().toISOString() }).eq("id", id);
}

function money(v: number | null | undefined, cur: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur || "BRL" }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

/** Imagem do "recibo digital" (vira a foto do Recibo, já que a nota veio sem foto). */
export async function renderNotaImage(data: PendingNota["data"], title: string): Promise<Blob> {
  const items = Array.isArray(data.items) ? data.items : [];
  const cur = data.currency || "BRL";
  const W = 900;
  const pad = 56;
  const lh = 46;
  const H = pad * 2 + 150 + items.length * lh + 200;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#0d1a2d";
  g.font = "bold 38px -apple-system, Helvetica, Arial, sans-serif";
  let y = pad + 36;
  g.fillText(title, pad, y, W - pad * 2);
  if (data.restaurant) {
    g.font = "26px -apple-system, Helvetica, Arial, sans-serif";
    g.fillStyle = "#6b7280";
    y += 44;
    g.fillText(String(data.restaurant), pad, y, W - pad * 2);
  }
  y += 34;
  g.strokeStyle = "#e5e7eb";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(pad, y);
  g.lineTo(W - pad, y);
  g.stroke();
  y += 20;
  g.font = "28px -apple-system, Helvetica, Arial, sans-serif";
  for (const it of items) {
    y += lh;
    const q = it.quantity && it.quantity !== 1 ? `${it.quantity}× ` : "";
    const nome = `${q}${(it.name_pt || it.name || "").trim()}`;
    const val = money(it.line_total, cur);
    g.fillStyle = "#111827";
    g.textAlign = "left";
    g.fillText(nome, pad, y, W - pad * 2 - 200);
    g.textAlign = "right";
    g.fillText(val, W - pad, y);
  }
  y += 30;
  g.beginPath();
  g.moveTo(pad, y);
  g.lineTo(W - pad, y);
  g.stroke();
  const linha = (rotulo: string, v: number | null | undefined, bold = false) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    y += bold ? 56 : 44;
    g.font = `${bold ? "bold 34px" : "28px"} -apple-system, Helvetica, Arial, sans-serif`;
    g.fillStyle = bold ? "#0d1a2d" : "#6b7280";
    g.textAlign = "left";
    g.fillText(rotulo, pad, y);
    g.textAlign = "right";
    g.fillText(money(v, cur), W - pad, y);
  };
  linha("Subtotal", data.subtotal);
  linha("Serviço", data.service_fee);
  linha("Total", data.total, true);
  const out = document.createElement("canvas");
  out.width = W;
  out.height = Math.min(H, y + pad);
  out.getContext("2d")!.drawImage(c, 0, 0);
  return await new Promise<Blob>((ok, err) => out.toBlob((b) => (b ? ok(b) : err(new Error("canvas"))), "image/jpeg", 0.9));
}

/**
 * Grava a nota no Recibo de um restaurante já salvo (substitui o recibo que
 * houver): imagem do recibo digital no Storage + receipts + receipt_items.
 */
export async function saveNotaToEntry(entryId: string, userId: string, nota: PendingNota, title: string): Promise<void> {
  const img = await renderNotaImage(nota.data, title);
  const path = `receipts/${userId}/${Date.now()}_nota.jpg`;
  const { error: upErr } = await supabase.storage
    .from("restaurant-photos")
    .upload(path, img, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (upErr) throw upErr;
  const photoUrl = supabase.storage.from("restaurant-photos").getPublicUrl(path).data.publicUrl;

  const { data: antigos } = await supabase.from("receipts").select("id").eq("entry_id", entryId);
  const ids = (antigos ?? []).map((r) => r.id);
  if (ids.length) {
    await supabase.from("receipt_items").delete().in("receipt_id", ids);
    await supabase.from("receipts").delete().in("id", ids);
  }

  const d = nota.data;
  const { data: rec, error } = await supabase
    .from("receipts")
    .insert({
      entry_id: entryId,
      photo_url: photoUrl,
      subtotal: d.subtotal ?? null,
      tax: d.tax ?? null,
      service_fee: d.service_fee ?? null,
      total: d.total ?? null,
      currency: d.currency ?? "BRL",
    })
    .select("id")
    .single();
  if (error) throw error;
  const items = Array.isArray(d.items) ? d.items : [];
  if (items.length) {
    const { error: e2 } = await supabase.from("receipt_items").insert(
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
    if (e2) {
      await supabase.from("receipts").delete().eq("id", rec.id);
      throw e2;
    }
  }
}

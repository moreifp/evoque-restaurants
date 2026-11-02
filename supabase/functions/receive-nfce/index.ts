// Recebe a nota fiscal (NFC-e) mandada pelo favorito "Enviar ao Evoque" do Safari.
// A Sefaz só abre a nota no celular da pessoa: o favorito lê o texto da página
// da nota e abre /nota no app, que chama esta função com a chave pessoal.
//   { k: chave, u: link da nota, t: texto da página }
// → lê os itens com a IA e grava em pending_receipts; o app grava no Recibo.
// Sem login (vem do Safari): quem identifica a pessoa é a chave.
import { aiFetch } from "../_shared/ai.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_TEXT = 30_000;
const POR_HORA = 20;

function resp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Tira CPF/CNPJ e nome do consumidor. */
function semConsumidor(t: string): string {
  return t
    .replace(/CPF\s*:?\s*[\d.\-/*]{11,18}/gi, "CPF: (omitido)")
    .replace(/(Consumidor[\s\S]{0,40}?Nome\s*:?)[^\n]*/i, "$1 (omitido)");
}

function sefaz(u: string): boolean {
  try {
    const h = new URL(u.replace(/\|/g, "%7C")).hostname;
    return /(^|\.)fazenda\.[a-z]{2}\.gov\.br$/i.test(h) || /(^|\.)sefaz\.[a-z]{2}\.gov\.br$/i.test(h) || /(^|\.)sef\.sc\.gov\.br$/i.test(h);
  } catch {
    return false;
  }
}

function reciboValido(input: unknown): boolean {
  const r = input as { items?: unknown; total?: unknown } | null;
  return !!r && Array.isArray(r.items) && typeof r.total === "number" && Number.isFinite(r.total);
}

const FERRAMENTA = {
  type: "function",
  function: {
    name: "extract_receipt_data",
    description: "Extract structured data from a restaurant receipt",
    parameters: {
      type: "object",
      properties: {
        restaurant: { type: "string", description: "Business name of the issuer (emitente), as printed" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_type: { type: "string", enum: ["dish", "drink"] },
              name: { type: "string", description: "Name exactly as printed" },
              name_pt: { type: "string", description: "Name in Brazilian Portuguese, natural casing (e.g. 'Negroni Tanqueray', 'Água com gás')" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              line_total: { type: "number" },
            },
            required: ["item_type", "name", "name_pt", "quantity", "unit_price", "line_total"],
          },
        },
        subtotal: { type: "number" },
        tax: { type: "number" },
        service_fee: { type: "number" },
        total: { type: "number", description: "Amount to pay (Valor a pagar)" },
        currency: { type: "string" },
      },
      required: ["items", "total", "currency"],
    },
  },
};

async function lerNota(texto: string): Promise<Record<string, unknown> | null> {
  const r = await aiFetch("anthropic", {
    method: "POST",
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `Texto da página oficial da NFC-e (nota fiscal de consumidor):\n\n${texto}` },
          {
            type: "text",
            text:
              "Extract every consumed item of this Brazilian restaurant invoice (NFC-e): dish or drink, name exactly as printed, name_pt (same item in natural Brazilian Portuguese casing, fix abbreviations when obvious), quantity, unit price and line total. Lines such as SERVICO, SERVIÇO, TAXA DE SERVIÇO, GORJETA or 10% are fees: put them in service_fee and do NOT list them as items. Subtotal = sum of the items; total = 'Valor a pagar'. Ignore payment methods, troco and 'Trib aprox'. Numbers use a comma as decimal separator. Currency BRL. If it is not a receipt, call the tool with items [] and total 0.",
          },
        ],
      }],
      tools: [FERRAMENTA],
      tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
    }),
  }, { modelo: "rapido", maxTokens: 4000, reservaPadrao: true, validar: reciboValido });
  if (!r.ok) throw new Error(`IA ${r.status}`);
  const j = await r.json();
  const chamada = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!chamada) return null;
  const dados = JSON.parse(chamada.function.arguments);
  if (!Array.isArray(dados?.items) || dados.items.length === 0) return null;
  for (const it of dados.items) {
    if (it && (typeof it.name_pt !== "string" || !it.name_pt.trim())) it.name_pt = typeof it.name === "string" ? it.name : "";
  }
  return dados;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return resp({ ok: false, error: "método" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const k = typeof body?.k === "string" ? body.k.trim() : "";
    const u = typeof body?.u === "string" ? body.u.slice(0, 2000) : "";
    const t = typeof body?.t === "string" ? body.t.slice(0, MAX_TEXT) : "";
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(k)) return resp({ ok: false, error: "chave" }, 401);
    if (t.length < 50) return resp({ ok: false, error: "nota vazia" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const { data: dono } = await admin.from("nfce_send_keys").select("user_id").eq("key", k).maybeSingle();
    if (!dono?.user_id) return resp({ ok: false, error: "chave" }, 401);

    const umaHora = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from("pending_receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", dono.user_id)
      .gte("created_at", umaHora);
    if ((count ?? 0) >= POR_HORA) return resp({ ok: false, error: "muitas notas" }, 429);

    console.log(`[receive-nfce] user=${dono.user_id} sefaz=${sefaz(u)} texto=${t.length}`);
    const dados = await lerNota(semConsumidor(t));
    if (!dados) return resp({ ok: false, error: "não parece uma nota" }, 422);

    const { error } = await admin.from("pending_receipts").insert({
      user_id: dono.user_id,
      source_url: sefaz(u) ? u : null,
      data: dados,
    });
    if (error) throw error;
    const items = dados.items as unknown[];
    return resp({ ok: true, total: dados.total, currency: dados.currency ?? "BRL", items: items.length, restaurant: dados.restaurant ?? null });
  } catch (e) {
    console.error("[receive-nfce]", e);
    return resp({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "erro" }, 500);
  }
});

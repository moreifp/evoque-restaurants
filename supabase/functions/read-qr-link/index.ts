// Lê o link de um QR code (cardápio ou recibo) e devolve o mesmo resultado
// das leituras por foto:
//   kind "menu"    → { success, translation }      (igual ao translate-menu)
//   kind "receipt" → { success, data }             (igual ao process-receipt)
// Quando o link não serve, devolve { success: false, reason } com status 200 —
// o app então lê a foto como antes.
//
// Conteúdos aceitos: página web (texto), PDF, imagem, Google Drive (arquivo ou
// pasta) e Google Docs. Para NFC-e o app manda o texto já pronto (`text`),
// porque a Sefaz bloqueia servidores de nuvem.
import { aiFetch } from "../_shared/ai.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const falhou = (reason: string, error?: string) => resp({ success: false, reason, ...(error ? { error } : {}) });

// ───────────────────────── busca segura ─────────────────────────

/** Bloqueia endereços internos (localhost, redes privadas, metadados da nuvem). */
function hostBloqueado(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true; // IPv6 literal
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function urlSegura(raw: string): URL | null {
  try {
    const u = new URL(raw.trim().replace(/\|/g, "%7C"));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (u.port && !["80", "443"].includes(u.port)) return null;
    if (hostBloqueado(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

interface Baixado {
  url: string;
  type: string;
  bytes: Uint8Array;
}

/** GET com redirecionamentos conferidos um a um, tempo e tamanho limitados. */
async function baixar(inicial: string): Promise<Baixado | null> {
  let atual = urlSegura(inicial);
  for (let i = 0; i < 6 && atual; i++) {
    const r = await fetch(atual.toString(), {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/pdf,image/*,*/*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      await r.body?.cancel();
      atual = loc ? urlSegura(new URL(loc, atual).toString()) : null;
      continue;
    }
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      return null;
    }
    const tamanho = Number(r.headers.get("content-length") ?? 0);
    if (tamanho > MAX_BYTES) {
      await r.body.cancel();
      return null;
    }
    const partes: Uint8Array[] = [];
    let total = 0;
    const leitor = r.body.getReader();
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await leitor.cancel();
        return null;
      }
      partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) {
      bytes.set(p, pos);
      pos += p.length;
    }
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return { url: atual.toString(), type: tipoReal(type, bytes), bytes };
  }
  return null;
}

/** Corrige o tipo pelo começo do arquivo (Drive manda tudo como octet-stream). */
function tipoReal(type: string, b: Uint8Array): string {
  const ini = (n: number) => String.fromCharCode(...b.slice(0, n));
  if (ini(5) === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (ini(8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (ini(4) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (ini(3) === "GIF") return "image/gif";
  return type || "application/octet-stream";
}

// ───────────────────────── HTML → texto ─────────────────────────

function decodificar(b: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(b);
}

function entidades(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlParaTexto(html: string): string {
  const s = html
    .replace(/<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|table|section|article|ul|ol|dt|dd)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return entidades(s)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Links da página que parecem levar ao cardápio (PDF, Drive, Docs). */
function linksDeCardapio(html: string, base: string): string[] {
  const out: string[] = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let u: URL;
    try {
      u = new URL(entidades(m[1]), base);
    } catch {
      continue;
    }
    const s = u.toString();
    if (/\.pdf($|\?)/i.test(u.pathname + u.search) || /drive\.google\.com\/(file|drive\/folders)|docs\.google\.com\/(document|presentation)/i.test(s)) {
      if (!out.includes(s)) out.push(s);
    }
  }
  return out.slice(0, 3);
}

// ───────────────────────── Google Drive / Docs ─────────────────────────

function idDrive(u: URL): { tipo: "pasta" | "arquivo" | "doc" | "slides" | "planilha"; id: string } | null {
  const p = u.pathname;
  let m: RegExpExecArray | null;
  if (/drive\.google\.com$/i.test(u.hostname)) {
    if ((m = /\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/.exec(p))) return { tipo: "pasta", id: m[1] };
    if ((m = /\/file\/d\/([\w-]+)/.exec(p))) return { tipo: "arquivo", id: m[1] };
    const id = u.searchParams.get("id");
    if (id && /^\/(open|uc)$/.test(p)) return { tipo: "arquivo", id };
  }
  if (/docs\.google\.com$/i.test(u.hostname)) {
    if ((m = /\/document\/d\/([\w-]+)/.exec(p))) return { tipo: "doc", id: m[1] };
    if ((m = /\/presentation\/d\/([\w-]+)/.exec(p))) return { tipo: "slides", id: m[1] };
    if ((m = /\/spreadsheets\/d\/([\w-]+)/.exec(p))) return { tipo: "planilha", id: m[1] };
  }
  return null;
}

async function arquivoDrive(id: string): Promise<Baixado | null> {
  return await baixar(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
}

/** Arquivos de uma pasta pública do Drive (até 3), pela página de incorporação. */
async function pastaDrive(id: string): Promise<Baixado[]> {
  const lista = await baixar(`https://drive.google.com/embeddedfolderview?id=${id}`);
  if (!lista) return [];
  const html = decodificar(lista.bytes);
  const ids: string[] = [];
  const re = /drive\.google\.com\/file\/d\/([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) if (!ids.includes(m[1])) ids.push(m[1]);
  const out: Baixado[] = [];
  for (const f of ids.slice(0, 3)) {
    const b = await arquivoDrive(f);
    if (b) out.push(b);
  }
  return out;
}

// ───────────────────────── conteúdo para a IA ─────────────────────────

type Parte = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function parteDe(b: Baixado): Parte | null {
  if (b.type === "application/pdf" || IMAGENS.includes(b.type)) {
    return { type: "image_url", image_url: { url: `data:${b.type};base64,${encodeBase64(b.bytes)}` } };
  }
  if (b.type.startsWith("text/") || b.type.includes("html") || b.type.includes("xml")) {
    const t = htmlParaTexto(decodificar(b.bytes)).slice(0, MAX_TEXT);
    return t.length >= 40 ? { type: "text", text: `Conteúdo da página ${b.url}:\n\n${t}` } : null;
  }
  return null;
}

/** Abre o link e devolve as partes (texto, PDF, imagens) para a IA. */
async function conteudoDoLink(link: string): Promise<{ partes: Parte[]; final: string } | null> {
  const u = urlSegura(link);
  if (!u) return null;

  const g = idDrive(u);
  if (g) {
    let arquivos: Baixado[] = [];
    if (g.tipo === "pasta") arquivos = await pastaDrive(g.id);
    else if (g.tipo === "arquivo") arquivos = [await arquivoDrive(g.id)].filter(Boolean) as Baixado[];
    else {
      const caminho = g.tipo === "doc" ? "document" : g.tipo === "slides" ? "presentation" : "spreadsheets";
      const exp = g.tipo === "planilha" ? "export?format=pdf" : "export/pdf";
      arquivos = [await baixar(`https://docs.google.com/${caminho}/d/${g.id}/${exp}`)].filter(Boolean) as Baixado[];
    }
    const partes = arquivos.map(parteDe).filter(Boolean) as Parte[];
    return partes.length ? { partes, final: u.toString() } : null;
  }

  const b = await baixar(u.toString());
  if (!b) return null;
  const principal = parteDe(b);
  const partes: Parte[] = principal ? [principal] : [];

  // Página com pouco texto ou com link para PDF: segue até 2 links de cardápio
  if (b.type.includes("html")) {
    const html = decodificar(b.bytes);
    const textoCurto = !principal || (principal.type === "text" && principal.text.length < 1500);
    const extras = linksDeCardapio(html, b.url);
    if (textoCurto || extras.length) {
      for (const e of extras.slice(0, 2)) {
        const sub = await conteudoDoLink(e).catch(() => null);
        if (sub) partes.push(...sub.partes);
      }
    }
  }
  return partes.length ? { partes, final: b.url } : null;
}

// ───────────────────────── IA ─────────────────────────

const SEM_CARDAPIO = "SEM_CARDAPIO";

async function traduzirCardapio(partes: Parte[], idioma: string): Promise<string | null> {
  const sistema = `You are an expert culinary translator and food cultural advisor. You receive the content behind a restaurant's menu QR code (a web page, PDF or images) and provide a comprehensive translation with cultural context.

When translating menus:
1. Identify ALL menu items (dishes, drinks, wines) in the content
2. Translate each item to ${idioma}
3. For traditional, ethnic, or unfamiliar dishes, add brief explanations in parentheses describing key ingredients, cooking method or preparation style, and cultural significance or origin
4. Preserve original prices when present
5. Organize items by category using relevant emoji headers

Format:
🍽️ SECTION NAME (Original Section if applicable)
• Item Name in ${idioma} | Price
  (Brief explanation of traditional/unfamiliar dishes)

Categories when appropriate: 🐟 FISH / SEAFOOD, 🍗 POULTRY, 🥩 MEATS, 🥗 VEGETARIAN / SALADS, 🍝 PASTA / RICE, 🍲 SOUPS / STEWS, 🧀 APPETIZERS / STARTERS, 🍰 DESSERTS, 🍷 BEVERAGES / DRINKS.

If the menu is already in ${idioma}, keep the names and still add the explanations for unfamiliar dishes and foreign terms.
Start directly with the menu, no greeting or preamble.
If the content is NOT a restaurant/bar menu (e.g. a login page, social profile, error page or unrelated site), reply with exactly ${SEM_CARDAPIO} and nothing else.`;

  const r = await aiFetch("anthropic", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: [...partes, { type: "text", text: `Translate this menu to ${idioma}, with explanations, following the format.` }] },
      ],
    }),
  }, { modelo: "padrao", maxTokens: 8000 });
  if (!r.ok) throw new Error(`IA ${r.status}`);
  const j = await r.json();
  const texto = (j.choices?.[0]?.message?.content ?? "").trim();
  if (!texto || (texto.includes(SEM_CARDAPIO) && texto.length < 60)) return null;
  return texto;
}

function reciboValido(input: unknown): boolean {
  const r = input as { items?: unknown; total?: unknown } | null;
  return !!r && Array.isArray(r.items) && typeof r.total === "number" && Number.isFinite(r.total);
}

const FERRAMENTA_RECIBO = {
  type: "function",
  function: {
    name: "extract_receipt_data",
    description: "Extract structured data from a restaurant receipt",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_type: { type: "string", enum: ["dish", "drink"], description: "Type of item" },
              name: { type: "string", description: "Name exactly as printed" },
              name_pt: { type: "string", description: "Name in Brazilian Portuguese (same text if already Portuguese)" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              line_total: { type: "number" },
            },
            required: ["item_type", "name", "name_pt", "quantity", "unit_price", "line_total"],
          },
        },
        subtotal: { type: "number" },
        tax: { type: "number" },
        service_fee: { type: "number", description: "Service fee or tip amount" },
        total: { type: "number", description: "Total amount to pay" },
        currency: { type: "string", description: "Currency code (e.g., BRL, USD, EUR)" },
      },
      required: ["items", "total", "currency"],
    },
  },
};

async function lerRecibo(partes: Parte[]): Promise<Record<string, unknown> | null> {
  const r = await aiFetch("anthropic", {
    method: "POST",
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: [
          ...partes,
          {
            type: "text",
            text:
              "This is the content behind the QR code of a restaurant receipt (for Brazil, the official NFC-e consumer invoice page). Extract every consumed item: dish or drink, name exactly as printed, name in Brazilian Portuguese (name_pt; short and natural, keep brands; if already Portuguese, repeat it), quantity, unit price and line total. Lines such as SERVICO, SERVIÇO, TAXA DE SERVIÇO, GORJETA or COUVERT ARTISTICO are fees: put service/tip in service_fee and do NOT list them as items. Subtotal = sum of the items; total = amount to pay (\"Valor a pagar\"). Ignore payment methods, change (troco) and tax-estimate notes (Trib aprox). Numbers use a comma as decimal separator in Brazil. If the content is not a restaurant receipt, call the tool with items [] and total 0.",
          },
        ],
      }],
      tools: [FERRAMENTA_RECIBO],
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

/** Tira CPF e nome do consumidor (vale também para texto vindo do app). */
function semConsumidor(t: string): string {
  return t
    .replace(/CPF\s*:?\s*[\d.\-/*]{11,18}/gi, "CPF: (omitido)")
    .replace(/(Consumidor[\s\S]{0,40}?Nome\s*:?)[^\n]*/i, "$1 (omitido)");
}

// ───────────────────────── entrada ─────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({ success: false, error: "Authentication required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return resp({ success: false, error: "Invalid authentication" }, 401);

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind;
    const url = typeof body?.url === "string" ? body.url.slice(0, 2000) : "";
    const text = typeof body?.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
    const idioma = typeof body?.targetLanguage === "string" && /^[A-Za-z ]{2,20}$/.test(body.targetLanguage) ? body.targetLanguage : "Portuguese";
    const photoId = typeof body?.photoId === "string" && UUID_RE.test(body.photoId) ? body.photoId : null;
    if (kind !== "menu" && kind !== "receipt") return resp({ success: false, error: "kind inválido" }, 400);
    if (!urlSegura(url)) return falhou("bad_url");

    console.log(`[read-qr-link] ${kind} user=${user.id} host=${new URL(url.replace(/\|/g, "%7C")).hostname} texto=${text.length}`);

    let partes: Parte[];
    let final = url;
    if (text) {
      partes = [{ type: "text", text: `Página oficial da nota (${url.split("?")[0]}):\n\n${semConsumidor(text)}` }];
    } else {
      const c = await conteudoDoLink(url).catch((e) => {
        console.warn("[read-qr-link] link", e?.message ?? e);
        return null;
      });
      if (!c) return falhou("unreadable");
      partes = c.partes.map((p) => (p.type === "text" ? { ...p, text: semConsumidor(p.text) } : p));
      final = c.final;
    }

    if (kind === "menu") {
      const translation = await traduzirCardapio(partes, idioma);
      if (!translation) return falhou("not_menu");
      if (photoId) {
        // RLS: só o dono da entrada consegue atualizar
        const { error } = await supabase.from("restaurant_photos").update({ menu_translation: translation, caption: url }).eq("id", photoId);
        if (error) console.warn("[read-qr-link] salvar tradução", error.message);
      }
      return resp({ success: true, translation, source: final });
    }

    const data = await lerRecibo(partes);
    if (!data) return falhou("not_receipt");
    return resp({ success: true, data, source: final });
  } catch (e) {
    console.error("[read-qr-link]", e);
    const msg = e instanceof Error ? e.message : String(e);
    // 429/402 da IA: o app mostra erro; demais: cai para a foto
    if (/IA (429|402)/.test(msg)) return resp({ success: false, error: msg }, 429);
    return falhou("error", msg.slice(0, 200));
  }
});

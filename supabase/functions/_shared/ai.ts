// Adaptador: recebe um pedido no formato OpenAI (chat/completions) e chama a API da
// Anthropic (Claude). Devolve a resposta no mesmo formato OpenAI, para as funções
// continuarem lendo choices[0].message.content / tool_calls.
// A chave fica no segredo ANTHROPIC_API_KEY (lida só aqui).
//
// O campo `model` que vem no corpo é ignorado; quem escolhe o modelo é `opcoes.modelo`:
//   "padrao" → Sonnet 5.5 (ou ANTHROPIC_MODEL, se definido)
//   "rapido" → Haiku 4.5 (extração simples, mais barato)

const API = "https://api.anthropic.com/v1/messages";

/** Sonnet 5.5 ($2/$10 por MTok). Pode ser trocado pelo segredo ANTHROPIC_MODEL. */
export const MODELO_PADRAO = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
/** Haiku 4.5 ($1/$5 por MTok). Aceita tool_choice forçado e temperature. */
export const MODELO_RAPIDO = "claude-haiku-4-5-20251001";

export type ModeloIA = "rapido" | "padrao";

export interface OpcoesIA {
  /** Modelo a usar. Padrão: "padrao" (Sonnet 5.5). */
  modelo?: ModeloIA;
  /** max_tokens da resposta. Padrão: max_tokens do corpo, ou 4096. */
  maxTokens?: number;
  /**
   * Só com modelo "rapido" e ferramenta obrigatória: se o Haiku não chamar a ferramenta
   * (ou `validar` recusar o resultado), tenta de novo com o modelo padrão.
   */
  reservaPadrao?: boolean;
  /** Confere o input da ferramenta obrigatória; false conta como resposta inválida. */
  validar?: (input: unknown) => boolean;
}

/**
 * Os modelos da geração 5 (Sonnet/Opus 5.x) não aceitam `temperature` nem
 * `tool_choice` forçado. Neles a ferramenta vai em modo "auto" com instrução de sistema.
 */
function geracao5(modelo: string): boolean {
  return /^claude-(sonnet|opus|fable)-5/.test(modelo);
}

type Parte = { type: string; text?: string; image_url?: { url: string } | string };
type Msg = { role: string; content: string | Parte[] };
type Bloco = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type RespostaAnthropic = { content?: Bloco[]; stop_reason?: string; usage?: unknown };

function blocos(content: string | Parte[]): unknown[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  const out: unknown[] = [];
  for (const p of content) {
    if (p.type === "text") out.push({ type: "text", text: p.text ?? "" });
    else if (p.type === "image_url") {
      const url = typeof p.image_url === "string" ? p.image_url : p.image_url?.url ?? "";
      const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
      if (m) {
        const tipo = m[1] === "application/pdf" ? "document" : "image";
        out.push({ type: tipo, source: { type: "base64", media_type: m[1], data: m[2] } });
      } else out.push({ type: "image", source: { type: "url", url } });
    }
  }
  return out;
}

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

export async function aiFetch(_url: string, init: RequestInit = {}, opcoes: OpcoesIA = {}): Promise<Response> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY ausente" }, 500);
  const req = JSON.parse(typeof init.body === "string" ? init.body : "{}");

  const sistemaBase = (req.messages as Msg[])
    .filter((m) => m.role === "system")
    .map((m) => typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("\n"))
    .join("\n\n");
  const msgs = (req.messages as Msg[])
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: blocos(m.content) }));
  const maxTokens = opcoes.maxTokens ?? req.max_tokens ?? req.max_completion_tokens ?? 4096;

  const tools = Array.isArray(req.tools) && req.tools.length
    ? req.tools.map((t: { function: { name: string; description?: string; parameters?: unknown } }) => ({
      name: t.function.name, description: t.function.description ?? "", input_schema: t.function.parameters ?? { type: "object", properties: {} },
    }))
    : null;
  // Ferramenta obrigatória: nome específico, "qualquer uma" ("required") ou nenhuma.
  const tc = req.tool_choice;
  const ferramenta: string | null = tools && tc && typeof tc === "object" && tc.function?.name ? tc.function.name : null;
  const obrigatoria = !!tools && (!!ferramenta || tc === "required");

  const montar = (modelo: string, reforco: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = { model: modelo, max_tokens: maxTokens, messages: msgs };
    let sistema = sistemaBase;
    const novo = geracao5(modelo);
    if (!novo && typeof req.temperature === "number") body.temperature = Math.min(1, req.temperature);
    if (tools) {
      body.tools = tools;
      if (!obrigatoria) body.tool_choice = { type: "auto" };
      else if (novo) {
        body.tool_choice = { type: "auto" };
        const alvo = ferramenta ? `a ferramenta ${ferramenta}` : "uma das ferramentas";
        const instrucao = reforco
          ? `OBRIGATÓRIO: sua resposta deve ser somente uma chamada a ${alvo}, com todos os campos exigidos preenchidos. Não responda em texto.`
          : `Responda chamando ${alvo} exatamente uma vez; não escreva texto fora da ferramenta.`;
        sistema = sistema ? `${sistema}\n\n${instrucao}` : instrucao;
      } else body.tool_choice = ferramenta ? { type: "tool", name: ferramenta } : { type: "any" };
    }
    if (sistema) body.system = sistema;
    return body;
  };

  const chamar = async (body: Record<string, unknown>): Promise<{ j?: RespostaAnthropic; erro?: Response }> => {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (r.ok) return { j: await r.json() };
    const txt = await r.text();
    console.error("[ai] anthropic", body.model, r.status, txt.slice(0, 400));
    // 529 (sobrecarga) vira 429; falta de crédito vira 402 (as funções já tratam esses dois).
    const status = r.status === 529 ? 429 : /credit balance/i.test(txt) ? 402 : r.status;
    return { erro: json({ error: txt.slice(0, 400) }, status) };
  };

  const usoValido = (j: RespostaAnthropic): boolean => {
    if (!obrigatoria) return true;
    const uso = (j.content ?? []).find((c) => c.type === "tool_use" && (!ferramenta || c.name === ferramenta));
    if (!uso || uso.input == null) return false;
    try {
      return opcoes.validar ? opcoes.validar(uso.input) : true;
    } catch {
      return false;
    }
  };

  // Tentativas em ordem; para na primeira resposta válida.
  const modeloPrincipal = opcoes.modelo === "rapido" ? MODELO_RAPIDO : MODELO_PADRAO;
  const tentativas: Array<{ modelo: string; reforco: boolean }> = [{ modelo: modeloPrincipal, reforco: false }];
  if (obrigatoria) {
    if (geracao5(modeloPrincipal)) {
      // Gen 5 sem tool_choice forçado: 1 nova tentativa com instrução mais forte, depois Haiku forçado.
      tentativas.push({ modelo: modeloPrincipal, reforco: true }, { modelo: MODELO_RAPIDO, reforco: false });
    } else if (opcoes.reservaPadrao && modeloPrincipal !== MODELO_PADRAO) {
      tentativas.push({ modelo: MODELO_PADRAO, reforco: false });
      if (geracao5(MODELO_PADRAO)) tentativas.push({ modelo: MODELO_PADRAO, reforco: true });
    }
  }

  let j: RespostaAnthropic | null = null;
  for (let i = 0; i < tentativas.length; i++) {
    const t = tentativas[i];
    const res = await chamar(montar(t.modelo, t.reforco));
    if (res.erro || !res.j) {
      // Erro HTTP na primeira tentativa: devolve como antes. Nas de reserva, fica com a última resposta recebida.
      if (i === 0 || !j) return res.erro ?? json({ error: "Sem resposta da IA" }, 502);
      break;
    }
    j = res.j;
    if (usoValido(j)) break;
    if (i < tentativas.length - 1) console.warn("[ai] resposta sem ferramenta válida em", t.modelo, "— tentando de novo");
  }
  if (!j) return json({ error: "Sem resposta da IA" }, 502);

  const content = j.content ?? [];
  const texto = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const chamadas = content.filter((c) => c.type === "tool_use").map((c) => ({
    id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) },
  }));
  const msg: Record<string, unknown> = { role: "assistant", content: texto };
  if (chamadas.length) msg.tool_calls = chamadas;
  return json({
    choices: [{ index: 0, message: msg, finish_reason: j.stop_reason === "tool_use" ? "tool_calls" : "stop" }],
    usage: j.usage,
  }, 200);
}

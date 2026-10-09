// Adaptador: recebe um pedido no formato OpenAI/Lovable AI Gateway (chat/completions)
// e chama a API da Anthropic (Claude). Devolve a resposta no mesmo formato OpenAI,
// para as funções continuarem lendo choices[0].message.content / tool_calls.
// A chave fica no segredo ANTHROPIC_API_KEY.

const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

type Parte = { type: string; text?: string; image_url?: { url: string } | string };
type Msg = { role: string; content: string | Parte[] };

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

export async function aiFetch(_url: string, init: { body?: string } = {}): Promise<Response> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ausente" }), { status: 500 });
  const req = JSON.parse(init.body ?? "{}");
  const sistema = (req.messages as Msg[]).filter((m) => m.role === "system").map((m) => typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("\n")).join("\n\n");
  const msgs = (req.messages as Msg[]).filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: blocos(m.content) }));
  const body: Record<string, unknown> = { model: MODELO, max_tokens: req.max_tokens ?? req.max_completion_tokens ?? 4096, messages: msgs };
  if (sistema) body.system = sistema;
  if (typeof req.temperature === "number") body.temperature = Math.min(1, req.temperature);
  if (Array.isArray(req.tools) && req.tools.length) {
    body.tools = req.tools.map((t: { function: { name: string; description?: string; parameters?: unknown } }) => ({
      name: t.function.name, description: t.function.description ?? "", input_schema: t.function.parameters ?? { type: "object", properties: {} },
    }));
    const tc = req.tool_choice;
    if (tc && typeof tc === "object" && tc.function?.name) body.tool_choice = { type: "tool", name: tc.function.name };
    else if (tc === "required") body.tool_choice = { type: "any" };
    else body.tool_choice = { type: "auto" };
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error("[ai] anthropic", r.status, txt.slice(0, 400));
    const status = r.status === 529 ? 429 : r.status;
    return new Response(JSON.stringify({ error: txt.slice(0, 400) }), { status, headers: { "Content-Type": "application/json" } });
  }
  const j = await r.json();
  const texto = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const chamadas = (j.content ?? []).filter((c: { type: string }) => c.type === "tool_use").map((c: { id: string; name: string; input: unknown }) => ({
    id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) },
  }));
  const msg: Record<string, unknown> = { role: "assistant", content: texto };
  if (chamadas.length) msg.tool_calls = chamadas;
  return new Response(JSON.stringify({
    choices: [{ index: 0, message: msg, finish_reason: j.stop_reason === "tool_use" ? "tool_calls" : "stop" }],
    usage: j.usage,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

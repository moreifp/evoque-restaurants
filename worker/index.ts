// Worker do app: serve a SPA (dist/) e um único endpoint de apoio.
// /api/nfce?u=<link da NFC-e> — busca a página oficial da nota (a Sefaz bloqueia
// servidores da Amazon, onde rodam as funções do Supabase). Só aceita domínios de Sefaz.
interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export function nfceHostOk(host: string): boolean {
  return /(^|\.)fazenda\.[a-z]{2}\.gov\.br$/i.test(host) || /(^|\.)sefaz\.[a-z]{2}\.gov\.br$/i.test(host) || /(^|\.)sef\.sc\.gov\.br$/i.test(host);
}

async function nfce(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let alvo: URL;
  try {
    alvo = new URL(raw.replace(/\|/g, "%7C"));
  } catch {
    return Response.json({ error: "link inválido" }, { status: 400 });
  }
  if (alvo.protocol !== "https:" && alvo.protocol !== "http:") return Response.json({ error: "link inválido" }, { status: 400 });
  if (!nfceHostOk(alvo.hostname)) return Response.json({ error: "só links de Sefaz" }, { status: 400 });
  const r = await fetch(alvo.toString(), {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
    redirect: "follow",
  });
  const html = await r.text();
  return new Response(html, {
    status: r.ok ? 200 : 502,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Final-Url": r.url },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === "/api/nfce") return nfce(req);
    return env.ASSETS.fetch(req);
  },
};

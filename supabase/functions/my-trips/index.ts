// Viagens do usuário no Evoque Viagens (nome e datas), para os chips da aba Restaurantes.
// O e-mail vem do JWT; o segredo compartilhado fica só aqui.
// Resposta: { viagens: [{ nome, inicio: "YYYY-MM-DD", fim: "YYYY-MM-DD" }] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VIAGENS_URL = (Deno.env.get("EVOQUE_VIAGENS_URL") ?? "https://app.evoque.global").replace(/\/+$/, "");
const VIAGENS_SECRET = Deno.env.get("EVOQUE_VIAGENS_EMBED_SECRET") ?? "";
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace(/^Bearer\s+/i, ""));
    const email = typeof claims?.claims?.email === "string" ? claims.claims.email.trim().toLowerCase() : "";
    if (error || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    if (!email || !VIAGENS_SECRET) return json({ viagens: [] });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let r: Response;
    try {
      r = await fetch(`${VIAGENS_URL}/api/public/hooks/viagens-do-usuario`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-evoque-secret": VIAGENS_SECRET,
          "User-Agent": "evoque-restaurants/1.0",
        },
        body: JSON.stringify({ email }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) {
      console.warn("[my-trips] viagens-do-usuario", r.status);
      return json({ viagens: [], error: "upstream" }, 502);
    }
    const j = (await r.json().catch(() => null)) as { viagens?: unknown } | null;
    const lista = Array.isArray(j?.viagens) ? j!.viagens : [];
    const viagens = lista
      .map((v) => v as { nome?: unknown; inicio?: unknown; fim?: unknown })
      .filter((v) => typeof v.inicio === "string" && DATA_RE.test(v.inicio))
      .map((v) => {
        const inicio = v.inicio as string;
        const fim = typeof v.fim === "string" && DATA_RE.test(v.fim) ? v.fim : inicio;
        return {
          nome: typeof v.nome === "string" && v.nome.trim() ? v.nome.trim().slice(0, 120) : "Viagem",
          inicio,
          fim: fim < inicio ? inicio : fim,
        };
      })
      .slice(0, 200);
    return json({ viagens });
  } catch (e) {
    console.error("[my-trips] error", e instanceof Error ? e.message : e);
    return json({ viagens: [], error: "internal" }, 500);
  }
});

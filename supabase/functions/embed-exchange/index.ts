import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// Connection ID Evoque Viagens must use as the JWT "aud" claim.
const CLIENT_ID = "evoque-viagens";
const MAX_TTL_SECONDS = 15 * 60;
const CLOCK_SKEW_SECONDS = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const fail = (detail: string) => {
  console.error("embed_exchange_failure", detail);
  return json({ error: "authentication_failed" }, 401);
};

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verify(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("format");
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
  if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error("alg");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("signature");
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number") throw new Error("missing_exp");
  if (payload.exp < now - CLOCK_SKEW_SECONDS) throw new Error("expired");
  if (payload.exp > now + MAX_TTL_SECONDS + CLOCK_SKEW_SECONDS) throw new Error("ttl_too_long");
  if (typeof payload.iat === "number" && payload.iat > now + CLOCK_SKEW_SECONDS) throw new Error("future_iat");
  if (payload.aud !== CLIENT_ID) throw new Error("aud");
  if (typeof payload.jti !== "string" || payload.jti.length < 8 || payload.jti.length > 200) throw new Error("missing_jti");
  if (typeof payload.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) throw new Error("email");
  return {
    email: payload.email.toLowerCase().trim(),
    name: (payload.name || payload.full_name) as string | undefined,
    jti: payload.jti as string,
    exp: payload.exp as number,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const secret = Deno.env.get("EVOQUE_VIAGENS_EMBED_SECRET");
    if (!secret) return json({ error: "not_configured" }, 503);

    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const clientId = body?.client_id;
    const hostOrigin = body?.host_origin;
    if (typeof token !== "string" || token.length > 4096) return fail("missing_token");
    if (clientId !== CLIENT_ID) return fail("client_id");

    // Optional origin allowlist (comma separated) for the embedding host.
    const allowed = (Deno.env.get("EVOQUE_VIAGENS_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && (typeof hostOrigin !== "string" || !allowed.includes(hostOrigin))) return fail(`host_origin:${hostOrigin}`);

    let claims;
    try {
      claims = await verify(token, secret);
    } catch (e) {
      return fail(`jwt:${(e as Error).message}`);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Single use: primary key on jti rejects replays.
    const { error: useErr } = await admin.from("embed_pass_uses").insert({
      jti: claims.jti,
      client_id: CLIENT_ID,
      email: claims.email,
      expires_at: new Date(claims.exp * 1000).toISOString(),
    });
    if (useErr) return fail(useErr.code === "23505" ? "replay" : `use_insert:${useErr.message}`);

    // Find or create user
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: claims.email });
    let hashed = link?.properties?.hashed_token;
    if (linkErr || !hashed) {
      const { error: createErr } = await admin.auth.admin.createUser({
        email: claims.email,
        email_confirm: true,
        password: crypto.randomUUID() + "Aa1!",
        user_metadata: { full_name: claims.name, source: "evoque-viagens" },
      });
      if (createErr) return fail(`create_user:${createErr.message}`);
      const retry = await admin.auth.admin.generateLink({ type: "magiclink", email: claims.email });
      hashed = retry.data?.properties?.hashed_token;
      if (!hashed) return json({ error: "internal_error" }, 500);
    }

    let anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!anonKey) {
      const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "";
      try {
        const parsed = JSON.parse(raw);
        anonKey = typeof parsed === "string" ? parsed : Array.isArray(parsed) ? parsed[0] : (Object.values(parsed)[0] as string);
      } catch {
        anonKey = raw.split(",")[0]?.trim() || "";
      }
    }
    if (!anonKey) console.error("no_anon_key");
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, anonKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let { data: s, error: sErr } = await anon.auth.verifyOtp({ token_hash: hashed, type: "magiclink" });
    if (sErr || !s?.session) {
      console.error("verify_otp_failed_anon", sErr?.message, sErr?.status);
      // Fallback: fresh link, verify with an isolated admin-keyed client
      const again = await admin.auth.admin.generateLink({ type: "magiclink", email: claims.email });
      const h2 = again.data?.properties?.hashed_token;
      const iso = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const r = h2 ? await iso.auth.verifyOtp({ token_hash: h2, type: "magiclink" }) : null;
      s = r?.data as any;
      if (!r || r.error || !s?.session) {
        console.error("verify_otp_failed", r?.error?.message ?? again.error?.message);
        return json({ error: "internal_error" }, 500);
      }
    }

    return json({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
  } catch (e) {
    console.error("embed_exchange_error", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});

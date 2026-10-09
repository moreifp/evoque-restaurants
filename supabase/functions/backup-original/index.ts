// backup-original — copia o ORIGINAL de uma foto para o Google Drive do dono.
//
// Ações (POST JSON):
//   { action: "status" }                 → { drive: boolean }   (JWT do usuário)
//   { action: "backup", photo_id? }      → copia a foto (e pendências antigas)  (JWT do dono)
//   { action: "sweep" }                  → varredura agendada (header x-cron-secret)
//
// Fluxo: o app envia o original para o bucket privado `originals-inbox`
// (`${userId}/${photoId}.${ext}`) e grava restaurant_photos.original_path.
// Aqui baixamos com a service role, subimos para
// "My Drive/Evoque Restaurants/<restaurante>/" (upload resumable) e, com
// sucesso, gravamos drive_file_id + original_saved_at, limpamos original_path
// e apagamos o objeto do inbox.
//
// verify_jwt = false no config.toml (o sweep vem do pg_cron sem JWT de usuário);
// a autenticação é feita aqui dentro.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INBOX_BUCKET = "originals-inbox";
const ROOT_FOLDER_NAME = "Evoque Restaurants";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const TIME_BUDGET_MS = 100_000;
const SWEEP_LIMIT = 20;
const CATCH_UP_LIMIT = 5;
/** Pendências mais novas que isso são da fila do próprio app — o catch-up não mexe. */
const CATCH_UP_MIN_AGE_MS = 10 * 60_000;
/** Rascunho esperando nome: depois disso vai para "Sem nome". */
const DRAFT_WAIT_MS = 3 * 24 * 60 * 60_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DRIVE_CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") ?? "";
const DRIVE_CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") ?? "";
const DRIVE_REFRESH_TOKEN = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN") ?? "";
const DRIVE_OWNER_EMAIL = (Deno.env.get("DRIVE_OWNER_EMAIL") ?? "fausto.moreira@gmail.com").trim().toLowerCase();
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function driveConfigured(): boolean {
  return Boolean(DRIVE_CLIENT_ID && DRIVE_CLIENT_SECRET && DRIVE_REFRESH_TOKEN);
}

function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === DRIVE_OWNER_EMAIL;
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Google OAuth / Drive

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DRIVE_CLIENT_ID,
      client_secret: DRIVE_CLIENT_SECRET,
      refresh_token: DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    // Nunca logar o corpo inteiro: só o código de erro.
    throw new Error(`google token error ${res.status}${data?.error ? ` (${data.error})` : ""}`);
  }
  cachedToken = { value: data.access_token as string, expiresAt: Date.now() + (Number(data.expires_in) || 3000) * 1000 };
  return cachedToken.value;
}

/** Escapa um literal para a linguagem de busca do Drive ('...'). */
function driveQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveError(res: Response, what: string): Promise<Error> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  return new Error(`drive ${what} failed ${res.status}: ${text}`);
}

async function driveFindOne(token: string, q: string): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("spaces", "drive");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await driveError(res, "search");
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

const folderCache = new Map<string, string>();

async function findOrCreateFolder(token: string, name: string, parent: string): Promise<string> {
  const key = `${parent}/${name}`;
  const hit = folderCache.get(key);
  if (hit) return hit;
  const q = `name='${driveQ(name)}' and mimeType='${FOLDER_MIME}' and '${driveQ(parent)}' in parents and trashed=false`;
  let id = await driveFindOne(token, q);
  if (!id) {
    const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
    });
    if (!res.ok) throw await driveError(res, "create folder");
    id = (await res.json()).id as string;
  }
  folderCache.set(key, id);
  return id;
}

async function resumableUpload(
  token: string,
  meta: { name: string; parents: string[]; description: string },
  body: Blob,
  mime: string,
): Promise<string> {
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime,
      "X-Upload-Content-Length": String(body.size),
    },
    body: JSON.stringify(meta),
  });
  if (!init.ok) throw await driveError(init, "start upload");
  const sessionUrl = init.headers.get("Location");
  await init.body?.cancel();
  if (!sessionUrl) throw new Error("drive start upload: missing session URL");

  const put = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": mime, "Content-Length": String(body.size) },
    body,
  });
  if (!put.ok) throw await driveError(put, "upload");
  const data = await put.json();
  if (!data.id) throw new Error("drive upload: missing file id");
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Núcleo

type BackupStatus = "saved" | "already" | "deferred" | "missing" | "forbidden" | "error";

interface EntryRow {
  user_id: string;
  restaurant_name: string | null;
  visit_date: string | null;
  location_address: string | null;
  is_draft: boolean | null;
  created_at: string | null;
}
interface PhotoRow {
  id: string;
  type: string | null;
  created_at: string | null;
  original_path: string | null;
  drive_file_id: string | null;
  restaurant_entries: EntryRow | null;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
};

function folderNameFor(entry: EntryRow): string | null {
  const raw = (entry.restaurant_name ?? "").trim();
  const isPlaceholder = !raw || raw === "__draft__";
  if (!isPlaceholder && !entry.is_draft) return raw.slice(0, 200);
  // Rascunho: espera o nome definitivo por alguns dias.
  const age = Date.now() - new Date(entry.created_at ?? 0).getTime();
  if (age < DRAFT_WAIT_MS) return null;
  return isPlaceholder ? "Sem nome" : raw.slice(0, 200);
}

async function backupPhoto(
  admin: SupabaseClient,
  photoId: string,
  ownerUserId: string,
): Promise<{ status: BackupStatus; error?: string }> {
  const { data, error } = await admin
    .from("restaurant_photos")
    .select(
      "id, type, created_at, original_path, drive_file_id, restaurant_entries!inner(user_id, restaurant_name, visit_date, location_address, is_draft, created_at)",
    )
    .eq("id", photoId)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  const photo = data as unknown as PhotoRow | null;
  if (!photo || !photo.restaurant_entries) return { status: "missing" };
  const entry = photo.restaurant_entries;
  if (entry.user_id !== ownerUserId) return { status: "forbidden" };

  // Idempotente: já está no Drive → só limpa.
  if (photo.drive_file_id) {
    if (photo.original_path) {
      await admin.storage.from(INBOX_BUCKET).remove([photo.original_path]);
      await admin.from("restaurant_photos").update({ original_path: null }).eq("id", photo.id);
    }
    return { status: "already" };
  }
  if (!photo.original_path) return { status: "missing" };
  // O caminho precisa estar na pasta do dono.
  if (!photo.original_path.startsWith(`${ownerUserId}/`)) return { status: "forbidden" };

  const folderName = folderNameFor(entry);
  if (!folderName) return { status: "deferred" };

  try {
    const { data: blob, error: dlError } = await admin.storage.from(INBOX_BUCKET).download(photo.original_path);
    if (dlError || !blob) {
      return { status: "error", error: `inbox download failed: ${dlError?.message ?? "empty"}` };
    }

    const ext = (photo.original_path.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : (MIME_BY_EXT[ext] ?? "application/octet-stream");
    const date = (entry.visit_date ?? photo.created_at ?? new Date().toISOString()).slice(0, 10);
    const type = (photo.type ?? "foto").replace(/[^\w-]/g, "_");
    const fileName = `${date}_${type}_${photo.id.slice(0, 8)}.${ext}`;
    const description = ["Evoque Restaurants", folderName, entry.location_address?.trim()]
      .filter(Boolean)
      .join(" · ");

    const token = await getAccessToken();
    const rootId = await findOrCreateFolder(token, ROOT_FOLDER_NAME, "root");
    const folderId = await findOrCreateFolder(token, folderName, rootId);

    // Se uma tentativa anterior subiu o arquivo mas não gravou no banco, reaproveita.
    const existing = await driveFindOne(
      token,
      `name='${driveQ(fileName)}' and '${driveQ(folderId)}' in parents and trashed=false`,
    );
    const driveFileId = existing ??
      (await resumableUpload(token, { name: fileName, parents: [folderId], description }, blob, mime));

    const { error: upErr } = await admin
      .from("restaurant_photos")
      .update({ drive_file_id: driveFileId, original_saved_at: new Date().toISOString(), original_path: null })
      .eq("id", photo.id);
    if (upErr) return { status: "error", error: `row update failed: ${upErr.message}` };

    const { error: rmErr } = await admin.storage.from(INBOX_BUCKET).remove([photo.original_path]);
    if (rmErr) console.error("backup-original: inbox cleanup failed", photo.id, rmErr.message);

    return { status: "saved" };
  } catch (e) {
    return { status: "error", error: errMsg(e) };
  }
}

async function pendingIds(
  admin: SupabaseClient,
  opts: { limit: number; userId?: string; olderThanMs?: number },
): Promise<Array<{ id: string; user_id: string }>> {
  let q = admin
    .from("restaurant_photos")
    .select("id, created_at, restaurant_entries!inner(user_id)")
    .not("original_path", "is", null)
    .is("drive_file_id", null)
    .order("created_at", { ascending: true })
    .limit(opts.limit);
  if (opts.userId) q = q.eq("restaurant_entries.user_id", opts.userId);
  if (opts.olderThanMs) q = q.lt("created_at", new Date(Date.now() - opts.olderThanMs).toISOString());
  const { data, error } = await q;
  if (error) throw new Error(`pending query failed: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ id: string; restaurant_entries: { user_id: string } }>).map((r) => ({
    id: r.id,
    user_id: r.restaurant_entries.user_id,
  }));
}

async function runMany(
  admin: SupabaseClient,
  items: Array<{ id: string; ownerId: string }>,
  deadline: number,
) {
  const counts: Record<BackupStatus | "skipped_time", number> = {
    saved: 0, already: 0, deferred: 0, missing: 0, forbidden: 0, error: 0, skipped_time: 0,
  };
  for (const item of items) {
    if (Date.now() > deadline) {
      counts.skipped_time++;
      continue;
    }
    const r = await backupPhoto(admin, item.id, item.ownerId);
    counts[r.status]++;
    if (r.status === "error") console.error("backup-original: photo failed", item.id, r.error);
  }
  return counts;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;

  let body: { action?: string; photo_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = body.action;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ---- sweep (pg_cron) ---------------------------------------------------
    if (action === "sweep") {
      if (!CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", CRON_SECRET)) {
        return json({ error: "Unauthorized" }, 401);
      }
      if (!driveConfigured()) return json({ ok: false, error: "Drive not configured" }, 200);

      // Ignora as de menos de 2 min (o app ainda está cuidando delas).
      const rows = await pendingIds(admin, { limit: SWEEP_LIMIT, olderThanMs: 2 * 60_000 });
      // Só linhas do dono (confere o e-mail de cada user_id).
      const ownerByUser = new Map<string, boolean>();
      const items: Array<{ id: string; ownerId: string }> = [];
      let notOwner = 0;
      for (const r of rows) {
        if (!ownerByUser.has(r.user_id)) {
          const { data } = await admin.auth.admin.getUserById(r.user_id);
          ownerByUser.set(r.user_id, isOwnerEmail(data?.user?.email));
        }
        if (ownerByUser.get(r.user_id)) items.push({ id: r.id, ownerId: r.user_id });
        else notOwner++;
      }
      const counts = await runMany(admin, items, deadline);
      return json({ ok: true, found: rows.length, not_owner: notOwner, ...counts, ms: Date.now() - started });
    }

    // ---- ações com JWT do usuário ----------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);

    const isOwner = isOwnerEmail(user.email);

    if (action === "status") {
      return json({ drive: isOwner && driveConfigured() });
    }

    if (action === "backup") {
      if (!isOwner) return json({ error: "Forbidden" }, 403);
      if (!driveConfigured()) return json({ ok: false, error: "Drive not configured" }, 200);

      const photoId = body.photo_id;
      if (photoId !== undefined && (typeof photoId !== "string" || !/^[0-9a-f-]{36}$/i.test(photoId))) {
        return json({ error: "Invalid photo_id" }, 400);
      }

      let result: { status: BackupStatus; error?: string } | null = null;
      if (photoId) {
        result = await backupPhoto(admin, photoId, user.id);
        if (result.status === "error") console.error("backup-original: photo failed", photoId, result.error);
      }

      // Aproveita a chamada para recuperar pendências antigas deste dono.
      let catchUp = null;
      if (Date.now() < deadline - 20_000) {
        const rows = await pendingIds(admin, {
          limit: CATCH_UP_LIMIT,
          userId: user.id,
          // Chamada por foto: não mexe nas recentes (estão na fila do app).
          // Chamada sem foto (ex.: ao salvar o restaurante): pega todas.
          olderThanMs: photoId ? CATCH_UP_MIN_AGE_MS : undefined,
        });
        const items = rows.filter((r) => r.id !== photoId).map((r) => ({ id: r.id, ownerId: user.id }));
        if (items.length) catchUp = await runMany(admin, items, deadline);
      }

      return json({
        ok: !result || result.status !== "error",
        status: result?.status ?? null,
        catch_up: catchUp,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("backup-original error:", errMsg(e));
    return json({ error: "Internal error" }, 500);
  }
});

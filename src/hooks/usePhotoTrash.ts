import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { removePhotoObjects } from "@/lib/photoStorage";

export interface PhotoBackup {
  id: string;
  original_photo_id: string;
  entry_id: string;
  user_id: string;
  restaurant_name: string | null;
  photo_url: string;
  thumb_url?: string | null;
  caption: string | null;
  type: string | null;
  rating: number | null;
  menu_translation: string | null;
  original_created_at: string | null;
  deleted_at: string;
  restored: boolean;
}

const RETENTION_DAYS = 30;

export function usePhotoTrash() {
  const [backups, setBackups] = useState<PhotoBackup[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("photo_backups" as any)
      .select("*")
      .eq("restored", false)
      .gte("deleted_at", cutoff)
      .order("deleted_at", { ascending: false });
    if (!error && data) setBackups(data as unknown as PhotoBackup[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const restore = useCallback(async (ids: string[]) => {
    const toRestore = backups.filter((b) => ids.includes(b.id));
    if (!toRestore.length) return { restored: 0, missing: [] as PhotoBackup[] };

    // Check which entries still exist (RLS-safe: owner can read own entries)
    const entryIds = Array.from(new Set(toRestore.map((b) => b.entry_id)));
    const { data: entries } = await supabase
      .from("restaurant_entries")
      .select("id")
      .in("id", entryIds);
    const existingEntryIds = new Set((entries ?? []).map((e: any) => e.id));

    const restorable = toRestore.filter((b) => existingEntryIds.has(b.entry_id));
    const missing = toRestore.filter((b) => !existingEntryIds.has(b.entry_id));

    if (restorable.length) {
      const rows = restorable.map((b) => ({
        entry_id: b.entry_id,
        photo_url: b.photo_url,
        thumb_url: b.thumb_url ?? null,
        caption: b.caption,
        type: b.type ?? "restaurant_photo",
        rating: b.rating,
        menu_translation: b.menu_translation,
      }));
      const { error: insErr } = await supabase.from("restaurant_photos").insert(rows);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("photo_backups" as any)
        .update({ restored: true, restored_at: new Date().toISOString() })
        .in(
          "id",
          restorable.map((b) => b.id)
        );
      if (updErr) throw updErr;
    }

    await fetch();
    return { restored: restorable.length, missing };
  }, [backups, fetch]);

  const purge = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const toPurge = backups.filter((b) => ids.includes(b.id));
    const { error } = await supabase.from("photo_backups" as any).delete().in("id", ids);
    if (error) throw error;

    // Apagar definitivamente: remove também os arquivos (display + miniatura)
    // do bucket, exceto os que ainda estão em uso por alguma foto restaurada.
    const urls = toPurge.flatMap((b) => [b.photo_url, b.thumb_url]).filter((u): u is string => !!u);
    if (urls.length) {
      const { data: inUse } = await supabase
        .from("restaurant_photos")
        .select("photo_url, thumb_url")
        .in("photo_url", toPurge.map((b) => b.photo_url));
      const keep = new Set((inUse ?? []).flatMap((r) => [r.photo_url, r.thumb_url]));
      await removePhotoObjects(urls.filter((u) => !keep.has(u)));
    }
    await fetch();
  }, [backups, fetch]);

  return { backups, loading, refresh: fetch, restore, purge, retentionDays: RETENTION_DAYS };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookImage } from "lucide-react";

interface AlbumCoverCollageProps {
  albumId: string;
  maxPhotos?: number;
}

// Tipos que servem de capa (sem vídeo, cardápio ou recibo). null = fotos antigas do lugar.
const COVER_TYPES = ["restaurant_photo", "place", "food", "wine", "friends"];
const VIDEO_RE = /\.(mp4|mov|webm|avi|mkv|m4v)(\?|$)/i;

type CoverRow = { photo_url: string; thumb_url: string | null; type: string | null };

/**
 * Carregador em lote: todas as capas que montam no mesmo instante (ex.: lista
 * de álbuns) saem numa única consulta, em vez de uma por álbum.
 */
const cache = new Map<string, Promise<string[]>>();
let queue: Array<{ albumId: string; resolve: (v: string[]) => void }> = [];
let scheduled = false;

async function flush() {
  scheduled = false;
  const batch = queue;
  queue = [];
  const ids = Array.from(new Set(batch.map((b) => b.albumId)));
  const byAlbum = new Map<string, string[]>();
  try {
    const { data, error } = await supabase
      .from("album_entries")
      .select(
        `album_id,
         restaurant_entries!inner (
           restaurant_photos ( photo_url, thumb_url, type )
         )`,
      )
      .in("album_id", ids)
      .or(`type.is.null,type.in.(${COVER_TYPES.join(",")})`, {
        referencedTable: "restaurant_entries.restaurant_photos",
      })
      .order("created_at", { referencedTable: "restaurant_entries.restaurant_photos", ascending: true })
      .limit(2, { referencedTable: "restaurant_entries.restaurant_photos" });
    if (error) throw error;

    for (const row of (data ?? []) as Array<{
      album_id: string;
      restaurant_entries: { restaurant_photos: CoverRow[] | null } | null;
    }>) {
      const list = byAlbum.get(row.album_id) ?? [];
      const photo = (row.restaurant_entries?.restaurant_photos ?? []).find(
        (p) => p.type !== "video" && !VIDEO_RE.test(p.photo_url),
      );
      if (photo) list.push(photo.thumb_url || photo.photo_url);
      byAlbum.set(row.album_id, list);
    }
  } catch (error) {
    console.error("Error fetching album photos:", error);
    // não guarda falha no cache
    ids.forEach((id) => cache.delete(id));
  }
  for (const b of batch) b.resolve(byAlbum.get(b.albumId) ?? []);
}

function loadAlbumCovers(albumId: string): Promise<string[]> {
  const hit = cache.get(albumId);
  if (hit) return hit;
  const p = new Promise<string[]>((resolve) => {
    queue.push({ albumId, resolve });
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 0);
    }
  });
  cache.set(albumId, p);
  // Capa pode mudar quando o usuário adiciona fotos: expira em 1 minuto.
  setTimeout(() => {
    if (cache.get(albumId) === p) cache.delete(albumId);
  }, 60_000);
  return p;
}

const imgProps = { loading: "lazy" as const, decoding: "async" as const };

export function AlbumCoverCollage({ albumId, maxPhotos = 4 }: AlbumCoverCollageProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadAlbumCovers(albumId).then((urls) => {
      if (!alive) return;
      setPhotos(urls.slice(0, maxPhotos));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [albumId, maxPhotos]);

  if (loading) {
    return (
      <div className="aspect-video bg-muted flex items-center justify-center">
        <BookImage className="h-12 w-12 text-muted-foreground animate-pulse" />
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="aspect-video bg-gradient-olive-teal flex items-center justify-center">
        <BookImage className="h-12 w-12 text-white/80" />
      </div>
    );
  }

  // Single photo - full width
  if (photos.length === 1) {
    return (
      <div className="aspect-video bg-muted">
        <img {...imgProps} src={photos[0]} alt="Album cover" className="w-full h-full object-cover" />
      </div>
    );
  }

  // Two photos - side by side
  if (photos.length === 2) {
    return (
      <div className="aspect-video grid grid-cols-2 gap-1 bg-muted">
        {photos.map((photo, idx) => (
          <img
            {...imgProps}
            key={idx}
            src={photo}
            alt={`Album photo ${idx + 1}`}
            className="w-full h-full object-cover"
          />
        ))}
      </div>
    );
  }

  // Three photos - one large left, two stacked right
  if (photos.length === 3) {
    return (
      <div className="aspect-video grid grid-cols-2 gap-1 bg-muted">
        <img {...imgProps} src={photos[0]} alt="Album photo 1" className="w-full h-full object-cover" />
        <div className="grid grid-rows-2 gap-1">
          <img {...imgProps} src={photos[1]} alt="Album photo 2" className="w-full h-full object-cover" />
          <img {...imgProps} src={photos[2]} alt="Album photo 3" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  // Four or more photos - 2x2 grid
  return (
    <div className="aspect-video grid grid-cols-2 grid-rows-2 gap-1 bg-muted">
      {photos.slice(0, 4).map((photo, idx) => (
        <img
          {...imgProps}
          key={idx}
          src={photo}
          alt={`Album photo ${idx + 1}`}
          className="w-full h-full object-cover"
        />
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookImage } from "lucide-react";

interface AlbumCoverCollageProps {
  albumId: string;
  maxPhotos?: number;
}

export function AlbumCoverCollage({ albumId, maxPhotos = 4 }: AlbumCoverCollageProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlbumPhotos();
  }, [albumId]);

  const fetchAlbumPhotos = async () => {
    try {
      // Fetch restaurant entries in this album
      const { data: albumEntries } = await supabase
        .from("album_entries")
        .select(`
          entry_id,
          restaurant_entries!inner (
            restaurant_photos (
              photo_url
            )
          )
        `)
        .eq("album_id", albumId)
        .limit(maxPhotos);

      if (albumEntries) {
        const photoUrls: string[] = [];
        
        // Collect photos from each entry
        for (const entry of albumEntries) {
          const entryPhotos = (entry as any).restaurant_entries?.restaurant_photos || [];
          if (entryPhotos.length > 0 && photoUrls.length < maxPhotos) {
            photoUrls.push(entryPhotos[0].photo_url);
          }
        }
        
        setPhotos(photoUrls);
      }
    } catch (error) {
      console.error("Error fetching album photos:", error);
    } finally {
      setLoading(false);
    }
  };

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
        <img
          src={photos[0]}
          alt="Album cover"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Two photos - side by side
  if (photos.length === 2) {
    return (
      <div className="aspect-video grid grid-cols-2 gap-1 bg-muted">
        {photos.map((photo, idx) => (
          <img
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
        <img
          src={photos[0]}
          alt="Album photo 1"
          className="w-full h-full object-cover"
        />
        <div className="grid grid-rows-2 gap-1">
          <img
            src={photos[1]}
            alt="Album photo 2"
            className="w-full h-full object-cover"
          />
          <img
            src={photos[2]}
            alt="Album photo 3"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    );
  }

  // Four or more photos - 2x2 grid
  return (
    <div className="aspect-video grid grid-cols-2 grid-rows-2 gap-1 bg-muted">
      {photos.slice(0, 4).map((photo, idx) => (
        <img
          key={idx}
          src={photo}
          alt={`Album photo ${idx + 1}`}
          className="w-full h-full object-cover"
        />
      ))}
    </div>
  );
}

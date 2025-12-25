import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, BookImage, Map } from "lucide-react";
import { AlbumCoverCollage } from "@/components/AlbumCoverCollage";
import { useI18n } from "@/i18n/i18n";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { useAlbums } from "@/hooks/useAlbums";
import { GridSkeleton } from "@/components/ui/skeletons";

export default function Albums() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { data: albums = [], isLoading: loading } = useAlbums();

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">{t("albums.title")}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/albums/map")}>
              <Map className="h-4 w-4 mr-2" />
              {t("albums.map")}
            </Button>
            <Button onClick={() => navigate("/albums/create")}>
              <Plus className="h-4 w-4 mr-2" />
              {t("albums.createAlbum")}
            </Button>
          </div>
        </div>

        {/* Albums Grid */}
        {loading ? (
          <GridSkeleton count={6} type="album" />
        ) : albums.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map((album) => (
              <Card
                key={album.id}
                className="group hover:shadow-large transition-all cursor-pointer overflow-hidden"
                onClick={() => navigate(`/albums/${album.id}`)}
              >
                <div className="group-hover:scale-105 transition-transform">
                  <AlbumCoverCollage albumId={album.id} />
                </div>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg group-hover:text-accent transition-colors mb-2">
                    {album.title}
                  </h3>
                  {album.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {album.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    {format(new Date(album.created_at || new Date()), "PPP", {
                      locale: language === "pt" ? ptBR : enUS,
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <BookImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{t("albums.noAlbums")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("albums.noAlbumsDesc")}
            </p>
            <Button onClick={() => navigate("/albums/create")}>
              <Plus className="h-4 w-4 mr-2" />
              {t("albums.createAlbum")}
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}

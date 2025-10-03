import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, BookImage } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Albums() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    const { data } = await supabase
      .from("albums")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (data) setAlbums(data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Albums</h1>
          <Button onClick={() => navigate("/albums/create")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Album
          </Button>
        </div>

        {/* Albums Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading your albums...</p>
          </div>
        ) : albums.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map((album) => (
              <Card
                key={album.id}
                className="group hover:shadow-large transition-all cursor-pointer overflow-hidden"
                onClick={() => navigate(`/albums/${album.id}`)}
              >
                {album.cover_image_url ? (
                  <div className="aspect-video bg-muted">
                    <img
                      src={album.cover_image_url}
                      alt={album.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-olive-teal flex items-center justify-center">
                    <BookImage className="h-12 w-12 text-white/80" />
                  </div>
                )}
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
                    {new Date(album.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <BookImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Albums Yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first album to organize your culinary experiences
            </p>
            <Button onClick={() => navigate("/albums/create")}>
              <Plus className="h-4 w-4 mr-2" />
              Create Album
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}

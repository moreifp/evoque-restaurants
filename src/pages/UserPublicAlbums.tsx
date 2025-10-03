import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, BookImage } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function UserPublicAlbums() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchUserAndAlbums();
    }
  }, [userId]);

  const fetchUserAndAlbums = async () => {
    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    setUser(profile);

    // Fetch public albums
    const { data: albumsData } = await supabase
      .from("albums")
      .select("*")
      .eq("user_id", userId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false });

    setAlbums(albumsData || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">User not found</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback className="text-2xl">
              {user.display_name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">{user.display_name || "Anonymous"}</h1>
            <p className="text-muted-foreground">Public Albums</p>
          </div>
        </div>

        {/* Albums Grid */}
        {albums.length > 0 ? (
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
            <h3 className="text-xl font-semibold mb-2">No Public Albums</h3>
            <p className="text-muted-foreground">
              This user hasn't shared any albums yet
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}

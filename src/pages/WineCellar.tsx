import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Wine, Calendar, MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";

interface WineEntry {
  id: string;
  photo_url: string;
  caption: string;
  rating: number;
  created_at: string;
  entry: {
    id: string;
    restaurant_name: string;
    visit_date: string;
    location_address: string;
    rating: number;
  };
}

export default function WineCellar() {
  const [wines, setWines] = useState<WineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchWines();
  }, []);

  const fetchWines = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("restaurant_photos")
        .select(`
          id,
          photo_url,
          caption,
          rating,
          created_at,
          entry:restaurant_entries!inner (
            id,
            restaurant_name,
            visit_date,
            location_address,
            rating
          )
        `)
        .eq('type', 'wine')
        .eq('entry.user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setWines(data as any || []);
    } catch (error: any) {
      toast({
        title: "Error loading wines",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-2">
              <Wine className="h-8 w-8 text-accent" />
              <h1 className="text-3xl font-bold">My Wine Cellar</h1>
            </div>
            <p className="text-muted-foreground">
              Your collection of wines from memorable dining experiences
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading your wine collection...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && wines.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Wine className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No wines yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start adding wine photos to your restaurant experiences
                </p>
                <Link to="/dining/add" className="text-primary hover:underline">
                  Add Restaurant Experience
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Wine Grid */}
          {!loading && wines.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {wines.map((wine) => (
                <Card key={wine.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <Link to={`/dining/${wine.entry.id}`}>
                    <div className="aspect-[3/4] overflow-hidden">
                      <img
                        src={wine.photo_url}
                        alt="Wine"
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  </Link>
                  
                  <CardContent className="p-4 space-y-3">
                    {wine.rating > 0 && (
                      <div className="flex items-center space-x-1 mb-2">
                        {Array.from({ length: wine.rating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 text-accent fill-accent" />
                        ))}
                      </div>
                    )}
                    
                    {wine.caption && (
                      <div className="space-y-1">
                        <p className="text-sm font-medium">My Notes:</p>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {wine.caption}
                        </p>
                      </div>
                    )}
                    
                    <div className="pt-3 border-t space-y-2 text-sm">
                      <Link 
                        to={`/dining/${wine.entry.id}`}
                        className="font-semibold hover:text-primary transition-colors flex items-center space-x-2"
                      >
                        <Wine className="h-4 w-4" />
                        <span>{wine.entry.restaurant_name}</span>
                      </Link>
                      
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(wine.entry.visit_date).toLocaleDateString()}</span>
                      </div>
                      
                      {wine.entry.location_address && (
                        <div className="flex items-center space-x-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="line-clamp-1">{wine.entry.location_address}</span>
                        </div>
                      )}
                      
                      {wine.entry.rating > 0 && (
                        <div className="flex items-center space-x-1">
                          {Array.from({ length: wine.entry.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 text-accent fill-accent" />
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

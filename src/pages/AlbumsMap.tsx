import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";

declare global {
  interface Window {
    google: any;
  }
}

interface RestaurantLocation {
  id: string;
  restaurant_name: string;
  location_address: string;
  location_lat: number;
  location_lng: number;
  visit_date: string;
  rating?: number;
}

export default function AlbumsMap() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<RestaurantLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const markersRef = useRef<any[]>([]);

  // O mapa carregava só se outra tela (o antigo LocationPicker) tivesse carregado o Google Maps antes.
  const [mapsReady, setMapsReady] = useState(() => !!window.google?.maps?.Map);

  useEffect(() => {
    fetchRestaurants();
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch((e) => console.warn("[AlbumsMap] Google Maps failed to load", e));
  }, []);

  const fetchRestaurants = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch all restaurant entries with locations from user's albums
      const { data: albumEntries } = await supabase
        .from("album_entries")
        .select(`
          entry_id,
          albums!inner(user_id),
          restaurant_entries!inner(
            id,
            restaurant_name,
            location_address,
            location_lat,
            location_lng,
            visit_date,
            rating
          )
        `)
        .eq("albums.user_id", user.id)
        .not("restaurant_entries.location_lat", "is", null)
        .not("restaurant_entries.location_lng", "is", null);

      if (albumEntries) {
        // Extract unique restaurants (same restaurant might be in multiple albums)
        const uniqueRestaurants = new Map<string, RestaurantLocation>();
        
        albumEntries.forEach((entry: any) => {
          const restaurant = entry.restaurant_entries;
          if (!uniqueRestaurants.has(restaurant.id)) {
            uniqueRestaurants.set(restaurant.id, {
              id: restaurant.id,
              restaurant_name: restaurant.restaurant_name,
              location_address: restaurant.location_address,
              location_lat: restaurant.location_lat,
              location_lng: restaurant.location_lng,
              visit_date: restaurant.visit_date,
              rating: restaurant.rating,
            });
          }
        });

        setRestaurants(Array.from(uniqueRestaurants.values()));
      }

      setLoading(false);
    } catch (error: any) {
      console.error("Error fetching restaurants:", error);
      toast({
        title: t("restaurantMap.error"),
        description: t("restaurantMap.loadError"),
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mapsReady || !mapRef.current || restaurants.length === 0 || !window.google?.maps?.Map) return;

    // Initialize Google Maps
    const googleMap = new window.google.maps.Map(mapRef.current, {
      zoom: 4,
      center: { lat: 0, lng: 0 },
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });

    setMap(googleMap);

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add markers for each restaurant
    const bounds = new window.google.maps.LatLngBounds();
    
    restaurants.forEach((restaurant) => {
      const position = {
        lat: restaurant.location_lat,
        lng: restaurant.location_lng,
      };

      const marker = new window.google.maps.Marker({
        position,
        map: googleMap,
        title: restaurant.restaurant_name,
        animation: window.google.maps.Animation.DROP,
      });

      // Escape user-controlled values to prevent stored XSS in InfoWindow HTML
      const escHtml = (s: unknown): string =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const ratingNum = Number(restaurant.rating) || 0;
      const safeRating = Math.max(0, Math.min(5, Math.floor(ratingNum)));
      const safeId = encodeURIComponent(String(restaurant.id));

      // Create info window
      const infoContent = `
        <div style="padding: 8px; max-width: 250px;">
          <h3 style="font-weight: 600; font-size: 16px; margin: 0 0 8px 0; color: #000;">
            ${escHtml(restaurant.restaurant_name)}
          </h3>
          ${safeRating ? `
            <div style="margin-bottom: 6px; color: #666;">
              ${"⭐".repeat(safeRating)}
            </div>
          ` : ""}
          <p style="margin: 4px 0; font-size: 14px; color: #666;">
            ${escHtml(restaurant.location_address)}
          </p>
          <p style="margin: 4px 0; font-size: 12px; color: #999;">
            ${escHtml(t("restaurantMap.visited"))}: ${escHtml(new Date(restaurant.visit_date).toLocaleDateString())}
          </p>
          <button 
            onclick="window.location.href='/dining/${safeId}'" 
            style="margin-top: 8px; padding: 6px 12px; background: hsl(var(--primary)); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;"
          >
            ${escHtml(t("restaurantMap.viewDetails"))}
          </button>
        </div>
      `;

      const infoWindow = new window.google.maps.InfoWindow({
        content: infoContent,
      });

      marker.addListener("click", () => {
        // Close all other info windows
        markersRef.current.forEach((m: any) => {
          if (m.infoWindow) {
            m.infoWindow.close();
          }
        });
        infoWindow.open(googleMap, marker);
      });

      // Store info window reference
      (marker as any).infoWindow = infoWindow;

      markersRef.current.push(marker);
      bounds.extend(position);
    });

    // Fit map to show all markers
    if (restaurants.length > 0) {
      googleMap.fitBounds(bounds);
      
      // Adjust zoom if only one restaurant
      if (restaurants.length === 1) {
        googleMap.setZoom(15);
      }
    }

    return () => {
      markersRef.current.forEach(marker => marker.setMap(null));
    };
  }, [restaurants, mapsReady]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dining?tab=albums")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{t("restaurantMap.title")}</h1>
              <p className="text-muted-foreground mt-1">
                {restaurants.length === 1 
                  ? t("restaurantMap.locationCount").replace("{count}", "1")
                  : t("restaurantMap.locationsCount").replace("{count}", String(restaurants.length))}
              </p>
            </div>
          </div>
        </div>

        {/* Map Container */}
        {loading ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)] bg-card rounded-lg">
            <div className="text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground">{t("restaurantMap.loading")}</p>
            </div>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)] bg-card rounded-lg">
            <div className="text-center p-8">
              <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">{t("restaurantMap.noLocations")}</h3>
              <p className="text-muted-foreground mb-6">
                {t("restaurantMap.noLocationsDesc")}
              </p>
              <Button onClick={() => navigate("/dining/add")}>
                {t("restaurantMap.addRestaurant")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden shadow-large border">
            <div ref={mapRef} className="w-full h-[calc(100vh-200px)]" />
          </div>
        )}
      </main>
    </div>
  );
}

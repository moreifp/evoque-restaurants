import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Loader2, MapPin } from "lucide-react";
import { loadGoogleMaps, resetGoogleMapsLoader, isGoogleMapsReady, getGoogleMapsError } from "@/lib/googleMapsLoader";

export default function MapsDebug() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const [hasPlaces, setHasPlaces] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [autocompleteWorking, setAutocompleteWorking] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const checkStatus = () => {
    const google = (window as any).google;
    setHasMap(!!google?.maps?.Map);
    setHasPlaces(!!google?.maps?.places);
    setError(getGoogleMapsError());
  };

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    setTilesLoaded(false);
    setAutocompleteWorking(false);
    const startTime = Date.now();
    
    try {
      await loadGoogleMaps();
      setLoadTime(Date.now() - startTime);
      checkStatus();
      initMap();
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      setLoadTime(Date.now() - startTime);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    resetGoogleMapsLoader();
    setHasMap(false);
    setHasPlaces(false);
    setTilesLoaded(false);
    setAutocompleteWorking(false);
    setLoadTime(null);
    mapInstanceRef.current = null;
    handleLoad();
  };

  const initMap = () => {
    if (!mapRef.current || !isGoogleMapsReady()) return;
    
    const google = (window as any).google;
    
    // Create map
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 40.7128, lng: -74.006 }, // NYC
      zoom: 12,
    });
    mapInstanceRef.current = map;
    
    // Watch for tiles
    map.addListener('tilesloaded', () => {
      console.log('[MapsDebug] Tiles loaded');
      setTilesLoaded(true);
    });
    
    // Setup autocomplete
    if (inputRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["establishment"],
      });
      
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry) {
          setAutocompleteWorking(true);
          map.setCenter(place.geometry.location);
          map.setZoom(15);
          new google.maps.Marker({
            position: place.geometry.location,
            map,
          });
        }
      });
    }
  };

  // Check on mount
  useEffect(() => {
    checkStatus();
    if (isGoogleMapsReady()) {
      initMap();
    }
  }, []);

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <Badge variant={ok ? "default" : "secondary"} className="gap-1">
      {ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}: {ok ? "Yes" : "No"}
    </Badge>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Google Maps Debug
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={hasMap} label="Map API" />
              <StatusBadge ok={hasPlaces} label="Places API" />
              <StatusBadge ok={tilesLoaded} label="Tiles" />
              <StatusBadge ok={autocompleteWorking} label="Autocomplete" />
            </div>
            
            {/* Load time */}
            {loadTime !== null && (
              <p className="text-sm text-muted-foreground">
                Load time: {loadTime}ms
              </p>
            )}
            
            {/* Error */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">Error:</p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleLoad} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load Maps"
                )}
              </Button>
              <Button variant="outline" onClick={handleRetry} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset & Retry
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Autocomplete test */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Autocomplete Test</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              ref={inputRef}
              placeholder="Search for a restaurant..."
              disabled={!hasPlaces}
            />
            {!hasPlaces && (
              <p className="text-sm text-muted-foreground mt-2">
                Load Maps first to test autocomplete
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* Map */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Map Test</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={mapRef}
              className="w-full h-64 rounded-lg border border-border bg-muted"
            />
            {!hasMap && (
              <p className="text-sm text-muted-foreground mt-2">
                Load Maps first to see the map
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* Troubleshooting tips */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Troubleshooting</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>If Map API = No:</strong> Network error, script blocked, or API key not configured.</p>
            <p><strong>If Places API = No:</strong> Places API not enabled in Google Cloud Console.</p>
            <p><strong>If Tiles = No:</strong> Billing not enabled, or API key has wrong restrictions.</p>
            <p><strong>If works in browser but not PWA:</strong> Domain restrictions on API key need to include all app domains.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

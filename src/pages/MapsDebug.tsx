import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Loader2, MapPin, AlertTriangle, Copy } from "lucide-react";
import { loadGoogleMaps, resetGoogleMapsLoader, isGoogleMapsReady, getGoogleMapsError, getCurrentOrigin } from "@/lib/googleMapsLoader";
import { useToast } from "@/hooks/use-toast";

export default function MapsDebug() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const [hasPlaces, setHasPlaces] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [tilesError, setTilesError] = useState(false);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [autocompleteWorking, setAutocompleteWorking] = useState(false);
  const [origin] = useState(getCurrentOrigin());
  const [userAgent] = useState(navigator.userAgent);
  const { toast } = useToast();
  
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
    
    // Watch for tiles with timeout
    let tilesTimeout: NodeJS.Timeout;
    
    map.addListener('tilesloaded', () => {
      console.log('[MapsDebug] Tiles loaded');
      setTilesLoaded(true);
      setTilesError(false);
      clearTimeout(tilesTimeout);
    });
    
    // If tiles don't load in 10s, mark as error
    tilesTimeout = setTimeout(() => {
      if (!tilesLoaded) {
        console.error('[MapsDebug] Tiles failed to load in 10s');
        setTilesError(true);
        setError(prev => prev || `Tiles not loaded. Origin: ${origin}. This usually means billing issues or domain not allowed.`);
      }
    }, 10000);
    
    // Setup autocomplete
    if (inputRef.current) {
      try {
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
      } catch (err: any) {
        console.error('[MapsDebug] Autocomplete setup failed:', err);
        setError(prev => prev || `Autocomplete failed: ${err.message}`);
      }
    }
  };
  
  const copyOrigin = () => {
    navigator.clipboard.writeText(origin);
    toast({ title: "Origin copied", description: origin });
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
        {/* Origin & Environment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5" />
              Environment Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Origin:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">{origin}</code>
              <Button variant="ghost" size="sm" onClick={copyOrigin}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <span className="text-sm font-medium">User Agent:</span>
              <p className="text-xs text-muted-foreground mt-1 break-all">{userAgent}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ This origin must be allowed in your Google Cloud API key restrictions!
            </p>
          </CardContent>
        </Card>

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
              <StatusBadge ok={tilesLoaded && !tilesError} label="Tiles" />
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
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-destructive font-medium">Error Detected</p>
                    <p className="text-sm text-destructive/80 break-all">{error}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Tiles warning */}
            {tilesError && !error && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-600 font-medium">⚠️ Tiles Not Loading</p>
                <p className="text-sm text-amber-600/80">Map API loaded but tiles won't render. Check billing and domain restrictions.</p>
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

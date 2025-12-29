import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { loadGoogleMaps, resetGoogleMapsLoader, isGoogleMapsReady } from "@/lib/googleMapsLoader";

interface LocationPickerProps {
  onLocationSelect: (location: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    placeId?: string;
  }) => void;
  initialValue?: string;
  initialLatLng?: { lat: number; lng: number };
  initialPlaceId?: string;
}

export const LocationPicker = ({ 
  onLocationSelect, 
  initialValue, 
  initialLatLng,
  initialPlaceId 
}: LocationPickerProps) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState(initialValue || "");
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const onSelectRef = useRef(onLocationSelect);
  const { toast } = useToast();

  // Keep latest callback without re-initializing map
  useEffect(() => {
    onSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Load Google Maps on mount
  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        
        console.log('[LocationPicker] Loading Google Maps...');
        await loadGoogleMaps();
        
        if (cancelled) return;
        
        console.log('[LocationPicker] Google Maps loaded successfully');
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        
        console.error('[LocationPicker] Failed to load:', err.message);
        setLoadError(err.message || 'Failed to load Google Maps');
        setLoading(false);
      }
    };
    
    init();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize map once loaded
  useEffect(() => {
    if (loading || loadError || !mapRef.current || !isGoogleMapsReady()) return;

    const google = (window as any).google;
    
    // Use initial coordinates if provided, otherwise default
    const initialCenter = initialLatLng || { lat: 0, lng: 0 };
    const initialZoom = initialLatLng ? 15 : 2;
    
    console.log('[LocationPicker] Creating map...');
    const newMap = new google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
    });

    setMap(newMap);

    // Watch for tiles loading (helps detect billing/API issues)
    const tilesListener = newMap.addListener('tilesloaded', () => {
      console.log('[LocationPicker] Tiles loaded successfully');
      setTilesLoaded(true);
    });

    // Timeout for tiles - if they don't load in 10s, there's likely a billing/API issue
    const tilesTimeout = setTimeout(() => {
      if (!tilesLoaded) {
        console.warn('[LocationPicker] Tiles not loaded after 10s - possible billing/API issue');
        // Don't set error, just log - map might still be usable
      }
    }, 10000);

    // If we have initial coordinates, add a marker
    if (initialLatLng && !initialized) {
      const newMarker = new google.maps.Marker({
        position: initialLatLng,
        map: newMap,
      });
      setMarker(newMarker);
      setInitialized(true);
    }

    // Add click listener to map
    newMap.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      // Get place details from coordinates
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
        if (status === "OK" && results[0]) {
          const place = results[0];
          onSelectRef.current({
            name: place.name || place.formatted_address.split(",")[0],
            address: place.formatted_address,
            lat,
            lng,
            placeId: place.place_id,
          });
          setInputValue(place.name || place.formatted_address.split(",")[0]);
          
          // Update marker
          if (marker) {
            marker.setPosition({ lat, lng });
          } else {
            const newMarker = new google.maps.Marker({
              position: { lat, lng },
              map: newMap,
            });
            setMarker(newMarker);
          }
        }
      });
    });

    return () => {
      clearTimeout(tilesTimeout);
      google.maps.event.removeListener(tilesListener);
    };
  }, [loading, loadError, initialLatLng, initialized]);

  // Setup autocomplete
  useEffect(() => {
    if (!inputRef.current || !map || loading || loadError) return;
    if (!isGoogleMapsReady()) return;

    const google = (window as any).google;
    
    console.log('[LocationPicker] Setting up autocomplete...');
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["establishment"],
      fields: ["name", "formatted_address", "geometry.location", "place_id"],
    });

    autocomplete.bindTo("bounds", map);

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();

      if (place.geometry?.location && place.name) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        onSelectRef.current({
          name: place.name,
          address: place.formatted_address || "",
          lat,
          lng,
          placeId: place.place_id,
        });
        setInputValue(place.name);

        // Update map and marker
        map.setCenter({ lat, lng });
        if (marker) {
          marker.setPosition({ lat, lng });
        } else {
          const newMarker = new google.maps.Marker({
            position: { lat, lng },
            map,
          });
          setMarker(newMarker);
        }
      }
    });
  }, [map, loading, loadError, marker]);

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support geolocation",
        variant: "destructive",
      });
      return;
    }

    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        console.log('[LocationPicker] Got location:', lat, lng);

        if (map && isGoogleMapsReady()) {
          map.setCenter({ lat, lng });
          map.setZoom(15);

          // Add or update marker at current location
          if (marker) {
            marker.setPosition({ lat, lng });
          } else {
            const google = (window as any).google;
            const newMarker = new google.maps.Marker({
              position: { lat, lng },
              map,
              title: "Your Location",
            });
            setMarker(newMarker);
          }

          // Show nearby restaurants
          const service = new (window as any).google.maps.places.PlacesService(map);
          service.nearbySearch(
            {
              location: { lat, lng },
              radius: 1000,
              type: "restaurant",
            },
            (results: any, status: any) => {
              console.log('[LocationPicker] Nearby search status:', status, 'Results:', results?.length);
              toast({
                title: "Location found",
                description: "Showing restaurants near you. Click on the map to select one.",
              });
            }
          );
        }
        setLoadingLocation(false);
      },
      (error) => {
        const errorMessages: Record<number, string> = {
          1: "Location permission denied. Please allow location access in your browser settings.",
          2: "Location unavailable. Please try again or search manually.",
          3: "Location request timed out. Please try again.",
        };
        const description = errorMessages[error.code] || `Error: ${error.message}`;
        console.error('[LocationPicker] Geolocation error:', error.code, error.message);
        
        toast({
          title: "Location error",
          description,
          variant: "destructive",
        });
        setLoadingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [map, marker, toast]);

  const handleRetry = useCallback(() => {
    console.log('[LocationPicker] Retrying...');
    setLoadError(null);
    setLoading(true);
    setTilesLoaded(false);
    
    // Reset and reload
    resetGoogleMapsLoader();
    
    setTimeout(async () => {
      try {
        await loadGoogleMaps();
        setLoading(false);
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load Google Maps');
        setLoading(false);
      }
    }, 200);
  }, []);

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="location" className="text-lg">Restaurant Location</Label>
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-destructive font-medium">Google Maps failed to load</p>
                <p className="text-sm text-muted-foreground">{loadError}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRetry}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="location" className="text-lg">Restaurant Location</Label>
          <div className="flex space-x-2">
            <Skeleton className="flex-1 h-12" />
            <Skeleton className="h-12 w-12" />
          </div>
          <p className="text-base text-muted-foreground">
            Loading Google Maps...
          </p>
        </div>
        <Skeleton className="w-full h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="location" className="text-lg">Restaurant Location</Label>
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            id="location"
            type="text"
            placeholder="Search for a restaurant..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 text-lg h-12"
          />
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12"
            onClick={getCurrentLocation}
            disabled={loadingLocation}
          >
            {loadingLocation ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <MapPin className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-base text-muted-foreground">
          Click the location button to find restaurants near you, or search by name
        </p>
      </div>

      {/* Map */}
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border border-border"
      />
    </div>
  );
};

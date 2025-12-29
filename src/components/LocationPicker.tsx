import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [googleMapsReady, setGoogleMapsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onSelectRef = useRef(onLocationSelect);
  const { toast } = useToast();

  // Keep latest callback without re-initializing map
  useEffect(() => {
    onSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Wait for Google Maps to be ready (Maps + Places)
  useEffect(() => {
    const checkGoogleMaps = () => {
      const google = (window as any).google;
      const hasMap = !!google?.maps?.Map;
      const hasPlaces = !!google?.maps?.places;
      
      console.log('[LocationPicker] Checking Google Maps - Map:', hasMap, 'Places:', hasPlaces);
      
      if (hasMap && hasPlaces) {
        setGoogleMapsReady(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkGoogleMaps()) return;

    // Poll for Google Maps to load
    const interval = setInterval(() => {
      if (checkGoogleMaps()) {
        clearInterval(interval);
      }
    }, 500);

    // Listen for the load event
    const handleGoogleMapsLoaded = () => {
      console.log('[LocationPicker] Received google-maps-loaded event');
      // Small delay to ensure Places is fully initialized
      setTimeout(() => {
        if (checkGoogleMaps()) {
          clearInterval(interval);
        }
      }, 100);
    };

    // Listen for auth failure
    const handleAuthFailure = () => {
      console.error('[LocationPicker] Google Maps auth failure');
      setLoadError('Google Maps API key error. Please check configuration.');
      clearInterval(interval);
    };

    window.addEventListener('google-maps-loaded', handleGoogleMapsLoaded);
    window.addEventListener('google-maps-auth-failure', handleAuthFailure);

    // Timeout after 15 seconds
    const timeout = setTimeout(() => {
      if (!googleMapsReady) {
        console.error('[LocationPicker] Timeout waiting for Google Maps');
        setLoadError('Google Maps failed to load. Please refresh the page.');
        clearInterval(interval);
      }
    }, 15000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener('google-maps-loaded', handleGoogleMapsLoaded);
      window.removeEventListener('google-maps-auth-failure', handleAuthFailure);
    };
  }, [googleMapsReady]);

  // Initialize map only when Google Maps is ready
  useEffect(() => {
    if (!mapRef.current || !googleMapsReady) return;

    const google = (window as any).google;
    
    // Use initial coordinates if provided, otherwise default
    const initialCenter = initialLatLng || { lat: 0, lng: 0 };
    const initialZoom = initialLatLng ? 15 : 2;
    
    const initialMap = new google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
    });

    setMap(initialMap);

    // If we have initial coordinates, add a marker
    if (initialLatLng && !initialized) {
      const newMarker = new google.maps.Marker({
        position: initialLatLng,
        map: initialMap,
      });
      setMarker(newMarker);
      setInitialized(true);
    }

    // Add click listener to map
    initialMap.addListener("click", (e: any) => {
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
              map: initialMap,
            });
            setMarker(newMarker);
          }
        }
      });
    });
  }, [googleMapsReady]);

  // Setup autocomplete
  useEffect(() => {
    if (!inputRef.current || !googleMapsReady || !map) return;

    const google = (window as any).google;
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
  }, [map, googleMapsReady]);

  const getCurrentLocation = () => {
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

        if (map) {
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
        // Detailed error for debugging
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
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="location" className="text-lg">Restaurant Location</Label>
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-destructive">{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!googleMapsReady) {
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
            disabled={loadingLocation || !googleMapsReady}
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

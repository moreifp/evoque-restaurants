import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LocationPickerProps {
  onLocationSelect: (location: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  }) => void;
}

export const LocationPicker = ({ onLocationSelect }: LocationPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const onSelectRef = useRef(onLocationSelect);
  const { toast } = useToast();

  // Keep latest callback without re-initializing map
  useEffect(() => {
    onSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !(window as any).google) return;

    const google = (window as any).google;
    const initialMap = new google.maps.Map(mapRef.current, {
      center: { lat: 0, lng: 0 },
      zoom: 15,
    });

    setMap(initialMap);

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
  }, []);

  // Setup autocomplete
  useEffect(() => {
    if (!inputRef.current || !(window as any).google || !map) return;

    const google = (window as any).google;
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["establishment"],
      fields: ["name", "formatted_address", "geometry.location"],
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
  }, [map]);

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
            () => {
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
        toast({
          title: "Location error",
          description: "Could not get your location. Please search manually.",
          variant: "destructive",
        });
        setLoadingLocation(false);
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="location">Restaurant Location</Label>
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            id="location"
            type="text"
            placeholder="Search for a restaurant..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={getCurrentLocation}
            disabled={loadingLocation}
          >
            {loadingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
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

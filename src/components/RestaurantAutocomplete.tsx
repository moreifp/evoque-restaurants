import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaceDetails {
  name: string;
  address: string;
  placeId: string;
  phone?: string;
  website?: string;
  city?: string;
}

interface RestaurantAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceDetails) => void;
  placeholder?: string;
  className?: string;
}

export function RestaurantAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search restaurant...",
  className,
}: RestaurantAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isPlaceSelected, setIsPlaceSelected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Extract city from address components
  const extractCity = (addressComponents: any[]): string => {
    if (!addressComponents) return "";
    
    // Try locality first, then administrative_area_level_2, then administrative_area_level_1
    const cityTypes = ['locality', 'administrative_area_level_2', 'administrative_area_level_1'];
    
    for (const type of cityTypes) {
      const component = addressComponents.find((c: any) => c.types.includes(type));
      if (component) {
        return component.long_name;
      }
    }
    return "";
  };

  useEffect(() => {
    if (!inputRef.current || !(window as any).google?.maps?.places) return;

    const google = (window as any).google;
    
    // Initialize autocomplete with minimal fields (we'll fetch details separately)
    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["establishment"],
      fields: ["name", "place_id", "formatted_address"],
    });

    // Listen for place selection
    autocompleteRef.current.addListener("place_changed", async () => {
      const place = autocompleteRef.current?.getPlace();
      
      if (place?.place_id && place?.name) {
        setIsLoading(true);
        onChange(place.name);
        
        // Fetch full place details including phone and website
        const service = new google.maps.places.PlacesService(
          document.createElement('div')
        );
        
        service.getDetails(
          {
            placeId: place.place_id,
            fields: ['name', 'formatted_address', 'formatted_phone_number', 'website', 'address_components'],
          },
          (result: any, status: any) => {
            setIsLoading(false);
            
            if (status === google.maps.places.PlacesServiceStatus.OK && result) {
              const city = extractCity(result.address_components);
              
              setIsPlaceSelected(true);
              onPlaceSelect({
                name: result.name || place.name,
                address: result.formatted_address || place.formatted_address || "",
                placeId: place.place_id,
                phone: result.formatted_phone_number,
                website: result.website,
                city,
              });
            } else {
              // Fallback to basic info if details request fails
              setIsPlaceSelected(true);
              onPlaceSelect({
                name: place.name,
                address: place.formatted_address || "",
                placeId: place.place_id,
              });
            }
          }
        );
      }
    });

    return () => {
      // Clean up listeners
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    // Reset place selected state when user types
    if (isPlaceSelected) {
      setIsPlaceSelected(false);
    }
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={cn("pl-10 pr-10", className)}
      />
      {isLoading ? (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
      ) : isPlaceSelected ? (
        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
      ) : null}
    </div>
  );
}

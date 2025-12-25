import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaceDetails {
  name: string;
  address: string;
  placeId: string;
  phone?: string;
  website?: string;
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

  useEffect(() => {
    if (!inputRef.current || !(window as any).google?.maps?.places) return;

    const google = (window as any).google;
    
    // Initialize autocomplete
    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["establishment"],
      fields: ["name", "formatted_address", "place_id", "formatted_phone_number", "website"],
    });

    // Listen for place selection
    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      
      if (place?.name) {
        setIsPlaceSelected(true);
        onPlaceSelect({
          name: place.name,
          address: place.formatted_address || "",
          placeId: place.place_id || "",
          phone: place.formatted_phone_number,
          website: place.website,
        });
        onChange(place.name);
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
      {isPlaceSelected && (
        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
      )}
    </div>
  );
}

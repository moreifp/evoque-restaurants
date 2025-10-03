import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (!inputRef.current || !(window as any).google) return;

    const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
      types: ["restaurant", "cafe", "bar", "food"],
      fields: ["name", "formatted_address", "geometry.location"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();

      if (place.geometry?.location && place.name) {
        onLocationSelect({
          name: place.name,
          address: place.formatted_address || "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
        setInputValue(place.name);
      }
    });
  }, [onLocationSelect]);

  return (
    <div className="space-y-2">
      <Label htmlFor="location">Restaurant Location</Label>
      <Input
        ref={inputRef}
        id="location"
        type="text"
        placeholder="Search for a restaurant..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      />
      <p className="text-sm text-muted-foreground">
        Start typing to search for a restaurant near you
      </p>
    </div>
  );
};

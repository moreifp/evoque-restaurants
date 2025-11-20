import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/i18n";

const SUGGESTED_TAGS = [
  "Japanese", "Chinese", "Thai", "Vietnamese", "Korean", "Indian",
  "Middle Eastern", "Mediterranean", "Italian", "French", "Spanish",
  "Portuguese", "Brazilian", "Peruvian", "Argentine", "Mexican",
  "African", "American", "Seafood", "Vegetarian", "Vegan", "Fusion",
  "Contemporary", "Fine Dining", "Casual Dining", "Street Food",
  "Family Friendly", "Romantic", "Rooftop / View", "Beachfront",
  "Winery / Vineyard", "Farm-to-Table", "Chef's Table / Tasting Menu",
  "Steakhouse", "Burger House", "Bakery / Patisserie", "Café / Coffee Shop",
  "Dessert Bar", "Wine Bar", "Cocktail Bar", "Tea House"
];

interface TagInputProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagInput({ selectedTags, onTagsChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    fetchExistingTags();
  }, []);

  const fetchExistingTags = async () => {
    const { data } = await supabase
      .from("tags")
      .select("label")
      .order("label");
    
    if (data) {
      setExistingTags(data.map(t => t.label));
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    
    if (value.trim()) {
      // Combine suggested tags and existing tags for autocomplete
      const allTags = [...new Set([...SUGGESTED_TAGS, ...existingTags])];
      const filtered = allTags.filter(tag =>
        tag.toLowerCase().includes(value.toLowerCase()) &&
        !selectedTags.includes(tag)
      );
      setSuggestions(filtered.slice(0, 8));
    } else {
      setSuggestions([]);
    }
  };

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      onTagsChange([...selectedTags, trimmedTag]);
      setInputValue("");
      setSuggestions([]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(selectedTags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="tags" className="text-lg">{t("tagInput.label")}</Label>
      <div className="space-y-3">
        {/* Selected Tags */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="pl-3 pr-1 py-1.5 text-base"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-2 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="relative">
          <Input
            id="tags"
            type="text"
            placeholder={t("tagInput.placeholder")}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-lg h-12"
          />
          
          {/* Suggestions Dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => addTag(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground transition-colors text-base"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-base text-muted-foreground">
          {t("tagInput.helpText")}
        </p>
      </div>
    </div>
  );
}

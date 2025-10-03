import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MapPin, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export default function DiningList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tagFilter = searchParams.get("tag");

  const [entries, setEntries] = useState<any[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState<string>("all");
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(tagFilter ? [tagFilter] : []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEntries();
    fetchTags();
  }, []);

  useEffect(() => {
    filterEntries();
  }, [entries, searchQuery, selectedTags, selectedRating]);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("restaurant_entries")
      .select("*")
      .order("visit_date", { ascending: false });
    
    if (data) {
      setEntries(data);
    }
    setLoading(false);
  };

  const fetchTags = async () => {
    const { data } = await supabase.from("tags").select("*");
    if (data) setTags(data);
  };

  const filterEntries = () => {
    let filtered = [...entries];

    // Search filter (location, restaurant name, notes)
    if (searchQuery) {
      filtered = filtered.filter(
        (entry) =>
          entry.restaurant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.location_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Rating filter
    if (selectedRating !== "all") {
      const targetRating = parseInt(selectedRating);
      filtered = filtered.filter((entry) => entry.rating === targetRating);
    }

    // Tag filter (if we had entry_tags data)
    // For now, just show all entries

    setFilteredEntries(filtered);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">DiningOut</h1>
          <Button onClick={() => navigate("/dining/add")}>
            <Plus className="h-4 w-4 mr-2" />
            Add Restaurant
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          {/* Search by location */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by location (e.g., New York), restaurant name, or notes..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Rating Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2">Filter by rating:</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={selectedRating === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedRating("all")}
                >
                  All
                </Button>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <Button
                    key={rating}
                    type="button"
                    variant={selectedRating === rating.toString() ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedRating(rating.toString())}
                    className="flex items-center gap-1"
                  >
                    <Star className={cn(
                      "h-4 w-4",
                      selectedRating === rating.toString() ? "fill-current" : ""
                    )} />
                    {rating}
                  </Button>
                ))}
              </div>
            </div>

            {/* Active Filters Display */}
            {(searchQuery || selectedRating !== "all") && (
              <div className="flex items-center gap-2 flex-wrap">
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    Location: {searchQuery}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => setSearchQuery("")}
                    />
                  </Badge>
                )}
                {selectedRating !== "all" && (
                  <Badge variant="secondary" className="gap-1">
                    Rating: {selectedRating} ⭐
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => setSelectedRating("all")}
                    />
                  </Badge>
                )}
              </div>
            )}
          </div>

          {tags.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Filter by tags:</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Entries Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading your experiences...</p>
          </div>
        ) : filteredEntries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEntries.map((entry) => (
              <Card
                key={entry.id}
                className="group hover:shadow-large transition-all cursor-pointer"
                onClick={() => navigate(`/dining/${entry.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg group-hover:text-accent transition-colors">
                        {entry.restaurant_name}
                      </h3>
                    </div>
                    {entry.rating && (
                      <div className="flex items-center space-x-1 bg-accent/10 px-2 py-1 rounded">
                        <Star className="h-4 w-4 text-accent fill-accent" />
                        <span className="text-sm font-medium">{entry.rating}</span>
                      </div>
                    )}
                  </div>

                  {entry.location_address && (
                    <div className="flex items-start space-x-2 mb-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {entry.location_address}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">
                      {new Date(entry.visit_date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {entry.companions && (
                      <p className="text-muted-foreground text-xs">
                        with {entry.companions}
                      </p>
                    )}
                  </div>

                  {entry.notes && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {entry.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Results Found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery || selectedTags.length > 0 || selectedRating !== "all"
                ? "Try adjusting your search or filters"
                : "Start adding restaurant experiences to see them here"}
            </p>
            <Button onClick={() => navigate("/dining/add")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Restaurant
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}

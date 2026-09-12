import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, MapPin, Star, X, Map, BookImage } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { AlbumCoverCollage } from "@/components/AlbumCoverCollage";
import { useRestaurantEntries } from "@/hooks/useRestaurantEntries";
import { useAlbums } from "@/hooks/useAlbums";
import { useTags } from "@/hooks/useTags";
import { GridSkeleton } from "@/components/ui/skeletons";
import type { RestaurantEntry } from "@/types";

export default function Dining() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "restaurants";
  const tagFilter = searchParams.get("tag");

  // Use TanStack Query hooks
  const { data: entries = [], isLoading: entriesLoading } = useRestaurantEntries();
  const { data: albums = [], isLoading: albumsLoading } = useAlbums();
  const { data: tags = [] } = useTags();

  // Local filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>(tagFilter ? [tagFilter] : []);

  // Memoized filtered entries
  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.restaurant_name.toLowerCase().includes(query) ||
          entry.location_address?.toLowerCase().includes(query) ||
          entry.notes?.toLowerCase().includes(query)
      );
    }

    if (selectedRating !== "all") {
      const targetRating = parseInt(selectedRating);
      filtered = filtered.filter((entry) => entry.rating === targetRating);
    }

    return filtered;
  }, [entries, searchQuery, selectedRating]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          {/* Header - stacks on mobile, row on desktop */}
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h1 className="text-3xl font-bold">{t("dining.title")}</h1>
              <TabsList className="w-fit">
                <TabsTrigger value="restaurants">{t("dining.restaurants")}</TabsTrigger>
                <TabsTrigger value="albums">{t("dining.albums")}</TabsTrigger>
              </TabsList>
            </div>
            
            {/* Action buttons - always full width on mobile */}
            {activeTab === "restaurants" && (
              <Button onClick={() => navigate("/dining/add")} className="w-full sm:w-auto sm:self-end">
                <Plus className="h-4 w-4 mr-2" />
                {t("dining.addRestaurant")}
              </Button>
            )}
            {activeTab === "albums" && (
              <div className="flex flex-col sm:flex-row gap-2 sm:self-end">
                <Button variant="outline" onClick={() => navigate("/albums/map")} className="w-full sm:w-auto">
                  <Map className="h-4 w-4 mr-2" />
                  {t("albums.map")}
                </Button>
                <Button onClick={() => navigate("/albums/create")} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("albums.createAlbum")}
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="restaurants" className="mt-0">
            {/* Search & Filters */}
            <div className="mb-8 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t("dining.searchPlaceholder")}
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <Select value={selectedRating} onValueChange={setSelectedRating}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t("dining.filterByRating")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="5">5 {t("dining.stars")}</SelectItem>
                    <SelectItem value="4">4 {t("dining.stars")}</SelectItem>
                    <SelectItem value="3">3 {t("dining.stars")}</SelectItem>
                    <SelectItem value="2">2 {t("dining.stars")}</SelectItem>
                    <SelectItem value="1">1 {t("dining.stars")}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.label}
                      {selectedTags.includes(tag.id) && (
                        <X className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Restaurant Entries Grid */}
            {entriesLoading ? (
              <GridSkeleton count={6} type="restaurant" />
            ) : filteredEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEntries.map((entry) => (
                  <RestaurantCard
                    key={entry.id}
                    entry={entry}
                    onClick={() => navigate(entry.is_draft ? "/dining/add" : `/dining/${entry.id}`)}
                  />
                ))}

              </div>
            ) : (
              <Card className="p-12 text-center">
                <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">{t("dining.noResults")}</h3>
                <p className="text-muted-foreground mb-6">
                  {t("dining.noResultsDesc")}
                </p>
                <Button onClick={() => navigate("/dining/add")}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("dining.addRestaurant")}
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="albums" className="mt-0">
            {albumsLoading ? (
              <GridSkeleton count={6} type="album" />
            ) : albums.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {albums.map((album) => (
                  <Card
                    key={album.id}
                    className="group hover:shadow-large transition-all cursor-pointer overflow-hidden"
                    onClick={() => navigate(`/albums/${album.id}`)}
                  >
                    <div className="group-hover:scale-105 transition-transform">
                      <AlbumCoverCollage albumId={album.id} />
                    </div>
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-lg group-hover:text-accent transition-colors mb-2">
                        {album.title}
                      </h3>
                      {album.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {album.description}
                        </p>
                      )}
                    <p className="text-xs text-muted-foreground mt-3">
                      {new Date(album.created_at).toLocaleDateString(language === "pt" ? "pt-BR" : "en-US")}
                    </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <BookImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">{t("albums.noAlbums")}</h3>
                <p className="text-muted-foreground mb-6">
                  {t("albums.noAlbumsDesc")}
                </p>
                <Button onClick={() => navigate("/albums/create")}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("albums.createAlbum")}
                </Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// Extracted card component for better performance
function RestaurantCard({ entry, onClick }: { entry: RestaurantEntry; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Card
      className="hover:shadow-large transition-all cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-lg">{entry.restaurant_name}</h3>
          {entry.rating && (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-accent text-accent" />
              <span className="text-sm font-medium">{entry.rating}</span>
            </div>
          )}
        </div>
        
        {entry.location_address && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{entry.location_address}</span>
          </div>
        )}
        
        {entry.notes && (
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
            {entry.notes}
          </p>
        )}
        
        <p className="text-xs text-muted-foreground">
          {t("home.visitedOn")}: {new Date(entry.visit_date).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}

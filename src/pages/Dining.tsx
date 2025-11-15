import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, MapPin, Star, X, Map, BookImage } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AlbumCoverCollage } from "@/components/AlbumCoverCollage";

export default function Dining() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "restaurants";
  const tagFilter = searchParams.get("tag");

  // Restaurants state
  const [entries, setEntries] = useState<any[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState<string>("all");
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(tagFilter ? [tagFilter] : []);
  const [entriesLoading, setEntriesLoading] = useState(true);

  // Albums state
  const [albums, setAlbums] = useState<any[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);

  useEffect(() => {
    fetchEntries();
    fetchTags();
    fetchAlbums();
  }, []);

  useEffect(() => {
    filterEntries();
  }, [entries, searchQuery, selectedTags, selectedRating]);

  const fetchEntries = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEntriesLoading(false);
      return;
    }

    const { data } = await supabase
      .from("restaurant_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("visit_date", { ascending: false });
    
    if (data) {
      setEntries(data);
    }
    setEntriesLoading(false);
  };

  const fetchTags = async () => {
    const { data } = await supabase.from("tags").select("*");
    if (data) setTags(data);
  };

  const fetchAlbums = async () => {
    const { data } = await supabase
      .from("albums")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (data) setAlbums(data);
    setAlbumsLoading(false);
  };

  const filterEntries = () => {
    let filtered = [...entries];

    if (searchQuery) {
      filtered = filtered.filter(
        (entry) =>
          entry.restaurant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.location_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedRating !== "all") {
      const targetRating = parseInt(selectedRating);
      filtered = filtered.filter((entry) => entry.rating === targetRating);
    }

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
        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold">Dining</h1>
            <div className="flex items-center gap-2">
              <TabsList>
                <TabsTrigger value="restaurants">Restaurants</TabsTrigger>
                <TabsTrigger value="albums">Albums</TabsTrigger>
              </TabsList>
              {activeTab === "restaurants" && (
                <Button onClick={() => navigate("/dining/add")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Restaurant
                </Button>
              )}
              {activeTab === "albums" && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate("/albums/map")}>
                    <Map className="h-4 w-4 mr-2" />
                    Map
                  </Button>
                  <Button onClick={() => navigate("/albums/create")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Album
                  </Button>
                </div>
              )}
            </div>
          </div>

          <TabsContent value="restaurants" className="mt-0">
            {/* Search & Filters */}
            <div className="mb-8 space-y-4">
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

              <div className="flex flex-wrap gap-4">
                <Select value={selectedRating} onValueChange={setSelectedRating}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ratings</SelectItem>
                    <SelectItem value="5">5 Stars</SelectItem>
                    <SelectItem value="4">4 Stars</SelectItem>
                    <SelectItem value="3">3 Stars</SelectItem>
                    <SelectItem value="2">2 Stars</SelectItem>
                    <SelectItem value="1">1 Star</SelectItem>
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
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading restaurants...</p>
              </div>
            ) : filteredEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEntries.map((entry) => (
                  <Card
                    key={entry.id}
                    className="hover:shadow-large transition-all cursor-pointer"
                    onClick={() => navigate(`/dining/${entry.id}`)}
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
                        Visited: {new Date(entry.visit_date).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Restaurants Yet</h3>
                <p className="text-muted-foreground mb-6">
                  Start documenting your culinary adventures
                </p>
                <Button onClick={() => navigate("/dining/add")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Restaurant
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="albums" className="mt-0">
            {albumsLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading your albums...</p>
              </div>
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
                        {new Date(album.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <BookImage className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Albums Yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first album to organize your culinary experiences
                </p>
                <Button onClick={() => navigate("/albums/create")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Album
                </Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
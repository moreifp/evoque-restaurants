import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationPicker } from "@/components/LocationPicker";
import { MediaUpload } from "@/components/MediaUpload";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { AlbumSelector } from "@/components/AlbumSelector";
import { TagInput } from "@/components/TagInput";

export default function AddRestaurant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [menuUrls, setMenuUrls] = useState<string[]>([]);
  const [wineUrls, setWineUrls] = useState<string[]>([]);
  const [friendsUrls, setFriendsUrls] = useState<string[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    restaurant_name: "",
    visit_date: new Date().toISOString().split('T')[0], // Today's date as default
    location_address: "",
    location_lat: null as number | null,
    location_lng: null as number | null,
    rating: 0,
    companions: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create restaurant entry
      const { data: entry, error: entryError } = await supabase
        .from("restaurant_entries")
        .insert({
          ...formData,
          user_id: user.id,
          rating: formData.rating || null,
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Save all photo types
      const allPhotos = [
        ...mediaUrls.map(url => ({
          entry_id: entry.id,
          photo_url: url,
          type: url.includes('video') ? 'video' : 'restaurant_photo',
        })),
        ...menuUrls.map(url => ({
          entry_id: entry.id,
          photo_url: url,
          type: 'menu',
        })),
        ...wineUrls.map(url => ({
          entry_id: entry.id,
          photo_url: url,
          type: 'wine',
        })),
        ...friendsUrls.map(url => ({
          entry_id: entry.id,
          photo_url: url,
          type: 'friends',
        })),
      ];

      if (allPhotos.length > 0 && entry) {
        const { error: photoError } = await supabase
          .from("restaurant_photos")
          .insert(allPhotos);

        if (photoError) throw photoError;
      }

      // Add to album if selected
      if (selectedAlbumId && selectedAlbumId !== "none" && entry) {
        const { error: albumError } = await supabase
          .from("album_entries")
          .insert({
            album_id: selectedAlbumId,
            entry_id: entry.id,
          });

        if (albumError) throw albumError;
      }

      // Process tags
      if (selectedTags.length > 0 && entry) {
        for (const tagLabel of selectedTags) {
          // Check if tag exists, create if not
          let { data: existingTag } = await supabase
            .from("tags")
            .select("id")
            .eq("label", tagLabel)
            .single();

          let tagId: string;

          if (!existingTag) {
            const { data: newTag, error: tagError } = await supabase
              .from("tags")
              .insert({ label: tagLabel })
              .select("id")
              .single();

            if (tagError) throw tagError;
            tagId = newTag.id;
          } else {
            tagId = existingTag.id;
          }

          // Create entry_tag relationship
          const { error: entryTagError } = await supabase
            .from("entry_tags")
            .insert({
              entry_id: entry.id,
              tag_id: tagId,
            });

          if (entryTagError) throw entryTagError;
        }
      }

      toast({
        title: "Restaurant added!",
        description: selectedAlbumId && selectedAlbumId !== "none" 
          ? "Your memory has been saved and added to the album"
          : "Your memory has been saved",
      });

      navigate("/dining");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setRating = (rating: number) => {
    setFormData((prev) => ({ ...prev, rating }));
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center space-x-4 mb-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Add Restaurant Experience</h1>
          </div>

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>Restaurant Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Restaurant Name */}
                <div className="space-y-2">
                  <Label htmlFor="restaurant_name">Restaurant Name *</Label>
                  <Input
                    id="restaurant_name"
                    type="text"
                    placeholder="La Piazza"
                    value={formData.restaurant_name}
                    onChange={(e) =>
                      setFormData({ ...formData, restaurant_name: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Visit Date */}
                <div className="space-y-2">
                  <Label htmlFor="visit_date">Visit Date *</Label>
                  <Input
                    id="visit_date"
                    type="date"
                    value={formData.visit_date}
                    onChange={(e) =>
                      setFormData({ ...formData, visit_date: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Location with Google Places */}
                <LocationPicker
                  onLocationSelect={(location) => {
                    setFormData({
                      ...formData,
                      restaurant_name: location.name,
                      location_address: location.address,
                      location_lat: location.lat,
                      location_lng: location.lng,
                    });
                  }}
                />

                {/* Restaurant Photos Upload */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Restaurant Photos</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload photos of the restaurant, food, and ambience. GPS location will be extracted automatically!
                    </p>
                  </div>
                  <MediaUpload 
                    onMediaUpload={setMediaUrls} 
                    extractLocation={true}
                    onLocationExtracted={(location) => {
                      setFormData({
                        ...formData,
                        location_address: location.address,
                        location_lat: location.lat,
                        location_lng: location.lng,
                      });
                    }}
                  />
                </div>

                {/* Menu Photos Upload */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Menu Photos</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload photos of the restaurant menu
                    </p>
                  </div>
                  <MediaUpload onMediaUpload={setMenuUrls} />
                </div>

                {/* Wine Photos Upload */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Wine Photos</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload photos of the wine or drinks you ordered
                    </p>
                  </div>
                  <MediaUpload onMediaUpload={setWineUrls} />
                </div>

                {/* Friends Photos Upload */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Friends & People Photos</Label>
                    <p className="text-sm text-muted-foreground">
                      Upload photos of friends and people you were with
                    </p>
                  </div>
                  <MediaUpload onMediaUpload={setFriendsUrls} />
                </div>

                {/* Receipt Upload */}
                <ReceiptUpload />

                {/* Album Selection */}
                <AlbumSelector
                  selectedAlbumId={selectedAlbumId}
                  onAlbumSelect={setSelectedAlbumId}
                />

                {/* Tags */}
                <TagInput
                  selectedTags={selectedTags}
                  onTagsChange={setSelectedTags}
                />

                {/* Rating */}
                <div className="space-y-2">
                  <Label>Rating</Label>
                  <div className="flex items-center space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={cn(
                            "h-8 w-8 transition-colors",
                            star <= formData.rating
                              ? "text-accent fill-accent"
                              : "text-muted-foreground"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Companions */}
                <div className="space-y-2">
                  <Label htmlFor="companions">Who were you with?</Label>
                  <Input
                    id="companions"
                    type="text"
                    placeholder="Friends, Family, Solo..."
                    value={formData.companions}
                    onChange={(e) =>
                      setFormData({ ...formData, companions: e.target.value })
                    }
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Share your thoughts, favorite dishes, ambience..."
                    rows={5}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>

                {/* Submit */}
                <div className="flex items-center space-x-4">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? "Saving..." : "Save Restaurant"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

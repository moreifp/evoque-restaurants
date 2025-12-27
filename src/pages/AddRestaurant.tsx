import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, ArrowLeft, Save, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationPicker } from "@/components/LocationPicker";
import { AlbumSelector } from "@/components/AlbumSelector";
import { TagInput } from "@/components/TagInput";
import { UnifiedMediaUpload } from "@/components/UnifiedMediaUpload";
import { SocialLinksInput, SocialLink } from "@/components/SocialLinksInput";
import { z } from "zod";
import { useI18n } from "@/i18n/i18n";

const AUTOSAVE_KEY = "restaurant-draft-autosave";

const restaurantSchema = z.object({
  restaurant_name: z.string()
    .trim()
    .min(1, 'Restaurant name is required')
    .max(200, 'Restaurant name is too long'),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  location_address: z.string().max(500, 'Address is too long').optional().or(z.literal('')),
  location_lat: z.number().min(-90).max(90).nullable().optional(),
  location_lng: z.number().min(-180).max(180).nullable().optional(),
  google_place_id: z.string().nullable().optional(),
  rating: z.number().int().min(0).max(5).nullable().optional(),
  companions: z.string().max(200, 'Companions field is too long').optional().or(z.literal('')),
  notes: z.string().max(5000, 'Notes are too long').optional().or(z.literal('')),
});

export default function AddRestaurant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [loading, setLoading] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [originScheduledVisitId, setOriginScheduledVisitId] = useState<string | null>(null);
  const [prefilledFromAgenda, setPrefilledFromAgenda] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  
  const [uploadData, setUploadData] = useState<{
    place: string[];
    food: string[];
    friends: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    menu: string[];
    receipt: any | null;
  }>({
    place: [],
    food: [],
    friends: [],
    wine: [],
    menu: [],
    receipt: null,
  });

  const [formData, setFormData] = useState({
    restaurant_name: "",
    visit_date: new Date().toISOString().split('T')[0],
    location_address: "",
    location_lat: null as number | null,
    location_lng: null as number | null,
    google_place_id: null as string | null,
    rating: 0,
    companions: "",
    notes: "",
    description: "",
  });

  // Check for URL params from Agenda (Record Experience flow)
  useEffect(() => {
    const restaurantName = searchParams.get("restaurant_name");
    const city = searchParams.get("city");
    const locationAddress = searchParams.get("location_address");
    const googlePlaceId = searchParams.get("google_place_id");
    const visitId = searchParams.get("origin_scheduled_visit_id");
    const visitDate = searchParams.get("visit_date");

    if (restaurantName || visitId) {
      // Prefill from URL params (Agenda flow)
      setPrefilledFromAgenda(true);
      setOriginScheduledVisitId(visitId);
      setFormData(prev => ({
        ...prev,
        restaurant_name: restaurantName || prev.restaurant_name,
        location_address: locationAddress || city || prev.location_address,
        google_place_id: googlePlaceId || prev.google_place_id,
        visit_date: visitDate || prev.visit_date,
      }));
      // Don't load autosave when coming from Agenda
      return;
    }

    // Load autosaved data on mount (only if not prefilled from Agenda)
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(parsed.formData);
        setSelectedAlbumId(parsed.selectedAlbumId);
        setSelectedTags(parsed.selectedTags || []);
        setSocialLinks(parsed.socialLinks || []);
        if (parsed.uploadData) {
          setUploadData(parsed.uploadData);
        }
        toast({
          title: t("addRestaurant.draftRestored"),
          description: t("addRestaurant.draftRestoredDesc"),
        });
      } catch (e) {
        console.error("Failed to restore autosave:", e);
      }
    }
  }, [searchParams]);

  // Fetch complete place details when prefilled from Agenda with google_place_id but no coordinates
  useEffect(() => {
    if (!prefilledFromAgenda || !formData.google_place_id || formData.location_lat) {
      return;
    }

    // Wait for Google Maps API to be available
    if (!window.google?.maps?.places) {
      return;
    }

    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails(
      { 
        placeId: formData.google_place_id, 
        fields: ['geometry', 'formatted_address', 'name'] 
      },
      (result, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && result?.geometry?.location) {
          setFormData(prev => ({
            ...prev,
            location_lat: result.geometry!.location!.lat(),
            location_lng: result.geometry!.location!.lng(),
            location_address: result.formatted_address || prev.location_address,
          }));
        }
      }
    );
  }, [prefilledFromAgenda, formData.google_place_id, formData.location_lat]);

  // Autosave to localStorage (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const dataToSave = {
        formData,
        selectedAlbumId,
        selectedTags,
        socialLinks,
        uploadData,
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(dataToSave));
      setLastSaved(new Date());
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formData, selectedAlbumId, selectedTags, socialLinks, uploadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate form data
      const validation = restaurantSchema.safeParse({
        ...formData,
        rating: formData.rating || null,
      });

      if (!validation.success) {
        const errors = validation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('. ');
        toast({
          title: t("addRestaurant.validationError"),
          description: errors,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Create restaurant entry with optional origin_scheduled_visit_id
      const insertData: any = {
        ...formData,
        user_id: user.id,
        rating: formData.rating || null,
      };

      // Link to scheduled visit if coming from Agenda
      if (originScheduledVisitId) {
        insertData.origin_scheduled_visit_id = originScheduledVisitId;
      }

      const { data: entry, error: entryError } = await supabase
        .from("restaurant_entries")
        .insert(insertData)
        .select()
        .single();

      if (entryError) throw entryError;

      // Save receipt if processed
      if (uploadData.receipt && entry) {
        const { data: receipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            entry_id: entry.id,
            photo_url: uploadData.receipt.photo_url,
            subtotal: uploadData.receipt.subtotal,
            tax: uploadData.receipt.tax,
            service_fee: uploadData.receipt.service_fee,
            total: uploadData.receipt.total,
            currency: uploadData.receipt.currency,
          })
          .select()
          .single();

        if (receiptError) throw receiptError;

        // Save receipt items
        if (uploadData.receipt.items && uploadData.receipt.items.length > 0) {
          const itemsToInsert = uploadData.receipt.items.map((item: any) => ({
            receipt_id: receipt.id,
            item_type: item.item_type,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
          }));

          const { error: itemsError } = await supabase
            .from("receipt_items")
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;
        }
      }

      // Save all photo types
      const allPhotos = [
        ...uploadData.place.map(url => ({
          entry_id: entry.id,
          photo_url: url,
          type: url.includes('video') ? 'video' : 'restaurant_photo',
        })),
        ...uploadData.menu.map(url => ({
          entry_id: entry.id,
          photo_url: url,
          type: 'menu',
        })),
        ...uploadData.wine.map(wine => ({
          entry_id: entry.id,
          photo_url: wine.url,
          type: 'wine',
          caption: wine.caption,
          rating: wine.rating || null,
        })),
        ...uploadData.friends.map(url => ({
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

      // Save social links
      if (socialLinks.length > 0 && entry) {
        const linksToInsert = socialLinks.map(link => ({
          entry_id: entry.id,
          platform: link.platform,
          url: link.url,
          title: link.title || null,
        }));

        const { error: linksError } = await supabase
          .from("restaurant_social_links")
          .insert(linksToInsert);

        if (linksError) throw linksError;
      }

      // Clear autosave after successful submit
      localStorage.removeItem(AUTOSAVE_KEY);
      
      toast({
        title: t("addRestaurant.restaurantAdded"),
        description: selectedAlbumId && selectedAlbumId !== "none" 
          ? t("addRestaurant.memoryAdded")
          : t("addRestaurant.memorySaved"),
      });

      navigate("/dining");
    } catch (error: any) {
      toast({
        title: t("addRestaurant.error"),
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

  const generateDescription = async () => {
    if (!formData.restaurant_name || !formData.location_address) {
      toast({
        title: t("addRestaurant.missingInfo"),
        description: t("addRestaurant.missingInfoDesc"),
        variant: "destructive",
      });
      return;
    }

    setGeneratingDescription(true);
    try {      
      const { data, error } = await supabase.functions.invoke('generate-restaurant-description', {
        body: {
          restaurantName: formData.restaurant_name,
          location: formData.location_address,
          language,
        }
      });

      if (error) {
        console.error('Description generation error:', error);
        throw new Error(error.message || 'Failed to generate description');
      }
      
      // Check if response contains an error field
      if (data?.error) {
        console.error('AI error:', data.error);
        throw new Error(data.error);
      }

      if (data?.description) {
        setFormData(prev => ({ ...prev, description: data.description }));
        toast({
          title: t("addRestaurant.descriptionGenerated"),
          description: t("addRestaurant.descriptionSuccess"),
        });
      } else {
        throw new Error('No description returned');
      }
    } catch (error: any) {
      console.error('Error generating description:', error);
      toast({
        title: t("addRestaurant.error"),
        description: error.message || t("addRestaurant.failedGenerate"),
        variant: "destructive",
      });
    } finally {
      setGeneratingDescription(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-3xl font-bold">{t("addRestaurant.title")}</h1>
            </div>
            {lastSaved && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4" />
                <span>{t("addRestaurant.autosaved")}</span>
              </div>
            )}
          </div>

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>{t("addRestaurant.restaurantDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Location with Google Places - FIRST */}
                <LocationPicker
                  onLocationSelect={(location) => {
                    setFormData({
                      ...formData,
                      restaurant_name: location.name,
                      location_address: location.address,
                      location_lat: location.lat,
                      location_lng: location.lng,
                      google_place_id: location.placeId || null,
                    });
                  }}
                />

                {/* Restaurant Name - SECOND */}
                <div className="space-y-2">
                  <Label htmlFor="restaurant_name" className="text-lg">{t("addRestaurant.restaurantName")} *</Label>
                  <Input
                    id="restaurant_name"
                    type="text"
                    placeholder={t("addRestaurant.restaurantNamePlaceholder")}
                    value={formData.restaurant_name}
                    onChange={(e) =>
                      setFormData({ ...formData, restaurant_name: e.target.value })
                    }
                    className="text-lg h-12"
                    required
                  />
                </div>

                {/* Visit Date - THIRD */}
                <div className="space-y-2">
                  <Label htmlFor="visit_date" className="text-lg">{t("addRestaurant.visitDate")} *</Label>
                  <Input
                    id="visit_date"
                    type="date"
                    value={formData.visit_date}
                    onChange={(e) =>
                      setFormData({ ...formData, visit_date: e.target.value })
                    }
                    className="text-lg h-12"
                    required
                  />
                </div>

                {/* Unified Media Upload */}
                <UnifiedMediaUpload
                  initialUploadData={uploadData}
                  onUploadsChange={setUploadData}
                  onLocationExtracted={(location) => {
                    setFormData({
                      ...formData,
                      location_address: location.address,
                      location_lat: location.lat,
                      location_lng: location.lng,
                    });
                  }}
                />

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
                  <Label className="text-lg">{t("addRestaurant.rating")}</Label>
                  <div className="flex items-center space-x-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={cn(
                            "h-10 w-10 transition-colors",
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
                  <Label htmlFor="companions" className="text-lg">{t("addRestaurant.companions")}</Label>
                  <Input
                    id="companions"
                    type="text"
                    placeholder={t("addRestaurant.companionsPlaceholder")}
                    value={formData.companions}
                    onChange={(e) =>
                      setFormData({ ...formData, companions: e.target.value })
                    }
                    className="text-lg h-12"
                  />
                </div>

                {/* AI-Generated Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-lg">{t("addRestaurant.description")}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateDescription}
                      disabled={generatingDescription || !formData.restaurant_name || !formData.location_address}
                      className="h-8"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      {generatingDescription ? t("addRestaurant.generating") : t("addRestaurant.generateWithAI")}
                    </Button>
                  </div>
                  <Textarea
                    id="description"
                    placeholder={t("addRestaurant.descriptionPlaceholder")}
                    rows={3}
                    maxLength={240}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.description.length}/240 {t("addRestaurant.descriptionLength")}
                  </p>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-lg">{t("addRestaurant.notes")}</Label>
                  <Textarea
                    id="notes"
                    placeholder={t("addRestaurant.notesPlaceholder")}
                    rows={5}
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="text-lg min-h-[120px]"
                  />
                </div>

                {/* Social Links */}
                <SocialLinksInput
                  links={socialLinks}
                  onChange={setSocialLinks}
                />

                {/* Submit */}
                <div className="flex items-center space-x-4">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-12 text-lg"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    {loading ? t("addRestaurant.saving") : t("addRestaurant.save")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                    className="h-12 text-lg"
                  >
                    {t("addRestaurant.cancel")}
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

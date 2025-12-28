import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Star, Calendar, Users, Edit, Trash2, FolderPlus, Share2, Check, Save, Wine, UtensilsCrossed, Camera, UserCircle2, Receipt as ReceiptIcon, Globe, Lock, Link as LinkIcon, Sparkles, AlertCircle, ExternalLink, Instagram, Video, Youtube, FileText, Twitter, Facebook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReceiptItemsList } from "@/components/ReceiptItemsList";
import { AlbumSelector } from "@/components/AlbumSelector";
import { TagInput } from "@/components/TagInput";
import { LocationPicker } from "@/components/LocationPicker";
import { UnifiedMediaUpload } from "@/components/UnifiedMediaUpload";
import { SocialLinksInput, SocialLink } from "@/components/SocialLinksInput";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/i18n";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";

export default function RestaurantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [entry, setEntry] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [currentAlbums, setCurrentAlbums] = useState<any[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [translatingMenuId, setTranslatingMenuId] = useState<string | null>(null);
  const [editingTranslationId, setEditingTranslationId] = useState<string | null>(null);
  const [editedTranslation, setEditedTranslation] = useState<string>("");

  const languageOptions = [
    { code: "Portuguese", name: "Português", flag: "🇧🇷" },
    { code: "English", name: "English", flag: "🇺🇸" },
    { code: "Spanish", name: "Español", flag: "🇪🇸" },
    { code: "French", name: "Français", flag: "🇫🇷" },
    { code: "Italian", name: "Italiano", flag: "🇮🇹" },
    { code: "German", name: "Deutsch", flag: "🇩🇪" },
    { code: "Japanese", name: "日本語", flag: "🇯🇵" },
    { code: "Chinese", name: "中文", flag: "🇨🇳" },
  ];
  
  const [formData, setFormData] = useState({
    restaurant_name: "",
    visit_date: "",
    location_address: "",
    location_lat: null as number | null,
    location_lng: null as number | null,
    google_place_id: "" as string | null,
    rating: 0,
    companions: "",
    notes: "",
  });

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

  useEffect(() => {
    if (id) {
      fetchEntry();
      fetchPhotos();
      fetchReceipt();
      fetchCurrentAlbums();
      fetchTags();
      fetchSocialLinks();
    }
  }, [id]);

  const fetchTags = async () => {
    const { data } = await supabase
      .from("entry_tags")
      .select(`
        tags!inner (
          label
        )
      `)
      .eq("entry_id", id);

    if (data) {
      setTags(data.map((d: any) => d.tags.label));
    }
  };

  const fetchSocialLinks = async () => {
    const { data } = await supabase
      .from("restaurant_social_links")
      .select("*")
      .eq("entry_id", id)
      .order("created_at", { ascending: true });

    if (data) {
      setSocialLinks(data);
    }
  };

  const fetchCurrentAlbums = async () => {
    const { data } = await supabase
      .from("album_entries")
      .select(`
        album_id,
        albums!inner (
          id,
          title
        )
      `)
      .eq("entry_id", id);

    if (data) {
      setCurrentAlbums(data.map((d: any) => d.albums));
    }
  };

  const fetchEntry = async () => {
    const { data, error } = await supabase
      .from("restaurant_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      toast({
        title: t("restaurantDetail.error"),
        description: t("restaurantDetail.loadFailed"),
        variant: "destructive",
      });
      navigate("/dining");
      return;
    }

    if (!data) {
      navigate("/dining");
      return;
    }

    setEntry(data);
    setFormData({
      restaurant_name: data.restaurant_name,
      visit_date: data.visit_date,
      location_address: data.location_address || "",
      location_lat: data.location_lat,
      location_lng: data.location_lng,
      google_place_id: data.google_place_id || null,
      rating: data.rating || 0,
      companions: data.companions || "",
      notes: data.notes || "",
    });
    setLoading(false);
  };

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from("restaurant_photos")
      .select("*")
      .eq("entry_id", id)
      .order("created_at", { ascending: false });

    if (data) setPhotos(data);
  };

  const fetchReceipt = async () => {
    const { data } = await supabase
      .from("receipts")
      .select(`
        *,
        receipt_items (*)
      `)
      .eq("entry_id", id)
      .maybeSingle();

    if (data) {
      setReceipt(data);
      setReceiptItems(data.receipt_items || []);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      // Update restaurant entry
      const { error: entryError } = await supabase
        .from("restaurant_entries")
        .update({
          restaurant_name: formData.restaurant_name,
          visit_date: formData.visit_date,
          location_address: formData.location_address,
          location_lat: formData.location_lat,
          location_lng: formData.location_lng,
          google_place_id: formData.google_place_id,
          rating: formData.rating || null,
          companions: formData.companions,
          notes: formData.notes,
        })
        .eq("id", id);

      if (entryError) throw entryError;

      // Photos and receipts are now saved progressively by UnifiedMediaUpload
      // when entryId is provided, so no batch saving needed here

      // Update tags
      await supabase.from("entry_tags").delete().eq("entry_id", id);

      for (const tagLabel of tags) {
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

        await supabase
          .from("entry_tags")
          .insert({
            entry_id: id,
            tag_id: tagId,
          });
      }

      // Update social links
      await supabase.from("restaurant_social_links").delete().eq("entry_id", id);

      if (socialLinks.length > 0) {
        const linksToInsert = socialLinks.map(link => ({
          entry_id: id,
          platform: link.platform,
          url: link.url,
          title: link.title || null,
        }));

        const { error: linksError } = await supabase
          .from("restaurant_social_links")
          .insert(linksToInsert);

        if (linksError) throw linksError;
      }

      toast({
        title: t("restaurantDetail.success"),
        description: t("restaurantDetail.restaurantUpdated"),
      });

      setEditMode(false);
      fetchEntry();
      fetchPhotos();
      fetchReceipt();
      fetchTags();
      fetchSocialLinks();
      
      setUploadData({
        place: [],
        food: [],
        friends: [],
        wine: [],
        menu: [],
        receipt: null,
      });
    } catch (error: any) {
      toast({
        title: t("restaurantDetail.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddToAlbum = async () => {
    if (!selectedAlbumId || selectedAlbumId === "none") {
      toast({
        title: t("restaurantDetail.error"),
        description: t("restaurantDetail.albumError"),
        variant: "destructive",
      });
      return;
    }

    const { data: existing } = await supabase
      .from("album_entries")
      .select("*")
      .eq("album_id", selectedAlbumId)
      .eq("entry_id", id)
      .maybeSingle();

    if (existing) {
      toast({
        title: t("restaurantDetail.info"),
        description: t("restaurantDetail.alreadyInAlbum"),
      });
      return;
    }

    const { error } = await supabase
      .from("album_entries")
      .insert({
        album_id: selectedAlbumId,
        entry_id: id,
      });

    if (error) {
      toast({
        title: t("restaurantDetail.error"),
        description: t("restaurantDetail.albumFailed"),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t("restaurantDetail.success"),
      description: t("restaurantDetail.albumAdded"),
    });

    setAlbumDialogOpen(false);
    setSelectedAlbumId(undefined);
    fetchCurrentAlbums();
  };

  const handleDelete = async () => {
    const { error } = await supabase
      .from("restaurant_entries")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: t("restaurantDetail.error"),
        description: t("restaurantDetail.deleteFailed"),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t("restaurantDetail.success"),
      description: t("restaurantDetail.deleteSuccess"),
    });
    
    navigate("/dining");
  };

  const copyToClipboard = async (text: string) => {
    // Try Web Share API first (works great on iOS)
    if (navigator.share) {
      try {
        await navigator.share({ url: text });
        return true;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
        if ((err as Error).name === 'AbortError') {
          return false;
        }
      }
    }

    // Fallback for iOS Safari - use textarea method
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Final fallback using textarea (works on iOS)
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (error) {
        document.body.removeChild(textarea);
        return false;
      }
    }
  };

  const handleShare = async () => {
    if (!entry.is_public) {
      toast({
        title: t("restaurantDetail.restaurantPrivate"),
        description: t("restaurantDetail.makePublicFirst"),
        variant: "destructive",
      });
      return;
    }

    setShareLoading(true);
    try {
      // Generate short token via edge function
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
        "generate-share-token",
        { body: { entry_id: id } }
      );

      if (tokenError) throw tokenError;

      const token = tokenData?.token;
      const shareUrl = token 
        ? `https://food.evoque.guru/s/${token}`
        : `https://food.evoque.guru/share/${id}`;
      
      const copied = await copyToClipboard(shareUrl);
      
      if (copied !== false) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        
        toast({
          title: t("restaurantDetail.linkCopied"),
          description: `${t("restaurantDetail.shareLink")}: ${token || id}`,
        });
      }
    } catch (error) {
      console.error('Error generating share token:', error);
      // Fallback to old share URL
      const shareUrl = `https://food.evoque.guru/s/${id}`;
      const copied = await copyToClipboard(shareUrl);
      
      if (copied !== false) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
          title: t("restaurantDetail.linkCopied"),
          description: t("restaurantDetail.shareLinkCopied"),
        });
      } else {
        toast({
          title: "Could not copy link",
          description: "Please try again",
          variant: "destructive",
        });
      }
    } finally {
      setShareLoading(false);
    }
  };

  const handleMakePublic = async () => {
    setShareLoading(true);
    const { error } = await supabase
      .from("restaurant_entries")
      .update({ is_public: true })
      .eq("id", id);

    if (error) {
      toast({
        title: t("restaurantDetail.makePrivateError"),
        description: t("restaurantDetail.makePublicFailed"),
        variant: "destructive",
      });
      setShareLoading(false);
      return;
    }

    toast({
      title: t("restaurantDetail.restaurantNowPublic"),
      description: t("restaurantDetail.canShareNow"),
    });

    fetchEntry();
    setShareLoading(false);
  };

  const handleMakePrivate = async () => {
    setShareLoading(true);
    const { error } = await supabase
      .from("restaurant_entries")
      .update({ is_public: false })
      .eq("id", id);

    if (error) {
      toast({
        title: t("restaurantDetail.makePrivateError"),
        description: t("restaurantDetail.makePrivateFailed"),
        variant: "destructive",
      });
      setShareLoading(false);
      return;
    }

    toast({
      title: t("restaurantDetail.restaurantNowPrivate"),
      description: t("restaurantDetail.shareLinkDeactivated"),
    });

    fetchEntry();
    setShareLoading(false);
  };

  const setRating = (rating: number) => {
    setFormData((prev) => ({ ...prev, rating }));
  };

  const handleGenerateNote = async () => {
    setGeneratingNote(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("generate-restaurant-note", {
        body: {
          restaurantName: formData.restaurant_name,
          location: formData.location_address,
          rating: formData.rating,
          companions: formData.companions,
          visitDate: formData.visit_date,
          language,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Note generation error:', error);
        throw new Error(error.message || 'Failed to generate note');
      }
      
      // Check if response contains an error field
      if (data?.error) {
        console.error('AI error:', data.error);
        throw new Error(data.error);
      }

      if (data?.note) {
        setFormData((prev) => ({ ...prev, notes: data.note }));
        toast({
          title: t("restaurantDetail.noteGenerated"),
          description: t("restaurantDetail.noteGeneratedDesc"),
        });
      } else {
        throw new Error('No note returned');
      }
    } catch (error: any) {
      toast({
        title: t("restaurantDetail.error"),
        description: error.message || t("restaurantDetail.noteFailed"),
        variant: "destructive",
      });
    } finally {
      setGeneratingNote(false);
    }
  };

  const handleTranslateMenu = async (photoId: string, photoUrl: string, targetLang?: string) => {
    setTranslatingMenuId(photoId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const targetLanguage = targetLang || (language === "pt" ? "Portuguese" : "English");

      const { data, error } = await supabase.functions.invoke("translate-menu", {
        body: {
          imageUrl: photoUrl,
          targetLanguage,
          photoId,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error("Menu translation error:", error);
        throw new Error(error.message || "Failed to translate menu");
      }

      if (data?.error) {
        console.error("AI error:", data.error);
        throw new Error(data.error);
      }

      if (data?.translation) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId ? { ...p, menu_translation: data.translation } : p
          )
        );
        toast({
          title: t("restaurantDetail.translationSaved"),
          description: t("restaurantDetail.menuTranslation"),
        });
      } else {
        throw new Error("No translation returned");
      }
    } catch (error: any) {
      toast({
        title: t("restaurantDetail.error"),
        description: error.message || t("restaurantDetail.translationError"),
        variant: "destructive",
      });
    } finally {
      setTranslatingMenuId(null);
    }
  };

  const startEditingTranslation = (photoId: string, translation: string) => {
    setEditingTranslationId(photoId);
    setEditedTranslation(translation);
  };

  const cancelEditingTranslation = () => {
    setEditingTranslationId(null);
    setEditedTranslation("");
  };

  const saveTranslation = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from("restaurant_photos")
        .update({ menu_translation: editedTranslation })
        .eq("id", photoId);

      if (error) throw error;

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, menu_translation: editedTranslation } : p
        )
      );

      setEditingTranslationId(null);
      setEditedTranslation("");
      toast({
        title: t("restaurantDetail.translationUpdated"),
      });
    } catch (error: any) {
      toast({
        title: t("restaurantDetail.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteTranslation = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from("restaurant_photos")
        .update({ menu_translation: null })
        .eq("id", photoId);

      if (error) throw error;

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, menu_translation: null } : p
        )
      );

      toast({
        title: t("restaurantDetail.translationDeleted"),
      });
    } catch (error: any) {
      toast({
        title: t("restaurantDetail.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <div className="container mx-auto px-4 main-content-padding text-center">
          <p className="text-muted-foreground">{t("restaurantDetail.loading")}</p>
        </div>
      </div>
    );
  }

  if (!entry) {
    return null;
  }

  // Helper function to detect video from URL (for backward compatibility)
  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  // Include 'place' type for backward compatibility with older records, but exclude videos
  const placePhotos = photos.filter(p => 
    (p.type === 'restaurant_photo' || p.type === 'place' || !p.type) && !isVideoUrl(p.photo_url)
  );
  const foodPhotos = photos.filter(p => p.type === 'food');
  const menuPhotos = photos.filter(p => p.type === 'menu');
  const winePhotos = photos.filter(p => p.type === 'wine');
  const friendsPhotos = photos.filter(p => p.type === 'friends');
  // Include videos from 'video' type OR detected from URL (backward compatibility)
  const videoPhotos = photos.filter(p => p.type === 'video' || isVideoUrl(p.photo_url));

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/dining")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-3xl font-bold">
                {editMode ? t("restaurantDetail.editRestaurant") : entry.restaurant_name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {!editMode && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setEditMode(true)}
                  >
                    <Edit className="h-5 w-5 mr-2" />
                    {t("restaurantDetail.edit")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={entry.is_public ? "default" : "outline"}
                        size="icon"
                        disabled={shareLoading}
                      >
                        {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-background border shadow-lg z-50">
                      {entry.is_public ? (
                          <>
                            <DropdownMenuItem onClick={handleShare} className="cursor-pointer">
                              <LinkIcon className="h-4 w-4 mr-2" />
                              {t("restaurantDetail.copyLink")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleMakePrivate} className="cursor-pointer text-destructive">
                              <Lock className="h-4 w-4 mr-2" />
                              {t("restaurantDetail.makePrivate")}
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem onClick={handleMakePublic} className="cursor-pointer">
                            <Globe className="h-4 w-4 mr-2" />
                            {t("restaurantDetail.makePublic")}
                          </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Dialog open={albumDialogOpen} onOpenChange={setAlbumDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon">
                        <FolderPlus className="h-5 w-5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("restaurantDetail.addToAlbum")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <AlbumSelector
                          selectedAlbumId={selectedAlbumId}
                          onAlbumSelect={setSelectedAlbumId}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setAlbumDialogOpen(false)}
                          >
                            {t("restaurantDetail.cancel")}
                          </Button>
                          <Button onClick={handleAddToAlbum}>
                            {t("restaurantDetail.addToAlbum")}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon">
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("restaurantDetail.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("restaurantDetail.deleteDescription")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("restaurantDetail.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>{t("restaurantDetail.delete")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>

          {!editMode ? (
            // VIEW MODE
            <>
              {/* Current Albums */}
              {currentAlbums.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("restaurantDetail.albums")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {currentAlbums.map((album: any) => (
                        <Badge 
                          key={album.id} 
                          variant="secondary"
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => navigate(`/albums/${album.id}`)}
                        >
                          {album.title}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Main Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("restaurantDetail.restaurantDetails")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Restaurant Name */}
                  <div>
                    <h2 className="text-2xl font-bold">{entry.restaurant_name}</h2>
                  </div>

                  {/* Location */}
                  {entry.location_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-muted-foreground">{entry.location_address}</p>
                        {(entry.google_place_id || (entry.location_lat && entry.location_lng)) && (
                          <a
                            href={
                              entry.google_place_id
                                ? `https://www.google.com/maps/place/?q=place_id:${entry.google_place_id}`
                                : `https://www.google.com/maps/search/?api=1&query=${entry.location_lat},${entry.location_lng}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline mt-1"
                          >
                            <span>{t("locationPicker.viewOnMaps")}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Visit Date */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 flex-shrink-0" />
                    <p className="text-muted-foreground">
                      {format(new Date(entry.visit_date), "PPP", {
                        locale: language === "pt" ? ptBR : enUS,
                      })}
                    </p>
                  </div>

                  {/* Rating */}
                  {entry.rating > 0 && (
                    <div>
                      <Label className="text-lg mb-2">{t("restaurantDetail.rating")}</Label>
                      <div className="flex items-center space-x-1 pl-0">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "h-8 w-8",
                              star <= entry.rating
                                ? "text-accent fill-accent"
                                : "text-muted-foreground"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Companions */}
                  {entry.companions && (
                    <div>
                      <Label className="text-lg flex items-center gap-2 mb-2">
                        <Users className="h-5 w-5" />
                        {t("restaurantDetail.companions")}
                      </Label>
                      <p className="text-muted-foreground pl-7">{entry.companions}</p>
                    </div>
                  )}

                  {/* Notes */}
                  {entry.notes && (
                    <div>
                      <Label className="text-lg mb-2">{t("restaurantDetail.notes")}</Label>
                      <p className="text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div>
                      <Label className="text-lg mb-2">{t("restaurantDetail.tags")}</Label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Social Links */}
                  {socialLinks.length > 0 && (
                    <div>
                      <Label className="text-lg mb-2">Social Media</Label>
                      <div className="flex flex-wrap gap-2">
                        {socialLinks.map((link, index) => (
                          <a
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            {link.platform === 'instagram' && <Instagram className="w-4 h-4" />}
                            {link.platform === 'tiktok' && <Video className="w-4 h-4" />}
                            {link.platform === 'youtube' && <Youtube className="w-4 h-4" />}
                            {link.platform === 'blog' && <FileText className="w-4 h-4" />}
                            {link.platform === 'twitter' && <Twitter className="w-4 h-4" />}
                            {link.platform === 'facebook' && <Facebook className="w-4 h-4" />}
                            {link.platform === 'other' && <ExternalLink className="w-4 h-4" />}
                            <span className="text-sm font-medium capitalize">
                              {link.title || link.platform}
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Photos Section */}
              {(placePhotos.length > 0 || foodPhotos.length > 0 || menuPhotos.length > 0 || winePhotos.length > 0 || friendsPhotos.length > 0 || videoPhotos.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("restaurantDetail.photos")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    {/* Place Photos */}
                    {placePhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <Camera className="h-5 w-5" />
                          {t("restaurantDetail.place")}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {placePhotos.map((photo) => (
                            <Dialog key={photo.id}>
                              <DialogTrigger asChild>
                                <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                  <img
                                    src={photo.photo_url}
                                    alt="Place"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>Place Photo</DialogTitle>
                                </DialogHeader>
                                <div className="max-h-[80vh] overflow-auto">
                                  <img
                                    src={photo.photo_url}
                                    alt="Place full size"
                                    className="w-full rounded-lg"
                                  />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Food Photos */}
                    {foodPhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <UtensilsCrossed className="h-5 w-5" />
                          {t("restaurantDetail.food")}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {foodPhotos.map((photo) => (
                            <div key={photo.id} className="space-y-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                    <img
                                      src={photo.photo_url}
                                      alt={photo.caption || "Food"}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>{photo.caption || t("restaurantDetail.food")}</DialogTitle>
                                  </DialogHeader>
                                  <div className="max-h-[80vh] overflow-auto">
                                    <img
                                      src={photo.photo_url}
                                      alt={photo.caption || "Food full size"}
                                      className="w-full rounded-lg"
                                    />
                                  </div>
                                </DialogContent>
                              </Dialog>
                              {editMode ? (
                                <Input
                                  placeholder={t("restaurantDetail.addDishName")}
                                  value={photo.caption || ""}
                                  onChange={async (e) => {
                                    const newCaption = e.target.value;
                                    setPhotos(prev => prev.map(p => 
                                      p.id === photo.id ? { ...p, caption: newCaption } : p
                                    ));
                                    await supabase
                                      .from("restaurant_photos")
                                      .update({ caption: newCaption })
                                      .eq("id", photo.id);
                                  }}
                                  className="text-sm"
                                />
                              ) : photo.caption ? (
                                <p className="text-sm text-muted-foreground text-center">{photo.caption}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Menu Photos */}
                    {menuPhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <UtensilsCrossed className="h-5 w-5" />
                          {t("common.menu")}
                        </h3>
                        <div className="space-y-6">
                          {menuPhotos.map((photo) => (
                            <div key={photo.id} className="space-y-4">
                              {/* Menu Photo with Translate Button */}
                              <div className="relative">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <div className="aspect-[4/3] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                      <img
                                        src={photo.photo_url}
                                        alt={t("common.menu")}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-4xl">
                                    <DialogHeader>
                                      <DialogTitle>{t("common.menu")}</DialogTitle>
                                    </DialogHeader>
                                    <div className="max-h-[80vh] overflow-auto space-y-4">
                                      <img
                                        src={photo.photo_url}
                                        alt="Menu full size"
                                        className="w-full rounded-lg"
                                      />
                                      {/* Language Picker Dropdown in Dialog */}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={translatingMenuId === photo.id}
                                            className="w-full"
                                          >
                                            {translatingMenuId === photo.id ? (
                                              <>
                                                <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                                                {t("restaurantDetail.translating")}
                                              </>
                                            ) : (
                                              <>
                                                <Sparkles className="h-4 w-4 mr-2" />
                                                {photo.menu_translation 
                                                  ? t("restaurantDetail.retranslate")
                                                  : t("restaurantDetail.translateMenu")}
                                              </>
                                            )}
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-48 bg-background border shadow-lg z-50">
                                          {languageOptions.map((lang) => (
                                            <DropdownMenuItem
                                              key={lang.code}
                                              onClick={() => handleTranslateMenu(photo.id, photo.photo_url, lang.code)}
                                              className="cursor-pointer"
                                            >
                                              <span className="mr-2">{lang.flag}</span>
                                              {lang.name}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                      {/* Translation in Dialog */}
                                      {photo.menu_translation && (
                                        <div className="mt-4 p-4 rounded-lg bg-muted/50 border">
                                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                                            📋 {t("restaurantDetail.menuTranslation")}
                                          </h4>
                                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                            {photo.menu_translation}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>

                                {/* AI Translate Dropdown on Photo */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant={photo.menu_translation ? "secondary" : "default"}
                                      size="sm"
                                      disabled={translatingMenuId === photo.id}
                                      className="absolute bottom-2 right-2 shadow-lg"
                                    >
                                      {translatingMenuId === photo.id ? (
                                        <>
                                          <Sparkles className="h-4 w-4 mr-1 animate-pulse" />
                                          {t("restaurantDetail.translating")}
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-4 w-4 mr-1" />
                                          {photo.menu_translation 
                                            ? t("restaurantDetail.retranslate")
                                            : t("restaurantDetail.translateMenu")}
                                        </>
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 bg-background border shadow-lg z-50">
                                    {languageOptions.map((lang) => (
                                      <DropdownMenuItem
                                        key={lang.code}
                                        onClick={() => handleTranslateMenu(photo.id, photo.photo_url, lang.code)}
                                        className="cursor-pointer"
                                      >
                                        <span className="mr-2">{lang.flag}</span>
                                        {lang.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                              {/* Translation Card Below Photo with Edit */}
                              {photo.menu_translation && (
                                <Card className="border-primary/20 bg-primary/5">
                                  <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-base flex items-center gap-2">
                                        📋 {t("restaurantDetail.menuTranslation")}
                                      </CardTitle>
                                      {editingTranslationId !== photo.id && (
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => startEditingTranslation(photo.id, photo.menu_translation || "")}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>{t("restaurantDetail.deleteTranslation")}</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  {t("restaurantDetail.deleteTranslationConfirm")}
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => deleteTranslation(photo.id)}>
                                                  {t("common.delete")}
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      )}
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    {editingTranslationId === photo.id ? (
                                      <div className="space-y-3">
                                        <Textarea
                                          value={editedTranslation}
                                          onChange={(e) => setEditedTranslation(e.target.value)}
                                          rows={15}
                                          className="text-sm"
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={cancelEditingTranslation}
                                          >
                                            {t("common.cancel")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => saveTranslation(photo.id)}
                                          >
                                            <Save className="h-4 w-4 mr-1" />
                                            {t("common.save")}
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                        {photo.menu_translation}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Wine Photos */}
                    {winePhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <Wine className="h-5 w-5" />
                          {t("common.wine")}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {winePhotos.map((photo) => (
                            <div key={photo.id} className="space-y-3">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <div className="aspect-[3/4] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                    <img
                                      src={photo.photo_url}
                                      alt={t("common.wine")}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>{t("common.wine")}</DialogTitle>
                                  </DialogHeader>
                                  <div className="max-h-[80vh] overflow-auto">
                                    <img
                                      src={photo.photo_url}
                                      alt="Wine full size"
                                      className="w-full rounded-lg"
                                    />
                                    {photo.rating && photo.rating > 0 && (
                                      <div className="flex items-center space-x-1 mt-4">
                                        {Array.from({ length: photo.rating }).map((_, i) => (
                                          <Star key={i} className="h-5 w-5 text-accent fill-accent" />
                                        ))}
                                      </div>
                                    )}
                                    {photo.caption && (
                                      <div className="mt-4">
                                        <p className="font-medium mb-2">{t("restaurantDetail.tastingNotes")}</p>
                                        <p className="text-muted-foreground">{photo.caption}</p>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              {photo.rating && photo.rating > 0 && (
                                <div className="flex items-center space-x-1">
                                  {Array.from({ length: photo.rating }).map((_, i) => (
                                    <Star key={i} className="h-4 w-4 text-accent fill-accent" />
                                  ))}
                                </div>
                              )}
                              {photo.caption && (
                                <div>
                                  <p className="text-sm font-medium mb-1">{t("restaurantDetail.tastingNotes")}</p>
                                  <p className="text-sm text-muted-foreground">{photo.caption}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Friends Photos */}
                    {friendsPhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <UserCircle2 className="h-5 w-5" />
                          {t("common.friends")}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {friendsPhotos.map((photo) => (
                            <Dialog key={photo.id}>
                              <DialogTrigger asChild>
                                <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                  <img
                                    src={photo.photo_url}
                                    alt={t("common.friends")}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>{t("restaurantDetail.friendsPhoto")}</DialogTitle>
                                </DialogHeader>
                                <div className="max-h-[80vh] overflow-auto">
                                  <img
                                    src={photo.photo_url}
                                    alt="Friends full size"
                                    className="w-full rounded-lg"
                                  />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Video Section */}
                    {videoPhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <Video className="h-5 w-5" />
                          {t("common.video") || "Videos"}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {videoPhotos.map((photo) => (
                            <div key={photo.id} className="aspect-video rounded-lg overflow-hidden relative group">
                              <video
                                src={photo.photo_url}
                                controls
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* AI Generated Description */}
              {entry.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      {t("restaurantDetail.aiDescription")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {entry.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Private Receipt Section - ALWAYS LAST */}
              {receipt ? (
                <Card className="border-2 border-yellow-500/50 bg-yellow-50/5">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <ReceiptIcon className="h-5 w-5" />
                        {t("receiptSection.title")}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300 gap-1">
                        <Lock className="h-3 w-3" />
                        {t("receiptSection.visibility")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert className="border-yellow-200 bg-yellow-50/50">
                      <Lock className="h-4 w-4 text-yellow-700" />
                      <AlertDescription className="text-yellow-800">
                        {t("receiptSection.privateNote")}
                      </AlertDescription>
                    </Alert>

                    <div className="grid md:grid-cols-[200px,1fr] gap-6">
                      {receipt.photo_url && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <div className="cursor-pointer group">
                              <div className="aspect-square w-full max-w-[200px] rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors">
                                <img
                                  src={receipt.photo_url}
                                  alt={t("receiptSection.receiptImage")}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                              <p className="text-xs text-muted-foreground text-center mt-2">
                                {t("receiptSection.clickToView")}
                              </p>
                            </div>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>{t("receiptSection.receiptImage")}</DialogTitle>
                            </DialogHeader>
                            <div className="max-h-[70vh] overflow-auto">
                              <img
                                src={receipt.photo_url}
                                alt={t("receiptSection.receiptImage")}
                                className="w-full rounded-lg"
                              />
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      <div className="space-y-4">
                        {receiptItems.length > 0 && (
                          <ReceiptItemsList items={receiptItems} />
                        )}

                        <div className="border-t pt-4 space-y-2">
                          {receipt.subtotal && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span>{receipt.currency} {Number(receipt.subtotal).toFixed(2)}</span>
                            </div>
                          )}
                          {receipt.tax && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tax</span>
                              <span>{receipt.currency} {Number(receipt.tax).toFixed(2)}</span>
                            </div>
                          )}
                          {receipt.service_fee && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Service Fee</span>
                              <span>{receipt.currency} {Number(receipt.service_fee).toFixed(2)}</span>
                            </div>
                          )}
                          {receipt.total && (
                            <div className="flex justify-between font-bold text-lg border-t pt-2">
                              <span>Total</span>
                              <span>{receipt.currency} {Number(receipt.total).toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        {receipt.ocr_raw_text && (
                          <div className="border-t pt-4 mt-4">
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              {t("receiptSection.receiptTranscription")}
                            </h4>
                            <div className="bg-muted/50 rounded-lg p-4">
                              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                                {receipt.ocr_raw_text}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : editMode && (
                <Card className="border-2 border-dashed border-muted">
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <ReceiptIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{t("receiptSection.notAvailable")}</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            // EDIT MODE
            <Card>
              <CardHeader>
                <CardTitle>Edit Restaurant Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Location Picker */}
                  <LocationPicker
                    initialValue={entry.location_address || entry.restaurant_name}
                    initialLatLng={entry.location_lat && entry.location_lng ? { lat: entry.location_lat, lng: entry.location_lng } : undefined}
                    initialPlaceId={entry.google_place_id || undefined}
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

                  {/* Restaurant Name */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurant_name" className="text-lg">{t("restaurantDetail.restaurantName")} *</Label>
                    <Input
                      id="restaurant_name"
                      type="text"
                      value={formData.restaurant_name}
                      onChange={(e) =>
                        setFormData({ ...formData, restaurant_name: e.target.value })
                      }
                      className="text-lg h-12"
                      required
                    />
                  </div>

                  {/* Visit Date */}
                  <div className="space-y-2">
                    <Label htmlFor="visit_date" className="text-lg">Visit Date *</Label>
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
                    entryId={id}
                    initialUploadData={{
                      place: photos.filter(p => p.type === 'restaurant_photo' || p.type === 'place' || !p.type).map(p => p.photo_url),
                      food: photos.filter(p => p.type === 'food').map(p => p.photo_url),
                      friends: photos.filter(p => p.type === 'friends').map(p => p.photo_url),
                      wine: photos.filter(p => p.type === 'wine').map(p => ({
                        url: p.photo_url,
                        caption: p.caption || '',
                        rating: p.rating,
                        wineInfo: null,
                      })),
                      menu: photos.filter(p => p.type === 'menu').map(p => p.photo_url),
                      receipt: receipt ? {
                        photo_url: receipt.photo_url,
                        subtotal: receipt.subtotal,
                        tax: receipt.tax,
                        service_fee: receipt.service_fee,
                        total: receipt.total,
                        currency: receipt.currency,
                        items: receiptItems,
                      } : null,
                    }}
                    onUploadsChange={setUploadData}
                    onLocationExtracted={(location) => {
                      setFormData({
                        ...formData,
                        location_address: location.address,
                        location_lat: location.lat,
                        location_lng: location.lng,
                      });
                    }}
                    onPhotoSaved={(photoData) => {
                      // Reload photos to show immediately in the interface
                      fetchPhotos();
                      if (photoData.type === 'receipt') {
                        fetchReceipt();
                      }
                    }}
                  />

                  {/* Menu Photos with Translate Option in Edit Mode */}
                  {photos.filter(p => p.type === 'menu').length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <UtensilsCrossed className="h-5 w-5" />
                        {t("restaurantDetail.translateMenu")}
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {photos.filter(p => p.type === 'menu').map((photo) => (
                          <div key={photo.id} className="relative rounded-lg overflow-hidden border bg-muted">
                            <img
                              src={photo.photo_url}
                              alt={t("common.menu")}
                              className="w-full h-32 object-cover"
                            />
                            <div className="absolute bottom-2 right-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant={photo.menu_translation ? "secondary" : "default"}
                                    size="sm"
                                    disabled={translatingMenuId === photo.id}
                                    className="shadow-lg"
                                  >
                                    <Sparkles className="h-4 w-4 mr-1" />
                                    {translatingMenuId === photo.id
                                      ? t("restaurantDetail.translating")
                                      : photo.menu_translation
                                        ? t("restaurantDetail.retranslate")
                                        : t("restaurantDetail.translateMenu")}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-background border shadow-lg z-50">
                                  {languageOptions.map((lang) => (
                                    <DropdownMenuItem
                                      key={lang.code}
                                      onClick={() => handleTranslateMenu(photo.id, photo.photo_url, lang.code)}
                                      className="cursor-pointer"
                                    >
                                      {lang.flag} {lang.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {photo.menu_translation && (
                              <div className="absolute top-2 left-2">
                                <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                                  <Check className="h-3 w-3 mr-1" />
                                  {t("restaurantDetail.translated")}
                                </Badge>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <TagInput
                    selectedTags={tags}
                    onTagsChange={setTags}
                  />

                  {/* Rating */}
                  <div className="space-y-2">
                    <Label className="text-lg">{t("restaurantDetail.rating")}</Label>
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
                    <Label htmlFor="companions" className="text-lg">{t("restaurantDetail.companions")}</Label>
                    <Input
                      id="companions"
                      type="text"
                      placeholder={t("restaurantDetail.companionsPlaceholder")}
                      value={formData.companions}
                      onChange={(e) =>
                        setFormData({ ...formData, companions: e.target.value })
                      }
                      className="text-lg h-12"
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notes" className="text-lg">{t("restaurantDetail.notes")}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateNote}
                        disabled={generatingNote || !formData.restaurant_name}
                      >
                        {generatingNote ? t("restaurantDetail.generating") : t("restaurantDetail.generateNote")}
                      </Button>
                    </div>
                    <Textarea
                      id="notes"
                      placeholder={t("restaurantDetail.notesPlaceholder")}
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

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-4">
                    <Button
                      onClick={handleSaveChanges}
                      disabled={saving}
                      className="flex-1 h-12 text-lg"
                    >
                      <Save className="h-5 w-5 mr-2" />
                      {saving ? t("restaurantDetail.saving") : t("restaurantDetail.save")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditMode(false);
                        setFormData({
                          restaurant_name: entry.restaurant_name,
                          visit_date: entry.visit_date,
                          location_address: entry.location_address || "",
                          location_lat: entry.location_lat,
                          location_lng: entry.location_lng,
                          google_place_id: entry.google_place_id || null,
                          rating: entry.rating || 0,
                          companions: entry.companions || "",
                          notes: entry.notes || "",
                        });
                        setUploadData({
                          place: [],
                          food: [],
                          friends: [],
                          wine: [],
                          menu: [],
                          receipt: null,
                        });
                      }}
                      className="h-12 text-lg"
                    >
                      {t("restaurantDetail.cancel")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

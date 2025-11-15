import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Star, Calendar, Users, Edit, Trash2, FolderPlus, Share2, Check, Save, Wine, UtensilsCrossed, Camera, UserCircle2, Receipt as ReceiptIcon, Globe, Lock, Link as LinkIcon, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ReceiptItemsList } from "@/components/ReceiptItemsList";
import { AlbumSelector } from "@/components/AlbumSelector";
import { TagInput } from "@/components/TagInput";
import { LocationPicker } from "@/components/LocationPicker";
import { UnifiedMediaUpload } from "@/components/UnifiedMediaUpload";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function RestaurantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
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
  
  const [formData, setFormData] = useState({
    restaurant_name: "",
    visit_date: "",
    location_address: "",
    location_lat: null as number | null,
    location_lng: null as number | null,
    rating: 0,
    companions: "",
    notes: "",
  });

  const [uploadData, setUploadData] = useState<{
    place: string[];
    menu: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    friends: string[];
    receipt: any | null;
  }>({
    place: [],
    menu: [],
    wine: [],
    friends: [],
    receipt: null,
  });

  useEffect(() => {
    if (id) {
      fetchEntry();
      fetchPhotos();
      fetchReceipt();
      fetchCurrentAlbums();
      fetchTags();
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
        title: "Error",
        description: "Failed to load restaurant details",
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
          rating: formData.rating || null,
          companions: formData.companions,
          notes: formData.notes,
        })
        .eq("id", id);

      if (entryError) throw entryError;

      // Handle new photo uploads from UnifiedMediaUpload
      if (uploadData.place.length > 0 || uploadData.menu.length > 0 || uploadData.wine.length > 0 || uploadData.friends.length > 0) {
        const allPhotos = [
          ...uploadData.place.map(url => ({
            entry_id: id,
            photo_url: url,
            type: 'restaurant_photo',
          })),
          ...uploadData.menu.map(url => ({
            entry_id: id,
            photo_url: url,
            type: 'menu',
          })),
          ...uploadData.wine.map(wine => ({
            entry_id: id,
            photo_url: wine.url,
            type: 'wine',
            caption: wine.caption,
            rating: wine.rating || null,
          })),
          ...uploadData.friends.map(url => ({
            entry_id: id,
            photo_url: url,
            type: 'friends',
          })),
        ];

        if (allPhotos.length > 0) {
          const { error: photoError } = await supabase
            .from("restaurant_photos")
            .insert(allPhotos);

          if (photoError) throw photoError;
        }
      }

      // Handle receipt upload
      if (uploadData.receipt) {
        // Delete existing receipt if any
        if (receipt) {
          await supabase.from("receipts").delete().eq("id", receipt.id);
        }

        const { data: newReceipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            entry_id: id,
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
            receipt_id: newReceipt.id,
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

      toast({
        title: "Success",
        description: "Restaurant updated successfully",
      });

      setEditMode(false);
      fetchEntry();
      fetchPhotos();
      fetchReceipt();
      fetchTags();
      
      setUploadData({
        place: [],
        menu: [],
        wine: [],
        friends: [],
        receipt: null,
      });
    } catch (error: any) {
      toast({
        title: "Error",
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
        title: "Error",
        description: "Please select an album",
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
        title: "Info",
        description: "Restaurant is already in this album",
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
        title: "Error",
        description: "Failed to add to album",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Restaurant added to album",
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
        title: "Error",
        description: "Failed to delete restaurant",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Restaurant deleted successfully",
    });
    
    navigate("/dining");
  };

  const handleShare = async () => {
    if (!entry.is_public) {
      toast({
        title: "Restaurante Privado",
        description: "Torne o restaurante público primeiro para compartilhar",
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
      
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        title: "Link Copiado!",
        description: `Link: ${token || id}`,
      });
    } catch (error) {
      console.error('Error generating share token:', error);
      // Fallback to old share URL
      const shareUrl = `https://food.evoque.guru/s/${id}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link Copiado!",
        description: "Link de compartilhamento copiado",
      });
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
        title: "Erro",
        description: "Falha ao tornar público",
        variant: "destructive",
      });
      setShareLoading(false);
      return;
    }

    toast({
      title: "Restaurante Público",
      description: "Agora você pode compartilhar o link",
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
        title: "Erro",
        description: "Falha ao tornar privado",
        variant: "destructive",
      });
      setShareLoading(false);
      return;
    }

    toast({
      title: "Restaurante Privado",
      description: "O link de compartilhamento foi desativado",
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
      const { data, error } = await supabase.functions.invoke("generate-restaurant-note", {
        body: {
          restaurantName: formData.restaurant_name,
          location: formData.location_address,
          rating: formData.rating,
          companions: formData.companions,
          visitDate: formData.visit_date,
        },
      });

      if (error) throw error;

      if (data?.note) {
        setFormData((prev) => ({ ...prev, notes: data.note }));
        toast({
          title: "Note Generated",
          description: "AI has generated a note based on your restaurant details",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate note",
        variant: "destructive",
      });
    } finally {
      setGeneratingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <div className="container mx-auto px-4 pt-24 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!entry) {
    return null;
  }

  const placePhotos = photos.filter(p => p.type === 'restaurant_photo' || !p.type);
  const menuPhotos = photos.filter(p => p.type === 'menu');
  const winePhotos = photos.filter(p => p.type === 'wine');
  const friendsPhotos = photos.filter(p => p.type === 'friends');

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
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
                {editMode ? "Edit Restaurant" : entry.restaurant_name}
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
                    Edit
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
                            Copiar Link
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleMakePrivate} className="cursor-pointer text-destructive">
                            <Lock className="h-4 w-4 mr-2" />
                            Tornar Privado
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem onClick={handleMakePublic} className="cursor-pointer">
                          <Globe className="h-4 w-4 mr-2" />
                          Tornar Público
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
                        <DialogTitle>Add to Album</DialogTitle>
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
                            Cancel
                          </Button>
                          <Button onClick={handleAddToAlbum}>
                            Add to Album
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
                        <AlertDialogTitle>Delete Restaurant Entry</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete this restaurant entry and all associated photos and receipts.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
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
                    <CardTitle>Albums</CardTitle>
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
                  <CardTitle>Restaurant Details</CardTitle>
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
                      <p className="text-muted-foreground">{entry.location_address}</p>
                    </div>
                  )}

                  {/* Visit Date */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 flex-shrink-0" />
                    <p className="text-muted-foreground">
                      {new Date(entry.visit_date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Rating */}
                  {entry.rating > 0 && (
                    <div>
                      <Label className="text-lg mb-2">Rating</Label>
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
                        Who were you with?
                      </Label>
                      <p className="text-muted-foreground pl-7">{entry.companions}</p>
                    </div>
                  )}

                  {/* Notes */}
                  {entry.notes && (
                    <div>
                      <Label className="text-lg mb-2">Notes</Label>
                      <p className="text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div>
                      <Label className="text-lg mb-2">Tags</Label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Photos Section */}
              {(placePhotos.length > 0 || menuPhotos.length > 0 || winePhotos.length > 0 || friendsPhotos.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Photos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    {/* Place Photos */}
                    {placePhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <Camera className="h-5 w-5" />
                          Place
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

                    {/* Menu Photos */}
                    {menuPhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <UtensilsCrossed className="h-5 w-5" />
                          Menu
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {menuPhotos.map((photo) => (
                            <Dialog key={photo.id}>
                              <DialogTrigger asChild>
                                <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                  <img
                                    src={photo.photo_url}
                                    alt="Menu"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>Menu</DialogTitle>
                                </DialogHeader>
                                <div className="max-h-[80vh] overflow-auto">
                                  <img
                                    src={photo.photo_url}
                                    alt="Menu full size"
                                    className="w-full rounded-lg"
                                  />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Wine Photos */}
                    {winePhotos.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                          <Wine className="h-5 w-5" />
                          Wine
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {winePhotos.map((photo) => (
                            <div key={photo.id} className="space-y-3">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <div className="aspect-[3/4] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                    <img
                                      src={photo.photo_url}
                                      alt="Wine"
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>Wine</DialogTitle>
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
                                        <p className="font-medium mb-2">Tasting Notes:</p>
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
                                  <p className="text-sm font-medium mb-1">Tasting Notes:</p>
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
                          Friends
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {friendsPhotos.map((photo) => (
                            <Dialog key={photo.id}>
                              <DialogTrigger asChild>
                                <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                  <img
                                    src={photo.photo_url}
                                    alt="Friends"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>Friends Photo</DialogTitle>
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
                  </CardContent>
                </Card>
              )}

              {/* Receipt Section */}
              {receipt && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ReceiptIcon className="h-5 w-5" />
                      Receipt
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-[200px,1fr] gap-6">
                      {receipt.photo_url && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <div className="cursor-pointer group">
                              <div className="aspect-square w-full max-w-[200px] rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors">
                                <img
                                  src={receipt.photo_url}
                                  alt="Receipt"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                              <p className="text-xs text-muted-foreground text-center mt-2">
                                Click to view full size
                              </p>
                            </div>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Receipt Image</DialogTitle>
                            </DialogHeader>
                            <div className="max-h-[70vh] overflow-auto">
                              <img
                                src={receipt.photo_url}
                                alt="Receipt full size"
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

                        {/* OCR Raw Text */}
                        {receipt.ocr_raw_text && (
                          <div className="border-t pt-4 mt-4">
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              Receipt Transcription (OCR)
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
              )}

              {/* AI Generated Description */}
              {entry.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      AI Generated Description
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {entry.description}
                    </p>
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

                  {/* Restaurant Name */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurant_name" className="text-lg">Restaurant Name *</Label>
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

                  {/* Tags */}
                  <TagInput
                    selectedTags={tags}
                    onTagsChange={setTags}
                  />

                  {/* Rating */}
                  <div className="space-y-2">
                    <Label className="text-lg">Rating</Label>
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
                    <Label htmlFor="companions" className="text-lg">Who were you with?</Label>
                    <Input
                      id="companions"
                      type="text"
                      placeholder="Friends, Family, Solo..."
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
                      <Label htmlFor="notes" className="text-lg">Notes</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateNote}
                        disabled={generatingNote || !formData.restaurant_name}
                      >
                        {generatingNote ? "Generating..." : "Generate with AI"}
                      </Button>
                    </div>
                    <Textarea
                      id="notes"
                      placeholder="Share your thoughts, favorite dishes, ambience..."
                      rows={5}
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      className="text-lg min-h-[120px]"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-4">
                    <Button
                      onClick={handleSaveChanges}
                      disabled={saving}
                      className="flex-1 h-12 text-lg"
                    >
                      <Save className="h-5 w-5 mr-2" />
                      {saving ? "Saving..." : "Save Changes"}
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
                          rating: entry.rating || 0,
                          companions: entry.companions || "",
                          notes: entry.notes || "",
                        });
                        setUploadData({
                          place: [],
                          menu: [],
                          wine: [],
                          friends: [],
                          receipt: null,
                        });
                      }}
                      className="h-12 text-lg"
                    >
                      Cancel
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

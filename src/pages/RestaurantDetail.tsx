import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Star, Calendar, Users, Edit, Trash2, FolderPlus, Share2, Check, Save, Wine, UtensilsCrossed, Camera, UserCircle2, Receipt as ReceiptIcon, Globe, Lock, Link as LinkIcon, Sparkles, AlertCircle, ExternalLink, Instagram, Video, Youtube, FileText, Twitter, Facebook, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReceiptItemsList } from "@/components/ReceiptItemsList";
import { AlbumSelector } from "@/components/AlbumSelector";
import { refreshRestaurantLists, removeEntryFromCache } from "@/lib/entryCache";
import { PhotoThumb } from "@/components/photos/PhotoThumb";
import { SaveToPhotosButton } from "@/components/photos/SaveToPhotosButton";
import { cleanupInboxForEntry } from "@/lib/photoStorage";
import type { SocialLink } from "@/components/SocialLinksInput";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/i18n";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { useAIConsent } from "@/hooks/useAIConsent";
import { getShareUrl } from "@/lib/shareUrl";
import { ShareSheet } from "@/components/share/ShareSheet";
import { translateMenuSmart } from "@/lib/qrLink";
import { usePendingNota } from "@/hooks/usePendingNota";
import { MenuExplainToggle } from "@/components/MenuExplainToggle";
import { useMenuExplain } from "@/hooks/useMenuExplain";
import { withoutExplanations } from "@/lib/menuText";
import { markNotaUsed, saveNotaToEntry } from "@/lib/nfceSend";
import { QrBadge } from "@/components/add/AiCards";

export default function RestaurantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { ensureAIConsent } = useAIConsent();
  const [entry, setEntry] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [currentAlbums, setCurrentAlbums] = useState<any[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [translatingMenuId, setTranslatingMenuId] = useState<string | null>(null);
  const [editingTranslationId, setEditingTranslationId] = useState<string | null>(null);
  const [editedTranslation, setEditedTranslation] = useState<string>("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [shareUrlLoading, setShareUrlLoading] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // Seções recolhíveis (fechadas ao abrir o restaurante) e traduções de cardápio abertas
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // Tradução do cardápio: só os pratos (padrão) ou com explicação
  const [menuExplain, setMenuExplain] = useMenuExplain();
  const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

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

  // Nota fiscal mandada pelo favorito "Enviar ao Evoque": grava no Recibo deste
  // restaurante — só se a visita é de hoje ou ontem (nunca num restaurante antigo).
  const visitaRecente = (() => {
    if (!entry?.visit_date) return false;
    const dias = (Date.now() - new Date(`${entry.visit_date}T12:00:00`).getTime()) / 86_400_000;
    return dias > -2 && dias < 2;
  })();
  usePendingNota(!!(id && entry?.user_id && visitaRecente), async (n) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid || !id || entry?.user_id !== uid) return false;
    try {
      await saveNotaToEntry(id, uid, n, t("nota.receivedTitle"));
      await markNotaUsed(n.id);
      await fetchReceipt();
      setOpenSections((prev) => ({ ...prev, receipt: true }));
      toast({ title: t("nota.received") });
      return true;
    } catch (e) {
      console.error("[RestaurantDetail] nota", e);
      return false;
    }
  });

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
    // Originais ainda não copiados ao Drive saem do inbox privado
    if (id) await cleanupInboxForEntry(id);
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

    // Some da lista na hora (o cache durava 5 min e mostrava o restaurante apagado)
    if (id) removeEntryFromCache(queryClient, id);

    toast({
      title: t("restaurantDetail.success"),
      description: t("restaurantDetail.deleteSuccess"),
    });

    navigate("/", { replace: true });
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try modern clipboard API first
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fallback using textarea (works on iOS)
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
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

  const openShareDialog = async () => {
    if (!entry.is_public) {
      toast({
        title: t("restaurantDetail.restaurantPrivate"),
        description: t("restaurantDetail.makePublicFirst"),
        variant: "destructive",
      });
      return;
    }

    // Open dialog immediately - no async before this
    setShareDialogOpen(true);
    setShareUrlLoading(true);
    setCopied(false);
    
    // Generate token in background
    try {
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
        "generate-share-token",
        { body: { entry_id: id } }
      );

      if (tokenError) throw tokenError;

      const token = tokenData?.token;
      const url = getShareUrl(id!, token);
      
      setShareUrl(url);
    } catch (error) {
      console.error('Error generating share token:', error);
      // Fallback to entry-id share URL (still gets OG preview)
      setShareUrl(getShareUrl(id!));
    } finally {
      setShareUrlLoading(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: t("restaurantDetail.linkCopied"),
        description: t("restaurantDetail.shareLinkCopied"),
      });
    } else {
      toast({
        title: "Could not copy link",
        description: "Please select and copy the link manually",
        variant: "destructive",
      });
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl || !navigator.share) return;
    
    try {
      await navigator.share({
        title: entry.restaurant_name,
        url: shareUrl,
      });
    } catch (err) {
      // User cancelled - this is fine
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  const handleShare = async () => {
    // Keep for backwards compat - now just opens dialog
    openShareDialog();
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

  const handleTranslateMenu = async (photoId: string, photoUrl: string, targetLang?: string) => {
    const allowed = await ensureAIConsent("menu_translation");
    if (!allowed) return;
    setTranslatingMenuId(photoId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const targetLanguage = targetLang || (language === "pt" ? "Portuguese" : "English");

      // Com QR code na foto, traduz o cardápio do link; senão, a foto
      const r = await translateMenuSmart({ imageUrl: photoUrl, targetLanguage, photoId });
      const data = { translation: r.value };

      if (data?.translation) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId
              ? { ...p, menu_translation: data.translation, ...(r.viaQr && r.qrUrl ? { caption: r.qrUrl } : {}) }
              : p
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
                {entry.restaurant_name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/dining/${id}/edit`)}
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
                            <DropdownMenuItem onClick={openShareDialog} className="cursor-pointer">
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
                  
                  {/* Share Dialog */}
                  <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Share2 className="h-5 w-5" />
                          {t("restaurantDetail.shareRestaurant")}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        {shareUrlLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Input 
                                readOnly 
                                value={shareUrl} 
                                className="flex-1 text-sm"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                className="flex-1" 
                                onClick={handleCopyShareUrl}
                                disabled={!shareUrl}
                              >
                                {copied ? (
                                  <>
                                    <Check className="h-4 w-4 mr-2" />
                                    {t("restaurantDetail.copied")}
                                  </>
                                ) : (
                                  <>
                                    <LinkIcon className="h-4 w-4 mr-2" />
                                    {t("restaurantDetail.copy")}
                                  </>
                                )}
                              </Button>
                              {typeof navigator !== 'undefined' && navigator.share && (
                                <Button 
                                  variant="outline"
                                  onClick={handleNativeShare}
                                  disabled={!shareUrl}
                                >
                                  <Share2 className="h-4 w-4 mr-2" />
                                  {t("restaurantDetail.share")}
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
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
            </div>
          </div>

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

                  {/* Equipe do restaurante */}
                  {entry.staff && (
                    <div>
                      <Label className="text-lg flex items-center gap-2 mb-2">
                        <UserCircle2 className="h-5 w-5" />
                        {t("restaurantDetail.staff")}
                      </Label>
                      <p className="text-muted-foreground whitespace-pre-wrap pl-7">{entry.staff}</p>
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
                  <CardContent className="space-y-2 divide-y [&>*]:pt-2">
                    {/* Place Photos */}
                    {placePhotos.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSection("place")}
                          aria-expanded={!!openSections.place}
                          className="w-full flex items-center justify-between gap-2 py-2 text-lg font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <Camera className="h-6 w-6" />
                            {t("restaurantDetail.place")}
                            <span className="font-normal text-muted-foreground">· {placePhotos.length}</span>
                          </span>
                          <ChevronDown className={cn("h-7 w-7 text-muted-foreground transition-transform", openSections.place && "rotate-180")} />
                        </button>
                        {openSections.place && (
                        <div className="mt-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {placePhotos.map((photo) => (
                            <Dialog key={photo.id}>
                              <DialogTrigger asChild>
                                <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                  <PhotoThumb
                                    photo={photo}
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
                                  <SaveToPhotosButton url={photo.photo_url} className="mt-4" />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ))}
                        </div>
                        </div>
                        )}
                      </div>
                    )}

                    {/* Food Photos */}
                    {foodPhotos.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSection("food")}
                          aria-expanded={!!openSections.food}
                          className="w-full flex items-center justify-between gap-2 py-2 text-lg font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <UtensilsCrossed className="h-6 w-6" />
                            {t("restaurantDetail.food")}
                            <span className="font-normal text-muted-foreground">· {foodPhotos.length}</span>
                          </span>
                          <ChevronDown className={cn("h-7 w-7 text-muted-foreground transition-transform", openSections.food && "rotate-180")} />
                        </button>
                        {openSections.food && (
                        <div className="mt-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {foodPhotos.map((photo) => (
                            <div key={photo.id} className="space-y-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                    <PhotoThumb
                                      photo={photo}
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
                                    <SaveToPhotosButton url={photo.photo_url} className="mt-4" />
                                  </div>
                                </DialogContent>
                              </Dialog>
                              {photo.caption ? (
                                <p className="text-sm text-muted-foreground text-center">{photo.caption}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        </div>
                        )}
                      </div>
                    )}

                    {/* Menu Photos */}
                    {menuPhotos.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSection("menu")}
                          aria-expanded={!!openSections.menu}
                          className="w-full flex items-center justify-between gap-2 py-2 text-lg font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <UtensilsCrossed className="h-6 w-6" />
                            {t("common.menu")}
                            <span className="font-normal text-muted-foreground">· {menuPhotos.length}</span>
                          </span>
                          <ChevronDown className={cn("h-7 w-7 text-muted-foreground transition-transform", openSections.menu && "rotate-180")} />
                        </button>
                        {openSections.menu && (
                        <div className="mt-4">
                        <div className="space-y-6">
                          {menuPhotos.map((photo) => (
                            <div key={photo.id} className="space-y-4">
                              {/* Menu Photo with Translate Button */}
                              <div className="relative">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <div className="aspect-[4/3] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                      <PhotoThumb
                                        photo={photo}
                                        sizes="(min-width: 768px) 60vw, 100vw"
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
                                      <SaveToPhotosButton url={photo.photo_url} className="mt-4" />
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
                                          <div className="mb-3">
                                            <MenuExplainToggle value={menuExplain} onChange={setMenuExplain} />
                                          </div>
                                          <div className={cn("whitespace-pre-wrap leading-relaxed", menuExplain ? "text-sm" : "text-base")}>
                                            {menuExplain ? photo.menu_translation : withoutExplanations(photo.menu_translation)}
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
                                      <button
                                        type="button"
                                        onClick={() => toggleSection(`tr-${photo.id}`)}
                                        aria-expanded={!!openSections[`tr-${photo.id}`]}
                                        className="flex flex-1 items-center gap-2 text-left text-base font-semibold"
                                      >
                                        📋 {t("restaurantDetail.menuTranslation")}
                                        <ChevronDown className={cn("h-6 w-6 text-muted-foreground transition-transform", openSections[`tr-${photo.id}`] && "rotate-180")} />
                                      </button>
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
                                  {/^https?:\/\//i.test(photo.caption || "") && (
                                    <div className="px-6 pb-2">
                                      <QrBadge url={photo.caption} />
                                    </div>
                                  )}
                                  {(openSections[`tr-${photo.id}`] || editingTranslationId === photo.id) && (
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
                                      <div className="space-y-3">
                                        <MenuExplainToggle value={menuExplain} onChange={setMenuExplain} />
                                        <div className={cn("whitespace-pre-wrap leading-relaxed", menuExplain ? "text-sm" : "text-base")}>
                                          {menuExplain ? photo.menu_translation : withoutExplanations(photo.menu_translation || "")}
                                        </div>
                                      </div>
                                    )}
                                  </CardContent>
                                  )}
                                </Card>
                              )}
                            </div>
                          ))}
                        </div>
                        </div>
                        )}
                      </div>
                    )}

                    {/* Wine Photos */}
                    {winePhotos.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSection("wine")}
                          aria-expanded={!!openSections.wine}
                          className="w-full flex items-center justify-between gap-2 py-2 text-lg font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <Wine className="h-6 w-6" />
                            {t("common.wine")}
                            <span className="font-normal text-muted-foreground">· {winePhotos.length}</span>
                          </span>
                          <ChevronDown className={cn("h-7 w-7 text-muted-foreground transition-transform", openSections.wine && "rotate-180")} />
                        </button>
                        {openSections.wine && (
                        <div className="mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {winePhotos.map((photo) => (
                            <div key={photo.id} className="space-y-3">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <div className="aspect-[3/4] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                    <PhotoThumb
                                      photo={photo}
                                      sizes="(min-width: 768px) 50vw, 100vw"
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
                                    <SaveToPhotosButton url={photo.photo_url} className="mt-4" />
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
                      </div>
                    )}

                    {/* Friends Photos */}
                    {friendsPhotos.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSection("friends")}
                          aria-expanded={!!openSections.friends}
                          className="w-full flex items-center justify-between gap-2 py-2 text-lg font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <UserCircle2 className="h-6 w-6" />
                            {t("common.friends")}
                            <span className="font-normal text-muted-foreground">· {friendsPhotos.length}</span>
                          </span>
                          <ChevronDown className={cn("h-7 w-7 text-muted-foreground transition-transform", openSections.friends && "rotate-180")} />
                        </button>
                        {openSections.friends && (
                        <div className="mt-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {friendsPhotos.map((photo) => (
                            <Dialog key={photo.id}>
                              <DialogTrigger asChild>
                                <div className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                  <PhotoThumb
                                    photo={photo}
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
                                  <SaveToPhotosButton url={photo.photo_url} className="mt-4" />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ))}
                        </div>
                        </div>
                        )}
                      </div>
                    )}

                    {/* Video Section */}
                    {videoPhotos.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSection("video")}
                          aria-expanded={!!openSections.video}
                          className="w-full flex items-center justify-between gap-2 py-2 text-lg font-semibold"
                        >
                          <span className="flex items-center gap-2">
                            <Video className="h-6 w-6" />
                            {t("common.video") || "Videos"}
                            <span className="font-normal text-muted-foreground">· {videoPhotos.length}</span>
                          </span>
                          <ChevronDown className={cn("h-7 w-7 text-muted-foreground transition-transform", openSections.video && "rotate-180")} />
                        </button>
                        {openSections.video && (
                        <div className="mt-4">
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
                  <CardHeader
                    role="button"
                    tabIndex={0}
                    aria-expanded={!!openSections.receipt}
                    onClick={() => toggleSection("receipt")}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2">
                        <ReceiptIcon className="h-6 w-6" />
                        {t("receiptSection.title")}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300 gap-1">
                        <Lock className="h-3 w-3" />
                        {t("receiptSection.visibility")}
                      </Badge>
                      <ChevronDown className={cn("h-7 w-7 shrink-0 text-muted-foreground transition-transform", openSections.receipt && "rotate-180")} />
                    </div>
                  </CardHeader>
                  {openSections.receipt && (
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
                                  loading="lazy"
                                  decoding="async"
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
                  )}
                </Card>
              ) : null}

              {/* Compartilhar: fotos escolhidas por PDF ou WhatsApp */}
              <Button
                type="button"
                size="lg"
                onClick={() => setShareSheetOpen(true)}
                className="h-16 w-full gap-3 rounded-2xl text-lg font-semibold"
              >
                <Share2 className="h-7 w-7" />
                {t("share.button")}
              </Button>
              <ShareSheet
                open={shareSheetOpen}
                onClose={() => setShareSheetOpen(false)}
                info={{
                  name: entry.restaurant_name,
                  address: entry.location_address,
                  visitDate: entry.visit_date
                    ? format(new Date(entry.visit_date), "PPP", { locale: language === "pt" ? ptBR : enUS })
                    : null,
                  rating: entry.rating,
                }}
                photos={{
                  place: placePhotos.map((p) => p.photo_url),
                  menu: menuPhotos.map((p) => p.photo_url),
                  food: foodPhotos.map((p) => p.photo_url),
                  wine: winePhotos.map((p) => p.photo_url),
                  friends: friendsPhotos.map((p) => p.photo_url),
                  receipt: receipt?.photo_url ? [receipt.photo_url] : [],
                }}
                menuTranslations={menuPhotos.map((p) => p.menu_translation).filter((x): x is string => !!x && !!x.trim())}
              />
            </>
        </div>
      </main>
    </div>
  );
}

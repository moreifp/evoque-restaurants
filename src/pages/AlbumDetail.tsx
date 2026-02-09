import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBlockedUsersContext } from "@/contexts/BlockedUsersContext";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, MapPin, Calendar, Star, Trash2, Share2, Lock, Globe, MoreVertical, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlbumCoverCollage } from "@/components/AlbumCoverCollage";
import { ReportDialog } from "@/components/ReportDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AlbumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const { isBlocked } = useBlockedUsersContext();
  const [album, setAlbum] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  useEffect(() => {
    if (id) {
      fetchAlbumData();
    }
  }, [id]);

  const fetchAlbumData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch album details
      const { data: albumData, error: albumError } = await supabase
        .from("albums")
        .select("*")
        .eq("id", id)
        .single();

      if (albumError) throw albumError;
      setAlbum(albumData);
      
      // Check if current user is the owner
      setIsOwner(user?.id === albumData.user_id);

      // Fetch entries in this album
      const { data: albumEntries, error: entriesError } = await supabase
        .from("album_entries")
        .select(`
          entry_id,
          restaurant_entries (
            id,
            restaurant_name,
            visit_date,
            location_address,
            rating,
            notes,
            restaurant_photos (
              photo_url,
              type
            )
          )
        `)
        .eq("album_id", id);

      if (entriesError) throw entriesError;

      const formattedEntries = albumEntries
        .map((ae: any) => ae.restaurant_entries)
        .filter(Boolean);
      
      setEntries(formattedEntries);
    } catch (error: any) {
      toast({
        title: "Error loading album",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlbum = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("albums")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Album deleted",
        description: "The album has been permanently deleted",
      });

      navigate("/dining?tab=albums");
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  const handleVisibilityToggle = async (isPublic: boolean) => {
    try {
      const { error } = await supabase
        .from("albums")
        .update({ visibility: isPublic ? "public" : "private" })
        .eq("id", id);

      if (error) throw error;

      setAlbum({ ...album, visibility: isPublic ? "public" : "private" });
      toast({
        title: "Privacy updated",
        description: isPublic
          ? "Album is now public and can be shared"
          : "Album is now private",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
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
    const shareUrl = `${window.location.origin}/albums/${id}`;
    const copied = await copyToClipboard(shareUrl);
    
    if (copied !== false) {
      toast({
        title: "Link copied!",
        description: "Share this link with your friends",
      });
    } else {
      toast({
        title: "Could not copy link",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleRemoveFromAlbum = async (entryId: string) => {
    const { error } = await supabase
      .from("album_entries")
      .delete()
      .eq("album_id", id)
      .eq("entry_id", entryId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove from album",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Restaurant removed from album",
    });

    fetchAlbumData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">Loading album...</p>
        </main>
      </div>
    );
  }

  if (!album || (!isOwner && isBlocked(album.user_id))) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <Navigation />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
          <p className="text-center text-muted-foreground">Album not found</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 main-content-padding pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dining?tab=albums")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">{album.title}</h1>
                {album.visibility === "public" ? (
                  <Globe className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              {album.description && (
                <p className="text-muted-foreground mt-1">{album.description}</p>
              )}
            </div>
          </div>
          
          {isOwner && (
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share Album</DialogTitle>
                    <DialogDescription>
                      Control who can view this album and share it with friends
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="visibility">Make album public</Label>
                        <p className="text-sm text-muted-foreground">
                          Anyone with the link can view this album
                        </p>
                      </div>
                      <Switch
                        id="visibility"
                        checked={album.visibility === "public"}
                        onCheckedChange={handleVisibilityToggle}
                      />
                    </div>
                    
                    {album.visibility === "public" && (
                      <div className="space-y-2">
                        <Label>Share Link</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={`${window.location.origin}/albums/${id}`}
                            className="flex-1"
                          />
                          <Button onClick={handleShare}>
                            Copy
                          </Button>
                        </div>
                      </div>
                    )}
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
                    <AlertDialogTitle>Delete Album?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the album "{album.title}". The restaurants will not be deleted, only removed from this album. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAlbum}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting..." : "Delete Album"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          
          {/* Report menu for non-owners on public albums */}
          {!isOwner && album.visibility === "public" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setReportDialogOpen(true)}>
                  <Flag className="h-4 w-4 mr-2" />
                  {t("report.reportAlbum")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Cover Collage */}
        <Card className="mb-8">
          <CardContent className="p-0">
            <AlbumCoverCollage albumId={id!} />
          </CardContent>
        </Card>

        {/* Restaurant Entries */}
        <div className="mb-4">
          <h2 className="text-xl font-semibold">
            Restaurants ({entries.length})
          </h2>
        </div>

        {entries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entries.map((entry) => {
              const coverPhoto = entry.restaurant_photos?.find(
                (p: any) => p.type === "restaurant_photo"
              )?.photo_url;

              return (
                <Card
                  key={entry.id}
                  className="group hover:shadow-large transition-all overflow-hidden"
                >
                  <div 
                    className="cursor-pointer"
                    onClick={() => navigate(`/dining/${entry.id}`)}
                  >
                    {coverPhoto ? (
                      <div className="aspect-video bg-muted">
                        <img
                          src={coverPhoto}
                          alt={entry.restaurant_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-olive-teal" />
                    )}
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-lg group-hover:text-accent transition-colors mb-2">
                        {entry.restaurant_name}
                      </h3>
                      
                      {entry.location_address && (
                        <div className="flex items-start space-x-2 text-sm text-muted-foreground mb-2">
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-1">{entry.location_address}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(entry.visit_date).toLocaleDateString()}</span>
                        </div>
                        
                        {entry.rating && (
                          <div className="flex items-center space-x-1">
                            <Star className="h-4 w-4 text-accent fill-accent" />
                            <span className="font-medium">{entry.rating}</span>
                          </div>
                        )}
                      </div>

                      {entry.notes && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {entry.notes}
                        </p>
                      )}
                    </CardContent>
                  </div>
                  
                  {isOwner && (
                    <CardContent className="p-4 pt-0">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove from Album
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove from Album</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove this restaurant from the album? The restaurant entry will still exist in your diary.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemoveFromAlbum(entry.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground mb-4">
              No restaurants in this album yet
            </p>
            <Button onClick={() => navigate("/dining/add")}>
              Add Restaurant
            </Button>
          </Card>
        )}

        {/* Report Dialog */}
        {album && (
          <ReportDialog
            open={reportDialogOpen}
            onOpenChange={setReportDialogOpen}
            targetType="album"
            targetId={album.id}
            targetUserId={album.user_id}
          />
        )}
      </main>
    </div>
  );
}

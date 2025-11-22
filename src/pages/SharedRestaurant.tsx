import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MapPin, Star, Calendar, Users, FileText, Image as ImageIcon, ExternalLink, ChevronLeft, ChevronRight, X, Instagram, Video, Youtube, Twitter, Facebook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import evoqueIcon from "@/assets/evoque-icon.png";
import evoqueLogo from "@/assets/evoque-logo-full.png";

export default function SharedRestaurant() {
  const { id } = useParams();
  const [entry, setEntry] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [socialLinks, setSocialLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEntry();
    }
  }, [id]);

  const fetchEntry = async () => {
    const { data, error } = await supabase
      .from("restaurant_entries")
      .select("*")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setEntry(data);
    setLoading(false);
    fetchPhotos();
    fetchSocialLinks();
  };

  const fetchPhotos = async () => {
    const { data } = await supabase
      .from("restaurant_photos")
      .select("*")
      .eq("entry_id", id)
      .order("created_at", { ascending: false });

    if (data) {
      // Ensure all photos have a type, default to 'food' for backward compatibility
      const photosWithTypes = data.map(photo => ({
        ...photo,
        type: photo.type || 'food'
      }));
      setPhotos(photosWithTypes);
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

  const openLightbox = (index: number) => {
    setSelectedPhotoIndex(index);
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setSelectedPhotoIndex(null);
  };

  const navigatePhoto = (direction: 'prev' | 'next') => {
    if (selectedPhotoIndex === null) return;
    
    if (direction === 'prev') {
      setSelectedPhotoIndex(selectedPhotoIndex > 0 ? selectedPhotoIndex - 1 : photos.length - 1);
    } else {
      setSelectedPhotoIndex(selectedPhotoIndex < photos.length - 1 ? selectedPhotoIndex + 1 : 0);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      
      if (e.key === 'ArrowLeft') navigatePhoto('prev');
      if (e.key === 'ArrowRight') navigatePhoto('next');
      if (e.key === 'Escape') closeLightbox();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, selectedPhotoIndex, photos.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-lg bg-gradient-olive-teal mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-12 text-center">
            <h2 className="text-2xl font-bold mb-2">Restaurant Not Found</h2>
            <p className="text-muted-foreground mb-6">
              This restaurant has not been shared or does not exist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!entry) return null;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-olive-teal" />
            <span className="font-semibold text-lg">Evoque</span>
          </div>
        </div>
      </header>

      {/* Subtle Banner CTA */}
      <div className="fixed top-16 left-0 right-0 z-40 bg-muted/50 border-b backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <img src={evoqueIcon} alt="Evoque" className="w-5 h-5" />
              <span>Shared via <strong className="text-foreground">Evoque</strong></span>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="https://food.evoque.guru">Join Community</a>
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">{entry.restaurant_name}</h1>
            {entry.rating && (
              <div className="flex items-center space-x-1">
                <Star className="h-5 w-5 text-accent fill-accent" />
                <span className="text-lg font-medium">{entry.rating} / 5</span>
              </div>
            )}
          </div>

          {/* Main Info Card */}
          <Card>
            <CardContent className="p-6 space-y-4">
              {entry.location_address && (
                <div className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Location</p>
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
                        <span>View on Google Maps</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start space-x-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Visit Date</p>
                  <p className="text-muted-foreground">
                    {new Date(entry.visit_date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {entry.companions && (
                <div className="flex items-start space-x-3">
                  <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Companions</p>
                    <p className="text-muted-foreground">{entry.companions}</p>
                  </div>
                </div>
              )}

              {entry.notes && (
                <div className="flex items-start space-x-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Notes</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
                  </div>
                </div>
              )}

              {entry.voice_transcription && (
                <div className="flex items-start space-x-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Voice Note</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{entry.voice_transcription}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Social Links */}
          {socialLinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Find My Review On:</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/30 hover:bg-muted/50 hover:shadow-md transition-all"
                    >
                      {link.platform === 'instagram' && <Instagram className="w-5 h-5 text-pink-600" />}
                      {link.platform === 'tiktok' && <Video className="w-5 h-5 text-black" />}
                      {link.platform === 'youtube' && <Youtube className="w-5 h-5 text-red-600" />}
                      {link.platform === 'blog' && <FileText className="w-5 h-5 text-blue-600" />}
                      {link.platform === 'twitter' && <Twitter className="w-5 h-5 text-blue-400" />}
                      {link.platform === 'facebook' && <Facebook className="w-5 h-5 text-blue-600" />}
                      {link.platform === 'other' && <ExternalLink className="w-5 h-5" />}
                      <div className="flex flex-col">
                        <span className="font-medium capitalize">
                          {link.title || link.platform}
                        </span>
                        {link.title && (
                          <span className="text-xs text-muted-foreground capitalize">{link.platform}</span>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 opacity-50 ml-auto" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Place Photos */}
          {photos.filter(p => p.type === 'place' || p.type === 'restaurant_photo').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Place
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.filter(p => p.type === 'place' || p.type === 'restaurant_photo').map((photo) => {
                    const photoIndex = photos.findIndex(p => p.id === photo.id);
                    return (
                      <div
                        key={photo.id}
                        className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => openLightbox(photoIndex)}
                      >
                        <img
                          src={photo.photo_url}
                          alt="Place"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Food Photos */}
          {photos.filter(p => p.type === 'food').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Food
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.filter(p => p.type === 'food').map((photo) => {
                    const photoIndex = photos.findIndex(p => p.id === photo.id);
                    return (
                      <div
                        key={photo.id}
                        className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => openLightbox(photoIndex)}
                      >
                        <img
                          src={photo.photo_url}
                          alt="Food"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Friends Photos */}
          {photos.filter(p => p.type === 'friends').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Friends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.filter(p => p.type === 'friends').map((photo) => {
                    const photoIndex = photos.findIndex(p => p.id === photo.id);
                    return (
                      <div
                        key={photo.id}
                        className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => openLightbox(photoIndex)}
                      >
                        <img
                          src={photo.photo_url}
                          alt="Friends"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wine Photos */}
          {photos.filter(p => p.type === 'wine').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Wines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {photos.filter(p => p.type === 'wine').map((photo) => {
                    const photoIndex = photos.findIndex(p => p.id === photo.id);
                    return (
                      <div key={photo.id} className="space-y-3">
                        <div 
                          className="aspect-[3/4] rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => openLightbox(photoIndex)}
                        >
                          <img
                            src={photo.photo_url}
                            alt="Wine"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {photo.rating > 0 && (
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
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Menu Photos */}
          {photos.filter(p => p.type === 'menu').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Menu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.filter(p => p.type === 'menu').map((photo) => {
                    const photoIndex = photos.findIndex(p => p.id === photo.id);
                    return (
                      <div
                        key={photo.id}
                        className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => openLightbox(photoIndex)}
                      >
                        <img
                          src={photo.photo_url}
                          alt="Menu"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Photo Lightbox */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-7xl w-full h-[90vh] p-0 bg-black/95 border-none">
          {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Close button */}
              <button
                onClick={closeLightbox}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>

              {/* Navigation buttons */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => navigatePhoto('prev')}
                    className="absolute left-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                  <button
                    onClick={() => navigatePhoto('next')}
                    className="absolute right-4 z-50 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                </>
              )}

              {/* Photo counter */}
              <div className="absolute top-4 left-4 z-50 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
                {selectedPhotoIndex + 1} / {photos.length}
              </div>

              {/* Main image */}
              <div className="flex flex-col items-center justify-center w-full h-full p-8">
                <img
                  src={photos[selectedPhotoIndex].photo_url}
                  alt={photos[selectedPhotoIndex].type}
                  className="max-w-full max-h-full object-contain"
                />
                
                {/* Photo metadata */}
                {(photos[selectedPhotoIndex].rating > 0 || photos[selectedPhotoIndex].caption) && (
                  <div className="mt-4 max-w-2xl text-center space-y-2">
                    {photos[selectedPhotoIndex].rating > 0 && (
                      <div className="flex items-center justify-center space-x-1">
                        {Array.from({ length: photos[selectedPhotoIndex].rating }).map((_, i) => (
                          <Star key={i} className="h-5 w-5 text-accent fill-accent" />
                        ))}
                      </div>
                    )}
                    {photos[selectedPhotoIndex].caption && (
                      <p className="text-white/90 text-sm">{photos[selectedPhotoIndex].caption}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer CTA */}
      <footer className="bg-gradient-olive-teal text-white mt-12">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <img 
              src={evoqueLogo} 
              alt="Evoque" 
              className="h-16 mx-auto"
            />
            <h3 className="text-2xl font-bold">
              Part of Evoque Community!
            </h3>
            <p className="text-white/90 max-w-md mx-auto">
              Create and share your own culinary experiences, wine collections, and restaurant discoveries.
            </p>
            <Button 
              size="lg" 
              variant="secondary"
              asChild
              className="font-semibold"
            >
              <a href="https://food.evoque.guru">
                Join Evoque Community
              </a>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

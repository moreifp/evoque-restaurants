import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Star, Calendar, Users, FileText, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReceiptItemsList } from "@/components/ReceiptItemsList";

export default function SharedRestaurant() {
  const { id } = useParams();
  const [entry, setEntry] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
    fetchReceipt();
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
      .select("*")
      .eq("entry_id", id)
      .maybeSingle();

    if (data) {
      setReceipt(data);
      fetchReceiptItems(data.id);
    }
  };

  const fetchReceiptItems = async (receiptId: string) => {
    const { data } = await supabase
      .from("receipt_items")
      .select("*")
      .eq("receipt_id", receiptId)
      .order("created_at", { ascending: true });

    if (data) setReceiptItems(data);
  };

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
              <img src="/src/assets/evoque-icon.png" alt="Evoque" className="w-5 h-5" />
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
                  <div>
                    <p className="font-medium">Location</p>
                    <p className="text-muted-foreground">{entry.location_address}</p>
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

          {/* Wine Section */}
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
                  {photos.filter(p => p.type === 'wine').map((photo) => (
                    <div key={photo.id} className="space-y-3">
                      <div className="aspect-[3/4] rounded-lg overflow-hidden">
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
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Other Photos */}
          {photos.filter(p => p.type !== 'wine').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.filter(p => p.type !== 'wine').map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square rounded-lg overflow-hidden"
                    >
                      <img
                        src={photo.photo_url}
                        alt="Restaurant"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Receipt Section */}
          {receipt && (
            <Card>
              <CardHeader>
                <CardTitle>Receipt Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ReceiptItemsList items={receiptItems} />
                <div className="pt-4 border-t space-y-2">
                  {receipt.subtotal && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${parseFloat(receipt.subtotal).toFixed(2)}</span>
                    </div>
                  )}
                  {receipt.tax && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>${parseFloat(receipt.tax).toFixed(2)}</span>
                    </div>
                  )}
                  {receipt.service_fee && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Service Fee</span>
                      <span>${parseFloat(receipt.service_fee).toFixed(2)}</span>
                    </div>
                  )}
                  {receipt.total && (
                    <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                      <span>Total</span>
                      <span>${parseFloat(receipt.total).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Footer CTA */}
      <footer className="bg-gradient-olive-teal text-white mt-12">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <img 
              src="/src/assets/evoque-logo.svg" 
              alt="Evoque" 
              className="h-12 mx-auto"
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

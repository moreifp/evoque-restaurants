import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Star, Calendar, Users, FileText, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function RestaurantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [entry, setEntry] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchEntry();
      fetchPhotos();
      fetchReceipt();
    }
  }, [id]);

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
      .select("*")
      .eq("entry_id", id)
      .maybeSingle();

    if (data) setReceipt(data);
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

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navigation />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dining")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">{entry.restaurant_name}</h1>
              {entry.rating && (
                <div className="flex items-center space-x-1 mt-2">
                  <Star className="h-5 w-5 text-accent fill-accent" />
                  <span className="text-lg font-medium">{entry.rating} / 5</span>
                </div>
              )}
            </div>
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

          {/* Photos */}
          {photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className="aspect-square rounded-lg overflow-hidden">
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || "Restaurant photo"}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                      {photo.caption && (
                        <p className="text-sm text-muted-foreground mt-2">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Receipt */}
          {receipt && (
            <Card>
              <CardHeader>
                <CardTitle>Receipt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {receipt.photo_url && (
                  <img
                    src={receipt.photo_url}
                    alt="Receipt"
                    className="w-full max-w-md rounded-lg"
                  />
                )}
                {receipt.total && (
                  <div>
                    <p className="font-medium">Total</p>
                    <p className="text-2xl font-bold">
                      {receipt.currency} {receipt.total}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

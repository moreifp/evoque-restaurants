import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Star, Calendar, Users, FileText, Image as ImageIcon, Plus, Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MediaUpload } from "@/components/MediaUpload";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ReceiptItemsList } from "@/components/ReceiptItemsList";

export default function RestaurantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [entry, setEntry] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");

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
    setNotes(data.notes || "");
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

  const handleMediaUpload = async (urls: string[]) => {
    for (const url of urls) {
      const { error } = await supabase
        .from("restaurant_photos")
        .insert({
          entry_id: id,
          photo_url: url,
        });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to save photo",
          variant: "destructive",
        });
      }
    }

    toast({
      title: "Success",
      description: "Photos uploaded successfully",
    });
    
    fetchPhotos();
  };

  const handleSaveNotes = async () => {
    const { error } = await supabase
      .from("restaurant_entries")
      .update({ notes })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Notes saved successfully",
    });
    
    setEditingNotes(false);
    fetchEntry();
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

              <div className="flex items-start space-x-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">Notes</p>
                    {!editingNotes && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingNotes(true)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add your notes here..."
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveNotes}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingNotes(false);
                            setNotes(entry.notes || "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {entry.notes || "No notes yet. Click edit to add notes."}
                    </p>
                  )}
                </div>
              </div>

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
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Photos
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Photos
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Photos</DialogTitle>
                    </DialogHeader>
                    <MediaUpload onMediaUpload={handleMediaUpload} />
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {photos.filter(p => p.type !== 'wine').length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {photos.filter(p => p.type !== 'wine').map((photo) => (
                    <div key={photo.id} className="space-y-2">
                      <div className="aspect-square rounded-lg overflow-hidden">
                        <img
                          src={photo.photo_url}
                          alt={photo.caption || "Restaurant photo"}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                        />
                      </div>
                      {photo.caption && (
                        <p className="text-sm text-muted-foreground">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No photos yet. Click "Add Photos" to upload photos.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Receipt */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Receipt Details</span>
                {!receipt && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Receipt
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Upload Receipt</DialogTitle>
                      </DialogHeader>
                      <ReceiptUpload
                        entryId={id}
                        onReceiptProcessed={() => {
                          fetchReceipt();
                          toast({
                            title: "Success",
                            description: "Receipt processed successfully",
                          });
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {receipt ? (
                <div className="grid md:grid-cols-[200px,1fr] gap-6">
                  {/* Receipt Image Thumbnail */}
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

                  {/* Receipt Details */}
                  <div className="space-y-6">
                    {/* Items List */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg">Items Ordered</h3>
                      
                      {/* Fetch and display items here - we need to query receipt_items */}
                      <ReceiptItemsList receiptId={receipt.id} />
                    </div>

                    {/* Totals Summary */}
                    <div className="border-t pt-4 space-y-2">
                      {receipt.subtotal && (
                        <div className="flex justify-between text-base">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">
                            {receipt.currency} {Number(receipt.subtotal).toFixed(2)}
                          </span>
                        </div>
                      )}
                      
                      {receipt.tax && (
                        <div className="flex justify-between text-base">
                          <span className="text-muted-foreground">Tax</span>
                          <span className="font-medium">
                            {receipt.currency} {Number(receipt.tax).toFixed(2)}
                          </span>
                        </div>
                      )}
                      
                      {receipt.service_fee && (
                        <div className="flex justify-between text-base">
                          <span className="text-muted-foreground">Service Fee</span>
                          <span className="font-medium">
                            {receipt.currency} {Number(receipt.service_fee).toFixed(2)}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex justify-between text-xl font-bold pt-2 border-t">
                        <span>Total</span>
                        <span className="text-primary">
                          {receipt.currency} {Number(receipt.total).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No receipt yet. Click "Add Receipt" to upload and process a receipt.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

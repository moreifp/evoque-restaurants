import { useState, useEffect } from "react";
import { Landmark, UtensilsCrossed, Wine, Users, Receipt, X, Sparkles, Star, Plus, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { extractGPSFromImage } from "@/utils/exifExtractor";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UploadedFile {
  file: File;
  preview: string;
  category: 'place' | 'food' | 'friends' | 'wine' | 'menu' | 'receipt';
  url?: string;
  wineInfo?: any;
  caption?: string;
  rating?: number;
  receiptData?: any;
}

interface UnifiedMediaUploadProps {
  entryId?: string; // Pass when editing existing restaurant for autosave
  initialUploadData?: {
    place: string[];
    food: string[];
    friends: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    menu: string[];
    receipt: any | null;
  };
  onUploadsChange: (data: {
    place: string[];
    food: string[];
    friends: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    menu: string[];
    receipt: any | null;
  }) => void;
  onLocationExtracted?: (location: { lat: number; lng: number; address: string }) => void;
  onPhotoSaved?: (photoData: { url: string; type: string }) => void; // Callback when photo is saved to DB
}

export function UnifiedMediaUpload({ entryId, initialUploadData, onUploadsChange, onLocationExtracted, onPhotoSaved }: UnifiedMediaUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingWine, setProcessingWine] = useState<string | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [lastCategory, setLastCategory] = useState<keyof typeof categoryConfig | null>(null);
  const [initialized, setInitialized] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  // Initialize from saved upload data (for draft restoration)
  useEffect(() => {
    if (initialUploadData && !initialized) {
      const restoredFiles: UploadedFile[] = [];
      
      // Restore place photos
      initialUploadData.place.forEach(url => {
        restoredFiles.push({
          file: new File([], 'restored'), // Placeholder file
          preview: url,
          category: 'place',
          url,
        });
      });
      
      // Restore food photos
      initialUploadData.food.forEach(url => {
        restoredFiles.push({
          file: new File([], 'restored'),
          preview: url,
          category: 'food',
          url,
        });
      });
      
      // Restore friends photos
      initialUploadData.friends.forEach(url => {
        restoredFiles.push({
          file: new File([], 'restored'),
          preview: url,
          category: 'friends',
          url,
        });
      });
      
      // Restore wine photos
      initialUploadData.wine.forEach(wine => {
        restoredFiles.push({
          file: new File([], 'restored'),
          preview: wine.url,
          category: 'wine',
          url: wine.url,
          caption: wine.caption,
          rating: wine.rating,
          wineInfo: wine.wineInfo,
        });
      });
      
      // Restore menu photos
      initialUploadData.menu.forEach(url => {
        restoredFiles.push({
          file: new File([], 'restored'),
          preview: url,
          category: 'menu',
          url,
        });
      });
      
      // Restore receipt
      if (initialUploadData.receipt) {
        restoredFiles.push({
          file: new File([], 'restored'),
          preview: initialUploadData.receipt.photo_url,
          category: 'receipt',
          url: initialUploadData.receipt.photo_url,
          receiptData: initialUploadData.receipt,
        });
      }
      
      if (restoredFiles.length > 0) {
        setFiles(restoredFiles);
      }
      setInitialized(true);
    }
  }, [initialUploadData, initialized]);

  // Update parent whenever files change
  const updateParent = () => {
    const currentData = {
      place: [] as string[],
      food: [] as string[],
      friends: [] as string[],
      wine: [] as Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>,
      menu: [] as string[],
      receipt: null as any,
    };

    files.forEach(fileData => {
      if (fileData.url) {
        if (fileData.category === 'wine') {
          currentData.wine.push({
            url: fileData.url,
            caption: fileData.caption || '',
            rating: fileData.rating,
            wineInfo: fileData.wineInfo,
          });
        } else if (fileData.category === 'receipt') {
          currentData.receipt = fileData.receiptData;
        } else if (fileData.category === 'place' || fileData.category === 'food' || fileData.category === 'friends' || fileData.category === 'menu') {
          currentData[fileData.category].push(fileData.url);
        }
      }
    });

    onUploadsChange(currentData);
  };

  const categoryConfig = {
    place: { icon: Landmark, label: t("unifiedMediaUpload.categories.place"), color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    food: { icon: Utensils, label: t("unifiedMediaUpload.categories.food"), color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    friends: { icon: Users, label: t("unifiedMediaUpload.categories.friends"), color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    wine: { icon: Wine, label: t("unifiedMediaUpload.categories.wine"), color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    menu: { icon: UtensilsCrossed, label: t("unifiedMediaUpload.categories.menu"), color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    receipt: { icon: Receipt, label: t("unifiedMediaUpload.categories.receipt"), color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
  };

  const handleFileSelect = async (category: keyof typeof categoryConfig, useCamera = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = category === 'receipt' ? 'image/*' : 'image/*,video/*';
    input.multiple = category !== 'receipt';
    if (useCamera) {
      input.capture = 'environment'; // Opens camera directly on mobile
    }
    
    input.onchange = async (e) => {
      const selectedFiles = Array.from((e.target as HTMLInputElement).files || []);
      
      if (selectedFiles.length === 0) return;
      
      const newFiles: UploadedFile[] = selectedFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        category,
      }));
      
      setFiles(prev => [...prev, ...newFiles]);
      
      // Show immediate visual confirmation when photo is captured from camera
      if (useCamera && newFiles.length > 0) {
        const firstFile = newFiles[0];
        toast({
          title: "📸 Foto capturada!",
          description: (
            <div className="flex items-center gap-3 mt-2">
              <img 
                src={firstFile.preview} 
                alt="Preview" 
                className="w-16 h-16 rounded-lg object-cover border border-border shadow-sm"
              />
              <span className="text-sm text-muted-foreground">
                Enviando {categoryConfig[category].label.toLowerCase()}...
              </span>
            </div>
          ),
        });
      }
      
      // Show dialog only when using camera (library already allows multiple selection)
      if (useCamera) {
        setLastCategory(category);
        setShowAddMoreDialog(true);
      }
      
      // Process in background
      if (category === 'receipt' && newFiles.length > 0) {
        processReceipt(newFiles[0]);
      } else {
        autoUploadFiles(newFiles);
      }
    };
    
    input.click();
  };

  const processReceipt = async (fileData: UploadedFile) => {
    setProcessingReceipt(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const user = session.user;

      const fileName = `receipts/${user.id}/${Date.now()}_${fileData.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("restaurant-photos")
        .upload(fileName, fileData.file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("restaurant-photos")
        .getPublicUrl(fileName);

      const { data: resp, error: functionError } = await supabase.functions.invoke(
        "process-receipt",
        {
          body: { imageUrl: publicUrl },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      // Check for errors in response body (edge function may return error in data)
      if (functionError) {
        console.error('Receipt function error:', functionError);
        throw new Error(functionError.message || 'Failed to process receipt');
      }
      
      // Check if response contains an error field
      if (resp?.error) {
        console.error('Receipt processing error:', resp.error);
        throw new Error(resp.error);
      }

      const extracted = resp?.data ?? resp; // normalize shape from edge function

      // If entryId exists, save receipt immediately to DB
      if (entryId) {
        const { data: newReceipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            entry_id: entryId,
            photo_url: publicUrl,
            subtotal: extracted.subtotal,
            tax: extracted.tax,
            service_fee: extracted.service_fee,
            total: extracted.total,
            currency: extracted.currency,
          })
          .select()
          .single();

        if (receiptError) {
          console.error('Error saving receipt to database:', receiptError);
          throw receiptError;
        }

        // Save receipt items
        if (extracted.items && extracted.items.length > 0) {
          const itemsToInsert = extracted.items.map((item: any) => ({
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

          if (itemsError) {
            console.error('Error saving receipt items:', itemsError);
            throw itemsError;
          }
        }

        // Notify parent that receipt was saved
        onPhotoSaved?.({ url: publicUrl, type: 'receipt' });

        toast({
          title: "✅ Recibo salvo",
          description: extracted.total 
            ? `Total: ${extracted.currency || 'USD'} ${extracted.total}`
            : t("unifiedMediaUpload.toasts.receiptSuccess"),
        });
      }

      setFiles(prev => {
        const updated = prev.map(f => 
          f.preview === fileData.preview 
            ? { ...f, receiptData: { ...extracted, photo_url: publicUrl }, url: publicUrl }
            : f
        );
        setTimeout(updateParent, 0);
        return updated;
      });

      if (!entryId) {
        toast({
          title: "✅ " + t("unifiedMediaUpload.toasts.receiptProcessed"),
          description: extracted.total 
            ? `${t("unifiedMediaUpload.toasts.receiptSuccess")} - Total: ${extracted.currency || 'USD'} ${extracted.total}`
            : t("unifiedMediaUpload.toasts.receiptSuccess"),
        });
      }
    } catch (error: any) {
      toast({
        title: t("unifiedMediaUpload.toasts.receiptError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingReceipt(false);
    }
  };

  const analyzeWineLabel = async (fileData: UploadedFile) => {
    setProcessingWine(fileData.preview);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const user = session.user;

      const fileName = `wines/${user.id}/${Date.now()}_${fileData.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("restaurant-photos")
        .upload(fileName, fileData.file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("restaurant-photos")
        .getPublicUrl(fileName);

      const { data: resp, error: functionError } = await supabase.functions.invoke(
        "analyze-wine-label",
        {
          body: { imageUrl: publicUrl },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      // Check for errors in response body
      if (functionError) {
        console.error('Wine analysis function error:', functionError);
        throw new Error(functionError.message || 'Failed to analyze wine label');
      }
      
      // Check if response contains an error field
      if (resp?.error) {
        console.error('Wine analysis error:', resp.error);
        throw new Error(resp.error);
      }

      const extractedWineInfo = resp?.wineInfo ?? null; // normalize shape
      const wineCaption = extractedWineInfo ? `${extractedWineInfo.name || ''} ${extractedWineInfo.vintage || ''}`.trim() : '';

      // If entryId exists, save wine photo immediately to DB
      if (entryId) {
        const { error: dbError } = await supabase
          .from("restaurant_photos")
          .insert({
            entry_id: entryId,
            photo_url: publicUrl,
            type: 'wine',
            caption: wineCaption,
            rating: null,
          });

        if (dbError) {
          console.error('Error saving wine photo to database:', dbError);
          throw dbError;
        }

        // Notify parent that photo was saved
        onPhotoSaved?.({ url: publicUrl, type: 'wine' });

        toast({
          title: "✅ Vinho salvo",
          description: t("unifiedMediaUpload.toasts.wineRecognized") + (extractedWineInfo?.name ? `: ${extractedWineInfo.name}` : ''),
        });
      }

      setFiles(prev => {
        const updated = prev.map(f => 
          f.preview === fileData.preview 
            ? { 
                ...f, 
                wineInfo: extractedWineInfo,
                caption: wineCaption, 
                url: publicUrl 
              }
            : f
        );
        setTimeout(updateParent, 0);
        return updated;
      });

      if (!entryId) {
        toast({
          title: t("unifiedMediaUpload.toasts.wineRecognized"),
          description: extractedWineInfo?.name || t("unifiedMediaUpload.toasts.wineInfo"),
        });
      }
    } catch (error: any) {
      toast({
        title: t("unifiedMediaUpload.toasts.wineError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingWine(null);
    }
  };

  const removeFile = async (preview: string) => {
    const fileToRemove = files.find(f => f.preview === preview);
    
    // If editing existing entry and file has a URL, delete from database
    if (entryId && fileToRemove?.url) {
      try {
        if (fileToRemove.category === 'receipt') {
          // Delete receipt and its items from database
          const { error } = await supabase
            .from("receipts")
            .delete()
            .eq("entry_id", entryId)
            .eq("photo_url", fileToRemove.url);
          
          if (error) {
            console.error('Error deleting receipt:', error);
            toast({
              title: t("common.error"),
              description: "Failed to delete receipt",
              variant: "destructive",
            });
            return;
          }
        } else {
          // Delete photo from restaurant_photos table
          const { error } = await supabase
            .from("restaurant_photos")
            .delete()
            .eq("entry_id", entryId)
            .eq("photo_url", fileToRemove.url);
          
          if (error) {
            console.error('Error deleting photo:', error);
            toast({
              title: t("common.error"),
              description: "Failed to delete photo",
              variant: "destructive",
            });
            return;
          }
        }
        
        toast({
          title: "✅ " + t("common.deleted"),
          description: t("unifiedMediaUpload.toasts.photoDeleted") || "Photo removed successfully",
        });
        
        // Notify parent to refresh
        onPhotoSaved?.({ url: fileToRemove.url, type: 'deleted' });
      } catch (error: any) {
        console.error('Error deleting file:', error);
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }
    
    setFiles(prev => prev.filter(f => f.preview !== preview));
    URL.revokeObjectURL(preview);
    setTimeout(updateParent, 0);
  };

  const updateWineRating = (preview: string, rating: number) => {
    setFiles(prev => {
      const updated = prev.map(f => 
        f.preview === preview ? { ...f, rating } : f
      );
      setTimeout(updateParent, 0);
      return updated;
    });
  };

  const updateWineCaption = (preview: string, caption: string) => {
    setFiles(prev => {
      const updated = prev.map(f => 
        f.preview === preview ? { ...f, caption } : f
      );
      setTimeout(updateParent, 0);
      return updated;
    });
  };

  const autoUploadFiles = async (newFiles: UploadedFile[]) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      for (const fileData of newFiles) {
        const fileName = `${fileData.category}/${user.id}/${Date.now()}_${fileData.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("restaurant-photos")
          .upload(fileName, fileData.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("restaurant-photos")
          .getPublicUrl(fileName);

        // If entryId exists (editing existing restaurant), save immediately to DB
        if (entryId) {
          const photoType = fileData.category === 'menu' ? 'menu' :
                           fileData.category === 'food' ? 'food' :
                           fileData.category === 'wine' ? 'wine' :
                           fileData.category === 'friends' ? 'friends' :
                           'restaurant_photo';

          const { error: dbError } = await supabase
            .from("restaurant_photos")
            .insert({
              entry_id: entryId,
              photo_url: publicUrl,
              type: photoType,
            });

          if (dbError) {
            console.error('Error saving photo to database:', dbError);
            throw dbError;
          }

          // Notify parent that photo was saved
          onPhotoSaved?.({ url: publicUrl, type: photoType });

          // Show individual success toast
          toast({
            title: "✅ Foto salva",
            description: `${categoryConfig[fileData.category].label} adicionada com sucesso`,
          });
        }

        // Update file with URL in local state and notify parent immediately
        setFiles(prev => {
          const updated = prev.map(f => 
            f.preview === fileData.preview ? { ...f, url: publicUrl } : f
          );
          // Call updateParent in next tick with updated state
          setTimeout(() => {
            onUploadsChange({
              place: updated.filter(f => f.category === 'place' && f.url).map(f => f.url!),
              food: updated.filter(f => f.category === 'food' && f.url).map(f => f.url!),
              friends: updated.filter(f => f.category === 'friends' && f.url).map(f => f.url!),
              wine: updated.filter(f => f.category === 'wine' && f.url).map(f => ({
                url: f.url!,
                caption: f.caption || '',
                rating: f.rating,
                wineInfo: f.wineInfo,
              })),
              menu: updated.filter(f => f.category === 'menu' && f.url).map(f => f.url!),
              receipt: updated.find(f => f.category === 'receipt')?.receiptData || null,
            });
          }, 0);
          return updated;
        });
      }
      
      // Show final toast only if NOT editing (no entryId)
      if (!entryId) {
        toast({
          title: t("unifiedMediaUpload.toasts.filesUploaded"),
          description: t("unifiedMediaUpload.toasts.filesSuccess").replace("{count}", newFiles.length.toString()),
        });
      }
    } catch (error: any) {
      toast({
        title: t("unifiedMediaUpload.toasts.uploadFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-[#0d1a2d]">{t("unifiedMediaUpload.title")}</h2>
        <p className="text-lg text-muted-foreground">{t("unifiedMediaUpload.subtitle")}</p>
      </div>

      {/* Category Buttons Grid */}
      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        {(Object.keys(categoryConfig) as Array<keyof typeof categoryConfig>).map((category) => {
          const config = categoryConfig[category];
          const Icon = config.icon;
          return (
            <button
              key={category}
              type="button"
              onClick={() => handleFileSelect(category)}
              className="flex flex-col items-center justify-center h-40 rounded-2xl border-2 transition-all hover:border-[#0d1a2d] hover:shadow-lg bg-background"
              style={{ borderColor: 'rgba(13, 26, 45, 0.12)' }}
            >
              <div className={`bg-gradient-to-br ${config.color} p-4 rounded-xl mb-3`}>
                <Icon className="h-8 w-8 text-white" />
              </div>
              <span className="font-semibold text-[#0d1a2d]">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Add More Photos Dialog */}
      <AlertDialog open={showAddMoreDialog} onOpenChange={setShowAddMoreDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-2xl">{t("unifiedMediaUpload.addMoreDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base">
              {t("unifiedMediaUpload.addMoreDialog.description").replace("{category}", lastCategory ? categoryConfig[lastCategory].label.toLowerCase() : "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-col gap-3 mt-4">
            <Button
              size="lg"
              className="w-full h-16 text-lg font-semibold bg-navy hover:bg-navy/90 text-white"
              onClick={() => {
                setShowAddMoreDialog(false);
                if (lastCategory) {
                  setTimeout(() => handleFileSelect(lastCategory, true), 100);
                }
              }}
            >
              <Plus className="h-6 w-6 mr-2" />
              {t("unifiedMediaUpload.addMoreDialog.addMore")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full h-16 text-lg font-semibold bg-wine-red hover:bg-wine-red/90 text-white border-wine-red"
              onClick={() => setShowAddMoreDialog(false)}
            >
              <X className="h-6 w-6 mr-2" />
              {t("unifiedMediaUpload.addMoreDialog.done")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wine Section - Must come first to show rating/notes */}
      {files.some(f => f.category === 'wine') && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wine className="h-5 w-5" />
              {t("unifiedMediaUpload.wine.collectionTitle")} ({files.filter(f => f.category === 'wine').length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {files.filter(f => f.category === 'wine').map((file, index) => (
              <div key={file.preview}>
                {index > 0 && <Separator className="my-6" />}
                <div className="space-y-4">
                  <div className="flex gap-4">
                    {/* Wine Image */}
                    <div className="relative group w-32 h-32 flex-shrink-0">
                      <div className="w-full h-full rounded-lg overflow-hidden bg-muted">
                        <img src={file.preview} alt="" className="w-full h-full object-cover" />
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeFile(file.preview)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Wine Details */}
                    <div className="flex-1 space-y-3">
                      {!file.wineInfo ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => analyzeWineLabel(file)}
                          disabled={processingWine === file.preview}
                          className="w-full"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          {processingWine === file.preview ? t("unifiedMediaUpload.wine.analyzing") : t("unifiedMediaUpload.wine.recognize")}
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-sm space-y-1">
                            {(file.wineInfo?.name ?? file.wineInfo?.wineInfo?.name) && (
                              <p className="font-semibold text-base">{file.wineInfo?.name ?? file.wineInfo?.wineInfo?.name}</p>
                            )}
                            {(file.wineInfo?.vintage ?? file.wineInfo?.wineInfo?.vintage) && (
                              <p className="text-muted-foreground">{t("unifiedMediaUpload.wine.vintage")} {file.wineInfo?.vintage ?? file.wineInfo?.wineInfo?.vintage}</p>
                            )}
                            {(file.wineInfo?.region ?? file.wineInfo?.wineInfo?.region) && (
                              <p className="text-muted-foreground">{t("unifiedMediaUpload.wine.region")} {file.wineInfo?.region ?? file.wineInfo?.wineInfo?.region}</p>
                            )}
                            {(file.wineInfo?.type ?? file.wineInfo?.wineInfo?.type) && (
                              <p className="text-muted-foreground">{t("unifiedMediaUpload.wine.type")} {file.wineInfo?.type ?? file.wineInfo?.wineInfo?.type}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Wine Rating */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{t("unifiedMediaUpload.wine.rating")}</p>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => updateWineRating(file.preview, star)}
                              className="transition-transform hover:scale-110"
                            >
                              <Star
                                className={cn(
                                  "h-6 w-6 transition-colors",
                                  star <= (file.rating || 0)
                                    ? "text-accent fill-accent"
                                    : "text-muted-foreground"
                                )}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tasting Notes */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("unifiedMediaUpload.wine.tastingNotes")}</label>
                    <Textarea
                      placeholder={t("wineUpload.tastingPlaceholder")}
                      value={file.caption || ''}
                      onChange={(e) => updateWineCaption(file.preview, e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Receipt Section */}
      {files.some(f => f.category === 'receipt') && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Receipt Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {files.filter(f => f.category === 'receipt').map((file) => (
              <div key={file.preview} className="space-y-4">
                {/* Receipt Image */}
                <div className="relative group w-full max-w-sm mx-auto">
                  <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted">
                    <img src={file.preview} alt="Receipt" className="w-full h-full object-contain" />
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeFile(file.preview)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  
                  {processingReceipt && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                      <div className="text-center space-y-2">
                        <Sparkles className="h-8 w-8 mx-auto animate-pulse" />
                        <p className="text-sm font-medium">Processing receipt...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Processed Receipt Data */}
                {file.receiptData && (
                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg border-2 border-green-500/30">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-lg">Extracted Information</h4>
                      <Badge className="bg-green-100 text-green-800 border-green-300">
                        ✅ Processed
                      </Badge>
                    </div>
                    
                      {(file.receiptData?.items || file.receiptData?.data?.items)?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Items</p>
                          <div className="space-y-1">
                            {(file.receiptData.items || file.receiptData.data?.items).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span>
                                  {item.name} 
                                  {item.quantity > 1 && ` (×${item.quantity})`}
                                </span>
                                <span className="font-medium">
                                  {(file.receiptData.currency || file.receiptData.data?.currency || '$')}{item.line_total?.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    <Separator />

                    {/* Totals */}
                    <div className="space-y-2">
                      {file.receiptData.subtotal && (
                        <div className="flex justify-between text-sm">
                          <span>Subtotal</span>
                          <span>{file.receiptData.currency || '$'}{file.receiptData.subtotal.toFixed(2)}</span>
                        </div>
                      )}
                      {file.receiptData.tax && (
                        <div className="flex justify-between text-sm">
                          <span>Tax</span>
                          <span>{file.receiptData.currency || '$'}{file.receiptData.tax.toFixed(2)}</span>
                        </div>
                      )}
                      {file.receiptData.service_fee && (
                        <div className="flex justify-between text-sm">
                          <span>Service Fee</span>
                          <span>{file.receiptData.currency || '$'}{file.receiptData.service_fee.toFixed(2)}</span>
                        </div>
                      )}
                      {file.receiptData.total && (
                        <div className="flex justify-between text-base font-semibold pt-2 border-t">
                          <span>Total</span>
                          <span>{file.receiptData.currency || '$'}{file.receiptData.total.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Regular Uploaded Files Grid (Place, Menu, Friends) */}
      {files.filter(f => !['wine', 'receipt'].includes(f.category)).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Other Photos ({files.filter(f => !['wine', 'receipt'].includes(f.category)).length})</h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {files.filter(f => !['wine', 'receipt'].includes(f.category)).map((file) => (
              <div key={file.preview} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                  {file.file.type.startsWith('video/') ? (
                    <video src={file.preview} className="w-full h-full object-cover" />
                  ) : (
                    <img src={file.preview} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                
                <Badge className="absolute top-2 left-2 capitalize">
                  {file.category}
                </Badge>
                
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFile(file.preview)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

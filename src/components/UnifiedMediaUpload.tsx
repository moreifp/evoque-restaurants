import { useState, useEffect } from "react";
import { Landmark, UtensilsCrossed, Wine, Users, Receipt, X, Sparkles, Star, Plus, Utensils, Loader2, Camera, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
// GPS extraction can be re-enabled if needed for location auto-fill
// import { extractGPSFromImage } from "@/utils/exifExtractor";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { compressVideoSafe, formatFileSize, CompressionProgress } from "@/utils/videoCompressor";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDespia } from "@/contexts/DespiaContext";
import { useNativeCamera } from "@/hooks/useNativeCamera";
import { useUploadWithRetry } from "@/hooks/useUploadWithRetry";
import { useAIConsent } from "@/hooks/useAIConsent";

interface UploadedFile {
  file: File;
  preview: string;
  category: 'place' | 'food' | 'friends' | 'wine' | 'menu' | 'receipt';
  url?: string;
  wineInfo?: any;
  caption?: string;
  rating?: number;
  receiptData?: any;
  menuTranslation?: string;
}

interface UnifiedMediaUploadProps {
  entryId?: string; // Pass when editing existing restaurant for autosave
  /**
   * When creating a new restaurant, called lazily right before the first upload
   * to obtain (or create) a draft entryId so each photo can be persisted to DB
   * immediately. Avoids losing photos if the WebView refreshes/suspends.
   */
  onRequestEntryId?: () => Promise<string | null>;
  initialUploadData?: {
    place: string[];
    food: string[];
    friends: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    menu: Array<{ url: string; translation?: string }>;
    receipt: any | null;
  };
  onUploadsChange: (data: {
    place: string[];
    food: string[];
    friends: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    menu: Array<{ url: string; translation?: string }>;
    receipt: any | null;
  }) => void;
  onLocationExtracted?: (location: { lat: number; lng: number; address: string }) => void;
  onPhotoSaved?: (photoData: { url: string; type: string }) => void; // Callback when photo is saved to DB
}

// File size limits
const FILE_LIMITS = {
  IMAGE_MAX_SIZE_MB: 10,      // 10 MB per image
  VIDEO_MAX_SIZE_MB: 50,      // 50 MB per video
  TOTAL_BATCH_SIZE_MB: 100,   // 100 MB total per upload batch
};

interface RejectedFile {
  name: string;
  reason: string;
}

interface ValidationResult {
  validFiles: File[];
  rejectedFiles: RejectedFile[];
  totalValidSize: number;
}

const validateFiles = (files: File[], t: (key: string, params?: Record<string, string | number>) => string): ValidationResult => {
  const validFiles: File[] = [];
  const rejectedFiles: RejectedFile[] = [];
  let totalValidSize = 0;

  for (const file of files) {
    const sizeMB = file.size / (1024 * 1024);
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const maxSize = isVideo ? FILE_LIMITS.VIDEO_MAX_SIZE_MB : FILE_LIMITS.IMAGE_MAX_SIZE_MB;

    if (isVideo && sizeMB > FILE_LIMITS.VIDEO_MAX_SIZE_MB) {
      rejectedFiles.push({
        name: file.name,
        reason: t('unifiedMediaUpload.fileLimits.videoTooLarge', { size: FILE_LIMITS.VIDEO_MAX_SIZE_MB }),
      });
    } else if (isImage && sizeMB > FILE_LIMITS.IMAGE_MAX_SIZE_MB) {
      rejectedFiles.push({
        name: file.name,
        reason: t('unifiedMediaUpload.fileLimits.imageTooLarge', { size: FILE_LIMITS.IMAGE_MAX_SIZE_MB }),
      });
    } else if (totalValidSize + sizeMB > FILE_LIMITS.TOTAL_BATCH_SIZE_MB) {
      rejectedFiles.push({
        name: file.name,
        reason: t('unifiedMediaUpload.fileLimits.batchLimitExceeded', { size: FILE_LIMITS.TOTAL_BATCH_SIZE_MB }),
      });
    } else {
      validFiles.push(file);
      totalValidSize += sizeMB;
    }
  }

  return { validFiles, rejectedFiles, totalValidSize };
};

// Language options for menu translation
const LANGUAGE_OPTIONS = [
  { value: "Portuguese", label: "Português" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Español" },
  { value: "French", label: "Français" },
  { value: "Italian", label: "Italiano" },
  { value: "German", label: "Deutsch" },
  { value: "Japanese", label: "日本語" },
  { value: "Chinese", label: "中文" },
];

export function UnifiedMediaUpload({ entryId, onRequestEntryId, initialUploadData, onUploadsChange, onLocationExtracted, onPhotoSaved }: UnifiedMediaUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingWine, setProcessingWine] = useState<string | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [translatingMenuPreview, setTranslatingMenuPreview] = useState<string | null>(null);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [lastCategory, setLastCategory] = useState<keyof typeof categoryConfig | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([]);
  const [pendingValidFiles, setPendingValidFiles] = useState<{ files: UploadedFile[]; category: keyof typeof categoryConfig; useCamera: boolean } | null>(null);
  const [compressingVideo, setCompressingVideo] = useState<string | null>(null);
  const [compressionProgress, setCompressionProgress] = useState<CompressionProgress | null>(null);
  // Source selection dialog for native iOS (to bypass "Scan Document" option)
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [sourceCategory, setSourceCategory] = useState<keyof typeof categoryConfig | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
  
  // Native camera - only active on iOS app
  const { isNative } = useDespia();
  // Note: Native camera hook is kept for potential future Despia SDK updates
  // Currently always returns isAvailable: false since Despia doesn't expose camera APIs
  const _nativeCamera = useNativeCamera(); // Prefixed with _ to indicate intentionally unused
  const { uploadWithRetry, logUploadError } = useUploadWithRetry();
  const { ensureAIConsent } = useAIConsent();

  /**
   * Returns an entryId to persist photos against. If we already have one
   * (edit mode) use it directly; otherwise ask the parent to create/return
   * a draft entry so each photo is saved to DB immediately on upload.
   */
  const resolveEntryId = async (): Promise<string | null> => {
    if (entryId) return entryId;
    if (onRequestEntryId) {
      try {
        return await onRequestEntryId();
      } catch (e) {
        console.error('[UnifiedMediaUpload] onRequestEntryId failed:', e);
        return null;
      }
    }
    return null;
  };

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
      initialUploadData.menu.forEach(menu => {
        const menuData = typeof menu === 'string' ? { url: menu } : menu;
        restoredFiles.push({
          file: new File([], 'restored'),
          preview: menuData.url,
          category: 'menu',
          url: menuData.url,
          menuTranslation: menuData.translation,
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
      menu: [] as Array<{ url: string; translation?: string }>,
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
        } else if (fileData.category === 'menu') {
          currentData.menu.push({
            url: fileData.url,
            translation: fileData.menuTranslation,
          });
        } else if (fileData.category === 'place' || fileData.category === 'food' || fileData.category === 'friends') {
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

  // Log environment info for debugging (especially useful in TestFlight)
  console.log('[UnifiedMediaUpload] Environment:', {
    userAgent: navigator.userAgent,
    isDespia: navigator.userAgent.includes('despia'),
    isNative,
    platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'other'
  });

  // Handle category button tap - on iOS (Despia), show source dialog for better UX
  // This allows users to choose between Camera and Photo Library without iOS's default "Scan Document" option
  const handleCategoryTap = (category: keyof typeof categoryConfig) => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOSDevice) {
      // Show our custom dialog with only Camera and Photo Library options
      setSourceCategory(category);
      setShowSourceDialog(true);
    } else {
      // Desktop/Android - go directly to file picker
      handleFileSelect(category);
    }
  };

  // Handle file selection using standard web APIs
  // This works reliably in iOS WebView (Despia) with capture attribute for camera
  const handleFileSelect = async (category: keyof typeof categoryConfig, useCamera = false) => {
    console.log('[UnifiedMediaUpload] handleFileSelect:', { category, useCamera });
    
    // Create standard web file input
    // IMPORTANT: Attach to DOM before .click() to prevent iOS WebView from
    // garbage-collecting the element when the camera app opens in foreground
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = category === 'receipt' ? 'image/*' : 'image/*,video/*';
    input.multiple = category !== 'receipt';
    input.style.display = 'none';
    
    // The capture attribute triggers the native iOS camera when set
    if (useCamera) {
      input.capture = 'environment'; // Opens rear camera directly on iOS
      console.log('[UnifiedMediaUpload] Using camera capture mode');
    }

    // Cleanup helper — removes input from DOM safely
    const cleanup = () => {
      try {
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      } catch (e) {
        console.warn('[UnifiedMediaUpload] cleanup error:', e);
      }
    };

    // Safety net: only remove the input if it remains forgotten in the DOM for a long time.
    // We intentionally do NOT use a focus-based cancel listener because on iOS WebView
    // the WebView regains focus BEFORE onchange fires, and removing the input mid-flight
    // causes the file to be silently lost when processing the photo takes >500ms.
    const safetyTimer = setTimeout(() => {
      if (document.body.contains(input)) {
        console.warn('[UnifiedMediaUpload] Safety cleanup of stale file input (5min)');
        cleanup();
      }
    }, 5 * 60 * 1000);

    input.onchange = async (e) => {
      clearTimeout(safetyTimer);

      const selectedFiles = Array.from((e.target as HTMLInputElement).files || []);

      // Diagnostic logging for iOS camera debugging
      console.log('[UnifiedMediaUpload] onchange fired, files:', selectedFiles.length, selectedFiles.map(f => ({
        name: f.name, type: f.type, size: f.size
      })));

      // Remove input from DOM now that we have the files (or confirmed cancellation)
      cleanup();

      if (selectedFiles.length === 0) {
        console.log('[UnifiedMediaUpload] User cancelled file selection (empty files list)');
        return;
      }

      // Validate file sizes
      const { validFiles, rejectedFiles: rejected, totalValidSize } = validateFiles(selectedFiles, t);

      // If some files were rejected, show dialog
      if (rejected.length > 0) {
        setRejectedFiles(rejected);
        
        if (validFiles.length > 0) {
          // Some files are valid, prepare them for pending upload
          const newFiles: UploadedFile[] = validFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            category,
          }));
          setPendingValidFiles({ files: newFiles, category, useCamera });
          setShowRejectionDialog(true);
        } else {
          // No valid files at all
          setShowRejectionDialog(true);
          setPendingValidFiles(null);
        }
        return;
      }

      // All files are valid, proceed normally
      const newFiles: UploadedFile[] = validFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        category,
      }));
      
      proceedWithUpload(newFiles, category, useCamera);
    };
    
    // Attach to DOM BEFORE clicking — prevents iOS WebView GC
    document.body.appendChild(input);
    input.click();
  };

  const proceedWithUpload = (newFiles: UploadedFile[], category: keyof typeof categoryConfig, useCamera: boolean) => {
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

  const handleContinueWithValid = () => {
    setShowRejectionDialog(false);
    if (pendingValidFiles) {
      proceedWithUpload(pendingValidFiles.files, pendingValidFiles.category, pendingValidFiles.useCamera);
      setPendingValidFiles(null);
    }
    setRejectedFiles([]);
  };

  const handleCancelRejection = () => {
    setShowRejectionDialog(false);
    // Clean up previews for pending files
    if (pendingValidFiles) {
      pendingValidFiles.files.forEach(f => URL.revokeObjectURL(f.preview));
    }
    setPendingValidFiles(null);
    setRejectedFiles([]);
  };

  const processReceipt = async (fileData: UploadedFile) => {
    const allowed = await ensureAIConsent("invoice_transcription");
    if (!allowed) return;
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

      // Resolve effective entryId (creates draft if needed for new-restaurant flow)
      const effectiveEntryId = await resolveEntryId();

      // If we have an entryId, save receipt immediately to DB
      if (effectiveEntryId) {
        const { data: newReceipt, error: receiptError } = await supabase
          .from("receipts")
          .insert({
            entry_id: effectiveEntryId,
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

      if (!effectiveEntryId) {
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
    const allowed = await ensureAIConsent("wine_recognition");
    if (!allowed) return;
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

      // Resolve effective entryId (creates draft if needed for new-restaurant flow)
      const effectiveEntryId = await resolveEntryId();

      // If we have an entryId, save wine photo immediately to DB
      if (effectiveEntryId) {
        const { error: dbError } = await supabase
          .from("restaurant_photos")
          .insert({
            entry_id: effectiveEntryId,
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

      if (!effectiveEntryId) {
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

  // Translate menu photo using AI
  const handleTranslateMenuLocal = async (filePreview: string, targetLanguage: string) => {
    const allowed = await ensureAIConsent("menu_translation");
    if (!allowed) return;
    const file = files.find(f => f.preview === filePreview);
    if (!file || !file.url) {
      toast({
        title: t("common.error"),
        description: "Photo not uploaded yet",
        variant: "destructive",
      });
      return;
    }

    setTranslatingMenuPreview(filePreview);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const { data: resp, error: functionError } = await supabase.functions.invoke(
        "translate-menu",
        {
          body: { 
            imageUrl: file.url, 
            targetLanguage,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (functionError) {
        console.error('Menu translation error:', functionError);
        throw new Error(functionError.message || 'Failed to translate menu');
      }

      if (resp?.error) {
        console.error('Translation error:', resp.error);
        throw new Error(resp.error);
      }

      const translation = resp?.translation;
      if (!translation) {
        throw new Error('No translation returned');
      }

      // Update file with translation in local state
      setFiles(prev => {
        const updated = prev.map(f => 
          f.preview === filePreview ? { ...f, menuTranslation: translation } : f
        );
        setTimeout(updateParent, 0);
        return updated;
      });

      toast({
        title: t("unifiedMediaUpload.toasts.menuTranslated"),
        description: t("unifiedMediaUpload.toasts.menuTranslationSaved"),
      });
    } catch (error: any) {
      console.error('Error translating menu:', error);
      toast({
        title: t("unifiedMediaUpload.toasts.menuTranslationError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTranslatingMenuPreview(null);
    }
  };

  const autoUploadFiles = async (newFiles: UploadedFile[]) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let successCount = 0;
      let failCount = 0;

      for (const fileData of newFiles) {
        let fileToUpload = fileData.file;
        
        // Compress video files before upload
        if (fileData.file.type.startsWith('video/')) {
          setCompressingVideo(fileData.preview);
          setCompressionProgress({ stage: 'loading', progress: 0 });
          
          try {
            const { file: compressedFile, wasCompressed, stats } = await compressVideoSafe(
              fileData.file,
              (progress) => setCompressionProgress(progress)
            );
            
            fileToUpload = compressedFile;
            
            if (wasCompressed && stats) {
              toast({
                title: "🎬 Video compressed",
                description: `${formatFileSize(stats.originalSize)} → ${formatFileSize(stats.compressedSize)} (${Math.round((1 - 1/stats.compressionRatio) * 100)}% smaller)`,
              });
            }
          } catch (error) {
            console.error('Video compression failed:', error);
            // Continue with original file
          } finally {
            setCompressingVideo(null);
            setCompressionProgress(null);
          }
        }
        
        const fileName = `${fileData.category}/${user.id}/${Date.now()}_${fileToUpload.name}`;
        
        // Use upload with retry for more reliable uploads
        const uploadResult = await uploadWithRetry({
          bucket: "restaurant-photos",
          filePath: fileName,
          file: fileToUpload,
          category: fileData.category,
          maxRetries: 3,
        });

        if (!uploadResult.success) {
          console.error('[UnifiedMediaUpload] Upload failed after retries:', uploadResult.error);
          failCount++;
          
          // Show error toast for this specific file
          toast({
            title: t("unifiedMediaUpload.toasts.uploadFailed"),
            description: uploadResult.attempts > 1 
              ? `${fileToUpload.name} - Falhou após ${uploadResult.attempts} tentativas. ${uploadResult.error}`
              : uploadResult.error,
            variant: "destructive",
          });
          
          // Remove the failed file from the list
          setFiles(prev => prev.filter(f => f.preview !== fileData.preview));
          URL.revokeObjectURL(fileData.preview);
          continue;
        }

        const publicUrl = uploadResult.publicUrl!;
        successCount++;
        
        // Show retry success if it took multiple attempts
        if (uploadResult.attempts > 1) {
          toast({
            title: "🔄 Upload recuperado",
            description: `${fileToUpload.name} enviado com sucesso após ${uploadResult.attempts} tentativas`,
          });
        }

        // Resolve effective entryId lazily after first successful upload
        // (creates a draft entry for the new-restaurant flow so photos persist
        // even if the WebView refreshes before the user taps Save).
        const effectiveEntryId = await resolveEntryId();

        // If we have an entryId, save photo immediately to DB
        if (effectiveEntryId) {
          // Detect if file is a video
          const isVideo = fileData.file.type.startsWith('video/');
          
          const photoType = isVideo ? 'video' :
                           fileData.category === 'menu' ? 'menu' :
                           fileData.category === 'food' ? 'food' :
                           fileData.category === 'wine' ? 'wine' :
                           fileData.category === 'friends' ? 'friends' :
                           'restaurant_photo';

          const { error: dbError } = await supabase
            .from("restaurant_photos")
            .insert({
              entry_id: effectiveEntryId,
              photo_url: publicUrl,
              type: photoType,
            });

          if (dbError) {
            console.error('Error saving photo to database:', dbError);
            // Log DB error
            await logUploadError({
              error_type: 'database_error',
              error_message: dbError.message,
              error_code: dbError.code,
              file_name: fileToUpload.name,
              file_size: fileToUpload.size,
              file_type: fileToUpload.type,
              category: fileData.category,
              platform: 'web',
              is_native: isNative,
              connection_type: navigator.onLine ? 'online' : 'offline',
              attempt_number: 1,
              was_retry_successful: false,
            });
            
            toast({
              title: t("common.error"),
              description: "Falha ao salvar foto no banco de dados",
              variant: "destructive",
            });
            continue;
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
              menu: updated.filter(f => f.category === 'menu' && f.url).map(f => ({
                url: f.url!,
                translation: f.menuTranslation,
              })),
              receipt: updated.find(f => f.category === 'receipt')?.receiptData || null,
            });
          }, 0);
          return updated;
        });
      }
      
      // Show final summary toast only if neither edit-mode nor draft-mode (i.e. no DB persistence happened)
      if (!entryId && !onRequestEntryId && successCount > 0) {
        if (failCount > 0) {
          toast({
            title: t("unifiedMediaUpload.toasts.filesUploaded"),
            description: `${successCount} de ${newFiles.length} arquivos enviados. ${failCount} falharam.`,
            variant: failCount > 0 ? "default" : "default",
          });
        } else {
          toast({
            title: t("unifiedMediaUpload.toasts.filesUploaded"),
            description: t("unifiedMediaUpload.toasts.filesSuccess").replace("{count}", successCount.toString()),
          });
        }
      }
    } catch (error: any) {
      console.error('[UnifiedMediaUpload] Unexpected error in autoUploadFiles:', error);
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
              onClick={() => handleCategoryTap(category)}
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
                // Synchronous gesture preservation (see camera button above)
                if (lastCategory) {
                  handleFileSelect(lastCategory, true);
                }
                setShowAddMoreDialog(false);
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

      {/* Native iOS Source Selection Dialog (Camera or Photo Library - no Scan Document) */}
      <AlertDialog open={showSourceDialog} onOpenChange={setShowSourceDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-2xl">
              {sourceCategory ? categoryConfig[sourceCategory].label : t("unifiedMediaUpload.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base">
              {t("unifiedMediaUpload.sourceDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button
              size="lg"
              className="w-full h-16 text-lg font-semibold bg-navy hover:bg-navy/90 text-white"
              onClick={() => {
                // IMPORTANT (iOS): trigger the file input SYNCHRONOUSLY within the
                // user gesture. Any setTimeout/await before input.click() breaks the
                // gesture context and iOS silently ignores `capture=environment`,
                // showing only the photo library instead of the camera.
                if (sourceCategory) {
                  handleFileSelect(sourceCategory, true);
                }
                setShowSourceDialog(false);
              }}
            >
              <Camera className="h-6 w-6 mr-3" />
              {t("unifiedMediaUpload.sourceDialog.camera")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full h-16 text-lg font-semibold"
              onClick={() => {
                if (sourceCategory) {
                  handleFileSelect(sourceCategory, false);
                }
                setShowSourceDialog(false);
              }}
            >
              <Image className="h-6 w-6 mr-3" />
              {t("unifiedMediaUpload.sourceDialog.photoLibrary")}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              onClick={() => setShowSourceDialog(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-xl text-destructive">
              {t("unifiedMediaUpload.fileLimits.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {t("unifiedMediaUpload.fileLimits.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3 my-4">
            {rejectedFiles.map((file, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <X className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.reason}</p>
                </div>
              </div>
            ))}
            
            {pendingValidFiles && pendingValidFiles.files.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                  {t("unifiedMediaUpload.fileLimits.validFilesCount").replace("{count}", pendingValidFiles.files.length.toString())}
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-col gap-2">
            {pendingValidFiles && pendingValidFiles.files.length > 0 ? (
              <>
                <Button
                  className="w-full"
                  onClick={handleContinueWithValid}
                >
                  {t("unifiedMediaUpload.fileLimits.continueWithValid")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleCancelRejection}
                >
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCancelRejection}
              >
                {t("common.close")}
              </Button>
            )}
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

      {/* Menu Section with Translation */}
      {files.some(f => f.category === 'menu') && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5" />
              {t("unifiedMediaUpload.menu.collectionTitle")} ({files.filter(f => f.category === 'menu').length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {files.filter(f => f.category === 'menu').map((file, index) => (
              <div key={file.preview}>
                {index > 0 && <Separator className="my-6" />}
                <div className="space-y-4">
                  <div className="flex gap-4">
                    {/* Menu Image */}
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

                    {/* Translation Controls */}
                    <div className="flex-1 space-y-3">
                      {!file.menuTranslation ? (
                        <div className="space-y-2">
                          <Select
                            onValueChange={(value) => handleTranslateMenuLocal(file.preview, value)}
                            disabled={translatingMenuPreview === file.preview || !file.url}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={translatingMenuPreview === file.preview ? t("unifiedMediaUpload.menu.translating") : t("unifiedMediaUpload.menu.translateMenu")} />
                            </SelectTrigger>
                            <SelectContent>
                              {LANGUAGE_OPTIONS.map((lang) => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  {lang.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {translatingMenuPreview === file.preview && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {t("unifiedMediaUpload.menu.translating")}
                            </div>
                          )}
                          {!file.url && (
                            <p className="text-xs text-muted-foreground">
                              Uploading photo...
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Badge variant="secondary" className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            {t("restaurantDetail.translated")}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Clear translation and allow re-translate
                              setFiles(prev => {
                                const updated = prev.map(f => 
                                  f.preview === file.preview ? { ...f, menuTranslation: undefined } : f
                                );
                                setTimeout(updateParent, 0);
                                return updated;
                              });
                            }}
                          >
                            {t("restaurantDetail.retranslate")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Translation Content */}
                  {file.menuTranslation && (
                    <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <UtensilsCrossed className="h-4 w-4" />
                        {t("unifiedMediaUpload.menu.menuTranslation")}
                      </h4>
                      <div className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {file.menuTranslation}
                      </div>
                    </div>
                  )}
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

      {/* Regular Uploaded Files Grid (Place, Food, Friends) */}
      {files.filter(f => !['wine', 'receipt', 'menu'].includes(f.category)).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Other Photos ({files.filter(f => !['wine', 'receipt', 'menu'].includes(f.category)).length})</h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {files.filter(f => !['wine', 'receipt', 'menu'].includes(f.category)).map((file) => (
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
                
                {/* Video compression progress overlay */}
                {compressingVideo === file.preview && compressionProgress && (
                  <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center rounded-lg p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-sm font-medium text-center mb-2">
                      {compressionProgress.stage === 'loading' && 'Loading video...'}
                      {compressionProgress.stage === 'compressing' && 'Compressing...'}
                      {compressionProgress.stage === 'finalizing' && 'Finalizing...'}
                    </p>
                    <Progress value={compressionProgress.progress} className="w-full h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{compressionProgress.progress}%</p>
                  </div>
                )}
                
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFile(file.preview)}
                  disabled={compressingVideo === file.preview}
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

import { useState } from "react";
import { Landmark, UtensilsCrossed, Wine, Users, Receipt, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { extractGPSFromImage } from "@/utils/exifExtractor";

interface UploadedFile {
  file: File;
  preview: string;
  category: 'place' | 'menu' | 'wine' | 'friends' | 'receipt';
  url?: string;
  wineInfo?: any;
  caption?: string;
  rating?: number;
  receiptData?: any;
}

interface UnifiedMediaUploadProps {
  onUploadsChange: (data: {
    place: string[];
    menu: string[];
    wine: Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>;
    friends: string[];
    receipt: any | null;
  }) => void;
  onLocationExtracted?: (location: { lat: number; lng: number; address: string }) => void;
}

export function UnifiedMediaUpload({ onUploadsChange, onLocationExtracted }: UnifiedMediaUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingWine, setProcessingWine] = useState<string | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const { toast } = useToast();

  const categoryConfig = {
    place: { icon: Landmark, label: "Place", color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    menu: { icon: UtensilsCrossed, label: "Menu", color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    wine: { icon: Wine, label: "Wine", color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    friends: { icon: Users, label: "Friends", color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
    receipt: { icon: Receipt, label: "Receipt", color: "from-[hsl(var(--primary))] to-[#0d1a2d]" },
  };

  const handleFileSelect = async (category: keyof typeof categoryConfig) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = category === 'receipt' ? 'image/*' : 'image/*,video/*';
    input.multiple = category !== 'receipt';
    
    input.onchange = async (e) => {
      const selectedFiles = Array.from((e.target as HTMLInputElement).files || []);
      
      const newFiles: UploadedFile[] = selectedFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        category,
      }));
      
      setFiles(prev => [...prev, ...newFiles]);
      
      // Auto-process receipt if it's a receipt upload
      if (category === 'receipt' && newFiles.length > 0) {
        await processReceipt(newFiles[0]);
      } else {
        // Auto-upload files for other categories
        await autoUploadFiles(newFiles);
      }
    };
    
    input.click();
  };

  const processReceipt = async (fileData: UploadedFile) => {
    setProcessingReceipt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileName = `receipts/${user.id}/${Date.now()}_${fileData.file.name}`;
      const { error: uploadError, data } = await supabase.storage
        .from("restaurant_media")
        .upload(fileName, fileData.file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("restaurant_media")
        .getPublicUrl(fileName);

      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "process-receipt",
        { body: { imageUrl: publicUrl } }
      );

      if (functionError) throw functionError;

      setFiles(prev => prev.map(f => 
        f.preview === fileData.preview 
          ? { ...f, receiptData: { ...functionData, photo_url: publicUrl }, url: publicUrl }
          : f
      ));

      toast({
        title: "Receipt processed!",
        description: "Receipt data extracted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error processing receipt",
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileName = `wines/${user.id}/${Date.now()}_${fileData.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("restaurant_media")
        .upload(fileName, fileData.file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("restaurant_media")
        .getPublicUrl(fileName);

      const { data: wineInfo, error: functionError } = await supabase.functions.invoke(
        "analyze-wine-label",
        { body: { imageUrl: publicUrl } }
      );

      if (functionError) throw functionError;

      setFiles(prev => prev.map(f => 
        f.preview === fileData.preview 
          ? { ...f, wineInfo, caption: wineInfo ? `${wineInfo.name || ''} ${wineInfo.vintage || ''}`.trim() : '', url: publicUrl }
          : f
      ));

      toast({
        title: "Wine recognized!",
        description: wineInfo?.name || "Wine information extracted",
      });
    } catch (error: any) {
      toast({
        title: "Error analyzing wine",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingWine(null);
    }
  };

  const removeFile = (preview: string) => {
    setFiles(prev => prev.filter(f => f.preview !== preview));
    URL.revokeObjectURL(preview);
  };

  const updateWineRating = (preview: string, rating: number) => {
    setFiles(prev => prev.map(f => 
      f.preview === preview ? { ...f, rating } : f
    ));
  };

  const updateWineCaption = (preview: string, caption: string) => {
    setFiles(prev => prev.map(f => 
      f.preview === preview ? { ...f, caption } : f
    ));
  };

  const autoUploadFiles = async (newFiles: UploadedFile[]) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      for (const fileData of newFiles) {
        const fileName = `${fileData.category}/${user.id}/${Date.now()}_${fileData.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("restaurant_media")
          .upload(fileName, fileData.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("restaurant_media")
          .getPublicUrl(fileName);

        // Update file with URL
        setFiles(prev => prev.map(f => 
          f.preview === fileData.preview ? { ...f, url: publicUrl } : f
        ));
      }

      // Notify parent with all uploaded data
      const currentData = {
        place: [] as string[],
        menu: [] as string[],
        wine: [] as Array<{ url: string; caption: string; rating?: number; wineInfo?: any }>,
        friends: [] as string[],
        receipt: null as any,
      };

      files.concat(newFiles).forEach(fileData => {
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
          } else if (fileData.category === 'place' || fileData.category === 'menu' || fileData.category === 'friends') {
            currentData[fileData.category].push(fileData.url);
          }
        }
      });

      onUploadsChange(currentData);
      
      toast({
        title: "Files uploaded!",
        description: `${newFiles.length} file(s) uploaded successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
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
        <h2 className="text-3xl font-bold text-[#0d1a2d]">Add your photos</h2>
        <p className="text-lg text-muted-foreground">Tap a button then upload</p>
      </div>

      {/* Category Buttons Grid */}
      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        {(Object.keys(categoryConfig) as Array<keyof typeof categoryConfig>).slice(0, 4).map((category) => {
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
        
        {/* Receipt button - centered in last row */}
        <div className="col-span-2 flex justify-center">
          <button
            type="button"
            onClick={() => handleFileSelect('receipt')}
            className="flex flex-col items-center justify-center h-40 w-[calc(50%-0.5rem)] rounded-2xl border-2 transition-all hover:border-[#0d1a2d] hover:shadow-lg bg-background"
            style={{ borderColor: 'rgba(13, 26, 45, 0.12)' }}
          >
            <div className={`bg-gradient-to-br ${categoryConfig.receipt.color} p-4 rounded-xl mb-3`}>
              <Receipt className="h-8 w-8 text-white" />
            </div>
            <span className="font-semibold text-[#0d1a2d]">Receipt</span>
          </button>
        </div>
      </div>

      {/* Uploaded Files Grid */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Uploaded Files ({files.length})</h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {files.map((file) => (
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

                {/* Wine AI button */}
                {file.category === 'wine' && !file.wineInfo && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-2 left-2 right-2"
                    onClick={() => analyzeWineLabel(file)}
                    disabled={processingWine === file.preview}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {processingWine === file.preview ? "Analyzing..." : "Recognize"}
                  </Button>
                )}

                {/* Wine info display */}
                {file.category === 'wine' && file.wineInfo && (
                  <div className="mt-2 text-xs space-y-1">
                    <p className="font-semibold">{file.wineInfo.name}</p>
                    {file.wineInfo.vintage && <p className="text-muted-foreground">{file.wineInfo.vintage}</p>}
                  </div>
                )}

                {/* Receipt processing status */}
                {file.category === 'receipt' && processingReceipt && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                    <p className="text-sm font-medium">Processing...</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

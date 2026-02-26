import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Sparkles, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import { useAIConsent } from "@/hooks/useAIConsent";

interface WineData {
  url: string;
  caption: string;
  rating?: number;
  wineInfo?: any;
}

interface WineUploadProps {
  onWineUpload: (wines: WineData[]) => void;
}

export const WineUpload = ({ onWineUpload }: WineUploadProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [ratings, setRatings] = useState<number[]>([]);
  const [wineInfos, setWineInfos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
  const { ensureAIConsent } = useAIConsent();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    const validFiles = selectedFiles.filter(file => file.type.startsWith('image/'));

    if (validFiles.length !== selectedFiles.length) {
      toast({
        title: t("wineUpload.invalidFiles"),
        description: t("wineUpload.invalidFilesDesc"),
        variant: "destructive",
      });
    }

    // Create previews
    const newPreviews: string[] = [];
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === validFiles.length) {
          setPreviews([...previews, ...newPreviews]);
          setCaptions([...captions, ...Array(validFiles.length).fill('')]);
          setRatings([...ratings, ...Array(validFiles.length).fill(0)]);
          setWineInfos([...wineInfos, ...Array(validFiles.length).fill(null)]);
        }
      };
      reader.readAsDataURL(file);
    });

    setFiles([...files, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
    setCaptions(captions.filter((_, i) => i !== index));
    setRatings(ratings.filter((_, i) => i !== index));
    setWineInfos(wineInfos.filter((_, i) => i !== index));
  };

  const updateCaption = (index: number, value: string) => {
    const newCaptions = [...captions];
    newCaptions[index] = value;
    setCaptions(newCaptions);
  };

  const updateRating = (index: number, rating: number) => {
    const newRatings = [...ratings];
    newRatings[index] = rating;
    setRatings(newRatings);
  };

  const analyzeWineLabel = async (index: number) => {
    const allowed = await ensureAIConsent("wine_recognition");
    if (!allowed) return;
    setAnalyzingIndex(index);
    try {
      const file = files[index];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Upload file temporarily to get a URL
      const fileExt = file.name.split('.').pop();
      const fileName = `temp_${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('restaurant-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('restaurant-photos')
        .getPublicUrl(filePath);

      // Call AI analysis
      const { data, error } = await supabase.functions.invoke('analyze-wine-label', {
        body: { imageUrl: publicUrl }
      });

      if (error) throw error;

      if (data.success && data.wineInfo) {
        const newWineInfos = [...wineInfos];
        newWineInfos[index] = data.wineInfo;
        setWineInfos(newWineInfos);

        // Auto-fill caption with wine info
        if (data.wineInfo.name && data.wineInfo.name !== 'Unknown') {
          const autoCaption = [
            data.wineInfo.name,
            data.wineInfo.producer,
            data.wineInfo.vintage,
            data.wineInfo.region
          ].filter(Boolean).join(' - ');
          
          updateCaption(index, autoCaption);
        }

        toast({
          title: t("unifiedMediaUpload.toasts.wineRecognized"),
          description: data.wineInfo.name || t("unifiedMediaUpload.toasts.wineInfo"),
        });
      }
    } catch (error: any) {
      toast({
        title: t("wineUpload.analysisFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzingIndex(null);
    }
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const wineData: WineData[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `wine_${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('restaurant-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('restaurant-photos')
          .getPublicUrl(filePath);

        wineData.push({
          url: publicUrl,
          caption: captions[i],
          rating: ratings[i] || undefined,
          wineInfo: wineInfos[i]
        });
      }

      onWineUpload(wineData);
      setFiles([]);
      setPreviews([]);
      setCaptions([]);
      setWineInfos([]);
      
      toast({
        title: t("wineUpload.uploadSuccess"),
        description: t("wineUpload.uploadSuccessDesc").replace("{count}", wineData.length.toString()),
      });
    } catch (error: any) {
      toast({
        title: t("wineUpload.uploadFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("wineUpload.label")}</Label>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById('wine-upload')?.click()}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            {t("wineUpload.selectPhotos")}
          </Button>
          <input
            id="wine-upload"
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          {files.length > 0 && (
            <Button
              type="button"
              onClick={uploadFiles}
              disabled={uploading}
            >
              {uploading ? t("wineUpload.uploading") : `${t("wineUpload.upload")} ${files.length}`}
            </Button>
          )}
        </div>
      </div>

      {/* Preview Grid */}
      {previews.length > 0 && (
        <div className="space-y-4">
          {previews.map((preview, index) => (
            <div key={index} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start space-x-4">
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border flex-shrink-0">
                  <img
                    src={preview}
                    alt={`Wine ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute top-2 right-2 p-1 bg-background/80 backdrop-blur rounded-full hover:bg-background transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="flex-1 space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => analyzeWineLabel(index)}
                    disabled={analyzingIndex === index}
                    className="w-full"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {analyzingIndex === index ? t("unifiedMediaUpload.wine.analyzing") : t("unifiedMediaUpload.wine.recognize")}
                  </Button>
                  
                  <div className="space-y-2">
                    <Label>{t("wineUpload.rating")}</Label>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => updateRating(index, star)}
                          className="transition-transform hover:scale-110"
                        >
                          <Star
                            className={cn(
                              "h-6 w-6 transition-colors",
                              star <= ratings[index]
                                ? "text-accent fill-accent"
                                : "text-muted-foreground"
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`caption-${index}`}>{t("wineUpload.tastingNotes")}</Label>
                    <Textarea
                      id={`caption-${index}`}
                      placeholder={t("wineUpload.tastingPlaceholder")}
                      value={captions[index]}
                      onChange={(e) => updateCaption(index, e.target.value)}
                      rows={3}
                    />
                  </div>

                  {wineInfos[index] && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      <p className="font-semibold mb-1">{t("wineUpload.recognized")}</p>
                      <p>{wineInfos[index].name || t("wineUpload.unknown")}</p>
                      {wineInfos[index].producer && <p>{wineInfos[index].producer}</p>}
                      {wineInfos[index].region && <p>{wineInfos[index].region}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

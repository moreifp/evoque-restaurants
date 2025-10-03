import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon, Video, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { extractGPSFromImage, reverseGeocode, PhotoLocation } from "@/utils/exifExtractor";

interface MediaUploadProps {
  onMediaUpload: (urls: string[]) => void;
  onLocationExtracted?: (location: { lat: number; lng: number; address: string }) => void;
  extractLocation?: boolean;
}

export const MediaUpload = ({ onMediaUpload, onLocationExtracted, extractLocation = false }: MediaUploadProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extractingLocation, setExtractingLocation] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    
    // Validate file types
    const validFiles = selectedFiles.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      return isImage || isVideo;
    });

    if (validFiles.length !== selectedFiles.length) {
      toast({
        title: "Invalid files",
        description: "Only images and videos are allowed",
        variant: "destructive",
      });
    }

    // Extract GPS from first image if location extraction is enabled
    if (extractLocation && onLocationExtracted && validFiles.length > 0) {
      setExtractingLocation(true);
      const firstImageFile = validFiles.find(f => f.type.startsWith('image/'));
      
      if (firstImageFile) {
        const locationData = await extractGPSFromImage(firstImageFile);
        
        if (locationData) {
          const address = await reverseGeocode(locationData.latitude, locationData.longitude);
          
          if (address) {
            onLocationExtracted({
              lat: locationData.latitude,
              lng: locationData.longitude,
              address: address
            });
            
            toast({
              title: "Location extracted!",
              description: "Photo location has been automatically detected",
            });
          }
        } else {
          toast({
            title: "No location data",
            description: "This photo doesn't contain GPS coordinates",
            variant: "destructive",
          });
        }
      }
      setExtractingLocation(false);
    }

    // Create previews
    const newPreviews: string[] = [];
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === validFiles.length) {
          setPreviews([...previews, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });

    setFiles([...files, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError, data } = await supabase.storage
          .from('restaurant-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('restaurant-photos')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      onMediaUpload(uploadedUrls);
      setFiles([]);
      setPreviews([]);
      
      toast({
        title: "Upload successful",
        description: `${uploadedUrls.length} file(s) uploaded`,
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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Photos & Videos</Label>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById('media-upload')?.click()}
            className="flex-1"
            disabled={extractingLocation}
          >
            {extractingLocation ? (
              <>
                <MapPin className="h-4 w-4 mr-2 animate-pulse" />
                Extracting Location...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Select Photos/Videos
              </>
            )}
          </Button>
          <input
            id="media-upload"
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          {files.length > 0 && (
            <Button
              type="button"
              onClick={uploadFiles}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : `Upload ${files.length}`}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Upload photos and videos of the restaurant
        </p>
      </div>

      {/* Preview Grid */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {previews.map((preview, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-border">
              {files[index].type.startsWith('image/') ? (
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Video className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute top-2 right-2 p-1 bg-background/80 backdrop-blur rounded-full hover:bg-background transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

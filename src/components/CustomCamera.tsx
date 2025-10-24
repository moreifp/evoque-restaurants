import { useState, useRef, useEffect } from "react";
import { Camera, X, Check, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface CapturedPhoto {
  blob: Blob;
  preview: string;
}

interface CustomCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotosCapture: (photos: File[]) => void;
  category: string;
}

export function CustomCamera({ isOpen, onClose, onPhotosCapture, category }: CustomCameraProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedPhotos([]);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const preview = URL.createObjectURL(blob);
        setCapturedPhotos(prev => [...prev, { blob, preview }]);
      }
    }, 'image/jpeg', 0.9);
  };

  const removePhoto = (index: number) => {
    setCapturedPhotos(prev => {
      const photo = prev[index];
      URL.revokeObjectURL(photo.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const handleDone = () => {
    const files = capturedPhotos.map((photo, index) => 
      new File([photo.blob], `camera-${Date.now()}-${index}.jpg`, { type: 'image/jpeg' })
    );
    onPhotosCapture(files);
    
    // Cleanup
    capturedPhotos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setCapturedPhotos([]);
    onClose();
  };

  const handleCancel = () => {
    capturedPhotos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setCapturedPhotos([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-4xl h-[90vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Take Photos - {category}
            <Badge variant="secondary" className="ml-auto">
              {capturedPhotos.length} photo{capturedPhotos.length !== 1 ? 's' : ''}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row gap-4 h-full p-4 overflow-hidden">
          {/* Camera View */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="relative flex-1 bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Camera Controls */}
            <div className="flex gap-2 justify-center">
              <Button
                size="lg"
                onClick={capturePhoto}
                className="flex-1 max-w-xs"
                disabled={!stream}
              >
                <Camera className="h-5 w-5 mr-2" />
                Capture
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={switchCamera}
                disabled={!stream}
              >
                <RotateCw className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Captured Photos Preview */}
          <div className="w-full md:w-64 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Captured Photos</h3>
              {capturedPhotos.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    capturedPhotos.forEach(photo => URL.revokeObjectURL(photo.preview));
                    setCapturedPhotos([]);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
              {capturedPhotos.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No photos yet
                </div>
              ) : (
                capturedPhotos.map((photo, index) => (
                  <div key={photo.preview} className="relative group">
                    <img
                      src={photo.preview}
                      alt={`Captured ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removePhoto(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Badge className="absolute bottom-2 left-2">
                      {index + 1}
                    </Badge>
                  </div>
                ))
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDone}
                disabled={capturedPhotos.length === 0}
                className="flex-1"
              >
                <Check className="h-4 w-4 mr-2" />
                Done ({capturedPhotos.length})
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

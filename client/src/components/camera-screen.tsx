import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Zap, Sparkles, Images } from "lucide-react";
import { useCamera } from "@/hooks/use-camera";
import { useToast } from "@/hooks/use-toast";

interface CameraScreenProps {
  onPhotoCapture: (file: File) => void;
  onGallerySelect: () => void;
}

export function CameraScreen({ onPhotoCapture, onGallerySelect }: CameraScreenProps) {
  const { videoRef, isStreaming, error, startCamera, stopCamera, switchCamera, capturePhoto } = useCamera();
  const { toast } = useToast();
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Camera Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleCapture = async () => {
    if (isCapturing) return;
    
    setIsCapturing(true);
    try {
      const photoBlob = await capturePhoto();
      const file = new File([photoBlob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      onPhotoCapture(file);
    } catch (err) {
      toast({
        title: "Capture Failed",
        description: "Failed to capture photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGalleryClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        onPhotoCapture(files[0]);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6" data-testid="camera-screen">
      {/* Camera Viewfinder */}
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card border border-border">
        {/* Always render video element so ref exists */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${!isStreaming ? 'hidden' : ''}`}
          data-testid="camera-video"
        />
        
        {/* Loading/Error Overlay */}
        {!isStreaming && (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-secondary flex items-center justify-center">
            <div className="text-center space-y-4">
              <Camera className="h-16 w-16 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground text-sm px-4">
                {error ? error : "Starting camera..."}
              </p>
              {error && (
                <Button 
                  onClick={handleGalleryClick}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-upload-fallback"
                >
                  <Images className="h-4 w-4 mr-2" />
                  Upload Photo Instead
                </Button>
              )}
            </div>
          </div>
        )}
        
        {/* Camera Overlay */}
        {isStreaming && (
          <div className="absolute inset-0 bg-black/20">
            {/* Focus Frame */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-white/50 rounded-lg relative">
                {/* Corner brackets */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr"></div>
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl"></div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white rounded-br"></div>
              </div>
            </div>
            
            {/* Top Controls */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
              <Button
                size="sm"
                variant="secondary"
                className="bg-black/40 backdrop-blur-sm text-white border-0 hover:bg-black/60"
                data-testid="button-flash"
              >
                <Zap className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-black/40 backdrop-blur-sm text-white border-0 hover:bg-black/60"
                onClick={switchCamera}
                data-testid="button-switch-camera"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Camera Controls */}
      <div className="flex items-center justify-center space-x-8">
        {/* Gallery Button */}
        <Button
          size="lg"
          variant="outline"
          className="w-14 h-14 rounded-xl p-0"
          onClick={handleGalleryClick}
          data-testid="button-gallery"
        >
          <Images className="h-6 w-6" />
        </Button>

        {/* Capture Button */}
        <Button
          size="lg"
          className="w-20 h-20 rounded-full bg-white border-4 border-primary shadow-lg hover:scale-105 transition-transform relative overflow-hidden"
          onClick={handleCapture}
          disabled={!isStreaming || isCapturing}
          data-testid="button-capture"
        >
          <div className="absolute inset-2 bg-primary rounded-full flex items-center justify-center">
            <Camera className="h-8 w-8 text-primary-foreground" />
          </div>
        </Button>

        {/* AI Scan Mode */}
        <Button
          size="lg"
          className="w-14 h-14 rounded-xl"
          data-testid="button-ai-scan"
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      </div>

      {/* Status Indicator */}
      <div className="text-center">
        <p className="text-muted-foreground text-sm" data-testid="text-status">
          Point camera at product label
        </p>
      </div>
    </div>
  );
}

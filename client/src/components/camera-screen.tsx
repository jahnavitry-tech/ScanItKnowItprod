import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Zap, Sparkles, Images, Loader2 } from "lucide-react";
import { useCamera } from "@/hooks/use-camera";
import { useToast } from "@/hooks/use-toast";
import { ProductSelectionScreen } from "./product-selection-screen"; 
import type { ProductAnalysis } from "@/types/analysis"; 

// The `onProductAnalysisStart` now takes the selected product data
interface CameraScreenProps {
  onProductAnalysisStart: (productData: ProductAnalysis) => void;
}

// Define possible view states for the component
type CameraView = 'camera' | 'loading' | 'selection';

export function CameraScreen({ onProductAnalysisStart }: CameraScreenProps) {
  const { videoRef, isStreaming, error, startCamera, stopCamera, switchCamera, capturePhoto } = useCamera();
  const { toast } = useToast();
  
  const [view, setView] = useState<CameraView>('camera'); 
  const [detectedProducts, setDetectedProducts] = useState<ProductAnalysis[]>([]);
  const [imageThumbnailUrl, setImageThumbnailUrl] = useState<string>(''); 

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

  const handleProductSelect = (product: ProductAnalysis) => {
    // 1. User selected a product, proceed to full analysis
    // We can now safely dispose of the temporary image URL
    if (imageThumbnailUrl) URL.revokeObjectURL(imageThumbnailUrl);
    onProductAnalysisStart(product);
  };
  
  const handleRescan = () => {
    // 2. Reset state and return to camera view
    if (imageThumbnailUrl) URL.revokeObjectURL(imageThumbnailUrl);
    setDetectedProducts([]);
    setImageThumbnailUrl('');
    setView('camera');
  };

  // Function to handle the API call
  const callProductDetectionApi = async (base64Image: string): Promise<ProductAnalysis[]> => {
      // NOTE: Update the URL to your actual endpoint if it changed, 
      // otherwise, it uses the existing /api/analyze-product route 
      // which now returns an array.
      const response = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Image }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error('Product analysis failed on the server.');
      }
      
      // We expect the result to be an array: ProductAnalysis[]
      const results = await response.json();
      return results as ProductAnalysis[];
  };

  const handleProcessImage = async (file: File) => {
    setView('loading');
    
    try {
      // Create a temporary URL for the thumbnail in the selection cards
      const tempUrl = URL.createObjectURL(file);
      setImageThumbnailUrl(tempUrl);
      
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
          const base64Image = reader.result as string;
          // Extract base64 data only (after the comma)
          const dataOnly = base64Image.split(',')[1];
          
          // 1. Call the updated detection 
          const results = await callProductDetectionApi(dataOnly);
          
          // 2. Update state to show selection screen if products were detected
          if (results && results.length > 0) {
            setDetectedProducts(results);
            setView('selection');
          } else {
            // Handle case where no products were detected
            toast({
              title: "No Products Detected",
              description: "Please try again with a clearer image of a product label.",
              variant: "destructive",
            });
            setView('camera');
          }
      };
    } catch (err) {
      console.error("Error processing image:", err);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze the image. Please try again.",
        variant: "destructive",
      });
      setView('camera');
    }
  };

  const handleCapture = async () => {
    try {
      const photoBlob = await capturePhoto();
      const file = new File([photoBlob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      handleProcessImage(file);
    } catch (err) {
      toast({
        title: "Capture Failed",
        description: "Failed to capture photo. Please try again.",
        variant: "destructive",
      });
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
        handleProcessImage(files[0]);
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
        
        {/* Loading Overlay */}
        {view === 'loading' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Loader2 className="h-16 w-16 mx-auto text-white animate-spin" />
              <p className="text-white text-sm px-4">
                Analyzing image...
              </p>
            </div>
          </div>
        )}
        
        {/* Loading/Error Overlay */}
        {!isStreaming && view !== 'loading' && (
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
        {isStreaming && view === 'camera' && (
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
      {view === 'camera' && (
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
            disabled={!isStreaming}
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
      )}

      {/* Status Indicator */}
      {view === 'camera' && (
        <div className="text-center">
          <p className="text-muted-foreground text-sm" data-testid="text-status">
            Point camera at product label
          </p>
        </div>
      )}

      {/* Product Selection Screen */}
      {view === 'selection' && (
        <ProductSelectionScreen
          detectedProducts={detectedProducts}
          onProductSelect={handleProductSelect}
          onRescan={handleRescan}
          imageThumbnailUrl={imageThumbnailUrl}
        />
      )}
    </div>
  );
}
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CameraScreen } from "@/components/camera-screen";
import { ProcessingScreen } from "@/components/processing-screen";
import { AnalysisScreen } from "@/components/analysis-screen";
import { ThemeToggle } from "@/components/theme-provider";
import { Camera } from "lucide-react";
import type { ProductAnalysis } from "@/types/analysis";

type AppState = "camera" | "processing" | "analysis";

export default function Home() {
  const [currentState, setCurrentState] = useState<AppState>("camera");
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const { toast } = useToast();

  const analyzeProductMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      
      const response = await fetch("/api/analyze-product", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to analyze product");
      }

      return response.json();
    },
    onSuccess: (data: ProductAnalysis) => {
      setAnalysis(data);
      setCurrentState("analysis");
      toast({
        title: "Analysis Complete",
        description: `Successfully analyzed ${data.productName}`,
      });
    },
    onError: (error) => {
      setCurrentState("camera");
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze the product. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePhotoCapture = (file: File) => {
    setCurrentState("processing");
    analyzeProductMutation.mutate(file);
  };

  const handleScanAnother = () => {
    setCurrentState("camera");
    setAnalysis(null);
  };

  const handleGallerySelect = () => {
    toast({
      title: "Gallery",
      description: "Gallery selection opened",
    });
  };

  return (
    <div className="min-h-screen bg-background" data-testid="home-page">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Camera className="text-primary text-xl" />
            <h1 className="text-xl font-bold" data-testid="text-app-title">
              Scan It Know It
            </h1>
          </div>
          
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-md">
        {currentState === "camera" && (
          <CameraScreen
            onPhotoCapture={handlePhotoCapture}
            onGallerySelect={handleGallerySelect}
          />
        )}

        {currentState === "processing" && <ProcessingScreen />}

        {currentState === "analysis" && analysis && (
          <AnalysisScreen
            analysis={analysis}
            onScanAnother={handleScanAnother}
          />
        )}
      </main>
    </div>
  );
}

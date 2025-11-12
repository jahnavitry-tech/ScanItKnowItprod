import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CameraScreen } from "@/components/camera-screen";
import { AnalysisScreen } from "@/components/analysis-screen";
import { ThemeToggle } from "@/components/theme-provider";
import AppIconLight from "@/components/AppIconLight";
import AppIconDark from "@/components/AppIconDark";
import AppTitle from "@/components/AppTitle";
import type { ProductAnalysis } from "@/types/analysis";

type AppState = "camera" | "analysis";

export default function Home() {
  const [currentState, setCurrentState] = useState<AppState>("camera");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      setAnalysisId(data.analysisId);
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

  const handleProductAnalysisStart = (analysisId: string) => {
    setAnalysisId(analysisId);
    setCurrentState("analysis");
  };

  const handleScanAnother = () => {
    setCurrentState("camera");
    setAnalysisId(null);
    // Invalidate the analysis query to force a refetch if needed
    if (analysisId) {
      queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
    }
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
          <div className="flex items-center space-x-6">
            <div className="dark:hidden">
              <AppIconLight />
            </div>
            <div className="hidden dark:block">
              <AppIconDark />
            </div>
            <AppTitle />
          </div>
          
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-md">
        {currentState === "camera" && (
          <CameraScreen
            onProductAnalysisStart={handleProductAnalysisStart}
          />
        )}

        {currentState === "analysis" && analysisId && (
          <AnalysisScreen
            analysisId={analysisId}
            onScanAnother={handleScanAnother}
          />
        )}
      </main>
    </div>
  );
}
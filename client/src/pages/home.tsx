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
      {/* Original header: className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" */}
      {/* MODERN HEADER UPDATE - Design Request 001: Material Design compliant header */}
      <header className="sticky top-0 z-50 w-full h-14 bg-background border-b border-border backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        {/* Original container: className="container mx-auto px-4 h-16 flex items-center justify-between" */}
        {/* MODERN HEADER UPDATE - Design Request 001: 56dp height, 16dp horizontal padding, flex alignment */}
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          {/* Original logo area: className="flex items-center space-x-3" */}
          {/* MODERN HEADER UPDATE - Design Request 001: Reduced spacing between icon and title to 4dp/8dp max */}
          {/* CONSISTENT POSITIONING UPDATE: Ensuring exact positioning and dimensions alignment between light and dark modes */}
          {/* Using space-x-3 for proper visual separation as per requirements */}
          <div className="flex items-center space-x-3">
            {/* Ensuring consistent positioning in both dark and light modes using shared container classes */}
            <div className="flex items-center">
              <div className="dark:hidden">
                <AppIconLight />
              </div>
              <div className="hidden dark:block">
                <AppIconDark />
              </div>
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
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CameraScreen } from "@/components/camera-screen";
import { AnalysisScreen } from "@/components/analysis-screen";
import { TutorialOverlay } from "@/components/tutorial-overlay";
type AppState = "camera" | "analysis";

export default function Home() {
  const [currentState, setCurrentState] = useState<AppState>("camera");
  const [analysisIds, setAnalysisIds]   = useState<string[]>([]);
  const queryClient = useQueryClient();

  const handleProductAnalysisStart = (ids: string | string[]) => {
    setAnalysisIds(Array.isArray(ids) ? ids : [ids]);
    setCurrentState("analysis");
  };

  const handleScanAnother = () => {
    setCurrentState("camera");
    // Eagerly remove all cached data for these analysis IDs so memory is freed
    // immediately rather than waiting for gcTime to expire.
    analysisIds.forEach((id) => {
      queryClient.removeQueries({ queryKey: ["composition",  id] });
      queryClient.removeQueries({ queryKey: ["ingredients",  id] });
      queryClient.removeQueries({ queryKey: ["reddit",       id] });
      queryClient.removeQueries({ queryKey: [`/api/chat/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["analysis", id] });
    });
    setAnalysisIds([]);
  };

  if (currentState === "camera") {
    return (
      <div className="fixed inset-0 bg-[#0E0E0E] overflow-hidden" data-testid="home-page">
        <CameraScreen onProductAnalysisStart={handleProductAnalysisStart} />
        <TutorialOverlay />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="home-page">
      <AnalysisScreen
        analysisIds={analysisIds}
        onScanAnother={handleScanAnother}
      />
    </div>
  );
}

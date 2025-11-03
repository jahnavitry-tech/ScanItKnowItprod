import { X, RefreshCcw } from "lucide-react";
import { ProductSelectionCard } from "@/components/ui/product-selection-card";
import { Button } from "@/components/ui/button";
import type { ProductAnalysis } from "@/types/analysis";

interface ProductSelectionScreenProps {
  detectedProducts: ProductAnalysis[];
  onProductSelect: (product: ProductAnalysis) => void;
  onRescan: () => void;
  imageThumbnailUrl: string;
}

/**
 * Screen displayed when one or more products are detected, allowing user selection.
 */
export function ProductSelectionScreen({
  detectedProducts,
  onProductSelect,
  onRescan,
  imageThumbnailUrl
}: ProductSelectionScreenProps) {

  return (
    // Fixed modal overlay (bottom sheet style)
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 animate-fade-in"
         onClick={onRescan}> 
      
      {/* Modal Sheet - Max width for desktop, full width on mobile */}
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl p-6 max-h-[90vh] flex flex-col transition-transform duration-300 ease-out"
           onClick={(e) => e.stopPropagation()} // Stop propagation so clicking inside doesn't close
      >
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            {detectedProducts.length > 1 
              ? `Products Detected (${detectedProducts.length})`
              : "Confirm Product"}
          </h2>
          <button 
            onClick={onRescan}
            className="text-gray-400 hover:text-gray-600 transition p-2 rounded-full bg-gray-100"
            aria-label="Close and Rescan"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-6">
          {detectedProducts.length > 1
            ? "Please select the product you wish to analyze."
            : "Please confirm this is the product you want to analyze."
          }
        </p>

        {/* Scrollable List of Product Cards */}
        <div className="overflow-y-auto -mr-2 pr-2 space-y-3">
          {detectedProducts.map((product, index) => (
            <ProductSelectionCard
              key={index}
              product={product}
              onClick={onProductSelect}
              imageThumbnailUrl={imageThumbnailUrl}
            />
          ))}
        </div>

        {/* Action Button */}
        <div className="mt-6 pt-4 border-t border-border">
            <Button
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
              onClick={onRescan}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Start New Scan
            </Button>
        </div>

      </div>
    </div>
  );
}
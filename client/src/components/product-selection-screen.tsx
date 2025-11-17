import { Button } from "@/components/ui/button";
import type { ProductAnalysis } from "@/types/analysis";
import { ArrowLeft, RefreshCcw, ChevronRight } from "lucide-react";

interface ProductSelectionScreenProps {
  detectedProducts: ProductAnalysis[];
  imageThumbnailUrl: string;
  onProductSelect: (analysisId: string) => void;
  onRescan: () => void;
  onClose: () => void; // Added onClose handler for modal
}

// Enhanced component to render the preview of a detected product as a card
const ProductPreviewCard: React.FC<{ product: ProductAnalysis; onSelect: (id: string) => void }> = ({
  product,
  onSelect,
}) => {
  // Truncate product name to maximum 5 words for better visibility
  const truncateProductName = (name: string) => {
    if (!name) return "";
    const words = name.split(" ");
    return words.length > 5 ? `${words.slice(0, 5).join(" ")}...` : name;
  };

  // Truncate summary to maximum 4 lines for better readability
  const truncateSummary = (summary: string) => {
    if (!summary) return "";
    const lines = summary.split("\n");
    return lines.length > 4 ? `${lines.slice(0, 4).join("\n")}...` : summary;
  };

  return (
    <div 
      className="bg-card rounded-2xl shadow-lg border border-border flex items-center p-4 mb-3 transition-all duration-200 hover:shadow-xl hover:border-indigo-300 cursor-pointer"
      onClick={() => onSelect(product.analysisId)}
    >
      {/* Product Image Container */}
      <div className="w-16 h-16 rounded-xl bg-card flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
        {product.imageUrl ? (
          <img 
            src={product.imageUrl} 
            alt={product.productName} 
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="bg-muted w-full h-full flex items-center justify-center">
            <div className="bg-muted-foreground border-2 border-dashed rounded-xl w-12 h-12" />
          </div>
        )}
      </div>

      {/* Spacing between image and text */}
      <div className="w-4" />

      {/* Text Block */}
      <div className="flex-grow min-w-0">
        {/* Product Name */}
        <h3 className="text-base font-bold text-foreground truncate">
          {truncateProductName(product.productName)}
        </h3>
        
        {/* Product Description */}
        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
          {truncateSummary(product.productSummary)}
        </p>
      </div>

      {/* Spacing between text and icon */}
      <div className="w-3" />

      {/* Action Icon - Increased size to meet 44x44px minimum */}
      <div className="w-11 h-11 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0"> {/* Changed from w-10 h-10 to w-11 h-11 */}
        <ChevronRight className="h-5 w-5 text-white" />
      </div>
    </div>
  );
};

/**
 * Screen displayed when one or more products are detected, allowing user selection.
 * Implemented as a bottom sheet/modal panel that slides up from the bottom.
 */
export function ProductSelectionScreen({
  detectedProducts,
  imageThumbnailUrl,
  onProductSelect,
  onRescan,
  onClose, // Added onClose handler
}: ProductSelectionScreenProps) {
  
  return (
    <>
      {/* Backdrop overlay for dimming background */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-60 z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Bottom Sheet Container */}
      <div className="fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out">
        <div className="bg-transparent shadow-2xl mx-auto mb-4 max-w-md w-full">
          {/* Drag handle for visual indication */}
          <div className="flex justify-center pt-3">
            <div className="w-12 h-1.5 bg-muted rounded-full"></div>
          </div>
          
          {/* Product Cards Container - Only display cards */}
          <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
            {detectedProducts.map((product) => (
              <ProductPreviewCard
                key={product.analysisId}
                product={product}
                onSelect={onProductSelect}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
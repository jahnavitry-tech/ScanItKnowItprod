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

      {/* Action Icon */}
      <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
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
        <div className="bg-background rounded-t-3xl shadow-2xl mx-2 mb-4 border-t border-border">
          {/* Drag handle for visual indication */}
          <div className="flex justify-center pt-3">
            <div className="w-12 h-1.5 bg-muted rounded-full"></div>
          </div>
          
          {/* Header Section */}
          <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 overflow-hidden rounded-md border border-border flex-shrink-0 shadow-sm">
                <img
                  src={imageThumbnailUrl}
                  alt="Captured product thumbnail"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{detectedProducts.length === 1 ? "Product Detected" : "Multiple Items Detected"}</h2>
                <p className="text-sm text-muted-foreground">{detectedProducts.length === 1 ? "Review and analyze this product" : "Select the product you wish to analyze"}</p>
              </div>
            </div>
            
            {/* Close button */}
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 hover:bg-muted/80 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-foreground" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Product Cards Container */}
          <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
            {detectedProducts.map((product) => (
              <ProductPreviewCard
                key={product.analysisId}
                product={product}
                onSelect={onProductSelect}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2 border-t border-border p-4 bg-card rounded-b-3xl">
            <Button onClick={onRescan} variant="outline" className="flex-1" data-testid="button-rescan">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Rescan Image
            </Button>
            <Button onClick={onClose} variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
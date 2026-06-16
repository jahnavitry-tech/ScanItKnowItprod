import { useState, useEffect } from "react";
import { Camera, ChevronRight, RotateCcw, Zap } from "lucide-react";
import type { ProductAnalysis } from "@/types/analysis";

interface ProductSelectionScreenProps {
  detectedProducts: ProductAnalysis[];
  imageThumbnailUrl: string;
  onProductSelect: (analysisId: string) => void;
  onRescan: () => void;
  onClose: () => void;
}

export function ProductSelectionScreen({
  detectedProducts,
  imageThumbnailUrl,
  onProductSelect,
  onRescan,
  onClose,
}: ProductSelectionScreenProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Slide-up animation: mount with translateY-full, then animate to 0
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t); }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAnalyzeSelected = () => {
    const first = detectedProducts.find(p => selectedIds.has(p.analysisId));
    if (first) onProductSelect(first.analysisId);
  };

  const handleAnalyzeAll = () => {
    if (detectedProducts.length > 0) onProductSelect(detectedProducts[0].analysisId);
  };

  const count = selectedIds.size;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />

      {/* Bottom sheet with slide-up animation */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Constrain width to match camera column on wider screens */}
        <div className="mx-auto w-full max-w-sm">
          <div className="bg-sheet-bg rounded-t-3xl shadow-2xl overflow-hidden border-t border-l border-r border-sheet-border">
            {/* Drag handle */}
            <div className="relative flex justify-center pt-3 pb-1">
              <div className="absolute left-4 top-5 w-1.5 h-6 rounded-full bg-queue-glow opacity-70" />
              <div className="w-10 h-1 bg-sheet-muted/40 rounded-full" />
            </div>

            {/* Thumbnail + header row */}
            <div className="flex items-center gap-3 px-5 py-3">
              {imageThumbnailUrl && (
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-sheet-card">
                  <img src={imageThumbnailUrl} alt="Scanned" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-grow min-w-0">
                <h2 className="text-sheet-text font-semibold text-base">
                  {detectedProducts.length === 1 ? "1 product identified" : `${detectedProducts.length} products identified`}
                </h2>
                <p className="text-sheet-muted text-xs mt-0.5">
                  {count > 0 ? `${count} selected` : "Tap a card to select"}
                </p>
              </div>
              <button
                onClick={onRescan}
                className="w-9 h-9 rounded-xl bg-sheet-card border border-sheet-border flex items-center justify-center flex-shrink-0"
                title="Rescan"
              >
                <RotateCcw className="h-4 w-4 text-sheet-muted" />
              </button>
            </div>

            {/* Product cards */}
            <div className="px-4 pb-3 max-h-[46vh] overflow-y-auto space-y-2">
              {detectedProducts.map((product) => {
                const selected = selectedIds.has(product.analysisId);
                const words = product.productName.split(' ');
                const shortName = words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');

                return (
                  <button
                    key={product.analysisId}
                    onClick={() => toggleSelect(product.analysisId)}
                    className={`w-full flex items-center p-3 rounded-2xl border transition-all duration-150 text-left ${
                      selected
                        ? 'bg-sheet-selected border-sheet-selected-border animate-border-glow'
                        : 'bg-sheet-card border-sheet-border hover:opacity-80'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                      {product.imageUrl || imageThumbnailUrl ? (
                        <img
                          src={product.imageUrl || imageThumbnailUrl}
                          alt={product.productName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="h-5 w-5 text-sheet-muted" />
                      )}
                    </div>

                    <div className="w-3 flex-shrink-0" />

                    {/* Text */}
                    <div className="flex-grow min-w-0">
                      <h3 className={`font-semibold text-sm truncate ${selected ? 'text-scanner-accent' : 'text-sheet-text'}`}>
                        {shortName}
                      </h3>
                      <p className="text-sheet-muted text-xs mt-0.5 line-clamp-2">{product.productSummary}</p>
                    </div>

                    <div className="w-3 flex-shrink-0" />

                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                      selected ? 'bg-scanner-accent border-scanner-accent' : 'border-sheet-muted/50'
                    }`}>
                      {selected && (
                        <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
                          <path d="M1 5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-8 pt-2 flex gap-3">
              <button
                onClick={handleAnalyzeSelected}
                disabled={count === 0}
                className={`flex-1 h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  count > 0
                    ? 'bg-scanner-accent text-white active:scale-95'
                    : 'bg-sheet-card border border-sheet-border text-sheet-muted cursor-not-allowed'
                }`}
              >
                <Zap className="h-4 w-4" />
                {count > 0 ? `Analyze (${count})` : 'Select to analyze'}
              </button>

              <button
                onClick={handleAnalyzeAll}
                className="flex-1 h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 bg-sheet-card border border-sheet-border text-sheet-text active:scale-95 transition-all hover:opacity-80"
              >
                <ChevronRight className="h-4 w-4" />
                Analyze All
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

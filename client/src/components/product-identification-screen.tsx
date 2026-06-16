import { useState } from "react";
import { X, Plus, Minus, ChevronRight } from "lucide-react";
import type { ProductAnalysis, HighlightColor, ProductBoundingBox } from "@/types/analysis";
import { Logo } from "./Logo";

interface ProductIdentificationScreenProps {
  detectedProducts: ProductAnalysis[];
  capturedImageUrl: string;
  onProductSelect: (analysisId: string | string[]) => void;
  onAnalyzeAll: () => void;
  onClose: () => void;
}

const COLORS: HighlightColor[] = ['green', 'blue', 'pink'];
const BOX_LAYOUTS = [
  { xPercent: 10, yPercent: 15, widthPercent: 45, heightPercent: 40 },
  { xPercent: 55, yPercent: 38, widthPercent: 38, heightPercent: 40 },
  { xPercent: 20, yPercent: 53, widthPercent: 46, heightPercent: 34 },
  { xPercent: 5,  yPercent: 10, widthPercent: 55, heightPercent: 55 },
];

const COLOR_STYLES: Record<HighlightColor, {
  border: string; fill: string; chipBg: string; chipText: string;
  chipBorder: string; queueBg: string; shadow: string;
}> = {
  green: {
    border: '#B2F746',
    fill: 'rgba(178,247,70,0.14)',
    chipBg: 'rgba(178,247,70,0.15)',
    chipText: '#4a7a00',
    chipBorder: 'rgba(178,247,70,0.4)',
    queueBg: 'rgba(178,247,70,0.07)',
    shadow: 'rgba(178,247,70,0.3)',
  },
  blue: {
    border: '#4466FA',
    fill: 'rgba(68,102,250,0.14)',
    chipBg: 'rgba(68,102,250,0.15)',
    chipText: '#ffffff',
    chipBorder: 'rgba(68,102,250,0.4)',
    queueBg: 'rgba(68,102,250,0.07)',
    shadow: 'rgba(68,102,250,0.3)',
  },
  pink: {
    border: '#FF86C3',
    fill: 'rgba(255,134,195,0.14)',
    chipBg: 'rgba(255,134,195,0.15)',
    chipText: '#7a003a',
    chipBorder: 'rgba(255,134,195,0.4)',
    queueBg: 'rgba(255,134,195,0.07)',
    shadow: 'rgba(255,134,195,0.3)',
  },
};

export function ProductIdentificationScreen({
  detectedProducts,
  capturedImageUrl,
  onProductSelect,
  onAnalyzeAll,
  onClose,
}: ProductIdentificationScreenProps) {
  const [queueIds, setQueueIds] = useState<string[]>([]);

  const toggleQueue = (id: string) => {
    setQueueIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const boxes = detectedProducts.map((p, i) => ({
    ...p,
    color: COLORS[i % COLORS.length] as HighlightColor,
    boundingBox: BOX_LAYOUTS[i % BOX_LAYOUTS.length] as Omit<ProductBoundingBox, 'color'>,
  }));

  const queuedProducts = queueIds
    .map(id => boxes.find(b => b.analysisId === id))
    .filter(Boolean) as typeof boxes;

  return (
    <div className="fixed inset-0 z-30 bg-[#0E0E0E]">

      {/* Full-screen image */}
      <img
        src={capturedImageUrl}
        alt="Captured"
        className="absolute inset-0 w-full h-full object-cover z-0"
      />
      <div className="absolute inset-0 bg-black/15 z-0" />

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-12 pb-3">
        <Logo dark size="sm" />
        <div className="flex items-center gap-2">
          {/* Detected count badge */}
          <div
            className="px-3 py-1 rounded-full text-white/60"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.10)',
              fontSize: 11,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
            }}
          >
            {detectedProducts.length} product{detectedProducts.length !== 1 ? 's' : ''} detected
          </div>
          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-90"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Bounding boxes over image ── */}
      <div className="absolute inset-0 z-10">
        {boxes.map((product, index) => {
          const box   = product.boundingBox;
          const style = COLOR_STYLES[product.color];
          const inQueue = queueIds.includes(product.analysisId);
          const shortName = product.productName.length > 22
            ? product.productName.slice(0, 22) + '…'
            : product.productName;

          return (
            <div
              key={product.analysisId}
              onClick={() => toggleQueue(product.analysisId)}
              className="absolute cursor-pointer transition-all duration-200"
              style={{
                left:   `${box.xPercent}%`,
                top:    `${box.yPercent}%`,
                width:  `${box.widthPercent}%`,
                height: `${box.heightPercent}%`,
                border: `2px solid ${style.border}`,
                borderRadius: 8,
                backgroundColor: inQueue ? style.fill : 'transparent',
                boxShadow: inQueue ? `0 0 16px ${style.shadow}` : 'none',
              }}
            >
              {/* Product name chip above box */}
              <div
                className="absolute animate-label-in"
                style={{
                  top: 0, left: 0,
                  transform: 'translateY(-100%)',
                  marginTop: -4,
                  animationDelay: `${index * 80}ms`,
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    background: style.chipBg,
                    color: style.chipText,
                    border: `1px solid ${style.chipBorder}`,
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'Inter, sans-serif',
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {shortName}
                </span>
              </div>

              {/* Toggle button */}
              <div
                className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: style.border }}
              >
                {inQueue
                  ? <Minus className="w-3 h-3 text-black" strokeWidth={3} />
                  : <Plus  className="w-3 h-3 text-black" strokeWidth={3} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom sheet ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl animate-sheet-up scrollbar-hide"
        style={{
          background: 'rgba(14,16,22,0.95)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          maxHeight: '55vh',
          overflowY: 'auto',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <div className="flex items-center gap-2">
            <span
              className="uppercase tracking-widest text-white/40"
              style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}
            >
              Queue
            </span>
            {queuedProducts.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#2d3a8c] text-white text-[10px] font-bold flex items-center justify-center">
                {queuedProducts.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {queuedProducts.length > 0 && (
              <button
                onClick={() => setQueueIds([])}
                className="text-white/40 text-xs hover:text-white/70 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setQueueIds(boxes.map(b => b.analysisId))}
              className="text-[#94aaff] text-xs font-semibold hover:text-[#c0ccff] transition-colors"
            >
              Add All
            </button>
          </div>
        </div>

        {/* Queue cards or empty hint */}
        <div className="px-4 space-y-2">
          {queuedProducts.length === 0 ? (
            <p className="text-white/25 text-xs pb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              Tap a highlighted product in the image above to add it to the queue
            </p>
          ) : (
            queuedProducts.map((product) => {
              const style = COLOR_STYLES[product.color];
              return (
                <div
                  key={product.analysisId}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer active:scale-[0.98] transition-all duration-200"
                  style={{
                    background: style.queueBg,
                    border: `1px solid ${style.border}40`,
                  }}
                  onClick={() => onProductSelect(product.analysisId)}
                >
                  <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-[#1A1A1A] border border-white/10">
                    <img
                      src={product.imageUrl || capturedImageUrl}
                      alt={product.productName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-sm truncate" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {product.productName}
                    </h3>
                    <p className="text-white/50 text-xs mt-0.5 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {product.productSummary}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onProductSelect(product.analysisId); }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 hover:bg-white/20 transition-colors"
                    aria-label="Analyze"
                  >
                    <ChevronRight className="w-4 h-4 text-white/70" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleQueue(product.analysisId); }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 hover:bg-red-500/30 transition-colors"
                    aria-label="Remove"
                  >
                    <Minus className="w-3.5 h-3.5 text-white/70" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Analyse CTA */}
        <div className="px-4 pt-3 pb-8">
          <button
            onClick={queuedProducts.length > 0
              ? () => onProductSelect(queueIds)
              : () => onProductSelect(boxes.map(b => b.analysisId))}
            className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white"
            style={{
              fontFamily: 'Manrope, sans-serif',
              fontSize: 15,
              background: queuedProducts.length > 0
                ? 'linear-gradient(90deg, #2d3a8c, hsl(221,83%,45%))'
                : 'rgba(255,255,255,0.10)',
              boxShadow: queuedProducts.length > 0 ? '0 4px 20px rgba(45,58,140,0.4)' : 'none',
              color: queuedProducts.length > 0 ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {queuedProducts.length > 0
              ? `Analyze Queue (${queuedProducts.length})`
              : 'Analyze All'}
          </button>
        </div>
      </div>
    </div>
  );
}

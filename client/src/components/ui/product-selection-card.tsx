import { ChevronRight, Camera } from "lucide-react";
import React from 'react';
import type { ProductAnalysis } from "@/types/analysis";

interface ProductSelectionCardProps {
  product: ProductAnalysis;
  onClick: (product: ProductAnalysis) => void;
  // This prop will hold the image thumbnail from the scan if available
  imageThumbnailUrl: string; 
}

/**
 * Renders a single, actionable product selection card based on the detailed UI specification.
 */
export const ProductSelectionCard: React.FC<ProductSelectionCardProps> = ({ product, onClick, imageThumbnailUrl }) => {
  // Truncation Logic (Frontend Constraint)
  const productNameWords = product.productName.split(' ');
  const shortProductName = productNameWords.slice(0, 3).join(' ') + (productNameWords.length > 3 ? '...' : '');

  // Summary Logic (Frontend Constraint)
  const summaryText = product.summary;

  return (
    <button
      onClick={() => onClick(product)}
      // 1. Overall Container: rounded-[32px], p-3 (12px), bg-white, card-shadow
      className="w-full text-left transition duration-150 ease-in-out hover:bg-gray-50 bg-white rounded-[32px] shadow-lg flex items-center p-3 cursor-pointer mb-3"
      style={{ boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)' }}
    >
      
      {/* 2. Product Image / Placeholder Area: 60x60px, rounded-lg (8px) */}
      <div className="w-[60px] h-[60px] rounded-lg border border-gray-200 bg-white flex items-center justify-center flex-shrink-0">
        {imageThumbnailUrl ? (
          // NOTE: In a real app, this should be a cropped version of the original image
          // For simplicity, we use a static image or placeholder here
          <img 
            src={imageThumbnailUrl} 
            alt={product.productName} 
            className="w-full h-full object-cover rounded-lg"
            onError={(e) => {
              // Fallback to placeholder on image load error
              (e.currentTarget as HTMLImageElement).style.display = 'none'; 
              if (e.currentTarget.nextSibling) {
                (e.currentTarget.nextSibling as HTMLElement).style.removeProperty('display');
              }
            }}
          />
        ) : null}
        
        <div className={`flex items-center justify-center w-full h-full ${imageThumbnailUrl ? 'hidden' : ''}`}>
           <Camera className="h-6 w-6 text-gray-400" />
        </div>
      </div>
      
      {/* Spacing: 12px horizontal distance */}
      <div className="w-3 flex-shrink-0"></div>

      {/* 3. Text Content Area: Vertical Stack, flex-grow */}
      <div className="flex-grow flex flex-col justify-center min-w-0">
        
        {/* Product Name: 18px / Semi-Bold / Dark, mb-0.5 (2px) */}
        <h2 className="text-lg font-semibold text-gray-900 leading-snug truncate" style={{ marginBottom: '2px' }}>
          {shortProductName}
        </h2>
        
        {/* Summary Text: 14px / Regular / Medium Gray, mt-0.5 (2px), limited to 3 lines */}
        <p className="text-sm text-gray-600 line-clamp-3" style={{ marginTop: '2px' }}>
          {summaryText}
        </p>
      </div>
      
      {/* 4. Action Indicator (CTA): 56x56px, rounded-2xl (16px), Vibrant Blue/Purple */}
      <div className="w-14 h-14 rounded-[16px] flex items-center justify-center flex-shrink-0 ml-4"
           style={{ backgroundColor: '#7C3AED' }}>
        
        {/* Icon: Chevron Right (24x24px) - stroke-width 3 for boldness */}
        <ChevronRight className="h-6 w-6 text-white" strokeWidth={3} />
      </div>
    </button>
  );
};
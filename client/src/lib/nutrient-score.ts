import type { ICompositionAnalysis } from "@/types/analysis";

export interface NutrientScore {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  color: string;       // Tailwind color for text
  ringColor: string;   // hex for SVG stroke
}

export function computeNutrientDensityScore(composition: ICompositionAnalysis | null): NutrientScore | null {
  if (!composition) return null;

  const { calories, totalProtein, compositionalDetails } = composition;

  // Non-food products (no calorie data)
  if (calories === 0 && totalProtein === 0) return null;

  const fiber = (() => {
    const item = compositionalDetails.find(d => d.key.toLowerCase().includes('fiber') || d.key.toLowerCase().includes('fibre'));
    if (!item) return 0;
    return parseFloat(item.value) || 0;
  })();

  const vitaminsCount = compositionalDetails.filter(d =>
    d.key.toLowerCase().includes('vitamin') || d.key.toLowerCase().includes('mineral')
  ).length;

  const raw = (totalProtein * 4 + fiber * 3 + vitaminsCount * 2) / Math.max(calories, 1) * 100;
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  if (score >= 75) return { score, label: 'Excellent', color: 'text-green-500',  ringColor: '#22c55e' };
  if (score >= 50) return { score, label: 'Good',      color: 'text-blue-500',   ringColor: '#3b82f6' };
  if (score >= 25) return { score, label: 'Fair',      color: 'text-amber-500',  ringColor: '#f59e0b' };
  return               { score, label: 'Poor',         color: 'text-red-500',    ringColor: '#ef4444' };
}

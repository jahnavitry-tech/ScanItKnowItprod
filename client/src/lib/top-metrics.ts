import type { ICompositionAnalysis } from "@/types/analysis";

export interface TopMetric {
  label: string;
  value: string;
  unit: string;
  icon: string;
  colorClass: string;
  percentOfDaily?: number;
}

const DAILY_REF: Record<string, number> = {
  calories:  2000,
  fat:       78,
  protein:   50,
  carb:      275,
  fiber:     28,
  sugar:     50,
  sodium:    2300,
  calcium:   1300,
  iron:      18,
  potassium: 4700,
};

function pct(value: number, key: string): number | undefined {
  const ref = DAILY_REF[key];
  if (!ref || value === 0) return undefined;
  return Math.min(100, Math.round((value / ref) * 100));
}

function findDetail(details: { key: string; value: string }[], term: string): number {
  const item = details.find(d => d.key.toLowerCase().includes(term));
  if (!item) return 0;
  return parseFloat(item.value) || 0;
}

export function getTopThreeMetrics(composition: ICompositionAnalysis, productName: string): TopMetric[] {
  const { calories, totalFat, totalProtein, compositionalDetails, productCategory } = composition;
  const name = productName.toLowerCase();
  const cat  = (productCategory || '').toLowerCase();

  const isCosmetic = calories === 0 && (
    ['cream', 'lotion', 'serum', 'shampoo', 'conditioner', 'moisturizer', 'cleanser', 'toner', 'gel', 'balm'].some(k => name.includes(k) || cat.includes(k))
  );
  const isBeverage = ['water', 'juice', 'drink', 'beverage', 'soda', 'tea', 'coffee'].some(k => name.includes(k));

  if (isCosmetic) {
    // Show first 3 compositional details for cosmetics
    const top3 = compositionalDetails.slice(0, 3);
    if (top3.length > 0) {
      return top3.map(item => ({
        label: item.key,
        value: item.value,
        unit: '',
        icon: '🧴',
        colorClass: 'text-purple-500',
      }));
    }
    return [{ label: 'Ingredients', value: String(compositionalDetails.length), unit: 'listed', icon: '🧴', colorClass: 'text-purple-500' }];
  }

  if (isBeverage) {
    const sugar  = findDetail(compositionalDetails, 'sugar');
    const sodium = findDetail(compositionalDetails, 'sodium');
    const caffeine = findDetail(compositionalDetails, 'caffeine');
    const metrics: TopMetric[] = [
      { label: 'Sugar',   value: String(sugar),   unit: 'g',  icon: '🍬', colorClass: 'text-pink-500',   percentOfDaily: pct(sugar, 'sugar') },
      { label: 'Sodium',  value: String(sodium),  unit: 'mg', icon: '🧂', colorClass: 'text-amber-500',  percentOfDaily: pct(sodium, 'sodium') },
    ];
    if (caffeine > 0) metrics.push({ label: 'Caffeine', value: String(caffeine), unit: 'mg', icon: '☕', colorClass: 'text-brown-500' });
    else metrics.push({ label: 'Calories', value: String(calories), unit: 'kcal', icon: '🔥', colorClass: 'text-orange-500', percentOfDaily: pct(calories, 'calories') });
    return metrics.slice(0, 3);
  }

  // Food products
  const fiber  = findDetail(compositionalDetails, 'fiber');
  const sugar  = findDetail(compositionalDetails, 'sugar');
  const sodium = findDetail(compositionalDetails, 'sodium');

  const candidates: TopMetric[] = [
    { label: 'Calories', value: String(calories),     unit: 'kcal', icon: '🔥', colorClass: 'text-orange-500', percentOfDaily: pct(calories, 'calories') },
    { label: 'Protein',  value: String(totalProtein), unit: 'g',    icon: '💪', colorClass: 'text-blue-500',   percentOfDaily: pct(totalProtein, 'protein') },
    { label: 'Fat',      value: String(totalFat),     unit: 'g',    icon: '🫙', colorClass: 'text-yellow-500', percentOfDaily: pct(totalFat, 'fat') },
    { label: 'Fiber',    value: String(fiber),        unit: 'g',    icon: '🌾', colorClass: 'text-green-500',  percentOfDaily: pct(fiber, 'fiber') },
    { label: 'Sugar',    value: String(sugar),        unit: 'g',    icon: '🍬', colorClass: 'text-pink-500',   percentOfDaily: pct(sugar, 'sugar') },
    { label: 'Sodium',   value: String(sodium),       unit: 'mg',   icon: '🧂', colorClass: 'text-amber-500',  percentOfDaily: pct(sodium, 'sodium') },
  ].filter(m => parseFloat(m.value) > 0);

  // Always show calories first, then pick next 2 highest % of daily
  const first = candidates.find(m => m.label === 'Calories');
  const rest  = candidates.filter(m => m.label !== 'Calories')
    .sort((a, b) => (b.percentOfDaily ?? 0) - (a.percentOfDaily ?? 0))
    .slice(0, 2);

  return first ? [first, ...rest] : candidates.slice(0, 3);
}

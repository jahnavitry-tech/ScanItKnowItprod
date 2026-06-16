import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import {
  ChevronDown, Leaf, Flame, Star, RefreshCw, AlertTriangle,
  MessageCircle, Package, Dumbbell, Droplets, Zap, Sparkles,
  Cookie, Layers, Sun, ShieldCheck, Heart, Wind, CircleSlash,
  Feather, Stethoscope, Shield, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataErrorState } from "./data-error-state";

// Map from AI-provided Lucide icon name strings to actual components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Flame, Star, Leaf, Package, Dumbbell, Droplets, Zap, Sparkles,
  Cookie, Layers, Sun, ShieldCheck, Heart, Wind, CircleSlash,
  Feather, Stethoscope, Shield, XCircle, MessageCircle,
  Protein: Dumbbell, Fat: Droplets, Fiber: Layers,
};
const ChatInterfaceLazy = lazy(() =>
  import("./chat-interface").then(m => ({ default: m.ChatInterface }))
);
import type { CardType, CardData, ICompositionAnalysis, NutritionHighlight } from "@/types/analysis";
import { detectAllergens } from "@/lib/dietary-filters";

type ProductType = 'food' | 'cosmetic' | 'other';

interface AnalysisCardProps {
  title: string;
  description: string;
  cardType?: CardType;
  icon?: React.ComponentType<any> | null;
  children?: React.ReactNode;
  isLoading?: boolean;
  onExpand: () => void;
  onRefresh?: () => void;
  isExpanded: boolean;
  productName?: string;
  productSummary?: string;
  extractedText?: any;
  analysisId?: string;
  data?: CardData[keyof CardData];
  onDataLoaded?: (type: CardType, data: any) => void;
  ingredients?: string;
  compositionData?: ICompositionAnalysis | null;
  productType?: ProductType;
}

// ─── Nutrition highlight computation ─────────────────────────────────────────

function computeHighlights(comp: ICompositionAnalysis, productName: string): NutritionHighlight[] {
  const details = comp.compositionalDetails ?? [];
  const findVal = (key: string): number => {
    const d = details.find(d => d.key?.toLowerCase().includes(key.toLowerCase()));
    if (!d) return 0;
    return parseFloat(d.value) || 0;
  };

  const cal      = comp.calories  ?? 0;
  const fat      = comp.totalFat  ?? 0;
  const protein  = comp.totalProtein ?? 0;
  const sugar    = findVal('sugar');
  const sodium   = findVal('sodium');
  const fiber    = findVal('fiber');
  const carbs    = findVal('carb');
  const vitC     = findVal('vitamin c');
  const calcium  = findVal('calcium');
  const iron     = findVal('iron');

  // Daily value references
  const DV: Record<string, number> = {
    fat: 78, protein: 50, sugar: 50, sodium: 2300,
    fiber: 28, carbs: 275, calories: 2000,
  };

  type HLevel = 'low' | 'medium' | 'high' | 'excellent' | 'concern' | 'none';
  const levelInfo = (pct: number): { level: HLevel; levelLabel: string } => {
    if (pct === 0) return { level: 'none',      levelLabel: 'None'      };
    if (pct < 10)  return { level: 'low',       levelLabel: 'Low'       };
    if (pct < 20)  return { level: 'medium',    levelLabel: 'Moderate'  };
    if (pct < 40)  return { level: 'high',      levelLabel: 'High'      };
    return           { level: 'excellent', levelLabel: 'Excellent' };
  };

  const arcColors: Record<HLevel, string> = {
    low:       '#22c55e',
    medium:    '#f59e0b',
    high:      '#ef4444',
    excellent: '#3db99a',
    concern:   '#ef4444',
    none:      '#d1d5db',
  };

  const calPct    = Math.min(100, Math.round((cal     / DV.calories) * 100));
  const protPct   = Math.min(100, Math.round((protein / DV.protein)  * 100));
  const sugarPct  = Math.min(100, Math.round((sugar   / DV.sugar)    * 100));
  const fatPct    = Math.min(100, Math.round((fat     / DV.fat)      * 100));
  const sodPct    = Math.min(100, Math.round((sodium  / DV.sodium)   * 100));
  const fiberPct  = Math.min(100, Math.round((fiber   / DV.fiber)    * 100));

  const candidates: NutritionHighlight[] = [
    {
      label: 'Calories', value: String(cal), unit: 'kcal',
      arcPercent: calPct, ...levelInfo(calPct),
      iconEmoji: '🔥', iconColor: 'text-orange-500', iconBg: 'bg-orange-50', arcColor: arcColors[levelInfo(calPct).level],
    },
    {
      label: 'Protein', value: String(protein), unit: 'g',
      arcPercent: protPct, ...levelInfo(protPct),
      iconEmoji: '💪', iconColor: 'text-blue-500', iconBg: 'bg-blue-50', arcColor: arcColors[levelInfo(protPct).level],
    },
    ...(sugar > 0 ? [{
      label: 'Sugar', value: String(sugar), unit: 'g',
      arcPercent: sugarPct, ...levelInfo(sugarPct),
      iconEmoji: '🍬', iconColor: 'text-pink-500', iconBg: 'bg-pink-50', arcColor: arcColors[levelInfo(sugarPct).level],
    }] : []),
    ...(fiber > 0 ? [{
      label: 'Fiber', value: String(fiber), unit: 'g',
      arcPercent: fiberPct, ...levelInfo(fiberPct),
      iconEmoji: '🌾', iconColor: 'text-amber-500', iconBg: 'bg-amber-50', arcColor: arcColors[levelInfo(fiberPct).level],
    }] : []),
    ...(sodium > 0 ? [{
      label: 'Sodium', value: String(sodium), unit: 'mg',
      arcPercent: sodPct, ...levelInfo(sodPct),
      iconEmoji: '🧂', iconColor: 'text-yellow-600', iconBg: 'bg-yellow-50', arcColor: arcColors[levelInfo(sodPct).level],
    }] : []),
    ...(fat > 0 ? [{
      label: 'Total Fat', value: String(fat), unit: 'g',
      arcPercent: fatPct, ...levelInfo(fatPct),
      iconEmoji: '🫧', iconColor: 'text-purple-500', iconBg: 'bg-purple-50', arcColor: arcColors[levelInfo(fatPct).level],
    }] : []),
  ] as NutritionHighlight[];

  // Sort by significance: high/excellent first, then by arcPercent descending
  const ORDER: HLevel[] = ['excellent', 'high', 'medium', 'low', 'none'];
  candidates.sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || b.arcPercent - a.arcPercent);

  const calH = candidates.find(h => h.label === 'Calories');
  const rest  = candidates.filter(h => h.label !== 'Calories');

  // Smart pick based on product type:
  // - beverages: Sugar → Sodium (calories are often negligible)
  // - food default: Protein + Sugar are the most commonly inspected pair alongside Calories
  let pair: NutritionHighlight[];
  if (comp.productType === 'beverage') {
    const preferred = ['Sugar', 'Sodium'];
    const byPref = preferred.map(l => rest.find(h => h.label === l)).filter(Boolean) as NutritionHighlight[];
    pair = [...byPref, ...rest.filter(h => !preferred.includes(h.label))].slice(0, 2);
  } else {
    const proteinH = rest.find(h => h.label === 'Protein');
    const sugarH   = rest.find(h => h.label === 'Sugar');
    if (proteinH && sugarH) {
      pair = [proteinH, sugarH];
    } else {
      pair = rest.slice(0, 2);
    }
  }

  return [calH, ...pair].filter(Boolean).slice(0, 3) as NutritionHighlight[];
}

// ─── Arc SVG ──────────────────────────────────────────────────────────────────

function ArcHighlight({ h }: { h: NutritionHighlight }) {
  const ARC_LEN = 57;
  const filled  = (h.arcPercent / 100) * ARC_LEN;

  const levelColors: Record<string, string> = {
    low:       'bg-green-50 text-green-700',
    medium:    'bg-amber-50 text-amber-700',
    high:      'bg-red-50 text-red-700',
    excellent: 'bg-teal-50 text-teal-700',
    concern:   'bg-red-50 text-red-700',
    none:      'bg-gray-50 text-gray-500',
  };

  const LucideIcon = h.lucideIcon ? ICON_MAP[h.lucideIcon] : null;

  return (
    <div className="nh-card">
      {/* Icon */}
      <div className={`w-6 h-6 rounded-full ${h.iconBg} flex items-center justify-center flex-shrink-0`}>
        {LucideIcon
          ? <LucideIcon className={`w-3.5 h-3.5 ${h.iconColor}`} />
          : <span style={{ fontSize: 12 }}>{h.iconEmoji ?? '●'}</span>
        }
      </div>

      {/* Arc SVG — scaled down to fit narrow column */}
      <svg width="40" height="22" viewBox="0 0 44 24" style={{ flexShrink: 0, overflow: 'visible' }}>
        <path d="M4 20 A18 18 0 0 1 40 20" fill="none" stroke="#f3f4f6" strokeWidth="4" strokeLinecap="round" />
        <path d="M4 20 A18 18 0 0 1 40 20" fill="none" stroke={h.arcColor} strokeWidth="4"
              strokeLinecap="round" strokeDasharray={`${filled} ${ARC_LEN}`} />
      </svg>

      {/* Value — title line 1 */}
      <p className="nh-val text-[13px] font-extrabold text-gray-900 dark:text-white"
         style={{ fontFamily: 'Manrope, sans-serif', lineHeight: 1, marginTop: -2 }}>
        {h.value}
        {h.unit && <span style={{ fontSize: 8, fontWeight: 600, color: '#9ca3af', marginLeft: 2 }}>{h.unit}</span>}
      </p>

      {/* Label — line 2 */}
      <p className="nh-lbl text-[9px] font-semibold text-gray-400"
         style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.2 }}>
        {h.label}
      </p>

      {/* Level pill — line 3 */}
      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${levelColors[h.level] ?? levelColors.none}`}
            style={{ whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', textAlign: 'center' }}>
        {h.levelLabel}
      </span>
    </div>
  );
}

// ─── Nutrient row ─────────────────────────────────────────────────────────────

function NutrientRow({ label, value, unit, notes, barColor = '#2d3a8c', pct = 0, dvPct }: {
  label: string; value: string; unit?: string; notes?: string; barColor?: string; pct?: number; dvPct?: number;
}) {
  const dvColor = dvPct === undefined ? '' :
    dvPct >= 20 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
    dvPct >= 10 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400';

  return (
    <div className="nutr-row py-1.5 border-b border-black/4 dark:border-white/5 last:border-0">
      <span className="nr-name text-[11px] text-gray-500 dark:text-gray-400 leading-tight"
            style={{ fontFamily: 'Inter, sans-serif' }}>
        {label}
        {notes && (
          <span className="block text-[9px] text-gray-400 dark:text-gray-500 font-normal mt-0.5"
                style={{ fontFamily: 'Inter, sans-serif' }}>
            {notes}
          </span>
        )}
      </span>
      <div className="nr-bar" style={{ background: '#f3f4f6' }}>
        <div className="h-full rounded-full transition-all duration-500"
             style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: barColor }} />
      </div>
      <span className="nr-val text-[11px] font-bold text-gray-900 dark:text-white"
            style={{ fontFamily: 'Manrope, sans-serif' }}>
        {value}{unit ?? ''}
      </span>
      {dvPct !== undefined && (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-1 ${dvColor}`}>
          {dvPct}% DV
        </span>
      )}
    </div>
  );
}

// ─── AnalysisCard ─────────────────────────────────────────────────────────────

const AnalysisCard: React.FC<AnalysisCardProps> = ({
  title, description, cardType, icon: Icon, children,
  isLoading = false, onExpand, onRefresh, isExpanded,
  productName, extractedText, analysisId, data,
  ingredients, compositionData, productType = 'food',
}) => {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [ingFilter, setIngFilter] = useState<'all' | 'safe' | 'moderate' | 'concern'>('all');
  const [nutrFilter, setNutrFilter] = useState<'all' | 'macros' | 'vitamins' | 'minerals'>('all');
  const [cosmFilter, setCosmFilter] = useState<'all' | 'actives' | 'base' | 'warnings'>('all');
  useEffect(() => { if (data && !hasLoaded) setHasLoaded(true); }, [data, hasLoaded]);

  // 3-second debounce guard — prevents rapid taps from burning multiple Gemini calls.
  const lastRefreshRef = useRef(0);
  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 3000) return;
    lastRefreshRef.current = now;
    onRefresh();
  }, [onRefresh]);

  const renderLoading = (msg: string) => (
    <div className="flex flex-col items-center justify-center h-28 gap-2">
      <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin"
           style={{ borderTopColor: '#2d3a8c' }} />
      <p className="text-[11px] text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>{msg}</p>
    </div>
  );

  const renderCardContent = () => {
    // Skeleton only when there is no data yet. While re-fetching (data exists
    // but isLoading=true), keep old data visible — the spinning Refresh button
    // is the progress indicator so the card does not flicker.
    if (isExpanded && !data && cardType !== 'qa') {
      if (cardType === 'calories') return (
        <div className="p-1 space-y-3 animate-pulse">
          <div className="h-9 bg-gray-100 dark:bg-white/8 rounded-lg" />
          <div className="flex gap-3 justify-center">
            {[0,1,2].map(i => (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                <div className="w-7 h-7 bg-gray-100 dark:bg-white/8 rounded-full" />
                <div className="w-10 h-5 bg-gray-100 dark:bg-white/8 rounded" />
                <div className="w-8 h-3 bg-gray-100 dark:bg-white/8 rounded" />
                <div className="w-12 h-4 bg-gray-100 dark:bg-white/8 rounded-full" />
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-1">
            {[0,1,2,3].map(i => <div key={i} className="h-6 bg-gray-100 dark:bg-white/8 rounded" />)}
          </div>
        </div>
      );
      if (cardType === 'ingredients') return (
        <div className="p-1 space-y-2 animate-pulse">
          <div className="flex gap-1.5 flex-wrap mb-3">
            {[0,1,2].map(i => <div key={i} className="h-6 w-20 bg-gray-100 dark:bg-white/8 rounded-full" />)}
          </div>
          {[0,1,2,3,4].map(i => (
            <div key={i} className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/8 space-y-1.5">
              <div className="flex justify-between">
                <div className="h-3.5 w-28 bg-gray-200 dark:bg-white/10 rounded" />
                <div className="h-5 w-14 bg-gray-200 dark:bg-white/10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      );
      if (cardType === 'reddit') return (
        <div className="p-1 space-y-3 animate-pulse">
          {/* Star rating row */}
          <div className="flex items-center gap-1.5">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-4 h-4 bg-gray-200 dark:bg-white/10 rounded" />
            ))}
            <div className="w-10 h-4 bg-gray-200 dark:bg-white/10 rounded ml-1" />
          </div>
          {/* Pros section */}
          <div className="space-y-1.5">
            <div className="h-3 w-12 bg-gray-100 dark:bg-white/8 rounded" />
            {[80, 65, 72].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0" />
                <div className="h-3 bg-gray-100 dark:bg-white/8 rounded" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          {/* Cons section */}
          <div className="space-y-1.5">
            <div className="h-3 w-10 bg-gray-100 dark:bg-white/8 rounded" />
            {[60, 75, 55].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-100 dark:bg-red-900/30 shrink-0" />
                <div className="h-3 bg-gray-100 dark:bg-white/8 rounded" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      );
      return renderLoading('Loading…');
    }

    if (data && (data as any).error) return (
      <DataErrorState
        message={
          cardType === 'reddit'
            ? "Reddit reviews temporarily unavailable."
            : cardType === 'calories'
            ? "Nutrition data could not be loaded."
            : "Data could not be loaded."
        }
        onRetry={handleRefresh}
      />
    );

    // ── NUTRITION / PRODUCT HIGHLIGHTS CARD ────────────────────────────────
    if (cardType === 'calories' && data) {
      const comp    = data as ICompositionAnalysis & { [k: string]: any };
      const details = comp.compositionalDetails ?? [];

      // The composition API explicitly sets calories=0 for non-food products.
      // Use this as the authoritative signal; fall back to productType prop.
      const isFood = (comp.calories ?? 0) > 0 || productType === 'food';

      /* ────── FOOD: Nutrition Facts ────── */
      if (isFood) {
        // Prefer AI-provided highlights; fall back to client-side computation
        const highlights = (comp as any).nutritionHighlights?.length
          ? (comp as any).nutritionHighlights as NutritionHighlight[]
          : computeHighlights(comp, productName ?? '');

        // Show unavailability state when the data is empty / all-zeros (API failed
        // silently and returned a zero-filled shell rather than an error object).
        const structuredDetails = details.filter((d: any) => d.key !== 'Nutrition Label (raw)' && d.key !== 'Note');
        // computeHighlights always produces a Calories entry even when value=0, so
        // checking highlights.length alone would always pass. Require at least one
        // highlight with a real (non-zero) value.
        const hasRealHighlights = highlights.some(h => parseFloat(h.value) > 0);
        const hasAnyData = (comp.calories ?? 0) > 0 || hasRealHighlights || structuredDetails.length > 0;
        if (!hasAnyData) {
          return (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <p className="text-xs text-gray-500 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                Nutrition data unavailable for this product.
              </p>
              {onRefresh && (
                <button onClick={handleRefresh}
                  className="text-xs font-semibold underline"
                  style={{ color: '#2d3a8c' }}>
                  Retry
                </button>
              )}
            </div>
          );
        }

        // Use AI-provided category tags when available, else keyword-match
        const hasAiCategories = details.some((d: any) => d.category);
        const macroKeys = ['fat', 'carb', 'protein'];
        const vitKeys   = ['vitamin', 'mineral', 'folate', 'calcium', 'iron', 'potassium', 'zinc', 'magnesium', 'phosphor'];
        const sugarKeys = ['sugar'];
        const skipKeys  = ['calories', 'calorie'];

        const macros   = details.filter((d: any) => hasAiCategories
          ? d.category === 'macronutrients'
          : macroKeys.some(k => d.key?.toLowerCase().includes(k)));
        const sugars   = details.filter((d: any) => hasAiCategories
          ? d.category === 'sugars'
          : sugarKeys.some(k => d.key?.toLowerCase().includes(k)));
        const vitamins = details.filter((d: any) => hasAiCategories
          ? ['vitamins', 'minerals'].includes(d.category)
          : vitKeys.some(k => d.key?.toLowerCase().includes(k)));
        const others   = details.filter((d: any) => hasAiCategories
          ? !['macronutrients', 'sugars', 'vitamins', 'minerals'].includes(d.category) &&
            d.category !== 'warnings'
          : (
            !macroKeys.some(k => d.key?.toLowerCase().includes(k)) &&
            !vitKeys.some(k => d.key?.toLowerCase().includes(k)) &&
            !sugarKeys.some(k => d.key?.toLowerCase().includes(k)) &&
            !skipKeys.some(k => d.key?.toLowerCase().includes(k))
          ));

        const showMacros   = nutrFilter === 'all' || nutrFilter === 'macros';
        const showSugars   = nutrFilter === 'all' || nutrFilter === 'macros';
        const showVitamins = nutrFilter === 'all' || nutrFilter === 'vitamins';
        // "others" catches keyComponents, warnings, unrecognised — always show in All and Minerals tab
        const showOthers   = nutrFilter === 'all' || nutrFilter === 'minerals';

        const visibleMacros   = showMacros   ? macros   : [];
        const visibleSugars   = showSugars   ? sugars   : [];
        const visibleVitamins = showVitamins ? vitamins : [];
        const visibleOthers   = showOthers   ? others   : [];
        const anyVisible = visibleMacros.length + visibleSugars.length + visibleVitamins.length + visibleOthers.length > 0;

        // Dynamic label: if all "other" items are meal/product components, call the section "Components"
        const othersHeading = others.length > 0 && others.every((d: any) => d.category === 'keyComponents')
          ? 'Components' : 'Other';

        const nutrPills: { key: typeof nutrFilter; label: string }[] = [
          { key: 'all',      label: 'All'             },
          { key: 'macros',   label: 'Macros'          },
          { key: 'vitamins', label: 'Vitamins'        },
          { key: 'minerals', label: 'Minerals & Other'},
        ];

        return (
          <div className="data-appear space-y-4" key={`nutr-${analysisId}`}>
            {/* Serving row — only shown when we have real values */}
            {(comp.netQuantity > 0 || comp.calories > 0) && (
              <div className="flex items-start gap-2 bg-slate-50 dark:bg-white/5 rounded-lg px-3 py-2 overflow-hidden">
                <span className="text-base flex-shrink-0">⚗️</span>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed min-w-0"
                   style={{ fontFamily: 'Inter, sans-serif', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {comp.netQuantity > 0 && (
                    <>Per serving:&nbsp;<strong>{comp.netQuantity} {comp.unitType || 'g'}</strong>&nbsp;·&nbsp;</>
                  )}
                  <strong>{comp.calories} kcal</strong>
                </p>
              </div>
            )}

            {/* Serving size header */}
            {(comp as any).servingSize && (
              <div className="text-center pb-1">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400"
                   style={{ fontFamily: 'Inter, sans-serif' }}>Serving size</p>
                <p className="text-[13px] font-bold text-gray-800 dark:text-white"
                   style={{ fontFamily: 'Manrope, sans-serif' }}>
                  {(comp as any).servingSize}
                  {(comp as any).servingsPerContainer > 0 && (
                    <span className="text-[11px] font-normal text-gray-400 ml-1.5">
                      · {(comp as any).servingsPerContainer} servings
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* 3 highlight arcs — 2-col grid, 3rd spans full width */}
            {highlights.length > 0 && (
              <div className="nutr-highlights">
                {highlights.map((h, i) => (
                  <ArcHighlight key={i} h={h} />
                ))}
              </div>
            )}

            {/* Summary stats row when arc highlights are missing */}
            {highlights.length === 0 && (comp.totalFat > 0 || comp.totalProtein > 0) && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Calories', value: `${comp.calories}`, unit: 'kcal' },
                  { label: 'Protein',  value: `${comp.totalProtein}`, unit: 'g' },
                  { label: 'Fat',      value: `${comp.totalFat}`, unit: 'g' },
                ].map(s => (
                  <div key={s.label} className="text-center p-2 bg-slate-50 dark:bg-white/5 rounded-xl">
                    <p className="text-[16px] font-extrabold text-gray-900 dark:text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {s.value}<span className="text-[9px] font-semibold text-gray-400 ml-0.5">{s.unit}</span>
                    </p>
                    <p className="text-[9px] text-gray-400 mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Filter pills — TASK 6 */}
            {(macros.length + sugars.length + vitamins.length + others.length) > 0 && (
              <div className="nutr-filter-row">
                {nutrPills.map(p => (
                  <button key={p.key}
                    className={`nf-pill${nutrFilter === p.key ? ' active' : ''}`}
                    onClick={() => setNutrFilter(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {/* Macronutrients */}
            {visibleMacros.length > 0 && (
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 pb-1 border-b border-black/6 dark:border-white/8"
                   style={{ fontFamily: 'Inter, sans-serif' }}>Macronutrients</p>
                {visibleMacros.map((d: any, i: number) => (
                  <NutrientRow key={i} label={d.key} value={d.value} unit={d.unit} notes={d.notes}
                    barColor="#6b7280"
                    pct={d.dailyValuePct ?? Math.min(100, parseFloat(d.value) / 0.6)}
                    dvPct={d.dailyValuePct} />
                ))}
              </div>
            )}

            {/* Sugars */}
            {visibleSugars.length > 0 && (
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 pb-1 border-b border-black/6 dark:border-white/8"
                   style={{ fontFamily: 'Inter, sans-serif' }}>Sugars</p>
                {visibleSugars.map((d: any, i: number) => (
                  <NutrientRow key={i} label={d.key} value={d.value} unit={d.unit} notes={d.notes}
                    barColor="#f59e0b"
                    pct={d.dailyValuePct ?? Math.min(100, parseFloat(d.value) / 0.5)}
                    dvPct={d.dailyValuePct} />
                ))}
              </div>
            )}

            {/* Vitamins & Minerals */}
            {visibleVitamins.length > 0 && (
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 pb-1 border-b border-black/6 dark:border-white/8"
                   style={{ fontFamily: 'Inter, sans-serif' }}>Vitamins &amp; Minerals</p>
                {visibleVitamins.map((d: any, i: number) => (
                  <NutrientRow key={i} label={d.key} value={d.value} unit={d.unit} notes={d.notes}
                    barColor="#22c55e"
                    pct={d.dailyValuePct ?? Math.min(100, parseFloat(d.value) / 1.2)}
                    dvPct={d.dailyValuePct} />
                ))}
              </div>
            )}

            {/* Components / Other — catches keyComponents, warnings, unrecognised */}
            {visibleOthers.length > 0 && (
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5 pb-1 border-b border-black/6 dark:border-white/8"
                   style={{ fontFamily: 'Inter, sans-serif' }}>{othersHeading}</p>
                {visibleOthers.map((d: any, i: number) => (
                  <NutrientRow key={i} label={d.key} value={d.value} unit={d.unit} notes={d.notes}
                    barColor="#2d3a8c"
                    pct={d.dailyValuePct ?? Math.min(100, parseFloat(d.value) / 0.5)}
                    dvPct={d.dailyValuePct} />
                ))}
              </div>
            )}

            {/* Empty filter state */}
            {!anyVisible && macros.length + sugars.length + vitamins.length + others.length > 0 && (
              <p className="nutr-empty">No {nutrFilter} data available for this product.</p>
            )}

            {/* Fallback when all sections empty */}
            {macros.length === 0 && sugars.length === 0 && vitamins.length === 0 && others.length === 0 && (
              <p className="text-center text-[11px] text-gray-400 py-4">
                No detailed breakdown available for this product.
              </p>
            )}
          </div>
        );
      }

      /* ────── NON-FOOD: Product Highlights ────── */
      const propStyle = (key: string): { bg: string; text: string } => {
        const k = key.toLowerCase();
        if (['moisturiz', 'hydrat', 'water', 'aqua'].some(w => k.includes(w)))                    return { bg: 'bg-blue-50',   text: 'text-blue-700'   };
        if (['active', 'retinol', 'vitamin', 'niacinamide', 'aha', 'bha', 'acid'].some(w => k.includes(w))) return { bg: 'bg-purple-50', text: 'text-purple-700' };
        if (['spf', 'sunscreen', 'uv', 'zinc oxide', 'titanium'].some(w => k.includes(w)))        return { bg: 'bg-amber-50',  text: 'text-amber-700'  };
        if (['soothing', 'calm', 'aloe', 'oat', 'chamomile', 'green tea'].some(w => k.includes(w))) return { bg: 'bg-green-50', text: 'text-green-700'  };
        if (['preserv', 'fragrance', 'parfum', 'alcohol', 'silicone'].some(w => k.includes(w)))   return { bg: 'bg-red-50',    text: 'text-red-700'    };
        return { bg: 'bg-slate-50', text: 'text-slate-700' };
      };

      // Cosmetic filter pills — TASK 7
      const cosmPills: { key: typeof cosmFilter; label: string }[] = [
        { key: 'all',      label: 'All'      },
        { key: 'actives',  label: 'Actives'  },
        { key: 'base',     label: 'Base'     },
        { key: 'warnings', label: 'Warnings' },
      ];
      const skinKw = /dry|oily|sensitive|acne|normal|combination|mature/i;
      const warnDetails   = details.filter((d: any) => d.category === 'warnings' || skinKw.test(d.key ?? ''));
      const activeDetails = details.filter((d: any) =>
        d.category === 'actives' ||
        /retinol|niacinamide|vitamin c|aha|bha|salicyl|glycol|lactic|hyaluronic|peptide|ceramide|spf|zinc oxide|titanium/i.test(d.key ?? '')
      );
      const baseDetails   = details.filter((d: any) =>
        !warnDetails.includes(d) && !activeDetails.includes(d)
      );

      const cosmVisible =
        cosmFilter === 'all'      ? details :
        cosmFilter === 'actives'  ? activeDetails :
        cosmFilter === 'base'     ? baseDetails :
        warnDetails;

      // AI-provided highlights for cosmetics (Hydration, SPF, Barrier etc.)
      const cosmeticHighlights: any[] = (comp as any).nutritionHighlights ?? [];

      return (
        <div className="data-appear space-y-3" key={`cosm-${analysisId}`}>
          {/* Use row — TASK 7 */}
          {comp.netQuantity ? (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-lg px-3 py-2">
              <span className="text-base flex-shrink-0">{productType === 'cosmetic' ? '🧴' : '📦'}</span>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 min-w-0" style={{ fontFamily: 'Inter, sans-serif' }}>
                Net quantity: <strong>{comp.netQuantity} {comp.unitType || 'ml'}</strong>
                {(comp as any).productContext?.how && (
                  <>&nbsp;·&nbsp;<span className="text-gray-400">{(comp as any).productContext.how}</span></>
                )}
              </p>
            </div>
          ) : null}

          {/* Cosmetic highlights arcs — same 2-col grid as food TASK 1 */}
          {cosmeticHighlights.length > 0 && (
            <div className="nutr-highlights">
              {cosmeticHighlights.map((h: any, i: number) => (
                <ArcHighlight key={i} h={h} />
              ))}
            </div>
          )}

          {/* Filter tabs — TASK 7 */}
          {details.length > 0 && (
            <div className="nutr-filter-row">
              {cosmPills.map(p => (
                <button key={p.key}
                  className={`nf-pill${cosmFilter === p.key ? ' active' : ''}`}
                  onClick={() => setCosmFilter(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Key components — categorized, comma-separated within 4 lines */}
          {details.length > 0 ? (
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-2"
                 style={{ fontFamily: 'Inter, sans-serif' }}>Key Components</p>
              {cosmVisible.length === 0 ? (
                <p className="nutr-empty">No {cosmFilter} components for this product.</p>
              ) : (() => {
                  const CAT_ORDER = ['actives','macronutrients','sugars','vitamins','minerals','keyComponents','warnings','other'];
                  const CAT_LABELS: Record<string, string> = {
                    actives: 'Actives', macronutrients: 'Macros', sugars: 'Sugars',
                    vitamins: 'Vitamins', minerals: 'Minerals', keyComponents: 'Components',
                    warnings: 'Cautions', other: 'Base',
                  };
                  const CAT_COLORS: Record<string, { text: string; bg: string }> = {
                    actives:        { text: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-900/20' },
                    macronutrients: { text: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-50 dark:bg-blue-900/20'     },
                    sugars:         { text: 'text-pink-700 dark:text-pink-300',     bg: 'bg-pink-50 dark:bg-pink-900/20'     },
                    vitamins:       { text: 'text-green-700 dark:text-green-300',   bg: 'bg-green-50 dark:bg-green-900/20'   },
                    minerals:       { text: 'text-teal-700 dark:text-teal-300',     bg: 'bg-teal-50 dark:bg-teal-900/20'     },
                    keyComponents:  { text: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
                    warnings:       { text: 'text-red-700 dark:text-red-300',       bg: 'bg-red-50 dark:bg-red-900/20'       },
                    other:          { text: 'text-gray-600 dark:text-gray-300',     bg: 'bg-slate-50 dark:bg-white/5'        },
                  };

                  const fmtItem = (d: any): string => {
                    const val = d.value && d.value !== 'N/A' && parseFloat(d.value) > 0
                      ? ` (${d.value}${d.unit || ''})` : '';
                    return `${d.key}${val}`;
                  };

                  if (cosmFilter !== 'all') {
                    // Filtered tab: flat comma-separated list, max 4 lines
                    const formatted = cosmVisible.map(fmtItem).join(', ');
                    const colors = CAT_COLORS[
                      cosmFilter === 'actives'  ? 'actives'  :
                      cosmFilter === 'warnings' ? 'warnings' : 'other'
                    ] ?? CAT_COLORS.other;
                    return (
                      <div className={`px-2.5 py-2 rounded-xl ${colors.bg}`}>
                        <p className={`text-[10px] leading-relaxed ${colors.text}`}
                           style={{ fontFamily: 'Inter, sans-serif', display: '-webkit-box',
                             WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                          {formatted}
                        </p>
                      </div>
                    );
                  }

                  // All tab: group by category, each group comma-separated max 4 lines
                  const groups = new Map<string, any[]>();
                  cosmVisible.forEach((d: any) => {
                    const cat = d.category || 'other';
                    if (!groups.has(cat)) groups.set(cat, []);
                    groups.get(cat)!.push(d);
                  });
                  const orderedCats = [
                    ...CAT_ORDER.filter(c => groups.has(c)),
                    ...Array.from(groups.keys()).filter(c => !CAT_ORDER.includes(c)),
                  ];

                  return (
                    <div className="space-y-1.5">
                      {orderedCats.map(cat => {
                        const items   = groups.get(cat)!;
                        const formatted = items.map(fmtItem).join(', ');
                        const label  = CAT_LABELS[cat] || cat;
                        const colors = CAT_COLORS[cat] ?? CAT_COLORS.other;
                        return (
                          <div key={cat} className={`px-2.5 py-2 rounded-xl ${colors.bg}`}>
                            <p className={`text-[9px] font-extrabold uppercase tracking-wider mb-0.5 ${colors.text}`}
                               style={{ fontFamily: 'Inter, sans-serif' }}>
                              {label}
                            </p>
                            <p className={`text-[10px] leading-relaxed ${colors.text} opacity-90`}
                               style={{ fontFamily: 'Inter, sans-serif', display: '-webkit-box',
                                 WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                              {formatted}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              }
            </div>
          ) : (
            <p className="text-center text-[11px] text-gray-400 py-6">
              No composition details found for this product.
            </p>
          )}

          {/* Skin Type Suitability — TASK 7 */}
          {warnDetails.length > 0 && cosmFilter === 'all' && (
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-2"
                 style={{ fontFamily: 'Inter, sans-serif' }}>Skin Suitability</p>
              <div className="space-y-1">
                {warnDetails.map((d: any, i: number) => {
                  const isCaution = /alcohol|fragrance|parfum|dye|preserv|paraben|sulfate/i.test(d.key ?? '');
                  return (
                    <div key={i} className="flex items-center gap-2 px-2 py-1">
                      <span className={`text-[12px] flex-shrink-0 ${isCaution ? 'text-amber-500' : 'text-green-500'}`}>
                        {isCaution ? '⚠' : '✓'}
                      </span>
                      <span className="text-[11px] text-gray-600 dark:text-gray-300 flex-1 min-w-0 overflow-hidden whitespace-nowrap"
                            style={{ fontFamily: 'Inter, sans-serif', textOverflow: 'ellipsis' }}>
                        {d.key}{d.value && d.value !== 'N/A' ? `: ${d.value}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {warnDetails.length === 0 && cosmFilter === 'all' && (
            <span className="inline-block text-[10px] text-gray-400 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5">
              Skin type not specified
            </span>
          )}
        </div>
      );
    }

    // ── INGREDIENTS CARD ────────────────────────────────────────────────────
    if (cardType === 'ingredients' && data) {
      const iData = data as { ingredients_analysis: Array<{ name: string; safety_status: string; reason_with_source: string }> };
      if (!iData.ingredients_analysis?.length) return (
        <div className="flex items-center justify-center h-28">
          <p className="text-[11px] text-gray-400">No ingredient data available</p>
        </div>
      );

      const allergens = detectAllergens(ingredients || extractedText?.ingredients || '');

      const isConcern = (s: string) => s !== 'Safe' && s !== 'Moderate';
      const filtered = iData.ingredients_analysis.filter(ing => {
        if (ingFilter === 'all')      return true;
        if (ingFilter === 'safe')     return ing.safety_status === 'Safe';
        if (ingFilter === 'moderate') return ing.safety_status === 'Moderate';
        return isConcern(ing.safety_status);
      });

      const counts = {
        all:      iData.ingredients_analysis.length,
        safe:     iData.ingredients_analysis.filter(i => i.safety_status === 'Safe').length,
        moderate: iData.ingredients_analysis.filter(i => i.safety_status === 'Moderate').length,
        concern:  iData.ingredients_analysis.filter(i => isConcern(i.safety_status)).length,
      };

      const filters: { key: typeof ingFilter; label: string; activeStyle: string }[] = [
        { key: 'all',      label: `All (${counts.all})`,           activeStyle: 'bg-[#2d3a8c] text-white border-[#2d3a8c]' },
        { key: 'safe',     label: `Safe (${counts.safe})`,         activeStyle: 'bg-green-600 text-white border-green-600'  },
        { key: 'moderate', label: `Moderate (${counts.moderate})`, activeStyle: 'bg-amber-500 text-white border-amber-500'  },
        { key: 'concern',  label: `Concern (${counts.concern})`,   activeStyle: 'bg-red-600 text-white border-red-600'      },
      ];

      return (
        <div className="data-appear space-y-3" key={`ing-${analysisId}`}>
          {/* Filter tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setIngFilter(f.key)}
                aria-pressed={ingFilter === f.key}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                  ingFilter === f.key
                    ? f.activeStyle
                    : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Allergen badges */}
          {allergens.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {allergens.map(a => (
                <span key={a} className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600">
                  <AlertTriangle className="w-2.5 h-2.5" />{a}
                </span>
              ))}
            </div>
          )}

          {/* Ingredient rows — TASK 8: reason clamped, name truncated */}
          <div className="space-y-1.5">
            {filtered.length === 0 ? (
              <p className="text-center text-[11px] text-gray-400 py-4">No ingredients in this category.</p>
            ) : filtered.map((ing, i) => (
              <div key={i} className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/8 min-h-[36px]">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-[12px] font-semibold text-gray-900 dark:text-white flex-1 min-w-0 overflow-hidden whitespace-nowrap"
                     style={{ fontFamily: 'Manrope, sans-serif', textOverflow: 'ellipsis', maxWidth: 'calc(100% - 72px)' }}>
                    {ing.name}
                  </p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    ing.safety_status === 'Safe'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : ing.safety_status === 'Moderate'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {ing.safety_status}
                  </span>
                </div>
                {ing.safety_status !== 'Safe' && ing.reason_with_source && (
                  <p className="text-[10px] text-gray-400 mt-0.5"
                     style={{
                       fontFamily: 'Inter, sans-serif',
                       display: '-webkit-box',
                       WebkitLineClamp: 2,
                       WebkitBoxOrient: 'vertical' as any,
                       overflow: 'hidden',
                       lineHeight: 1.35,
                     }}>
                    {ing.reason_with_source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── REDDIT CARD ─────────────────────────────────────────────────────────
    if (cardType === 'reddit' && data) {
      const r = data as any;
      const renderStars = (rating: number) => Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < Math.floor(rating) ? 'text-yellow-400 fill-current' : 'text-gray-200 dark:text-gray-700'}`} />
      ));

      return (
        <div className="space-y-3">
          {/* Stars + rating */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
            <div className="flex gap-0.5 flex-shrink-0">{renderStars(r.averageRating ?? 0)}</div>
            <div>
              <p className="text-[18px] font-extrabold text-gray-900 dark:text-white leading-none"
                 style={{ fontFamily: 'Manrope, sans-serif' }}>
                {r.averageRating?.toFixed(1) ?? 'N/A'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                from {(r.totalMentions ?? 0).toLocaleString()} mentions
              </p>
            </div>
          </div>

          {/* Pros / Cons */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl">
              <h4 className="text-[11px] font-bold text-green-700 dark:text-green-400 mb-1.5"
                  style={{ fontFamily: 'Manrope, sans-serif' }}>Pros</h4>
              <ul className="space-y-1">
                {r.pros?.length
                  ? r.pros.slice(0, 4).map((p: string, i: number) => (
                      <li key={i} className="text-[10px] text-green-700 dark:text-green-300 bg-white/60 dark:bg-white/10 rounded px-2 py-0.5"
                          style={{ fontFamily: 'Inter, sans-serif' }}>
                        {p}
                      </li>
                    ))
                  : <li className="text-[10px] text-green-600">No pros found</li>}
              </ul>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
              <h4 className="text-[11px] font-bold text-red-700 dark:text-red-400 mb-1.5"
                  style={{ fontFamily: 'Manrope, sans-serif' }}>Cons</h4>
              <ul className="space-y-1">
                {r.cons?.length
                  ? r.cons.slice(0, 4).map((c: string, i: number) => (
                      <li key={i} className="text-[10px] text-red-700 dark:text-red-300 bg-white/60 dark:bg-white/10 rounded px-2 py-0.5"
                          style={{ fontFamily: 'Inter, sans-serif' }}>
                        {c}
                      </li>
                    ))
                  : <li className="text-[10px] text-red-600">No cons found</li>}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    // ── QA CARD ─────────────────────────────────────────────────────────────
    if (cardType === 'qa' && analysisId && productName && extractedText) {
      return (
        <Suspense fallback={
          <div className="flex justify-center h-28 items-center">
            <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin"
                 style={{ borderTopColor: '#2d3a8c' }} />
          </div>
        }>
          <ChatInterfaceLazy analysisId={analysisId} />
        </Suspense>
      );
    }

    return children;
  };

  // Card header accent colours
  const accent: Record<string, { bg: string; icon: string; iconBg: string }> = {
    qa:          { bg: 'bg-blue-100 dark:bg-blue-900/30',    icon: 'text-blue-600 dark:text-blue-400',   iconBg: 'bg-blue-100 dark:bg-blue-900/30'   },
    ingredients: { bg: 'bg-green-100 dark:bg-green-900/30',  icon: 'text-green-600 dark:text-green-400', iconBg: 'bg-green-100 dark:bg-green-900/30' },
    calories:    { bg: 'bg-orange-100 dark:bg-orange-900/30',icon: 'text-orange-600 dark:text-orange-400',iconBg: 'bg-orange-100 dark:bg-orange-900/30'},
    reddit:      { bg: 'bg-red-100 dark:bg-red-900/30',      icon: 'text-red-600 dark:text-red-400',     iconBg: 'bg-red-100 dark:bg-red-900/30'     },
  };
  const ac = accent[cardType ?? ''] ?? accent.qa;
  const CardIcon = cardType === 'qa' ? MessageCircle : cardType === 'ingredients' ? Leaf : Icon;

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-black/6 dark:border-border shadow-sm transition-shadow hover:shadow-md"
         role="region" aria-label={title}>
      {/* Card header */}
      <button
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer ${isExpanded ? 'bg-gray-50 dark:bg-white/5' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
        onClick={onExpand}
        aria-expanded={isExpanded}
        data-testid={`button-toggle-${cardType}`}
        style={{ minHeight: 44 }}
      >
        <div className={`w-[30px] h-[30px] rounded-lg ${ac.iconBg} flex items-center justify-center flex-shrink-0`}>
          {CardIcon && <CardIcon className={`h-4 w-4 ${ac.icon}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-bold text-gray-900 dark:text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>
            {title}
          </h3>
          <p className="text-[10px] text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
            {description}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded content — scrollable so no data is cut off */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 animate-slide-up overflow-hidden" data-testid={`content-${cardType}`}>
          <div className={(cardType === 'qa' || cardType === 'calories') ? '' : 'max-h-[65vh] overflow-y-auto pr-0.5'}>
            {renderCardContent()}
          </div>
          {cardType !== 'qa' && onRefresh && (
            <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/8 flex justify-end">
              <Button variant="ghost" size="sm" onClick={isLoading ? undefined : handleRefresh}
                disabled={isLoading}
                className="gap-1.5 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-50"
                aria-label={isLoading ? `Refreshing ${title}…` : `Refresh ${title}`}
                style={{ minHeight: 44 }}>
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { AnalysisCard };

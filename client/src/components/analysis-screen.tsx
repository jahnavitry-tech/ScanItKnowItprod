import { useState, useEffect, useRef, useCallback, memo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Share2, Camera, MessageSquare,
  Flame, Star, Leaf, MessageCircle, Package,
  Leaf as LeafIcon, Shield, ShieldCheck, XCircle, CircleSlash,
  Layers, Dumbbell, Sparkles, Wind, Stethoscope, Heart, Sun, Moon,
  Droplets, Zap, Feather
} from "lucide-react";
import { AnalysisCard } from "./analysis-card";
import { Logo } from "./Logo";
import { useTheme } from "@/hooks/use-theme";
import type { ProductAnalysis, CardType, IngredientsData, RedditData, ICompositionAnalysis, IFeaturesData } from "@/types/analysis";
import { apiRequest } from "@/lib/queryClient";
import { useCompositionQuery, useIngredientsQuery, useRedditQuery } from "@/hooks/useAnalysisData";
import { detectAllergens } from "@/lib/dietary-filters";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface AnalysisScreenProps {
  analysisIds: string[];
  onScanAnother: () => void;
}

interface FullProductAnalysis extends ProductAnalysis {
  ingredientsData: IngredientsData | null;
  redditData: RedditData | null;
  compositionData: ICompositionAnalysis | null;
  featuresData: IFeaturesData | null;
}

// ─── Product type detection ──────────────────────────────────────────────────

type ProductType = 'food' | 'cosmetic' | 'other';

/**
 * Detect product type using a reliable priority chain.
 *
 * Priority (highest to lowest):
 *  1. calories > 0 from composition API  → definitive food
 *  2. compositionCategory (AI-labelled)  → most specific signal once loaded
 *  3. Nutrition text from initial scan   → "Calories X" = food; "Not applicable" = skip
 *  4. productSummary text               → broad text check
 *  5. productName + featureCategory     → keyword check
 */
function detectProductType(
  featureCategory: string,   // featuresData.productCategory (rarely loaded)
  compositionCategory: string, // compositionData.productCategory (loaded on expand)
  productName: string,
  productSummary: string,
  calories: number,          // compositionData.calories
  nutritionText: string,     // extractedText.nutrition from initial scan
): ProductType {
  // 1. Definitive: composition API confirmed calories
  if (calories > 0) return 'food';

  // 2. Composition's own category label — this is the most specific signal
  const compCat = compositionCategory.toLowerCase();
  if (compCat) {
    const nonFoodCompKw = [
      'sunscreen', 'skincare', 'skin care', 'cosmetic', 'makeup', 'beauty',
      'shampoo', 'conditioner', 'moisturizer', 'serum', 'toner', 'cleanser',
      'lotion', 'lip', 'mascara', 'foundation', 'concealer', 'blush', 'primer',
      'deodorant', 'perfume', 'cologne', 'body wash', 'face wash', 'soap',
      'stationery', 'pen', 'pencil', 'electronic', 'toy', 'cleaning', 'tool',
    ];
    const foodCompKw = [
      'food', 'snack', 'beverage', 'drink', 'cereal', 'bar', 'cookie', 'bread',
      'chip', 'sauce', 'candy', 'chocolate', 'coffee', 'tea', 'dairy', 'grain',
      'supplement', 'vitamin', 'protein', 'nutrition', 'yogurt', 'cheese',
    ];
    if (nonFoodCompKw.some(k => compCat.includes(k))) {
      // Further distinguish cosmetic vs other
      const cosmeticCompKw = [
        'sunscreen', 'skincare', 'skin care', 'cosmetic', 'makeup', 'beauty',
        'shampoo', 'conditioner', 'moisturizer', 'serum', 'toner', 'cleanser',
        'lotion', 'lip', 'mascara', 'foundation', 'concealer', 'blush', 'primer',
        'deodorant', 'perfume', 'cologne', 'body wash', 'face wash', 'soap',
      ];
      return cosmeticCompKw.some(k => compCat.includes(k)) ? 'cosmetic' : 'other';
    }
    if (foodCompKw.some(k => compCat.includes(k))) return 'food';
  }

  // 3. Nutrition text from initial Gemini scan
  const nut = nutritionText.toLowerCase();
  if (nut && nut.length > 3) {
    if (/not applicable|non-food|no nutrition/i.test(nut)) {
      // Confirmed non-food — fall through to cosmetic/other check
    } else if (/calorie|kcal|\bfat\b|protein|carbohydrate|sodium|fiber|sugar/i.test(nut)) {
      return 'food';
    }
  }

  // 4. Product summary text (broad)
  const summary = productSummary.toLowerCase();
  const cosmeticSummaryKw = [
    'sunscreen', 'spf', 'skincare', 'skin care', 'moisturiz', 'serum',
    'shampoo', 'conditioner', 'cleanser', 'toner', 'makeup', 'cosmetic',
    'lip balm', 'lipstick', 'foundation', 'concealer', 'deodorant', 'fragrance',
  ];
  const foodSummaryKw = [
    'calorie', 'nutrition', 'serving', 'snack', 'beverage', 'drink', 'eat',
    'consume', 'diet', 'protein', 'carbohydrate', 'ingredient', 'flavor',
  ];
  if (cosmeticSummaryKw.some(k => summary.includes(k))) return 'cosmetic';
  if (foodSummaryKw.some(k => summary.includes(k))) return 'food';

  // 5. Product name + featureCategory (keywords, no ingredients)
  const nameAndCat = (productName + ' ' + featureCategory).toLowerCase();
  const cosmeticNameKw = [
    'sunscreen', 'spf', 'skincare', 'skin care', 'beauty', 'cosmetic', 'makeup',
    'shampoo', 'conditioner', 'moisturizer', 'serum', 'toner', 'cleanser',
    'lotion', 'lip gloss', 'lip balm', 'lipstick', 'mascara', 'foundation',
    'concealer', 'blush', 'eyeshadow', 'primer', 'body wash', 'face wash',
    'deodorant', 'perfume', 'cologne', 'retinol', 'niacinamide', 'hyaluronic',
  ];
  const foodNameKw = [
    'food', 'snack', 'beverage', 'drink', 'juice', 'milk', 'cereal', 'bar',
    'cookie', 'bread', 'chip', 'cracker', 'sauce', 'dressing', 'candy',
    'chocolate', 'coffee', 'tea', 'soda', 'water', 'yogurt', 'cheese', 'butter',
    'protein bar', 'nutrition bar', 'granola', 'oat', 'rice', 'pasta',
  ];
  if (cosmeticNameKw.some(k => nameAndCat.includes(k))) return 'cosmetic';
  if (foodNameKw.some(k => nameAndCat.includes(k))) return 'food';

  return 'other';
}

// ─── Badge definitions ───────────────────────────────────────────────────────

interface BadgeDef {
  key: string;
  label: string;
  Icon: React.ComponentType<any>;
  bg: string;
  text: string;
  border: string;
}

const FOOD_BADGES: BadgeDef[] = [
  { key: 'vegan',          label: 'Vegan',          Icon: LeafIcon,    bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200'  },
  { key: 'vegetarian',     label: 'Vegetarian',     Icon: LeafIcon,    bg: 'bg-lime-50',    text: 'text-lime-700',   border: 'border-lime-200'   },
  { key: 'gluten-free',    label: 'Gluten-Free',    Icon: CircleSlash, bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200' },
  { key: 'non-gmo',        label: 'Non-GMO',        Icon: ShieldCheck, bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200'   },
  { key: 'organic',        label: 'Organic',        Icon: Shield,      bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200'},
  { key: 'no-added-sugar', label: 'No Added Sugar', Icon: XCircle,     bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200' },
  { key: 'no-artificial',  label: 'No Artificial',  Icon: Sparkles,    bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-200'   },
  { key: 'high-protein',   label: 'High Protein',   Icon: Dumbbell,    bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200' },
  { key: 'high-fiber',     label: 'High Fiber',     Icon: Layers,      bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200'  },
];

const COSMETIC_BADGES: BadgeDef[] = [
  { key: 'fragrance-free', label: 'Fragrance-Free',     Icon: Wind,        bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  { key: 'paraben-free',   label: 'Paraben-Free',       Icon: ShieldCheck, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { key: 'sulfate-free',   label: 'Sulfate-Free',       Icon: ShieldCheck, bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200'    },
  { key: 'derm-tested',    label: 'Derm-Tested',        Icon: Stethoscope, bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200'   },
  { key: 'hypoallergenic', label: 'Hypoallergenic',     Icon: Heart,       bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200'   },
  { key: 'cruelty-free',   label: 'Cruelty-Free',       Icon: LeafIcon,    bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
  { key: 'vegan-formula',  label: 'Vegan Formula',      Icon: LeafIcon,    bg: 'bg-lime-50',   text: 'text-lime-600',   border: 'border-lime-200'   },
  { key: 'spf',            label: 'SPF Protected',      Icon: Sun,         bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  },
  { key: 'for-sensitive',  label: 'Sensitive Skin',     Icon: Feather,     bg: 'bg-pink-50',   text: 'text-pink-600',   border: 'border-pink-200'   },
  { key: 'for-dry',        label: 'For Dry Skin',       Icon: Droplets,    bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200'   },
  { key: 'for-acne',       label: 'Acne Care',          Icon: Zap,         bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
];

const OTHER_BADGES: BadgeDef[] = [
  { key: 'non-toxic',      label: 'Non-Toxic',          Icon: ShieldCheck, bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
  { key: 'eco-friendly',   label: 'Eco-Friendly',       Icon: LeafIcon,    bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200'},
  { key: 'recyclable',     label: 'Recyclable',         Icon: Sparkles,    bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200'   },
  { key: 'bpa-free',       label: 'BPA-Free',           Icon: ShieldCheck, bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
];

// Lookup map for AI-returned badge key strings → BadgeDef
const BADGE_KEY_MAP: Record<string, BadgeDef> = {
  // Food / Beverage
  'vegan':           { key: 'vegan',           label: 'Vegan',           Icon: LeafIcon,    bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200'   },
  'vegetarian':      { key: 'vegetarian',       label: 'Vegetarian',      Icon: LeafIcon,    bg: 'bg-lime-50',    text: 'text-lime-700',   border: 'border-lime-200'    },
  'non-gmo':         { key: 'non-gmo',          label: 'Non-GMO',         Icon: ShieldCheck, bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200'    },
  'gluten-free':     { key: 'gluten-free',      label: 'Gluten-Free',     Icon: CircleSlash, bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200'  },
  'no-added-sugar':  { key: 'no-added-sugar',   label: 'No Added Sugar',  Icon: XCircle,     bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200'  },
  'organic':         { key: 'organic',           label: 'Organic',         Icon: Shield,      bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200' },
  'no-artificial':   { key: 'no-artificial',    label: 'No Artificial',   Icon: Sparkles,    bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-200'    },
  'high-protein':    { key: 'high-protein',     label: 'High Protein',    Icon: Dumbbell,    bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200'  },
  'high-fiber':      { key: 'high-fiber',       label: 'High Fiber',      Icon: Layers,      bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200'   },
  'dairy-free':      { key: 'dairy-free',       label: 'Dairy-Free',      Icon: CircleSlash, bg: 'bg-sky-50',     text: 'text-sky-700',    border: 'border-sky-200'     },
  'keto-friendly':   { key: 'keto-friendly',    label: 'Keto',            Icon: Zap,         bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200'  },
  'low-sodium':      { key: 'low-sodium',       label: 'Low Sodium',      Icon: Droplets,    bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200'    },
  // Cosmetic
  'fragrance-free':  { key: 'fragrance-free',   label: 'Fragrance-Free',  Icon: Wind,        bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200'    },
  'paraben-free':    { key: 'paraben-free',     label: 'Paraben-Free',    Icon: ShieldCheck, bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200'  },
  'sulfate-free':    { key: 'sulfate-free',     label: 'Sulfate-Free',    Icon: ShieldCheck, bg: 'bg-sky-50',     text: 'text-sky-700',    border: 'border-sky-200'     },
  'derm-tested':     { key: 'derm-tested',      label: 'Derm-Tested',     Icon: Stethoscope, bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-200'    },
  'hypoallergenic':  { key: 'hypoallergenic',   label: 'Hypoallergenic',  Icon: Heart,       bg: 'bg-pink-50',    text: 'text-pink-700',   border: 'border-pink-200'    },
  'cruelty-free':    { key: 'cruelty-free',     label: 'Cruelty-Free',    Icon: LeafIcon,    bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200'   },
  'vegan-formula':   { key: 'vegan-formula',    label: 'Vegan Formula',   Icon: LeafIcon,    bg: 'bg-lime-50',    text: 'text-lime-600',   border: 'border-lime-200'    },
  'spf-protected':   { key: 'spf-protected',    label: 'SPF Protected',   Icon: Sun,         bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200'   },
  'for-sensitive':   { key: 'for-sensitive',    label: 'Sensitive Skin',  Icon: Feather,     bg: 'bg-pink-50',    text: 'text-pink-600',   border: 'border-pink-200'    },
  'for-dry-skin':    { key: 'for-dry-skin',     label: 'For Dry Skin',    Icon: Droplets,    bg: 'bg-blue-50',    text: 'text-blue-600',   border: 'border-blue-200'    },
  'for-acne':        { key: 'for-acne',         label: 'Acne Care',       Icon: Zap,         bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200'  },
  'non-comedogenic': { key: 'non-comedogenic',  label: 'Non-Comedogenic', Icon: ShieldCheck, bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200'  },
};

function getBadges(ingredients: string, category: string, productType: ProductType, calories: number): BadgeDef[] {
  const t   = ingredients.toLowerCase();
  const cat = category.toLowerCase();

  if (productType === 'cosmetic') {
    const found: BadgeDef[] = [];
    if (!t.includes('fragrance') && !t.includes('parfum'))             found.push(COSMETIC_BADGES.find(b => b.key === 'fragrance-free')!);
    if (!t.includes('paraben'))                                         found.push(COSMETIC_BADGES.find(b => b.key === 'paraben-free')!);
    if (!t.includes('sulfate') && !t.includes('sulphate'))             found.push(COSMETIC_BADGES.find(b => b.key === 'sulfate-free')!);
    if (t.includes('spf') || cat.includes('spf') || cat.includes('sunscreen')) found.push(COSMETIC_BADGES.find(b => b.key === 'spf')!);
    if (cat.includes('sensitive') || t.includes('sensitive'))          found.push(COSMETIC_BADGES.find(b => b.key === 'for-sensitive')!);
    if (cat.includes('dry skin'))                                       found.push(COSMETIC_BADGES.find(b => b.key === 'for-dry')!);
    if (cat.includes('acne') || t.includes('salicylic') || t.includes('benzoyl')) found.push(COSMETIC_BADGES.find(b => b.key === 'for-acne')!);
    const nonVeganCosmetic = ['beeswax','lanolin','collagen','keratin','carmine','shellac','honey'];
    if (!nonVeganCosmetic.some(k => t.includes(k)) && t.length > 10)  found.push(COSMETIC_BADGES.find(b => b.key === 'vegan-formula')!);
    return found.filter(Boolean).slice(0, 5);
  }

  if (productType === 'food') {
    const found: BadgeDef[] = [];
    const nonVegan = ['milk','dairy','egg','honey','gelatin','casein','whey','butter','cream','cheese','meat','fish','chicken','beef','pork','lard'];
    if (t.length > 10 && !nonVegan.some(k => t.includes(k)))           found.push(FOOD_BADGES.find(b => b.key === 'vegan')!);
    const nonVeg = ['meat','fish','chicken','beef','pork','lard','tallow','gelatin','anchovie'];
    if (t.length > 10 && !nonVeg.some(k => t.includes(k)))             found.push(FOOD_BADGES.find(b => b.key === 'vegetarian')!);
    const glutenTerms = ['wheat','barley','rye','oat','spelt','malt','gluten'];
    if (!glutenTerms.some(k => t.includes(k)))                         found.push(FOOD_BADGES.find(b => b.key === 'gluten-free')!);
    if (t.includes('organic'))                                          found.push(FOOD_BADGES.find(b => b.key === 'organic')!);
    if (t.includes('non-gmo'))                                          found.push(FOOD_BADGES.find(b => b.key === 'non-gmo')!);
    if (!t.includes('artificial colour') && !t.includes('artificial flavor') && !t.includes('artificial dye') && t.length > 10)
                                                                        found.push(FOOD_BADGES.find(b => b.key === 'no-artificial')!);
    return found.filter(Boolean).slice(0, 5);
  }

  // Other products (stationery, electronics, etc.)
  const found: BadgeDef[] = [];
  if (!t.includes('toxic') && !cat.includes('chemical'))               found.push(OTHER_BADGES.find(b => b.key === 'non-toxic')!);
  if (t.includes('recycl') || cat.includes('recycl'))                  found.push(OTHER_BADGES.find(b => b.key === 'recyclable')!);
  if (t.includes('eco') || cat.includes('eco'))                        found.push(OTHER_BADGES.find(b => b.key === 'eco-friendly')!);
  if (!t.includes('bpa') || cat.includes('bpa-free'))                  found.push(OTHER_BADGES.find(b => b.key === 'bpa-free')!);
  return found.filter(Boolean).slice(0, 4);
}

// ─── Client-side category guesser ────────────────────────────────────────────
// Used as immediate fallback before composition data loads from the API.

function guessCategory(productName: string, summary: string): string {
  const t = (productName + " " + summary).toLowerCase();
  if (/snack|bar|granola|cookie|cracker|chip|chocolate|candy/.test(t)) return "Snack";
  if (/beverage|drink|juice|soda|water|tea|coffee|milk/.test(t))       return "Beverage";
  if (/cereal|oat|bread|pasta|rice/.test(t))                            return "Grain Product";
  if (/skincare|moisturiz|serum|sunscreen|spf|cleanser/.test(t))        return "Skincare";
  if (/shampoo|conditioner|body wash/.test(t))                          return "Hair & Body Care";
  if (/makeup|foundation|lipstick|mascara/.test(t))                     return "Cosmetics";
  if (/supplement|vitamin|protein powder/.test(t))                      return "Supplement";
  return "";
}

// ─── Summary parser ──────────────────────────────────────────────────────────

interface SummaryDetails {
  what: string; who: string; when: string; bullets: string[];
}

function parseSummaryDetails(summary: string): SummaryDetails {
  const result: SummaryDetails = { what: '', who: '', when: '', bullets: [] };
  if (!summary) return result;

  const extract = (label: string): string => {
    const m = summary.match(new RegExp(`(?:^|\\n)\\s*${label}[:\\-]?\\s*([^\\n]+)`, 'i'));
    return m ? m[1].replace(/\*+/g, '').trim() : '';
  };
  result.what = extract('what');
  result.who  = extract('who');
  result.when = extract('when') || extract('how');

  const lines = summary
    .split(/\n/)
    .map(l => l.trim().replace(/^[•\-\*\d.]+\s*/, '').replace(/\*+/g, '').trim())
    .filter(l => l.length > 8 && !/^(what|who|when|how)[:\-]/i.test(l));
  result.bullets = lines.slice(0, 4);
  return result;
}

// ─── Product Header Card ──────────────────────────────────────────────────────

function ProductHeaderCard({ analysis }: { analysis: FullProductAnalysis }) {
  const ingredients        = analysis.extractedText?.ingredients || '';
  const nutritionText      = analysis.extractedText?.nutrition   || '';
  const featureCategory    = analysis.featuresData?.productCategory || '';
  const compositionCategory= analysis.compositionData?.productCategory || '';
  const calories           = analysis.compositionData?.calories ?? 0;
  const productType        = detectProductType(
    featureCategory, compositionCategory,
    analysis.productName || '', analysis.productSummary || '',
    calories, nutritionText,
  );
  // Prefer AI-provided badges (from UPCA categoryBadges); fall back to client-side derivation
  const aiBadgeKeys = analysis.compositionData?.categoryBadges;
  const badges: BadgeDef[] = aiBadgeKeys?.length
    ? aiBadgeKeys.map(k => BADGE_KEY_MAP[k]).filter(Boolean) as BadgeDef[]
    : getBadges(ingredients, featureCategory || compositionCategory, productType, calories);
  const parsed      = parseSummaryDetails(analysis.productSummary || '');

  // Priority: UPCA productContext > ARA productContext (immediate) > featuresData > parsed summary
  const compCtx = analysis.compositionData?.productContext;
  const araCtx  = analysis.productContext;
  const who  = compCtx?.who?.trim()  || araCtx?.who?.trim()  || analysis.featuresData?.extraDetails?.trim()      || parsed.who;
  const when = compCtx?.when?.trim() || araCtx?.when?.trim() || analysis.featuresData?.usageInstructions?.trim() || parsed.when;
  const what = compCtx?.what?.trim() || araCtx?.what?.trim() || analysis.featuresData?.mainPurpose?.trim()       || parsed.what;

  // Shorten product name: first 2 lines / 80 chars max
  const shortName = (analysis.productName || '').split('\n')[0].slice(0, 80);

  // AI-provided productType is the most accurate signal once composition loads
  const rawAiType = analysis.compositionData?.productType;
  const resolvedProductType: ProductType =
    rawAiType === 'food' || rawAiType === 'beverage' ? 'food' :
    rawAiType === 'cosmetic' ? 'cosmetic' :
    rawAiType ? 'other' :
    productType; // fall back to client-side detection

  const typeLabel: Record<ProductType, { label: string; bg: string; text: string; border: string }> = {
    food:     { label: '🍽 Food',     bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-800 dark:text-orange-300', border: 'border border-orange-200 dark:border-orange-700/50' },
    cosmetic: { label: '✨ Cosmetic', bg: 'bg-pink-100 dark:bg-pink-900/40',     text: 'text-pink-800 dark:text-pink-300',    border: 'border border-pink-200 dark:border-pink-700/50'    },
    other:    { label: '📦 Product',  bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-800 dark:text-indigo-300',border: 'border border-indigo-200 dark:border-indigo-700/50' },
  };
  const typeChip = typeLabel[resolvedProductType];

  // Structured info rows: label → value (only non-empty)
  type InfoRow = { label: string; value: string };
  const infoRows: InfoRow[] = [];
  // Priority: featuresData > compositionData > ARA productCategory > client-side guess
  const displayCategory = featureCategory || compositionCategory ||
    analysis.productCategory ||
    guessCategory(analysis.productName || '', analysis.productSummary || '');
  if (displayCategory) infoRows.push({ label: 'Category', value: displayCategory });
  if (what)     infoRows.push({ label: 'What', value: what });
  if (who)      infoRows.push({ label: 'Who',  value: who  });
  if (when)     infoRows.push({ label: 'When', value: when });

  // When no structured rows yet, show the base summary (capped at 2 lines / 140 chars).
  const summaryText = (analysis.productSummary || '').trim();
  const summaryTruncated = summaryText.length > 140
    ? summaryText.slice(0, 140).trimEnd() + '…'
    : summaryText;
  if (infoRows.length === 0 && summaryTruncated) {
    infoRows.push({ label: 'Summary', value: summaryTruncated });
  }
  const fallbackBullets: string[] = [];

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-black/6 dark:border-border shadow-sm">
      {/* Header row: thumbnail + name + type chip */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div
          className="rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/20 border border-black/6 dark:border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ width: 52, height: 52 }}
        >
          {analysis.imageUrl
            ? <img src={analysis.imageUrl} alt={shortName} className="w-full h-full object-contain" />
            : <Camera className="h-6 w-6 text-indigo-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className="text-[15px] font-bold text-gray-900 dark:text-foreground leading-snug"
            style={{
              fontFamily: 'Manrope, sans-serif',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as any,
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            {shortName}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${typeChip.bg} ${typeChip.text} ${typeChip.border}`}>
              {typeChip.label}
            </span>
            {analysis.extractedText?.brand && (
              <span className="text-[11px] text-gray-400 overflow-hidden whitespace-nowrap min-w-0"
                    style={{ fontFamily: 'Inter, sans-serif', textOverflow: 'ellipsis' }}>
                {analysis.extractedText.brand}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* About this product — skeleton when both infoRows and summary are empty */}
      {infoRows.length === 0 && !summaryTruncated && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/8 animate-pulse">
          <div className="h-2 bg-gray-200 dark:bg-white/10 rounded w-1/3 mb-3" />
          <div className="h-2 bg-gray-200 dark:bg-white/10 rounded w-full mb-1.5" />
          <div className="h-2 bg-gray-200 dark:bg-white/10 rounded w-2/3" />
        </div>
      )}

      {/* About this product */}
      {(infoRows.length > 0 || fallbackBullets.length > 0) && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/8">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 mb-2"
             style={{ fontFamily: 'Inter, sans-serif' }}>
            About this product
          </p>

          {infoRows.length > 0 ? (
            <div className="space-y-2">
              {infoRows.map(row => (
                <div key={row.label} className="flex items-start gap-2">
                  <span className="text-[10px] font-extrabold text-[#2d3a8c] dark:text-[#94aaff] flex-shrink-0 w-16 pt-0.5"
                        style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.label}
                  </span>
                  <span className="whw-val text-[11px] text-gray-700 dark:text-gray-300 flex-1"
                        style={{ fontFamily: 'Inter, sans-serif' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {fallbackBullets.map((pt, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#2d3a8c] dark:text-[#94aaff] mt-0.5 flex-shrink-0 text-[10px] font-bold">•</span>
                  <span className="text-[11px] text-gray-700 dark:text-gray-300 leading-snug"
                        style={{ fontFamily: 'Inter, sans-serif', wordBreak: 'break-word' }}>
                    {pt}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Category badges — max 6 visible, TASK 5 */}
      {badges.length > 0 && (
        <div className="cat-badges flex flex-wrap gap-1.5 px-4 pb-3">
          {badges.slice(0, 6).map(badge => (
            <span
              key={badge.key}
              className={`cat-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
            >
              <badge.Icon className="w-2.5 h-2.5 flex-shrink-0" />
              {badge.label}
            </span>
          ))}
          {badges.length > 6 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border bg-slate-50 text-slate-500 border-black/10"
                  style={{ whiteSpace: 'nowrap' }}>
              +{badges.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single product panel ─────────────────────────────────────────────────────

function AnalysisPanel({ analysisId, onScanAnother, isSingle, isActive }: {
  analysisId: string; onScanAnother: () => void; isSingle: boolean; isActive: boolean;
}) {
  const [analysis, setAnalysis] = useState<FullProductAnalysis | null>(null);
  const [loading, setLoading]   = useState(true);
  const [openCard, setOpenCard] = useState<CardType | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Lazy gates: flip to true only when user opens a card (or when this panel becomes active).
  const [enabledCalories,    setEnabledCalories]    = useState(false);
  const [enabledIngredients, setEnabledIngredients] = useState(false);
  const [enabledReddit,      setEnabledReddit]      = useState(false);
  // Guard so auto-start fires only once per panel, not on every isActive toggle.
  const compositionAutoStartedRef = useRef(false);
  // Ref for Reddit card — IntersectionObserver triggers load when it scrolls into view.
  const redditCardRef = useRef<HTMLDivElement>(null);
  // useTransition so card expand is non-blocking (accordion opens instantly, data loads behind).
  const [, startTransition] = useTransition();

  // TanStack Query hooks — fire only when the matching card is opened
  const compositionQuery = useCompositionQuery(analysisId, enabledCalories);
  const ingredientsQuery = useIngredientsQuery(analysisId, enabledIngredients);
  const redditQuery      = useRedditQuery(analysisId, enabledReddit);

  // 429 / 503 countdown banner: find the first rate-limit error across all queries.
  // Check isRateLimit flag first; fall back to message pattern in case the error
  // was wrapped by a middleware layer and lost the typed property.
  const rateLimitError = [compositionQuery.error, ingredientsQuery.error, redditQuery.error]
    .find((e): e is Error & { isRateLimit: true; retryAfter: number } =>
      !!(e as any)?.isRateLimit ||
      /rate limited|429|quota|cooldown/i.test((e as Error)?.message || ''),
    );
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!rateLimitError) return;
    const secs = rateLimitError.retryAfter ?? 60;
    setCountdown(secs);
    const id = setInterval(() => setCountdown(prev => (prev <= 1 ? (clearInterval(id), 0) : prev - 1)), 1000);
    return () => clearInterval(id);
  }, [rateLimitError]);

  // Load base analysis on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res  = await apiRequest('GET', `/api/analysis/${analysisId}`);
        const data = await res.json() as FullProductAnalysis;
        setAnalysis(data);
        // Pre-enable any already-cached deep data
        if (data.compositionData) setEnabledCalories(true);
        if (data.ingredientsData) setEnabledIngredients(true);
        if (data.redditData)      setEnabledReddit(true);
        // Auto-start composition + ingredients in parallel for the visible panel.
        // Both were going to load anyway — firing together saves ~2–3s perceived latency.
        // Guard prevents re-firing on every isActive toggle (e.g. swipe away and back).
        if (isActive && !data.isFallbackMode && !compositionAutoStartedRef.current) {
          compositionAutoStartedRef.current = true;
          if (!data.compositionData)  setEnabledCalories(true);
          if (!data.ingredientsData)  setEnabledIngredients(true);
          // Reddit stays deferred — fires via IntersectionObserver when card scrolls into view.
        }
      } catch (e) {
        console.error("Error loading analysis:", e);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  // When the user swipes to this panel, auto-start composition + ingredients if not yet done.
  useEffect(() => {
    if (!isActive || compositionAutoStartedRef.current || !analysis || analysis.isFallbackMode) return;
    compositionAutoStartedRef.current = true;
    if (!analysis.compositionData)  setEnabledCalories(true);
    if (!analysis.ingredientsData)  setEnabledIngredients(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, !!analysis]);

  // Sync query results into analysis so ProductHeaderCard gets productContext/badges
  useEffect(() => {
    if (compositionQuery.data)
      setAnalysis(prev => prev ? { ...prev, compositionData: compositionQuery.data! } : null);
  }, [compositionQuery.data]);

  useEffect(() => {
    if (ingredientsQuery.data)
      setAnalysis(prev => prev ? { ...prev, ingredientsData: ingredientsQuery.data! } : null);
  }, [ingredientsQuery.data]);

  useEffect(() => {
    if (redditQuery.data)
      setAnalysis(prev => prev ? { ...prev, redditData: redditQuery.data! } : null);
  }, [redditQuery.data]);

  // Fire Reddit query when its card scrolls into view — avoids eager quota burn.
  useEffect(() => {
    const el = redditCardRef.current;
    if (!el || enabledReddit) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setEnabledReddit(true); },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabledReddit]);

  const handleCardToggle = (cardType: CardType) => {
    if (openCard === cardType) { setOpenCard(null); return; }
    setOpenCard(cardType);
    // Wrap enables in startTransition so the accordion opens instantly while data loads behind.
    startTransition(() => {
      if (cardType === 'calories')         setEnabledCalories(true);
      else if (cardType === 'ingredients') setEnabledIngredients(true);
      else if (cardType === 'reddit')      setEnabledReddit(true);
    });
  };

  // Suppress refetch while rate-limit cooldown is active
  const isRateLimited = !!rateLimitError && countdown > 0;

  // Derive per-card props from query state
  const getCardProps = (cardType: CardType): { isLoading: boolean; data: any; onRefresh: () => void } => {
    switch (cardType) {
      case 'calories':
        return {
          isLoading: compositionQuery.isFetching,
          data: compositionQuery.isError
            ? { error: true }
            : (compositionQuery.data ?? analysis?.compositionData ?? null),
          onRefresh: () => { if (!isRateLimited) compositionQuery.forceRefetch(); },
        };
      case 'ingredients':
        return {
          isLoading: ingredientsQuery.isFetching,
          data: ingredientsQuery.isError
            ? { error: true }
            : (ingredientsQuery.data ?? analysis?.ingredientsData ?? null),
          onRefresh: () => { if (!isRateLimited) ingredientsQuery.forceRefetch(); },
        };
      case 'reddit':
        return {
          isLoading: redditQuery.isFetching,
          data: redditQuery.isError
            ? { error: true }
            : (redditQuery.data ?? analysis?.redditData ?? null),
          // Reddit 503 = "service unavailable", never a quota error — always allow retry
          onRefresh: () => redditQuery.forceRefetch(),
        };
      default:
        return { isLoading: false, data: null, onRefresh: () => {} };
    }
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    window.location.href = `mailto:scanitknowit@gmail.com?subject=${encodeURIComponent("Suggestions for ScanItKnowIt Update")}&body=${encodeURIComponent(feedback)}`;
    setTimeout(() => { setIsFeedbackOpen(false); setFeedback(""); }, 500);
  };

  if (loading) return (
    <div className="flex justify-center items-center h-full p-12">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-transparent mx-auto animate-spin" style={{ borderTopColor: '#2d3a8c' }} />
        <p className="text-sm font-semibold text-[#2d3a8c]" style={{ fontFamily: 'Manrope, sans-serif' }}>Loading Analysis…</p>
      </div>
    </div>
  );

  if (!analysis) return (
    <div className="p-6 text-center text-muted-foreground">Failed to load product analysis.</div>
  );

  // Detect product type for card titles & badges
  const ingredients        = analysis.extractedText?.ingredients || '';
  const nutritionText      = analysis.extractedText?.nutrition   || '';
  const featureCategory    = analysis.featuresData?.productCategory    || '';
  const compositionCategory= analysis.compositionData?.productCategory || '';
  const calories           = analysis.compositionData?.calories ?? 0;
  const detectedProductType = detectProductType(
    featureCategory, compositionCategory,
    analysis.productName || '', analysis.productSummary || '',
    calories, nutritionText,
  );
  // AI-provided productType takes priority once composition loads
  const rawAiTypePanel = analysis.compositionData?.productType;
  const productType: ProductType =
    rawAiTypePanel === 'food' || rawAiTypePanel === 'beverage' ? 'food' :
    rawAiTypePanel === 'cosmetic' ? 'cosmetic' :
    rawAiTypePanel ? 'other' :
    detectedProductType;

  const isNonFood = analysis.compositionData
    ? (analysis.compositionData.calories ?? 0) === 0 && productType !== 'food'
    : productType !== 'food';

  const isGeneralScene = !!(analysis.isGeneralScene);

  const cards = [
    {
      type:        'calories' as CardType,
      title:       isNonFood ? 'Product Highlights' : 'Nutrition Facts',
      description: isGeneralScene ? 'Estimated nutrition per component.' : isNonFood ? 'Key composition & components.' : 'Detailed nutritional information.',
      icon:        isNonFood ? Package : Flame,
    },
    { type: 'ingredients' as CardType, title: 'Ingredient Safety', description: 'In-depth safety analysis.',          icon: Leaf         },
    // Reddit always 503s for non-branded scenes — hide it to save quota
    ...(!isGeneralScene ? [{ type: 'reddit' as CardType, title: 'Reddit Reviews', description: 'Community opinions.', icon: Star }] : []),
    { type: 'qa'          as CardType, title: 'Ask the AI',        description: 'Ask questions about this product.', icon: MessageCircle },
  ];

  return (
    <div className="space-y-3 pb-10" data-testid="analysis-screen">
      <ProductHeaderCard analysis={analysis} />

      {/* 429 / 503 rate-limit banner — shown until the cooldown countdown reaches 0 */}
      {rateLimitError && countdown > 0 && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl">
          <p className="text-[10px] text-red-700 dark:text-red-400 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            Analysis paused — daily quota reached. Retry in {countdown}s.
          </p>
        </div>
      )}

      {analysis.isFallbackMode && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl">
          <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            Using cached data — live AI analysis temporarily unavailable
          </p>
        </div>
      )}

      <div className="space-y-3">
        {cards.map(card => {
          const { isLoading, data, onRefresh } = getCardProps(card.type);
          const cardEl = (
            <AnalysisCard
              key={card.type}
              cardType={card.type}
              title={card.title}
              description={card.description}
              icon={card.icon}
              analysisId={analysisId}
              isExpanded={openCard === card.type}
              onExpand={() => handleCardToggle(card.type)}
              onRefresh={onRefresh}
              data={data}
              extractedText={analysis.extractedText}
              productName={analysis.productName}
              productSummary={analysis.productSummary}
              isLoading={isLoading}
              ingredients={ingredients}
              compositionData={analysis.compositionData}
              productType={productType}
            />
          );
          // Wrap Reddit card so IntersectionObserver can trigger its query on scroll-into-view.
          if (card.type === 'reddit') {
            return <div key={card.type} ref={redditCardRef}>{cardEl}</div>;
          }
          return cardEl;
        })}
      </div>

      {/* Bottom action bar — TASK 13 */}
      <div className="flex gap-3 pt-1 border-t border-black/6 dark:border-white/8"
           style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <Button
          className="flex-1 rounded-xl font-bold text-[13px] text-white"
          style={{ background: '#2d3a8c', fontFamily: 'Manrope, sans-serif', minHeight: 48 }}
          onClick={onScanAnother}
          data-testid="button-scan-another"
          aria-label="Scan another product"
        >
          <Camera className="h-4 w-4 mr-2" />
          Scan Another
        </Button>
        <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"
              className="rounded-xl bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 border-0 flex items-center gap-1.5"
              style={{ minHeight: 48, paddingLeft: 12, paddingRight: 12 }}
              data-testid="button-feedback"
              aria-label="Send feedback">
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              <span className="text-[11px] font-semibold whitespace-nowrap">Feedback</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-xl">
            <form onSubmit={handleFeedbackSubmit}>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Help Us Build Your Next Update</DialogTitle>
                <DialogDescription className="text-sm">Tell us how we can make your experience better.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Textarea placeholder="Add feedback" value={feedback} onChange={e => setFeedback(e.target.value)} className="min-h-[120px]" />
              </div>
              <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsFeedbackOpen(false); setFeedback(""); }} className="h-12" type="button">Cancel</Button>
                <Button className="h-12 text-white" disabled={!feedback.trim()} type="submit" style={{ background: '#2d3a8c' }}>Submit</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Memoised so horizontal-scroll state updates in AnalysisScreen don't
// re-render panels whose props haven't changed.
const AnalysisPanelMemo = memo(AnalysisPanel);

// ─── Root screen with top bar ─────────────────────────────────────────────────

export function AnalysisScreen({ analysisIds, onScanAnother }: AnalysisScreenProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set initial scroll position on mount without animation
  useEffect(() => {
    if (scrollContainerRef.current && activeIndex > 0) {
      scrollContainerRef.current.scrollLeft = activeIndex * scrollContainerRef.current.offsetWidth;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useCallback so the reference is stable — AnalysisPanelMemo won't re-render
  // when the parent re-renders due to activeIndex changes.
  const scrollToPanel = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(analysisIds.length - 1, i));
    setActiveIndex(clamped);
    if (scrollContainerRef.current) {
      const panelWidth = scrollContainerRef.current.offsetWidth;
      scrollContainerRef.current.scrollTo({ left: clamped * panelWidth, behavior: 'smooth' });
    }
  }, [analysisIds.length]);

  // Debounced scroll handler (50 ms).  Uses functional state update so the
  // closure never captures a stale activeIndex.
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const w = container.offsetWidth;
      if (w === 0) return;
      const newIndex = Math.round(container.scrollLeft / w);
      setActiveIndex(prev => (newIndex !== prev ? newIndex : prev));
    }, 50);
  }, []);

  if (analysisIds.length === 0) return null;

  const isMulti = analysisIds.length > 1;

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── Sticky top bar — TASK 14 ── */}
      <div className="sticky top-0 z-20 bg-white dark:bg-card"
           style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
        {/* 3-col grid: back | logo centered | actions — TASK 14 */}
        <div className="grid items-center px-4 pt-11 pb-3"
             style={{ gridTemplateColumns: 'auto 1fr auto', gap: 8 }}>
          {/* Back button */}
          <button
            onClick={onScanAnother}
            className="w-[30px] h-[30px] rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-white/20 flex-shrink-0"
            data-testid="button-back"
            aria-label="Go back to scan"
          >
            <ChevronLeft className="h-4 w-4 text-gray-700 dark:text-gray-300" />
          </button>

          {/* Logo — centered */}
          <div className="flex justify-center">
            <Logo size="sm" />
          </div>

          {/* Right actions: theme toggle + share */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="w-[30px] h-[30px] rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-white/20"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark'
                ? <Sun className="h-3.5 w-3.5 text-amber-500" />
                : <Moon className="h-3.5 w-3.5 text-gray-600" />}
            </button>
            <button
              onClick={() => window.print()}
              className="w-[30px] h-[30px] rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-white/20"
              aria-label="Share analysis"
            >
              <Share2 className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Multi-product navigator: dots + prev/next arrows */}
        {isMulti && (
          <div className="flex items-center gap-2 px-4 pb-2.5">
            {/* Prev arrow */}
            <button
              onClick={() => scrollToPanel(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-30"
              style={{ background: activeIndex === 0 ? '#f3f4f6' : '#2d3a8c' }}
              aria-label="Previous product"
            >
              <ChevronLeft className="h-3.5 w-3.5" style={{ color: activeIndex === 0 ? '#9ca3af' : '#fff' }} />
            </button>

            {/* Dot indicators + truncated labels — TASK 10 */}
            <div className="flex items-center gap-1.5 flex-1 justify-center overflow-x-auto scrollbar-hide">
              {analysisIds.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollToPanel(i)}
                  className="flex flex-col items-center gap-0.5 flex-shrink-0 transition-all duration-200"
                  aria-label={`Product ${i + 1}`}
                >
                  <div className="rounded-full transition-all duration-200"
                       style={{ width: activeIndex === i ? 24 : 8, height: 8, background: activeIndex === i ? '#2d3a8c' : '#d1d5db' }} />
                </button>
              ))}
            </div>

            {/* Counter */}
            <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0 tabular-nums"
                  style={{ fontFamily: 'Inter, sans-serif' }}>
              {activeIndex + 1}/{analysisIds.length}
            </span>

            {/* Next arrow */}
            <button
              onClick={() => scrollToPanel(activeIndex + 1)}
              disabled={activeIndex === analysisIds.length - 1}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-30"
              style={{ background: activeIndex === analysisIds.length - 1 ? '#f3f4f6' : '#2d3a8c' }}
              aria-label="Next product"
            >
              <ChevronRight className="h-3.5 w-3.5" style={{ color: activeIndex === analysisIds.length - 1 ? '#9ca3af' : '#fff' }} />
            </button>
          </div>
        )}
      </div>

      {/* ── Panels — horizontal scroll-snap for multi-product, single for one ── */}
      <div
        ref={scrollContainerRef}
        onScroll={isMulti ? handleScroll : undefined}
        role="main"
        className="flex-1 flex overflow-x-auto overflow-y-auto"
        style={isMulti ? {
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        } : undefined}
      >
        {analysisIds.map((id, i) => (
          <div
            key={id}
            className="flex-shrink-0 w-full overflow-y-auto"
            style={isMulti ? { scrollSnapAlign: 'start' } : undefined}
          >
            <div className="mx-auto px-4 py-4 w-full max-w-lg md:max-w-xl">
              <AnalysisPanelMemo
                analysisId={id}
                onScanAnother={onScanAnother}
                isSingle={!isMulti}
                isActive={!isMulti || i === activeIndex}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ExtractedTextData {
  ingredients: string;
  nutrition?: string;  // removed from ARA prompt — may be absent for new scans
  brand: string;
}

/** The initial product analysis created after the first AI call (ARA) */
export interface ProductAnalysis {
  analysisId: string;
  productName: string;
  productSummary: string; // The brief summary from ARA - matches backend field name
  /** Category label extracted by ARA (e.g. "Granola Bar", "Face Moisturizer"). Available immediately. */
  productCategory?: string;
  /** Structured what/who/how extracted by ARA. Available immediately — no need to wait for composition. */
  productContext?: { what: string; who: string; when: string };
  extractedText: ExtractedTextData;
  imageUrl: string;
  // Deep Analysis results (null until orchestration runs)
  featuresData: IFeaturesData | null;
  ingredientsData: IngredientsData | null;
  compositionData: ICompositionAnalysis | null;
  redditData: RedditData | null;
  isFallbackMode: boolean;
  isGeneralScene?: boolean;  // true = non-branded real-world scene (meal, surface, etc.)
  allergens?: string[];
  boundingBox?: ProductBoundingBox;
}

// --- Deep Analysis Types ---

/** Product Features (from UPSA prompt) */
export interface IFeaturesData {
  productCategory: string; // Mapped from 'Category'
  mainPurpose: string; // Mapped from 'Main Purpose'
  usageInstructions: string; // Mapped from 'Usage'
  extraDetails: string; // Mapped from 'Extra Details'
}

/** Ingredient Safety Analysis (from UISA prompt) */
export interface Ingredient {
  name: string;
  safety_status: 'Safe' | 'Moderate' | 'Harmful'; // Updated status field
  reason_with_source: string; // Updated reason field
}

export interface IngredientsData {
  ingredients_analysis: Ingredient[];
}

/** Compositional Analysis (from UPCA prompt) */
export interface CompositionalDetail {
  key: string;
  value: string;
  unit?: string;           // separate unit (e.g. "g", "mg", "kcal"); if present, display as value+unit
  notes?: string;          // optional context note (e.g. "per serving")
  category?: 'macronutrients' | 'sugars' | 'vitamins' | 'minerals' | 'keyComponents' | 'warnings' | 'other';
  dailyValuePct?: number;  // % of FDA daily value (0–100+); undefined if no DV reference exists
}

export interface ICompositionAnalysis {
  productCategory: string;
  netQuantity: number;
  unitType: string;
  calories: number;
  totalFat: number;
  totalProtein: number;
  totalCarbs?: number | null;
  compositionalDetails: CompositionalDetail[];
  // Fields added by enhanced UPCA prompt
  productType?: 'food' | 'beverage' | 'cosmetic' | 'supplement' | 'household' | 'other';
  productContext?: { what: string; who: string; when: string };
  categoryBadges?: string[];
  nutritionHighlights?: NutritionHighlight[];
  // Serving info — populated by OFacts mapper or UPCA prompt
  servingSize?: string;           // e.g. "1 bar (42g)", "2 tbsp (32g)"
  servingsPerContainer?: number;  // e.g. 8
  // Source tag — "openfoodfacts" | "gemini" | "usda" | "fallback"
  dataSource?: string;
}

/** Reddit Review Analysis */
export interface Review {
  title: string;
  score: number;
  url: string;
}

export interface RedditData {
  pros: string[];
  cons: string[];
  averageRating: number;
  totalMentions: number;
  reviews: Review[];
}

export interface ChatMessage {
  message: string;
  response: string;
  timestamp?: Date; // Made optional since backend sends createdAt
}

export type CardType = 'ingredients' | 'calories' | 'reddit' | 'qa';

export interface CardData {
  [key: string]: any;
}

export type HighlightColor = 'green' | 'blue' | 'pink';

export interface NutritionHighlight {
  label: string;
  value: string;
  unit?: string;
  level: 'low' | 'medium' | 'high' | 'excellent' | 'concern' | 'none';
  levelLabel: string;
  arcPercent: number;
  iconEmoji?: string;
  lucideIcon?: string;
  iconColor: string;
  iconBg: string;
  arcColor: string;
}

export interface ProductBoundingBox {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  color: HighlightColor;
}
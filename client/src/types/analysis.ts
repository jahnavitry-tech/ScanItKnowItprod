import { ProductAnalysis as ServerProductAnalysis } from "../../../server/storage";

// Export the server type with a more specific name to avoid confusion
export type { ServerProductAnalysis };

export interface ExtractedTextData {
  ingredients: string;
  nutrition: string;
  brand: string;
}

/** The initial product analysis created after the first AI call (ARA) */
export interface ProductAnalysis {
  analysisId: string;
  productName: string;
  productSummary: string; // The brief summary from ARA - matches backend field name
  extractedText: ExtractedTextData;
  imageUrl: string;
  // Deep Analysis results (null until orchestration runs)
  featuresData: IFeaturesData | null;
  ingredientsData: IngredientsData | null;
  compositionData: ICompositionAnalysis | null;
  redditData: RedditData | null;
  isFallbackMode: boolean; // Add fallback mode flag
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
}

export interface ICompositionAnalysis {
  productCategory: string;
  netQuantity: number;
  unitType: string;
  calories: number;
  totalFat: number;
  totalProtein: number;
  compositionalDetails: CompositionalDetail[];
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
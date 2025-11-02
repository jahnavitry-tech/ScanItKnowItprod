export interface ProductAnalysis {
  analysisId: string;
  productName: string;
  summary: string;
  extractedText: any;
}

export interface Ingredient {
  name: string;
  safety: string;
  reason: string;
}

export interface IngredientsData {
  ingredients: Ingredient[];
}

export interface SugarType {
  type: string;
  amount: string;
}

export interface VitaminType {
  type: string;
  amount: string;
}

export interface NutritionData {
  calories: number;
  totalSugars: string;
  sugarTypes: SugarType[];
  totalFat: number;
  saturatedFat: number;
  sodium: number;
  totalCarbohydrate: number;
  totalFiber: number;
  totalProtein: number;
  addedSugar: string;
  vitamins: VitaminType[];
}

export interface RedditData {
  pros: string[];
  cons: string[];
  averageRating: number;
  totalMentions: number;
  reviews: Array<{
    title: string;
    score: number;
    url: string;
  }>;
}

export interface ChatMessage {
  message: string;
  response: string;
  timestamp: Date;
}

export type CardType = 'ingredients' | 'calories' | 'reddit' | 'qa';

export interface CardData {
  [key: string]: any;
}

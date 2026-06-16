import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  analyzeImageWithVision, 
  analyzeIngredientsHF, 
  generateChatResponseHF 
} from "./huggingface";
import { analyzeImageWithFallback } from "./fallback";

// Flag to use HuggingFace instead of Google to avoid rate limits
const USE_HUGGINGFACE = false;

// Demo mode disabled - using real HuggingFace API
const DEMO_MODE = false;

// Gemini is now the FALLBACK only. Primary model is Groq (see server/services/groq.ts).
// gemini-2.5-flash-lite: only confirmed free-tier model for this API key (20 req/day).
const VISION_MODEL = "gemini-2.5-flash-lite";
const ANALYSIS_MODEL = "gemini-2.5-flash-lite";

// Counter for tracking Gemini API failures
let geminiFailureCount = 0;
const MAX_GEMINI_FAILURES = 3;

// Timestamp of the last 429/quota error.  Any call within 60 s of that error
// fast-fails immediately so we never double-burn the remaining daily quota.
let last429Timestamp = 0;

export function checkQuotaCooldown(): void {
  const elapsed = Date.now() - last429Timestamp;
  if (elapsed < 60_000) {
    const remaining = Math.ceil((60_000 - elapsed) / 1000);
    const err = Object.assign(
      new Error(`Quota cooldown active — ${remaining}s remaining before retry`),
      { status: 429, retryAfter: remaining, isRateLimit: true },
    );
    throw err;
  }
}

function recordQuotaError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const is429 =
    (err as any)?.status === 429 ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota");
  if (is429) last429Timestamp = Date.now();
}

/**
 * Safely extract text from a Gemini response, even when grounding is active.
 * Falls back to reading parts directly if response.text() throws.
 */
export function safeResponseText(response: any): string {
  let raw = "";
  try {
    raw = response.text() || "";
  } catch {
    const parts: any[] = response?.candidates?.[0]?.content?.parts ?? [];
    raw = parts.map((p: any) => p.text ?? "").join("");
  }
  // Strip markdown fences and inline grounding citations like [1], [2]
  return raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/\[\d+\]/g, "")
    .trim();
}

/**
 * Extract the first balanced JSON object from a string.
 * More robust than a greedy regex when there's prose before or after the JSON.
 */
export function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape)          { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === '"')       { inString = !inString; continue; }
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

// Retry a Gemini call up to maxRetries times on 503 (transient overload).
// Records 429/quota errors so checkQuotaCooldown() can fast-fail callers.
async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 2500): Promise<T> {
  let lastErr: Error = new Error("Unknown error");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`Gemini retry attempt ${attempt}/${maxRetries} after ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      recordQuotaError(err);
      const is429 = (lastErr as any).status === 429 || lastErr.message.includes("429") ||
        lastErr.message.includes("RESOURCE_EXHAUSTED") || lastErr.message.includes("quota");
      if (is429) throw lastErr; // never retry quota errors
      const is503 = lastErr.message.includes("503") || (lastErr as any).status === 503;
      if (!is503) throw lastErr; // don't retry non-transient errors
      console.warn(`Gemini 503 on attempt ${attempt + 1}:`, lastErr.message);
    }
  }
  throw lastErr;
}

export async function identifyProductAndExtractText(base64Image: string): Promise<Array<{
  productName: string;
  extractedText: any;
  summary: string;
}>> {
  // Check for the preferred HuggingFace flag first
  if (USE_HUGGINGFACE) {
    try {
      const result = await analyzeImageWithVision(base64Image);
      // Return as array for consistency
      return [result];
    } catch (error) {
      console.error("Error in HuggingFace image analysis:", error);
      if (error instanceof Error) {
        console.error("HuggingFace error name:", error.name);
        console.error("HuggingFace error message:", error.message);
        console.error("HuggingFace error stack:", error.stack);
      }
      // Re-throw the error to be handled by the calling function
      throw error;
    }
  }

  // --- Start Gemini Logic ---
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing — throwing so OCR fallback activates.");
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  if (DEMO_MODE) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return [{
      productName: "Nature Valley Granola Bar",
      extractedText: {
        ingredients: "Whole Grain Oats, Sugar, Canola Oil, Rice Flour, Honey, Brown Sugar Syrup, Salt, Natural Flavor, Vitamin E (Mixed Tocopherols) Added to Retain Freshness",
        nutrition: "Calories 190, Total Fat 6g, Saturated Fat 1g, Trans Fat 0g, Cholesterol 0mg, Sodium 160mg, Total Carbohydrate 32g, Dietary Fiber 2g, Total Sugars 11g, Added Sugars 10g, Protein 4g",
        servingSize: "2 bars (42g)",
        brand: "Nature Valley"
      },
      summary: "Nature Valley Granola Bar is a wholesome snack made with whole grain oats and natural ingredients. Each serving contains 190 calories and provides sustained energy. Perfect for on-the-go snacking, hiking, or as a quick breakfast option. Contains 4g of protein and 2g of fiber per serving. Best enjoyed as part of an active lifestyle."
    }];
  }

  const prompt = `You are an Autonomous Report Agent (ARA). Return ONLY a valid JSON array — no markdown, no extra text.

OUTPUT SCHEMA: [{"productName":"string","productCategory":"string","productContext":{"what":"string","who":"string","when":"string"},"extractedText":{"ingredients":"string","brand":"string"},"summary":"string"}]

One object per distinct product or scene subject.

EXAMPLES:
Input: photo of Doritos Nacho Cheese bag
Output: [{"productName":"Doritos Nacho Cheese","productCategory":"Snack Chip","productContext":{"what":"Corn tortilla chips with nacho cheese coating","who":"Snack lovers and party hosts, all ages","when":"Any time as a snack or at parties"},"extractedText":{"ingredients":"Corn, Vegetable Oil (Corn, Canola, and/or Sunflower Oil), Maltodextrin, Salt, Cheddar Cheese (Milk, Cheese Cultures, Salt, Enzymes), Whey...","brand":"Doritos / Frito-Lay / 028400064057"},"summary":"Crunchy corn tortilla chips with nacho cheese flavoring. 140 cal/oz. Party snack for all ages."}]

Input: photo of a plate of scrambled eggs and toast
Output: [{"productName":"Scrambled Eggs with Toast","productCategory":"Home-cooked Meal","productContext":{"what":"Scrambled eggs with buttered toast slices","who":"Anyone seeking a quick breakfast or brunch","when":"Morning or brunch time"},"extractedText":{"ingredients":"2 Fried Eggs, 2 Slices Toast, 1 tsp Butter","brand":"Not applicable"},"summary":"Home-cooked breakfast plate. Approximately 320 calories. High protein, moderate carbs."}]

FIELD RULES:
- productCategory: 1–3 word type label (e.g., "Granola Bar", "Face Moisturizer", "Energy Drink", "Vitamin Supplement", "Cleaning Spray")
- productContext.what: what the product is — max 10 words
- productContext.who: intended user or audience — max 10 words
- productContext.when: when to use or consume it — max 10 words

BRANDED PRODUCT rules:
- ingredients: FULL verbatim list from the label, comma-separated
- brand: brand name + product name + all barcodes/QR codes found
- summary: max 3 lines — key features + purpose + typical user

NON-BRANDED SCENE rules:
- ingredients: list every visible component WITH estimated quantity/portion (e.g., "2 Fried Eggs, 2 Rashers Bacon, 1 can Baked Beans, 1 Sausage, 2 Grilled Tomatoes")
- brand: "Not applicable"
- summary: describe the scene + estimated total calories + macros (e.g., "Full English breakfast. Approx 650–750 kcal. High protein, high fat.")

EDGE CASES:
- Blurry/partial label: extract visible text; prefix with "partial: "
- Multiple products: one object per product, never merge
- No text visible: set ingredients and brand to "Not visible"`;

  const image = { inlineData: { data: base64Image, mimeType: "image/jpeg" } };

  // Retry up to 2 extra times on 503 (transient overload) before giving up
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 2500;
  let lastError: Error = new Error("Unknown Gemini error");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`Gemini 503 — retrying attempt ${attempt + 1}/${MAX_RETRIES + 1} after ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: VISION_MODEL });

      console.log(`Sending image to Gemini for analysis (attempt ${attempt + 1})...`);
      const result = await model.generateContent([prompt, image]);
      const content = result.response.text() || "";
      console.log("Received response from Gemini:", content.substring(0, 200) + "...");

      // Success — reset failure counter
      geminiFailureCount = 0;

      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const resultData = JSON.parse(jsonMatch[0]);
          if (Array.isArray(resultData) && resultData.length > 0) {
            console.log("Successfully parsed AI response with", resultData.length, "products");
            return resultData;
          }
        }
      } catch (parseErr) {
        console.error("Failed to parse Gemini JSON response:", parseErr);
      }

      // Gemini responded but JSON was unparseable — throw so OCR fallback runs
      throw new Error("Gemini returned an unparseable response");

    } catch (error) {
      lastError = error as Error;
      console.error(`Gemini attempt ${attempt + 1} failed:`, lastError.message);

      const isQuota = lastError.message.includes("429") || lastError.message.includes("RESOURCE_EXHAUSTED") || lastError.message.includes("quota");
      const is503   = lastError.message.includes("503") || (lastError as any).status === 503;
      if (!is503 || isQuota) break; // Don't retry quota errors or non-transient errors
    }
  }

  // All attempts exhausted — throw so routes.ts triggers the real OCR fallback
  geminiFailureCount++;
  const isQuotaErr = lastError.message.includes("429") || lastError.message.includes("quota");
  console.error(`Gemini failed${isQuotaErr ? " (quota exhausted — resets at midnight UTC)" : " after retries"}. Triggering OCR fallback.`);
  throw lastError;
}

export async function analyzeIngredients(productName: string, brand: string, summary: string, extractedText: any): Promise<any> {
  checkQuotaCooldown(); // fast-fail if quota was hit < 60 s ago

  if (DEMO_MODE) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
      ingredients_analysis: [
        { name: "Whole Grain Oats", safety_status: "Safe", reason_with_source: "Natural whole grain" },
        { name: "Sugar", safety_status: "Moderate", reason_with_source: "High sugar content" },
        { name: "Canola Oil", safety_status: "Safe", reason_with_source: "Heart healthy oil" },
        { name: "Rice Flour", safety_status: "Safe", reason_with_source: "Gluten-free grain" },
        { name: "Honey", safety_status: "Safe", reason_with_source: "Natural sweetener" },
        { name: "Brown Sugar Syrup", safety_status: "Moderate", reason_with_source: "Added sugar source" },
        { name: "Salt", safety_status: "Safe", reason_with_source: "Natural preservative" },
        { name: "Natural Flavor", safety_status: "Safe", reason_with_source: "FDA approved flavoring" },
        { name: "Vitamin E", safety_status: "Safe", reason_with_source: "Essential nutrient antioxidant" }
      ]
    };
  }

  // First try with Google and web search model
  try {
    // Initialize Google Generative AI client inside the function to ensure env vars are loaded
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing for ingredient analysis.");
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    // Detect if the ingredient text from the scan is a placeholder / empty
    const rawIngredients = extractedText?.ingredients || "";
    const ingredientsAreMissing = !rawIngredients || rawIngredients.length < 10 ||
      /n\/a|not\s+available|not\s+visible|not\s+shown|not\s+applicable|unable|fallback|no\s+ingredient/i.test(rawIngredients);

    const prompt = `Ingredient safety analyst. Rate each ingredient using FDA, EWG, WHO, CDC classifications.

Product: ${productName} by ${brand}
${rawIngredients && !ingredientsAreMissing
  ? `Ingredients: ${rawIngredients}`
  : `No ingredients extracted. Use your training knowledge of typical ingredients for "${productName}" by ${brand}.`
}

Rate each: Safe | Moderate | Harmful
- Moderate/Harmful: one-line reason with source (e.g. "linked to skin irritation (EWG)")
- Safe: "Safe" or "Safe (unless allergic)"

EXAMPLE OUTPUT:
{"ingredients_analysis":[
  {"name":"Water","safety_status":"Safe","reason_with_source":"Inert solvent, no known harm"},
  {"name":"Sodium Benzoate","safety_status":"Moderate","reason_with_source":"Possible benzene formation with ascorbic acid (FDA)"},
  {"name":"Methylparaben","safety_status":"Harmful","reason_with_source":"Endocrine disruptor risk at high doses (EWG score 4-6)"}
]}

If product is unknown/obscure with no data:
{"ingredients_analysis":[{"name":"Unknown","safety_status":"Safe","reason_with_source":"No ingredient data available — cannot assess"}]}`;

    console.log("Sending ingredients analysis request to Gemini...");
    const result = await withGeminiRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      })
    );

    const content = result.response.text();
    console.log("Received Gemini ingredients response (first 200):", content.substring(0, 200));

    try {
      return JSON.parse(content);
    } catch {
      console.error("Could not parse ingredients JSON from Gemini response");
      return { ingredients_analysis: [] };
    }
  } catch (error) {
    console.error("Error in ingredients analysis:", error);
    // Always rethrow — routes.ts calls analyzeIngredientsFallback (OCR-based, no AI).
    throw error;
  }
}

// --- 3. Product Features Analysis (UPSA) ---
export async function analyzeFeatures(productName: string, extractedText: any, summary: string) {
  // Skipping HuggingFace for this custom analysis
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const genAI = new GoogleGenerativeAI(apiKey);

  if (DEMO_MODE) {
    return {
      productCategory: "Breakfast Cereal",
      mainPurpose: "Quick, high-fiber, and vitamin-fortified breakfast.",
      usageInstructions: "Serve with milk or yogurt. Enjoy hot or cold.",
      extraDetails: "Health-conscious adults and active families."
    };
  }
  
  const prompt = `You are a product marketing expert. Based on the product name "${productName}", brand "${extractedText.brand}", and summary "${summary}", generate structured key facts about the product. Your output MUST be a valid JSON object with the following structure: { "productCategory": "string", "mainPurpose": "string", "usageInstructions": "string", "extraDetails": "string" }. Do not add any extra text or markdown fences.
  
  Product Information:
  Product Name: ${productName}
  Brand: ${extractedText.brand}
  Summary: ${summary}
  Ingredients: ${extractedText.ingredients}
  Nutrition/Composition: ${extractedText.nutrition}

  Required Output Format:
  {
    "productCategory": "[General category based on text, e.g., 'Snack Bar', 'Beverage']",
    "mainPurpose": "[Primary use/purpose of the product]",
    "usageInstructions": "[How to use/consume the product]",
    "extraDetails": "[Additional relevant information about the product]"
  }`;

  try {
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} } as any]
    });

    const response = await result.response;
    const content = response.text() || "";
    
    try {
      return JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          return {
            productCategory: "",
            mainPurpose: "",
            usageInstructions: "",
            extraDetails: ""
          };
        }
      }
      return {
        productCategory: "",
        mainPurpose: "",
        usageInstructions: "",
        extraDetails: ""
      };
    }
    
  } catch (error) {
    console.error("Error in feature analysis:", error);
    return {
      productCategory: "",
      mainPurpose: "",
      usageInstructions: "",
      extraDetails: ""
    }; // Return empty data on error
  }
}

// --- 4. Product Compositional Analysis (UPCA) ---
export async function analyzeComposition(productName: string, brand: string, summary: string, extractedText: any): Promise<any> {
  checkQuotaCooldown(); // fast-fail if quota was hit < 60 s ago

  if (DEMO_MODE) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return {
      productCategory: "Snack Bar",
      netQuantity: 42,
      unitType: "g",
      calories: 190,
      totalFat: 6,
      totalProtein: 4,
      compositionalDetails: [
        { key: "Total Carbohydrate", value: "32g" },
        { key: "Dietary Fiber", value: "2g" },
        { key: "Total Sugars", value: "11g" },
        { key: "Added Sugars", value: "10g" },
        { key: "Sodium", value: "160mg" },
        { key: "Saturated Fat", value: "1g" },
        { key: "Vitamin E", value: "5mg" }
      ]
    };
  }

  try {
    // Initialize Google Generative AI client inside the function to ensure env vars are loaded
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing for composition analysis.");
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use web search model for real-time grounding
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const prompt = `Product composition analyst. Return a structured JSON report for the product below.

Product: ${productName} by ${brand}
Summary: ${summary}
Extracted data: ${JSON.stringify(extractedText)}

Rules:
- Food/Consumable (packaged): extract Calories, Fat, Protein as numbers from label data; fill compositionalDetails with all nutrition facts.
- Non-Food/Topical: set calories/totalFat/totalProtein to 0; fill compositionalDetails with chemical/material components.
- GENERAL SCENE (brand = "Not applicable"): this is a real-world meal or scene, not a packaged product.
  Use your knowledge to estimate nutrition for the WHOLE meal/scene.
  List EACH VISIBLE COMPONENT as a separate compositionalDetail entry using the quantity from ingredients (e.g. "2 Fried Eggs", "1 Pork Sausage", "2 Rashers Bacon").
  Set the "notes" field to the estimated portion size (e.g. "~2 medium eggs, ~120g").
  Set productContext.when = "Estimated from visible components".
  Estimate total calories/fat/protein for the full meal.
- categoryBadges: ONLY badges confirmed by data (max 6).
  Food: vegan|vegetarian|non-gmo|gluten-free|no-added-sugar|organic|no-artificial|high-protein|high-fiber|dairy-free|keto-friendly|low-sodium
  Cosmetic: fragrance-free|paraben-free|sulfate-free|derm-tested|hypoallergenic|cruelty-free|vegan-formula|spf-protected|for-sensitive|for-dry-skin|for-acne|non-comedogenic
- nutritionHighlights: EXACTLY 3 items — most significant metrics for this product type.

FOOD EXAMPLE (partial):
{"productCategory":"Granola Bar","calories":190,"totalFat":6,"totalProtein":4,"productType":"food","productContext":{"what":"Whole grain oat snack bar","who":"Active adults, hikers","how":"On-the-go snack"},"categoryBadges":["non-gmo","no-artificial"],"nutritionHighlights":[{"label":"Calories","value":"190","unit":"kcal","level":"medium","levelLabel":"Moderate","arcPercent":38,"lucideIcon":"Flame","iconColor":"text-orange-500","iconBg":"bg-orange-50","arcColor":"#f97316"},{"label":"Protein","value":"4","unit":"g","level":"low","levelLabel":"Low","arcPercent":8,"lucideIcon":"Dumbbell","iconColor":"text-blue-500","iconBg":"bg-blue-50","arcColor":"#3b82f6"},{"label":"Sugar","value":"11","unit":"g","level":"high","levelLabel":"High","arcPercent":22,"lucideIcon":"Cookie","iconColor":"text-pink-500","iconBg":"bg-pink-50","arcColor":"#ec4899"}]}

COSMETIC EXAMPLE (partial):
{"productCategory":"Face Moisturizer","calories":0,"totalFat":0,"totalProtein":0,"productType":"cosmetic","categoryBadges":["paraben-free","for-sensitive"],"nutritionHighlights":[{"label":"SPF","value":"30","unit":null,"level":"excellent","levelLabel":"Protected","arcPercent":60,"lucideIcon":"Sun","iconColor":"text-amber-500","iconBg":"bg-amber-50","arcColor":"#f59e0b"},{"label":"Hyaluronic Acid","value":"Present","unit":null,"level":"excellent","levelLabel":"Active","arcPercent":100,"lucideIcon":"Droplets","iconColor":"text-blue-400","iconBg":"bg-blue-50","arcColor":"#60a5fa"},{"label":"Fragrance","value":"Free","unit":null,"level":"low","levelLabel":"Safe","arcPercent":0,"lucideIcon":"Sparkles","iconColor":"text-green-500","iconBg":"bg-green-50","arcColor":"#22c55e"}]}

Return ONLY valid JSON, no markdown:
{"productCategory":"string","netQuantity":0,"unitType":"string","servingSize":"string or null","servingsPerContainer":0,"calories":0,"totalFat":0,"totalProtein":0,"totalCarbs":0,"compositionalDetails":[{"key":"string","value":"number as string","unit":"g|mg|kcal|mcg|etc","notes":"optional context or null","category":"macronutrients|sugars|vitamins|minerals|keyComponents|warnings|other","dailyValuePct":0}],"productType":"food|beverage|cosmetic|supplement|household|other","productContext":{"what":"max 10 words","who":"max 10 words","when":"max 10 words"},"categoryBadges":[],"nutritionHighlights":[{"label":"string","value":"string","unit":"string or null","level":"low|medium|high|excellent|concern|none","levelLabel":"string","arcPercent":0,"lucideIcon":"Flame|Droplets|Zap|Dumbbell|Sparkles|Sun|Cookie","iconColor":"text-orange-500","iconBg":"bg-orange-50","arcColor":"#f97316"}],"dataSource":"gemini"}

Notes: value in compositionalDetails must be a numeric string only (e.g. "190" not "190kcal"); put the unit in the unit field. dailyValuePct: use FDA 2000-kcal DVs; omit if no FDA DV exists (e.g. trans fat). totalCarbs = Total Carbohydrate value as a number.`;

    const result = await withGeminiRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      })
    );
    const content = result.response.text();
    console.log("UPCA raw content (first 300):", content.substring(0, 300));

    try {
      return JSON.parse(content);
    } catch {
      console.error("UPCA: could not parse JSON, returning fallback");
      return { productCategory: "", netQuantity: 0, unitType: "", calories: 0, totalFat: 0, totalProtein: 0, compositionalDetails: [] };
    }
  } catch (error) {
    console.error("Error analyzing composition:", error);
    // Always rethrow — routes.ts calls analyzeCompositionFallback (OCR-based, no AI).
    // The previous inline VISION_MODEL secondary attempt was another Gemini call that
    // hit the same quota and returned empty zeros — exactly what we're trying to avoid.
    throw error;
  }
}

// ─── Chat prompt helper ───────────────────────────────────────────────────────
// Single source of truth — used by both the primary (Google Search) and fallback
// (plain gemini-1.5-flash) code paths so they never drift apart.
function buildChatPrompt(productData: { productName: string; productSummary: string; extractedText: any }, question: string): string {
  return `You are a product analysis expert. Answer the user's question about ${productData.productName} concisely.

Rules:
- Plain text only. No JSON. No markdown fences.
- Under 3 lines: single paragraph. Over 3 lines: bullet points.
- If unknown or cannot verify: say so in one sentence.

Product: ${productData.productName}
Summary: ${productData.productSummary}
Ingredients: ${productData.extractedText?.ingredients ?? "Not available"}

Question: ${question}`;
}

// Interface for the data passed to the chat function
interface ChatProductData {
  productName: string;
  productSummary: string;
  extractedText: any;
  ingredientsData: any;
  featuresData?: any;    // Made optional
  compositionData?: any; // Made optional
  // NOTE: nutritionData has been removed
}

export async function generateChatResponse(question: string, productData: ChatProductData): Promise<string> {
  if (DEMO_MODE) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Simple demo responses based on common questions
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes("healthy") || lowerQuestion.includes("good for you")) {
      return "This Nature Valley Granola Bar has some healthy ingredients like whole grain oats and honey, but it also contains 11g of sugar per serving. It's a decent snack for active people, but should be eaten in moderation due to the sugar content.";
    }
    
    if (lowerQuestion.includes("ingredient") || lowerQuestion.includes("contain")) {
      return "The main ingredients are whole grain oats, sugar, canola oil, rice flour, and honey. It also contains brown sugar syrup, salt, natural flavor, and vitamin E. Most ingredients are considered safe, though it has moderate sugar levels.";
    }
    
    if (lowerQuestion.includes("calories") || lowerQuestion.includes("nutrition")) {
      return "Each serving (2 bars) contains 190 calories, 6g of fat, 32g of carbohydrates, and 4g of protein. It has 11g of total sugars, with 10g being added sugars.";
    }
    
    if (lowerQuestion.includes("allerg") || lowerQuestion.includes("gluten")) {
      return "Based on the ingredients shown, this product contains oats and may be processed in facilities that handle other allergens. For specific allergen information, please check the product packaging directly.";
    }
    
    return "I can help answer questions about this Nature Valley Granola Bar's ingredients, nutrition facts, or general product information. What would you like to know?";
  }

  try {
    // Initialize Google Generative AI client inside the function to ensure env vars are loaded
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing for chat response.");
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use web search model for real-time grounding
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildChatPrompt(productData, question) }] }],
      tools: [{ googleSearch: {} } as any]
    });
    const response = await result.response;
    
    return response.text() || "I'm sorry, I couldn't generate a response to that question.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      return "I've reached the daily rate limit for Google's free tier. To continue using the AI chat feature, you can add credits to your Google account or try again tomorrow when the limit resets.";
    }
    
    // Fall back to the original model if web search model fails
    try {
      // Initialize Google Generative AI client inside the function to ensure env vars are loaded
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY is missing for fallback chat response.");
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const result = await model.generateContent(buildChatPrompt(productData, question));
      const response = await result.response;
      
      return response.text() || "I'm sorry, I couldn't generate a response to that question.";
    } catch (fallbackError) {
      console.error("Error in fallback chat response:", fallbackError);
      return "Sorry, I encountered an error while processing your question. Please try again.";
    }
  }
}

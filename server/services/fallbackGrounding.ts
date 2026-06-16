// server/services/fallbackGrounding.ts
//
// Pure deterministic fallback — never calls Gemini.
// A fallback that hits the same rate-limited service is not a fallback.

function guessCategory(productName: string, summary: string): string {
  const t = (productName + " " + summary).toLowerCase();
  if (/snack|bar|granola|cookie|cracker|chip/.test(t))       return "Snack";
  if (/beverage|drink|juice|soda|water|tea|coffee/.test(t))  return "Beverage";
  if (/cereal|oat|bread|pasta|rice/.test(t))                 return "Grain Product";
  // Cosmetic brand names + ingredient/usage keywords
  if (/cerave|neutrogena|la roche|olay|cetaphil|eucerin|aveeno|clinique|loreal|l'oreal|maybelline|nyx|mac cosmetics|revlon/.test(t)) return "Skincare";
  if (/skincare|skin care|moisturiz|moisturiser|serum|sunscreen|spf|toner|cleanser|face wash|retinol|niacinamide|hyaluronic|ceramide|vitamin c cream|eye cream/.test(t)) return "Skincare";
  if (/shampoo|conditioner|body wash|hair mask|hair oil/.test(t)) return "Hair & Body Care";
  if (/makeup|foundation|lipstick|mascara|concealer|blush|eyeshadow|primer|bb cream|cc cream/.test(t)) return "Cosmetics";
  if (/deodorant|antiperspirant|perfume|cologne|body spray/.test(t)) return "Personal Care";
  if (/supplement|vitamin|capsule|tablet|omega|probiotic|zinc|magnesium|protein powder/.test(t)) return "Supplement";
  return "General Product";
}

function guessProductType(category: string): "food" | "beverage" | "cosmetic" | "supplement" | "other" {
  if (/Supplement/.test(category))                         return "supplement";
  if (/Snack|Beverage|Grain/.test(category))               return "food";
  if (/Skincare|Hair|Cosmetic|Personal Care/.test(category)) return "cosmetic";
  return "other";
}

export async function analyzeIngredientsFallback(analysis: any) {
  console.log("Using OCR fallback for ingredients (no AI call)");

  const rawIngredients: string = analysis.extractedText?.ingredients || "";

  let ingredientList = rawIngredients
    .split(/[,;\n]/)
    .map((i: string) => i.trim())
    .filter((i: string) => i.length > 2 && i.length < 80);

  if (ingredientList.length === 0) {
    ingredientList = ["Ingredients could not be identified from label"];
  }

  return {
    ingredients_analysis: ingredientList.map((name: string) => ({
      name,
      safety_status: "Safe",
      reason_with_source: "Parsed from product label — verify against official sources.",
    })),
  };
}

export async function analyzeCompositionFallback(analysis: any) {
  console.log("Using OCR regex fallback for composition (no AI call)");

  const brandText:  string = analysis.extractedText?.brand       || "";
  // ingredients text is still present — try to parse any embedded calorie hints
  const ingText:    string = analysis.extractedText?.ingredients || "";
  // summary may contain "Approx X calories" from the ARA general-scene rule
  const summaryText: string = (analysis.productSummary || analysis.summary || "");

  const productCategory = guessCategory(analysis.productName || "", summaryText);
  const productType     = guessProductType(productCategory);

  const result: any = {
    productCategory,
    productType,
    netQuantity:  0,
    unitType:     productType === "cosmetic" ? "ml" : "g",
    calories:     0,
    totalFat:     0,
    totalProtein: 0,
    compositionalDetails: [] as Array<{ key: string; value: string; category?: string }>,
  };

  // Try to parse calories from summary (ARA now puts estimates there for general scenes)
  const calSummary = summaryText.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*(?:cal(?:ories?)?|kcal)/i);
  // Also try ingredients text (some labels embed "X kcal" in ingredient blocks)
  const calIng     = ingText.match(/(\d+)\s*(?:cal(?:ories?)?|kcal)/i);
  const calMatch   = calSummary || calIng;
  if (calMatch) result.calories = parseInt(calMatch[1]);

  // Net quantity from brand field (e.g. "50ml", "200g")
  const qtyMatch = brandText.match(/(\d+(?:\.\d+)?)\s*(mL|ml|fl\s*oz|oz|g|kg)\b/i);
  if (qtyMatch) {
    result.netQuantity = parseFloat(qtyMatch[1]);
    result.unitType    = qtyMatch[2].replace(/\s+/g, "");
  }

  // For cosmetics: list the ingredients as key components instead of nutrition rows
  if (productType === "cosmetic" && ingText && ingText.length > 5) {
    const items = ingText.split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 1 && s.length < 80);
    items.slice(0, 12).forEach((name: string) => {
      result.compositionalDetails.push({ key: name, value: "Present", category: "keyComponents" });
    });
  }

  if (result.compositionalDetails.length === 0 && result.calories === 0) {
    result.compositionalDetails.push({ key: "Note", value: "Detailed data unavailable — AI analysis required." });
  }

  return result;
}

export async function analyzeRedditFallback(_analysis: any) {
  // Intentionally returns null — routes.ts responds with 503 so the client
  // shows an error state instead of a misleading empty-object result.
  return null;
}

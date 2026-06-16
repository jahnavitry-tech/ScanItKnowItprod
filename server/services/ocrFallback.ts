// OCR.Space API configuration
const OCR_API_KEY = process.env.OCR_API_KEY;
const OCR_API_URL = 'https://api.ocr.space/parse/image';

/**
 * Validates EAN/UPC barcode checksum
 * @param barcode The barcode to validate
 * @returns boolean indicating if the barcode is valid
 */
export function validateBarcodeChecksum(barcode: string): boolean {
  // Remove any non-digit characters
  const cleanBarcode = barcode.replace(/\D/g, '');
  
  // Check if it's a valid length (UPC-A: 12 digits, EAN-13: 13 digits)
  if (cleanBarcode.length !== 12 && cleanBarcode.length !== 13) {
    return false;
  }
  
  // Convert to array of integers
  const digits = cleanBarcode.split('').map(Number);
  
  let sum = 0;
  
  if (cleanBarcode.length === 12) {
    // UPC-A checksum validation
    for (let i = 0; i < 11; i++) {
      sum += (i % 2 === 0) ? digits[i] * 3 : digits[i];
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === digits[11];
  } else if (cleanBarcode.length === 13) {
    // EAN-13 checksum validation
    for (let i = 0; i < 12; i++) {
      sum += (i % 2 === 0) ? digits[i] : digits[i] * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === digits[12];
  }
  
  return false;
}

/**
 * Extract text from image using OCR.Space API
 * @param base64Image Base64 encoded image data
 * @returns Promise with OCR results
 */
export async function extractTextWithOCR(base64Image: string): Promise<any> {
  try {
    console.log("Using OCR fallback for image analysis");

    // OCR.space requires form-encoded body (not JSON) and a full data URI prefix.
    const form = new URLSearchParams();
    form.append("base64Image", `data:image/jpeg;base64,${base64Image}`);
    form.append("apikey", OCR_API_KEY || "helloworld");
    form.append("language", "eng");
    form.append("isOverlayRequired", "true");
    form.append("OCREngine", "2");  // engine 2 handles dense/small text better

    const response = await fetch(OCR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!response.ok) {
      throw new Error(`OCR API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data?.ErrorMessage) {
      throw new Error(`OCR API Error: ${data.ErrorMessage}`);
    }

    if (!data?.ParsedResults?.[0]) {
      throw new Error('No text detected in image');
    }

    return data.ParsedResults[0];
  } catch (error) {
    console.error("OCR fallback failed:", error);
    // Check if it's a rate limit error (status 429)
    if (error instanceof Error && error.message.includes('429')) {
      throw new Error("OCR_RATE_LIMIT_EXCEEDED");
    }
    throw error;
  }
}

/**
 * Extract product information from OCR text
 * @param ocrText Raw OCR text
 * @returns Extracted product information
 */
export function extractProductInfoFromOCR(ocrText: string): any {
  console.log("Extracting product info from OCR text");
  
  // Try to find barcode in OCR text (common formats)
  const barcodeRegex = /(\d{12,13})|(\d{3}\s*\d{3}\s*\d{3}\s*\d{3})/g;
  const barcodeMatch = ocrText.match(barcodeRegex);
  let barcode = null;
  
  // Validate barcode checksum if found
  if (barcodeMatch) {
    const potentialBarcode = barcodeMatch[0].replace(/\s/g, '');
    if (validateBarcodeChecksum(potentialBarcode)) {
      barcode = potentialBarcode;
    }
  }
  
  // Try to extract product name and brand
  let productName = "Unknown Product";
  let brand = "Unknown Brand";
  
  // Common patterns for product names and brands
  const lines = ocrText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    
    // Try to extract brand and product name from the first line
    // Look for patterns like "Brand Product Name" or "Brand: Product Name"
    const brandProductRegex = /^([A-Z][a-zA-Z0-9\s\-']+)[\s:]*([A-Z][a-zA-Z0-9\s\-']+)/;
    const match = firstLine.match(brandProductRegex);
    
    if (match) {
      brand = match[1].trim();
      productName = match[2].trim();
    } else {
      // Fallback to using the first line as product name
      productName = firstLine;
    }
  }
  
  return {
    productName,
    brand,
    barcode,
    ocrText
  };
}

/**
 * Search Open Food Facts API with barcode
 * @param barcode Product barcode
 * @returns Promise with product data or null if not found
 */
export async function searchOpenFoodFacts(barcode: string): Promise<any> {
  try {
    console.log(`Searching Open Food Facts for barcode: ${barcode}`);
    
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    
    if (!response.ok) {
      throw new Error(`Open Food Facts request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data?.status === 1 && data?.product) {
      return data.product;
    }
    
    return null;
  } catch (error) {
    console.error("Open Food Facts search failed:", error);
    return null;
  }
}

/**
 * Search Open Beauty Facts API with barcode
 * @param barcode Product barcode
 * @returns Promise with product data or null if not found
 */
export async function searchOpenBeautyFacts(barcode: string): Promise<any> {
  try {
    console.log(`Searching Open Beauty Facts for barcode: ${barcode}`);
    
    const response = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`);
    
    if (!response.ok) {
      throw new Error(`Open Beauty Facts request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data?.status === 1 && data?.product) {
      return data.product;
    }
    
    return null;
  } catch (error) {
    console.error("Open Beauty Facts search failed:", error);
    return null;
  }
}

/**
 * Extract product data from Open Food Facts response
 * @param productData Raw product data from Open Food Facts
 * @returns Formatted product information
 */
export function extractFromOpenFoodFacts(productData: any): any {
  return {
    productName: productData.product_name || "Unknown Product",
    brand: productData.brands || "Unknown Brand",
    ingredients: productData.ingredients_text || "Ingredients not available",
    productCategory: productData.categories || "General/Unspecified",
    nutrition: {
      calories: productData.nutriments?.energy_value || 0,
      fat: productData.nutriments?.fat_value || 0,
      protein: productData.nutriments?.proteins_value || 0
    }
  };
}

// FDA daily reference values (2000 kcal diet, adults 4+ years).
// Used to compute dailyValuePct for each nutrient.
const FDA_DV: Record<string, number> = {
  "Total Fat":           78,    // g
  "Saturated Fat":       20,    // g
  "Cholesterol":         300,   // mg
  "Sodium":              2300,  // mg
  "Total Carbohydrate":  275,   // g
  "Dietary Fiber":       28,    // g
  "Added Sugars":        50,    // g
  "Protein":             50,    // g
  "Vitamin D":           20,    // mcg
  "Calcium":             1300,  // mg
  "Iron":                18,    // mg
  "Potassium":           4700,  // mg
  "Vitamin C":           90,    // mg
  "Vitamin A":           900,   // mcg
};

type NutrientCategory = 'macronutrients' | 'sugars' | 'vitamins' | 'minerals' | 'keyComponents' | 'warnings' | 'other';

interface NutrientMapEntry {
  ofKey: string;
  label: string;
  unit: string;
  category: NutrientCategory;
  // Some OFacts values need unit conversion before display
  multiplier?: number;
}

// Maps OFacts nutriments keys to our display schema.
// For each entry we prefer nutriments[ofKey + "_serving"], then "_100g", then bare key.
const OFACTS_NUTRIENT_MAP: NutrientMapEntry[] = [
  { ofKey: "energy-kcal",    label: "Calories",           unit: "kcal", category: "macronutrients" },
  { ofKey: "fat",            label: "Total Fat",          unit: "g",    category: "macronutrients" },
  { ofKey: "saturated-fat",  label: "Saturated Fat",      unit: "g",    category: "macronutrients" },
  { ofKey: "trans-fat",      label: "Trans Fat",          unit: "g",    category: "macronutrients" },
  { ofKey: "cholesterol",    label: "Cholesterol",        unit: "mg",   category: "macronutrients", multiplier: 1000 },
  { ofKey: "carbohydrates",  label: "Total Carbohydrate", unit: "g",    category: "macronutrients" },
  { ofKey: "fiber",          label: "Dietary Fiber",      unit: "g",    category: "macronutrients" },
  { ofKey: "sugars",         label: "Total Sugars",       unit: "g",    category: "sugars"         },
  { ofKey: "added-sugars",   label: "Added Sugars",       unit: "g",    category: "sugars"         },
  { ofKey: "proteins",       label: "Protein",            unit: "g",    category: "macronutrients" },
  // OFacts stores sodium in g; multiply × 1000 to get mg
  { ofKey: "sodium",         label: "Sodium",             unit: "mg",   category: "macronutrients", multiplier: 1000 },
  { ofKey: "potassium",      label: "Potassium",          unit: "mg",   category: "minerals",       multiplier: 1000 },
  { ofKey: "calcium",        label: "Calcium",            unit: "mg",   category: "minerals",       multiplier: 1000 },
  { ofKey: "iron",           label: "Iron",               unit: "mg",   category: "minerals",       multiplier: 1000 },
  { ofKey: "vitamin-d",      label: "Vitamin D",          unit: "mcg",  category: "vitamins"        },
  { ofKey: "vitamin-c",      label: "Vitamin C",          unit: "mg",   category: "vitamins"        },
  { ofKey: "vitamin-a",      label: "Vitamin A",          unit: "mcg",  category: "vitamins"        },
];

/**
 * Map a full Open Food Facts product object to ICompositionAnalysis.
 * Prefers per-serving values over per-100g. Includes %DV where FDA reference exists.
 */
export function mapOFactsToCompositionSchema(product: any): any {
  const n = product.nutriments ?? {};

  // Resolve a nutrient value: prefer _serving, then _100g, then bare key.
  const resolve = (key: string): number | null => {
    const serving = n[key + "_serving"];
    if (serving != null && serving !== "") return Number(serving);
    const per100 = n[key + "_100g"];
    if (per100 != null && per100 !== "") return Number(per100);
    const base = n[key];
    if (base != null && base !== "") return Number(base);
    return null;
  };

  const details: Array<{
    key: string; value: string; unit: string;
    category: NutrientCategory;
    dailyValuePct?: number;
  }> = [];

  let calories = 0;
  let totalFat = 0;
  let totalProtein = 0;
  let totalCarbs: number | null = null;

  for (const entry of OFACTS_NUTRIENT_MAP) {
    let raw = resolve(entry.ofKey);
    if (raw === null || isNaN(raw)) continue;

    // Apply unit multiplier (e.g. g → mg for sodium/minerals)
    const numericValue = entry.multiplier ? raw * entry.multiplier : raw;

    // Populate top-level macro shortcuts
    if (entry.label === "Calories")          calories     = Math.round(numericValue);
    if (entry.label === "Total Fat")         totalFat     = Math.round(numericValue * 10) / 10;
    if (entry.label === "Protein")           totalProtein = Math.round(numericValue * 10) / 10;
    if (entry.label === "Total Carbohydrate") totalCarbs  = Math.round(numericValue * 10) / 10;

    // Numeric string only — unit stored separately
    const displayValue = Number.isInteger(numericValue)
      ? `${numericValue}`
      : `${Math.round(numericValue * 10) / 10}`;

    // Compute %DV
    const dv = FDA_DV[entry.label];
    const dailyValuePct = dv ? Math.round((numericValue / dv) * 100) : undefined;

    details.push({
      key: entry.label,
      value: displayValue,
      unit: entry.unit,
      category: entry.category,
      dailyValuePct,
    });
  }

  // Parse quantity string, e.g. "500g" → { netQuantity: 500, unitType: "g" }
  let netQuantity = 0;
  let unitType = "g";
  const qtyStr = product.quantity ?? "";
  const qtyMatch = qtyStr.match(/^([\d.]+)\s*([a-zA-Z]+)/);
  if (qtyMatch) {
    netQuantity = parseFloat(qtyMatch[1]);
    unitType = qtyMatch[2].toLowerCase();
  }

  return {
    productCategory: product.categories_tags?.[0]?.replace(/^en:/, "") ?? product.product_name ?? "Food",
    netQuantity,
    unitType,
    calories,
    totalFat,
    totalProtein,
    totalCarbs,
    compositionalDetails: details,
    productType: "food" as const,
    servingSize: product.serving_size ?? undefined,
    servingsPerContainer: product.serving_quantity ? Number(product.serving_quantity) : undefined,
    // Source tag so the card can show "Data from Open Food Facts"
    dataSource: "openfoodfacts",
  };
}

/**
 * Extract product data from Open Beauty Facts response
 * @param productData Raw product data from Open Beauty Facts
 * @returns Formatted product information
 */
export function extractFromOpenBeautyFacts(productData: any): any {
  return {
    productName: productData.product_name || "Unknown Product",
    brand: productData.brands || "Unknown Brand",
    ingredients: productData.ingredients_text || "Ingredients not available",
    productCategory: productData.categories || "Cosmetic/Topical",
    // Beauty products typically don't have nutrition info
    nutrition: {
      calories: 0,
      fat: 0,
      protein: 0
    }
  };
}

/**
 * Extract general item information using regex patterns
 * @param ocrText Raw OCR text
 * @returns Extracted product information
 */
export function extractGeneralItemInfo(ocrText: string): any {
  console.log("Extracting general item info from OCR text");
  
  // Split text into lines
  const lines = ocrText.split('\n').filter(line => line.trim().length > 0);
  
  let productName = "Unknown Product";
  let brand = "Unknown Brand";
  let ingredients = "Ingredients information not available";
  
  if (lines.length > 0) {
    // Use first line as product name
    productName = lines[0].trim();
    
    // Try to find brand in subsequent lines
    const brandRegex = /(brand|made by|mfr|manufacturer)[:\s]*([A-Z][a-zA-Z0-9\s\-']+)/i;
    for (let i = 1; i < Math.min(5, lines.length); i++) {
      const match = lines[i].match(brandRegex);
      if (match) {
        brand = match[2].trim();
        break;
      }
    }
    
    // Try to find ingredients or materials
    const ingredientPatterns = [
      /ingredients[:\s]*([^\n]+)/i,
      /materials[:\s]*([^\n]+)/i,
      /composition[:\s]*([^\n]+)/i,
      /contains[:\s]*([^\n]+)/i
    ];
    
    for (const pattern of ingredientPatterns) {
      const match = ocrText.match(pattern);
      if (match) {
        ingredients = match[1].trim();
        break;
      }
    }
  }
  
  return {
    productName,
    brand,
    ingredients,
    productCategory: "General/Unspecified",
    nutrition: {
      calories: 0,
      fat: 0,
      protein: 0
    }
  };
}
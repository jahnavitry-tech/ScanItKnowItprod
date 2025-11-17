// OCR.Space API configuration
const OCR_API_KEY = process.env.OCR_API_KEY || 'K82830498088957';
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
    
    const response = await fetch(OCR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base64Image: base64Image,
        apikey: OCR_API_KEY,
        language: 'eng',
        isOverlayRequired: true // Get coordinate data
      })
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
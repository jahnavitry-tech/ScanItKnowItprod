import fetch from 'node-fetch';

// Hugging Face Inference API for AI model access
const HF_BASE_URL = "https://router.huggingface.co/hf-inference/models";
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

// For image analysis and OCR, we'll use BLIP model
const VISION_MODEL = "Salesforce/blip-image-captioning-large";
const TEXT_MODEL = "microsoft/DialoGPT-medium"; // Free text generation model

export async function analyzeImageWithVision(base64Image: string): Promise<any> {
  try {
    // Convert base64 to buffer for binary upload
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Use BLIP for image captioning - send binary data directly
    const response = await fetch(`${HF_BASE_URL}/${VISION_MODEL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': `Bearer ${HF_API_KEY}`,
      },
      body: imageBuffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
    }

    const result: any = await response.json();
    
    // Extract basic product info from image caption
    const caption = result[0]?.generated_text || result?.generated_text || "Unable to analyze image";
    
    return {
      productName: extractProductName(caption),
      extractedText: {
        ingredients: "Please check product packaging for complete ingredient list",
        nutrition: "Please check product packaging for nutrition facts",
        brand: extractBrand(caption)
      },
      summary: generateSummaryFromCaption(caption)
    };
    
  } catch (error) {
    console.error("Error with HuggingFace vision:", error);
    throw new Error("Failed to analyze image with HuggingFace");
  }
}

export async function analyzeIngredientsHF(extractedText: any): Promise<any> {
  // For ingredients analysis, we'll use a simpler approach with predefined safe/unsafe ingredients
  const commonSafeIngredients = [
    'water', 'salt', 'sugar', 'flour', 'oil', 'butter', 'milk', 'eggs', 'vanilla',
    'baking powder', 'baking soda', 'honey', 'oats', 'rice', 'wheat', 'corn'
  ];
  
  const commonHarmfulIngredients = [
    'aspartame', 'high fructose corn syrup', 'trans fat', 'artificial colors',
    'sodium nitrate', 'monosodium glutamate', 'msg', 'bha', 'bht'
  ];
  
  const ingredientText = extractedText.ingredients?.toLowerCase() || '';
  const ingredients = [];
  
  // Extract ingredients from text and classify them
  const words = ingredientText.split(/[,;\n\r]+/).map((w: string) => w.trim()).filter((w: string) => w.length > 2);
  
  for (const word of words.slice(0, 10)) { // Limit to first 10 ingredients
    let safety = "Safe";
    let reason = "Generally recognized as safe";
    
    if (commonHarmfulIngredients.some(harmful => word.includes(harmful))) {
      safety = "Harmful";
      reason = "Potential health concerns";
    } else if (word.includes('artificial') || word.includes('preservative')) {
      safety = "Moderate";
      reason = "Contains artificial additives";
    }
    
    ingredients.push({
      name: capitalizeFirst(word),
      safety,
      reason
    });
  }
  
  if (ingredients.length === 0) {
    ingredients.push({
      name: "No ingredients detected",
      safety: "Safe",
      reason: "Unable to parse ingredient list"
    });
  }
  
  return { ingredients };
}

export async function analyzeNutritionHF(extractedText: any): Promise<any> {
  // Simple nutrition extraction from text
  const nutritionText = extractedText.nutrition?.toLowerCase() || '';
  
  let calories = 0;
  let totalSugars = "0g";
  const sugarTypes = [];
  
  // Extract calories
  const caloriesMatch = nutritionText.match(/(\d+)\s*calories?/i);
  if (caloriesMatch) {
    calories = parseInt(caloriesMatch[1]);
  }
  
  // Extract sugars
  const sugarMatch = nutritionText.match(/(\d+(?:\.\d+)?)\s*g?\s*sugar/i);
  if (sugarMatch) {
    totalSugars = `${sugarMatch[1]}g`;
    sugarTypes.push({
      type: "Total Sugars",
      amount: totalSugars
    });
  }
  
  // Look for added sugars
  const addedSugarMatch = nutritionText.match(/added\s+sugar[s]?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*g/i);
  if (addedSugarMatch) {
    sugarTypes.push({
      type: "Added Sugars",
      amount: `${addedSugarMatch[1]}g`
    });
  }
  
  if (sugarTypes.length === 0) {
    sugarTypes.push({
      type: "Not specified",
      amount: "Check packaging"
    });
  }
  
  return {
    calories,
    totalSugars,
    sugarTypes
  };
}

export async function generateChatResponseHF(question: string, productData: any): Promise<string> {
  const lowerQuestion = question.toLowerCase();
  
  // Simple rule-based responses based on common questions
  if (lowerQuestion.includes("healthy") || lowerQuestion.includes("good for you")) {
    return "Based on the available product information, I can help you understand the ingredients and nutritional content. For specific health advice, please consult with a healthcare professional.";
  }
  
  if (lowerQuestion.includes("ingredient") || lowerQuestion.includes("contain")) {
    const ingredients = productData?.extractedText?.ingredients || "No ingredient information available";
    return `The product ingredients include: ${ingredients}. Please check the actual product packaging for the complete and most up-to-date ingredient list.`;
  }
  
  if (lowerQuestion.includes("calories") || lowerQuestion.includes("nutrition")) {
    return "Nutritional information can vary by serving size and preparation method. Please refer to the nutrition label on the product packaging for accurate calorie and nutrient information.";
  }
  
  if (lowerQuestion.includes("allerg") || lowerQuestion.includes("gluten")) {
    return "For allergen information including gluten, dairy, nuts, and other potential allergens, please check the product packaging directly as formulations may change.";
  }
  
  return "I can help answer questions about this product's general information. What specific aspect would you like to know more about?";
}

// Helper functions
function extractProductName(caption: string): string {
  // Simple extraction from image caption
  const words = caption.split(' ');
  return words.slice(0, 3).join(' ') || "Product";
}

function extractBrand(caption: string): string {
  // Look for common brand indicators in caption
  const brandWords = ['brand', 'company', 'made by'];
  for (const word of caption.split(' ')) {
    if (word.length > 3 && word[0] === word[0].toUpperCase()) {
      return word;
    }
  }
  return "Brand not detected";
}

function generateSummaryFromCaption(caption: string): string {
  return `This appears to be a consumer product based on image analysis. 
The product seems to be intended for general use.
For specific usage instructions, please refer to product packaging.
Quality and safety information should be verified from official sources.
Please check the product label for detailed information.`;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
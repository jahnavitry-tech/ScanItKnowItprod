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

// Use the recommended models for each task
const VISION_MODEL = "gemini-2.5-flash";
const ANALYSIS_MODEL = "gemini-2.5-flash";

// Counter for tracking Gemini API failures
let geminiFailureCount = 0;
const MAX_GEMINI_FAILURES = 3;

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
  // Ensure environment variables are loaded before initialization
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
      console.error("GEMINI_API_KEY is missing. Initial image analysis cannot proceed.");
      // Fallback to client-side analysis if Gemini API key is missing
      try {
        console.log("Falling back to client-side analysis due to missing API key...");
        const fallbackResult = await analyzeImageWithFallback(base64Image);
        return [fallbackResult];
      } catch (fallbackError) {
        console.error("Fallback analysis also failed:", fallbackError);
        throw new Error("Both primary and fallback analysis methods failed");
      }
  }
  
  // Initialize Google Generative AI client inside the function to guarantee API key availability
  const genAI = new GoogleGenerativeAI(apiKey);

  if (DEMO_MODE) {
    // Return demo data for testing purposes
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
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

  try {
    const model = genAI.getGenerativeModel({ model: VISION_MODEL });
    
    // THE COMPLETE "AUTONOMOUS REPORT AGENT (ARA)" PROMPT
    // This prompt forces categorization (A or B) and adheres to the final JSON structure.
    const prompt = `
    **ROLE:** Autonomous Report Agent (ARA).
    **OUTPUT:** ONLY a JSON array. DO NOT include ANY extra text. The array MUST contain a unique JSON object for EACH distinct product (Brandable or Non-Brandable) or main subject identified.
    **TASK:** Analyze the image. Prioritize **FULL, VERBATIM INGREDIENTS LIST EXTRACTION** and **QR/Barcode data capture**.
    
    **IF PRODUCT/GOODS (Brandable Item):**
    1.  **Extract Text:**
        * **INGREDIENTS:** Capture the **FULL, VERBATIM ingredients list**.
        * **NUTRITION:** Capture the **main calorie and serving size data** or key nutritional claims.
        * **BRAND:** Capture the Brand name, Product name, and **ALL QR/Barcode data**.
    2.  **Summary:** Summarize key features, intended purpose, and typical usage (**MAX 3 lines**).
    
    **IF SCENE/SUBJECT/FOOD (Non-Brandable, e.g., Full English Breakfast, Plant):**
    1.  **Extract Text:** Set 'nutrition' and 'brand' fields to **'Not applicable'**.
    2.  **Ingredients Field:** List ALL clearly identifiable components/ingredients of the food or visual elements of the scene (e.g., 'Fried Eggs, Sausages, Baked Beans, Plate, Marble Countertop').
    3.  **Summary:** Provide a detailed, descriptive identity and context (**MAX 3 lines**).
    
    **JSON SCHEMA:**[{"productName": "string", "extractedText": {"ingredients": "string", "nutrition": "string", "brand": "string"}, "summary": "string"}]
    `;

    const image = {
      inlineData: {
        data: base64Image,
        mimeType: "image/jpeg",
      },
    };
    
    console.log("Sending image to Gemini for analysis...");
    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const content = response.text() || "";
    console.log("Received response from Gemini:", content.substring(0, 200) + "...");
    
    // Reset failure count on success
    geminiFailureCount = 0;
    
    let resultData;
    
    try {
      // Robustly extract and parse the JSON array
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
          resultData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Full response content:", content);
      // Return an array with a fallback object if parsing fails
      return [{
        productName: "Analysis Error",
        extractedText: { ingredients: "N/A", nutrition: "N/A", brand: "System" },
        summary: "Failed to parse the AI response. Please try again with a clearer image."
      }]; 
    }
    
    // Ensure we always return an array
    if (!Array.isArray(resultData)) {
        console.error("AI response is not an array:", resultData);
        return [];
    }

    console.log("Successfully parsed AI response with", resultData.length, "products");
    return resultData;
  } catch (error) {
    console.error("Error identifying product with ARA:", error);
    geminiFailureCount++;
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      
      // Check for specific Google API errors
      if (error.message.includes("404 Not Found") && error.message.includes("models/")) {
        console.error("Model not found error. Please check that the model name is correct and supported.");
        return [{
          productName: "Model Error",
          extractedText: { ingredients: "N/A", nutrition: "N/A", brand: "System" },
          summary: "The specified AI model is not available. Please contact the system administrator."
        }];
      } else if (error.message.includes("503 Service Unavailable") && error.message.includes("overloaded")) {
        console.error("Model overloaded error. The service is temporarily unavailable.");
        
        // If we've exceeded the maximum number of failures, use fallback
        if (geminiFailureCount >= MAX_GEMINI_FAILURES) {
          console.log(`Gemini API has failed ${geminiFailureCount} times, switching to fallback method...`);
          try {
            const fallbackResult = await analyzeImageWithFallback(base64Image);
            return [fallbackResult];
          } catch (fallbackError) {
            console.error("Fallback analysis also failed:", fallbackError);
            return [{
              productName: "Service Overloaded",
              extractedText: { ingredients: "N/A", nutrition: "N/A", brand: "System" },
              summary: "The AI service is temporarily overloaded and fallback analysis also failed. Please try again in a few minutes."
            }];
          }
        }
        
        return [{
          productName: "Service Overloaded",
          extractedText: { ingredients: "N/A", nutrition: "N/A", brand: "System" },
          summary: "The AI service is temporarily overloaded. Please try again in a few minutes."
        }];
      }
    }
    
    // If it's not a specific error we handle, try fallback if we've had multiple failures
    if (geminiFailureCount >= MAX_GEMINI_FAILURES) {
      console.log(`Gemini API has failed ${geminiFailureCount} times, attempting fallback method...`);
      try {
        const fallbackResult = await analyzeImageWithFallback(base64Image);
        return [fallbackResult];
      } catch (fallbackError) {
        console.error("Fallback analysis also failed:", fallbackError);
      }
    }
    
    // Return a structured error response on API failure
    return [{
      productName: "API Error",
      extractedText: { ingredients: "N/A", nutrition: "N/A", brand: "System" },
      summary: "The image analysis API failed to process the request."
    }];
  }
}

export async function analyzeIngredients(productName: string, brand: string, summary: string, extractedText: any): Promise<any> {
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
    
    const prompt = `**ROLE:** You are the **Ultimate Ingredient Safety Analyst (UISA)**. Your sole function is to take the extracted product data, execute a comprehensive real-time web search for authoritative safety data, and generate a hyper-concise report.

**MANDATORY ACTION & DATA GROUNDING:**
1.  **Search:** For *every* ingredient listed in the \`ingredients\` field of the input, execute a necessary real-time web search to find current safety warnings, health standards, or common regulatory status (e.g., FDA, WHO, CDC, EWG).
2.  **Analysis:** Assign a definitive safety rating and a concise reason for each ingredient based *only* on the search results.

**PRODUCT INFORMATION:**
Product Name: ${productName}
Brand: ${brand}
Summary: ${summary}

**ANALYSIS & REASONING RULES (STRICT):**
* **Safety Rating:** Use only one of the following status labels: **Safe**, **Moderate**, or **Harmful**.
* **Reason (Specific & Source):**
    * If **Moderate** or **Harmful**: Provide a concise, 3-4 word specific reason for the health risk and cite the source and year in parentheses (e.g., \`\(WHO, 2024\)\`).
    * If **Safe**: State 'Safe' or 'Safe (unless allergic)'.

**OUTPUT FORMAT (STRICT & FINAL):**
Respond with valid JSON only in this exact format, where \`safety_status\` uses the labels specified above and \`reason_with_source\` includes the 3-4 word reason and citation. Analyze the ingredients from this product data: ${JSON.stringify(extractedText)}. Return only valid JSON without any additional text.

**JSON**
{
  "ingredients_analysis": [
    {
      "name": "string",
      "safety_status": "Safe|Moderate|Harmful",
      "reason_with_source": "string"
    }
  ]
}

**FINAL RESPONSE RULE (MANDATORY):** Provide **ONLY** the structured data generated by the OUTPUT FORMAT (STRICT & FINAL). No other text, preamble, postscript, or conversational elements are permitted.`;
    
    console.log("Sending ingredients analysis request to Gemini...");
    // Explicitly enable Google Search for grounding
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} } as any]
    });

    const response = await result.response;
    const content = response.text() || "";
    console.log("Received response from Gemini for ingredients analysis:", content.substring(0, 200) + "...");
    
    try {
      const parsed = JSON.parse(content);
      console.log("Successfully parsed ingredients analysis response");
      return parsed;
    } catch (e) {
      console.error("Failed to parse JSON directly, trying regex extraction...");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log("Successfully parsed ingredients analysis response after regex extraction");
          return parsed;
        } catch (e2) {
          console.error("Failed to parse JSON after regex extraction:", e2);
          return { ingredients_analysis: [] };
        }
      }
      console.error("No JSON found in response");
      return { ingredients_analysis: [] };
    }
  } catch (error) {
    console.error("Error with web search for ingredients:", error);
    
    // Fall back to HuggingFace if web search fails and USE_HUGGINGFACE is true
    if (USE_HUGGINGFACE) {
      try {
        const hfResult = await analyzeIngredientsHF(extractedText);
        return hfResult;
      } catch (hfError) {
        console.error("Error with HuggingFace ingredients:", hfError);
      }
    }
    
    // If both fail, return a fallback response
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      return {
        ingredients_analysis: [
          {
            name: "Rate Limit Reached",
            safety_status: "Safe",
            reason_with_source: "Google free tier limit reached. Please add credits to continue analysis or try again later."
          }
        ]
      };
    }
    throw new Error("Failed to analyze ingredients");
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
    
    const prompt = `**ROLE:** You are the **Universal Product Composition Analyst (UPCA)**. Your sole function is to take structured product data and generate a JSON report detailing its essential quantitative and regulatory composition, adapted strictly to the product category.

**MANDATORY ACTION:**
1.  **Categorize:** Determine if the product is **Food/Consumable** or **Non-Food/Topical/Object**.
2.  **Search:** Use a real-time web search to confirm standard compositional facts, safety, and regulatory details for the specific product.

**PRODUCT INFORMATION:**
Product Name: ${productName}
Brand: ${brand}
Summary: ${summary}

**COMPOSITION FIELDS (ADAPTIVE LOGIC):**
* **IF Food/Consumable:** Extract standard nutritional values (Calories, Fat, Protein) and detail all other essential nutrition fields within the \`compositionalDetails\` array.
* **IF Non-Food/Topical/Object:** Set food-specific numerical fields (calories, totalFat, totalProtein) to **0** and detail all relevant chemical/material composition details (e.g., Active Material, Certifications, Warnings) within the \`compositionalDetails\` array.

**OUTPUT FORMAT (STRICT & FINAL):**
Respond with **valid JSON only**. The JSON must strictly adhere to the following schema. If a value is unknown or non-applicable, use **"N/A"** (except for numerical fields for non-food, which must be 0). Analyze the product data from: ${JSON.stringify(extractedText)}.

**JSON**
{
  "productCategory": "string",
  "netQuantity": "number", // Should be the numerical value of the size (e.g., 5 for 5 mL, 12 for 12 fl oz)
  "unitType": "string", // Should be the unit (e.g., "mL", "fl oz", "g")
  "calories": "number",
  "totalFat": "number",
  "totalProtein": "number",
  "compositionalDetails": [
    {
      "key": "string",
      "value": "string"
    }
  ]
}

**FINAL RESPONSE RULE (MANDATORY):** Provide **ONLY** the structured data generated by the OUTPUT FORMAT (STRICT & FINAL). No other text, preamble, postscript, or conversational elements are permitted.`;
    
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
            netQuantity: 0,
            unitType: "",
            calories: 0,
            totalFat: 0,
            totalProtein: 0,
            compositionalDetails: []
          };
        }
      }
      return { 
        productCategory: "",
        netQuantity: 0,
        unitType: "",
        calories: 0,
        totalFat: 0,
        totalProtein: 0,
        compositionalDetails: []
      };
    }
  } catch (error) {
    console.error("Error analyzing composition:", error);
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      // Return a fallback response when rate limited
      return {
        productCategory: "Rate Limit",
        netQuantity: 0,
        unitType: "",
        calories: 0,
        totalFat: 0,
        totalProtein: 0,
        compositionalDetails: [
          {
            key: "Rate Limit Notice",
            value: "Google free tier limit reached. Please add credits to continue analysis."
          }
        ]
      };
    }
    
    // Fall back to the original model if web search model fails
    try {
      // Initialize Google Generative AI client inside the function to ensure env vars are loaded
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY is missing for fallback composition analysis.");
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `**ROLE:** You are the **Universal Product Composition Analyst (UPCA)**. Your sole function is to take structured product data and generate a JSON report detailing its essential quantitative and regulatory composition, adapted strictly to the product category.

**MANDATORY ACTION:**
1.  **Categorize:** Determine if the product is **Food/Consumable** or **Non-Food/Topical/Object**.
2.  **Search:** Use a real-time web search to confirm standard compositional facts, safety, and regulatory details for the specific product.

**PRODUCT INFORMATION:**
Product Name: ${productName}
Brand: ${brand}
Summary: ${summary}

**COMPOSITION FIELDS (ADAPTIVE LOGIC):**
* **IF Food/Consumable:** Extract standard nutritional values (Calories, Fat, Protein) and detail all other essential nutrition fields within the \`compositionalDetails\` array.
* **IF Non-Food/Topical/Object:** Set food-specific numerical fields (calories, totalFat, totalProtein) to **0** and detail all relevant chemical/material composition details (e.g., Active Material, Certifications, Warnings) within the \`compositionalDetails\` array.

**OUTPUT FORMAT (STRICT & FINAL):**
Respond with **valid JSON only**. The JSON must strictly adhere to the following schema. If a value is unknown or non-applicable, use **"N/A"** (except for numerical fields for non-food, which must be 0). Analyze the product data from: ${JSON.stringify(extractedText)}.

**JSON**
{
  "productCategory": "string",
  "netQuantity": "number", // Should be the numerical value of the size (e.g., 5 for 5 mL, 12 for 12 fl oz)
  "unitType": "string", // Should be the unit (e.g., "mL", "fl oz", "g")
  "calories": "number",
  "totalFat": "number",
  "totalProtein": "number",
  "compositionalDetails": [
    {
      "key": "string",
      "value": "string"
    }
  ]
}

**FINAL RESPONSE RULE (MANDATORY):** Provide **ONLY** the structured data generated by the OUTPUT FORMAT (STRICT & FINAL). No other text, preamble, postscript, or conversational elements are permitted.`;
      
      const result = await model.generateContent(prompt);
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
              netQuantity: 0,
              unitType: "",
              calories: 0,
              totalFat: 0,
              totalProtein: 0,
              compositionalDetails: []
            };
          }
        }
        return { 
          productCategory: "",
          netQuantity: 0,
          unitType: "",
          calories: 0,
          totalFat: 0,
          totalProtein: 0,
          compositionalDetails: []
        };
      }
    } catch (fallbackError) {
      console.error("Error in fallback composition analysis:", fallbackError);
      // Check for specific model errors
      if (fallbackError instanceof Error && fallbackError.message.includes("404 Not Found") && fallbackError.message.includes("models/")) {
        console.error("Fallback model not found error. Please check that the model name is correct and supported.");
      }
      return { 
        productCategory: "",
        netQuantity: 0,
        unitType: "",
        calories: 0,
        totalFat: 0,
        totalProtein: 0,
        compositionalDetails: []
      };
    }
  }
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
    
    const prompt = `You are an expert AI product analysis assistant. Your role is to answer user questions about a ${productData.productName}.

Instructions (Prioritized for speed and breadth):
1.  **Prioritize an accurate answer by searching the web for information about the product.**
2.  If the answer can be found, provide a **concise, direct, and fast** answer.
3.  If the answer requires **more than 3 lines**, format it as a **bulleted list** (using pointers).
4.  If the information needed to answer a question is not available even after searching, politely indicate that.
5.  **CRITICAL:** Your output **MUST be the plain text response only**. **DO NOT** wrap the response in the JSON format or include the "response" key or any surrounding code blocks.
6.  Keep your responses short and to the point and if the final response is more than 2 lines give it in pointers format.

Product Context (Use this as supplemental context, but always search externally for the answer):
- Product Name: ${productData.productName}
- Product Summary: ${productData.productSummary}
- Extracted Text: ${productData.extractedText.ingredients}

User Question: ${question}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
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
      
      const prompt = `You are an expert AI product analysis assistant. Your role is to answer user questions about a ${productData.productName}.

Instructions (Prioritized for speed and breadth):
1.  **Prioritize an accurate answer by searching the web for information about the product.**
2.  If the answer can be found, provide a **concise, direct, and fast** answer.
3.  If the answer requires **more than 3 lines**, format it as a **bulleted list** (using pointers).
4.  If the information needed to answer a question is not available even after searching, politely indicate that.
5.  **CRITICAL:** Your output **MUST be the plain text response only**. **DO NOT** wrap the response in the JSON format or include the "response" key or any surrounding code blocks.
6.  Keep your responses short and to the point and if the final response is more than 2 lines give it in pointers format.

Product Context (Use this as supplemental context, but always search externally for the answer):
- Product Name: ${productData.productName}
- Product Summary: ${productData.productSummary}
- Extracted Text: ${productData.extractedText.ingredients}

User Question: ${question}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      return response.text() || "I'm sorry, I couldn't generate a response to that question.";
    } catch (fallbackError) {
      console.error("Error in fallback chat response:", fallbackError);
      return "Sorry, I encountered an error while processing your question. Please try again.";
    }
  }
}

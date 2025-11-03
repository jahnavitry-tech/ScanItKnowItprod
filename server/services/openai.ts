import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  analyzeImageWithVision, 
  analyzeIngredientsHF, 
  analyzeNutritionHF, 
  generateChatResponseHF 
} from "./huggingface";

// Flag to use HuggingFace instead of Google to avoid rate limits
const USE_HUGGINGFACE = false;

// Demo mode disabled - using real HuggingFace API
const DEMO_MODE = false;

// Use the recommended models for each task
const VISION_MODEL = "gemini-2.5-flash";
const ANALYSIS_MODEL = "gemini-2.5-flash";

export async function identifyProductAndExtractText(base64Image: string): Promise<Array<{
  productName: string;
  extractedText: any;
  summary: string;
}>> {
  // Check for the preferred HuggingFace flag first
  if (USE_HUGGINGFACE) {
    const result = await analyzeImageWithVision(base64Image);
    // Return as array for consistency
    return [result];
  }

  // --- Start Gemini Logic ---
  // Ensure environment variables are loaded before initialization
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
      console.error("GEMINI_API_KEY is missing. Initial image analysis cannot proceed.");
      throw new Error("GEMINI_API_KEY is not configured.");
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
    
    // Updated prompt to detect multiple products and return them as an array
    const prompt = "You are a product identification expert. Analyze this image to identify all products visible and extract all visible text including ingredients and nutrition facts for each product. For each product, provide a summary that acts as a product analyst summary of key features based on the provided text. Focus on what it is for and how to use it. Do not include any extra commentary, keep your response short and to the point but do not miss the main details, within 5 lines. Respond with valid JSON only as an array of objects in this exact format: [{ \"productName\": \"string\", \"extractedText\": {\"ingredients\": \"string\", \"nutrition\": \"string\", \"brand\": \"string\"}, \"summary\": \"string\" }]";

    const image = {
      inlineData: {
        data: base64Image,
        mimeType: "image/jpeg",
      },
    };
    
    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const content = response.text() || "";
    
    let resultData;
    
    try {
      // Try to parse the entire response as JSON array
      resultData = JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          resultData = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          // Fallback to single object wrapped in array
          const singleObjectMatch = content.match(/\{[\s\S]*\}/);
          if (singleObjectMatch) {
            try {
              const singleObject = JSON.parse(singleObjectMatch[0]);
              resultData = [singleObject];
            } catch (e3) {
              resultData = [{
                productName: "Unknown Product",
                extractedText: {},
                summary: content || "Unable to analyze product"
              }];
            }
          } else {
            resultData = [{
              productName: "Unknown Product",
              extractedText: {},
              summary: content || "Unable to analyze product"
            }];
          }
        }
      } else {
        // Try to parse as single object and wrap in array
        try {
          const singleObject = JSON.parse(content);
          resultData = [singleObject];
        } catch (e4) {
          resultData = [{
            productName: "Unknown Product",
            extractedText: {},
            summary: content || "Unable to analyze product"
          }];
        }
      }
    }
    
    // Ensure we always return an array
    if (!Array.isArray(resultData)) {
      resultData = [resultData];
    }
    
    // Map the results to ensure consistent structure
    return resultData.map(item => ({
      productName: item.productName || "Unknown Product",
      extractedText: item.extractedText || {},
      summary: item.summary || "Unable to analyze product"
    }));
  } catch (error) {
    // --- CRITICAL FIX: Enhanced Logging ---
    console.error("FATAL ERROR: Image Analysis (Vision API) failed immediately after upload.", error);
    if (error instanceof Error) {
        console.error("Error Message:", error.message);
        console.error("Error Name:", error.name);
    } else {
        console.error("Non-Error Object Thrown:", error);
    }
    throw new Error("Failed to identify product and extract text");
  }
}

export async function analyzeIngredients(extractedText: any): Promise<any> {
  if (DEMO_MODE) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
      ingredients: [
        { name: "Whole Grain Oats", safety: "Safe", reason: "Natural whole grain" },
        { name: "Sugar", safety: "Moderate", reason: "High sugar content" },
        { name: "Canola Oil", safety: "Safe", reason: "Heart healthy oil" },
        { name: "Rice Flour", safety: "Safe", reason: "Gluten-free grain" },
        { name: "Honey", safety: "Safe", reason: "Natural sweetener" },
        { name: "Brown Sugar Syrup", safety: "Moderate", reason: "Added sugar source" },
        { name: "Salt", safety: "Safe", reason: "Natural preservative" },
        { name: "Natural Flavor", safety: "Safe", reason: "FDA approved flavoring" },
        { name: "Vitamin E", safety: "Safe", reason: "Essential nutrient antioxidant" }
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
    
    const prompt = `You are a food safety scientist. Use a real-time web search to ground your analysis on current safety warnings and health standards. For each ingredient, provide a specific, concise safety rating and a 3-4 word reason. Respond with valid JSON only in this exact format: { "ingredients": [{ "name": "string", "safety": "Safe|Moderate|Harmful", "reason": "string" }] }
    
    Analyze the ingredients from this product data: ${JSON.stringify(extractedText)}. Use a real-time web search to ground your analysis on current safety warnings and health standards. Return only valid JSON without any additional text.`;
    
    // Explicitly enable Google Search for grounding
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
          return { ingredients: [] };
        }
      }
      return { ingredients: [] };
    }
  } catch (error) {
    console.error("Error with web search for ingredients:", error);
    
    // Fall back to HuggingFace if web search fails and USE_HUGGINGFACE is true
    if (USE_HUGGINGFACE) {
      try {
        return await analyzeIngredientsHF(extractedText);
      } catch (hfError) {
        console.error("Error with HuggingFace ingredients:", hfError);
      }
    }
    
    // If both fail, return a fallback response
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      return {
        ingredients: [
          {
            name: "Rate Limit Reached",
            safety: "Safe",
            reason: "Google free tier limit reached. Please add credits to continue analysis or try again later."
          }
        ]
      };
    }
    throw new Error("Failed to analyze ingredients");
  }
}

export async function analyzeNutrition(extractedText: any): Promise<any> {
  if (DEMO_MODE) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return {
      calories: 190,
      totalFat: 6,
      saturatedFat: 1,
      sodium: 160,
      totalCarbohydrate: 32,
      totalFiber: 2,
      totalProtein: 4,
      totalSugars: "11g",
      addedSugar: "10g",
      sugarTypes: [
        { type: "Added Sugars", amount: "10g" },
        { type: "Natural Sugars", amount: "1g" }
      ],
      vitamins: [
        { type: "Vitamin E", amount: "5mg" }
      ]
    };
  }

  try {
    // Initialize Google Generative AI client inside the function to ensure env vars are loaded
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing for nutrition analysis.");
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use web search model for real-time grounding
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const prompt = `From the Product name, extract the total calories and sugar content with types of sugars and Extract ALL essential nutritional values (Calories, Total Fat, Saturated Fat, Sodium, Total Carbohydrate, Dietary Fiber, Total Sugar, Added Sugar, and Protein). from the extracted information. Provide only the numbers and their units and names. Do not include any other text or commentary. Respond with valid JSON only in this exact format: { "calories": number, "totalFat": number, "saturatedFat": number, "sodium": number, "totalCarbohydrate": number, "totalFiber": number, "totalProtein": number, "totalSugars": "string", "addedSugar": "string", "sugarTypes": [{ "type": "string", "amount": "string" }], "vitamins": [{ "type": "string", "amount": "string" }]}

Extract product name data from: ${JSON.stringify(extractedText)}. If data is unclear, use a real-time web search to confirm standard nutritional facts for the product. Return only valid JSON without any additional text.`;
    
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
            calories: 0, 
            totalFat: 0,
            saturatedFat: 0,
            sodium: 0,
            totalCarbohydrate: 0,
            totalFiber: 0,
            totalProtein: 0,
            totalSugars: "0g", 
            addedSugar: "0g",
            sugarTypes: [],
            vitamins: []
          };
        }
      }
      return { 
        calories: 0, 
        totalFat: 0,
        saturatedFat: 0,
        sodium: 0,
        totalCarbohydrate: 0,
        totalFiber: 0,
        totalProtein: 0,
        totalSugars: "0g", 
        addedSugar: "0g",
        sugarTypes: [],
        vitamins: []
      };
    }
  } catch (error) {
    console.error("Error analyzing nutrition:", error);
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      // Return a fallback response when rate limited
      return {
        calories: 0,
        totalFat: 0,
        saturatedFat: 0,
        sodium: 0,
        totalCarbohydrate: 0,
        totalFiber: 0,
        totalProtein: 0,
        totalSugars: "N/A - Rate limit reached",
        addedSugar: "N/A - Rate limit reached",
        sugarTypes: [
          {
            type: "Rate Limit Notice",
            amount: "Google free tier limit reached. Please add credits to continue analysis."
          }
        ],
        vitamins: []
      };
    }
    
    // Fall back to the original model if web search model fails
    try {
      // Initialize Google Generative AI client inside the function to ensure env vars are loaded
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY is missing for fallback nutrition analysis.");
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `From the Product name, extract the total calories and sugar content with types of sugars and Extract ALL essential nutritional values (Calories, Total Fat, Saturated Fat, Sodium, Total Carbohydrate, Dietary Fiber, Total Sugar, Added Sugar, and Protein). from the extracted information. Provide only the numbers and their units and names. Do not include any other text or commentary. Respond with valid JSON only in this exact format: { "calories": number, "totalFat": number, "saturatedFat": number, "sodium": number, "totalCarbohydrate": number, "totalFiber": number, "totalProtein": number, "totalSugars": "string", "addedSugar": "string", "sugarTypes": [{ "type": "string", "amount": "string" }], "vitamins": [{ "type": "string", "amount": "string" }]}

Extract product name data from: ${JSON.stringify(extractedText)}. Return only valid JSON without any additional text.`;
      
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
              calories: 0, 
              totalFat: 0,
              saturatedFat: 0,
              sodium: 0,
              totalCarbohydrate: 0,
              totalFiber: 0,
              totalProtein: 0,
              totalSugars: "0g", 
              addedSugar: "0g",
              sugarTypes: [],
              vitamins: []
            };
          }
        }
        return { 
          calories: 0, 
          totalFat: 0,
          saturatedFat: 0,
          sodium: 0,
          totalCarbohydrate: 0,
          totalFiber: 0,
          totalProtein: 0,
          totalSugars: "0g", 
          addedSugar: "0g",
          sugarTypes: [],
          vitamins: []
        };
      }
    } catch (fallbackError) {
      console.error("Error in fallback nutrition analysis:", fallbackError);
      return { 
        calories: 0, 
        totalFat: 0,
        saturatedFat: 0,
        sodium: 0,
        totalCarbohydrate: 0,
        totalFiber: 0,
        totalProtein: 0,
        totalSugars: "0g", 
        addedSugar: "0g",
        sugarTypes: [],
        vitamins: []
      };
    }
  }
}

export async function generateChatResponse(question: string, productData: any): Promise<string> {
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
    
    const prompt = `You are a user-facing chatbot. Answer the user's question using the provided product data first. If the answer requires current external context (e.g., price, news), use a real-time web search to find the most up-to-date information before answering. Be concise and helpful.
    
    Product data: ${JSON.stringify(productData)}
    
    User question: ${question}
    
    Answer the user's question using the provided product data first. If the answer requires current external context (e.g., price, news), use a real-time web search to find the most up-to-date information before answering.`;
    
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
      
      const prompt = `This prompt is for the chatbot. Answer the user's question using only the provided product data and be honest if the information is not present. Be helpful and concise.
      
      Product data: ${JSON.stringify(productData)}
      
      User question: ${question}
      
      Answer based only on the product data provided.`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      return response.text() || "I'm sorry, I couldn't generate a response to that question.";
    } catch (fallbackError) {
      console.error("Error in fallback chat response:", fallbackError);
      return "Sorry, I encountered an error while processing your question. Please try again.";
    }
  }
}
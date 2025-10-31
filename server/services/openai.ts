import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  analyzeImageWithVision, 
  analyzeIngredientsHF, 
  analyzeNutritionHF, 
  generateChatResponseHF 
} from "./huggingface";

// Using Google Gemini API with specific models as requested
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Flag to use HuggingFace instead of Google to avoid rate limits
const USE_HUGGINGFACE = false;

// Demo mode disabled - using real HuggingFace API
const DEMO_MODE = false;

// Use the recommended models for each task
const VISION_MODEL = "gemini-1.5-flash";
const ANALYSIS_MODEL = "gemini-2.0-flash";

// Define the correct host, defaulting to the Render variable
const APP_HOST = process.env.RENDER_EXTERNAL_URL || "https://scan-it-know-it-prod.onrender.com";

export async function identifyProductAndExtractText(base64Image: string): Promise<{
  productName: string;
  extractedText: any;
  summary: string;
}> {
  if (DEMO_MODE) {
    // Return demo data for testing purposes
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
    return {
      productName: "Nature Valley Granola Bar",
      extractedText: {
        ingredients: "Whole Grain Oats, Sugar, Canola Oil, Rice Flour, Honey, Brown Sugar Syrup, Salt, Natural Flavor, Vitamin E (Mixed Tocopherols) Added to Retain Freshness",
        nutrition: "Calories 190, Total Fat 6g, Saturated Fat 1g, Trans Fat 0g, Cholesterol 0mg, Sodium 160mg, Total Carbohydrate 32g, Dietary Fiber 2g, Total Sugars 11g, Added Sugars 10g, Protein 4g",
        servingSize: "2 bars (42g)",
        brand: "Nature Valley"
      },
      summary: "Nature Valley Granola Bar is a wholesome snack made with whole grain oats and natural ingredients. Each serving contains 190 calories and provides sustained energy. Perfect for on-the-go snacking, hiking, or as a quick breakfast option. Contains 4g of protein and 2g of fiber per serving. Best enjoyed as part of an active lifestyle."
    };
  }

  // Use HuggingFace free API instead of Google to avoid rate limits
  if (USE_HUGGINGFACE) {
    try {
      return await analyzeImageWithVision(base64Image);
    } catch (error) {
      console.error("Error with HuggingFace vision:", error);
      // Fall back to Google if HuggingFace fails
    }
  }

  try {
    const model = genAI.getGenerativeModel({ model: VISION_MODEL });
    
    const prompt = "You are a product identification expert. Analyze this image to identify the product and extract all visible text including ingredients and nutrition facts. For the summary, act as a product analyst and summarize the key features based on the provided text. Focus on what it is for and how to use it. Do not include any extra commentary, keep your response short and to the point but do not miss the main details, within 5 lines. Respond with valid JSON only in this exact format: { \"productName\": \"string\", \"extractedText\": {\"ingredients\": \"string\", \"nutrition\": \"string\", \"brand\": \"string\"}, \"summary\": \"string\" }";
    
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
      // Try to parse the entire response as JSON
      resultData = JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          resultData = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          // Fallback to parsing the content manually
          resultData = {
            productName: "Unknown Product",
            extractedText: {},
            summary: content || "Unable to analyze product"
          };
        }
      } else {
        resultData = {
          productName: "Unknown Product", 
          extractedText: {},
          summary: content || "Unable to analyze product"
        };
      }
    }
    
    return {
      productName: resultData.productName || "Unknown Product",
      extractedText: resultData.extractedText || {},
      summary: resultData.summary || "Unable to analyze product"
    };
  } catch (error) {
    console.error("Error identifying product:", error);
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
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const prompt = `You are a food safety scientist. Use a real-time web search to ground your analysis on current safety warnings and health standards. For each ingredient, provide a specific, concise safety rating and a 3-4 word reason. Respond with valid JSON only in this exact format: { "ingredients": [{ "name": "string", "safety": "Safe|Moderate|Harmful", "reason": "string" }] }
    
    Analyze the ingredients from this product data: ${JSON.stringify(extractedText)}. Use a real-time web search to ground your analysis on current safety warnings and health standards. Return only valid JSON without any additional text.`;
    
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
      totalSugars: "11g",
      sugarTypes: [
        { type: "Added Sugars", amount: "10g" },
        { type: "Natural Sugars", amount: "1g" }
      ]
    };
  }

  try {
    // Use web search model for real-time grounding
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const prompt = `You are a nutrition analyst. Extract the total calories, total sugars, and a breakdown of sugar types. If data is unclear, use a real-time web search to confirm standard nutritional facts for the product. Respond with valid JSON only in this exact format: { "calories": number, "totalSugars": "string", "sugarTypes": [{ "type": "string", "amount": "string" }] }
    
    Extract nutrition data from: ${JSON.stringify(extractedText)}. If data is unclear, use a real-time web search to confirm standard nutritional facts for the product. Return only valid JSON without any additional text.`;
    
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
          return { calories: 0, totalSugars: "0g", sugarTypes: [] };
        }
      }
      return { calories: 0, totalSugars: "0g", sugarTypes: [] };
    }
  } catch (error) {
    console.error("Error analyzing nutrition:", error);
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      // Return a fallback response when rate limited
      return {
        calories: 0,
        totalSugars: "N/A - Rate limit reached",
        sugarTypes: [
          {
            type: "Rate Limit Notice",
            amount: "Google free tier limit reached. Please add credits to continue analysis."
          }
        ]
      };
    }
    
    // Fall back to the original model if web search model fails
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `From the provided nutritional information, extract the total calories and sugar content with types of sugars from the extracted information. Provide only the numbers and their units. Do not include any other text or commentary. Respond with valid JSON only in this exact format: { "calories": number, "totalSugars": "string", "sugarTypes": [{ "type": "string", "amount": "string" }] }
      
      Extract nutrition data from: ${JSON.stringify(extractedText)}. Return only valid JSON without any additional text.`;
      
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
            return { calories: 0, totalSugars: "0g", sugarTypes: [] };
          }
        }
        return { calories: 0, totalSugars: "0g", sugarTypes: [] };
      }
    } catch (fallbackError) {
      console.error("Error in fallback nutrition analysis:", fallbackError);
      return { calories: 0, totalSugars: "0g", sugarTypes: [] };
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
    // Use web search model for real-time grounding
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const prompt = `You are a user-facing chatbot. Answer the user's question using the provided product data first. If the answer requires current external context (e.g., price, news), use a real-time web search to find the most up-to-date information before answering. Be concise and helpful.
    
    Product data: ${JSON.stringify(productData)}
    
    User question: ${question}
    
    Answer the user's question using the provided product data first. If the answer requires current external context (e.g., price, news), use a real-time web search to find the most up-to-date information before answering.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return response.text() || "I'm sorry, I couldn't generate a response to that question.";
  } catch (error) {
    console.error("Error generating chat response:", error);
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      return "I've reached the daily rate limit for Google's free tier. To continue using the AI chat feature, you can add credits to your Google account or try again tomorrow when the limit resets.";
    }
    
    // Fall back to the original model if web search model fails
    try {
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
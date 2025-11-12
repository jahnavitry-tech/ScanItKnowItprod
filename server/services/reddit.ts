import { GoogleGenerativeAI } from "@google/generative-ai";

async function analyzeRedditDataWithAI(productName: string, brand: string, summary: string) {
  try {
    // Initialize Google Generative AI client inside the function to ensure env vars are loaded
    console.log("Initializing Google Generative AI with API key:", process.env.GEMINI_API_KEY ? "Present" : "Missing");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `You are a product review sentiment analysis expert. Your task is to search Reddit for reviews of the specified product and provide a detailed analysis.
    
    **PRODUCT INFORMATION:**
    Product Name: ${productName}
    Brand: ${brand}
    Summary: ${summary}
    
    **YOUR TASK:**
    1. Conduct a web search on Reddit for reviews of this product
    2. Extract specific pros and cons from actual user reviews
    3. Calculate an average rating based on the sentiment of the reviews
    
    **OUTPUT FORMAT:**
    Return a valid JSON object with the following structure:
    {
      "pros": ["Specific positive point 1 from real reviews", "Specific positive point 2 from real reviews", "Specific positive point 3 from real reviews", "Specific positive point 4 from real reviews"],
      "cons": ["Specific negative point 1 from real reviews", "Specific negative point 2 from real reviews", "Specific negative point 3 from real reviews", "Specific negative point 4 from real reviews"],
      "averageRating": 4.2,
      "totalMentions": 0,
      "reviews": []
    }
    
    **IMPORTANT INSTRUCTIONS:**
    - Extract actual quotes or paraphrased points from real Reddit reviews
    - Do not make up generic statements
    - If you cannot find specific Reddit reviews, return an empty array for pros and cons
    - Do not use placeholder text like "Generally well-regarded product"
    - The averageRating should be between 1.0 and 5.0 based on review sentiment
    - Include citations to specific Reddit posts when possible
    - Do not include any text outside the JSON structure
    
    Search for reviews of: ${productName} ${brand}`;
    
    // Explicitly enable Google Search for grounding
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} } as any]
    });

    const response = await result.response;
    let content = response.text() || "";
    
    // Log the raw response for debugging
    console.log("Raw AI response:", content.substring(0, 500));
    
    // Remove markdown code fences if present
    content = content.replace(/```json\s*|\s*```/g, '').trim();
    
    // Try to extract JSON from the response if it contains extra text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
    
    // Parse the JSON response
    try {
      const parsed = JSON.parse(content);
      console.log("Successfully parsed JSON:", parsed);
      
      // Validate the structure and provide defaults if needed
      return {
        pros: Array.isArray(parsed.pros) ? parsed.pros.slice(0, 4) : [],
        cons: Array.isArray(parsed.cons) ? parsed.cons.slice(0, 4) : [],
        averageRating: typeof parsed.averageRating === 'number' ? Math.min(Math.max(parsed.averageRating, 1.0), 5.0) : 0,
        totalMentions: 0,
        reviews: []
      };
    } catch (e) {
      console.error("Failed to parse AI-generated JSON. Content received:", content.substring(0, 500), e);
      // Return empty structure instead of default text
      return {
        pros: [],
        cons: [],
        averageRating: 0,
        totalMentions: 0,
        reviews: []
      };
    }
    
  } catch (error) {
    console.error("Error in AI analysis:", error);
    // Return empty structure instead of default text
    return {
      pros: [],
      cons: [],
      averageRating: 0,
      totalMentions: 0,
      reviews: []
    };
  }
}

export async function searchRedditReviews(productName: string, brand: string, summary: string): Promise<any> {
  try {
    console.log("Searching Reddit reviews for product:", productName);
    
    // --- AI Analysis with web search ---
    const aiResponse = await analyzeRedditDataWithAI(productName, brand, summary);
    
    // Set default values for placeholders
    aiResponse.reviews = [];
    aiResponse.totalMentions = 0;
    
    console.log("Reddit analysis successful:", aiResponse);
    return aiResponse;

  } catch (error) {
    console.error("Error in searchRedditReviews or AI analysis:", error);
    
    // Return empty structure instead of default text
    return {
      pros: [],
      cons: [],
      averageRating: 0,
      totalMentions: 0,
      reviews: []
    };
  }
}
import dotenv from "dotenv";
import { storage } from "./server/storage";

// Load environment variables
dotenv.config();

async function testRedditAnalysis() {
  try {
    console.log("GEMINI_API_KEY present in test:", !!process.env.GEMINI_API_KEY);
    
    // Create a test product analysis
    const testProduct = await storage.createProductAnalysis({
      productName: "Test Product",
      productSummary: "This is a test product for Reddit analysis",
      extractedText: {
        ingredients: ["water", "sugar", "salt"],
        nutrition: {
          calories: 100,
          fat: "0g",
          carbs: "25g",
          protein: "0g"
        }
      }
    });

    console.log("Created test product:", testProduct.id);
    
    // Now we would normally call the Reddit analysis endpoint
    // But for now, let's just test the function directly
    const { searchRedditReviews } = await import("./server/services/reddit");
    
    console.log("Testing Reddit analysis for:", testProduct.productName);
    const redditData = await searchRedditReviews(testProduct.productName);
    console.log("Reddit analysis result:", JSON.stringify(redditData, null, 2));
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testRedditAnalysis();
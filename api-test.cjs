const fetch = require('node-fetch');
const fs = require('fs');

async function testApi() {
  try {
    // First, create a product analysis using the existing test data
    console.log("Creating test product analysis directly...");
    
    // We'll use the storage directly to create a test product
    const { storage } = require('./server/storage');
    
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
    
    // Now request Reddit analysis through the API
    console.log("Requesting Reddit analysis...");
    const redditResponse = await fetch(`http://localhost:5000/api/analyze-reddit/${testProduct.id}`, {
      method: 'POST'
    });
    
    const redditResult = await redditResponse.json();
    console.log("Reddit result:", redditResult);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testApi();
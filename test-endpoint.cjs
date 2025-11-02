const http = require('http');

// Create a test product directly in the storage
async function createTestProduct() {
  try {
    // Import the storage module
    const { storage } = await import('./server/storage.ts');
    
    // Create a test product
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
    
    console.log("Created test product with ID:", testProduct.id);
    return testProduct.id;
  } catch (error) {
    console.error("Error creating test product:", error);
    return null;
  }
}

// Make a request to the Reddit analysis endpoint
async function requestRedditAnalysis(productId) {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: `/api/analyze-reddit/${productId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

// Main test function
async function runTest() {
  try {
    console.log("Creating test product...");
    const productId = await createTestProduct();
    
    if (productId) {
      console.log("Requesting Reddit analysis for product:", productId);
      const result = await requestRedditAnalysis(productId);
      console.log("Reddit analysis result:", JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTest();
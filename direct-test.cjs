const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import the Reddit service function
async function testRedditService() {
  try {
    console.log("REDACTED_GEMINI_KEY present:", !!process.env.REDACTED_GEMINI_KEY);
    
    const { searchRedditReviews } = await import('./server/services/reddit.ts');
    
    console.log("Testing Reddit analysis for: Test Product");
    const redditData = await searchRedditReviews("Test Product");
    console.log("Reddit analysis result:", JSON.stringify(redditData, null, 2));
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testRedditService();
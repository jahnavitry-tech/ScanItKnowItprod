import fetch from 'node-fetch';

async function testRedditEndpoint() {
  try {
    // First, let's create a test product analysis
    const analysisResponse = await fetch('http://localhost:5000/api/analyze-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Mock image data - in reality this would be base64 encoded image data
        image: 'mock-image-data'
      })
    });
    
    const analysisResult = await analysisResponse.json();
    console.log('Analysis result:', analysisResult);
    
    if (analysisResult.analysisId) {
      // Now let's test the Reddit endpoint
      const redditResponse = await fetch(`http://localhost:5000/api/analyze-reddit/${analysisResult.analysisId}`, {
        method: 'POST'
      });
      
      const redditResult = await redditResponse.json();
      console.log('Reddit result:', redditResult);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRedditEndpoint();
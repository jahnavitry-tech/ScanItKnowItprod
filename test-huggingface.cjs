require('dotenv').config();
const fetch = require('node-fetch');

async function testHuggingFace() {
  const HF_BASE_URL = "https://router.huggingface.co/hf-inference/models";
  const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
  const VISION_MODEL = "Salesforce/blip-image-captioning-large";
  
  console.log("Testing HuggingFace API connection...");
  console.log("API Key present:", !!HF_API_KEY);
  
  if (!HF_API_KEY) {
    console.error("HUGGINGFACE_API_KEY is not set in environment variables");
    return;
  }
  
  try {
    // Test the model endpoint
    const response = await fetch(`${HF_BASE_URL}/${VISION_MODEL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
      }
    });
    
    console.log("Response status:", response.status);
    const text = await response.text();
    console.log("Response text:", text.substring(0, 200) + "...");
    
    if (response.ok) {
      console.log("✅ HuggingFace API connection successful");
    } else {
      console.error("❌ HuggingFace API connection failed");
    }
  } catch (error) {
    console.error("Error testing HuggingFace API:", error.message);
  }
}

testHuggingFace();
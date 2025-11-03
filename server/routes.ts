import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { identifyProductAndExtractText, analyzeIngredients, analyzeNutrition, generateChatResponse } from "./services/openai";
import { searchRedditReviews } from "./services/reddit";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Upload and analyze product image
  app.post("/api/analyze-product", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const base64Image = req.file.buffer.toString('base64');
      
      // Initial AI processing - now returns an array of products
      const analysisResults = await identifyProductAndExtractText(base64Image);
      
      // For backward compatibility, if only one product is detected, return the single product format
      // For multiple products, return the array format
      if (analysisResults.length === 1) {
        // Create product analysis record for the first (and only) product
        const productAnalysis = await storage.createProductAnalysis({
          productName: analysisResults[0].productName,
          productSummary: analysisResults[0].summary,
          extractedText: analysisResults[0].extractedText,
          imageUrl: null, // Could implement image storage later
          ingredientsData: null,
          nutritionData: null,
          redditData: null,
        });

        res.json({
          analysisId: productAnalysis.id,
          productName: productAnalysis.productName,
          summary: productAnalysis.productSummary,
          extractedText: productAnalysis.extractedText
        });
      } else {
        // Return array of detected products for multi-product selection
        res.json(analysisResults);
      }

    } catch (error) {
      console.error("Error analyzing product:", error);
      res.status(500).json({ error: "Failed to analyze product" });
    }
  });

  // Get ingredients analysis
  app.post("/api/analyze-ingredients/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      const analysis = await storage.getProductAnalysis(analysisId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      if (analysis.ingredientsData) {
        return res.json(analysis.ingredientsData);
      }

      // Analyze ingredients with AI
      const ingredientsData = await analyzeIngredients(analysis.extractedText);
      
      // Update analysis with ingredients data
      await storage.updateProductAnalysis(analysisId, { 
        ingredientsData 
      });

      res.json(ingredientsData);

    } catch (error) {
      console.error("Error analyzing ingredients:", error);
      res.status(500).json({ error: "Failed to analyze ingredients" });
    }
  });

  // Get nutrition analysis
  app.post("/api/analyze-nutrition/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      const analysis = await storage.getProductAnalysis(analysisId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      if (analysis.nutritionData) {
        return res.json(analysis.nutritionData);
      }

      // Analyze nutrition with AI
      const nutritionData = await analyzeNutrition(analysis.extractedText);
      
      // Update analysis with nutrition data
      await storage.updateProductAnalysis(analysisId, { 
        nutritionData 
      });

      res.json(nutritionData);

    } catch (error) {
      console.error("Error analyzing nutrition:", error);
      res.status(500).json({ error: "Failed to analyze nutrition" });
    }
  });

  // Get Reddit reviews
  app.post("/api/analyze-reddit/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      const analysis = await storage.getProductAnalysis(analysisId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      if (analysis.redditData) {
        return res.json(analysis.redditData);
      }

      // Search Reddit for reviews
      const redditData = await searchRedditReviews(analysis.productName);
      
      // Update analysis with Reddit data
      await storage.updateProductAnalysis(analysisId, { 
        redditData 
      });

      res.json(redditData);

    } catch (error) {
      console.error("Error analyzing Reddit reviews:", error);
      res.status(500).json({ error: "Failed to analyze Reddit reviews" });
    }
  });

  // Chat with AI about product
  app.post("/api/chat/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Generate AI response
      const aiResponse = await generateChatResponse(message, {
        productName: analysis.productName,
        extractedText: analysis.extractedText,
        ingredientsData: analysis.ingredientsData,
        nutritionData: analysis.nutritionData
      });

      // Save chat message
      const chatMessage = await storage.createChatMessage({
        analysisId,
        message,
        response: aiResponse
      });

      res.json({
        message: chatMessage.message,
        response: chatMessage.response,
        timestamp: chatMessage.createdAt
      });

    } catch (error) {
      console.error("Error processing chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Get chat history
  app.get("/api/chat/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      const messages = await storage.getChatMessages(analysisId);
      
      res.json(messages);

    } catch (error) {
      console.error("Error getting chat history:", error);
      res.status(500).json({ error: "Failed to get chat history" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
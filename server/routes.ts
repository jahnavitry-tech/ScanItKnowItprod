import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { identifyProductAndExtractText, analyzeIngredients, analyzeComposition, analyzeFeatures, generateChatResponse } from "./services/openai";
import { searchRedditReviews } from "./services/reddit";
import multer from "multer";

// --- TYPE HINT FOR SELECTED PRODUCT ---
interface SelectedProductData {
  productName: string;
  extractedText: {
    ingredients: string;
    nutrition: string;
    brand: string;
  };
  summary: string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // --- 1. Upload and initial analysis route (Handles Multi-Product) ---
  app.post("/api/analyze-product", upload.single('image'), async (req, res) => {
    try {
      console.log("Received image upload request");
      if (!req.file) {
        console.error("No image file provided in request");
        return res.status(400).json({ error: "No image file provided" });
      }

      const base64Image = req.file.buffer.toString('base64');
      const imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;
      console.log("Image converted to base64, size:", base64Image.length);
      
      // Initial AI processing - returns an array of products
      console.log("Calling identifyProductAndExtractText...");
      const analysisResults = await identifyProductAndExtractText(base64Image);
      console.log("AI analysis completed, results:", analysisResults.length, "products found");
      console.log("Analysis results:", JSON.stringify(analysisResults, null, 2));
      
      // Map the AI results to database insertion and store them
      console.log("Storing analysis results in database...");
      const storedAnalyses = await Promise.all(analysisResults.map(async (productData) => {
          const inserted = await storage.createProductAnalysis({
              productName: productData.productName,
              productSummary: productData.summary,
              extractedText: productData.extractedText,
              imageUrl: imageUrl, // Store the base64 image once per capture
          });
          console.log("Stored analysis for product:", productData.productName, "with ID:", inserted.id);
          // Return the full object which includes the new ID
          return {
              analysisId: inserted.id, // Match the client's expected field name
              productName: inserted.productName,
              productSummary: inserted.productSummary,  // Fixed: Use productSummary to match frontend type
              extractedText: inserted.extractedText,
              imageUrl: inserted.imageUrl,
              // All deep analysis fields start as null
              featuresData: null,
              ingredientsData: null,
              compositionData: null,
              redditData: null,
          };
      }));

      console.log("Returning", storedAnalyses.length, "stored analyses to client");
      // Return the array of stored product analyses
      res.json(storedAnalyses);

    } catch (error) {
      console.error("Error in initial product analysis:", error);
      // Log the full error stack trace
      console.error("Full error stack:", (error as Error).stack);
      res.status(500).json({ error: "Failed to analyze product image" });
    }
  });

  // --- 2. Store Selected Product (Called from ProductSelectionScreen) ---
  app.post("/api/select-product", async (req, res) => {
    try {
      const { productName, summary, extractedText } = req.body;
      
      if (!productName || !extractedText) {
        return res.status(400).json({ error: "Product name and extracted text are required" });
      }

      // Create a new analysis record in storage
      const newAnalysis = await storage.createProductAnalysis({
        productName,
        productSummary: summary,
        extractedText,
        imageUrl: null, 
      });

      res.json({ analysisId: newAnalysis.id });

    } catch (error) {
      console.error("Error saving selected product:", error);
      res.status(500).json({ error: "Failed to save selected product" });
    }
  });

  // --- 3. GET Single Product Analysis (Client uses this on first load) ---
  app.get("/api/analysis/:analysisId", async (req, res) => {
    try {
      const { analysisId } = req.params;
      const analysis = await storage.getProductAnalysis(analysisId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      res.json(analysis);

    } catch (error) {
      console.error("Error getting analysis:", error);
      res.status(500).json({ error: "Failed to get analysis" });
    }
  });

  // --- 4. Deep Analysis Orchestration (The main fix for the blank screen) ---
  app.post("/api/analyze-product/deep", async (req, res) => {
    try {
      const { analysisId } = req.body;
      console.log("Received deep analysis request for analysisId:", analysisId);

      if (!analysisId) {
        console.error("Analysis ID is required but not provided");
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      console.log("Retrieved analysis from storage:", analysis ? "found" : "not found");
      
      if (!analysis) {
        console.error("Analysis not found for ID:", analysisId);
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Return the existing analysis data without triggering new AI calls
      res.json(analysis);

    } catch (error) {
      console.error("Error in deep analysis orchestration:", error);
      res.status(500).json({ error: "Failed to perform deep analysis" });
    }
  });

  // --- NEW: Individual Analysis Endpoints for Lazy Loading ---
  
  // Features Analysis
  /*
  app.post("/api/analyze-features", async (req, res) => {
    try {
      const { analysisId } = req.body;
      
      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Only run analysis if not already done
      if (analysis.featuresData) {
        return res.json(analysis.featuresData);
      }

      // Run the features analysis with additional product information
      const featureAnalysis = await analyzeFeatures(analysis.productName, analysis.extractedText, analysis.productSummary);
      
      // Update storage with the result
      const updatedAnalysis = await storage.updateProductAnalysis(analysisId, { 
        featuresData: featureAnalysis
      });
      
      res.json(updatedAnalysis?.featuresData || featureAnalysis);

    } catch (error) {
      console.error("Error in features analysis:", error);
      res.status(500).json({ error: "Failed to analyze features" });
    }
  });
  */

  // Ingredients Analysis
  app.post("/api/analyze-ingredients", async (req, res) => {
    try {
      const { analysisId } = req.body;
      
      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Only run analysis if not already done
      if (analysis.ingredientsData) {
        return res.json(analysis.ingredientsData);
      }

      // Run the ingredients analysis with additional product information
      const ingredientAnalysis = await analyzeIngredients(analysis.productName, analysis.extractedText.brand, analysis.productSummary, analysis.extractedText);
      
      // Update storage with the result
      const updatedAnalysis = await storage.updateProductAnalysis(analysisId, { 
        ingredientsData: ingredientAnalysis
      });
      
      res.json(updatedAnalysis?.ingredientsData || ingredientAnalysis);

    } catch (error) {
      console.error("Error in ingredients analysis:", error);
      res.status(500).json({ error: "Failed to analyze ingredients" });
    }
  });

  // Composition Analysis (Calories/Nutrition)
  app.post("/api/analyze-composition", async (req, res) => {
    try {
      const { analysisId } = req.body;
      
      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Only run analysis if not already done
      if (analysis.compositionData) {
        return res.json(analysis.compositionData);
      }

      // Run the composition analysis with additional product information
      const composition = await analyzeComposition(analysis.productName, analysis.extractedText.brand, analysis.productSummary, analysis.extractedText);
      
      // Update storage with the result
      const updatedAnalysis = await storage.updateProductAnalysis(analysisId, { 
        compositionData: composition
      });
      
      res.json(updatedAnalysis?.compositionData || composition);

    } catch (error) {
      console.error("Error in composition analysis:", error);
      res.status(500).json({ error: "Failed to analyze composition" });
    }
  });

  // Reddit Analysis
  app.post("/api/analyze-reddit", async (req, res) => {
    try {
      const { analysisId } = req.body;
      
      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Only run analysis if not already done
      if (analysis.redditData) {
        return res.json(analysis.redditData);
      }

      // Run the reddit analysis with additional product information
      const reviews = await searchRedditReviews(analysis.productName, analysis.extractedText.brand, analysis.productSummary);
      
      // Update storage with the result
      const updatedAnalysis = await storage.updateProductAnalysis(analysisId, { 
        redditData: reviews
      });
      
      res.json(updatedAnalysis?.redditData || reviews);

    } catch (error) {
      console.error("Error in reddit analysis:", error);
      res.status(500).json({ error: "Failed to analyze reddit" });
    }
  });

  // --- 5. Chat Route ---
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

      // Generate AI response - UPDATED to use new field names
      const aiResponse = await generateChatResponse(message, {
        productName: analysis.productName,
        productSummary: analysis.productSummary,
        extractedText: analysis.extractedText,
        ingredientsData: analysis.ingredientsData,
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

  // Chat history route
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
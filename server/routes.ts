import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { identifyProductAndExtractText, analyzeIngredients, analyzeComposition, analyzeFeatures, generateChatResponse } from "./services/openai";
import { searchRedditReviews } from "./services/reddit";
import { analyzeIngredientsFallback, analyzeCompositionFallback, analyzeRedditFallback } from "./services/fallbackGrounding";
import { extractTextWithOCR, extractProductInfoFromOCR, searchOpenFoodFacts, searchOpenBeautyFacts, extractFromOpenFoodFacts, extractFromOpenBeautyFacts, extractGeneralItemInfo } from "./services/ocrFallback";
import { searchUSDAFDC, mapUSDAtoCompositionSchema } from "./services/usdaFdc";
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
      
      let analysisResults;
      let isFallbackMode = false;
      
      try {
        // PRIMARY PATH: Attempt Gemini Multimodal Analysis
        console.log("Calling identifyProductAndExtractText...");
        analysisResults = await identifyProductAndExtractText(base64Image);
        console.log("AI analysis completed, results:", analysisResults.length, "products found");
        console.log("Analysis results:", JSON.stringify(analysisResults, null, 2));
      } catch (error) {
        // FALLBACK PATH: Use OCR + Open Food Facts/Open Beauty Facts
        console.warn("Gemini failure. Initiating OCR fallback mode.");
        isFallbackMode = true;
        
        try {
          // Step 1.1: OCR
          console.log("Performing OCR on image...");
          const ocrResult = await extractTextWithOCR(base64Image);
          const ocrText = ocrResult.ParsedText || "";
          
          // Step 1.2: Try barcode search
          console.log("Extracting product info from OCR text...");
          const productInfo = extractProductInfoFromOCR(ocrText);
          
          if (productInfo.barcode) {
            console.log("Valid barcode found, searching databases...");
            
            // Try Open Food Facts first (for food products)
            let foodFactsData = await searchOpenFoodFacts(productInfo.barcode);
            
            if (foodFactsData) {
              console.log("Product found in Open Food Facts");
              const extractedData = extractFromOpenFoodFacts(foodFactsData);
              
              analysisResults = [{
                productName: extractedData.productName,
                extractedText: {
                  ingredients: extractedData.ingredients,
                  nutrition: `Calories: ${extractedData.nutrition.calories}, Fat: ${extractedData.nutrition.fat}g, Protein: ${extractedData.nutrition.protein}g`,
                  brand: extractedData.brand
                },
                summary: `Product category: ${extractedData.productCategory || "Food"}. This is a food product identified through barcode lookup.`
              }];
            } else {
              // Try Open Beauty Facts (for cosmetic products)
              const beautyFactsData = await searchOpenBeautyFacts(productInfo.barcode);
              
              if (beautyFactsData) {
                console.log("Product found in Open Beauty Facts");
                const extractedData = extractFromOpenBeautyFacts(beautyFactsData);
                
                analysisResults = [{
                  productName: extractedData.productName,
                  extractedText: {
                    ingredients: extractedData.ingredients,
                    nutrition: "Non-food product - No nutrition information available",
                    brand: extractedData.brand
                  },
                  summary: `Product category: ${extractedData.productCategory || "Cosmetic"}. This is a cosmetic product identified through barcode lookup.`
                }];
              } else {
                // Barcode found but not in either database
                analysisResults = [{
                  productName: productInfo.productName,
                  extractedText: {
                    ingredients: "Ingredients not available through barcode lookup",
                    nutrition: "Product information not available in databases",
                    brand: productInfo.brand
                  },
                  summary: "Product identified through OCR with barcode, but detailed information not available in food or beauty databases."
                }];
              }
            }
          } else {
            // No valid barcode, use general item extraction
            console.log("No valid barcode found, using general item extraction...");
            const generalInfo = extractGeneralItemInfo(ocrText);
            
            analysisResults = [{
              productName: generalInfo.productName,
              extractedText: {
                ingredients: generalInfo.ingredients,
                nutrition: "General item - Nutrition information not applicable",
                brand: generalInfo.brand
              },
              summary: `General item identified through OCR text parsing. Category: ${generalInfo.productCategory || "Unspecified"}.`
            }];
          }
        } catch (ocrError) {
          console.error("OCR fallback also failed:", ocrError);
          // Final fallback
          analysisResults = [{
            productName: "Fallback Product",
            extractedText: {
              ingredients: "Fallback OCR: Unable to extract detailed ingredients without client-side processing",
              nutrition: "Fallback Analysis: Please check product packaging for nutrition facts",
              brand: "Unknown Brand"
            },
            summary: "This analysis used a fallback method due to primary AI service unavailability. For detailed information, please check the product packaging."
          }];
        }
      }

      // Map the AI results to database insertion and store them
      console.log("Storing analysis results in database...");
      const storedAnalyses = await Promise.all(analysisResults.map(async (productData) => {
          const inserted = await storage.createProductAnalysis({
              productName: productData.productName,
              productSummary: productData.summary, // Use the summary property
              extractedText: productData.extractedText,
              imageUrl: imageUrl, // Store the base64 image once per capture
              isFallbackMode: isFallbackMode // Set the fallback mode flag
          });
          console.log("Stored analysis for product:", productData.productName, "with ID:", inserted.id);
          // Return the full object which includes the new ID
          return {
              analysisId: inserted.id, // Match the client's expected field name
              productName: inserted.productName,
              productSummary: inserted.productSummary,  // Fixed: Use productSummary to match frontend type
              extractedText: inserted.extractedText,
              imageUrl: inserted.imageUrl,
              isFallbackMode: inserted.isFallbackMode, // Include fallback mode flag
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
      // More detailed error logging
      if (error instanceof Error) {
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        // If it's a specific error we can identify, provide more context
        if (error.message.includes("HuggingFace")) {
          console.error("This is a HuggingFace API error. Please check your HUGGINGFACE_API_KEY and network connectivity.");
        } else if (error.message.includes("GEMINI")) {
          console.error("This is a Google Gemini API error. Please check your GEMINI_API_KEY and network connectivity.");
        }
      }
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

      let ingredientAnalysis;
      
      if (analysis.isFallbackMode) {
        // Fallback Path: Use Open Food Facts/Open Beauty Facts or Web Grounding Service
        console.log("Using fallback path for ingredients analysis");
        
        // Try to get ingredients from Open Food Facts if we have a barcode
        if (analysis.extractedText.barcode) {
          try {
            // Determine which database to use based on product category
            let productData = null;
            
            if (analysis.productSummary && analysis.productSummary.toLowerCase().includes("cosmetic")) {
              // Try Open Beauty Facts for cosmetics
              productData = await searchOpenBeautyFacts(analysis.extractedText.barcode);
            } else {
              // Try Open Food Facts for food products
              productData = await searchOpenFoodFacts(analysis.extractedText.barcode);
            }
            
            if (productData && productData.ingredients_text) {
              // Map database ingredients to our format
              const ingredientsList = productData.ingredients_text.split(/[,;]/).map((i: string) => i.trim()).filter((i: string) => i.length > 0);
              const ingredientsAnalysis = ingredientsList.map((ingredient: string) => ({
                name: ingredient,
                safety_status: "Safe", // Default to safe for now
                reason_with_source: "Identified through Open Food/Beauty Facts database lookup"
              }));
              
              ingredientAnalysis = { ingredients_analysis: ingredientsAnalysis };
            } else {
              // Fallback to web grounding service
              ingredientAnalysis = await analyzeIngredientsFallback(analysis);
            }
          } catch (error) {
            console.error("Database lookup failed, using web grounding:", error);
            ingredientAnalysis = await analyzeIngredientsFallback(analysis);
          }
        } else {
          // Use web grounding service
          ingredientAnalysis = await analyzeIngredientsFallback(analysis);
        }
      } else {
        // Primary Path: Use Gemini Service
        console.log("Using primary Gemini service for ingredients analysis");
        ingredientAnalysis = await analyzeIngredients(analysis.productName, analysis.extractedText.brand, analysis.productSummary, analysis.extractedText);
      }
      
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

      let composition;
      
      if (analysis.isFallbackMode) {
        // Fallback Path: Use category-specific APIs
        console.log("Using fallback path for composition analysis");
        
        // Determine category from extracted data
        let productCategory = "General/Unspecified";
        if (analysis.extractedText.nutrition && analysis.extractedText.nutrition.toLowerCase().includes("calories")) {
          productCategory = "Food/Consumable";
        } else if (analysis.productSummary && (analysis.productSummary.toLowerCase().includes("cosmetic") || analysis.productSummary.toLowerCase().includes("beauty"))) {
          productCategory = "Cosmetic/Topical";
        }
        
        // Use appropriate API based on category
        if (productCategory === "Food/Consumable") {
          // Use USDA FDC API
          try {
            const usdaData = await searchUSDAFDC(analysis.productName);
            composition = mapUSDAtoCompositionSchema(usdaData);
          } catch (error) {
            console.error("USDA FDC lookup failed:", error);
            composition = await analyzeCompositionFallback(analysis);
          }
        } else if (productCategory === "Cosmetic/Topical") {
          // For cosmetics, try to get data from Open Beauty Facts
          try {
            if (analysis.extractedText.barcode) {
              const beautyFactsData = await searchOpenBeautyFacts(analysis.extractedText.barcode);
              if (beautyFactsData) {
                // Create composition data for cosmetic products
                composition = {
                  productCategory: "Cosmetic/Topical",
                  netQuantity: 0,
                  unitType: "ml", // Default for cosmetics
                  calories: 0,
                  totalFat: 0,
                  totalProtein: 0,
                  compositionalDetails: [] as Array<{ key: string; value: string }>
                };
                
                // Add available details from Open Beauty Facts
                if (beautyFactsData.quantity) {
                  composition.compositionalDetails.push({
                    key: "Quantity",
                    value: beautyFactsData.quantity
                  });
                }
                
                if (beautyFactsData.ingredients_text) {
                  composition.compositionalDetails.push({
                    key: "Ingredients",
                    value: beautyFactsData.ingredients_text
                  });
                }
                
                if (beautyFactsData.categories) {
                  composition.compositionalDetails.push({
                    key: "Category",
                    value: beautyFactsData.categories
                  });
                }
              } else {
                // Fallback to web grounding service
                composition = await analyzeCompositionFallback(analysis);
              }
            } else {
              // Fallback to web grounding service
              composition = await analyzeCompositionFallback(analysis);
            }
          } catch (error) {
            console.error("Open Beauty Facts lookup failed:", error);
            composition = await analyzeCompositionFallback(analysis);
          }
        } else {
          // Use web grounding service for general items
          composition = await analyzeCompositionFallback(analysis);
        }
      } else {
        // Primary Path: Use Gemini Service
        console.log("Using primary Gemini service for composition analysis");
        composition = await analyzeComposition(analysis.productName, analysis.extractedText.brand, analysis.productSummary, analysis.extractedText);
      }
      
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

      let reviews;
      
      if (analysis.isFallbackMode) {
        // Fallback Path: Return null as per zero-cost plan
        console.log("Using fallback path for reddit analysis - returning null");
        reviews = null;
      } else {
        // Primary Path: Use Reddit Service
        console.log("Using primary reddit service for reddit analysis");
        reviews = await searchRedditReviews(analysis.productName, analysis.extractedText.brand, analysis.productSummary);
      }
      
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

      let aiResponse;
      
      if (analysis.isFallbackMode) {
        // Fallback Path: Return standard message as per zero-cost plan
        console.log("Using fallback path for chat - returning standard message");
        aiResponse = "Interactive Q&A is temporarily unavailable due to current system constraints.";
      } else {
        // Primary Path: Use AI Service
        console.log("Using primary AI service for chat response");
        // Generate AI response - UPDATED to use new field names
        aiResponse = await generateChatResponse(message, {
          productName: analysis.productName,
          productSummary: analysis.productSummary,
          extractedText: analysis.extractedText,
          ingredientsData: analysis.ingredientsData,
        });
      }

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
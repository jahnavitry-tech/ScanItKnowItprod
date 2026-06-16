import type { Express } from "express";
import { createServer, type Server } from "http";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { storage } from "./storage";
import { identifyProductAndExtractText, analyzeIngredients, analyzeComposition, generateChatResponse } from "./services/openai";
import { scanProductWithGroqVision, analyzeCompositionGroq, analyzeIngredientsGroq, searchRedditReviewsGroq, generateChatResponseGroq, checkGroqCooldown } from "./services/groq";
import { searchRedditReviews } from "./services/reddit";
import { analyzeIngredientsFallback, analyzeCompositionFallback } from "./services/fallbackGrounding";
import { extractTextWithOCR, extractProductInfoFromOCR, searchOpenFoodFacts, searchOpenBeautyFacts, extractFromOpenFoodFacts, extractFromOpenBeautyFacts, extractGeneralItemInfo, mapOFactsToCompositionSchema } from "./services/ocrFallback";
import { searchUSDAFDC, mapUSDAtoCompositionSchema } from "./services/usdaFdc";
import multer from "multer";

// Images are saved to disk so MemStorage never holds base64 strings in the heap.
// The directory is created on first route registration.
export const IMG_DIR = join(process.cwd(), "data", "images");
if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });


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

      // base64Image is still needed for the Gemini vision API call
      const base64Image = req.file.buffer.toString('base64');
      console.log("Image buffer received, size:", req.file.buffer.length);

      // Save raw bytes to disk — client fetches via /api/images/:name
      // This keeps MemStorage free of ~2 MB base64 strings per product.
      let imageUrl: string;
      try {
        const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        writeFileSync(join(IMG_DIR, filename), req.file.buffer);
        imageUrl = `/api/images/${filename}`;
      } catch (diskErr) {
        // Disk write failed — fall back to inline base64 (functionally correct,
        // just uses more memory).
        console.warn("Disk image save failed, falling back to base64:", diskErr);
        imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;
      }
      
      let analysisResults: any[];
      let isFallbackMode = false;

      // ── PROCESS 1: Image Vision ─────────────────────────────────────────────
      // Try Groq vision first (500/day free), then Gemini (20/day), then OCR.
      let aiScanError: Error | null = null;

      try {
        console.log("Process 1: Groq vision scan...");
        analysisResults = await scanProductWithGroqVision(base64Image);
        console.log("Groq ARA: identified", analysisResults.length, "product(s)");
        console.log("Groq results:", JSON.stringify(analysisResults, null, 2));
      } catch (groqErr) {
        console.warn("Groq vision failed:", (groqErr as Error).message, "— trying Gemini fallback...");
        try {
          analysisResults = await identifyProductAndExtractText(base64Image);
          console.log("Gemini ARA: identified", analysisResults.length, "product(s)");
        } catch (geminiErr) {
          aiScanError = geminiErr as Error;
          console.warn("Both Groq and Gemini vision failed — OCR fallback.");
          isFallbackMode = true;

          try {
            console.log("Performing OCR on image...");
            const ocrResult = await extractTextWithOCR(base64Image);
            const ocrText = ocrResult.ParsedText || "";
            console.log("Extracting product info from OCR text...");
            const productInfo = extractProductInfoFromOCR(ocrText);

            if (productInfo.barcode) {
              console.log("Valid barcode found, searching databases...");
              const foodFactsData = await searchOpenFoodFacts(productInfo.barcode);
              if (foodFactsData) {
                const d = extractFromOpenFoodFacts(foodFactsData);
                analysisResults = [{
                  productName: d.productName,
                  extractedText: { ingredients: d.ingredients, brand: d.brand },
                  summary: `${d.productCategory || "Food"} product from barcode lookup.`,
                }];
              } else {
                const beautyData = await searchOpenBeautyFacts(productInfo.barcode);
                if (beautyData) {
                  const d = extractFromOpenBeautyFacts(beautyData);
                  analysisResults = [{
                    productName: d.productName,
                    extractedText: { ingredients: d.ingredients, brand: d.brand },
                    summary: `${d.productCategory || "Cosmetic"} product from barcode lookup.`,
                  }];
                } else {
                  analysisResults = [{
                    productName: productInfo.productName || "Unknown Product",
                    extractedText: { ingredients: "Not available", brand: productInfo.brand },
                    summary: "Product identified via barcode but not found in databases.",
                  }];
                }
              }
            } else {
              console.log("No barcode — general OCR extraction...");
              const generalInfo = extractGeneralItemInfo(ocrText);
              analysisResults = [{
                productName: generalInfo.productName || "Unknown Product",
                extractedText: { ingredients: generalInfo.ingredients || "", brand: generalInfo.brand || "" },
                summary: `Item identified via OCR. Category: ${generalInfo.productCategory || "Unspecified"}.`,
              }];
            }
          } catch (ocrErr) {
            console.error("OCR fallback failed:", ocrErr);
            analysisResults = [{
              productName: "Scan Failed",
              extractedText: { ingredients: "", brand: "" },
              summary: "Could not read this image. Please try a clearer photo in better lighting.",
            }];
          }
        }
      }

      // Cap at 5 to protect quota
      const cappedResults = analysisResults.slice(0, 5);
      console.log(`Storing ${cappedResults.length} product(s)...`);

      // Store all products (no AI calls — just Map writes)
      const insertedAll = await Promise.all(cappedResults.map((productData: any) => {
        const brand = (productData.extractedText?.brand ?? "").trim();
        const isGeneralScene = /^not applicable$|^not visible$/i.test(brand);
        return storage.createProductAnalysis({
          productName: productData.productName,
          productSummary: productData.summary,
          productCategory: productData.productCategory,
          productContext: productData.productContext,
          extractedText: productData.extractedText,
          imageUrl: imageUrl,
          isFallbackMode: isFallbackMode,
          isGeneralScene,
        });
      }));

      // Composition pre-fetch REMOVED — client-side auto-start handles this
      // and pre-fetching here wasted quota on Gemini before Groq was available.

      const storedAnalyses = insertedAll.map((inserted) => {
        console.log("Stored:", inserted.productName, "ID:", inserted.id);
        return {
          analysisId: inserted.id,
          productName: inserted.productName,
          productSummary: inserted.productSummary,
          productCategory: inserted.productCategory,
          productContext: inserted.productContext,
          extractedText: inserted.extractedText,
          imageUrl: inserted.imageUrl,
          isFallbackMode: inserted.isFallbackMode,
          isGeneralScene: inserted.isGeneralScene,
          featuresData: null,
          ingredientsData: null,
          compositionData: null,
          redditData: null,
        };
      });

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
      // === OLD CODE (commented for Make refresh button call API again) ===
      // const { analysisId } = req.body;
      // === UPDATED from old code above for Make refresh button call API again ===
      const { analysisId, forceRefresh } = req.body;

      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // === OLD CODE (commented for Make refresh button call API again) ===
      // // Only run analysis if not already done
      // if (analysis.ingredientsData) {
      //   return res.json(analysis.ingredientsData);
      // }
      // === UPDATED from old code above for Make refresh button call API again ===
      // Only return cached data if not a forced refresh
      if (analysis.ingredientsData && !forceRefresh) {
        return res.json(analysis.ingredientsData);
      }

      // ── PROCESS 2: Ingredients — Groq → Gemini → OCR fallback ──
      let ingredientAnalysis: any;

      try {
        console.log("Groq ingredient safety analysis...");
        ingredientAnalysis = await analyzeIngredientsGroq(
          analysis.productName,
          analysis.extractedText?.brand ?? "",
          analysis.productSummary,
          analysis.extractedText,
        );
      } catch (groqErr) {
        console.warn("Groq ingredients failed:", (groqErr as Error).message, "— trying Gemini...");
        try {
          ingredientAnalysis = await analyzeIngredients(
            analysis.productName,
            analysis.extractedText?.brand ?? "",
            analysis.productSummary,
            analysis.extractedText,
          );
        } catch (geminiErr) {
          console.warn("Gemini ingredients failed:", (geminiErr as Error).message, "— OCR fallback...");
          try {
            ingredientAnalysis = await analyzeIngredientsFallback(analysis);
          } catch {
            ingredientAnalysis = { ingredients_analysis: [] };
          }
        }
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
      // === OLD CODE (commented for Make refresh button call API again) ===
      // const { analysisId } = req.body;
      // === UPDATED from old code above for Make refresh button call API again ===
      const { analysisId, forceRefresh } = req.body;

      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // === OLD CODE (commented for Make refresh button call API again) ===
      // // Only run analysis if not already done
      // if (analysis.compositionData) {
      //   return res.json(analysis.compositionData);
      // }
      // === UPDATED from old code above for Make refresh button call API again ===
      // Only return cached data if not a forced refresh
      if (analysis.compositionData && !forceRefresh) {
        return res.json(analysis.compositionData);
      }

      // ── PROCESS 2: Composition — Groq → OFacts barcode → Gemini → OCR fallback ──
      // isFallbackMode only means the initial scan used OCR — analysis can still use AI.
      let composition: any;

      // 1. Try barcode lookup first (free, no AI quota)
      const rawBrand = analysis.extractedText?.brand ?? "";
      const barcodeMatch = rawBrand.match(/\b(\d{8,14})\b/);
      const barcode = barcodeMatch?.[1] ?? null;
      if (barcode) {
        try {
          console.log(`Barcode ${barcode} — trying Open Food Facts...`);
          const ofactsProduct = await searchOpenFoodFacts(barcode);
          if (ofactsProduct) {
            composition = mapOFactsToCompositionSchema(ofactsProduct);
            console.log("OFacts hit — AI call skipped");
          }
        } catch (ofErr) {
          console.warn("OFacts lookup failed:", (ofErr as Error).message);
        }
      }

      // 2. Groq analysis (primary AI — 14,400/day free)
      if (!composition) {
        try {
          console.log("Groq composition analysis...");
          composition = await analyzeCompositionGroq(
            analysis.productName,
            analysis.extractedText?.brand ?? "",
            analysis.productSummary,
            analysis.extractedText,
            analysis.productCategory,
            analysis.productContext,
          );
        } catch (groqErr) {
          console.warn("Groq composition failed:", (groqErr as Error).message, "— trying Gemini...");
          // 3. Gemini fallback (20/day)
          try {
            composition = await analyzeComposition(
              analysis.productName,
              analysis.extractedText?.brand ?? "",
              analysis.productSummary,
              analysis.extractedText,
            );
          } catch (geminiErr) {
            console.warn("Gemini composition failed:", (geminiErr as Error).message, "— OCR fallback...");
            // 4. OCR regex fallback (no AI)
            try {
              composition = await analyzeCompositionFallback(analysis);
            } catch {
              composition = { productCategory: "Unknown", netQuantity: 0, unitType: "g", calories: 0, totalFat: 0, totalProtein: 0, compositionalDetails: [] };
            }
          }
        }
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
      // === OLD CODE (commented for Make refresh button call API again) ===
      // const { analysisId } = req.body;
      // === UPDATED from old code above for Make refresh button call API again ===
      const { analysisId, forceRefresh } = req.body;

      if (!analysisId) {
        return res.status(400).json({ error: "Analysis ID is required" });
      }

      const analysis = await storage.getProductAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // === OLD CODE (commented for Make refresh button call API again) ===
      // // Only run analysis if not already done
      // if (analysis.redditData) {
      //   return res.json(analysis.redditData);
      // }
      // === UPDATED from old code above for Make refresh button call API again ===
      // Only return cached data if not a forced refresh
      if (analysis.redditData && !forceRefresh) {
        return res.json(analysis.redditData);
      }

      // ── PROCESS 2: Reddit — Groq → Gemini → null ──
      let reviews: any = null;

      try {
        console.log("Groq Reddit reviews...");
        reviews = await searchRedditReviewsGroq(
          analysis.productName,
          analysis.extractedText?.brand ?? "",
          analysis.productSummary,
        );
      } catch (groqErr) {
        console.warn("Groq Reddit failed:", (groqErr as Error).message, "— trying Gemini...");
        try {
          reviews = await searchRedditReviews(
            analysis.productName,
            analysis.extractedText?.brand ?? "",
            analysis.productSummary,
          );
        } catch (geminiErr) {
          console.warn("Gemini Reddit also failed:", (geminiErr as Error).message);
          reviews = null;
        }
      }

      // null means the service is unavailable (quota, error, fallback mode).
      // Store null so subsequent cached reads also hit this branch, then tell
      // the client to retry later rather than showing a misleading empty result.
      if (reviews === null) {
        await storage.updateProductAnalysis(analysisId, { redditData: null });
        return res.status(503).json({ error: "UNAVAILABLE", retryAfter: 60 });
      }

      const updatedAnalysis = await storage.updateProductAnalysis(analysisId, {
        redditData: reviews,
      });

      res.json(updatedAnalysis?.redditData ?? reviews);

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

      // ── PROCESS 2: Chat — Groq → Gemini ──
      let aiResponse: string;

      try {
        console.log("Groq chat response...");
        aiResponse = await generateChatResponseGroq(message, {
          productName: analysis.productName,
          productSummary: analysis.productSummary,
          extractedText: analysis.extractedText,
        });
      } catch (groqErr) {
        console.warn("Groq chat failed:", (groqErr as Error).message, "— trying Gemini...");
        try {
          aiResponse = await generateChatResponse(message, {
            productName: analysis.productName,
            productSummary: analysis.productSummary,
            extractedText: analysis.extractedText,
            ingredientsData: analysis.ingredientsData,
          });
        } catch (geminiErr) {
          console.warn("Gemini chat failed:", (geminiErr as Error).message);
          aiResponse = "AI chat is temporarily unavailable. Please try again in a moment.";
        }
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
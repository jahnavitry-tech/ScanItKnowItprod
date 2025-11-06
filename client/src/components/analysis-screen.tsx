import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Save, Share, Loader2, Flame, Star } from "lucide-react";
import { AnalysisCard } from "./analysis-card";
import type { ProductAnalysis, CardType, CardData, IngredientsData, RedditData, ICompositionAnalysis, IFeaturesData } from "@/types/analysis";
import { apiRequest } from "@/lib/queryClient";

interface AnalysisScreenProps {
  analysisId: string;
  onScanAnother: () => void;
}

// Extended ProductAnalysis interface for the final state
interface FullProductAnalysis extends ProductAnalysis {
  ingredientsData: IngredientsData | null;
  redditData: RedditData | null;
  compositionData: ICompositionAnalysis | null;
}

export function AnalysisScreen({ analysisId, onScanAnother }: AnalysisScreenProps) {
  // Use the extended interface for the main state
  const [analysis, setAnalysis] = useState<FullProductAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCard, setOpenCard] = useState<CardType | null>(null);
  const [cardData, setCardData] = useState<CardData>({});
  // Track which cards have been loaded to prevent duplicate API calls
  const [loadedCards, setLoadedCards] = useState<Record<CardType, boolean>>({
    ingredients: false,
    calories: false,
    reddit: false,
    qa: false,
  });
  // Track which cards are currently loading
  const [loadingCards, setLoadingCards] = useState<Record<CardType, boolean>>({
    ingredients: false,
    calories: false,
    reddit: false,
    qa: false,
  });

  useEffect(() => {
    const loadInitialAnalysis = async () => {
      try {
        console.log("Loading initial analysis for analysisId:", analysisId);
        setLoading(true);
        
        // Load the basic analysis data
        console.log("Calling GET /api/analyze-product/:analysisId");
        const response = await apiRequest('GET', `/api/analysis/${analysisId}`);
        console.log("Initial analysis response status:", response.status);
        const analysisData = await response.json() as FullProductAnalysis;
        console.log("Received initial analysis data:", analysisData);
        setAnalysis(analysisData);
        
        // Initialize cardData with available data (could be null if not yet analyzed)
        setCardData({
          ingredients: analysisData.ingredientsData,
          reddit: analysisData.redditData,
          qa: null, // QA card still relies on user input
          calories: analysisData.compositionData, // Add composition data for calories tab
        });
        
        // Mark cards as loaded if they have data
        setLoadedCards({
          ingredients: !!analysisData.ingredientsData,
          calories: !!analysisData.compositionData, // Composition analysis
          reddit: !!analysisData.redditData,
          qa: false, // QA is never pre-loaded
        });

      } catch (error) {
        console.error("Error loading initial analysis:", error);
      } finally {
        setLoading(false);
      }
    };

    if (analysisId) {
      loadInitialAnalysis();
    }
  }, [analysisId]);

  const handleCardToggle = async (cardType: CardType) => {
    // If card is already open, just close it
    if (openCard === cardType) {
      setOpenCard(null);
      return;
    }
    
    // Set the card as open immediately to show the loading UI
    setOpenCard(cardType);
    
    // If card hasn't been loaded yet, load its data
    if (!loadedCards[cardType]) {
      try {
        console.log(`Loading data for ${cardType} card`);
        // Set loading state immediately when starting to fetch data
        setLoadingCards(prev => ({
          ...prev,
          [cardType]: true
        }));
        
        let data: any = null;
        
        switch (cardType) {
          case 'ingredients':
            const ingredientsResponse = await apiRequest('POST', `/api/analyze-ingredients`, { analysisId });
            data = await ingredientsResponse.json();
            // Update the main analysis state with the new data
            setAnalysis(prev => prev ? { ...prev, ingredientsData: data } : null);
            break;
          
          case 'calories':
            const compositionResponse = await apiRequest('POST', `/api/analyze-composition`, { analysisId });
            data = await compositionResponse.json();
            // Update the main analysis state with the new data
            setAnalysis(prev => prev ? { ...prev, compositionData: data } : null);
            break;
          
          case 'reddit':
            const redditResponse = await apiRequest('POST', `/api/analyze-reddit`, { analysisId });
            data = await redditResponse.json();
            // Update the main analysis state with the new data
            setAnalysis(prev => prev ? { ...prev, redditData: data } : null);
            break;
        }
        
        // Update card data state
        setCardData(prev => ({
          ...prev,
          [cardType]: data
        }));
        
        // Mark this card as loaded
        setLoadedCards(prev => ({
          ...prev,
          [cardType]: true
        }));
      } catch (error) {
        console.error(`Error loading ${cardType} data:`, error);
        // Set error state
        setCardData(prev => ({
          ...prev,
          [cardType]: { error: true }
        }));
      } finally {
        // Always set loading to false when done
        setLoadingCards(prev => ({
          ...prev,
          [cardType]: false
        }));
      }
    }
  };
  
  // This function is kept for the chat card, but the deep analysis cards no longer use it
  const handleDataLoaded = (type: CardType, data: any) => {
    setCardData(prev => ({
      ...prev,
      [type]: data,
    }));
  };

  const cards = [
    { 
      type: 'ingredients' as CardType, 
      title: "Ingredient Safety", 
      description: "In-depth safety analysis of every ingredient.",
      icon: null
    },
    { 
      type: 'calories' as CardType, 
      title: "Nutrition Facts", 
      description: "Detailed nutritional information and calories.",
      icon: Flame
    },
    { 
      type: 'reddit' as CardType, 
      title: "Reddit reviews", 
      description: "Community opinions",
      icon: Star
    },
    { 
      type: 'qa' as CardType, 
      title: "Ask the AI", 
      description: "Ask specific questions about the analysis.",
      icon: null
    },
  ];

  // Print functionality for sharing and saving
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full p-12">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-primary">Loading Product Analysis...</h2>
          <Loader2 className="mt-4 animate-spin h-8 w-8 text-primary mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">Retrieving product information.</p>
        </div>
      </div>
    );
  }

  // If analysis data failed to load, show an error state
  if (!analysis) {
    return (
      <div className="max-w-md mx-auto px-4 py-6 bg-background" data-testid="analysis-screen">
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border flex items-center justify-center">
              <Camera className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" data-testid="text-product-name">
                Product Not Found
              </h1>
              <p className="text-muted-foreground text-sm">Unable to load product analysis</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Parse summary into bullet points - handle potential undefined summary
  const summaryPoints = analysis.productSummary
    ? analysis.productSummary
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^[•\-\*]\s*/, ''))
    : [];

  // Log the summary for debugging
  console.log("Product summary:", analysis.productSummary);
  console.log("Parsed summary points:", summaryPoints);

  return (
    <div className="max-w-md mx-auto px-4 py-6 bg-background space-y-6" data-testid="analysis-screen">
      {/* Product Header */}
      <div className="bg-card rounded-2xl p-6 border border-border shadow-sm space-y-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border flex items-center justify-center mb-4">
            <Camera className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-product-name">
              {analysis?.productName || "Product Name"}
            </h1>
            <p className="text-muted-foreground text-sm">Product Analysis</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            data-testid="button-share"
            onClick={handlePrint}
          >
            <Share className="h-5 w-5" />
          </Button>
        </div>
      
        {/* AI Summary - Always visible */}
        <div className="space-y-3">
          <h3 className="font-semibold text-primary">Product Summary</h3>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-1" data-testid="text-product-summary">
            {summaryPoints && summaryPoints.length > 0 ? (
              summaryPoints.map((point, index) => (
                <p key={index}>• {point}</p>
              ))
            ) : (
              <p>No summary available</p>
            )}
          </div>
        </div>
      </div>

      {/* Analysis Cards - Only one card can be open at a time */}
      <div className="space-y-4">
        {cards.map((card) => (
          <AnalysisCard
            key={card.type}
            cardType={card.type}
            title={card.title}
            description={card.description}
            icon={card.icon}
            analysisId={analysisId}
            isExpanded={openCard === card.type}
            onExpand={() => handleCardToggle(card.type)}
            data={cardData[card.type]}
            onDataLoaded={handleDataLoaded}
            extractedText={analysis?.extractedText}
            productName={analysis?.productName}
            productSummary={analysis?.productSummary}
            isLoading={loadingCards[card.type]}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <Button
          className="flex-1"
          onClick={onScanAnother}
          data-testid="button-scan-another"
        >
          <Camera className="h-4 w-4 mr-2" />
          Scan Another
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          data-testid="button-save"
          onClick={handlePrint}
        >
          <Save className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Share, Loader2, Flame, Star, Leaf, MessageCircle, MessageSquare, RotateCcw } from "lucide-react";
import { AnalysisCard } from "./analysis-card";
import type { ProductAnalysis, CardType, CardData, IngredientsData, RedditData, ICompositionAnalysis, IFeaturesData } from "@/types/analysis";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  // Track which cards are currently recalling
  const [recallingCards, setRecallingCards] = useState<Record<CardType, boolean>>({
    ingredients: false,
    calories: false,
    reddit: false,
    qa: false,
  });
  
  // Feedback dialog state
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

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
    // Add additional check to prevent multiple calls
    // Note: For recall functionality, we want to allow reloading even if already loaded
    if (!loadedCards[cardType] && !loadingCards[cardType]) {
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
        
        // Store data in session storage
        sessionStorage.setItem(`${cardType}_data_${analysisId}`, JSON.stringify({
          data: data,
          timestamp: Date.now()
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
  
  // New recall functions for each card type
  const recallCaloriesData = async () => {
    if (!analysisId) return;
    
    // Prevent multiple concurrent calls
    if (recallingCards.calories) {
      console.log("Calories data recall already in progress, skipping...");
      return;
    }
    
    console.log("Initiating calories data recall...");
    
    try {
      setRecallingCards(prev => ({ ...prev, calories: true }));
      
      const compositionResponse = await apiRequest('POST', `/api/analyze-composition`, { analysisId });
      const data = await compositionResponse.json();
      
      console.log("Received calories data from API:", data ? JSON.stringify(data).substring(0, 100) : null);
      
      // Log success only if we have valid data
      if (data && Object.keys(data).length > 0) {
        console.log("Calories data recalled successfully");
      }
      
      console.log("Reloading data for calories card");
      
      // Update the main analysis state with the new data
      setAnalysis(prev => {
        const newState = prev ? { ...prev, compositionData: data } : null;
        console.log("Updated analysis state with new compositionData:", newState);
        return newState;
      });
      
      // Update card data state with a new object reference to force re-render
      setCardData(prev => {
        const newState = {
          ...prev,
          calories: data ? { ...data, _timestamp: Date.now() } : data // Add timestamp to force new reference
        };
        console.log("Updated cardData state with new calories data:", newState);
        return newState;
      });
      
      // Store data in session storage
      sessionStorage.setItem(`calories_data_${analysisId}`, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
      
      // Force re-render by temporarily marking card as not loaded
      console.log("Temporarily marking calories card as not loaded to force re-render");
      setLoadedCards(prev => ({
        ...prev,
        calories: false
      }));
      
      // After a brief delay, mark as loaded to trigger re-render with new data
      console.log("Setting timeout to mark calories card as loaded again");
      setTimeout(() => {
        console.log("Marking calories card as loaded to trigger re-render");
        setLoadedCards(prev => ({
          ...prev,
          calories: true
        }));
      }, 50);
    } catch (error) {
      console.error("Error recalling calories data:", error);
      // Set error state
      setCardData(prev => ({
        ...prev,
        calories: { error: true }
      }));
    } finally {
      setRecallingCards(prev => ({ ...prev, calories: false }));
    }
  };
  
  const recallIngredientsData = async () => {
    if (!analysisId) return;
    
    // Prevent multiple concurrent calls
    if (recallingCards.ingredients) {
      console.log("Ingredients data recall already in progress, skipping...");
      return;
    }
    
    console.log("Initiating ingredients data recall...");
    
    try {
      setRecallingCards(prev => ({ ...prev, ingredients: true }));
      
      const ingredientsResponse = await apiRequest('POST', `/api/analyze-ingredients`, { analysisId });
      const data = await ingredientsResponse.json();
      
      console.log("Received ingredients data from API:", data ? JSON.stringify(data).substring(0, 100) : null);
      
      // Log success only if we have valid data
      if (data && Object.keys(data).length > 0) {
        console.log("Ingredients data recalled successfully");
      }
      
      console.log("Reloading data for ingredients card");
      
      // Update the main analysis state with the new data
      setAnalysis(prev => {
        const newState = prev ? { ...prev, ingredientsData: data } : null;
        console.log("Updated analysis state with new ingredientsData:", newState);
        return newState;
      });
      
      // Update card data state with a new object reference to force re-render
      setCardData(prev => {
        const newState = {
          ...prev,
          ingredients: data ? { ...data, _timestamp: Date.now() } : data // Add timestamp to force new reference
        };
        console.log("Updated cardData state with new ingredients data:", newState);
        return newState;
      });
      
      // Store data in session storage
      sessionStorage.setItem(`ingredients_data_${analysisId}`, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
      
      // Force re-render by temporarily marking card as not loaded
      console.log("Temporarily marking ingredients card as not loaded to force re-render");
      setLoadedCards(prev => ({
        ...prev,
        ingredients: false
      }));
      
      // After a brief delay, mark as loaded to trigger re-render with new data
      console.log("Setting timeout to mark ingredients card as loaded again");
      setTimeout(() => {
        console.log("Marking ingredients card as loaded to trigger re-render");
        setLoadedCards(prev => ({
          ...prev,
          ingredients: true
        }));
      }, 50);
    } catch (error) {
      console.error("Error recalling ingredients data:", error);
      // Set error state
      setCardData(prev => ({
        ...prev,
        ingredients: { error: true }
      }));
    } finally {
      setRecallingCards(prev => ({ ...prev, ingredients: false }));
    }
  };
  
  const recallRedditData = async () => {
    if (!analysisId) return;
    
    // Prevent multiple concurrent calls
    if (recallingCards.reddit) {
      console.log("Reddit data recall already in progress, skipping...");
      return;
    }
    
    console.log("Initiating reddit data recall...");
    
    try {
      setRecallingCards(prev => ({ ...prev, reddit: true }));
      
      const redditResponse = await apiRequest('POST', `/api/analyze-reddit`, { analysisId });
      const data = await redditResponse.json();
      
      console.log("Received reddit data from API:", data ? JSON.stringify(data).substring(0, 100) : null);
      
      // Log success only if we have valid data
      if (data && Object.keys(data).length > 0) {
        console.log("Reddit data recalled successfully");
      }
      
      console.log("Reloading data for reddit card");
      
      // Update the main analysis state with the new data
      setAnalysis(prev => {
        const newState = prev ? { ...prev, redditData: data } : null;
        console.log("Updated analysis state with new redditData:", newState);
        return newState;
      });
      
      // Update card data state with a new object reference to force re-render
      setCardData(prev => {
        const newState = {
          ...prev,
          reddit: data ? { ...data, _timestamp: Date.now() } : data // Add timestamp to force new reference
        };
        console.log("Updated cardData state with new reddit data:", newState);
        return newState;
      });
      
      // Store data in session storage
      sessionStorage.setItem(`reddit_data_${analysisId}`, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
      
      // Force re-render by temporarily marking card as not loaded
      console.log("Temporarily marking reddit card as not loaded to force re-render");
      setLoadedCards(prev => ({
        ...prev,
        reddit: false
      }));
      
      // After a brief delay, mark as loaded to trigger re-render with new data
      console.log("Setting timeout to mark reddit card as loaded again");
      setTimeout(() => {
        console.log("Marking reddit card as loaded to trigger re-render");
        setLoadedCards(prev => ({
          ...prev,
          reddit: true
        }));
      }, 50);
    } catch (error) {
      console.error("Error recalling reddit data:", error);
      // Set error state
      setCardData(prev => ({
        ...prev,
        reddit: { error: true }
      }));
    } finally {
      setRecallingCards(prev => ({ ...prev, reddit: false }));
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
      type: 'calories' as CardType, 
      title: "Nutrition Facts", 
      description: "Detailed nutritional information and calories.",
      icon: Flame
    },
    { 
      type: 'ingredients' as CardType, 
      title: "Ingredient Safety", 
      description: "In-depth safety analysis of every ingredient.",
      icon: Leaf
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
      icon: MessageCircle
    },
  ];

  // Print functionality for sharing
  const handlePrint = () => {
    window.print();
  };
  
  // Handle feedback submission
  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate feedback is not empty
    if (!feedback.trim()) {
      return;
    }
    
    const toEmail = "scanitknowit@gmail.com";
    const subject = "Suggestions for ScanItKnowIt Update";
    const body = feedback;
    
    // Create mailto link with proper encoding
    const encodedTo = encodeURIComponent(toEmail);
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    
    // Construct the mailto link
    const mailtoLink = `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`;
    
    // Debug logging to verify the link
    console.log("Mailto link:", mailtoLink);
    console.log("Decoded components:");
    console.log("  To:", decodeURIComponent(encodedTo));
    console.log("  Subject:", decodeURIComponent(encodedSubject));
    console.log("  Body:", decodeURIComponent(encodedBody));
    
    // Try to open the mailto link with multiple fallback methods
    let opened = false;
    
    // Method 1: Direct assignment (most reliable)
    try {
      const previousUrl = window.location.href;
      window.location.href = mailtoLink;
      console.log("Mailto link opened via window.location.href");
      
      // Give it a moment to see if the page actually navigates
      setTimeout(() => {
        if (window.location.href === previousUrl) {
          console.warn("Mailto link may not have opened an email client");
          // Show a user-friendly message
          alert("If your email client didn't open automatically, please check that you have a default email application set up on your system. You can also manually copy the following information:\n\nTo: scanitknowit@gmail.com\nSubject: Suggestions for ScanItKnowIt Update\nBody: " + body);
        }
      }, 500);
      
      opened = true;
    } catch (error) {
      console.error("Failed to open mailto via window.location.href:", error);
    }
    
    // Method 2: If method 1 fails, try creating a temporary link
    if (!opened) {
      try {
        const link = document.createElement('a');
        link.href = mailtoLink;
        link.target = '_self'; // Important for mailto links
        link.rel = 'noopener noreferrer';
        link.style.position = 'absolute';
        link.style.left = '-9999px';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("Mailto link opened via temporary link element");
        opened = true;
      } catch (error) {
        console.error("Failed to open mailto via temporary link:", error);
      }
    }
    
    // Method 3: If both methods fail, try window.open
    if (!opened) {
      try {
        const popup = window.open(mailtoLink, '_self');
        if (popup) {
          console.log("Mailto link opened via window.open");
          opened = true;
        } else {
          console.error("window.open returned null - popup blocked or mailto failed");
        }
      } catch (error) {
        console.error("Failed to open mailto via window.open:", error);
      }
    }
    
    // If all methods failed, show an error message to the user
    if (!opened) {
      console.error("All methods to open mailto link failed");
      // Show a user-friendly error message with manual instructions
      alert("Unable to automatically open your email client. Please manually send an email to scanitknowit@gmail.com with the subject 'Suggestions for ScanItKnowIt Update' and include your feedback in the body:\n\n" + body);
    }
    
    // Close the dialog and reset feedback after a short delay
    setTimeout(() => {
      setIsFeedbackOpen(false);
      setFeedback("");
    }, 500);
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
      <div className="max-w-md mx-auto px-2 py-6 bg-background" data-testid="analysis-screen">
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border flex items-center justify-center overflow-hidden">
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
  const summaryPoints = analysis?.productSummary
    ? analysis.productSummary
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^[•\-\*]\s*/, ''))
    : [];

  return (
    <div className="max-w-md mx-auto px-2 py-6 bg-background space-y-6" data-testid="analysis-screen">
      {/* Product Header */}
      <div className="bg-card rounded-2xl p-6 border border-border shadow-sm space-y-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border flex items-center justify-center mb-4 overflow-hidden">
            {analysis?.imageUrl ? (
              <img 
                src={analysis.imageUrl} 
                alt={analysis.productName} 
                className="w-full h-full object-contain"
              />
            ) : (
              <Camera className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-product-name">
              {analysis?.productName || "Product Name"}
            </h1>
            
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
            // New props for recall functionality
            onRecall={
              card.type === 'calories' ? recallCaloriesData :
              card.type === 'ingredients' ? recallIngredientsData :
              card.type === 'reddit' ? recallRedditData :
              undefined
            }
            isRecalling={recallingCards[card.type]}
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
        <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex-1">
              <MessageSquare className="h-4 w-4 mr-2" />
              Feedback
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Send Feedback</DialogTitle>
              <DialogDescription>
                Help us improve ScanItKnowIt by sharing your suggestions.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFeedbackSubmit}>
              <div className="grid gap-4 py-4">
                <Textarea
                  placeholder="Type your feedback here..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <DialogFooter>
                <Button type="submit">Submit Feedback</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
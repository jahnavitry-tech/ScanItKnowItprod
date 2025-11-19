import { useState, useRef, useEffect } from "react";
import { ChevronDown, MessageCircle, Leaf, Flame, Star, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { ChatInterface } from "./chat-interface";
import type { CardType, CardData } from "@/types/analysis";

// Helper function for deep equality check
const deepEqual = (obj1: any, obj2: any): boolean => {
  // Special case: if both objects have a _timestamp property, ignore it for comparison
  if (obj1 && obj2 && obj1._timestamp !== undefined && obj2._timestamp !== undefined) {
    // Create copies without the _timestamp property for comparison
    const obj1Copy = { ...obj1 };
    const obj2Copy = { ...obj2 };
    delete obj1Copy._timestamp;
    delete obj2Copy._timestamp;
    return deepEqual(obj1Copy, obj2Copy);
  }
  
  console.log("deepEqual called with:", { 
    obj1: obj1 ? JSON.stringify(obj1).substring(0, 100) : null,
    obj2: obj2 ? JSON.stringify(obj2).substring(0, 100) : null
  });
  
  if (obj1 === obj2) {
    console.log("Objects are strictly equal");
    return true;
  }
  
  if (obj1 == null || obj2 == null) {
    console.log("One or both objects are null/undefined");
    return obj1 === obj2;
  }
  
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    console.log("Objects are primitive types");
    return obj1 === obj2;
  }
  
  if (Array.isArray(obj1) !== Array.isArray(obj2)) {
    console.log("One is array, other is not");
    return false;
  }
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) {
    console.log("Different number of keys");
    return false;
  }
  
  for (let key of keys1) {
    // Skip the _timestamp key if it exists
    if (key === '_timestamp') continue;
    
    if (!keys2.includes(key)) {
      console.log(`Key ${key} missing in second object`);
      return false;
    }
    if (!deepEqual(obj1[key], obj2[key])) {
      console.log(`Values for key ${key} are different`);
      return false;
    }
  }
  
  console.log("Objects are deeply equal");
  return true;
};

interface AnalysisCardProps {
  title: string;
  description: string;
  cardType?: CardType;
  icon?: React.ComponentType<any> | null;
  children?: React.ReactNode;
  isLoading?: boolean;
  onExpand: () => void;
  isExpanded: boolean;
  productName?: string;
  productSummary?: string;
  extractedText?: any;
  analysisId?: string;
  data?: CardData[keyof CardData];
  onDataLoaded?: (type: CardType, data: any) => void;
  // New props for recall functionality
  onRecall?: () => void;
  isRecalling?: boolean;
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({ 
  title, 
  description,
  cardType,
  icon: Icon,
  children, 
  isLoading = false,
  onExpand,
  isExpanded,
  productName,
  productSummary,
  extractedText,
  analysisId,
  data,
  // New props for recall functionality
  onRecall,
  isRecalling
}) => {
  // State for tracking if data has been loaded for this card
  const [hasLoaded, setHasLoaded] = useState(false);
  // State to track the previous data for comparison
  const [prevData, setPrevData] = useState<any>(null);
  // State to force re-render when data changes
  const [updateKey, setUpdateKey] = useState(0);

  // Effect to mark card as loaded when data is present
  // Reset hasLoaded when data changes to allow re-rendering with new data
  useEffect(() => {
    console.log(`AnalysisCard useEffect triggered for ${cardType} card`, { 
      data: data ? JSON.stringify(data).substring(0, 100) : null,
      prevData: prevData ? JSON.stringify(prevData).substring(0, 100) : null,
      hasLoaded,
      deepEqualResult: data && prevData ? deepEqual(data, prevData) : 'N/A'
    });
    
    // Check if data has actually changed using deep equality
    if (data && !deepEqual(data, prevData)) {
      console.log(`Data changed for ${cardType} card, forcing re-render`);
      setHasLoaded(true);
      setPrevData(data);
      // Force re-render by updating the key
      setUpdateKey(prev => prev + 1);
    } else if (!data && prevData) {
      // Data was cleared, reset states
      setHasLoaded(false);
      setPrevData(null);
    } else if (data && !hasLoaded) {
      // Data is present but card wasn't marked as loaded, mark it now
      console.log(`Initial data loaded for ${cardType} card`);
      setHasLoaded(true);
      setPrevData(data);
    } else if (data && hasLoaded) {
      console.log(`Data unchanged for ${cardType} card, no re-render needed`);
    }
  }, [data, prevData, hasLoaded, cardType]);
  
  // Add a key to force re-render when data changes
  const contentKey = `${cardType}-${updateKey}`;

  const renderCardContent = () => {
    // Show loading state when card is expanded and loading prop is true
    if (isExpanded && isLoading) {
      if (cardType === 'calories') {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="animate-spin h-8 w-8 text-orange-500 mb-2" />
            <p className="text-muted-foreground">Analyzing nutrition...</p>
          </div>
        );
      }
      
      if (cardType === 'reddit') {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="animate-spin h-8 w-8 text-red-500 mb-2" />
            <p className="text-muted-foreground">Searching Reddit...</p>
          </div>
        );
      }
      
      if (cardType === 'ingredients') {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="animate-spin h-8 w-8 text-green-500 mb-2" />
            <p className="text-muted-foreground">Analyzing ingredients...</p>
          </div>
        );
      }
      
      // Default loading state for other card types
      return (
        <div className="flex flex-col items-center justify-center h-32">
          <Loader2 className="animate-spin h-8 w-8 text-primary mb-2" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      );
    }

    // Show loading state for cards that haven't been loaded yet and don't have data (except QA)
    if (isExpanded && !data && cardType !== 'qa' && cardType !== undefined && !isLoading) {
      // Check if this card type should show a specific loading message
      if (cardType === 'calories') {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="animate-spin h-8 w-8 text-orange-500 mb-2" />
            <p className="text-muted-foreground">Analyzing nutrition...</p>
          </div>
        );
      }
      
      if (cardType === 'reddit') {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="animate-spin h-8 w-8 text-red-500 mb-2" />
            <p className="text-muted-foreground">Searching Reddit...</p>
          </div>
        );
      }
      
      if (cardType === 'ingredients') {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="animate-spin h-8 w-8 text-green-500 mb-2" />
            <p className="text-muted-foreground">Analyzing ingredients...</p>
          </div>
        );
      }
      
      // Default loading state for other card types
      return (
        <div className="flex flex-col items-center justify-center h-32">
          <Loader2 className="animate-spin h-8 w-8 text-primary mb-2" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      );
    }

    // Handle error state
    if (data && (data as any).error) {
      return (
        <div className="flex flex-col items-center justify-center h-32">
          <p className="text-muted-foreground">Failed to load data. Please try again.</p>
        </div>
      );
    }

    // Special UI for ingredients card
    if (cardType === 'ingredients' && data) {
      const ingredientsData = data as { ingredients_analysis: Array<{ name: string; safety_status: string; reason_with_source: string }> };
      
      if (!ingredientsData.ingredients_analysis || ingredientsData.ingredients_analysis.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-32">
            <p className="text-muted-foreground">No ingredient data available</p>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {ingredientsData.ingredients_analysis.map((ingredient, index) => (
            <div 
              key={`${index}-${updateKey}`} 
              className="flex items-center justify-between p-3 rounded-lg bg-secondary"
            >
              <div className="flex-1">
                <p className="font-medium text-sm text-foreground">{ingredient.name}</p>
                <p className={`text-xs mt-1 ${
                  ingredient.safety_status === 'Safe' ? 'text-green-600 dark:text-green-400' : 
                  ingredient.safety_status === 'Moderate' ? 'text-yellow-600 dark:text-yellow-400' : 
                  'text-red-600 dark:text-red-400'
                }`}>
                  {ingredient.reason_with_source}
                </p>
              </div>
              <div className="ml-2">
                {ingredient.safety_status === 'Safe' ? (
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-600 dark:text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Special UI for calories card
    if (cardType === 'calories' && data) {
      const compositionData = data as any;
      
      // Extract main nutrition values
      const calories = compositionData.calories || 0;
      const totalFat = compositionData.totalFat || 0;
      const totalProtein = compositionData.totalProtein || 0;
      
      // Extract detailed nutrition from compositionalDetails
      const compositionalDetails = compositionData.compositionalDetails || [];
      
      // Separate special items
      const addedSugarsItem = compositionalDetails.find((item: any) => 
        item.key && item.key.toLowerCase().includes('added sugar')
      );
      
      const sugarTypes = compositionalDetails.filter((item: any) => 
        item.key && item.key.toLowerCase().includes('sugar') && 
        !item.key.toLowerCase().includes('added') &&
        !item.key.toLowerCase().includes('total')
      );
      
      const vitamins = compositionalDetails.filter((item: any) => 
        item.key && (item.key.toLowerCase().includes('vitamin') || item.key.toLowerCase().includes('mineral'))
      );
      
      // Filter out special items from main details
      const mainDetails = compositionalDetails.filter((item: any) => 
        item.key && 
        !item.key.toLowerCase().includes('added sugar') &&
        !item.key.toLowerCase().includes('sugar') &&
        !item.key.toLowerCase().includes('vitamin') &&
        !item.key.toLowerCase().includes('mineral') &&
        item.key !== 'calories' &&
        item.key !== 'total fat' &&
        item.key !== 'total protein'
      );

      return (
        <div className="space-y-6">
          {/* Serving Size */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Serving Size:</span>
            <span className="text-sm font-bold text-foreground">
              {compositionData.netQuantity || 'N/A'} {compositionData.unitType || 'g'}
            </span>
          </div>
          
          {/* Main Nutrition Facts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-primary">{calories}</div>
              <div className="text-xs text-muted-foreground">Calories</div>
            </div>
            <div className="bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalFat}g</div>
              <div className="text-xs text-muted-foreground">Total Fat</div>
            </div>
            <div className="bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{totalProtein}g</div>
              <div className="text-xs text-muted-foreground">Protein</div>
            </div>
          </div>
          
          {/* Detailed Nutrition Values - List Format with Dividers */}
          {mainDetails.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-base text-foreground">Nutrition Facts</h4>
              <div className="divide-y divide-border">
                {mainDetails.map((item: any, index: number) => (
                  <div key={`${index}-${updateKey}`} className="py-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">{item.key}</span>
                      {item.value && item.value.split(' ').length <= 3 ? (
                        <span className="text-sm text-muted-foreground">{item.value}</span>
                      ) : null}
                    </div>
                    {item.value && item.value.split(' ').length > 3 ? (
                      <div className="text-sm text-muted-foreground mt-1">{item.value}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Added Sugars */}
          {addedSugarsItem && (
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-red-700 dark:text-red-400">{addedSugarsItem.key}</span>
                {addedSugarsItem.value && addedSugarsItem.value.split(' ').length <= 3 ? (
                  <span className="text-sm text-red-500 dark:text-red-400">{addedSugarsItem.value}</span>
                ) : null}
              </div>
              {addedSugarsItem.value && addedSugarsItem.value.split(' ').length > 3 ? (
                <div className="text-sm text-red-500 dark:text-red-400 mt-1">{addedSugarsItem.value}</div>
              ) : null}
            </div>
          )}
          
          {/* Sugar Types */}
          {sugarTypes.length > 0 && (
            <div className="pt-3 border-t border-border">
              <h4 className="font-medium text-base mb-2 text-foreground">Sugar Types</h4>
              <div className="space-y-2">
                {sugarTypes.map((item: any, index: number) => (
                  <div key={`${index}-${updateKey}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-foreground">{item.key}</span>
                      {item.value && item.value.split(' ').length <= 3 ? (
                        <span className="text-sm text-muted-foreground">{item.value}</span>
                      ) : null}
                    </div>
                    {item.value && item.value.split(' ').length > 3 ? (
                      <div className="text-sm text-muted-foreground mt-1">{item.value}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Vitamins & Minerals */}
          {vitamins.length > 0 && (
            <div className="pt-3 border-t border-border">
              <h4 className="font-medium text-base mb-2 text-foreground">Vitamins & Minerals</h4>
              <div className="space-y-2">
                {vitamins.map((item: any, index: number) => (
                  <div key={`${index}-${updateKey}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-foreground">{item.key}</span>
                      {item.value && item.value.split(' ').length <= 3 ? (
                        <span className="text-sm text-muted-foreground">{item.value}</span>
                      ) : null}
                    </div>
                    {item.value && item.value.split(' ').length > 3 ? (
                      <div className="text-sm text-muted-foreground mt-1">{item.value}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Special UI for reddit card
    if (cardType === 'reddit' && data) {
      const redditData = data as any;
      
      // Generate star ratings
      const renderStars = (rating: number) => {
        const stars = [];
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        
        for (let i = 0; i < 5; i++) {
          if (i < fullStars) {
            stars.push(
              <Star key={i} className="text-xs text-yellow-400 fill-current" />
            );
          } else if (i === fullStars && hasHalfStar) {
            stars.push(
              <div key={i} className="relative">
                <Star className="text-xs text-gray-300 dark:text-gray-600" />
                <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                  <Star className="text-xs text-yellow-400 fill-current" />
                </div>
              </div>
            );
          } else {
            stars.push(
              <Star key={i} className="text-xs text-gray-300 dark:text-gray-600" />
            );
          }
        }
        return stars;
      };

      return (
        <div className="space-y-4">
          {/* Pros/Cons Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Pros */}
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl">
              <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 mb-2">Pros</h4>
              <ul className="text-xs text-green-600 dark:text-green-300 space-y-1">
                {redditData.pros && redditData.pros.length > 0 ? (
                  redditData.pros.slice(0, 4).map((pro: string, index: number) => (
                    <li key={`${index}-${updateKey}`}>• {pro}</li>
                  ))
                ) : (
                  <li>No pros found</li>
                )}
              </ul>
            </div>
            
            {/* Cons */}
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
              <h4 className="font-semibold text-sm text-red-700 dark:text-red-400 mb-2">Cons</h4>
              <ul className="text-xs text-red-600 dark:text-red-300 space-y-1">
                {redditData.cons && redditData.cons.length > 0 ? (
                  redditData.cons.slice(0, 4).map((con: string, index: number) => (
                    <li key={`${index}-${updateKey}`}>• {con}</li>
                  ))
                ) : (
                  <li>No cons found</li>
                )}
              </ul>
            </div>
          </div>
          
          {/* Rating Summary */}
          <div className="bg-secondary p-3 rounded-xl">
            <div className="flex space-x-2 mb-2">
              {renderStars(redditData.averageRating || 0)}
            </div>
            <div className="text-xs font-medium text-foreground">
              {redditData.averageRating ? redditData.averageRating.toFixed(1) : 'N/A'}/5.0
            </div>
            <div className="text-xs text-muted-foreground">
              Based on community feedback
            </div>
          </div>
        </div>
      );
    }

    if (cardType === 'qa' && analysisId && productName && extractedText) {
      return (
        <div className="flex flex-col h-full">
          <ChatInterface 
            analysisId={analysisId} 
            productName={productName} 
            extractedText={extractedText} 
          />
        </div>
      );
    }

    return children;
  };

  // Special handling for card header based on card type
  const renderCardHeader = () => {
    if (cardType === 'qa') {
      return (
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"> {/* Changed from w-10 h-10 to w-11 h-11 */}
            <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      );
    }
    
    if (cardType === 'ingredients') {
      return (
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center"> {/* Changed from w-10 h-10 to w-11 h-11 */}
            <Leaf className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      );
    }
    
    if (cardType === 'calories' && Icon) {
      return (
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"> {/* Changed from w-10 h-10 to w-11 h-11 */}
            <Icon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      );
    }
    
    if (cardType === 'reddit' && Icon) {
      return (
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center"> {/* Changed from w-10 h-10 to w-11 h-11 */}
            <Icon className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-3">
        <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center"> {/* Changed from w-10 h-10 to w-11 h-11 */}
          {/* This is where the icon would go, but we're keeping it simple for now */}
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="border rounded-2xl overflow-hidden border-border shadow-sm bg-card transition-all duration-300 hover:shadow-md">
      <button 
        className={`w-full p-6 text-left transition-colors h-auto ${
          isExpanded ? 'bg-accent/50' : 'hover:bg-accent/50'
        }`}
        onClick={onExpand}
        data-testid={`button-toggle-${cardType}`}
      >
        <div className="flex items-center justify-between w-full">
          {renderCardHeader()}
          <ChevronDown 
            className={`h-5 w-5 transition-transform duration-200 text-foreground ${
              isExpanded ? 'rotate-180' : ''
            }`} 
          />
        </div>
      </button>
      
      {isExpanded && (
        <div key={contentKey} className="px-6 pb-6 animate-slide-up relative" data-testid={`content-${cardType}`}>
          {renderCardContent()}
          {/* Recall button positioned at bottom right corner */}
          {isExpanded && onRecall && cardType !== 'qa' && (
            <div className="absolute bottom-4 right-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full p-2 h-10 w-10 shadow-md hover:shadow-lg transition-shadow"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecall();
                }}
                disabled={isRecalling}
              >
                {isRecalling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { AnalysisCard };
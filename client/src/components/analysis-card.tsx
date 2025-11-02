import { useState } from "react";
import { ChevronDown, Leaf, Flame, Star, MessageCircle, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChatInterface } from "./chat-interface";
import type { CardType, IngredientsData, NutritionData, RedditData } from "@/types/analysis";

interface AnalysisCardProps {
  type: CardType;
  title: string;
  description: string;
  analysisId: string;
  isOpen: boolean;
  onToggle: () => void;
  data?: any;
  onDataLoaded: (type: CardType, data: any) => void;
}

const cardConfig = {
  ingredients: {
    icon: Leaf,
    bgColor: "bg-green-100 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
  },
  calories: {
    icon: Flame,
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  reddit: {
    icon: Star,
    bgColor: "bg-red-100 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
  },
  qa: {
    icon: MessageCircle,
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
};

export function AnalysisCard({ 
  type, 
  title, 
  description, 
  analysisId, 
  isOpen, 
  onToggle, 
  data, 
  onDataLoaded 
}: AnalysisCardProps) {
  const { toast } = useToast();
  const config = cardConfig[type];
  const Icon = config.icon;

  const fetchDataMutation = useMutation({
    mutationFn: async () => {
      let endpoint = "";
      switch (type) {
        case "ingredients":
          endpoint = `/api/analyze-ingredients/${analysisId}`;
          break;
        case "calories":
          endpoint = `/api/analyze-nutrition/${analysisId}`;
          break;
        case "reddit":
          endpoint = `/api/analyze-reddit/${analysisId}`;
          break;
        default:
          throw new Error("Invalid card type");
      }
      
      const response = await apiRequest("POST", endpoint);
      return response.json();
    },
    onSuccess: (result) => {
      onDataLoaded(type, result);
      toast({
        title: "Analysis Complete",
        description: `${title} data loaded successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: `Failed to load ${title.toLowerCase()}. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const handleToggle = () => {
    if (!isOpen && !data && type !== "qa") {
      fetchDataMutation.mutate();
    }
    onToggle();
  };

  const renderContent = () => {
    if (type === "qa") {
      return <ChatInterface analysisId={analysisId} />;
    }

    if (fetchDataMutation.isPending) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {type === "ingredients" && "Analyzing ingredients..."}
              {type === "calories" && "Analyzing nutrition..."}
              {type === "reddit" && "Searching Reddit..."}
            </span>
          </div>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <p>Click to load {title.toLowerCase()}</p>
        </div>
      );
    }

    switch (type) {
      case "ingredients":
        return <IngredientsContent data={data as IngredientsData} />;
      case "calories":
        return <NutritionContent data={data as NutritionData} />;
      case "reddit":
        return <RedditContent data={data as RedditData} />;
      default:
        return null;
    }
  };

  return (
    <div 
      className={`analysis-card bg-card rounded-2xl border border-border shadow-sm overflow-hidden transition-all duration-300 ${
        isOpen ? "scale-102" : ""
      }`}
      data-testid={`card-${type}`}
    >
      <Button
        variant="ghost"
        className="w-full p-6 text-left hover:bg-accent/50 transition-colors h-auto"
        onClick={handleToggle}
        data-testid={`button-toggle-${type}`}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 ${config.bgColor} rounded-xl flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
            </div>
            <div>
              <h3 className="font-semibold text-left">{title}</h3>
              <p className="text-sm text-muted-foreground text-left">{description}</p>
            </div>
          </div>
          <ChevronDown 
            className={`h-5 w-5 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`} 
          />
        </div>
      </Button>

      {isOpen && (
        <div className="px-6 pb-6 animate-slide-up" data-testid={`content-${type}`}>
          {renderContent()}
        </div>
      )}
    </div>
  );
}

function IngredientsContent({ data }: { data: IngredientsData }) {
  return (
    <div className="space-y-3">
      {data.ingredients?.map((ingredient, index) => (
        <div key={index} className="flex items-center justify-between p-3 bg-secondary rounded-xl">
          <div className="flex-1">
            <p className="font-medium text-sm">{ingredient.name}</p>
            <p className={`text-xs ${
              ingredient.safety === "Safe" 
                ? "text-green-600 dark:text-green-400" 
                : "text-yellow-600 dark:text-yellow-400"
            }`}>
              {ingredient.reason}
            </p>
          </div>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
            ingredient.safety === "Safe"
              ? "bg-green-100 dark:bg-green-900/30"
              : "bg-yellow-100 dark:bg-yellow-900/30"
          }`}>
            {ingredient.safety === "Safe" ? (
              <Check className="text-green-600 dark:text-green-400 text-xs" />
            ) : (
              <AlertTriangle className="text-yellow-600 dark:text-yellow-400 text-xs" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function NutritionContent({ data }: { data: NutritionData }) {
  return (
    <div className="space-y-4">
      {/* Main Nutrition Facts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-secondary p-4 rounded-xl text-center">
          <div className="text-2xl font-bold text-primary">{data.calories || "N/A"}</div>
          <div className="text-xs text-muted-foreground">Calories</div>
        </div>
        <div className="bg-secondary p-4 rounded-xl text-center">
          <div className="text-2xl font-bold text-orange-600">{data.totalSugars || "N/A"}</div>
          <div className="text-xs text-muted-foreground">Total Sugars</div>
        </div>
      </div>

      {/* Detailed Nutrition Values */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Fat</div>
          <div className="text-lg font-bold text-blue-900 dark:text-blue-100">{data.totalFat || "0"}g</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-purple-700 dark:text-purple-300">Sat. Fat</div>
          <div className="text-lg font-bold text-purple-900 dark:text-purple-100">{data.saturatedFat || "0"}g</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Sodium</div>
          <div className="text-lg font-bold text-yellow-900 dark:text-yellow-100">{data.sodium || "0"}mg</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-green-700 dark:text-green-300">Protein</div>
          <div className="text-lg font-bold text-green-900 dark:text-green-100">{data.totalProtein || "0"}g</div>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Carbs</div>
          <div className="text-lg font-bold text-indigo-900 dark:text-indigo-100">{data.totalCarbohydrate || "0"}g</div>
        </div>
        <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-pink-700 dark:text-pink-300">Fiber</div>
          <div className="text-lg font-bold text-pink-900 dark:text-pink-100">{data.totalFiber || "0"}g</div>
        </div>
      </div>

      {/* Added Sugars */}
      {data.addedSugar && data.addedSugar !== "0g" && (
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <div className="text-sm font-medium text-red-700 dark:text-red-300">Added Sugars</div>
          <div className="text-lg font-bold text-red-900 dark:text-red-100">{data.addedSugar}</div>
        </div>
      )}

      {/* Sugar Types */}
      {data.sugarTypes && data.sugarTypes.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Sugar Types</h4>
          <div className="space-y-2">
            {data.sugarTypes.map((sugar, index) => (
              <div key={index} className="flex justify-between text-sm bg-secondary p-2 rounded">
                <span>{sugar.type}</span>
                <span className="font-medium">{sugar.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vitamins */}
      {data.vitamins && data.vitamins.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Vitamins & Minerals</h4>
          <div className="space-y-2">
            {data.vitamins.map((vitamin, index) => (
              <div key={index} className="flex justify-between text-sm bg-secondary p-2 rounded">
                <span>{vitamin.type}</span>
                <span className="font-medium">{vitamin.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RedditContent({ data }: { data: RedditData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl">
          <h4 className="font-semibold text-green-700 dark:text-green-400 text-sm mb-2">Pros</h4>
          <ul className="text-xs text-green-600 dark:text-green-300 space-y-1">
            {data.pros?.map((pro, index) => (
              <li key={index}>• {pro}</li>
            ))}
          </ul>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
          <h4 className="font-semibold text-red-700 dark:text-red-400 text-sm mb-2">Cons</h4>
          <ul className="text-xs text-red-600 dark:text-red-300 space-y-1">
            {data.cons?.map((con, index) => (
              <li key={index}>• {con}</li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="bg-secondary p-3 rounded-xl">
        <div className="flex items-center space-x-2 mb-2">
          <div className="flex space-x-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={`text-xs ${
                  i < Math.floor(data.averageRating || 0)
                    ? "text-yellow-400 fill-current"
                    : i < (data.averageRating || 0)
                    ? "text-yellow-400 fill-current opacity-50"
                    : "text-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-medium">{data.averageRating}/5 overall</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Based on {data.totalMentions} Reddit mentions
        </p>
      </div>
    </div>
  );
}

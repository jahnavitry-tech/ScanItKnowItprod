import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Save, Share } from "lucide-react";
import { AnalysisCard } from "./analysis-card";
import type { ProductAnalysis, CardType, CardData } from "@/types/analysis";

interface AnalysisScreenProps {
  analysis: ProductAnalysis;
  onScanAnother: () => void;
}

export function AnalysisScreen({ analysis, onScanAnother }: AnalysisScreenProps) {
  const [openCard, setOpenCard] = useState<CardType | null>(null);
  const [cardData, setCardData] = useState<CardData>({});

  const handleCardToggle = (cardType: CardType) => {
    if (openCard === cardType) {
      setOpenCard(null);
    } else {
      setOpenCard(cardType);
    }
  };

  const handleDataLoaded = (type: CardType, data: any) => {
    setCardData(prev => ({ ...prev, [type]: data }));
  };

  const cards = [
    {
      type: "ingredients" as CardType,
      title: "What are the Ingredients?",
      description: "Analyze ingredient safety",
    },
    {
      type: "calories" as CardType,
      title: "How about calories?",
      description: "Nutritional breakdown",
    },
    {
      type: "reddit" as CardType,
      title: "Reddit reviews",
      description: "Community opinions",
    },
    {
      type: "qa" as CardType,
      title: "Q&A",
      description: "Ask anything about this product",
    },
  ];

  // Parse summary into bullet points
  const summaryPoints = analysis.summary
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.replace(/^[•\-\*]\s*/, ''));

  return (
    <div className="space-y-6 animate-fade-in" data-testid="analysis-screen">
      {/* Product Header */}
      <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-border flex items-center justify-center">
            <Camera className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-product-name">
              {analysis.productName}
            </h1>
            <p className="text-muted-foreground text-sm">Product Analysis</p>
          </div>
          <Button variant="ghost" size="sm" data-testid="button-share">
            <Share className="h-5 w-5" />
          </Button>
        </div>
        
        {/* AI Summary */}
        <div className="space-y-3">
          <h3 className="font-semibold text-primary">Product Summary</h3>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-1" data-testid="text-product-summary">
            {summaryPoints.map((point, index) => (
              <p key={index}>• {point}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Analysis Cards */}
      <div className="space-y-4">
        {cards.map((card) => (
          <AnalysisCard
            key={card.type}
            type={card.type}
            title={card.title}
            description={card.description}
            analysisId={analysis.analysisId}
            isOpen={openCard === card.type}
            onToggle={() => handleCardToggle(card.type)}
            data={cardData[card.type]}
            onDataLoaded={handleDataLoaded}
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
        <Button variant="outline" size="icon" data-testid="button-save">
          <Save className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

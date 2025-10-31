import { useEffect, useState } from "react";
import { Brain, Check } from "lucide-react";

export function ProcessingScreen() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStep(1), 1000);
    const timer2 = setTimeout(() => setCurrentStep(2), 2000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const steps = [
    { text: "Product identified", completed: currentStep >= 1 },
    { text: "Extracting text information", completed: currentStep >= 2 },
    { text: "Preparing analysis", completed: false },
  ];

  return (
    <div className="space-y-8 text-center animate-fade-in" data-testid="processing-screen">
      <div className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center animate-pulse">
          <Brain className="text-primary-foreground text-2xl" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold" data-testid="text-processing-title">
            Analyzing Product
          </h2>
          <p className="text-muted-foreground" data-testid="text-processing-description">
            AI is identifying the product and extracting text...
          </p>
        </div>
      </div>
      
      {/* Progress Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`flex items-center space-x-3 p-3 rounded-lg border ${
              step.completed 
                ? "bg-card border-border" 
                : currentStep === index 
                ? "bg-card border-border" 
                : "bg-muted"
            }`}
            data-testid={`step-${index}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              step.completed 
                ? "bg-primary" 
                : currentStep === index 
                ? "bg-primary animate-pulse" 
                : "border-2 border-muted-foreground/30"
            }`}>
              {step.completed ? (
                <Check className="text-primary-foreground text-xs" />
              ) : currentStep === index ? (
                <div className="w-2 h-2 bg-primary-foreground rounded-full" />
              ) : null}
            </div>
            <span className={`text-sm ${step.completed || currentStep === index ? "" : "text-muted-foreground"}`}>
              {step.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

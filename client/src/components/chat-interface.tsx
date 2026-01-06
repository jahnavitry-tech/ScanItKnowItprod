import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChatMessage } from "@/types/analysis";

interface ChatInterfaceProps {
  analysisId: string;
  productName: string;
  extractedText: any;
  productSummary?: string;
}

export function ChatInterface({ analysisId, productName, extractedText, productSummary }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: chatHistory = [] } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${analysisId}`],
    enabled: !!analysisId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Check if the message is relevant to the product
      const isRelevant = checkQuestionRelevance(message, productName, extractedText, productSummary);
      
      if (!isRelevant) {
        // Return a template response for irrelevant questions
        return {
          message,
          response: `I'm designed to help you understand this specific product: ${productName}. For questions about this product, I can help with ingredients, nutrition facts, safety information, or brand details. What would you like to know about this product?`,
          timestamp: new Date()
        };
      }
      
      // For relevant questions, call the API
      const response = await apiRequest("POST", `/api/chat/${analysisId}`, { message });
      return response.json();
    },
    onSuccess: (newMessage) => {
      // Add the new message to the query cache manually to avoid refetch delay
      queryClient.setQueryData([`/api/chat/${analysisId}`], (oldData: ChatMessage[] | undefined) => {
        if (Array.isArray(oldData)) {
          return [...oldData, newMessage];
        }
        return [newMessage];
      });
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, sendMessageMutation.data]);

  const handleSend = () => {
    if (!inputValue.trim() || sendMessageMutation.isPending) return;
    
    sendMessageMutation.mutate(inputValue);
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Combine chat history with the latest sent message if it exists
  const allMessages: ChatMessage[] = Array.isArray(chatHistory) ? [...chatHistory] : [];
  if (sendMessageMutation.data && !allMessages.some((msg) => msg.message === sendMessageMutation.data.message)) {
    allMessages.push(sendMessageMutation.data);
  }

  // Function to check if a question is relevant to the product
  const checkQuestionRelevance = (
    question: string, 
    productName: string, 
    extractedText: any, 
    productSummary?: string
  ): boolean => {
    const questionLower = question.toLowerCase();
    
    // List of product-related keywords to check against
    const productKeywords = [
      productName.toLowerCase(),
      extractedText?.brand?.toLowerCase() || '',
      ...(extractedText?.ingredients ? extractedText.ingredients.toLowerCase().split(/[\s,;]+/) : []),
      ...(productSummary ? productSummary.toLowerCase().split(/[\s,;]+/) : [])
    ].filter(Boolean);
    
    // Common product-related terms
    const productRelatedTerms = [
      'ingredient', 'ingredients', 'nutrition', 'calories', 'brand', 'product',
      'safety', 'allergen', 'allergy', 'diet', 'food', 'cosmetic', 'skincare',
      'nutrition', 'nutritional', 'composition', 'formula', 'content', 'contents',
      'ingredient', 'ingredients', 'component', 'components', 'recipe', 'formula'
    ];
    
    // Check if question contains product-specific terms
    for (const keyword of productKeywords) {
      if (questionLower.includes(keyword.toLowerCase())) {
        return true;
      }
    }
    
    // Check if question contains general product-related terms
    for (const term of productRelatedTerms) {
      if (questionLower.includes(term)) {
        return true;
      }
    }
    
    // Check for common question patterns related to products
    const questionPatterns = [
      /what is/, /tell me about/, /how (safe|good|healthy)/, /is (this|it)/,
      /contains/, /made of/, /consist of/, /ingredients/, /nutritious/, /calories/, /brand/
    ];
    
    for (const pattern of questionPatterns) {
      if (pattern.test(questionLower)) {
        // If the question pattern is followed by product-related context
        if (productKeywords.some(keyword => questionLower.includes(keyword))) {
          return true;
        }
      }
    }
    
    // If none of the above conditions match, consider it irrelevant
    return false;
  };

  return (
    <div className="chat-interface space-y-4" data-testid="chat-interface">
      {/* Chat Messages */}
      <div className="chat-messages space-y-3 max-h-64 overflow-y-auto" data-testid="chat-messages">
        {/* Welcome Message */}
        <div className="bg-secondary p-3 rounded-xl">
          <div className="flex items-start space-x-2">
            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="text-primary-foreground text-xs" />
            </div>
            <div className="flex-1">
              <p className="text-sm">Hi! I'm here to answer any questions about this product. What would you like to know?</p>
            </div>
          </div>
        </div>

        {/* Chat History */}
        {allMessages.map((msg, index) => (
          <div key={index} className="space-y-2">
            {/* User Message */}
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground p-3 rounded-xl max-w-xs">
                <div className="flex items-start space-x-2">
                  <User className="text-primary-foreground text-xs mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{msg.message}</p>
                </div>
              </div>
            </div>
            
            {/* AI Response */}
            <div className="bg-secondary p-3 rounded-xl">
              <div className="flex items-start space-x-2">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="text-primary-foreground text-xs" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">{msg.response}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading Message - Show only the pending message */}
        {sendMessageMutation.isPending && (
          <>
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground p-3 rounded-xl max-w-xs">
                <div className="flex items-start space-x-2">
                  <User className="text-primary-foreground text-xs mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{inputValue}</p>
                </div>
              </div>
            </div>
            <div className="bg-secondary p-3 rounded-xl">
              <div className="flex items-start space-x-2">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="text-primary-foreground text-xs" />
                </div>
                <div className="flex-1">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat Input */}
      <div className="flex space-x-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about ingredients, nutrition, etc..."
          className="flex-1"
          disabled={sendMessageMutation.isPending}
          data-testid="input-chat"
        />
        <Button
          onClick={handleSend}
          disabled={!inputValue.trim() || sendMessageMutation.isPending}
          data-testid="button-send-message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
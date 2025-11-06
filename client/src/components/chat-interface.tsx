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
}

export function ChatInterface({ analysisId }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: chatHistory = [] } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${analysisId}`],
    enabled: !!analysisId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
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
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChatMessage } from "@/types/analysis";

interface ChatInterfaceProps {
  analysisId: string;
}

const SUGGESTIONS = [
  'Safe for children?',
  'Any allergens?',
  'How to use?',
  'Is this healthy?',
];

export function ChatInterface({ analysisId }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  const { data: chatHistory = [] } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${analysisId}`],
    enabled: !!analysisId,
    // History only changes when the user sends a message (handled by setQueryData
    // in the mutation).  Infinity stale + 1 h gc means re-opening the card is
    // instant and memory is reclaimed after an hour of inactivity.
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", `/api/chat/${analysisId}`, { message });
      return response.json();
    },
    onSuccess: (newMessage) => {
      queryClient.setQueryData([`/api/chat/${analysisId}`], (oldData: ChatMessage[] | undefined) => {
        if (Array.isArray(oldData)) return [...oldData, newMessage];
        return [newMessage];
      });
    },
  });

  // TASK 9: auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, sendMessageMutation.isPending]);

  const handleSend = (text?: string) => {
    const msg = (text ?? inputValue).trim();
    if (!msg || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(msg);
    setInputValue("");
    // TASK 9: blur on mobile to dismiss keyboard
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const allMessages: ChatMessage[] = Array.isArray(chatHistory) ? [...chatHistory] : [];
  if (sendMessageMutation.data && !allMessages.some((msg) => msg.message === sendMessageMutation.data.message)) {
    allMessages.push(sendMessageMutation.data);
  }

  const isTyping = sendMessageMutation.isPending;
  const isEmpty  = allMessages.length === 0 && !isTyping;

  return (
    <div className="space-y-3" data-testid="chat-interface">
      {/* TASK 9: max-height scrollable messages */}
      <div className="chat-msgs space-y-2" data-testid="chat-messages">
        {/* Welcome */}
        <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-xl">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                 style={{ background: '#2d3a8c' }}>
              <Bot className="text-white w-3 h-3" />
            </div>
            <p className="text-[12px] text-gray-700 dark:text-gray-300"
               style={{ fontFamily: 'Inter, sans-serif' }}>
              Hi! Ask me anything about this product.
            </p>
          </div>
        </div>

        {/* TASK 9: Empty state suggestion chips */}
        {isEmpty && (
          <div className="chat-empty">
            <p className="chat-empty-hint">Try asking:</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="chat-sug"
                        onClick={() => { setInputValue(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat History */}
        {allMessages.map((msg, index) => (
          <div key={index} className="space-y-1.5">
            <div className="flex justify-end">
              <div className="p-2.5 rounded-xl rounded-br-sm max-w-[85%]"
                   style={{ background: '#2d3a8c', color: '#fff' }}>
                <p className="text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}>{msg.message}</p>
              </div>
            </div>
            <div className="bg-gray-100 dark:bg-white/8 p-2.5 rounded-xl rounded-bl-sm">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                     style={{ background: '#2d3a8c' }}>
                  <Bot className="text-white w-3 h-3" />
                </div>
                <p className="text-[12px] text-gray-900 dark:text-white flex-1"
                   style={{ fontFamily: 'Inter, sans-serif' }}>{msg.response}</p>
              </div>
            </div>
          </div>
        ))}

        {/* TASK 9: Typing indicator dots */}
        {isTyping && (
          <div className="bg-gray-100 dark:bg-white/8 rounded-xl rounded-bl-sm inline-flex">
            <div className="flex items-center gap-2 p-2.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{ background: '#2d3a8c' }}>
                <Bot className="text-white w-3 h-3" />
              </div>
              <div className="typing-bubble">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input — TASK 9 */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about ingredients, safety, usage…"
          className="flex-1 text-[12px]"
          disabled={isTyping}
          data-testid="input-chat"
          aria-label="Chat message input"
        />
        <Button
          onClick={() => handleSend()}
          disabled={!inputValue.trim() || isTyping}
          style={isTyping ? { opacity: 0.5, cursor: 'default' } : {}}
          data-testid="button-send-message"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
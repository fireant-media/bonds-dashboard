import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles, Minimize2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../LanguageContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIChatBot() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('chatBotWelcome') }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const chat = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
            {
                role: 'user',
                parts: [
                    { text: "Here is our chat history:\n" + messages.map(m => `${m.role}: ${m.content}`).join('\n') + `\n\nUser: ${userMessage}` }
                ]
            }
        ],
        config: {
          systemInstruction: "You are Sentinel AI Support, an expert in bond markets and financial data. Answer user questions about bond markets accurately and professionally. Use information from the user request history if available. If you don't know the answer, say you don't know and advise consulting a professional advisor. Keep answers concise."
        }
      });

      const response = await chat;
      const aiContent = response.text || t('chatBotError');
      
      setMessages(prev => [...prev, { role: 'assistant', content: aiContent }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: t('chatBotError') }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200]">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30, x: 20 }}
            className="mb-4 w-[350px] md:w-[400px] h-[500px] bg-bg-surface border border-border-base rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 bg-bg-base/50 border-b border-border-base flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-text-highlight/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-text-highlight" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-base">{t('chatBotTitle')}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-bg-base/80 rounded-xl transition-colors text-text-muted"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-2 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center ${
                      message.role === 'user' ? 'bg-text-highlight text-white' : 'bg-bg-base text-text-highlight'
                    }`}>
                      {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm ${
                      message.role === 'user' 
                        ? 'bg-text-highlight text-white rounded-tr-none' 
                        : 'bg-bg-base text-text-base rounded-tl-none border border-border-base'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%] items-end">
                    <div className="h-8 w-8 rounded-full bg-bg-base text-text-highlight flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-bg-base border border-border-base p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="h-1.5 w-1.5 bg-text-muted rounded-full animate-bounce" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-bg-base/30 border-t border-border-base">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={t('chatBotPlaceholder')}
                  className="w-full bg-bg-surface border border-border-base rounded-2xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-text-highlight/20 transition-all text-text-base"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-text-highlight text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center justify-center h-14 w-14 bg-text-highlight text-white rounded-2xl shadow-xl shadow-text-highlight/20 relative group"
          >
            <div className="absolute inset-0 bg-text-highlight rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
            <Sparkles className="h-6 w-6 relative z-10" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

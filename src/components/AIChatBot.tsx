import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles, Minimize2 } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_HISTORY_KEY = 'sentinel_chat_history';

export default function AIChatBot() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize messages from localStorage or default
  useEffect(() => {
    const saved = localStorage.getItem(CHAT_HISTORY_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        setMessages([{ role: 'assistant', content: t('chatBotWelcome') }]);
      }
    } else {
      setMessages([{ role: 'assistant', content: t('chatBotWelcome') }]);
    }
  }, [t]);

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-20)));
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    
    setInput('');
    setMessages(newMessages);
    setIsTyping(true);

    try {
      const apiKey = (process.env.GEMINI_API_KEY || (window as any).GEMINI_API_KEY);
      
      if (!apiKey) {
        throw new Error('AI API Key not found');
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Build history for Gemini
      const validHistory = newMessages
        .filter((m, i) => i > 0 || m.role === 'user')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // Start streaming
      const result = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: validHistory,
        config: {
          systemInstruction: "Bạn là Chuyên gia phân tích trái phiếu cấp cao tại Công ty Chứng khoán Sentinel. \n\nPHONG CÁCH PHẢN HỒI:\n1. CỰC KỲ SÚC TÍCH: Chỉ trả lời đúng trọng tâm câu hỏi. Không chào hỏi rườm rà, không giải thích khái niệm trừ khi được hỏi.\n2. DỰA TRÊN DỮ LIỆU: Tập trung vào các con số, xu hướng và rủi ro thực tế.\n3. TRÌNH BÀY: Luôn sử dụng Markdown. Dùng BẢNG (table) cho dữ liệu so sánh, DANH SÁCH (list) cho các luận điểm. In đậm các số liệu quan trọng.\n4. THÔNG MINH: Kết nối các thông tin thị trường để đưa ra nhận định sắc bén.\n\nHẠN CHẾ: Không trả lời quá 3 đoạn văn. Hạn chế khoảng trống giữa các dòng."
        }
      });

      // Prepare a placeholder for the assistant reply
      setIsTyping(false); // Remove loader as we start streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let fullText = "";
      for await (const chunk of result) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          setMessages(prev => {
            const history = [...prev];
            if (history.length > 0) {
              history[history.length - 1] = { role: 'assistant', content: fullText };
            }
            return history;
          });
        }
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => {
        const history = [...prev];
        // If there's an empty or partial message, replace it
        if (history.length > 0 && history[history.length - 1].content === '') {
           history[history.length - 1] = { role: 'assistant', content: t('chatBotError') };
           return history;
        }
        return [...prev, { role: 'assistant', content: t('chatBotError') }];
      });
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
            className="mb-4 w-80 md:w-96 h-[32rem] bg-bg-surface border border-border-base rounded-3xl shadow-2xl overflow-hidden flex flex-col"
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
                    <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Online</span>
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
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-2 max-w-[90%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`h-7 w-7 rounded-lg shrink-0 flex items-center justify-center shadow-sm ${
                      message.role === 'user' ? 'bg-text-highlight text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {message.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`p-2 px-3 rounded-2xl text-sm prose prose-sm dark:prose-invert max-w-full leading-snug ${
                      message.role === 'user' 
                        ? 'bg-text-highlight text-white rounded-tr-none border-none prose-p:my-0' 
                        : 'bg-bg-base text-text-base rounded-tl-none border border-border-base prose-p:my-0'
                    }`}>
                      {message.role === 'user' ? (
                        message.content
                      ) : message.content === '' ? (
                        <div className="flex items-center gap-1.5 py-1">
                          <div className="h-1 w-1 bg-text-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <div className="h-1 w-1 bg-text-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <div className="h-1 w-1 bg-text-muted rounded-full animate-bounce" />
                        </div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%] items-end">
                    <div className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="bg-bg-base border border-border-base p-2 px-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="h-1 w-1 bg-text-muted rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="h-1 w-1 bg-text-muted rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="h-1 w-1 bg-text-muted rounded-full animate-bounce" />
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
